// app/state.js — application state, selectors and derived values.
// Derived values are pure functions of stored data, recomputed on render, so
// they cannot drift from what the store holds.

import { COLLECTIONS } from './store.js';
import { DEFAULT_MATRIX } from '../packages/calculations/risk.js';
import { dataCompleteness, criticalCompleteness, reportReadiness } from '../packages/calculations/completeness.js';
import { runApplicability, linkObligationToNodes } from '../packages/legal/applicability.js';
import { runProjectAlerts } from '../packages/chemical/alerts.js';
import { runQualityGate } from '../packages/reports/quality-gate.js';
import { deduplicateRecommendations } from '../packages/calculations/dedup.js';
import { expiryStatus, nextDue, urgencyKey } from '../packages/calculations/dates.js';
import { LEGAL_THRESHOLD_SETS, LEGAL_INSTRUMENTS, LEGAL_OBLIGATIONS } from '../packages/legal/library.js';
import { resolveChemical } from '../packages/chemical/properties.js';
import { riskFromLS } from '../packages/calculations/risk.js';

export const S = {
  store: null,
  ready: false,
  storeKind: 'memory',
  storeMessage: '',
  readOnly: false,
  actor: { id: 'local', name: 'You', role: 'admin', level: 'owner' },
  view: 'dashboard',
  projectId: null,
  chatOpen: false,
  chat: [],
  chatBusy: false,
  nodeTab: 'worksheet',
  filters: {},
  selection: {},
  data: {},
  derivedCache: {},
};

for (const c of COLLECTIONS) S.data[c] = [];

let renderFn = null;
export function setRenderer(fn) {
  renderFn = fn;
}

let renderQueued = false;
let renderSuspended = 0;
let renderMissed = false;

/**
 * Suspend painting during a bulk write. A seed or an import performs hundreds
 * of writes; repainting between each one is pure waste and, on the shared
 * store, makes the operation feel broken. Nested calls are counted, and one
 * paint runs when the last one releases.
 */
export function suspendRender(on) {
  if (on) {
    renderSuspended += 1;
    return;
  }
  renderSuspended = Math.max(0, renderSuspended - 1);
  if (renderSuspended === 0 && renderMissed) {
    renderMissed = false;
    render();
  }
}

export function render() {
  if (renderSuspended > 0) {
    renderMissed = true;
    return;
  }
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(() => {
    renderQueued = false;
    S.derivedCache = {};
    if (renderFn) renderFn();
  });
}

export async function attachStore(store, info) {
  S.store = store;
  S.storeKind = info.kind;
  S.storeMessage = info.message;
  S.readOnly = !!store.readOnly;
  for (const c of COLLECTIONS) {
    store.subscribe(c, (rows) => {
      S.data[c] = rows;
      render();
    });
  }
  S.ready = true;
}

// ------------------------------------------------------------- selectors

export function rows(collection) {
  return S.data[collection] || [];
}

export function scoped(collection) {
  const pid = S.projectId;
  if (!pid) return [];
  return rows(collection).filter((r) => r.projectId === pid);
}

export function project() {
  return rows('projects').filter((p) => p.id === S.projectId)[0] || null;
}

export function allProjects() {
  return rows('projects').slice().sort((a, b) => String(a.projectName || '').localeCompare(String(b.projectName || '')));
}

export function matrix() {
  const p = project();
  if (p && p.riskMatrixId) {
    const m = rows('risk_matrices').filter((x) => x.id === p.riskMatrixId)[0];
    if (m) return m;
  }
  const projectMatrix = scoped('risk_matrices')[0];
  return projectMatrix || DEFAULT_MATRIX;
}

export function nodesSorted() {
  return scoped('nodes').slice().sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0) || String(a.nodeNumber).localeCompare(String(b.nodeNumber)));
}

export function scenariosFor(nodeId) {
  return scoped('scenarios')
    .filter((s) => s.nodeId === nodeId)
    .sort((a, b) => (a.rowNumber || 0) - (b.rowNumber || 0));
}

export function nodeById(id) {
  return scoped('nodes').filter((n) => n.id === id)[0] || null;
}

export function chemById(id) {
  return scoped('chemicals').filter((c) => c.id === id)[0] || null;
}

export function equipById(id) {
  return scoped('equipment').filter((e) => e.id === id)[0] || null;
}

export function propsFor(chemicalId) {
  return scoped('chem_properties').filter((p) => p.chemicalId === chemicalId);
}

