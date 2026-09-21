// tests/deterministic.test.mjs
// The mandatory deterministic tests from the build prompt §13.
// Run: node --test hazop/tests/

import test from 'node:test';
import assert from 'node:assert/strict';

import { riskFromLS, validateResidual, validateMatrix, tolerability, matrixGrid, DEFAULT_MATRIX, LOOKUP_4x4_EXAMPLE, bandsAtOrAbove } from '../packages/calculations/risk.js';
import { toKg, toLitres, toMassKg, toCelsius, toBar, comparePressure, unitDimension } from '../packages/calculations/units.js';
import { expiryStatus, nextDue, daysBetween, addMonths, addDays, toUtcDay } from '../packages/calculations/dates.js';
import { deduplicateRecommendations, isTechnicallyEquivalent, assessRecommendationQuality } from '../packages/calculations/dedup.js';
import { dataCompleteness, criticalCompleteness } from '../packages/calculations/completeness.js';
import { sourcePrecedence, legalStatusTransition, computeComplianceStatus, canOverwriteLegalSource, canCloseRecommendation, canAdvance, SCENARIO_REVIEW } from '../packages/domain/status.js';
import { generateDeviations, deriveNodeFacts, PARAMETERS, GUIDEWORDS } from '../packages/domain/guidewords.js';
import { causeFamilyCoverage, consequenceCreditsSafeguard, classifyCause, classifyConsequence } from '../packages/domain/causes.js';
import { validateCas, resolveChemical, sdsCompleteness, identityBlocksThreshold } from '../packages/chemical/properties.js';
import { evaluateThreshold, evaluateInventory, validateThresholdEntry } from '../packages/legal/thresholds.js';
import { resolveJurisdiction, evaluatePredicate, evaluateObligation, runApplicability } from '../packages/legal/applicability.js';
import { LEGAL_THRESHOLD_SETS, LEGAL_INSTRUMENTS, standardIsMandatory, instrumentById } from '../packages/legal/library.js';
import { runQualityGate, canSetReportStatus } from '../packages/reports/quality-gate.js';

// ---------------------------------------------------------------------------
// 1. 5x5 risk calculation
// ---------------------------------------------------------------------------

test('5x5 risk: score and band for every reachable cell', () => {
  assert.equal(riskFromLS(DEFAULT_MATRIX, 1, 1).score, 1);
  assert.equal(riskFromLS(DEFAULT_MATRIX, 1, 1).bandKey, 'TRIVIAL');
  assert.equal(riskFromLS(DEFAULT_MATRIX, 1, 2).bandKey, 'TRIVIAL');
  assert.equal(riskFromLS(DEFAULT_MATRIX, 1, 3).bandKey, 'TOLERABLE');
  assert.equal(riskFromLS(DEFAULT_MATRIX, 2, 2).bandKey, 'TOLERABLE');
  assert.equal(riskFromLS(DEFAULT_MATRIX, 1, 5).score, 5);
  assert.equal(riskFromLS(DEFAULT_MATRIX, 1, 5).bandKey, 'MODERATE');
  assert.equal(riskFromLS(DEFAULT_MATRIX, 3, 3).bandKey, 'MODERATE');
  assert.equal(riskFromLS(DEFAULT_MATRIX, 2, 5).score, 10);
  assert.equal(riskFromLS(DEFAULT_MATRIX, 2, 5).bandKey, 'SUBSTANTIAL');
  assert.equal(riskFromLS(DEFAULT_MATRIX, 4, 4).bandKey, 'SUBSTANTIAL');
  assert.equal(riskFromLS(DEFAULT_MATRIX, 4, 5).score, 20);
  assert.equal(riskFromLS(DEFAULT_MATRIX, 4, 5).bandKey, 'INTOLERABLE');
  assert.equal(riskFromLS(DEFAULT_MATRIX, 5, 5).score, 25);
  assert.equal(riskFromLS(DEFAULT_MATRIX, 5, 5).bandKey, 'INTOLERABLE');
});

test('5x5 risk: records the matrix id and version that produced the score', () => {
  const r = riskFromLS(DEFAULT_MATRIX, 3, 4);
  assert.equal(r.matrixId, 'IEC-5x5-v1');
  assert.equal(r.matrixVersion, 1);
  assert.equal(r.basis, 'L3 x S4 = 12');
});

test('risk: a missing rating is never defaulted to 1', () => {
  const r = riskFromLS(DEFAULT_MATRIX, null, 4);
  assert.equal(r.ok, false);
  assert.equal(r.score, null);
  assert.equal(r.bandKey, null);
  assert.equal(r.reason, 'MISSING_INPUT');
  assert.deepEqual(r.missing, ['likelihood']);

  const both = riskFromLS(DEFAULT_MATRIX, '', '');
  assert.deepEqual(both.missing, ['likelihood', 'severity']);
});

test('risk: an off-scale rating throws rather than clamping', () => {
  assert.throws(() => riskFromLS(DEFAULT_MATRIX, 6, 3), RangeError);
  assert.throws(() => riskFromLS(DEFAULT_MATRIX, 3, 0), RangeError);
});

test('risk: every integer score 1..25 falls in exactly one band', () => {
  const v = validateMatrix(DEFAULT_MATRIX);
  assert.equal(v.ok, true, v.errors.join('; '));
});

test('risk: tolerability honours the project ALARP setting', () => {
  assert.equal(tolerability(DEFAULT_MATRIX, 'MODERATE').action, 'ALARP_REVIEW');
  const noAlarp = Object.assign({}, DEFAULT_MATRIX, { alarpEnabled: false });
  assert.equal(tolerability(noAlarp, 'MODERATE').action, 'ACTION_REQUIRED');
});

test('risk: matrix grid renders every cell', () => {
  const grid = matrixGrid(DEFAULT_MATRIX);
  assert.equal(grid.length, 5);
  assert.equal(grid[0].cells.length, 5);
  // top row is severity 5
  assert.equal(grid[0].severity.value, 5);
  assert.equal(grid[0].cells[4].result.score, 25);
});

// ---------------------------------------------------------------------------
// 2. Custom matrix
// ---------------------------------------------------------------------------

test('custom matrix: a non-multiplicative lookup matrix is honoured', () => {
  const r = riskFromLS(LOOKUP_4x4_EXAMPLE, 1, 4);
  assert.equal(r.ok, true);
  assert.equal(r.score, null, 'a lookup matrix has no product score');
  assert.equal(r.bandKey, 'HIGH', 'severity 4 is HIGH even at the lowest likelihood');
  assert.equal(r.basis, 'lookup cell L1 / S4');
  assert.equal(riskFromLS(LOOKUP_4x4_EXAMPLE, 4, 4).bandKey, 'EXTREME');
  assert.equal(riskFromLS(LOOKUP_4x4_EXAMPLE, 1, 1).bandKey, 'LOW');
});

test('custom matrix: validation catches a band gap and an overlap', () => {
  const gap = { id: 'G', version: 1, combine: 'product', likelihoodScale: [{ value: 1 }, { value: 2 }], severityScale: [{ value: 1 }, { value: 2 }], bands: [{ min: 1, max: 2, key: 'A' }] };
  const vg = validateMatrix(gap);
  assert.equal(vg.ok, false);
  assert.ok(vg.errors.some((e) => /No band covers score 3/.test(e)));

  const overlap = { id: 'O', version: 1, combine: 'product', likelihoodScale: [{ value: 1 }], severityScale: [{ value: 1 }], bands: [{ min: 1, max: 1, key: 'A' }, { min: 1, max: 1, key: 'B' }] };
  assert.ok(validateMatrix(overlap).errors.some((e) => /falls in 2 bands/.test(e)));
});

test('custom matrix: a lookup cell naming an unknown band is rejected', () => {
  const bad = Object.assign({}, LOOKUP_4x4_EXAMPLE, { cells: Object.assign({}, LOOKUP_4x4_EXAMPLE.cells, { 1: { 1: 'NOPE', 2: 'LOW', 3: 'LOW', 4: 'LOW' } }) });
  assert.ok(validateMatrix(bad).errors.some((e) => /unknown band "NOPE"/.test(e)));
  assert.throws(() => riskFromLS(bad, 1, 1), RangeError);
});

test('risk magnitude comparison works across both matrix kinds', () => {
  assert.deepEqual(bandsAtOrAbove(DEFAULT_MATRIX, 'SUBSTANTIAL'), ['SUBSTANTIAL', 'INTOLERABLE']);
  assert.deepEqual(bandsAtOrAbove(LOOKUP_4x4_EXAMPLE, 'HIGH'), ['HIGH', 'EXTREME']);
});

