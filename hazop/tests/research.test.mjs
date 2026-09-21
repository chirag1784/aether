// Tests for the research, doability and diagram packages.
//
// The rules these assert are the ones that make the features trustworthy: a
// remembered figure never wears a citation, an uncosted action is never
// assumed cheap, and a scenario never moves on the matrix because somebody
// hoped a recommendation would work.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  EVIDENCE_CLASSES,
  attestedStatus,
  evidenceRank,
  chemicalQueryPlan,
  companyQueryPlan,
  rankGaps,
  isGradeDependent,
  COMPANY_FIELD_GATES,
  CHEMICAL_AUTHORITIES,
  COMPANY_AUTHORITIES,
} from '../packages/research/sources.js';
import {
  parseFinding,
  assessFinding,
  reconcile,
  toPropertyRecord,
  toCompanyFieldRecord,
  propertyExpectation,
  researchSummary,
} from '../packages/research/resolve.js';
import {
  doability,
  doabilityBand,
  benefit,
  rankRecommendations,
  selectDoable,
  migrationPlan,
  EFFORT_FIELDS,
  EFFORT_TOTAL_WEIGHT,
  basisCredit,
  scenarioRef,
  recRef,
} from '../packages/calculations/doability.js';
import { DEFAULT_MATRIX, requiresAction, tryRiskFromLS } from '../packages/calculations/risk.js';
import {
  matrixLayout,
  cellAt,
  plotMigration,
  bandSlopeLayout,
  bowTieLayout,
  nodeFlowLayout,
  stackedBandBar,
} from '../packages/diagrams/geometry.js';
import { propertyMeta } from '../packages/chemical/properties.js';

// ---------------------------------------------------------------------------
// The source registry
// ---------------------------------------------------------------------------

test('research: model recall can never be attested as web-sourced', () => {
  assert.equal(attestedStatus('MODEL_RECALL'), 'AI_INFERRED');
  for (const c of EVIDENCE_CLASSES) {
    if (c.key === 'MODEL_RECALL') continue;
    assert.equal(c.attest, 'WEB_SOURCED', c.key + ' should attest as WEB_SOURCED');
  }
});

test('research: a regulator outranks an aggregator', () => {
  assert.ok(evidenceRank('PRIMARY_REGULATOR') < evidenceRank('AGGREGATOR'));
  assert.ok(evidenceRank('SUPPLIER_SDS') < evidenceRank('COMMERCIAL_CATALOGUE'));
  assert.equal(evidenceRank('NOT_A_CLASS'), 99);
});

test('research: every authority declares a real evidence class', () => {
  const keys = new Set(EVIDENCE_CLASSES.map((c) => c.key));
  for (const a of CHEMICAL_AUTHORITIES.concat(COMPANY_AUTHORITIES)) {
    assert.ok(keys.has(a.evidenceClass), a.key + ' has an unknown evidence class');
  }
});

test('research: a chemical with no name and no CAS cannot be looked up', () => {
  const plan = chemicalQueryPlan({ chemical: {}, property: propertyMeta('flashPoint') });
  assert.equal(plan.ok, false);
  assert.equal(plan.reason, 'NO_IDENTIFIER');
});

test('research: a dust constant routes to the dust database and warns about grade', () => {
  const plan = chemicalQueryPlan({
    chemical: { id: 'c1', canonicalName: 'Calcium stearate', name: 'Calcium stearate', cas: '1592-23-0' },
    property: propertyMeta('kst'),
  });
  assert.equal(plan.ok, true);
  assert.ok(plan.query.includes('1592-23-0'));
  assert.equal(plan.gradeDependent, true);
  assert.ok(plan.gradeWarning && plan.gradeWarning.includes('grade'));
  assert.equal(plan.routes[0].key, 'GESTIS_DUST');
});

test('research: a company field routes only to registers that prove it', () => {
  const plan = companyQueryPlan({ company: { legalName: 'Example Chemicals Pvt Ltd', state: 'GJ', district: 'Bharuch' }, field: 'consentToOperate' });
  assert.equal(plan.ok, true);
  assert.ok(plan.routes.length > 0);
  for (const r of plan.routes) assert.ok(r.proves.includes('consentToOperate'));
  assert.ok(plan.query.includes('Bharuch'));
});

test('research: a company field no register publishes says so rather than guessing', () => {
  const plan = companyQueryPlan({ company: { legalName: 'Example Chemicals Pvt Ltd' }, field: 'shiftPattern' });
  assert.equal(plan.ok, true);
  assert.equal(plan.routes.length, 0);
  assert.ok(plan.caution && plan.caution.includes('company itself'));
});

