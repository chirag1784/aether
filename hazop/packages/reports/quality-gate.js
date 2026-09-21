// packages/reports/quality-gate.js
// The report quality gate. It never approves anything; it reports what blocks
// a REVIEWED / APPROVED status. A DRAFT export is always permitted.

import { riskFromLS, validateResidual, bandsAtOrAbove, DEFAULT_MATRIX } from '../calculations/risk.js';
import { REQUIRED_JURISDICTION } from '../calculations/completeness.js';
import { assessRecommendationQuality } from '../calculations/dedup.js';
import { expiryStatus } from '../calculations/dates.js';
import { sdsCompleteness } from '../chemical/properties.js';
import { causeFamilyCoverage } from '../domain/causes.js';
import { deriveNodeFacts, deviationCoverage } from '../domain/guidewords.js';

export const QUALITY_GATE_VERSION = 'quality-gate-1.0.0';

export const CAUTION_TEXT =
  'This report records the findings of a HAZOP team workshop supported by automated analysis. ' +
  'It is not a statutory certification, a design approval or a legal opinion. Applicability statuses marked ' +
  'POTENTIALLY_APPLICABLE, NOT_ENOUGH_DATA or REQUIRES_LEGAL_REVIEW are unresolved questions, not findings of ' +
  'compliance or non-compliance. Values labelled AI_INFERRED are model inferences that a competent person must ' +
  'verify. Residual risk ratings assume the recommendations are implemented as described.';

function check(id, label, severity, pass, detail, fixHint, route) {
  return { id, label, severity, pass: !!pass, detail: detail || null, fixHint: fixHint || null, route: route || null };
}

/**
 * @param {Object} ctx {
 *   project, matrix, documents[], chemicals[], chemProperties[], equipment[],
 *   nodes[], scenarios[], recommendations[], team[], compliance[], permits[],
 *   sources[], assumptions[], dataGaps[], conflicts[], today
 * }
 * @returns {Object} { status, checks[], blocking, advisory, summary }
 */