// ---------------------------------------------------------------------------
// 3. Residual risk basis
// ---------------------------------------------------------------------------

test('residual risk: a reduction with no basis is rejected', () => {
  const v = validateResidual({ matrix: DEFAULT_MATRIX, initial: { likelihood: 4, severity: 4 }, residual: { likelihood: 2, severity: 4 } });
  assert.equal(v.ok, false);
  assert.equal(v.reason, 'RESIDUAL_BASIS_KIND_REQUIRED');
});

test('residual risk: a recommendation existing is not a basis', () => {
  const v = validateResidual({
    matrix: DEFAULT_MATRIX,
    initial: { likelihood: 4, severity: 4 },
    residual: { likelihood: 2, severity: 4 },
    recommendationIds: ['R-01'],
    basis: { kind: 'ENGINEERING_CONTROL', text: 'short' },
  });
  assert.equal(v.ok, false);
  assert.equal(v.reason, 'RESIDUAL_BASIS_TEXT_REQUIRED');
});

test('residual risk: a justified engineering reduction is accepted', () => {
  const v = validateResidual({
    matrix: DEFAULT_MATRIX,
    initial: { likelihood: 4, severity: 4 },
    residual: { likelihood: 2, severity: 4 },
    basis: { kind: 'ENGINEERING_CONTROL', text: 'High-temperature trip on TT-201 closes the thermic-fluid valve independently of the control loop.' },
  });
  assert.equal(v.ok, true);
  assert.equal(v.reason, 'REDUCTION_JUSTIFIED');
});

test('residual risk: an administrative basis cannot reduce severity', () => {
  const v = validateResidual({
    matrix: DEFAULT_MATRIX,
    initial: { likelihood: 4, severity: 4 },
    residual: { likelihood: 4, severity: 2 },
    basis: { kind: 'ADMINISTRATIVE', text: 'SOP revised and operators retrained on the charging sequence.' },
  });
  assert.equal(v.ok, false);
  assert.equal(v.reason, 'ADMINISTRATIVE_BASIS_CANNOT_REDUCE_SEVERITY');
});

test('residual risk: cannot be rated above the initial risk', () => {
  const v = validateResidual({ matrix: DEFAULT_MATRIX, initial: { likelihood: 2, severity: 2 }, residual: { likelihood: 4, severity: 4 }, basis: { kind: 'ENGINEERING_CONTROL', text: 'x'.repeat(30) } });
  assert.equal(v.ok, false);
  assert.equal(v.reason, 'RESIDUAL_ABOVE_INITIAL');
});

// ---------------------------------------------------------------------------
// 4. Unit conversion
// ---------------------------------------------------------------------------

test('unit conversion: mass to kg with a recorded trail', () => {
  const t = toKg(2.5, 'MT');
  assert.equal(t.ok, true);
  assert.equal(t.value, 2500);
  assert.equal(t.unit, 'kg');
  assert.equal(t.steps.length, 1);
  assert.equal(t.steps[0].rule, '1 mt = 1000 kg');

  assert.equal(toKg(450, 'kg').value, 450);
  assert.equal(toKg(72, 'KG').value, 72);
  assert.equal(toKg(1000, 'g').value, 1);
  assert.ok(Math.abs(toKg(100, 'lb').value - 45.359237) < 1e-9);
  assert.equal(toKg(5, 'q').value, 500);
});

test('unit conversion: "ton" is read as metric tonne and says so', () => {
  const t = toKg(1, 'ton');
  assert.equal(t.value, 1000);
  assert.ok(t.notes.some((n) => /metric tonne/.test(n)));
});

test('unit conversion: volume to litres, including kL and m3', () => {
  assert.equal(toLitres(2.5, 'KL').value, 2500);
  assert.equal(toLitres(1, 'm3').value, 1000);
  assert.equal(toLitres(1, 'M³').value, 1000);
  assert.equal(toLitres(500, 'ml').value, 0.5);
});

test('unit conversion: volume to mass REQUIRES a density — no default is assumed', () => {
  const noDensity = toMassKg({ qty: 2.5, unit: 'kL' });
  assert.equal(noDensity.ok, false);
  assert.equal(noDensity.reason, 'DENSITY_REQUIRED_FOR_VOLUME_TO_MASS');
  assert.ok(/No default density/.test(noDensity.detail));

  const withDensity = toMassKg({ qty: 2.5, unit: 'kL', density: 0.79, densityUnit: 'kg/L', densityStatus: 'DOCUMENT_EXTRACTED' });
  assert.equal(withDensity.ok, true);
  assert.equal(withDensity.value, 1975);
  assert.equal(withDensity.steps.length, 2, 'volume step and density step are both recorded');
  assert.ok(/density 0.79/.test(withDensity.steps[1].rule));
});

test('unit conversion: an AI_INFERRED density cannot support a conversion', () => {
  const r = toMassKg({ qty: 1, unit: 'kL', density: 1.0, densityUnit: 'kg/L', densityStatus: 'AI_INFERRED' });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'DENSITY_STATUS_NOT_USABLE');
});

test('unit conversion: temperature', () => {
  assert.equal(toCelsius(90, 'C').value, 90);
  assert.equal(toCelsius(363.15, 'K').value.toFixed(2), '90.00');
  assert.equal(toCelsius(194, 'F').value.toFixed(1), '90.0');
  assert.equal(toCelsius(0, 'degF').value.toFixed(4), '-17.7778');
});

test('unit conversion: pressure keeps its gauge/absolute basis and refuses unsafe comparison', () => {
  const g = toBar(5, 'barg');
  const a = toBar(5, 'bara');
  assert.equal(g.basis, 'GAUGE');
  assert.equal(a.basis, 'ABSOLUTE');
  const cmp = comparePressure(g, a);
  assert.equal(cmp.comparable, false);
  assert.equal(cmp.reason, 'PRESSURE_BASIS_MISMATCH');

  const unknown = toBar(5, 'bar');
  assert.equal(unknown.basis, 'UNKNOWN');
  assert.equal(comparePressure(unknown, g).comparable, false);

  assert.ok(Math.abs(toBar(1, 'kg/cm2').value - 0.980665) < 1e-9);
  assert.equal(comparePressure(toBar(6, 'barg'), toBar(5, 'barg')).delta, 1);
});

test('unit dimension detection', () => {
  assert.equal(unitDimension('kg'), 'mass');
  assert.equal(unitDimension('KL'), 'volume');
  assert.equal(unitDimension('degC'), 'temperature');
  assert.equal(unitDimension('barg'), 'pressure');
  assert.equal(unitDimension('furlong'), null);
});

// ---------------------------------------------------------------------------
// 5. Chemical inventory threshold comparison
// ---------------------------------------------------------------------------

const VERIFIED_ENTRY = {
  id: 'e1',
  chemicalName: 'Test Substance A',
  cas: '64-19-7',
  value: 1000,
  unit: 'kg',
  basis: 'Quantity present at site',
  locator: 'Schedule X, entry 12 (figure entered by the user from the official text)',
  status: 'VERIFIED',
  sourceRefs: [{ kind: 'GAZETTE', url: 'https://example.invalid/official', retrievedAt: '2026-09-01' }],
};

const RESOLVED = { matchKind: 'EXACT_CAS', casValid: true };

test('threshold: a crossing is computed deterministically and shows its arithmetic', () => {
  const r = evaluateThreshold({
    chemical: { id: 'c1', canonicalName: 'Test Substance A', cas: '64-19-7', quantity: 1200, quantityUnit: 'kg', quantityStatus: 'DOCUMENT_EXTRACTED', identityResolution: RESOLVED },
    thresholdEntry: VERIFIED_ENTRY,
  });
  assert.equal(r.status, 'EVALUATED');
  assert.equal(r.comparison, 'EXCEEDS');
  assert.equal(r.crossed, true);
  assert.equal(r.normalized.inventoryKg, 1200);
  assert.equal(r.normalized.thresholdKg, 1000);
  assert.equal(r.arithmetic, '1200 kg (site) > 1000 kg (schedule)');
  assert.ok(r.factsUsed.length >= 2);
});