test('research: gaps that block an engine outrank gaps that fill a table', () => {
  const ranked = rankGaps([
    { label: 'report only', reasons: ['REPORT_FIELD'] },
    { label: 'blocks an alert', reasons: ['BLOCKS_ALERT', 'CRITICAL_PROPERTY'] },
    { label: 'gates a law', reasons: ['GATES_LEGAL'] },
  ]);
  assert.equal(ranked[0].label, 'blocks an alert');
  assert.equal(ranked[1].label, 'gates a law');
  assert.equal(ranked[2].label, 'report only');
});

test('research: the gating company fields are the ones an obligation depends on', () => {
  assert.ok(COMPANY_FIELD_GATES.workerCount);
  assert.ok(COMPANY_FIELD_GATES.consentedQuantities);
  assert.equal(COMPANY_FIELD_GATES.tradeName, undefined);
});

test('research: grade-dependent properties are flagged', () => {
  assert.equal(isGradeDependent('kst'), true);
  assert.equal(isGradeDependent('particleSize'), true);
  assert.equal(isGradeDependent('molecularWeight'), false);
});

// ---------------------------------------------------------------------------
// Parsing and assessing a finding
// ---------------------------------------------------------------------------

test('resolve: a plain value keeps its unit and the text as written', () => {
  const p = parseFinding('205 °C');
  assert.equal(p.kind, 'NUMBER');
  assert.equal(p.value, 205);
  assert.equal(p.text, '205 °C');
});

test('resolve: a range is read as a range, not as its first number', () => {
  const p = parseFinding('67–72 °C');
  assert.equal(p.kind, 'RANGE');
  assert.equal(p.low, 67);
  assert.equal(p.high, 72);
});

test('resolve: a measurement condition is captured', () => {
  const p = parseFinding('0.0013 bar at 20 °C');
  assert.equal(p.kind, 'NUMBER');
  assert.ok(p.condition && p.condition.includes('20'));
});

test('resolve: a qualifier is kept rather than dropped', () => {
  const p = parseFinding('> 200 degC');
  assert.equal(p.kind, 'NUMBER');
  assert.equal(p.qualifier, '>');
});

test('resolve: text with no number stays text', () => {
  const p = parseFinding('Practically insoluble in water');
  assert.equal(p.kind, 'TEXT');
});

test('resolve: a web-sourced value without a citation is refused', () => {
  const a = assessFinding({
    finding: { rawValue: '205 degC', evidenceClass: 'AUTHORITATIVE_DATABASE' },
    property: propertyExpectation(propertyMeta('flashPoint')),
  });
  assert.equal(a.ok, false);
  assert.equal(a.rejection, 'NO_CITATION');
});

test('resolve: a citation makes the same value recordable, as sourced not verified', () => {
  const a = assessFinding({
    finding: { rawValue: '205 degC', evidenceClass: 'AUTHORITATIVE_DATABASE', url: 'https://example.org/sds.pdf', retrievedAt: '2026-09-21T00:00:00.000Z' },
    property: propertyExpectation(propertyMeta('flashPoint')),
  });
  assert.equal(a.ok, true);
  assert.equal(a.status, 'WEB_SOURCED');
  assert.notEqual(a.status, 'VERIFIED');
  assert.equal(a.value, 205);
});

test('resolve: model recall needs no citation but is recorded as inferred, with a warning', () => {
  const a = assessFinding({
    finding: { rawValue: 'about 200 degC', evidenceClass: 'MODEL_RECALL' },
    property: propertyExpectation(propertyMeta('flashPoint')),
  });
  assert.equal(a.ok, true);
  assert.equal(a.status, 'AI_INFERRED');
  assert.ok(a.warnings.some((w) => w.includes('memory')));
});

test('resolve: a numeric property with no unit is refused', () => {
  const a = assessFinding({
    finding: { rawValue: '205', evidenceClass: 'SUPPLIER_SDS', url: 'https://example.org/sds.pdf' },
    property: propertyExpectation(propertyMeta('flashPoint')),
  });
  assert.equal(a.ok, false);
  assert.equal(a.rejection, 'NO_UNIT');
});