export function thresholdSets() {
  // The shipped sets, with any user-entered entries merged in.
  const userEntries = scoped('legal_thresholds');
  return LEGAL_THRESHOLD_SETS.map((set) => {
    const entries = userEntries.filter((e) => e.setKey === set.id);
    return Object.assign({}, set, {
      entries,
      status: entries.some((e) => e.status === 'VERIFIED' || e.status === 'USER_CONFIRMED') ? 'PARTIALLY_VERIFIED' : set.status,
    });
  });
}

// --------------------------------------------------------------- derived

function memo(key, fn) {
  if (!Object.prototype.hasOwnProperty.call(S.derivedCache, key)) S.derivedCache[key] = fn();
  return S.derivedCache[key];
}

/** Chemicals with identity resolution and property lookups attached. */
export function chemicalsResolved() {
  return memo('chemicalsResolved', () => {
    const list = scoped('chemicals');
    return list.map((c) => {
      const res = resolveChemical({ name: c.canonicalName, cas: c.cas, synonyms: c.synonyms }, list.filter((x) => x.id !== c.id));
      const density = propsFor(c.id).filter((p) => p.key === 'density')[0];
      return Object.assign({}, c, {
        identityResolution: c.cas || c.canonicalName ? { matchKind: c.identityStatus === 'USER_CONFIRMED' ? 'EXACT_NAME' : res.matchKind, casValid: c.casValid !== undefined ? c.casValid : res.casValid } : { matchKind: 'UNRESOLVED' },
        density: density ? Number(density.value) : undefined,
        densityUnit: density ? density.unit || 'kg/L' : undefined,
        densityStatus: density ? density.status : undefined,
      });
    });
  });
}

export function completeness() {
  return memo('completeness', () => {
    const p = project();
    if (!p) return { data: { percent: 0, missing: [] }, critical: { percent: 0, missing: [], checks: [], byGroup: [] } };
    return {
      data: dataCompleteness(p),
      critical: criticalCompleteness({
        project: p,
        chemicals: chemicalsResolved(),
        chemProperties: scoped('chem_properties'),
        equipment: scoped('equipment'),
        nodes: scoped('nodes'),
        matrix: matrix(),
      }),
    };
  });
}

export function applicability() {
  return memo('applicability', () => {
    const p = project();
    if (!p) return null;
    return runApplicability({
      project: p,
      chemicals: chemicalsResolved(),
      chemProperties: scoped('chem_properties'),
      equipment: scoped('equipment'),
      thresholdSets: thresholdSets(),
      criticalFactsVerified: false,
    });
  });
}

/**
 * Merge the engine's live evaluation with any stored human decision.
 * A human decision wins on the status; the engine's reasoning is kept
 * alongside it so the register can show both.
 */
export function complianceRegister() {
  return memo('complianceRegister', () => {
    const run = applicability();
    if (!run) return [];
    const stored = scoped('compliance');
    const byObligation = new Map();
    for (const s of stored) byObligation.set(s.obligationId, s);

    const out = run.records.map((rec) => {
      const s = byObligation.get(rec.obligationId);
      const permit = s && s.permitId ? scoped('permits').filter((x) => x.id === s.permitId)[0] : null;
      const evidence = scoped('compliance_evidence').filter((e) => e.obligationId === rec.obligationId);
      const merged = Object.assign({}, rec, {
        storedId: s ? s.id : null,
        humanStatus: s ? s.applicabilityStatus : null,
        humanReason: s ? s.humanReason : null,
        reviewedBy: s ? s.reviewedBy : null,
        reviewedAt: s ? s.reviewedAt : null,
        owner: s ? s.owner : null,
        dueDate: s ? s.dueDate : null,
        permitId: s ? s.permitId : null,
        permit,
        evidence,
        complianceStatus: s ? s.complianceStatus : null,
        gapDescription: s ? s.gapDescription : null,
      });
      merged.effectiveStatus = merged.humanStatus || merged.applicabilityStatus;
      return merged;
    });
    return out;
  });
}