test('threshold: equal quantities are AT_OR_ABOVE, not BELOW', () => {
  const r = evaluateThreshold({
    chemical: { id: 'c1', canonicalName: 'Test Substance A', cas: '64-19-7', quantity: 1, quantityUnit: 'MT', quantityStatus: 'VERIFIED', identityResolution: RESOLVED },
    thresholdEntry: VERIFIED_ENTRY,
  });
  assert.equal(r.comparison, 'AT_OR_ABOVE');
  assert.equal(r.crossed, true);
});

test('threshold: 80 % of the figure reports APPROACHING with the maximum-quantity caveat', () => {
  const r = evaluateThreshold({
    chemical: { id: 'c1', canonicalName: 'Test Substance A', cas: '64-19-7', quantity: 850, quantityUnit: 'kg', quantityStatus: 'VERIFIED', identityResolution: RESOLVED },
    thresholdEntry: VERIFIED_ENTRY,
  });
  assert.equal(r.comparison, 'APPROACHING');
  assert.equal(r.crossed, false);
  assert.equal(r.ratioPercent, 85);
  assert.ok(r.notes.some((n) => /maximum quantity liable to be present/.test(n)));
});

test('threshold: the seeded library ships NO numeric thresholds', () => {
  for (const set of LEGAL_THRESHOLD_SETS) {
    assert.equal(set.status, 'REQUIRES_VERIFICATION', set.id + ' must ship unverified');
    assert.equal(set.entries.length, 0, set.id + ' must ship with no invented figures');
  }
});

test('threshold: an unverified figure blocks the conclusion', () => {
  const r = evaluateThreshold({
    chemical: { id: 'c1', canonicalName: 'A', quantity: 99999, quantityUnit: 'kg', quantityStatus: 'VERIFIED', identityResolution: RESOLVED },
    thresholdEntry: { chemicalName: 'A', value: null, unit: 'kg', locator: 'Schedule X' },
  });
  assert.equal(r.status, 'THRESHOLD_NOT_VERIFIED');
  assert.equal(r.comparison, null);
  assert.equal(r.blocks, 'APPLICABILITY_CONCLUSION');
});

test('threshold: a figure present but not VERIFIED is still blocked', () => {
  const r = evaluateThreshold({
    chemical: { id: 'c1', canonicalName: 'A', quantity: 5000, quantityUnit: 'kg', quantityStatus: 'VERIFIED', identityResolution: RESOLVED },
    thresholdEntry: Object.assign({}, VERIFIED_ENTRY, { status: 'AI_INFERRED' }),
  });
  assert.equal(r.status, 'THRESHOLD_NOT_VERIFIED');
});

test('threshold: an uncited figure is blocked', () => {
  const r = evaluateThreshold({
    chemical: { id: 'c1', canonicalName: 'A', quantity: 5000, quantityUnit: 'kg', quantityStatus: 'VERIFIED', identityResolution: RESOLVED },
    thresholdEntry: { chemicalName: 'A', value: 1000, unit: 'kg', status: 'VERIFIED' },
  });
  assert.equal(r.status, 'THRESHOLD_NOT_CITED');
});

test('threshold: a MISSING quantity blocks the conclusion', () => {
  const r = evaluateThreshold({
    chemical: { id: 'c1', canonicalName: 'Test Substance A', cas: '64-19-7', quantity: null, quantityUnit: 'kg', identityResolution: RESOLVED },
    thresholdEntry: VERIFIED_ENTRY,
  });
  assert.equal(r.status, 'NOT_ENOUGH_DATA');
  assert.deepEqual(r.missingFacts, ['chemical.quantity']);
});

test('threshold: an AI_INFERRED quantity cannot support a crossing', () => {
  const r = evaluateThreshold({
    chemical: { id: 'c1', canonicalName: 'Test Substance A', cas: '64-19-7', quantity: 5000, quantityUnit: 'kg', quantityStatus: 'AI_INFERRED', identityResolution: RESOLVED },
    thresholdEntry: VERIFIED_ENTRY,
  });
  assert.equal(r.status, 'NOT_ENOUGH_DATA');
});

test('threshold: uncertain identity forces human confirmation regardless of arithmetic', () => {
  const r = evaluateThreshold({
    chemical: { id: 'c1', canonicalName: 'Something', quantity: 999999, quantityUnit: 'kg', quantityStatus: 'VERIFIED', identityResolution: { matchKind: 'AMBIGUOUS' } },
    thresholdEntry: VERIFIED_ENTRY,
  });
  assert.equal(r.status, 'REQUIRES_HUMAN_CONFIRMATION');
  assert.equal(r.comparison, null);
});

test('threshold: a CAS mismatch between inventory and schedule is reported, not ignored', () => {
  const r = evaluateThreshold({
    chemical: { id: 'c1', canonicalName: 'Other', cas: '67-64-1', quantity: 5000, quantityUnit: 'kg', quantityStatus: 'VERIFIED', identityResolution: RESOLVED },
    thresholdEntry: VERIFIED_ENTRY,
  });
  assert.equal(r.status, 'IDENTITY_MISMATCH');
});

test('threshold: volume inventory carries its unit-conversion evidence into the result', () => {
  const r = evaluateThreshold({
    chemical: {
      id: 'c1', canonicalName: 'Test Substance A', cas: '64-19-7',
      quantity: 2, quantityUnit: 'kL', quantityStatus: 'DOCUMENT_EXTRACTED',
      density: 0.79, densityUnit: 'kg/L', densityStatus: 'DOCUMENT_EXTRACTED',
      identityResolution: RESOLVED,
    },
    thresholdEntry: VERIFIED_ENTRY,
  });
  assert.equal(r.status, 'EVALUATED');
  assert.equal(r.normalized.inventoryKg, 1580);
  assert.equal(r.comparison, 'EXCEEDS');
  assert.equal(r.conversion.length, 3, 'volume step + density step + threshold step');
});

test('threshold: a volume inventory with no density cannot conclude', () => {
  const r = evaluateThreshold({
    chemical: { id: 'c1', canonicalName: 'Test Substance A', cas: '64-19-7', quantity: 2, quantityUnit: 'kL', quantityStatus: 'VERIFIED', identityResolution: RESOLVED },
    thresholdEntry: VERIFIED_ENTRY,
  });
  assert.equal(r.status, 'NOT_ENOUGH_DATA');
  assert.deepEqual(r.missingFacts, ['chemical.density']);
});

test('inventory: an unmatched chemical prevents a "below threshold" conclusion for the site', () => {
  const out = evaluateInventory({
    thresholdSet: { id: 'S', label: 'Test set', entries: [VERIFIED_ENTRY] },
    chemicals: [
      { id: 'c1', canonicalName: 'Test Substance A', cas: '64-19-7', quantity: 10, quantityUnit: 'kg', quantityStatus: 'VERIFIED', identityResolution: RESOLVED },
      { id: 'c2', canonicalName: 'Unlisted Substance B', quantity: 4000, quantityUnit: 'kg', quantityStatus: 'VERIFIED', identityResolution: { matchKind: 'EXACT_NAME', casValid: null } },
    ],
  });
  assert.equal(out.unmatched.length, 1);
  assert.equal(out.unmatched[0].status, 'NO_SCHEDULE_ENTRY');
  assert.ok(/not a finding that the chemical is unscheduled/.test(out.unmatched[0].detail));
});

test('inventory: the engine does not invent an aggregation rule across substances', () => {
  const out = evaluateInventory({
    thresholdSet: { id: 'S', label: 'Test set', entries: [VERIFIED_ENTRY, Object.assign({}, VERIFIED_ENTRY, { id: 'e2', chemicalName: 'Test Substance B', cas: '67-64-1' })] },
    chemicals: [
      { id: 'c1', canonicalName: 'Test Substance A', cas: '64-19-7', quantity: 600, quantityUnit: 'kg', quantityStatus: 'VERIFIED', identityResolution: RESOLVED },
      { id: 'c2', canonicalName: 'Test Substance B', cas: '67-64-1', quantity: 600, quantityUnit: 'kg', quantityStatus: 'VERIFIED', identityResolution: RESOLVED },
    ],
  });
  assert.equal(out.conclusion, 'BELOW_ALL_VERIFIED_THRESHOLDS', '600 + 600 is not silently summed to 1200');
  assert.ok(out.aggregationQuestion, 'the aggregation question is surfaced to the user');
});