test('resolve: a unit of the wrong dimension is refused and says which', () => {
  const a = assessFinding({
    finding: { rawValue: '205 bar', evidenceClass: 'SUPPLIER_SDS', url: 'https://example.org/sds.pdf' },
    property: propertyExpectation(propertyMeta('flashPoint')),
  });
  assert.equal(a.ok, false);
  assert.equal(a.rejection, 'UNIT_MISMATCH');
  assert.ok(a.message.includes('temperature'));
  assert.ok(a.message.includes('pressure'));
});

test('resolve: an onset temperature range records the low end as the value', () => {
  const a = assessFinding({
    finding: { rawValue: '188–205 degC', evidenceClass: 'SUPPLIER_SDS', url: 'https://example.org/sds.pdf' },
    property: propertyExpectation(propertyMeta('flashPoint')),
  });
  assert.equal(a.ok, true);
  assert.equal(a.kind, 'RANGE');
  assert.equal(a.conservative, 188, 'the plant reaches the low end first');
});

test('resolve: a grade-dependent property with no grade recorded warns', () => {
  const a = assessFinding({
    finding: { rawValue: '180 bar·m/s', evidenceClass: 'AUTHORITATIVE_DATABASE', url: 'https://example.org/dust' },
    property: propertyExpectation(propertyMeta('kst')),
    chemical: { canonicalName: 'Calcium stearate' },
  });
  assert.equal(a.ok, true);
  assert.ok(a.warnings.some((w) => w.includes('grade')));
});

test('resolve: two sources agreeing report the stronger status, not a conflict', () => {
  const mk = (cls) => assessFinding({
    finding: { rawValue: '205 degC', evidenceClass: cls, url: 'https://example.org/' + cls },
    property: propertyExpectation(propertyMeta('flashPoint')),
  });
  const r = reconcile([mk('SUPPLIER_SDS'), mk('AGGREGATOR')]);
  assert.notEqual(r.status, 'CONFLICT');
  assert.equal(r.reason, 'SOURCES_AGREE');
});

test('resolve: equal-status sources that disagree resolve by evidence class, keeping the loser', () => {
  const a = assessFinding({
    finding: { rawValue: '205 degC', evidenceClass: 'SUPPLIER_SDS', url: 'https://example.org/a' },
    property: propertyExpectation(propertyMeta('flashPoint')),
  });
  const b = assessFinding({
    finding: { rawValue: '196 degC', evidenceClass: 'AGGREGATOR', url: 'https://example.org/b' },
    property: propertyExpectation(propertyMeta('flashPoint')),
  });
  const r = reconcile([a, b]);
  assert.equal(r.reason, 'RESOLVED_BY_EVIDENCE_CLASS');
  assert.equal(r.chosen.evidenceClass, 'SUPPLIER_SDS');
  assert.equal(r.conflicting.length, 1, 'the value not chosen is retained');
});

test('resolve: two sources of equal standing that disagree stay a conflict', () => {
  const mk = (v) => assessFinding({
    finding: { rawValue: v, evidenceClass: 'SUPPLIER_SDS', url: 'https://example.org/' + v },
    property: propertyExpectation(propertyMeta('flashPoint')),
  });
  const r = reconcile([mk('205 degC'), mk('196 degC')]);
  assert.equal(r.status, 'CONFLICT');
  assert.equal(r.reason, 'EQUAL_EVIDENCE_DISAGREEMENT');
});

test('resolve: the record a finding becomes is never verified', () => {
  const a = assessFinding({
    finding: { rawValue: '205 degC', evidenceClass: 'SUPPLIER_SDS', url: 'https://example.org/sds', retrievedAt: '2026-09-21T00:00:00.000Z' },
    property: propertyExpectation(propertyMeta('flashPoint')),
  });
  const rec = toPropertyRecord({ assessed: a, property: propertyMeta('flashPoint'), projectId: 'p1', chemicalId: 'c1' });
  assert.equal(rec.status, 'WEB_SOURCED');
  assert.equal(rec.verifiedBy, null);
  assert.equal(rec.verifiedAt, null);
  assert.equal(rec.sourceUrl, 'https://example.org/sds');
  assert.equal(rec.valueAsWritten, '205 degC');

  const co = toCompanyFieldRecord({ assessed: a, projectId: 'p1', field: 'workerCount' });
  assert.equal(co.verifiedBy, null);
});

