// app/ai-tools.js — what the assistant is actually allowed to do.
//
// The assistant has authority over the whole application: it reads every
// collection and every computed engine result, and it writes records the same
// way a human does — through `store.create/update/remove`, so every change is
// audited, revisioned and attributed.
//
// Three things constrain it, and none of them is a restriction on capability:
//
//  1. It calculates nothing. Risk scores, unit conversions, threshold
//     comparisons and renewal dates come back from the deterministic engines.
//     A tool hands over the engine's answer; the assistant quotes it.
//  2. It cannot sign. Five acts are a human's signature on an engineering
//     document — marking a field VERIFIED, marking compliance evidence
//     verified, closing a recommendation, approving a report, and entering a
//     statutory threshold as verified. The tools for those refuse and say who
//     has to do it. Everything else it may do.
//  3. Every write is reversible and visible. Each one lands in the action
//     ledger with the record before and after, and a single Undo puts it back.
//
// Autonomy is the user's setting, not the assistant's: in "Ask first" a write
// is queued as a confirmation card; in "Act and report" it runs immediately
// and appears in the ledger.

import { S, render, project, scoped, nodesSorted, matrix, go } from './state.js';
import {
  scenariosWithRisk,
  chemicalsResolved,
  completeness,
  applicability,
  complianceRegister,
  complianceCounts,
  alerts,
  permitStatuses,
  recommendationRegister,
  qualityGate,
  dataGapsAll,
} from './state.js';
import { toast, truncate, nowIso, uid } from './util.js';
import { tryRiskFromLS, validateResidual, RESIDUAL_BASIS_KINDS } from '../packages/calculations/risk.js';
import { generateDeviations, deviationCoverage, deriveNodeFacts } from '../packages/domain/guidewords.js';
import { causeFamilyCoverage, CAUSE_FAMILIES, CONSEQUENCE_FAMILIES, SAFEGUARD_CLASSES } from '../packages/domain/causes.js';
import {
  rankRecommendations,
  selectDoable,
  migrationPlan,
  EFFORT_FIELDS,
  doability,
  recRef,
  scenarioRef,
} from '../packages/calculations/doability.js';
import { PROPERTY_GROUPS, ALL_PROPERTIES, propertyMeta } from '../packages/chemical/properties.js';
import { chemicalQueryPlan, companyQueryPlan, COMPANY_FIELD_LABELS } from '../packages/research/sources.js';
import { CONTROL_LEVELS } from '../packages/calculations/dedup.js';

export const TOOLS_VERSION = 'ai-tools-1.0.0';

/** The autonomy setting. The user chooses; the assistant cannot change it. */
export const AUTONOMY = Object.freeze([
  {
    key: 'ASK',
    label: 'Ask first',
    note: 'The assistant proposes each change as a card you confirm. Reads run freely.',
  },
  {
    key: 'ACT',
    label: 'Act and report',
    note: 'The assistant makes the change, tells you what it did, and every change carries an Undo.',
  },
]);

/**
 * The five acts the assistant cannot perform, with who has to.
 * Each is a signature on an engineering document, not a capability limit.
 */
export const HUMAN_ONLY = Object.freeze([
  { key: 'VERIFY_FIELD', act: 'Marking a field VERIFIED', who: 'the engineer who read the source document' },
  { key: 'VERIFY_EVIDENCE', act: 'Marking compliance evidence verified', who: 'a named reviewer' },
  { key: 'CLOSE_RECOMMENDATION', act: 'Closing a recommendation', who: 'the action owner, against evidence' },
  { key: 'APPROVE_REPORT', act: 'Marking a report REVIEWED or APPROVED', who: 'the reviewer and the approver' },
  { key: 'VERIFY_THRESHOLD', act: 'Entering a statutory threshold as verified', who: 'whoever read the official text' },
]);

function refuseSignature(key) {
  const e = HUMAN_ONLY.find((x) => x.key === key);
  return (
    'Refused: ' +
    (e ? e.act : 'this act') +
    ' is a human attestation. ' +
    (e ? 'It has to be done by ' + e.who + '.' : '') +
    ' Tell the user what to record and where, and continue with what you can do.'
  );
}

// ---------------------------------------------------------------------------
// The action ledger
// ---------------------------------------------------------------------------

/**
 * Record a write so it appears in the panel and can be undone. The ledger is
 * project-scoped and lives in the store like everything else, so it survives
 * a reload and is visible to everyone sharing the project.
 */
async function ledger(entry) {
  if (!S.store) return null;
  try {
    return await S.store.create(
      'chat_actions',
      Object.assign(
        {
          projectId: S.projectId,
          at: nowIso(),
          actorKind: 'ai',
          requestedBy: S.actor.id,
          undone: false,
        },
        entry
      ),
      { projectId: S.projectId, actorKind: 'ai', note: 'Assistant action' }
    );
  } catch (e) {
    return null;
  }
}