test('threshold entry validation rejects a figure without a citation or a status', () => {
  assert.equal(validateThresholdEntry({ chemicalName: 'A', value: 1000, unit: 'kg' }).ok, false);
  const errs = validateThresholdEntry({ chemicalName: 'A', value: 1000, unit: 'kg' }).errors;
  assert.ok(errs.some((e) => /Cite the schedule/.test(e)));
  assert.ok(errs.some((e) => /VERIFIED/.test(e)));
  assert.equal(validateThresholdEntry({ chemicalName: 'A', value: 1000, unit: 'kg', locator: 'Schedule 1, entry 4', status: 'VERIFIED' }).ok, true);
  assert.ok(validateThresholdEntry({ chemicalName: 'A', value: 1000, unit: 'parsecs', locator: 'Schedule 1', status: 'VERIFIED' }).errors.some((e) => /not a recognized mass unit/.test(e)));
});

// ---------------------------------------------------------------------------
// 6. Expiry / renewal calculation
// ---------------------------------------------------------------------------

test('expiry: date arithmetic is UTC-day based', () => {
  assert.equal(daysBetween('2026-01-01', '2026-12-31'), 364);
  assert.equal(addDays('2026-02-27', 2), '2026-03-01');
  assert.equal(addMonths('2026-01-31', 1), '2026-02-28', 'clamps to the end of a short month');
  assert.equal(addMonths('2026-01-31', 13), '2027-02-28');
  assert.equal(toUtcDay('2026-09-21T23:59:59+05:30'), Date.UTC(2026, 8, 21));
});

test('expiry: status transitions across the notice window', () => {
  const today = '2026-09-21';
  assert.equal(expiryStatus({ expiryDate: '2027-06-30', today }).status, 'VALID');
  assert.equal(expiryStatus({ expiryDate: '2026-11-30', today }).status, 'EXPIRING_SOON');
  assert.equal(expiryStatus({ expiryDate: '2026-09-21', today }).status, 'EXPIRING_SOON');
  assert.equal(expiryStatus({ expiryDate: '2026-09-20', today }).status, 'EXPIRED');
  assert.equal(expiryStatus({ expiryDate: '2026-09-20', today }).daysRemaining, -1);
  assert.equal(expiryStatus({ today }).status, 'UNKNOWN');
  assert.equal(expiryStatus({ expiryDate: '2027-01-01', revoked: true, today }).status, 'EXPIRED');
});

test('expiry: a renewal date inside its window drives the status', () => {
  const today = '2026-09-21';
  const r = expiryStatus({ expiryDate: '2027-03-31', renewalDate: '2026-10-05', today });
  assert.equal(r.status, 'RENEWAL_DUE');
  assert.equal(r.effectiveDate, '2026-10-05');
  assert.equal(expiryStatus({ expiryDate: '2027-03-31', renewalDate: '2026-12-31', today }).status, 'VALID');
});

test('expiry: a custom notice window is honoured', () => {
  assert.equal(expiryStatus({ expiryDate: '2026-12-01', today: '2026-09-21', noticeDays: 30 }).status, 'VALID');
  assert.equal(expiryStatus({ expiryDate: '2026-12-01', today: '2026-09-21', noticeDays: 120 }).status, 'EXPIRING_SOON');
});

test('recurring obligations: next due date from frequency', () => {
  assert.equal(nextDue({ frequency: 'ANNUAL', lastCompleted: '2025-10-15', today: '2026-09-21' }).dueDate, '2026-10-15');
  assert.equal(nextDue({ frequency: 'ANNUAL', lastCompleted: '2025-10-15', today: '2026-09-21' }).status, 'DUE_SOON');
  assert.equal(nextDue({ frequency: 'QUARTERLY', lastCompleted: '2026-01-31', today: '2026-09-21' }).dueDate, '2026-04-30');
  assert.equal(nextDue({ frequency: 'QUARTERLY', lastCompleted: '2026-01-31', today: '2026-09-21' }).status, 'OVERDUE');
  assert.equal(nextDue({ frequency: 'ON_EVENT' }).status, 'EVENT_DRIVEN');
  assert.equal(nextDue({ frequency: 'ANNUAL' }).status, 'UNKNOWN', 'no anchor date means unknown, not "today"');
});

// ---------------------------------------------------------------------------
// 7. Source precedence and conflict preservation
// ---------------------------------------------------------------------------

test('source precedence: agreeing sources report the strongest status', () => {
  const r = sourcePrecedence([
    { value: '5 KL', normalizedValue: 5000, normalizedUnit: 'L', status: 'DOCUMENT_EXTRACTED' },
    { value: '5000 L', normalizedValue: 5000, normalizedUnit: 'L', status: 'VERIFIED' },
  ]);
  assert.equal(r.status, 'VERIFIED');
  assert.equal(r.reason, 'SOURCES_AGREE');
  assert.equal(r.conflicting.length, 0);
});

test('conflict preservation: disagreeing sources stay a CONFLICT by default', () => {
  const r = sourcePrecedence([
    { value: '5 KL', normalizedValue: 5000, normalizedUnit: 'L', status: 'DOCUMENT_EXTRACTED' },
    { value: '6 KL', normalizedValue: 6000, normalizedUnit: 'L', status: 'DOCUMENT_EXTRACTED' },
    { value: '5 KL', normalizedValue: 5000, normalizedUnit: 'L', status: 'DOCUMENT_EXTRACTED' },
  ]);
  assert.equal(r.status, 'CONFLICT');
  assert.equal(r.value, null, 'the majority value is NOT selected');
  assert.equal(r.reason, 'PRECEDENCE_DISABLED');
  assert.equal(r.conflicting.length, 3);
});

test('conflict preservation: equal-rank disagreement never resolves, even with precedence enabled', () => {
  const r = sourcePrecedence(
    [
      { value: 196, normalizedValue: 196, normalizedUnit: 'degC', status: 'DOCUMENT_EXTRACTED' },
      { value: 184, normalizedValue: 184, normalizedUnit: 'degC', status: 'DOCUMENT_EXTRACTED' },
    ],
    { allowPrecedence: true }
  );
  assert.equal(r.status, 'CONFLICT');
  assert.equal(r.reason, 'EQUAL_RANK_DISAGREEMENT');
});

test('source precedence: an explicitly enabled project rule can resolve unequal ranks', () => {
  const r = sourcePrecedence(
    [
      { value: 5, normalizedValue: 5, status: 'DOCUMENT_EXTRACTED' },
      { value: 6, normalizedValue: 6, status: 'VERIFIED' },
    ],
    { allowPrecedence: true }
  );
  assert.equal(r.status, 'VERIFIED');
  assert.equal(r.reason, 'RESOLVED_BY_PRECEDENCE');
  assert.equal(r.conflicting.length, 1, 'the losing value is retained');
});

test('legal sources: a secondary source can never overwrite an official one', () => {
  assert.equal(canOverwriteLegalSource('GAZETTE', 'SECONDARY').ok, false);
  assert.equal(canOverwriteLegalSource('GAZETTE', 'SECONDARY').reason, 'LESS_AUTHORITATIVE_CANNOT_OVERWRITE');
  assert.equal(canOverwriteLegalSource('STANDARDS_BODY', 'GAZETTE').ok, true);
  assert.equal(canOverwriteLegalSource('MINISTRY_OR_REGULATOR', 'MINISTRY_OR_REGULATOR').ok, false);
  assert.equal(canOverwriteLegalSource('SECONDARY', 'STATE_OFFICIAL').ok, true);
});

// ---------------------------------------------------------------------------
// 8. Legal status transitions
// ---------------------------------------------------------------------------

test('legal status: the AI layer cannot confirm applicability', () => {
  const r = legalStatusTransition({ from: 'POTENTIALLY_APPLICABLE', to: 'APPLICABLE_CONFIRMED', actorKind: 'ai' });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'AI_CANNOT_CONFIRM_APPLICABILITY');
  assert.equal(r.status, 'POTENTIALLY_APPLICABLE', 'the prior status is preserved');

  assert.equal(legalStatusTransition({ from: 'NOT_ENOUGH_DATA', to: 'NOT_APPLICABLE_CONFIRMED', actorKind: 'ai' }).ok, false);
  assert.equal(legalStatusTransition({ from: 'NOT_ENOUGH_DATA', to: 'POTENTIALLY_APPLICABLE', actorKind: 'ai' }).ok, true);
});

test('legal status: confirming needs an authorized role and verified facts', () => {
  assert.equal(legalStatusTransition({ to: 'APPLICABLE_CONFIRMED', actorKind: 'human', actorRole: 'engineer' }).reason, 'ROLE_NOT_AUTHORIZED');
  assert.equal(legalStatusTransition({ to: 'APPLICABLE_CONFIRMED', actorKind: 'human', actorRole: 'reviewer', factsAllVerified: false }).reason, 'FACTS_NOT_VERIFIED');
  assert.equal(legalStatusTransition({ to: 'APPLICABLE_CONFIRMED', actorKind: 'human', actorRole: 'reviewer', factsAllVerified: true }).ok, true);
});