test('resolve: the research summary never counts anything as verified', () => {
  const s = researchSummary([
    { outcome: 'APPLIED', status: 'WEB_SOURCED', evidenceClass: 'SUPPLIER_SDS' },
    { outcome: 'APPLIED', status: 'AI_INFERRED', evidenceClass: 'MODEL_RECALL' },
    { outcome: 'REJECTED' },
  ]);
  assert.equal(s.verifiedCount, 0);
  assert.equal(s.webSourced, 1);
  assert.equal(s.inferred, 1);
  assert.equal(s.rejected, 1);
  assert.ok(s.caution.includes('never as verified'));
});

// ---------------------------------------------------------------------------
// Doability
// ---------------------------------------------------------------------------

const FULL_EFFORT = {
  costBand: 'A',
  leadTime: 'DAYS',
  outage: 'NONE',
  engineering: 'NONE',
  competency: 'IN_HOUSE',
  approval: 'NONE',
  spaceAccess: 'YES',
};

test('doability: the effort weights sum to 100', () => {
  assert.equal(EFFORT_TOTAL_WEIGHT, 100);
});

test('doability: an undeclared effort field makes the score unavailable, not optimistic', () => {
  const r = doability({ effort: { costBand: 'A' } });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'MISSING_INPUT');
  assert.equal(r.missing.length, EFFORT_FIELDS.length - 1);
  assert.equal(r.score, undefined, 'no score is produced from a partial declaration');
});

test('doability: everything easy scores 100 and lands in Do now', () => {
  const r = doability({ effort: FULL_EFFORT });
  assert.equal(r.ok, true);
  assert.equal(r.score, 100);
  assert.equal(r.band, 'DO_NOW');
});

test('doability: a capital project scores low and says what makes it hard', () => {
  const r = doability({
    effort: { costBand: 'D', leadTime: 'OVER_A_YEAR', outage: 'EXTENDED_SHUTDOWN', engineering: 'REDESIGN', competency: 'SPECIALIST', approval: 'REGULATOR', spaceAccess: 'NO' },
  });
  assert.equal(r.ok, true);
  assert.equal(r.band, 'PROJECT');
  assert.ok(r.score < 30);
  assert.ok(r.drivers.some((d) => d.direction === 'harder' && d.key === 'costBand'));
});

test('doability: partial mode scores what is declared and reports the coverage', () => {
  const r = doability({ effort: { costBand: 'A', leadTime: 'DAYS' } }, { partial: true });
  assert.equal(r.ok, true);
  assert.equal(r.partial, true);
  assert.equal(r.coverage, 42, 'cost 24 + lead time 18 of 100');
  assert.equal(r.score, 100, 'scored over the weight declared, not over 100');
});

test('doability: an invalid option counts as undeclared rather than being coerced', () => {
  const r = doability({ effort: Object.assign({}, FULL_EFFORT, { costBand: 'Z' }) }, { partial: true });
  assert.ok(r.missing.some((m) => m.key === 'costBand' && m.invalid === 'Z'));
});

test('doability: the bands are ordered and every score lands in one', () => {
  for (const n of [0, 39, 40, 59, 60, 79, 80, 100]) {
    const b = doabilityBand(n);
    assert.ok(b && b.key, n + ' fell outside every band');
  }
  assert.equal(doabilityBand(80).key, 'DO_NOW');
  assert.equal(doabilityBand(79).key, 'THIS_QUARTER');
  assert.equal(doabilityBand(0).key, 'PROJECT');
});

// ---------------------------------------------------------------------------
// Benefit and migration
// ---------------------------------------------------------------------------

const SCENARIOS = [
  // Rated, with a residual rating: this one can move.
  { id: 's1', rowNumber: 1, nodeId: 'n1', deviation: 'HIGH TEMPERATURE', initialLikelihood: 4, initialSeverity: 4, residualLikelihood: 2, residualSeverity: 4 },
  // Rated, no residual: it must not move.
  { id: 's2', rowNumber: 2, nodeId: 'n1', deviation: 'NO FLOW', initialLikelihood: 3, initialSeverity: 4, residualLikelihood: null, residualSeverity: null },
  // Not rated at all: absent from both pictures.
  { id: 's3', rowNumber: 3, nodeId: 'n1', deviation: 'REVERSE FLOW', initialLikelihood: null, initialSeverity: null },
];

const RECS = [
  { id: 'r1', recId: 'R-001', scenarioId: 's1', text: 'Fit a high-temperature trip on PSM-01 at 120 degC', controlLevel: 'INSTRUMENTED_FUNCTION', effort: FULL_EFFORT },
  { id: 'r2', recId: 'R-002', scenarioId: 's2', text: 'Write a procedure', controlLevel: 'ADMINISTRATIVE', effort: { costBand: 'A', leadTime: 'DAYS', outage: 'NONE', engineering: 'NONE', competency: 'IN_HOUSE', approval: 'NONE', spaceAccess: 'YES' } },
  { id: 'r3', recId: 'R-003', scenarioId: 's1', text: 'Replace the vessel', controlLevel: 'ENGINEERING' },
];

