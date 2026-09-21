// packages/calculations/completeness.js
// Two separate completeness figures, each returning what is missing.
// Never blended into a single "score".

import { isUsable } from '../domain/status.js';

export const COMPLETENESS_VERSION = 'completeness-1.0.0';

// Project profile fields tracked for overall data completeness.
const PROFILE_FIELDS = [
  { path: 'projectName', label: 'Project name' },
  { path: 'clientName', label: 'Client' },
  { path: 'siteName', label: 'Site' },
  { path: 'siteAddress', label: 'Site address' },
  { path: 'product', label: 'Product' },
  { path: 'process', label: 'Process' },
  { path: 'processStage', label: 'Process stage' },
  { path: 'department', label: 'Department' },
  { path: 'projectType', label: 'Project type' },
  { path: 'processDescription', label: 'Process description' },
  { path: 'chemistry', label: 'Chemistry' },
  { path: 'batchSize', label: 'Batch size' },
  { path: 'productionRate', label: 'Production rate' },
  { path: 'utilities', label: 'Utilities' },
  { path: 'startupBasis', label: 'Start-up basis' },
  { path: 'shutdownBasis', label: 'Shutdown basis' },
  { path: 'emergencyShutdownBasis', label: 'Emergency shutdown basis' },
  { path: 'studyStartDate', label: 'Study start date' },
];

// Jurisdiction fields the legal engine must have resolved before it can reach
// any confirmed applicability conclusion.
export const REQUIRED_JURISDICTION = [
  { path: 'country', label: 'Country' },
  { path: 'state', label: 'State / UT' },
  { path: 'district', label: 'District / local authority' },
  { path: 'appropriateGovernment', label: 'Appropriate government' },
  { path: 'establishmentCategory', label: 'Establishment / factory category' },
  { path: 'processCategory', label: 'Process category' },
  { path: 'hazardousProcess', label: 'Hazardous-process status' },
  { path: 'consentAuthority', label: 'Consent authority' },
  { path: 'environmentalCategory', label: 'Environmental category' },
];

function has(v) {
  if (v === null || v === undefined) return false;
  if (typeof v === 'string') return v.trim().length > 0;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === 'boolean') return true;
  if (typeof v === 'number') return Number.isFinite(v);
  if (typeof v === 'object') return Object.keys(v).length > 0;
  return false;
}

function pctOf(done, total) {
  if (!total) return 0;
  return Math.round((done / total) * 100);
}

/**
 * Overall project-profile completeness.
 * @returns {Object} { percent, present, total, missing: [{path,label}] }
 */
export function dataCompleteness(project) {
  const p = project || {};
  const missing = [];
  let present = 0;
  for (const f of PROFILE_FIELDS) {
    if (has(p[f.path])) present += 1;
    else missing.push(f);
  }
  const j = p.jurisdiction || {};
  let jPresent = 0;
  for (const f of REQUIRED_JURISDICTION) {
    if (has(j[f.path])) jPresent += 1;
    else missing.push({ path: 'jurisdiction.' + f.path, label: f.label });
  }
  const total = PROFILE_FIELDS.length + REQUIRED_JURISDICTION.length;
  return { percent: pctOf(present + jPresent, total), present: present + jPresent, total, missing, engine: COMPLETENESS_VERSION };
}

/**
 * Critical completeness — the subset that blocks HAZOP conclusions.
 *
 * @param {Object} ctx { project, chemicals[], chemProperties[], equipment[], nodes[], matrix }
 */