export function complianceCounts() {
  return memo('complianceCounts', () => {
    const reg = complianceRegister();
    const c = { APPLICABLE_CONFIRMED: 0, POTENTIALLY_APPLICABLE: 0, NOT_APPLICABLE_CONFIRMED: 0, NOT_ENOUGH_DATA: 0, REQUIRES_LEGAL_REVIEW: 0 };
    for (const r of reg) if (Object.prototype.hasOwnProperty.call(c, r.effectiveStatus)) c[r.effectiveStatus] += 1;
    const evidenceGaps = reg.filter((r) => (r.effectiveStatus === 'APPLICABLE_CONFIRMED' || r.effectiveStatus === 'POTENTIALLY_APPLICABLE') && (!r.evidence || r.evidence.length === 0)).length;
    return Object.assign(c, { evidenceGaps, total: reg.length });
  });
}

export function alerts() {
  return memo('alerts', () => {
    const p = project();
    if (!p) return { alerts: [], gaps: [] };
    return runProjectAlerts({
      nodes: scoped('nodes'),
      equipment: scoped('equipment'),
      chemicals: chemicalsResolved(),
      chemProperties: scoped('chem_properties'),
      safeguards: scoped('safeguards'),
    });
  });
}

export function permitStatuses() {
  return memo('permitStatuses', () => {
    const today = new Date().toISOString().slice(0, 10);
    return scoped('permits')
      .map((p) => Object.assign({}, p, { expiry: expiryStatus({ expiryDate: p.expiryDate, renewalDate: p.renewalDate, today, noticeDays: p.noticeDays, revoked: p.revoked }) }))
      .sort((a, b) => urgencyKey(a.expiry.status, a.expiry.daysRemaining) - urgencyKey(b.expiry.status, b.expiry.daysRemaining));
  });
}

export function taskStatuses() {
  return memo('taskStatuses', () => {
    const today = new Date().toISOString().slice(0, 10);
    return scoped('compliance_tasks')
      .map((t) => Object.assign({}, t, { due: nextDue({ frequency: t.frequency, lastCompleted: t.lastCompleted, startFrom: t.anchorDate, today, noticeDays: 30 }) }))
      .sort((a, b) => urgencyKey(a.due.status, a.due.daysRemaining) - urgencyKey(b.due.status, b.due.daysRemaining));
  });
}

/** The node-wise recommendation register, deduplicated with backlinks kept. */
export function recommendationRegister() {
  return memo('recommendationRegister', () => {
    const recs = scoped('recommendations');
    const withContext = recs.map((r) => {
      const sc = r.scenarioId ? scoped('scenarios').filter((s) => s.id === r.scenarioId)[0] : null;
      const node = r.nodeId ? nodeById(r.nodeId) : sc ? nodeById(sc.nodeId) : null;
      return Object.assign({}, r, {
        scenario: sc,
        node,
        nodeNumber: node ? node.nodeNumber : null,
        equipmentTags: r.equipmentTags && r.equipmentTags.length ? r.equipmentTags : node ? (node.equipmentIds || []).map((id) => (equipById(id) || {}).tag).filter(Boolean) : [],
      });
    });
    const out = deduplicateRecommendations(withContext);
    const byNode = new Map();
    for (const r of out.kept) {
      const key = r.nodeNumber || 'Unassigned';
      if (!byNode.has(key)) byNode.set(key, []);
      byNode.get(key).push(r);
    }
    return { kept: out.kept, merges: out.merges, byNode, all: withContext };
  });
}

export function qualityGate() {
  return memo('qualityGate', () => {
    const p = project();
    if (!p) return null;
    return runQualityGate({
      project: p,
      matrix: matrix(),
      documents: scoped('documents'),
      chemicals: chemicalsResolved(),
      chemProperties: scoped('chem_properties'),
      equipment: scoped('equipment'),
      nodes: scoped('nodes'),
      scenarios: scenariosWithRisk(),
      recommendations: recommendationRegister().kept,
      team: scoped('team_members'),
      compliance: complianceRegister(),
      permits: permitStatuses().map((x) => Object.assign({}, x, { expiryStatus: x.expiry.status })),
      sources: scoped('sources'),
      assumptions: scoped('assumptions'),
      dataGaps: dataGapsAll(),
      conflicts: scoped('field_conflicts'),
      today: new Date().toISOString().slice(0, 10),
    });
  });
}

export function reportReady() {
  const g = qualityGate();
  return g ? reportReadiness(g) : { percent: 0, pass: 0, total: 0 };
}