test('doability: benefit is measured only where a residual rating exists', () => {
  const b = benefit({ recommendation: RECS[0], matrix: DEFAULT_MATRIX, scenarios: SCENARIOS });
  assert.equal(b.measured, true);
  assert.equal(b.riskDelta, 8, '16 down to 8');

  const b2 = benefit({ recommendation: RECS[1], matrix: DEFAULT_MATRIX, scenarios: SCENARIOS });
  assert.equal(b2.measured, false);
  assert.equal(b2.riskDelta, 0);
  assert.equal(b2.unrated.length, 1);
  assert.ok(b2.note.includes('not quantified'));
});

test('doability: benefit counts a scenario leaving an action-required band', () => {
  const b = benefit({ recommendation: RECS[0], matrix: DEFAULT_MATRIX, scenarios: SCENARIOS });
  assert.ok(requiresAction(DEFAULT_MATRIX, 'SUBSTANTIAL'));
  assert.equal(b.intolerableRemoved, 1);
});

test('doability: ranking leaves an uncosted action out rather than assuming it easy', () => {
  const r = rankRecommendations({ recommendations: RECS, matrix: DEFAULT_MATRIX, scenarios: SCENARIOS });
  assert.equal(r.scored.length, 2);
  assert.equal(r.undecidable.length, 1);
  assert.equal(r.undecidable[0].recommendation.id, 'r3');
});

test('doability: closed and rejected actions are not ranked', () => {
  const r = rankRecommendations({
    recommendations: RECS.concat([{ id: 'r4', recId: 'R-004', status: 'CLOSED', effort: FULL_EFFORT }]),
    matrix: DEFAULT_MATRIX,
    scenarios: SCENARIOS,
  });
  assert.ok(!r.scored.some((x) => x.recommendation.id === 'r4'));
});

test('doability: the value ordering puts measured benefit ahead of unmeasured', () => {
  const r = rankRecommendations({ recommendations: RECS, matrix: DEFAULT_MATRIX, scenarios: SCENARIOS });
  assert.equal(r.byValue[0].recommendation.id, 'r1');
});

test('doability: TOP_N selects exactly n and defers the rest', () => {
  const ranking = rankRecommendations({ recommendations: RECS, matrix: DEFAULT_MATRIX, scenarios: SCENARIOS });
  const sel = selectDoable({ ranking, mode: 'TOP_N', n: 1, matrix: DEFAULT_MATRIX, scenarios: SCENARIOS });
  assert.equal(sel.selected.length, 1);
  assert.equal(sel.deferred.length, 1);
});

test('doability: an explicit selection takes exactly what was ticked', () => {
  const ranking = rankRecommendations({ recommendations: RECS, matrix: DEFAULT_MATRIX, scenarios: SCENARIOS });
  const sel = selectDoable({ ranking, mode: 'EXPLICIT', ids: ['r2'], matrix: DEFAULT_MATRIX, scenarios: SCENARIOS });
  assert.equal(sel.selected.length, 1);
  assert.equal(sel.selected[0].recommendation.id, 'r2');
  assert.equal(sel.creditable.length, 0, 'r2 has no residual rating, so it credits nothing');
  assert.ok(sel.note.includes('no residual rating'));
});

test('migration: a scenario with no residual rating does not move, and says why', () => {
  const ranking = rankRecommendations({ recommendations: RECS, matrix: DEFAULT_MATRIX, scenarios: SCENARIOS });
  const sel = selectDoable({ ranking, mode: 'ALL_PRACTICABLE', matrix: DEFAULT_MATRIX, scenarios: SCENARIOS });
  const plan = migrationPlan({ matrix: DEFAULT_MATRIX, scenarios: SCENARIOS, selection: sel });

  const s1 = plan.points.find((p) => p.scenarioId === 's1');
  const s2 = plan.points.find((p) => p.scenarioId === 's2');
  assert.ok(s1.after, 's1 has a residual rating and a selected action');
  assert.equal(s1.moved, true);
  assert.deepEqual(s1.creditedTo, ['R-001']);

  assert.equal(s2.after, null);
  assert.equal(s2.moved, false);
  assert.ok(s2.reasonNotMoved.includes('no residual rating'));
});