/** Reverse one ledger entry. */
export async function undoAction(row) {
  if (!S.store || !row || row.undone) return { ok: false, message: 'Nothing to undo.' };
  try {
    if (row.op === 'create') {
      await S.store.remove(row.collection, row.recordId, { projectId: S.projectId, note: 'Undo of assistant action' });
    } else if (row.op === 'update') {
      const before = row.before || {};
      const patch = {};
      for (const k of Object.keys(row.after || {})) {
        patch[k] = Object.prototype.hasOwnProperty.call(before, k) ? before[k] : null;
      }
      await S.store.update(row.collection, row.recordId, patch, { projectId: S.projectId, note: 'Undo of assistant action' });
    } else if (row.op === 'remove') {
      await S.store.create(row.collection, row.before || {}, { projectId: S.projectId, note: 'Undo of assistant deletion' });
    }
    await S.store.update('chat_actions', row.id, { undone: true, undoneAt: nowIso() }, { projectId: S.projectId });
    toast('Undone.', 'ok');
    render();
    return { ok: true };
  } catch (e) {
    toast('Could not undo: ' + ((e && e.message) || 'unknown error'), 'err');
    return { ok: false, message: (e && e.message) || 'unknown error' };
  }
}

// ---------------------------------------------------------------------------
// Write plumbing: one path for every collection
// ---------------------------------------------------------------------------

/** Collections the assistant may write, and what it may set on each. */
const WRITABLE = Object.freeze({
  scenarios: ['deviation', 'causes', 'consequences', 'existingSafeguards', 'notes', 'initialLikelihood', 'initialSeverity', 'riskBasis', 'residualLikelihood', 'residualSeverity', 'residualBasisKind', 'residualBasisText', 'reviewerStatus', 'parameter', 'parameterLabel', 'guideword', 'guidewordLabel', 'deviationKind', 'rowNumber', 'nodeId'],
  recommendations: ['text', 'technicalBasis', 'controlLevel', 'priority', 'responsibleDepartment', 'responsiblePerson', 'targetDate', 'effort', 'equipmentTags', 'notes', 'scenarioId', 'nodeId', 'recId'],
  nodes: ['nodeNumber', 'worksheetName', 'designIntent', 'equipmentIds', 'chemicalIds', 'utilities', 'operatingTemperature', 'operatingPressure', 'reviewStatus', 'notes', 'processStepIds'],
  assumptions: ['category', 'text', 'basis', 'raisedBy'],
  data_gaps: ['entityKind', 'field', 'label', 'blocks', 'resolveWith', 'detail', 'status', 'owner', 'targetDate'],
  team_members: ['name', 'designation', 'department', 'organization', 'role', 'discipline', 'serialNumber', 'sortOrder', 'comments'],
  chemicals: ['canonicalName', 'cas', 'synonyms', 'grade', 'physicalState', 'quantity', 'quantityUnit', 'quantityStatus', 'hazardousClassification', 'role', 'notes'],
  chem_properties: ['chemicalId', 'property', 'value', 'valueLow', 'valueHigh', 'unit', 'unitAsWritten', 'condition', 'sourceKind', 'sourceUrl', 'retrievedAt', 'researchNote', 'valueAsWritten', 'notes'],
  equipment: ['tag', 'type', 'capacity', 'materialOfConstruction', 'designPressure', 'designTemperature', 'reliefArrangement', 'agitator', 'heatingSystem', 'coolingSystem', 'notes'],
  process_steps: ['stepNumber', 'label', 'description', 'equipmentIds', 'notes'],
  safeguards: ['text', 'class', 'nodeId', 'scenarioId', 'credited', 'notes'],
  company_profile: ['field', 'value', 'sourceKind', 'authorityKey', 'sourceUrl', 'retrievedAt', 'researchNote', 'notes'],
  research_findings: ['subjectKind', 'subjectId', 'target', 'query', 'rawValue', 'evidenceClass', 'url', 'documentRef', 'retrievedAt', 'note', 'outcome'],
  compliance_tasks: ['title', 'obligationId', 'frequency', 'owner', 'nextDue', 'notes'],
  permit_conditions: ['permitId', 'text', 'conditionRef', 'owner', 'frequency', 'notes'],
  workshop_sessions: ['title', 'heldOn', 'attendees', 'notes', 'nodeIds'],
});

/** Fields no writer may set through a tool, whatever the collection. */
const FORBIDDEN_FIELDS = Object.freeze([
  'status',
  'verifiedBy',
  'verifiedAt',
  'humanStatus',
  'reviewedBy',
  'approvedBy',
  'closedBy',
  'closureEvidence',
  'effectiveStatus',
  'rev',
  'createdBy',
  'projectId',
  'id',
]);

function sanitize(collection, patch) {
  const allowed = WRITABLE[collection];
  if (!allowed) return { ok: false, message: 'Refused: "' + collection + '" is not a collection the assistant may write. Readable, yes; writable, no.' };
  const out = {};
  const dropped = [];
  for (const k of Object.keys(patch || {})) {
    if (FORBIDDEN_FIELDS.indexOf(k) >= 0) {
      dropped.push(k + ' (a status or attestation field)');
      continue;
    }
    if (allowed.indexOf(k) === -1) {
      dropped.push(k + ' (not a writable field of ' + collection + ')');
      continue;
    }
    out[k] = patch[k];
  }
  if (Object.keys(out).length === 0) {
    return { ok: false, message: 'Refused: nothing writable was supplied. Dropped: ' + (dropped.join(', ') || 'everything') + '.' };
  }
  return { ok: true, patch: out, dropped };
}

/** Pending confirmations, when autonomy is "Ask first". */
export const pending = [];