export function runQualityGate(ctx) {
  const c = ctx || {};
  const p = c.project || {};
  const matrix = c.matrix || DEFAULT_MATRIX;
  const nodes = c.nodes || [];
  const scenarios = c.scenarios || [];
  const recs = c.recommendations || [];
  const checks = [];

  // --- identity and methodology ---------------------------------------------
  checks.push(
    check(
      'identity',
      'Project identity recorded',
      'BLOCKING',
      !!(p.projectName && p.clientName && p.siteName && p.product),
      'Project, client, site and product must all be present on the cover.',
      'Complete the project profile.',
      'projects'
    )
  );

  const j = p.jurisdiction || {};
  const unresolvedJ = REQUIRED_JURISDICTION.filter((f) => j[f.path] === null || j[f.path] === undefined || j[f.path] === '');
  checks.push(
    check(
      'jurisdiction',
      'Jurisdiction resolved',
      'BLOCKING',
      unresolvedJ.length === 0,
      unresolvedJ.length ? 'Unresolved: ' + unresolvedJ.map((f) => f.label).join(', ') + '.' : 'All required jurisdiction fields are set.',
      'Set them on the jurisdiction profile. Unresolved fields force NOT_ENOUGH_DATA in the legal register.',
      'projects'
    )
  );

  checks.push(check('matrix', 'Risk matrix selected and versioned', 'BLOCKING', !!(matrix && matrix.id && matrix.version), 'Matrix: ' + (matrix.id || 'none'), 'Choose a matrix on the Risk page.', 'risk'));

  checks.push(
    check(
      'documents',
      'Document register populated',
      'BLOCKING',
      (c.documents || []).length > 0,
      (c.documents || []).length + ' document(s) registered.',
      'Register at least the PFD/BMR and the documents the study relied on, even if the files are held elsewhere.',
      'documents'
    )
  );

  checks.push(
    check(
      'processBasis',
      'Process basis available',
      'BLOCKING',
      !!(p.processDescription && String(p.processDescription).trim().length > 40),
      'A process description is the basis for every design intent.',
      'Write the process description on the project overview.',
      'process'
    )
  );

  // --- chemicals -------------------------------------------------------------
  const chems = c.chemicals || [];
  checks.push(check('chemicalsReviewed', 'Chemical inventory reviewed', 'BLOCKING', chems.length > 0, chems.length + ' chemical(s) in the inventory.', 'Add the chemicals handled in the study scope.', 'chemicals'));

  const noQty = chems.filter((x) => x.quantity === null || x.quantity === undefined || x.quantity === '');
  checks.push(
    check(
      'chemicalQuantities',
      'Every chemical has a quantity',
      'BLOCKING',
      noQty.length === 0,
      noQty.length ? 'Missing quantity: ' + noQty.map((x) => x.canonicalName || x.name).join(', ') + '.' : 'All quantities present.',
      'A missing quantity blocks every legal threshold conclusion.',
      'chemicals'
    )
  );

  const sdsStatus = chems.map((x) => ({ chem: x, s: sdsCompleteness(x.id, c.chemProperties || []) }));
  const sdsIncomplete = sdsStatus.filter((x) => x.s.status !== 'COMPLETE');
  checks.push(
    check(
      'sdsStatus',
      'SDS data status visible for every chemical',
      'ADVISORY',
      sdsIncomplete.length === 0,
      sdsIncomplete.length ? sdsIncomplete.map((x) => (x.chem.canonicalName || x.chem.name) + ' (' + x.s.status + ', missing ' + x.s.missingLabels.join('/') + ')').join('; ') : 'Critical properties present for all chemicals.',
      'Attach SDSs or mark properties not applicable with a reason. Missing properties are printed in the missing-data register.',
      'chemicals'
    )
  );

  const propConflicts = (c.chemProperties || []).filter((x) => x.status === 'CONFLICT');
  checks.push(
    check(
      'chemicalConflicts',
      'No unresolved conflict on a critical chemical property',
      'BLOCKING',
      propConflicts.length === 0,
      propConflicts.length ? propConflicts.length + ' property conflict(s) unresolved.' : 'No property conflicts.',
      'Resolve each conflict card, or record the conflict as an assumption with the more conservative value used.',
      'chemicals'
    )
  );

  // --- legal thresholds -----------------------------------------------------
  const compliance = c.compliance || [];
  const thresholdPending = compliance.filter((x) => x.actionNeeded === 'ENTER_VERIFIED_THRESHOLD');
  checks.push(
    check(
      'thresholdsChecked',
      'Threshold figures entered where an instrument turns on quantity',
      'ADVISORY',
      thresholdPending.length === 0,
      thresholdPending.length ? thresholdPending.length + ' obligation(s) are POTENTIALLY_APPLICABLE only because no verified threshold figure has been entered.' : 'No pending threshold entries.',
      'Read the scheduled quantities from the official text, enter them with a citation, and the engine will compute the crossing.',
      'legal'
    )
  );

  // --- nodes and worksheets -------------------------------------------------
  const unapproved = nodes.filter((n) => n.reviewStatus === 'PROPOSED');
  checks.push(
    check(
      'nodesApproved',
      'Every node approved by the team',
      'BLOCKING',
      nodes.length > 0 && unapproved.length === 0,
      nodes.length === 0 ? 'No nodes defined.' : unapproved.length ? unapproved.length + ' node(s) still PROPOSED.' : nodes.length + ' node(s) approved.',
      'Review each proposed node and approve, edit or delete it.',
      'nodes'
    )
  );

  const emptyNodes = nodes.filter((n) => n.reviewStatus !== 'PROPOSED' && scenarios.filter((s) => s.nodeId === n.id).length === 0);
  checks.push(
    check(
      'nodesWorksheeted',
      'Every approved node has at least one worksheet row',
      'BLOCKING',
      emptyNodes.length === 0,
      emptyNodes.length ? 'No rows on node(s): ' + emptyNodes.map((n) => n.nodeNumber || n.id).join(', ') + '.' : 'All approved nodes worksheeted.',
      'Generate the meaningful deviations for the node and record the team\'s findings.',
      'hazop'
    )
  );

  const noIntent = nodes.filter((n) => !n.designIntent || String(n.designIntent).trim().length < 10);
  checks.push(
    check(
      'designIntent',
      'Every node has a design intent',
      'BLOCKING',
      noIntent.length === 0,
      noIntent.length ? 'Missing design intent on node(s): ' + noIntent.map((n) => n.nodeNumber || n.id).join(', ') + '.' : 'Design intent recorded on every node.',
      'Without a design intent a deviation has nothing to deviate from.',
      'nodes'
    )
  );

  // Guideword coverage
  const coverageGaps = [];
  for (const n of nodes) {
    if (n.reviewStatus === 'PROPOSED') continue;
    const cov = deviationCoverage(n, { equipment: c.equipment, chemicals: chems, chemProperties: c.chemProperties }, scenarios.filter((s) => s.nodeId === n.id));
    if (cov.total > 0 && cov.percent < 100) coverageGaps.push({ node: n, cov });
  }
  checks.push(
    check(
      'guidewordCoverage',
      'Meaningful guideword / parameter combinations addressed',
      'ADVISORY',
      coverageGaps.length === 0,
      coverageGaps.length ? coverageGaps.map((g) => 'Node ' + (g.node.nodeNumber || g.node.id) + ': ' + g.cov.percent + '% (' + g.cov.uncovered.length + ' not addressed)').join('; ') : 'All meaningful combinations addressed.',
      'Open the node and either record a row or mark the deviation "no meaningful deviation" with a reason.',
      'hazop'
    )
  );

  // Cause family coverage
  const familyGaps = [];
  for (const n of nodes) {
    if (n.reviewStatus === 'PROPOSED') continue;
    const derived = deriveNodeFacts(n, { equipment: c.equipment, chemicals: chems, chemProperties: c.chemProperties });
    const fam = causeFamilyCoverage(derived.facts, scenarios.filter((s) => s.nodeId === n.id));
    if (fam.missing.length) familyGaps.push({ node: n, fam });
  }
  checks.push(
    check(
      'causeFamilies',
      'Every expected cause family considered per node',
      'ADVISORY',
      familyGaps.length === 0,
      familyGaps.length ? familyGaps.map((g) => 'Node ' + (g.node.nodeNumber || g.node.id) + ': ' + g.fam.labels.join(', ')).join('; ') : 'All expected cause families considered.',
      'Consider the listed families, or record why they are not credible for the node.',
      'hazop'
    )
  );

  // --- scenario content -----------------------------------------------------
  const noCause = scenarios.filter((s) => !(s.causes || []).length && !s.noMeaningfulDeviation);
  const noCons = scenarios.filter((s) => !(s.consequences || []).length && !s.noMeaningfulDeviation);
  checks.push(
    check('scenarioCauses', 'Every row has at least one cause', 'BLOCKING', noCause.length === 0, noCause.length ? noCause.length + ' row(s) without a cause.' : 'All rows have causes.', 'Add the cause, or mark the row as no meaningful deviation.', 'hazop')
  );
  checks.push(
    check('scenarioConsequences', 'Every row has at least one consequence', 'BLOCKING', noCons.length === 0, noCons.length ? noCons.length + ' row(s) without a consequence.' : 'All rows have consequences.', 'Record the unmitigated consequence before crediting safeguards.', 'hazop')
  );

  const noRisk = scenarios.filter((s) => {
    if (s.noMeaningfulDeviation) return false;
    const r = riskFromLS(matrix, s.initialLikelihood, s.initialSeverity);
    return !r.ok;
  });
  checks.push(
    check('initialRisk', 'Initial risk calculated on every row', 'BLOCKING', noRisk.length === 0, noRisk.length ? noRisk.length + ' row(s) without a complete initial rating.' : 'Initial risk rated on all rows.', 'Rate both likelihood and severity. The engine does not default a missing rating.', 'hazop')
  );

  const staleRisk = scenarios.filter((s) => s.initialRisk && s.initialRisk.matrixVersion !== undefined && (s.initialRisk.matrixId !== matrix.id || s.initialRisk.matrixVersion !== matrix.version));
  checks.push(
    check(
      'riskMatrixCurrent',
      'Stored risk scores match the current matrix version',
      'BLOCKING',
      staleRisk.length === 0,
      staleRisk.length ? staleRisk.length + ' row(s) were rated against a different matrix version.' : 'All ratings are on the current matrix.',
      'Recompute the ratings against the current matrix; a score is never reinterpreted silently.',
      'risk'
    )
  );

  // High-risk rows need an action or a recorded acceptance
  const highBands = bandsAtOrAbove(matrix, 'SUBSTANTIAL').length ? bandsAtOrAbove(matrix, 'SUBSTANTIAL') : [];
  const unactioned = scenarios.filter((s) => {
    if (s.noMeaningfulDeviation) return false;
    const r = riskFromLS(matrix, s.initialLikelihood, s.initialSeverity);
    if (!r.ok) return false;
    if (highBands.indexOf(r.bandKey) === -1) return false;
    const hasRec = recs.some((x) => x.scenarioId === s.id) || (s.recommendationIds || []).length > 0;
    return !hasRec && !(s.acceptanceRationale && String(s.acceptanceRationale).trim().length > 20);
  });
  checks.push(
    check(
      'highRiskActioned',
      'Every high-risk row has an action or a recorded acceptance rationale',
      'BLOCKING',
      unactioned.length === 0,
      unactioned.length ? unactioned.length + ' high-risk row(s) with neither a recommendation nor an acceptance rationale.' : 'All high-risk rows actioned.',
      'Add a recommendation, or record why the team accepts the risk as rated.',
      'hazop'
    )
  );

  // Residual basis
  const badResidual = [];
  for (const s of scenarios) {
    const v = validateResidual({
      matrix,
      initial: { likelihood: s.initialLikelihood, severity: s.initialSeverity },
      residual: { likelihood: s.residualLikelihood, severity: s.residualSeverity },
      basis: s.residualRiskBasis,
    });
    if (!v.ok) badResidual.push({ s, v });
  }
  checks.push(
    check(
      'residualBasis',
      'Every residual risk reduction has a valid technical basis',
      'BLOCKING',
      badResidual.length === 0,
      badResidual.length ? badResidual.slice(0, 3).map((x) => 'Row ' + (x.s.rowNumber || x.s.id) + ': ' + x.v.reason).join('; ') + (badResidual.length > 3 ? ' (+' + (badResidual.length - 3) + ' more)' : '') : 'All residual ratings justified.',
      'A recommendation existing is not a basis. State the control and why it changes the rating.',
      'hazop'
    )
  );

  const creditedConsequence = scenarios.filter((s) => (s.consequences || []).some((x) => x.safeguardCreditFlag));
  checks.push(
    check(
      'consequenceOrder',
      'Consequences recorded before safeguard credit',
      'ADVISORY',
      creditedConsequence.length === 0,
      creditedConsequence.length ? creditedConsequence.length + ' row(s) have a consequence phrased as already prevented.' : 'Consequences are stated unmitigated.',
      'Move the safeguard to the safeguards column and state the unmitigated consequence.',
      'hazop'
    )
  );

  // --- recommendations ------------------------------------------------------
  const unnumbered = recs.filter((x) => !x.recId);
  checks.push(check('recsNumbered', 'Recommendations numbered', 'BLOCKING', unnumbered.length === 0, unnumbered.length ? unnumbered.length + ' recommendation(s) without an ID.' : recs.length + ' recommendation(s) numbered.', 'Numbering is assigned on save; re-save the affected rows.', 'recommendations'));

  const noOwner = recs.filter((x) => !x.responsibleDepartment);
  checks.push(check('recsOwned', 'Recommendations have an owner', 'BLOCKING', noOwner.length === 0, noOwner.length ? noOwner.length + ' recommendation(s) without a responsible department.' : 'All recommendations owned.', 'Assign a responsible department and, where known, a person.', 'recommendations'));

  const noDate = recs.filter((x) => !x.targetDate);
  checks.push(check('recsDated', 'Recommendations have a target date', 'ADVISORY', noDate.length === 0, noDate.length ? noDate.length + ' recommendation(s) without a target date.' : 'All recommendations dated.', 'Set a target date so the action register can be tracked.', 'recommendations'));

  const vague = recs.map((x) => ({ x, q: assessRecommendationQuality(x) })).filter((r) => r.q.issues.some((i) => i.code === 'VAGUE_ACTION' || i.code === 'PPE_AS_PRIMARY'));
  checks.push(
    check(
      'recsSpecific',
      'Recommendations are specific actions',
      'ADVISORY',
      vague.length === 0,
      vague.length ? vague.slice(0, 3).map((r) => (r.x.recId || r.x.id) + ': ' + r.q.issues[0].detail).join('; ') : 'No vague recommendations.',
      'Replace "take care" / "use PPE" style actions with a specific measure, engineering control first.',
      'recommendations'
    )
  );

  // --- team -----------------------------------------------------------------
  const team = c.team || [];
  checks.push(check('teamRecorded', 'HAZOP team members recorded with roles', 'BLOCKING', team.length >= 3 && team.every((m) => m.role), team.length + ' member(s) recorded.', 'A HAZOP is a multidisciplinary team process; record who took part and in what role.', 'team'));
  const hasFacilitator = team.some((m) => m.role === 'facilitator' || m.role === 'chairman');
  checks.push(check('teamFacilitator', 'A chairman or facilitator is recorded', 'BLOCKING', hasFacilitator, hasFacilitator ? 'Facilitator recorded.' : 'No chairman or facilitator in the team list.', 'Record who facilitated the sessions.', 'team'));

  // --- compliance -----------------------------------------------------------
  const overdueReview = compliance.filter((x) => x.complianceStatus === 'UNDER_REVIEW' && x.dueDate && expiryStatus({ expiryDate: x.dueDate, today: c.today }).status === 'EXPIRED');
  checks.push(
    check('complianceReview', 'No compliance record left under review past its due date', 'BLOCKING', overdueReview.length === 0, overdueReview.length ? overdueReview.length + ' record(s) under review past due.' : 'No overdue compliance reviews.', 'Resolve the applicability question or extend the due date with a reason.', 'legal')
  );

  const expiredPermits = (c.permits || []).map((x) => ({ x, e: expiryStatus({ expiryDate: x.expiryDate, renewalDate: x.renewalDate, today: c.today, revoked: x.revoked }) })).filter((r) => r.e.status === 'EXPIRED');
  checks.push(
    check(
      'permitsCurrent',
      'No expired permit, licence or consent',
      'BLOCKING',
      expiredPermits.length === 0,
      expiredPermits.length ? 'Expired: ' + expiredPermits.map((r) => (r.x.type || 'permit') + ' ' + (r.x.number || '')).join(', ') + '.' : 'All recorded permits current.',
      'Upload the renewal, or record the status so the report states it accurately. An expired permit forces its compliance record to EXPIRED.',
      'legal'
    )
  );

  const noticePermits = (c.permits || []).map((x) => ({ x, e: expiryStatus({ expiryDate: x.expiryDate, renewalDate: x.renewalDate, today: c.today }) })).filter((r) => r.e.status === 'EXPIRING_SOON' || r.e.status === 'RENEWAL_DUE');
  checks.push(
    check('permitsNotice', 'Permits inside the notice window acknowledged', 'ADVISORY', noticePermits.every((r) => r.x.renewalAcknowledged), noticePermits.length ? noticePermits.length + ' permit(s) inside the notice window.' : 'No permits in the notice window.', 'Acknowledge the renewal so it appears in the action register.', 'legal')
  );

  // --- registers ------------------------------------------------------------
  checks.push(check('sourceRegister', 'Source register non-empty', 'BLOCKING', (c.sources || []).length > 0, (c.sources || []).length + ' source(s) registered.', 'Every value the study relies on needs a citation.', 'sources'));
  checks.push(check('assumptions', 'Assumptions register populated', 'ADVISORY', (c.assumptions || []).length > 0, (c.assumptions || []).length + ' assumption(s) recorded.', 'Record the study exclusions and assumptions; they are printed in the report.', 'reports'));
  checks.push(
    check(
      'missingDataRegister',
      'Missing-data register generated',
      'ADVISORY',
      true,
      (c.dataGaps || []).length + ' data gap(s) will be printed in the missing-data register.',
      null,
      'reports'
    )
  );

  const criticalConflicts = (c.conflicts || []).filter((x) => x.critical && x.status !== 'RESOLVED');
  checks.push(
    check(
      'noCriticalConflicts',
      'No unresolved conflict on a critical field',
      'BLOCKING',
      criticalConflicts.length === 0,
      criticalConflicts.length ? criticalConflicts.length + ' critical conflict(s) unresolved: ' + criticalConflicts.slice(0, 3).map((x) => x.field).join(', ') + '.' : 'No critical conflicts outstanding.',
      'Resolve each conflict, or record the conflict and the value the study used as an assumption.',
      'data-review'
    )
  );

  const blocking = checks.filter((k) => k.severity === 'BLOCKING');
  const advisory = checks.filter((k) => k.severity === 'ADVISORY');
  const blockingFailed = blocking.filter((k) => !k.pass);
  const advisoryFailed = advisory.filter((k) => !k.pass);

  return {
    engine: QUALITY_GATE_VERSION,
    status: blockingFailed.length === 0 ? (advisoryFailed.length === 0 ? 'READY' : 'READY_WITH_ADVISORIES') : 'BLOCKED',
    checks,
    blocking,
    advisory,
    summary: {
      blockingTotal: blocking.length,
      blockingPassed: blocking.length - blockingFailed.length,
      advisoryTotal: advisory.length,
      advisoryPassed: advisory.length - advisoryFailed.length,
      blockingFailedIds: blockingFailed.map((k) => k.id),
    },
    caution: CAUTION_TEXT,
    note: 'A DRAFT export is always permitted. REVIEWED and APPROVED require every blocking check to pass and an authorized human action — this gate does not approve anything.',
  };
}