test('migration: an unrated scenario is absent from both pictures, not assumed trivial', () => {
  const plan = migrationPlan({
    matrix: DEFAULT_MATRIX,
    scenarios: SCENARIOS,
    ranking: rankRecommendations({ recommendations: RECS, matrix: DEFAULT_MATRIX, scenarios: SCENARIOS }),
    mode: 'ALL_PRACTICABLE',
  });
  assert.ok(!plan.points.some((p) => p.scenarioId === 's3'));
  assert.equal(plan.unrated.length, 1);
  assert.ok(plan.caution.includes('no initial rating'));
});

test('migration: the band counts carry a stationary scenario on both sides', () => {
  const plan = migrationPlan({
    matrix: DEFAULT_MATRIX,
    scenarios: SCENARIOS,
    ranking: rankRecommendations({ recommendations: RECS, matrix: DEFAULT_MATRIX, scenarios: SCENARIOS }),
    mode: 'ALL_PRACTICABLE',
  });
  const before = Object.values(plan.bandCounts.before).reduce((a, b) => a + b, 0);
  const after = Object.values(plan.bandCounts.after).reduce((a, b) => a + b, 0);
  assert.equal(before, 2);
  assert.equal(after, 2, 'nothing disappears from the after picture');
  assert.equal(plan.intolerable.before, 2);
  assert.equal(plan.intolerable.after, 1);
});

test('migration: a selection nothing qualifies for moves nothing', () => {
  const ranking = rankRecommendations({ recommendations: RECS, matrix: DEFAULT_MATRIX, scenarios: SCENARIOS });
  const sel = selectDoable({ ranking, mode: 'EXPLICIT', ids: [], matrix: DEFAULT_MATRIX, scenarios: SCENARIOS });
  const plan = migrationPlan({ matrix: DEFAULT_MATRIX, scenarios: SCENARIOS, selection: sel });
  assert.equal(plan.moved, 0);
  assert.deepEqual(plan.bandCounts.before, plan.bandCounts.after);
  for (const p of plan.points) assert.ok(p.reasonNotMoved.includes('No selected recommendation'));
});

test('doability: the display refs are what the register shows', () => {
  assert.equal(recRef(RECS[0]), 'R-001');
  assert.equal(scenarioRef(SCENARIOS[0]), '#1');
  assert.equal(scenarioRef({ id: 'x' }), 'x');
});

test('doability: only a measure of the recorded basis kind may claim the reduction', () => {
  const scenario = { id: 's1', residualBasisKind: 'INSTRUMENTED_FUNCTION' };
  assert.equal(basisCredit({ controlLevel: 'ENGINEERING' }, scenario).ok, true);
  assert.equal(basisCredit({ controlLevel: 'ELIMINATE' }, scenario).ok, true);
  const admin = basisCredit({ controlLevel: 'ADMINISTRATIVE' }, scenario);
  assert.equal(admin.ok, false);
  assert.equal(admin.reason, 'BASIS_NOT_DELIVERED_BY_THIS_CONTROL');
  assert.ok(admin.detail.includes('administrative'));
  const unclassified = basisCredit({}, scenario);
  assert.equal(unclassified.ok, false, 'unclassified is not a synonym for adequate');
  assert.equal(unclassified.reason, 'CONTROL_LEVEL_NOT_RECORDED');
});

test('doability: an administrative basis is satisfied by anything, including no level', () => {
  const scenario = { id: 's1', residualBasisKind: 'ADMINISTRATIVE' };
  assert.equal(basisCredit({ controlLevel: 'PPE' }, scenario).ok, true);
  assert.equal(basisCredit({}, scenario).ok, true);
});

test('doability: with no basis recorded the rule does not bite', () => {
  assert.equal(basisCredit({ controlLevel: 'PPE' }, { id: 's1' }).ok, true);
});