test('compliance status: an expired permit overrides verified evidence', () => {
  const r = computeComplianceStatus({
    applicability: 'APPLICABLE_CONFIRMED',
    evidenceExpected: ['Licence'],
    evidence: [{ expects: 'Licence', status: 'VERIFIED' }],
    permit: { expiryStatus: 'EXPIRED', number: 'ABC/123' },
  });
  assert.equal(r.status, 'EXPIRED');
  assert.equal(r.reason, 'LINKED_PERMIT_EXPIRED');
});

test('compliance status: evidence present but unverified is only PARTIALLY_EVIDENCED', () => {
  const r = computeComplianceStatus({
    applicability: 'APPLICABLE_CONFIRMED',
    evidenceExpected: ['Licence', 'Latest return'],
    evidence: [{ expects: 'Licence', status: 'VERIFIED' }, { expects: 'Latest return', status: 'DOCUMENT_EXTRACTED' }],
  });
  assert.equal(r.status, 'PARTIALLY_EVIDENCED');
  assert.ok(r.gaps.some((g) => /not verified/.test(g)));
});

test('compliance status: unresolved applicability is UNDER_REVIEW, never compliant', () => {
  assert.equal(computeComplianceStatus({ applicability: 'NOT_ENOUGH_DATA', evidenceExpected: ['X'], evidence: [] }).status, 'UNDER_REVIEW');
  assert.equal(computeComplianceStatus({ applicability: 'REQUIRES_LEGAL_REVIEW', evidenceExpected: ['X'], evidence: [] }).status, 'UNDER_REVIEW');
});

test('compliance status: full verified evidence with a permit in notice is RENEWAL_DUE', () => {
  const r = computeComplianceStatus({
    applicability: 'APPLICABLE_CONFIRMED',
    evidenceExpected: ['Consent'],
    evidence: [{ expects: 'Consent', status: 'VERIFIED' }],
    permit: { expiryStatus: 'EXPIRING_SOON' },
  });
  assert.equal(r.status, 'RENEWAL_DUE');
});

test('recommendation close-out: the AI layer cannot close, and evidence is required', () => {
  assert.equal(canCloseRecommendation({ actorKind: 'ai', actorRole: 'admin' }).ok, false);
  assert.equal(canCloseRecommendation({ actorKind: 'human', actorRole: 'engineer' }).reason, 'ROLE_NOT_AUTHORIZED');
  assert.equal(canCloseRecommendation({ actorKind: 'human', actorRole: 'reviewer', closureEvidenceRequired: true, evidence: [], verifier: 'x' }).reason, 'CLOSURE_EVIDENCE_REQUIRED');
  assert.equal(canCloseRecommendation({ actorKind: 'human', actorRole: 'reviewer', closureEvidenceRequired: true, evidence: ['doc1'], verifier: 'R. Mehta' }).ok, true);
});

test('review states cannot skip forward but may be reopened with an audit note', () => {
  assert.equal(canAdvance(SCENARIO_REVIEW, 'DRAFT', 'TEAM_REVIEWED').ok, true);
  assert.equal(canAdvance(SCENARIO_REVIEW, 'DRAFT', 'CLOSED_OUT').ok, false);
  assert.equal(canAdvance(SCENARIO_REVIEW, 'FACILITATOR_ACCEPTED', 'DRAFT').reason, 'REOPEN');
});

// ---------------------------------------------------------------------------
// 9. Recommendation deduplication
// ---------------------------------------------------------------------------

test('dedup: technically equivalent recommendations merge and keep every backlink', () => {
  const out = deduplicateRecommendations([
    { id: 'R1', text: 'Ensure PM and calibration of the weighing balance', scenarioId: 'S1', nodeId: 'N1', equipmentTags: ['WB-01'], controlLevel: 'ADMINISTRATIVE', priority: 'MEDIUM', targetDate: '2026-12-31' },
    { id: 'R2', text: 'Ensure calibration and PM of weighing balance', scenarioId: 'S7', nodeId: 'N2', equipmentTags: ['WB-01'], controlLevel: 'ADMINISTRATIVE', priority: 'HIGH', targetDate: '2026-10-31' },
  ]);
  assert.equal(out.kept.length, 1);
  assert.equal(out.merges.length, 1);
  assert.deepEqual(out.kept[0].mergedFrom, ['R2']);
  assert.equal(out.kept[0].raisedFrom.length, 2, 'both originating scenarios keep a backlink');
  assert.equal(out.kept[0].priority, 'HIGH', 'the survivor keeps the higher priority');
  assert.equal(out.kept[0].targetDate, '2026-10-31', 'the survivor keeps the earlier date');
});

test('dedup: a different technical measure never merges, however similar the wording', () => {
  // These two differ by one word — alarm vs trip — and are lexically well above
  // the merge threshold. An alarm needs an operator to act; a trip does not.
  const v = isTechnicallyEquivalent(
    { text: 'Provide a high temperature alarm on the reactor jacket outlet line with set point at 95 degC', equipmentTags: ['R-101'], controlLevel: 'ENGINEERING' },
    { text: 'Provide a high temperature trip on the reactor jacket outlet line with set point at 95 degC', equipmentTags: ['R-101'], controlLevel: 'ENGINEERING' }
  );
  assert.equal(v.equivalent, false);
  assert.equal(v.reason, 'DIFFERENT_TECHNICAL_MEASURE');
  assert.ok(v.similarity > 0.8, 'similarity was ' + v.similarity + ' — well past the threshold, and it still does not merge');

  // The discriminator check runs before similarity, so a low-similarity pair
  // that differs on the measure reports the measure, not the similarity.
  const short = isTechnicallyEquivalent(
    { text: 'Provide a high-temperature alarm on the reactor', equipmentTags: ['R-101'], controlLevel: 'ENGINEERING' },
    { text: 'Provide a high-temperature trip on the reactor', equipmentTags: ['R-101'], controlLevel: 'ENGINEERING' }
  );
  assert.equal(short.reason, 'DIFFERENT_TECHNICAL_MEASURE');
});

test('dedup: the same measure on different equipment never merges', () => {
  const out = deduplicateRecommendations([
    { id: 'R1', text: 'Provide earthing and bonding', scenarioId: 'S1', nodeId: 'N1', equipmentTags: ['PSM-01'], controlLevel: 'ENGINEERING' },
    { id: 'R2', text: 'Provide earthing and bonding', scenarioId: 'S2', nodeId: 'N2', equipmentTags: ['BL-02'], controlLevel: 'ENGINEERING' },
  ]);
  assert.equal(out.kept.length, 2);
});

test('dedup: a different control level never merges', () => {
  const v = isTechnicallyEquivalent(
    { text: 'Provide dust collector system at the charging point', equipmentTags: ['PSM-01'], controlLevel: 'ENGINEERING' },
    { text: 'Provide dust collector system at the charging point', equipmentTags: ['PSM-01'], controlLevel: 'ADMINISTRATIVE' }
  );
  assert.equal(v.reason, 'DIFFERENT_CONTROL_LEVEL');
});

test('recommendation quality: vague actions and PPE-as-primary are flagged', () => {
  assert.ok(assessRecommendationQuality({ text: 'Take care while charging', controlLevel: 'ADMINISTRATIVE', responsibleDepartment: 'Production', targetDate: '2026-12-01', technicalBasis: 'x' }).issues.some((i) => i.code === 'VAGUE_ACTION'));
  assert.ok(assessRecommendationQuality({ text: 'Use PPE', controlLevel: 'PPE', responsibleDepartment: 'EHS', targetDate: '2026-12-01', technicalBasis: 'x' }).issues.some((i) => i.code === 'PPE_AS_PRIMARY'));
  assert.equal(
    assessRecommendationQuality({
      text: 'Provide a high-temperature trip on TT-201 that closes the thermic-fluid inlet valve independently of the temperature controller.',
      controlLevel: 'ENGINEERING',
      responsibleDepartment: 'Instrumentation',
      targetDate: '2026-12-31',
      technicalBasis: 'Independent protection layer for the loss-of-temperature-control scenario.',
    }).ok,
    true
  );
});