export function criticalCompleteness(ctx) {
  const c = ctx || {};
  const project = c.project || {};
  const j = project.jurisdiction || {};
  const checks = [];

  // 1. Jurisdiction resolution
  for (const f of REQUIRED_JURISDICTION) {
    checks.push({
      id: 'jurisdiction.' + f.path,
      label: 'Jurisdiction: ' + f.label,
      pass: has(j[f.path]),
      group: 'Jurisdiction',
      fixHint: 'Set it on the project jurisdiction profile.',
    });
  }

  // 2. Risk matrix
  checks.push({
    id: 'matrix',
    label: 'Risk matrix selected',
    pass: !!(c.matrix && c.matrix.id),
    group: 'Methodology',
    fixHint: 'Choose or define a matrix on the Risk page.',
  });

  // 3. Chemicals: identity, quantity, state
  for (const ch of c.chemicals || []) {
    const name = ch.canonicalName || ch.name || ch.id;
    checks.push({
      id: 'chem.' + ch.id + '.identity',
      label: 'Chemical identity resolved: ' + name,
      pass: !!(ch.cas && ch.casValid !== false) || ch.identityStatus === 'USER_CONFIRMED',
      group: 'Chemicals',
      fixHint: 'Enter a valid CAS number or confirm the identity manually.',
    });
    checks.push({
      id: 'chem.' + ch.id + '.quantity',
      label: 'Inventory quantity: ' + name,
      pass: has(ch.quantity) && has(ch.quantityUnit),
      group: 'Chemicals',
      fixHint: 'Quantity and unit are required before any legal threshold can be evaluated.',
    });
    checks.push({
      id: 'chem.' + ch.id + '.state',
      label: 'Physical state: ' + name,
      pass: has(ch.physicalState),
      group: 'Chemicals',
      fixHint: 'Needed for storage-type and threshold classification.',
    });
  }

  // 4. Flammability data for chemicals handled at or above ambient
  const props = c.chemProperties || [];
  const propFor = (chemId, key) => props.filter((p) => p.chemicalId === chemId && p.key === key)[0];
  for (const ch of c.chemicals || []) {
    const name = ch.canonicalName || ch.name || ch.id;
    const fp = propFor(ch.id, 'flashPoint');
    checks.push({
      id: 'chem.' + ch.id + '.flashPoint',
      label: 'Flash point status known: ' + name,
      pass: !!fp && (isUsable(fp.status) || fp.status === 'NOT_APPLICABLE'),
      group: 'Chemicals',
      fixHint: 'Attach an SDS or mark not applicable with a reason. An unknown flash point blocks flammability alerts.',
    });
  }

  // 5. Pressure equipment: design pressure/temperature and relief
  for (const eq of c.equipment || []) {
    const tag = eq.tag || eq.id;
    if (eq.pressureEquipment) {
      checks.push({
        id: 'eq.' + eq.id + '.designP',
        label: 'Design pressure: ' + tag,
        pass: has(eq.designPressure),
        group: 'Equipment',
        fixHint: 'From the equipment datasheet or nameplate.',
      });
      checks.push({
        id: 'eq.' + eq.id + '.designT',
        label: 'Design temperature: ' + tag,
        pass: has(eq.designTemperature),
        group: 'Equipment',
        fixHint: 'From the equipment datasheet or nameplate.',
      });
      checks.push({
        id: 'eq.' + eq.id + '.relief',
        label: 'Relief / vent arrangement: ' + tag,
        pass: has(eq.reliefArrangement),
        group: 'Equipment',
        fixHint: 'Record the relief device or vent arrangement, or state that none is fitted.',
      });
    }
    checks.push({
      id: 'eq.' + eq.id + '.moc',
      label: 'Material of construction: ' + tag,
      pass: has(eq.materialOfConstruction),
      group: 'Equipment',
      fixHint: 'Needed for chemical compatibility checks.',
    });
  }

  // 6. Nodes have a design intent
  for (const n of c.nodes || []) {
    checks.push({
      id: 'node.' + n.id + '.intent',
      label: 'Design intent recorded: Node ' + (n.nodeNumber || n.id),
      pass: has(n.designIntent),
      group: 'Nodes',
      fixHint: 'A node without a design intent cannot generate meaningful deviations.',
    });
  }

  const failed = checks.filter((k) => !k.pass);
  return {
    percent: pctOf(checks.length - failed.length, checks.length),
    present: checks.length - failed.length,
    total: checks.length,
    checks,
    missing: failed,
    byGroup: groupCounts(checks),
    engine: COMPLETENESS_VERSION,
  };
}

function groupCounts(checks) {
  const map = new Map();
  for (const k of checks) {
    if (!map.has(k.group)) map.set(k.group, { group: k.group, total: 0, pass: 0 });
    const g = map.get(k.group);
    g.total += 1;
    if (k.pass) g.pass += 1;
  }
  return Array.from(map.values()).map((g) => Object.assign(g, { percent: pctOf(g.pass, g.total) }));
}

/**
 * Report readiness is the quality gate's blocking-check pass rate, kept
 * separate from data completeness so the two cannot be confused.
 */
export function reportReadiness(gateResult) {
  const checks = ((gateResult && gateResult.checks) || []).filter((k) => k.severity === 'BLOCKING');
  const pass = checks.filter((k) => k.pass).length;
  return { percent: pctOf(pass, checks.length), pass, total: checks.length };
}