test('doability: a procedure cannot be credited with an engineered reduction', () => {
  const scenarios = [
    { id: 's1', rowNumber: 1, initialLikelihood: 4, initialSeverity: 4, residualLikelihood: 1, residualSeverity: 4, residualBasisKind: 'ENGINEERING_CONTROL', residualBasisText: 'Grounding continuity monitored on a six-monthly interval.' },
  ];
  const trip = { id: 'r1', recId: 'R-001', scenarioId: 's1', controlLevel: 'ENGINEERING', text: 'Fit the monitoring', effort: FULL_EFFORT };
  const proc = { id: 'r2', recId: 'R-002', scenarioId: 's1', controlLevel: 'ADMINISTRATIVE', text: 'Write it down', effort: FULL_EFFORT };

  const good = benefit({ recommendation: trip, matrix: DEFAULT_MATRIX, scenarios });
  assert.equal(good.measured, true);
  assert.equal(good.riskDelta, 12);

  const bad = benefit({ recommendation: proc, matrix: DEFAULT_MATRIX, scenarios });
  assert.equal(bad.measured, false);
  assert.equal(bad.riskDelta, 0);
  assert.equal(bad.unrated[0].reason, 'BASIS_NOT_DELIVERED_BY_THIS_CONTROL');
});

test('migration: a basis mismatch is the reason the row is shown as not moving', () => {
  const scenarios = [
    { id: 's1', rowNumber: 1, initialLikelihood: 4, initialSeverity: 4, residualLikelihood: 1, residualSeverity: 4, residualBasisKind: 'INSTRUMENTED_FUNCTION', residualBasisText: 'Independent high-temperature trip.' },
  ];
  const recs = [{ id: 'r2', recId: 'R-002', scenarioId: 's1', controlLevel: 'ADMINISTRATIVE', text: 'Calibrate the gauge', effort: FULL_EFFORT }];
  const ranking = rankRecommendations({ recommendations: recs, matrix: DEFAULT_MATRIX, scenarios });
  const sel = selectDoable({ ranking, mode: 'ALL_PRACTICABLE', matrix: DEFAULT_MATRIX, scenarios });
  const plan = migrationPlan({ matrix: DEFAULT_MATRIX, scenarios, selection: sel });
  assert.equal(plan.moved, 0);
  assert.ok(plan.points[0].reasonNotMoved.includes('does not deliver'));
});

// ---------------------------------------------------------------------------
// Diagram geometry
// ---------------------------------------------------------------------------

const bandOf = (m, l, s) => {
  const r = tryRiskFromLS(m, l, s);
  return r && r.ok ? r.bandKey : null;
};

test('geometry: the matrix lays out one cell per combination, severity ascending up', () => {
  const layout = matrixLayout({ matrix: DEFAULT_MATRIX, bandOf, box: { width: 500, height: 400 } });
  assert.equal(layout.ok, true);
  assert.equal(layout.cells.length, 25);
  const top = cellAt(layout, 1, 5);
  const bottom = cellAt(layout, 1, 1);
  assert.ok(top.y < bottom.y, 'severity 5 is above severity 1');
  const left = cellAt(layout, 1, 1);
  const right = cellAt(layout, 5, 1);
  assert.ok(left.x < right.x, 'likelihood 5 is right of likelihood 1');
});

test('geometry: every cell carries the band the risk engine gives it', () => {
  const layout = matrixLayout({ matrix: DEFAULT_MATRIX, bandOf, box: { width: 500, height: 400 } });
  const c = cellAt(layout, 5, 5);
  assert.equal(c.band, 'INTOLERABLE');
  assert.equal(cellAt(layout, 1, 1).band, 'TRIVIAL');
});

test('geometry: a box too small to draw says so rather than producing nonsense', () => {
  const layout = matrixLayout({ matrix: DEFAULT_MATRIX, bandOf, box: { width: 40, height: 40 } });
  assert.equal(layout.ok, false);
  assert.equal(layout.reason, 'BOX_TOO_SMALL');
});

test('geometry: two scenarios in one cell are separated, deterministically', () => {
  const layout = matrixLayout({ matrix: DEFAULT_MATRIX, bandOf, box: { width: 500, height: 400 } });
  const points = [
    { scenarioId: 'a', ref: '#1', before: { likelihood: 3, severity: 3, band: 'MODERATE', score: 9 }, after: null, moved: false, creditedTo: [] },
    { scenarioId: 'b', ref: '#2', before: { likelihood: 3, severity: 3, band: 'MODERATE', score: 9 }, after: null, moved: false, creditedTo: [] },
  ];
  const a = plotMigration({ layout, points });
  const b = plotMigration({ layout, points });
  const marks = a.marks.filter((m) => m.phase === 'before');
  assert.equal(marks.length, 2);
  assert.ok(marks[0].x !== marks[1].x || marks[0].y !== marks[1].y, 'the two marks do not coincide');
  assert.deepEqual(
    a.marks.map((m) => [m.x, m.y]),
    b.marks.map((m) => [m.x, m.y]),
    'the same input lays out the same way every time'
  );
});