// ---------------------------------------------------------------------------
// 10. Guideword engine
// ---------------------------------------------------------------------------

test('guidewords: only meaningful combinations are emitted', () => {
  const node = { id: 'N1', nodeNumber: '01', designIntent: 'Charge stearic acid and melt', hasCharging: true, hasTimedStep: true, equipmentIds: ['E1'], chemicalIds: ['C1'], utilities: ['power', 'thermicFluid'], manualOperation: true };
  const ctx = {
    equipment: [{ id: 'E1', tag: 'PSM-01', type: 'mixer', agitator: true, heatingSystem: true, capacity: '2.5 kL', powderHandling: true }],
    chemicals: [{ id: 'C1', canonicalName: 'Stearic acid', physicalState: 'Solid (flakes)', hazardousClassification: 'Combustible dust (to be verified)' }],
    chemProperties: [],
  };
  const gen = generateDeviations(node, ctx);

  const keys = gen.combinations.map((c) => c.parameter + '/' + c.guideword);
  assert.ok(keys.indexOf('agitation/NO') !== -1, 'agitated equipment yields NO agitation');
  assert.ok(keys.indexOf('temperature/MORE') !== -1, 'a heating duty yields MORE temperature');
  assert.ok(keys.indexOf('charging/MORE') !== -1);
  assert.ok(keys.indexOf('staticCharge/AS_WELL_AS') !== -1, 'powder handling yields a static row');

  // Nonsense combinations are absent
  assert.equal(keys.indexOf('level/REVERSE'), -1, 'REVERSE level has no semantic');
  assert.equal(keys.indexOf('ph/MORE'), -1, 'pH is not declared on this node');
  assert.equal(keys.indexOf('inerting/NO'), -1, 'no inert gas utility on this node');
  assert.equal(keys.indexOf('vacuum/MORE'), -1, 'no vacuum service on this node');

  assert.ok(gen.combinations.length < gen.counts.crossProduct / 2, 'far fewer rows than a blind cross-product (' + gen.combinations.length + ' vs ' + gen.counts.crossProduct + ')');
  assert.ok(gen.suppressed.length > 0);
  assert.ok(gen.suppressed.every((s) => s.reason && s.unmetFacts.length));
});

test('guidewords: every emitted combination carries the node fact that justified it', () => {
  const node = { id: 'N1', hasCharging: true, equipmentIds: ['E1'], utilities: ['nitrogen'], chemicalIds: [] };
  const ctx = { equipment: [{ id: 'E1', tag: 'R-101', type: 'reactor', agitator: true }], chemicals: [], chemProperties: [] };
  const gen = generateDeviations(node, ctx);
  const inerting = gen.combinations.filter((c) => c.parameter === 'inerting');
  assert.ok(inerting.length > 0, 'a declared inert gas utility enables inerting rows');
  for (const c of gen.combinations) {
    if (c.kind === 'GUIDEWORD') assert.ok(c.rationale.length > 0, c.parameter + '/' + c.guideword + ' has no rationale');
  }
});

test('guidewords: a utility failure row is emitted per utility, not one generic row', () => {
  const node = { id: 'N1', equipmentIds: [], chemicalIds: [], utilities: ['power', 'coolingWater', 'nitrogen'] };
  const gen = generateDeviations(node, { equipment: [], chemicals: [], chemProperties: [] });
  const utilRows = gen.combinations.filter((c) => c.kind === 'UTILITY');
  assert.equal(utilRows.length, 3);
  assert.ok(utilRows.some((r) => /cooling water/i.test(r.deviation)));
});

test('guidewords: node facts are derived from records, never assumed', () => {
  const bare = deriveNodeFacts({ id: 'N', equipmentIds: [], chemicalIds: [], utilities: [] }, { equipment: [], chemicals: [], chemProperties: [] });
  assert.equal(bare.facts.agitator, false);
  assert.equal(bare.facts.heatingSystem, false);
  assert.equal(bare.facts.staticRisk, false);
  assert.equal(bare.facts.anyOperation, true);
});

test('cause families: coverage reports what a node has not considered', () => {
  const facts = { anyOperation: true, anyUtility: true, agitator: true, charging: true };
  const cov = causeFamilyCoverage(facts, [{ causes: [{ family: 'HUMAN_ERROR' }] }]);
  assert.ok(cov.missing.indexOf('UTILITY_FAILURE') !== -1);
  assert.ok(cov.missing.indexOf('AGITATION_FAILURE') !== -1);
  assert.ok(cov.percent < 100);
});

test('consequences phrased as safeguards are flagged', () => {
  assert.equal(consequenceCreditsSafeguard('Overpressure, prevented by PSV-101').flagged, true);
  assert.equal(consequenceCreditsSafeguard('Vessel overpressure and possible rupture').flagged, false);
});

test('free-text classification maps the reference study wording to families', () => {
  assert.equal(classifyCause('Weighing balance malfunction'), 'CHARGE_ERROR');
  assert.equal(classifyCause('TFH valve malfunction'), 'VALVE_FAILURE');
  assert.equal(classifyCause('Stirrer decoupled'), 'AGITATION_FAILURE');
  assert.equal(classifyCause('Power failure'), 'UTILITY_FAILURE');
  assert.equal(classifyConsequence('Dust exposure'), 'EXPOSURE');
  assert.equal(classifyConsequence('Flash Fire'), 'FLASH_FIRE');
  assert.equal(classifyConsequence('Batch delay/ production loss'), 'PRODUCTION_LOSS');
  assert.equal(classifyConsequence('No safety consequence'), 'NO_CONSEQUENCE');
});

// ---------------------------------------------------------------------------
// 11. Chemical identity
// ---------------------------------------------------------------------------

test('CAS validation is a real check-digit calculation', () => {
  assert.equal(validateCas('64-19-7').valid, true, 'acetic acid');
  assert.equal(validateCas('67-64-1').valid, true, 'acetone');
  assert.equal(validateCas('7732-18-5').valid, true, 'water');
  assert.equal(validateCas('1592-23-0').valid, true, 'calcium stearate');
  assert.equal(validateCas('57-11-4').valid, true, 'stearic acid');
  assert.equal(validateCas('1305-62-0').valid, true, 'calcium hydroxide');

  const bad = validateCas('64-19-8');
  assert.equal(bad.valid, false);
  assert.equal(bad.reason, 'CHECK_DIGIT');
  assert.equal(bad.expected, 7);
  assert.equal(validateCas('abc').reason, 'FORMAT');
});

test('chemical resolution: an invalid CAS is reported, never silently matched', () => {
  const r = resolveChemical({ name: 'Mystery', cas: '64-19-8' }, []);
  assert.equal(r.casValid, false);
  assert.ok(r.notes.some((n) => /check digit/.test(n)));
  assert.equal(identityBlocksThreshold(r), true);
});

test('chemical resolution: exact, synonym, ambiguous and unresolved', () => {
  const known = [
    { id: 'c1', canonicalName: 'Calcium stearate', cas: '1592-23-0', synonyms: ['Octadecanoic acid, calcium salt'] },
    { id: 'c2', canonicalName: 'Stearic acid', cas: '57-11-4', synonyms: ['Octadecanoic acid'] },
  ];
  assert.equal(resolveChemical({ cas: '1592-23-0' }, known).matchKind, 'EXACT_CAS');
  assert.equal(resolveChemical({ name: 'stearic acid' }, known).matchKind, 'EXACT_NAME');
  assert.equal(resolveChemical({ name: 'Octadecanoic acid' }, known).matchKind, 'SYNONYM');
  assert.equal(resolveChemical({ name: 'Unheard-of substance' }, known).matchKind, 'UNRESOLVED');
  assert.equal(identityBlocksThreshold(resolveChemical({ name: 'Unheard-of substance' }, known)), true);
});

test('SDS completeness reports which critical properties are missing', () => {
  const s = sdsCompleteness('c1', [
    { chemicalId: 'c1', key: 'flashPoint', value: 196, status: 'DOCUMENT_EXTRACTED' },
    { chemicalId: 'c1', key: 'acuteToxicity', value: 'Not classified', status: 'DOCUMENT_EXTRACTED' },
  ]);
  assert.equal(s.status, 'PARTIAL');
  assert.ok(s.missing.indexOf('combustibleDust') !== -1);
  assert.ok(s.missingLabels.some((l) => /Combustible-dust/.test(l)));
});