function autonomy() {
  return S.chatAutonomy === 'ACT' ? 'ACT' : 'ASK';
}

/**
 * The single write path. In "Ask first" it queues; in "Act and report" it
 * writes, ledgers and returns what changed. Either way the assistant gets a
 * truthful answer about what happened, which is what keeps it from claiming
 * a change it did not make.
 */
async function doWrite(spec) {
  const p = project();
  if (!p) return 'Refused: no project is open.';
  if (S.readOnly) return 'Refused: this view is read-only, so nothing can be written. Tell the user their share level does not allow edits.';

  if (autonomy() === 'ASK') {
    const id = uid('pend');
    pending.push(Object.assign({ id, at: nowIso() }, spec));
    render();
    return (
      'Queued for the user to confirm: ' +
      spec.summary +
      '. It has NOT been applied. Do not describe it as done; say it is waiting for their confirmation.'
    );
  }
  return applyWrite(spec);
}

/** Execute a queued or immediate write. Returns a sentence for the assistant. */
export async function applyWrite(spec) {
  const p = project();
  if (!p) return 'Refused: no project is open.';
  try {
    if (spec.op === 'create') {
      const rec = await S.store.create(
        spec.collection,
        Object.assign({ projectId: p.id }, spec.patch, spec.systemFields || {}),
        { projectId: p.id, actorKind: 'ai', note: 'Assistant: ' + spec.summary }
      );
      await ledger({
        op: 'create',
        collection: spec.collection,
        recordId: rec.id,
        summary: spec.summary,
        after: spec.patch,
        before: null,
      });
      render();
      return 'Done. Created ' + spec.collection + ' record ' + rec.id + '. ' + spec.summary + '. The user can undo it from the assistant panel.';
    }
    if (spec.op === 'update') {
      const before = await S.store.get(spec.collection, spec.recordId);
      if (!before) return 'Refused: no ' + spec.collection + ' record with id ' + spec.recordId + ' exists.';
      const slimBefore = {};
      for (const k of Object.keys(spec.patch)) slimBefore[k] = before[k] === undefined ? null : before[k];
      await S.store.update(spec.collection, spec.recordId, spec.patch, {
        projectId: p.id,
        actorKind: 'ai',
        field: Object.keys(spec.patch)[0],
        note: 'Assistant: ' + spec.summary,
      });
      await ledger({
        op: 'update',
        collection: spec.collection,
        recordId: spec.recordId,
        summary: spec.summary,
        before: slimBefore,
        after: spec.patch,
      });
      render();
      return 'Done. Updated ' + spec.collection + ' ' + spec.recordId + ': ' + Object.keys(spec.patch).join(', ') + '. The user can undo it.';
    }
    if (spec.op === 'remove') {
      const before = await S.store.get(spec.collection, spec.recordId);
      if (!before) return 'Refused: no ' + spec.collection + ' record with id ' + spec.recordId + ' exists.';
      await S.store.remove(spec.collection, spec.recordId, { projectId: p.id, actorKind: 'ai', note: 'Assistant: ' + spec.summary });
      await ledger({ op: 'remove', collection: spec.collection, recordId: spec.recordId, summary: spec.summary, before, after: null });
      render();
      return 'Done. Deleted ' + spec.collection + ' ' + spec.recordId + '. The user can undo it, which recreates the record.';
    }
    return 'Refused: unknown operation.';
  } catch (e) {
    return 'Failed: ' + ((e && e.message) || 'the store rejected the write') + '. Nothing was changed.';
  }
}

export function clearPending(id) {
  const i = pending.findIndex((x) => x.id === id);
  if (i >= 0) pending.splice(i, 1);
}

// ---------------------------------------------------------------------------
// Lookup helpers shared by the tools
// ---------------------------------------------------------------------------

function findNode(ref) {
  const nodes = nodesSorted();
  const r = String(ref == null ? '' : ref).trim();
  return (
    nodes.find((n) => n.id === r) ||
    nodes.find((n) => String(n.nodeNumber) === r) ||
    nodes.find((n) => String(n.worksheetName || '').toLowerCase() === r.toLowerCase()) ||
    null
  );
}