test('geometry: an arrow is drawn only for a scenario that moved', () => {
  const layout = matrixLayout({ matrix: DEFAULT_MATRIX, bandOf, box: { width: 500, height: 400 } });
  const points = [
    { scenarioId: 'a', ref: '#1', before: { likelihood: 4, severity: 4, band: 'SUBSTANTIAL', score: 16 }, after: { likelihood: 2, severity: 4, band: 'MODERATE', score: 8 }, moved: true, creditedTo: ['R-001'] },
    { scenarioId: 'b', ref: '#2', before: { likelihood: 3, severity: 4, band: 'MODERATE', score: 12 }, after: null, moved: false, creditedTo: [] },
  ];
  const p = plotMigration({ layout, points });
  assert.equal(p.arrows.length, 1);
  assert.equal(p.arrows[0].scenarioId, 'a');
  assert.deepEqual(p.arrows[0].creditedTo, ['R-001']);
});

test('geometry: a rating off the matrix scale is reported, not clamped', () => {
  const layout = matrixLayout({ matrix: DEFAULT_MATRIX, bandOf, box: { width: 500, height: 400 } });
  const p = plotMigration({
    layout,
    points: [{ scenarioId: 'a', ref: '#9', before: { likelihood: 9, severity: 9, band: null, score: 81 }, after: null, moved: false, creditedTo: [] }],
  });
  assert.equal(p.marks.length, 0);
  assert.equal(p.skipped.length, 1);
  assert.equal(p.skipped[0].ref, '#9');
});

test('geometry: the slope chart puts the worst band at the top and reports the delta', () => {
  const layout = bandSlopeLayout({
    matrix: DEFAULT_MATRIX,
    counts: { before: { INTOLERABLE: 1, SUBSTANTIAL: 3, MODERATE: 2 }, after: { INTOLERABLE: 0, SUBSTANTIAL: 1, MODERATE: 5 } },
    box: { width: 400, height: 260 },
  });
  assert.equal(layout.ok, true);
  assert.equal(layout.rows[0].band, 'INTOLERABLE');
  assert.equal(layout.rows[0].delta, -1);
  assert.ok(layout.rows[0].y < layout.rows[layout.rows.length - 1].y);
});

test('geometry: the bow-tie reports an empty barrier column instead of hiding it', () => {
  const layout = bowTieLayout({
    causes: [{ id: 'c1', text: 'Thermostat fails high' }],
    consequences: [{ id: 'q1', text: 'Decomposition and pressure rise' }],
    preventive: [],
    mitigating: [{ id: 'm1', text: 'Relief valve' }],
    topEvent: 'Loss of temperature control',
    box: { width: 900, height: 400 },
  });
  assert.equal(layout.ok, true);
  assert.equal(layout.gaps.preventive, true);
  assert.equal(layout.gaps.mitigating, false);
  assert.equal(layout.edges.length, 2, 'one edge in, one edge out');
  assert.ok(layout.event.cx > layout.causes[0].cx);
  assert.ok(layout.consequences[0].cx > layout.event.cx);
});

test('geometry: the node flow keeps the step order and reports when it overflows', () => {
  const steps = Array.from({ length: 12 }, (_, i) => ({ id: 's' + i, label: 'Step ' + i, scenarioCount: i }));
  const layout = nodeFlowLayout({ steps, box: { width: 600, height: 130 } });
  assert.equal(layout.ok, true);
  assert.equal(layout.nodes.length, 12);
  assert.equal(layout.links.length, 11);
  for (let i = 1; i < layout.nodes.length; i += 1) assert.ok(layout.nodes[i].x > layout.nodes[i - 1].x);
  assert.equal(layout.overflow, true);
});

test('geometry: an empty node flow says so', () => {
  assert.equal(nodeFlowLayout({ steps: [] }).ok, false);
});

test('geometry: the band strip is empty when nothing is rated', () => {
  const bar = stackedBandBar({ matrix: DEFAULT_MATRIX, counts: {}, width: 300 });
  assert.equal(bar.total, 0);
  assert.equal(bar.segments.length, 0);
});

test('geometry: the band strip segments sum to the width', () => {
  const bar = stackedBandBar({ matrix: DEFAULT_MATRIX, counts: { TRIVIAL: 1, MODERATE: 3 }, width: 300 });
  const total = bar.segments.reduce((n, s) => n + s.width, 0);
  assert.ok(Math.abs(total - 300) < 0.001);
});