test('SDS completeness surfaces a conflict rather than counting it as present', () => {
  const s = sdsCompleteness('c1', [{ chemicalId: 'c1', key: 'flashPoint', value: null, status: 'CONFLICT' }]);
  assert.equal(s.status, 'CONFLICT');
  assert.ok(s.conflicts.indexOf('flashPoint') !== -1);
});

// ---------------------------------------------------------------------------
// 12. Applicability engine
// ---------------------------------------------------------------------------

test('applicability: a null trigger fact yields NOT_ENOUGH_DATA, never a guess', () => {
  const pred = evaluatePredicate({ all: [{ fact: 'hazardousProcess', eq: true }] }, { hazardousProcess: null });
  assert.equal(pred.value, null);
  assert.deepEqual(pred.unresolved, ['hazardousProcess']);

  const rec = evaluateObligation({
    obligation: { id: 'OB', instrumentId: 'IN-OSHWC-CODE-2020', topic: 'T', applicabilityLogic: { all: [{ fact: 'hazardousProcess', eq: true }] }, legalReviewRequired: true },
    facts: { hazardousProcess: null },
  });
  assert.equal(rec.applicabilityStatus, 'NOT_ENOUGH_DATA');
  assert.ok(rec.requiresHumanReview);
});

test('applicability: a false trigger yields a confirmed exclusion with a reason', () => {
  const rec = evaluateObligation({
    obligation: { id: 'OB', instrumentId: 'IN-BOILER', topic: 'Boiler', applicabilityLogic: { all: [{ fact: 'boilerInScope', eq: true }] } },
    facts: { boilerInScope: false },
  });
  assert.equal(rec.applicabilityStatus, 'NOT_APPLICABLE_CONFIRMED');
  assert.ok(/boilerInScope = false/.test(rec.applicabilityReason));
});

test('applicability: a threshold-gated obligation stays POTENTIALLY_APPLICABLE until a figure is entered', () => {
  const rec = evaluateObligation({
    obligation: { id: 'OB-PLIA', instrumentId: 'IN-PLIA-1991', topic: 'Insurance', applicabilityLogic: { all: [{ fact: 'hazardousChemicalsPresent', eq: true }], requiresThreshold: 'PLIA-NOTIFIED-QUANTITIES' } },
    facts: { hazardousChemicalsPresent: true },
    chemicals: [{ id: 'c1', canonicalName: 'A', quantity: 999999, quantityUnit: 'kg', quantityStatus: 'VERIFIED', identityResolution: RESOLVED }],
  });
  assert.equal(rec.applicabilityStatus, 'POTENTIALLY_APPLICABLE');
  assert.equal(rec.actionNeeded, 'ENTER_VERIFIED_THRESHOLD');
  assert.ok(/no verified threshold figure/.test(rec.applicabilityReason));
});

test('applicability: a verified crossing on verified facts can reach APPLICABLE_CONFIRMED', () => {
  const rec = evaluateObligation({
    obligation: { id: 'OB', instrumentId: 'IN-MSIHC-1989', topic: 'X', applicabilityLogic: { all: [{ fact: 'hazardousChemicalsPresent', eq: true }], requiresThreshold: 'TEST-SET' } },
    facts: { hazardousChemicalsPresent: true },
    thresholdSets: [{ id: 'TEST-SET', label: 'Test set', entries: [VERIFIED_ENTRY] }],
    chemicals: [{ id: 'c1', canonicalName: 'Test Substance A', cas: '64-19-7', quantity: 1200, quantityUnit: 'kg', quantityStatus: 'VERIFIED', identityResolution: RESOLVED }],
    criticalFactsVerified: true,
  });
  assert.equal(rec.applicabilityStatus, 'APPLICABLE_CONFIRMED');
  assert.equal(rec.crossings.length, 1);
  assert.ok(/1200 kg \(site\) > 1000 kg \(schedule\)/.test(rec.applicabilityReason));
});

test('applicability: the same crossing on unverified facts stays POTENTIALLY_APPLICABLE', () => {
  const rec = evaluateObligation({
    obligation: { id: 'OB', instrumentId: 'IN-MSIHC-1989', topic: 'X', applicabilityLogic: { all: [{ fact: 'hazardousChemicalsPresent', eq: true }], requiresThreshold: 'TEST-SET' } },
    facts: { hazardousChemicalsPresent: true },
    thresholdSets: [{ id: 'TEST-SET', label: 'Test set', entries: [VERIFIED_ENTRY] }],
    chemicals: [{ id: 'c1', canonicalName: 'Test Substance A', cas: '64-19-7', quantity: 1200, quantityUnit: 'kg', quantityStatus: 'DOCUMENT_EXTRACTED', identityResolution: RESOLVED }],
    criticalFactsVerified: false,
  });
  assert.equal(rec.applicabilityStatus, 'POTENTIALLY_APPLICABLE');
});

test('applicability: a standard is not an obligation until an adoption route is recorded', () => {
  const nbc = instrumentById('IN-NBC');
  assert.equal(nbc.isStandard, true);
  assert.deepEqual(nbc.mandatoryVia, []);
  assert.equal(standardIsMandatory(nbc).mandatory, false);

  const rec = evaluateObligation({ obligation: { id: 'OB', instrumentId: 'IN-NBC', topic: 'NBC', applicabilityLogic: { all: [] } }, facts: { always: true } });
  assert.equal(rec.applicabilityStatus, 'NOT_APPLICABLE_CONFIRMED');
  assert.equal(rec.isStandardGuidance, true);
  assert.ok(/standard, not a law/.test(rec.applicabilityReason));
});

test('jurisdiction resolver: unset fields resolve to null, not false', () => {
  const r = resolveJurisdiction({ project: { jurisdiction: { state: 'Gujarat' } }, chemicals: [], equipment: [] });
  assert.equal(r.facts.stateGujarat, true);
  assert.equal(r.facts.hazardousProcess, null);
  assert.equal(r.facts.boilerInScope, null);
  assert.equal(r.facts.hazardousChemicalsPresent, null);
  assert.ok(r.provenance.stateGujarat.from.indexOf('jurisdiction.state') !== -1);
});

test('jurisdiction resolver: equipment records can establish a fact the profile left blank', () => {
  const r = resolveJurisdiction({
    project: { jurisdiction: {} },
    chemicals: [],
    equipment: [{ id: 'B1', type: 'Boiler', service: 'Steam generation' }],
  });
  assert.equal(r.facts.boilerInScope, true);
});

test('applicability: a full project run never marks everything applicable', () => {
  const out = runApplicability({
    project: { jurisdiction: { country: 'India', state: 'Gujarat', establishmentCategory: 'Factory', appropriateGovernment: 'State Government', hazardousProcess: true } },
    chemicals: [{ id: 'c1', canonicalName: 'Stearic acid', cas: '57-11-4', quantity: 450, quantityUnit: 'kg', hazardousClassification: 'Combustible solid', quantityStatus: 'DOCUMENT_EXTRACTED' }],
    equipment: [],
  });
  assert.ok(out.records.length > 5);
  assert.equal(out.counts.APPLICABLE_CONFIRMED, 0, 'nothing is confirmed applicable without verified thresholds and a human');
  assert.ok(out.counts.POTENTIALLY_APPLICABLE > 0);
  assert.ok(out.counts.NOT_ENOUGH_DATA > 0, 'unresolved facts are reported honestly');
  // Central rules are excluded because the appropriate government is the State.
  assert.ok(out.excluded.some((e) => e.instrumentId === 'IN-OSHWC-RULES-CENTRAL'));
  // An unanswered trigger becomes a QUESTION, not an exclusion and not an obligation.
  assert.ok(out.candidates.some((c) => c.instrumentId === 'IN-AMMONIUM-NITRATE-2012' && c.reason === 'TRIGGER_UNRESOLVED'));
  const anQ = out.pendingQuestions.filter((q) => q.fact === 'ammoniumNitrateRelevant')[0];
  assert.ok(anQ, 'the unanswered ammonium-nitrate trigger is surfaced as a question');
  assert.ok(/ammonium nitrate/i.test(anQ.question));
});