/** Scenarios with their risk results computed against the current matrix. */
export function scenariosWithRisk() {
  return memo('scenariosWithRisk', () => {
    const m = matrix();
    return scoped('scenarios').map((s) => {
      let initial = null;
      let residual = null;
      try {
        initial = riskFromLS(m, s.initialLikelihood, s.initialSeverity);
      } catch (e) {
        initial = { ok: false, reason: 'OFF_SCALE', bandKey: null };
      }
      try {
        residual = riskFromLS(m, s.residualLikelihood, s.residualSeverity);
      } catch (e) {
        residual = { ok: false, reason: 'OFF_SCALE', bandKey: null };
      }
      return Object.assign({}, s, { initialRiskResult: initial, residualRiskResult: residual });
    });
  });
}

export function dataGapsAll() {
  return memo('dataGapsAll', () => {
    const stored = scoped('data_gaps');
    const fromAlerts = alerts().gaps.map((g) => ({
      id: 'gap-' + (g.chemicalId || 'x') + '-' + g.property,
      projectId: S.projectId,
      entityKind: 'chemical',
      entityId: g.chemicalId,
      field: g.property,
      label: g.propertyLabel,
      chemicalName: g.chemicalName,
      blocks: g.blocks,
      resolveWith: g.resolveWith,
      nodeIds: g.nodeIds || [g.nodeId],
      detail: g.detail,
      status: 'OPEN',
      derived: true,
    }));
    const fromCritical = completeness().critical.missing.map((m) => ({
      id: 'gap-crit-' + m.id,
      projectId: S.projectId,
      entityKind: 'project',
      field: m.id,
      label: m.label,
      blocks: ['CRITICAL_COMPLETENESS'],
      detail: m.fixHint,
      status: 'OPEN',
      derived: true,
      group: m.group,
    }));
    return stored.concat(fromAlerts, fromCritical);
  });
}

/** Per-node legal links: stored links plus links the engine derives now. */
export function legalLinksForNode(nodeId) {
  const reg = complianceRegister();
  const nodes = scoped('nodes');
  const stored = scoped('legal_node_links').filter((l) => l.nodeId === nodeId);
  const out = [];
  for (const rec of reg) {
    if (rec.effectiveStatus === 'NOT_APPLICABLE_CONFIRMED') continue;
    const links = linkObligationToNodes({
      record: rec,
      nodes,
      chemicals: chemicalsResolved(),
      equipment: scoped('equipment'),
      permitConditions: scoped('permit_conditions').map((c) => Object.assign({}, c, { permitLabel: (scoped('permits').filter((p) => p.id === c.permitId)[0] || {}).label })),
    });
    for (const l of links) {
      if (l.nodeId !== nodeId) continue;
      out.push({ record: rec, link: l, manual: false });
    }
  }
  for (const s of stored) {
    const rec = reg.filter((r) => r.obligationId === s.obligationId)[0];
    if (!rec) continue;
    if (out.some((o) => o.record.obligationId === s.obligationId)) continue;
    out.push({ record: rec, link: { nodeId, reason: 'MANUAL_LINK', detail: s.note || 'Linked manually.' }, manual: true, storedId: s.id });
  }
  return out;
}

export function instrumentsIndex() {
  return LEGAL_INSTRUMENTS;
}

export function obligationsIndex() {
  return LEGAL_OBLIGATIONS;
}

// ------------------------------------------------------------ navigation

export function go(view, params) {
  S.view = view;
  if (params) Object.assign(S.selection, params);
  try {
    const q = new URLSearchParams();
    q.set('v', view);
    if (S.projectId) q.set('p', S.projectId);
    if (S.selection.nodeId && (view === 'hazop' || view === 'nodes')) q.set('n', S.selection.nodeId);
    history.replaceState(null, '', '?' + q.toString());
  } catch (e) {
    /* history is unavailable in some embeddings; navigation still works */
  }
  const main = document.getElementById('main');
  if (main) main.scrollTop = 0;
  render();
}

export function setProject(id) {
  S.projectId = id;
  S.selection = {};
  try {
    localStorage.setItem('hazop.project', id || '');
  } catch (e) {
    /* storage may be blocked; the selection simply is not remembered */
  }
  render();
}

export function restoreRoute() {
  let view = null;
  let pid = null;
  try {
    const q = new URLSearchParams(location.search);
    view = q.get('v');
    pid = q.get('p');
    if (q.get('n')) S.selection.nodeId = q.get('n');
  } catch (e) {
    /* ignore */
  }
  if (!pid) {
    try {
      pid = localStorage.getItem('hazop.project');
    } catch (e) {
      /* ignore */
    }
  }
  return { view, projectId: pid };
}