export const REPORT_STATUSES = Object.freeze(['DRAFT', 'REVIEWED', 'APPROVED', 'SUPERSEDED']);

/** Guard a report status change. */
export function canSetReportStatus(req) {
  const r = req || {};
  if (r.to === 'DRAFT') return { ok: true, reason: 'DRAFT_ALWAYS_ALLOWED' };
  if (r.actorKind === 'ai') return { ok: false, reason: 'AI_CANNOT_APPROVE_REPORT' };
  if (['admin', 'facilitator', 'reviewer'].indexOf(r.actorRole) === -1) return { ok: false, reason: 'ROLE_NOT_AUTHORIZED' };
  if (!r.gate || r.gate.status === 'BLOCKED') {
    return { ok: false, reason: 'QUALITY_GATE_BLOCKED', detail: 'Blocking checks failing: ' + (((r.gate || {}).summary || {}).blockingFailedIds || []).join(', ') };
  }
  return { ok: true, reason: 'AUTHORIZED_AND_GATE_CLEAR' };
}

/** The fixed report section order (REPORT_SCHEMA §1). */
export const REPORT_SECTIONS = Object.freeze([
  { key: 'cover', label: 'Cover', always: true },
  { key: 'revisions', label: 'Revision history', always: true },
  { key: 'caution', label: 'Caution and limitations', always: true },
  { key: 'introduction', label: 'Introduction', always: true },
  { key: 'scope', label: 'Scope of work', always: true },
  { key: 'process', label: 'Process description', always: true },
  { key: 'documents', label: 'Documents reviewed', always: true },
  { key: 'methodology', label: 'HAZOP methodology', always: true },
  { key: 'standards', label: 'Reference standards and guidance', always: true },
  { key: 'legalSummary', label: 'Legal / regulatory applicability summary', always: true },
  { key: 'exclusions', label: 'Study exclusions and assumptions', always: true },
  { key: 'team', label: 'HAZOP team members', always: true },
  { key: 'matrix', label: 'Risk matrix', always: true },
  { key: 'chemicals', label: 'Chemical hazard summary', always: true },
  { key: 'drawings', label: 'Process / PFD / P&ID reference', always: true },
  { key: 'nodeList', label: 'Node list', always: true },
  { key: 'worksheets', label: 'Node worksheets', always: true },
  { key: 'nodeLegal', label: 'Node-wise legal relevance', conditional: true },
  { key: 'recRegister', label: 'Final node-wise recommendation register', always: true },
  { key: 'masterRegister', label: 'Master recommendation / action register', always: true },
  { key: 'complianceGaps', label: 'Compliance-gap register', conditional: true },
  { key: 'missingData', label: 'Missing-data register', always: true },
  { key: 'conclusions', label: 'Final conclusions', always: true },
  { key: 'sourceRegister', label: 'Source register', always: true },
  { key: 'annexures', label: 'Annexures', conditional: true },
]);