test('applicability: answering a trigger false excludes the instrument outright', () => {
  const out = runApplicability({
    project: {
      jurisdiction: {
        country: 'India', state: 'Gujarat', establishmentCategory: 'Factory', appropriateGovernment: 'State Government', hazardousProcess: true,
        ammoniumNitrateRelevant: false, explosivesRelevant: false, calciumCarbideRelevant: false, petroleumClassPresent: false,
        compressedGasPresent: false, pressureVesselPresent: false, boilerInScope: false, groundwaterAbstraction: false,
      },
    },
    chemicals: [{ id: 'c1', canonicalName: 'Stearic acid', cas: '57-11-4', quantity: 450, quantityUnit: 'kg', hazardousClassification: 'Combustible solid' }],
    equipment: [],
  });
  const excludedIds = out.excluded.map((e) => e.instrumentId);
  assert.ok(excludedIds.indexOf('IN-AMMONIUM-NITRATE-2012') !== -1);
  assert.ok(excludedIds.indexOf('IN-EXPLOSIVES-RULES-2008') !== -1);
  assert.ok(excludedIds.indexOf('IN-CALCIUM-CARBIDE-RULES') !== -1);
  assert.ok(excludedIds.indexOf('IN-BOILER') !== -1);
  assert.equal(out.pendingQuestions.filter((q) => q.fact === 'ammoniumNitrateRelevant').length, 0);
  // Answering the questions shrinks the register rather than growing it.
  assert.ok(out.counts.NOT_ENOUGH_DATA < 10);
});

test('applicability: pending questions are ranked by how many obligations they gate', () => {
  const out = runApplicability({ project: { jurisdiction: { country: 'India', state: 'Gujarat' } }, chemicals: [], equipment: [] });
  assert.ok(out.pendingQuestions.length > 0);
  for (let i = 1; i < out.pendingQuestions.length; i += 1) {
    assert.ok(out.pendingQuestions[i - 1].obligationCount >= out.pendingQuestions[i].obligationCount);
  }
  for (const q of out.pendingQuestions) {
    assert.ok(q.question && q.question.length > 10, q.fact + ' needs a plain-language question');
    assert.ok(q.instruments.length > 0);
  }
});

test('library integrity: no instrument ships as verified, and every one has an authority', () => {
  for (const i of LEGAL_INSTRUMENTS) {
    assert.equal(i.lastVerifiedAt, null, i.id + ' must not claim verification');
    assert.equal(i.sourceStatus, 'METADATA_SEEDED_UNVERIFIED', i.id);
    assert.ok(i.authority && i.authority.length > 3, i.id + ' needs an authority');
    assert.ok(i.title && i.title.length > 5, i.id + ' needs a title');
  }
});

// ---------------------------------------------------------------------------
// 13. Completeness and quality gate
// ---------------------------------------------------------------------------

test('completeness: the two figures are separate and each says what is missing', () => {
  const project = { projectName: 'X', clientName: 'Y', siteName: 'Z', product: 'P', jurisdiction: { country: 'India', state: 'Gujarat' } };
  const d = dataCompleteness(project);
  assert.ok(d.percent > 0 && d.percent < 100);
  assert.ok(d.missing.some((m) => m.path === 'processDescription'));
  assert.ok(d.missing.some((m) => m.path === 'jurisdiction.hazardousProcess'));

  const crit = criticalCompleteness({
    project,
    chemicals: [{ id: 'c1', canonicalName: 'A', quantity: null }],
    chemProperties: [],
    equipment: [{ id: 'e1', tag: 'R-101', pressureEquipment: true }],
    nodes: [{ id: 'n1', nodeNumber: '01' }],
    matrix: null,
  });
  assert.ok(crit.percent < 100);
  assert.ok(crit.missing.some((m) => m.id === 'matrix'));
  assert.ok(crit.missing.some((m) => m.id === 'chem.c1.quantity'));
  assert.ok(crit.missing.some((m) => m.id === 'eq.e1.relief'));
  assert.ok(crit.byGroup.length >= 3);
});

test('quality gate: an empty project is BLOCKED and names the blockers', () => {
  const g = runQualityGate({ project: {}, today: '2026-09-21' });
  assert.equal(g.status, 'BLOCKED');
  assert.ok(g.summary.blockingFailedIds.indexOf('identity') !== -1);
  assert.ok(g.summary.blockingFailedIds.indexOf('nodesApproved') !== -1);
  assert.ok(g.summary.blockingFailedIds.indexOf('teamRecorded') !== -1);
  assert.ok(g.caution.indexOf('not a statutory certification') !== -1);
});

test('quality gate: an expired permit blocks the report', () => {
  const g = runQualityGate({ project: {}, permits: [{ id: 'p1', type: 'CTO', number: 'ABC', expiryDate: '2026-01-01' }], today: '2026-09-21' });
  const check = g.checks.filter((k) => k.id === 'permitsCurrent')[0];
  assert.equal(check.pass, false);
  assert.ok(/Expired: CTO ABC/.test(check.detail));
});

test('quality gate: a risk score from an older matrix version is flagged as stale', () => {
  const g = runQualityGate({
    project: {},
    matrix: DEFAULT_MATRIX,
    scenarios: [{ id: 's1', initialLikelihood: 3, initialSeverity: 3, causes: [{ text: 'x' }], consequences: [{ text: 'y' }], initialRisk: { matrixId: 'IEC-5x5-v1', matrixVersion: 0 } }],
    today: '2026-09-21',
  });
  const check = g.checks.filter((k) => k.id === 'riskMatrixCurrent')[0];
  assert.equal(check.pass, false);
});

test('quality gate: a high-risk row with neither action nor acceptance rationale blocks', () => {
  const base = { project: {}, matrix: DEFAULT_MATRIX, today: '2026-09-21' };
  const withHigh = runQualityGate(Object.assign({}, base, { scenarios: [{ id: 's1', rowNumber: 1, initialLikelihood: 4, initialSeverity: 5, causes: [{ text: 'c' }], consequences: [{ text: 'q' }] }] }));
  assert.equal(withHigh.checks.filter((k) => k.id === 'highRiskActioned')[0].pass, false);

  const accepted = runQualityGate(Object.assign({}, base, {
    scenarios: [{ id: 's1', rowNumber: 1, initialLikelihood: 4, initialSeverity: 5, causes: [{ text: 'c' }], consequences: [{ text: 'q' }], acceptanceRationale: 'The team accepts this rating because the existing SIL-2 trip is independently verified annually.' }],
  }));
  assert.equal(accepted.checks.filter((k) => k.id === 'highRiskActioned')[0].pass, true);
});

test('report status: the AI layer cannot approve, and a blocked gate prevents approval', () => {
  const blocked = runQualityGate({ project: {}, today: '2026-09-21' });
  assert.equal(canSetReportStatus({ to: 'APPROVED', actorKind: 'ai', actorRole: 'admin', gate: blocked }).ok, false);
  assert.equal(canSetReportStatus({ to: 'APPROVED', actorKind: 'human', actorRole: 'admin', gate: blocked }).reason, 'QUALITY_GATE_BLOCKED');
  assert.equal(canSetReportStatus({ to: 'DRAFT', actorKind: 'human', actorRole: 'viewer', gate: blocked }).ok, true, 'DRAFT is always permitted');
  assert.equal(canSetReportStatus({ to: 'APPROVED', actorKind: 'human', actorRole: 'engineer', gate: { status: 'READY' } }).reason, 'ROLE_NOT_AUTHORIZED');
  assert.equal(canSetReportStatus({ to: 'APPROVED', actorKind: 'human', actorRole: 'facilitator', gate: { status: 'READY' } }).ok, true);
});

// ---------------------------------------------------------------------------
// 14. Structural guarantee: no LLM arithmetic on the deterministic path
// ---------------------------------------------------------------------------

test('no deterministic module imports an AI layer', async () => {
  const { readFileSync, readdirSync, statSync } = await import('node:fs');
  const { join } = await import('node:path');
  const root = new URL('../packages/', import.meta.url).pathname;
  const offenders = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (name.endsWith('.js')) {
        const src = readFileSync(p, 'utf8');
        const imports = src.match(/^\s*import[^;]+from\s+['"][^'"]+['"]/gm) || [];
        for (const imp of imports) {
          if (/\/ai|ai\.js|sample|anthropic|openai/i.test(imp)) offenders.push(p + ' -> ' + imp.trim());
        }
      }
    }
  };
  walk(root);
  assert.deepEqual(offenders, [], 'deterministic packages must not import the AI layer');
});

test('parameter table integrity: every guideword named by a parameter exists', () => {
  const known = GUIDEWORDS.map((g) => g.key);
  for (const p of PARAMETERS) {
    for (const g of p.guidewords) assert.ok(known.indexOf(g) !== -1, p.key + ' names unknown guideword ' + g);
    assert.ok((p.requires || []).length > 0, p.key + ' must declare the node facts it requires');
  }
});