function findScenario(ref, nodeRef) {
  const rows = scoped('scenarios');
  const r = String(ref == null ? '' : ref).trim().replace(/^#/, '');
  const node = nodeRef ? findNode(nodeRef) : null;
  const pool = node ? rows.filter((s) => s.nodeId === node.id) : rows;
  return pool.find((s) => s.id === r) || pool.find((s) => String(s.rowNumber) === r) || null;
}

function findRec(ref) {
  const rows = scoped('recommendations');
  const r = String(ref == null ? '' : ref).trim();
  return rows.find((x) => x.id === r) || rows.find((x) => String(x.recId || '') === r) || null;
}

function findChemical(ref) {
  const rows = scoped('chemicals');
  const r = String(ref == null ? '' : ref).trim().toLowerCase();
  return (
    rows.find((c) => c.id === ref) ||
    rows.find((c) => String(c.cas || '') === String(ref)) ||
    rows.find((c) => String(c.canonicalName || '').toLowerCase() === r) ||
    rows.find((c) => String(c.canonicalName || '').toLowerCase().indexOf(r) >= 0) ||
    null
  );
}

/** Keep a tool result inside the 32 KB budget without silently truncating. */
function capped(obj, limit) {
  const max = limit || 24000;
  let json = JSON.stringify(obj);
  if (json.length <= max) return obj;
  return { truncated: true, note: 'The result was larger than the budget; ask for a narrower slice (one node, one chemical, one obligation).', preview: json.slice(0, max - 400) };
}

// ---------------------------------------------------------------------------
// The tools
// ---------------------------------------------------------------------------

const obj = (props, required) => ({ type: 'object', properties: props, required: required || [] });
const str = (d) => ({ type: 'string', description: d });
const int = (d) => ({ type: 'integer', description: d });
const strs = (d) => ({ type: 'array', items: { type: 'string' }, description: d });

/**
 * Build the tool list for one chat turn.
 * `mode` is 'read' for a question and 'full' when the assistant may act.
 */
export function buildTools(opts) {
  const options = opts || {};
  const reads = [];
  const writes = [];

  // -------------------------------------------------------------- read tools
  reads.push({
    name: 'get_worksheet',
    description:
      'Read HAZOP worksheet rows with the risk band the application computed for each. Returns causes, consequences, existing safeguards, the initial and residual ratings, and the recommendations raised. Use it before commenting on any row. Narrow by node or the band names.',
    inputSchema: obj({
      node: str('Node number, node name, or node id. Omit for every node.'),
      band: strs('Only rows whose initial band is one of these, e.g. ["INTOLERABLE","SUBSTANTIAL"].'),
      unratedOnly: { type: 'boolean', description: 'Only rows with no initial rating.' },
      limit: int('Most rows to return (default 25).'),
    }),
    kind: 'read',
    execute: (input) => {
      const m = matrix();
      const node = input.node ? findNode(input.node) : null;
      if (input.node && !node) return 'No node matches "' + input.node + '". Nodes: ' + nodesSorted().map((n) => n.nodeNumber + ' ' + (n.worksheetName || '')).join('; ') + '.';
      let rows = scenariosWithRisk();
      if (node) rows = rows.filter((s) => s.nodeId === node.id);
      if (Array.isArray(input.band) && input.band.length) {
        const want = input.band.map((b) => String(b).toUpperCase());
        rows = rows.filter((s) => s.initialRiskResult && s.initialRiskResult.ok && want.indexOf(s.initialRiskResult.bandKey) >= 0);
      }
      if (input.unratedOnly) rows = rows.filter((s) => !(s.initialRiskResult && s.initialRiskResult.ok));
      const limit = Math.max(1, Math.min(60, Number(input.limit) || 25));
      const nodeName = (id) => {
        const n = nodesSorted().find((x) => x.id === id);
        return n ? n.nodeNumber + ' ' + (n.worksheetName || '') : id;
      };
      return capped({
        matrix: m.id + ' v' + m.version,
        total: rows.length,
        shown: Math.min(limit, rows.length),
        rows: rows.slice(0, limit).map((s) => ({
          scenarioId: s.id,
          node: nodeName(s.nodeId),
          row: s.rowNumber,
          deviation: s.deviation,
          causes: (s.causes || []).map((c) => c.text),
          consequences: (s.consequences || []).map((c) => c.text),
          safeguards: (s.existingSafeguards || []).map((c) => c.text),
          initial: s.initialRiskResult && s.initialRiskResult.ok
            ? { l: s.initialLikelihood, s: s.initialSeverity, score: s.initialRiskResult.score, band: s.initialRiskResult.bandLabel, computedBy: 'application' }
            : 'not rated',
          residual: s.residualRiskResult && s.residualRiskResult.ok
            ? { l: s.residualLikelihood, s: s.residualSeverity, score: s.residualRiskResult.score, band: s.residualRiskResult.bandLabel, basis: s.residualBasisKind || null, computedBy: 'application' }
            : 'not rated',
          recommendations: scoped('recommendations').filter((r) => r.scenarioId === s.id).map((r) => recRef(r) + ': ' + truncate(r.text, 140)),
          reviewerStatus: s.reviewerStatus,
        })),
      });
    },
  });

  reads.push({
    name: 'get_risk',
    description:
      'Ask the application for a risk band. Give likelihood and severity and it returns the score, the band and the action the matrix requires. NEVER work a risk score out yourself — this tool is the only correct answer, because the project may not use a multiplicative matrix.',
    inputSchema: obj({ likelihood: int('Likelihood rating.'), severity: int('Severity rating.') }, ['likelihood', 'severity']),
    kind: 'read',
    execute: (input) => {
      const m = matrix();
      const r = tryRiskFromLS(m, input.likelihood, input.severity);
      if (!r.ok) return { ok: false, reason: r.reason, message: 'The application cannot rate that: ' + String(r.reason || '').toLowerCase().replace(/_/g, ' ') + '.' };
      return { matrix: m.id + ' v' + m.version, likelihood: Number(input.likelihood), severity: Number(input.severity), score: r.score, band: r.bandLabel, bandKey: r.bandKey, action: r.action, computedBy: 'application' };
    },
  });

  reads.push({
    name: 'get_coverage',
    description:
      'What the guideword engine says a node should have examined, and which of those deviations have no worksheet row. Also the cause families the node has not considered. This is the missing-deviation finder — use it when asked what the study has missed.',
    inputSchema: obj({ node: str('Node number, name or id. Omit for every node.') }),
    kind: 'read',
    execute: (input) => {
      const ctx = { equipment: scoped('equipment'), chemicals: chemicalsResolved(), chemProperties: scoped('chem_properties') };
      const nodes = input.node ? [findNode(input.node)].filter(Boolean) : nodesSorted();
      if (input.node && nodes.length === 0) return 'No node matches "' + input.node + '".';
      return capped({
        nodes: nodes.map((n) => {
          const rows = scoped('scenarios').filter((s) => s.nodeId === n.id);
          const gen = generateDeviations(n, ctx);
          const cov = deviationCoverage(n, ctx, rows);
          const fam = causeFamilyCoverage(deriveNodeFacts(n, ctx), rows);
          return {
            node: n.nodeNumber + ' ' + (n.worksheetName || ''),
            designIntent: truncate(n.designIntent || '', 260),
            meaningfulDeviations: gen.combinations.length,
            rowsWritten: rows.length,
            coveredPercent: cov ? cov.percent : null,
            uncovered: (cov && cov.uncovered ? cov.uncovered : []).map((c) => c.deviation).slice(0, 24),
            suppressed: (gen.suppressed || []).slice(0, 10).map((x) => x.deviation + ' — ' + x.reason),
            causeFamiliesMissing: (fam && fam.labels) || [],
            computedBy: 'application',
          };
        }),
      });
    },
  });

  reads.push({
    name: 'get_chemicals',
    description:
      'The chemical inventory with each substance\'s recorded properties, the status of each value, and the hazard alerts and data gaps the chemical engine produced. Use it before any statement about a chemical.',
    inputSchema: obj({ chemical: str('Name, CAS or id. Omit for all.'), missingOnly: { type: 'boolean', description: 'Only the properties that are missing.' } }),
    kind: 'read',
    execute: (input) => {
      const al = alerts();
      const chems = input.chemical ? [findChemical(input.chemical)].filter(Boolean) : chemicalsResolved();
      if (input.chemical && chems.length === 0) return 'No chemical matches "' + input.chemical + '". On the project: ' + chemicalsResolved().map((c) => c.canonicalName).join(', ') + '.';
      return capped({
        chemicals: chems.map((c) => {
          const props = scoped('chem_properties').filter((x) => x.chemicalId === c.id);
          const have = new Set(props.map((x) => x.property || x.key));
          const missing = ALL_PROPERTIES.filter((pm) => !have.has(pm.key)).map((pm) => ({ key: pm.key, label: pm.label, critical: !!pm.critical }));
          return {
            id: c.id,
            name: c.canonicalName,
            cas: c.cas,
            casValid: c.casValid,
            grade: c.grade || null,
            state: c.physicalState,
            quantity: c.quantity == null ? 'NOT RECORDED' : String(c.quantity) + ' ' + (c.quantityUnit || ''),
            quantityStatus: c.quantityStatus,
            classification: c.hazardousClassification || 'not recorded',
            properties: input.missingOnly ? undefined : props.map((x) => ({ key: x.property || x.key, value: x.value, unit: x.unit, status: x.status, source: x.sourceKind || null, url: x.sourceUrl || null })),
            missingProperties: missing.filter((mm) => (input.missingOnly ? true : mm.critical)),
          };
        }),
        hazardAlerts: al.alerts.slice(0, 10).map((a) => ({ rule: a.rule, severity: a.severity, title: a.title, fact: a.chain.fact, source: a.chain.source, mechanism: a.chain.mechanism, node: a.chain.node, arithmetic: a.arithmetic || null, computedBy: 'application' })),
        dataGaps: al.gaps.slice(0, 14).map((g) => ({ chemical: g.chemicalName, property: g.propertyLabel, blocks: g.blocks })),
      });
    },
  });

  reads.push({
    name: 'get_legal',
    description:
      'The compliance register: which obligations the application treats as applicable and why, the threshold arithmetic it has shown, the unanswered jurisdiction questions, and permit expiry. Say for each part whether it is a source fact, the application\'s analysis, or an open question.',
    inputSchema: obj({ topic: str('Free text to filter the instrument or obligation, e.g. "MSIHC", "factory licence".'), limit: int('Most records (default 18).') }),
    kind: 'read',
    execute: (input) => {
      const run = applicability();
      let reg = complianceRegister();
      if (input.topic) {
        const q = String(input.topic).toLowerCase();
        reg = reg.filter((r) => (String(r.instrumentTitle || '') + ' ' + String(r.topic || '') + ' ' + String(r.sectionRuleSchedule || '')).toLowerCase().indexOf(q) >= 0);
      }
      const limit = Math.max(1, Math.min(40, Number(input.limit) || 18));
      return capped({
        counts: complianceCounts(),
        openQuestions: run ? run.pendingQuestions.map((q) => ({ question: q.question, fact: q.fact, gatesObligations: q.obligationCount })) : [],
        records: reg.slice(0, limit).map((r) => ({
          instrument: r.instrumentTitle,
          section: r.sectionRuleSchedule,
          obligation: r.topic,
          applicability: r.effectiveStatus,
          setBy: r.humanStatus ? 'reviewer' : r.setBy,
          reason: r.humanReason || r.applicabilityReason,
          missingFacts: r.missingFacts,
          evidenceExpected: r.evidenceExpected,
          thresholdConclusion: r.thresholdEvaluation ? r.thresholdEvaluation.conclusion : null,
          thresholdArithmetic: r.thresholdEvaluation ? (r.thresholdEvaluation.results || []).map((x) => x.chemicalName + ': ' + (x.arithmetic || x.detail)).slice(0, 4) : null,
          officialSource: ((r.sourceRefs || [])[0] || {}).url || null,
          sourceStatus: ((r.sourceRefs || [])[0] || {}).sourceStatus || null,
        })),
        permits: permitStatuses().map((x) => ({ type: x.permitType, number: x.number, expiry: x.expiryDate, status: x.expiry.status, daysRemaining: x.expiry.daysRemaining, computedBy: 'application' })),
      });
    },
  });

  reads.push({
    name: 'get_doability',
    description:
      'Rank the open recommendations by how practicable they are and by the risk they remove per unit of effort, and return the before-and-after risk picture for a chosen selection. `mode` picks the cut: DO_NOW, THIS_QUARTER, NEXT_SHUTDOWN, ALL_PRACTICABLE, or TOP_N with n. Use this for "what should we do first".',
    inputSchema: obj({
      mode: str('DO_NOW | THIS_QUARTER | NEXT_SHUTDOWN | ALL_PRACTICABLE | TOP_N'),
      n: int('With TOP_N, how many.'),
    }),
    kind: 'read',
    execute: (input) => {
      const m = matrix();
      const recs = scoped('recommendations');
      const scen = scoped('scenarios');
      const ranking = rankRecommendations({ recommendations: recs, matrix: m, scenarios: scen, partial: true });
      const selection = selectDoable({ ranking, mode: input.mode || 'THIS_QUARTER', n: input.n, matrix: m, scenarios: scen });
      const plan = migrationPlan({ matrix: m, scenarios: scen, selection });
      return capped({
        counts: ranking.counts,
        bestValue: ranking.byValue.slice(0, 10).map((x) => ({
          rec: recRef(x.recommendation),
          text: truncate(x.recommendation.text, 130),
          doabilityScore: x.doability.score,
          band: x.doability.bandLabel,
          effortCoverage: x.doability.coverage + '% of effort fields declared',
          riskRemoved: x.benefit.measured ? x.benefit.riskDelta : 'not quantified',
          intolerableRemoved: x.benefit.intolerableRemoved,
          harderBecause: x.doability.drivers.filter((d) => d.direction === 'harder').map((d) => d.label + ': ' + d.option),
        })),
        undeclared: ranking.undecidable.slice(0, 10).map((u) => ({ rec: recRef(u.recommendation), missing: u.missing.map((mm) => mm.label) })),
        selection: selection.counts,
        selectionNote: selection.note,
        before: plan.bandCounts.before,
        after: plan.bandCounts.after,
        needingAction: plan.intolerable,
        movedRows: plan.moved,
        stationaryRows: plan.stationary,
        rowsWithoutResidualRating: plan.points.filter((pt) => !pt.after).length,
        computedBy: 'application',
      });
    },
  });

  reads.push({
    name: 'get_gate',
    description: 'What is blocking the report. Returns each failing quality-gate check with the fix and the view to fix it in, plus the data-completeness figures.',
    kind: 'read',
    execute: () => {
      const g = qualityGate();
      const c = completeness();
      if (!g) return 'The quality gate has not run — no project is open.';
      return capped({
        status: g.status,
        blocking: g.blocking.filter((k) => !k.pass).map((k) => ({ check: k.label, detail: k.detail, fix: k.fixHint, view: k.route })),
        advisory: g.advisory.filter((k) => !k.pass).map((k) => ({ check: k.label, detail: k.detail })),
        completeness: { data: c.data.percent, critical: c.critical.percent, missingCritical: c.critical.missing.slice(0, 16).map((x) => x.label) },
        openDataGaps: dataGapsAll().filter((x) => x.status !== 'RESOLVED').length,
        computedBy: 'application',
      });
    },
  });

  reads.push({
    name: 'get_research_plan',
    description:
      'Where a missing value should come from. Give a chemical and a property, or a company field, and it returns the authorities to consult in order, with their URLs and what each one proves. Use it instead of recalling a figure: a value you remember cannot be cited.',
    inputSchema: obj({
      subject: str('"chemical" or "company".'),
      chemical: str('For a chemical: name, CAS or id.'),
      property: str('For a chemical: the property key, e.g. flashPoint, dustKst.'),
      field: str('For a company: the field key, e.g. workerCount, consentToOperate.'),
    }, ['subject']),
    kind: 'read',
    execute: (input) => {
      const p = project();
      if (String(input.subject) === 'company') {
        const prof = {};
        for (const row of scoped('company_profile')) prof[row.field] = row.value;
        const plan = companyQueryPlan({
          company: {
            legalName: prof.legalName || (p && p.clientName) || '',
            tradeName: prof.tradeName || (p && p.clientName) || '',
            state: prof.state || ((p && p.jurisdiction) || {}).state || null,
            district: prof.district || null,
            estate: prof.estate || null,
          },
          field: input.field,
        });
        return capped(Object.assign({ knownFields: Object.keys(prof) }, plan));
      }
      const chem = findChemical(input.chemical);
      if (!chem) return 'No chemical matches "' + input.chemical + '".';
      const meta = propertyMeta(input.property);
      if (!meta) return 'Unknown property "' + input.property + '". Valid keys: ' + ALL_PROPERTIES.slice(0, 40).map((x) => x.key).join(', ') + '.';
      return capped(chemicalQueryPlan({ chemical: chem, property: meta }));
    },
  });

  reads.push({
    name: 'get_reference',
    description: 'The application\'s own vocabularies: control levels, cause and consequence families, safeguard classes, residual-basis kinds, effort fields with their options, and the writable collections and fields. Read this before proposing a value for one of those fields.',
    kind: 'read',
    execute: () => ({
      controlLevels: CONTROL_LEVELS,
      causeFamilies: CAUSE_FAMILIES.map((f) => ({ key: f.key, label: f.label })),
      consequenceFamilies: CONSEQUENCE_FAMILIES.map((f) => ({ key: f.key, label: f.label })),
      safeguardClasses: SAFEGUARD_CLASSES.map((f) => ({ key: f.key, label: f.label })),
      residualBasisKinds: RESIDUAL_BASIS_KINDS,
      effortFields: EFFORT_FIELDS.map((f) => ({ key: f.key, label: f.label, question: f.question, options: f.options.map((o) => ({ value: o.value, label: o.label })) })),
      propertyGroups: PROPERTY_GROUPS.map((g) => ({ key: g.key, label: g.label, properties: g.properties.map((x) => ({ key: x.key, label: x.label, type: x.type, unit: x.unit || null })) })),
      companyFields: Object.keys(COMPANY_FIELD_LABELS),
      writableCollections: Object.keys(WRITABLE),
      humanOnly: HUMAN_ONLY,
    }),
  });

  if (options.mode === 'read') return reads;

  // ------------------------------------------------------------- write tools
  writes.push({
    name: 'create_record',
    description:
      'Create a record. `collection` must be one from get_reference.writableCollections and `fields` only its writable fields — a status or attestation field is refused. Returns what happened: either "Done" with the new id, or "Queued" when the user has asked to confirm changes first. Never say a change is made unless the result says Done.',
    inputSchema: obj({
      collection: str('e.g. recommendations, assumptions, data_gaps, chem_properties.'),
      fields: { type: 'object', description: 'The field values. Use ids from the read tools for any reference.' },
      summary: str('One line for the user describing the change and why.'),
    }, ['collection', 'fields', 'summary']),
    kind: 'write',
    execute: async (input) => {
      const clean = sanitize(String(input.collection), input.fields);
      if (!clean.ok) return clean.message;
      const sys = {};
      if (input.collection === 'recommendations') {
        sys.status = 'OPEN';
        sys.closureEvidenceRequired = true;
        if (!clean.patch.recId) sys.recId = 'R-' + String(scoped('recommendations').length + 1).padStart(3, '0');
      }
      if (input.collection === 'data_gaps') sys.status = 'OPEN';
      if (input.collection === 'chem_properties' || input.collection === 'company_profile') {
        // A value the assistant supplies from its own memory is inferred, and
        // the engines do not use inferred values. That is deliberate.
        sys.status = clean.patch.sourceUrl ? 'WEB_SOURCED' : 'AI_INFERRED';
      }
      if (input.collection === 'scenarios') sys.reviewerStatus = 'DRAFT';
      if (input.collection === 'team_members') sys.status = 'AI_INFERRED';
      return doWrite({
        op: 'create',
        collection: String(input.collection),
        patch: clean.patch,
        systemFields: sys,
        summary: String(input.summary).slice(0, 220),
        dropped: clean.dropped,
      });
    },
  });

  writes.push({
    name: 'update_record',
    description:
      'Change fields on an existing record. Give the collection, the record id from a read tool, and only writable fields. Every update is reversible from the assistant panel.',
    inputSchema: obj({
      collection: str('The collection the record is in.'),
      id: str('The record id, exactly as a read tool gave it.'),
      fields: { type: 'object', description: 'The fields to change.' },
      summary: str('One line for the user.'),
    }, ['collection', 'id', 'fields', 'summary']),
    kind: 'write',
    execute: async (input) => {
      const clean = sanitize(String(input.collection), input.fields);
      if (!clean.ok) return clean.message;
      // A residual rating has to pass the same validator a human's does.
      if (input.collection === 'scenarios' && (clean.patch.residualLikelihood !== undefined || clean.patch.residualSeverity !== undefined)) {
        const sc = await S.store.get('scenarios', String(input.id));
        if (!sc) return 'Refused: no scenario with id ' + input.id + '.';
        const merged = Object.assign({}, sc, clean.patch);
        const v = validateResidual({
          matrix: matrix(),
          initial: { likelihood: merged.initialLikelihood, severity: merged.initialSeverity },
          residual: { likelihood: merged.residualLikelihood, severity: merged.residualSeverity },
          basis: { kind: merged.residualBasisKind, text: merged.residualBasisText },
        });
        if (!v.ok) {
          return 'Refused by the residual-rating validator: ' + v.reason + (v.detail ? ' — ' + v.detail : '') + ' Set residualBasisKind and residualBasisText in the same call, and remember an administrative basis cannot reduce severity.';
        }
      }
      return doWrite({
        op: 'update',
        collection: String(input.collection),
        recordId: String(input.id),
        patch: clean.patch,
        summary: String(input.summary).slice(0, 220),
        dropped: clean.dropped,
      });
    },
  });

  writes.push({
    name: 'delete_record',
    description: 'Delete a record. Use it only for something you or the user created in this conversation by mistake, and say why in the summary. Undo recreates it.',
    inputSchema: obj({ collection: str('The collection.'), id: str('The record id.'), summary: str('Why it is being deleted.') }, ['collection', 'id', 'summary']),
    kind: 'write',
    execute: async (input) => {
      if (!WRITABLE[String(input.collection)]) return 'Refused: "' + input.collection + '" is not a collection the assistant may write.';
      return doWrite({ op: 'remove', collection: String(input.collection), recordId: String(input.id), summary: String(input.summary).slice(0, 220) });
    },
  });

  writes.push({
    name: 'set_effort',
    description:
      'Declare the effort fields on a recommendation so the doability engine can score it. Values come from get_reference.effortFields. Only declare what you actually know from the project or what the user told you — a guess here produces a wrong priority order.',
    inputSchema: obj({
      rec: str('The recommendation id or its R-number.'),
      effort: { type: 'object', description: 'Any of costBand, leadTime, outage, engineering, competency, approval, spaceAccess.' },
      summary: str('One line, including where each value came from.'),
    }, ['rec', 'effort', 'summary']),
    kind: 'write',
    execute: async (input) => {
      const rec = findRec(input.rec);
      if (!rec) return 'No recommendation matches "' + input.rec + '".';
      const eff = Object.assign({}, rec.effort || {});
      const bad = [];
      for (const f of EFFORT_FIELDS) {
        const v = (input.effort || {})[f.key];
        if (v === undefined || v === null || v === '') continue;
        if (!f.options.some((o) => o.value === v)) {
          bad.push(f.key + '="' + v + '" (allowed: ' + f.options.map((o) => o.value).join(', ') + ')');
          continue;
        }
        eff[f.key] = v;
      }
      if (bad.length) return 'Refused: ' + bad.join('; ') + '.';
      const scored = doability({ effort: eff }, { partial: true });
      return doWrite({
        op: 'update',
        collection: 'recommendations',
        recordId: rec.id,
        patch: { effort: eff },
        summary: String(input.summary).slice(0, 220) + ' (doability now ' + (scored.ok ? scored.score + '/100, ' + scored.bandLabel : 'still unscored') + ')',
      });
    },
  });

  writes.push({
    name: 'open_view',
    description: 'Take the user to a view so they can see what you are talking about. Views: dashboard, projects, documents, process, chemicals, nodes, hazop, risk, recommendations, research, team, legal, sources, reports, settings.',
    inputSchema: obj({ view: str('The view name.'), params: { type: 'object', description: 'Optional route parameters, e.g. {"nodeId":"..."}.' } }, ['view']),
    kind: 'write',
    execute: (input) => {
      const view = String(input.view || '').toLowerCase();
      const known = ['dashboard', 'projects', 'documents', 'process', 'chemicals', 'nodes', 'hazop', 'risk', 'recommendations', 'research', 'team', 'legal', 'sources', 'reports', 'settings'];
      if (known.indexOf(view) === -1) return 'Unknown view "' + input.view + '". One of: ' + known.join(', ') + '.';
      go(view, input.params || {});
      return 'Opened the ' + view + ' view for the user.';
    },
  });

  // -------------------------------------------- the five refusals, as tools
  // Declared so the assistant learns the boundary from the tool list rather
  // than by having a write silently dropped.
  writes.push({
    name: 'request_human_attestation',
    description:
      'Call this when the right next step is an act only a person may perform: marking a field VERIFIED, marking compliance evidence verified, closing a recommendation, approving a report, or entering a statutory threshold as verified. It records nothing and tells you who has to do it, so you can ask them plainly.',
    inputSchema: obj({ act: str('VERIFY_FIELD | VERIFY_EVIDENCE | CLOSE_RECOMMENDATION | APPROVE_REPORT | VERIFY_THRESHOLD'), what: str('What specifically needs attesting.') }, ['act']),
    kind: 'read',
    execute: (input) => {
      const e = HUMAN_ONLY.find((x) => x.key === String(input.act).toUpperCase());
      if (!e) return 'Unknown act. One of: ' + HUMAN_ONLY.map((x) => x.key).join(', ') + '.';
      return {
        refused: true,
        act: e.act,
        whoMustDoIt: e.who,
        what: input.what || null,
        sayToUser:
          e.act +
          ' has to be done by ' +
          e.who +
          '. Nothing has been recorded. Tell them exactly what to attest and where in the app to do it.',
      };
    },
  });

  return reads.concat(writes);
}

/** Wrap the tools with the logging and abort handling every call needs. */
export function instrumentedTools(opts) {
  const list = buildTools(opts);
  const log = (opts && opts.log) || null;
  return list.map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: t.inputSchema,
    execute: async (input, ctx) => {
      const started = Date.now();
      try {
        const out = await t.execute(input || {}, ctx);
        if (log) log({ tool: t.name, kind: t.kind, ms: Date.now() - started, input, ok: true });
        return out;
      } catch (e) {
        if (log) log({ tool: t.name, kind: t.kind, ms: Date.now() - started, input, ok: false, error: (e && e.message) || String(e) });
        throw e;
      }
    },
  }));
}

export { refuseSignature };
