// packages/domain/status.js
// Status vocabularies and the rules that govern movement between them.
// Framework-free: no browser or Node API.

export const ENGINE_VERSION = 'hazop-core-1.0.0';

export const FIELD_STATUS = Object.freeze([
  'VERIFIED',
  'USER_CONFIRMED',
  'DOCUMENT_EXTRACTED',
  'WEB_SOURCED',
  'AI_INFERRED',
  'CONFLICT',
  'MISSING',
  'NOT_APPLICABLE',
]);

// Higher number = stronger. Used only when a project explicitly enables
// automatic resolution; equal ranks never resolve automatically.
const PRECEDENCE = Object.freeze({
  VERIFIED: 50,
  USER_CONFIRMED: 40,
  DOCUMENT_EXTRACTED: 30,
  WEB_SOURCED: 20,
  AI_INFERRED: 10,
  CONFLICT: 0,
  MISSING: 0,
  NOT_APPLICABLE: 0,
});

// Statuses a value may carry and still be used in an engineering or legal
// conclusion. AI_INFERRED is deliberately absent.
export const USABLE_STATUS = Object.freeze([
  'VERIFIED',
  'USER_CONFIRMED',
  'DOCUMENT_EXTRACTED',
  'WEB_SOURCED',
]);

export function isUsable(status) {
  return USABLE_STATUS.indexOf(status) !== -1;
}

export function statusRank(status) {
  return Object.prototype.hasOwnProperty.call(PRECEDENCE, status) ? PRECEDENCE[status] : -1;
}

/**
 * Decide what a set of candidate FieldValues for ONE target field resolves to.
 * Never averages, never picks arbitrarily.
 *
 * @param {Array} candidates  [{ value, normalizedValue, normalizedUnit, status, sourceRefs, sourceClass }]
 * @param {Object} opts       { allowPrecedence: boolean }
 * @returns {Object} { status, value, reason, conflicting, chosen }
 */
export function sourcePrecedence(candidates, opts) {
  const options = opts || {};
  const list = (candidates || []).filter((c) => c && c.status !== 'MISSING');
  if (list.length === 0) return { status: 'MISSING', value: null, reason: 'NO_CANDIDATES', conflicting: [] };
  if (list.length === 1) {
    return { status: list[0].status, value: list[0], reason: 'SINGLE_SOURCE', conflicting: [], chosen: list[0] };
  }

  // Group by comparable value. Normalized value+unit when present, else raw value.
  const key = (c) =>
    c.normalizedValue !== undefined && c.normalizedValue !== null
      ? `${c.normalizedValue}|${c.normalizedUnit || ''}`
      : `raw:${String(c.value).trim().toLowerCase()}`;

  const groups = new Map();
  for (const c of list) {
    const k = key(c);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(c);
  }

  if (groups.size === 1) {
    // All agree. Report the strongest status present.
    const best = list.slice().sort((a, b) => statusRank(b.status) - statusRank(a.status))[0];
    return { status: best.status, value: best, reason: 'SOURCES_AGREE', conflicting: [], chosen: best };
  }

  // Disagreement.
  const ranked = list.slice().sort((a, b) => statusRank(b.status) - statusRank(a.status));
  const topRank = statusRank(ranked[0].status);
  const atTop = ranked.filter((c) => statusRank(c.status) === topRank);

  if (options.allowPrecedence && atTop.length === 1) {
    return {
      status: atTop[0].status,
      value: atTop[0],
      reason: 'RESOLVED_BY_PRECEDENCE',
      conflicting: list.filter((c) => c !== atTop[0]),
      chosen: atTop[0],
    };
  }

  return {
    status: 'CONFLICT',
    value: null,
    reason: options.allowPrecedence ? 'EQUAL_RANK_DISAGREEMENT' : 'PRECEDENCE_DISABLED',
    conflicting: list,
  };
}

// ---------------------------------------------------------------------------
// Legal applicability
// ---------------------------------------------------------------------------

export const APPLICABILITY = Object.freeze([
  'APPLICABLE_CONFIRMED',
  'POTENTIALLY_APPLICABLE',
  'NOT_APPLICABLE_CONFIRMED',
  'NOT_ENOUGH_DATA',
  'REQUIRES_LEGAL_REVIEW',
]);

// Statuses only an authorized human (or a fully verified deterministic
// evaluation) may set.
const HUMAN_ONLY_APPLICABILITY = Object.freeze(['APPLICABLE_CONFIRMED', 'NOT_APPLICABLE_CONFIRMED']);

export const COMPLIANCE_STATUS = Object.freeze([
  'COMPLIANT_EVIDENCE_VERIFIED',
  'PARTIALLY_EVIDENCED',
  'EVIDENCE_MISSING',
  'POTENTIAL_GAP',
  'NOT_APPLICABLE',
  'UNDER_REVIEW',
  'EXPIRED',
  'RENEWAL_DUE',
]);

export const ROLES = Object.freeze(['admin', 'facilitator', 'engineer', 'reviewer', 'viewer']);

const CONFIRM_ROLES = Object.freeze(['admin', 'facilitator', 'reviewer']);

/**
 * Guard every applicability status change.
 *
 * @param {Object} req { from, to, actorKind: 'human'|'ai', actorRole, factsAllVerified, thresholdVerified }
 * @returns {Object} { ok, status, reason }
 */
export function legalStatusTransition(req) {
  const r = req || {};
  const to = r.to;
  if (APPLICABILITY.indexOf(to) === -1) {
    return { ok: false, status: r.from || 'NOT_ENOUGH_DATA', reason: 'UNKNOWN_STATUS' };
  }
  if (r.actorKind === 'ai') {
    if (HUMAN_ONLY_APPLICABILITY.indexOf(to) !== -1) {
      return { ok: false, status: r.from || 'NOT_ENOUGH_DATA', reason: 'AI_CANNOT_CONFIRM_APPLICABILITY' };
    }
    return { ok: true, status: to, reason: 'AI_MAY_PROPOSE_UNRESOLVED_STATUS' };
  }
  if (HUMAN_ONLY_APPLICABILITY.indexOf(to) !== -1) {
    if (CONFIRM_ROLES.indexOf(r.actorRole) === -1) {
      return { ok: false, status: r.from || 'NOT_ENOUGH_DATA', reason: 'ROLE_NOT_AUTHORIZED' };
    }
    if (r.factsAllVerified === false) {
      return { ok: false, status: r.from || 'NOT_ENOUGH_DATA', reason: 'FACTS_NOT_VERIFIED' };
    }
  }
  return { ok: true, status: to, reason: 'HUMAN_DECISION' };
}

/**
 * Compliance status is computed, never asserted by the AI layer.
 *
 * @param {Object} req { applicability, evidenceExpected[], evidence[], permit, today, actorKind }
 * @returns {Object} { status, gaps[], reason }
 */
export function computeComplianceStatus(req) {
  const r = req || {};
  const expected = r.evidenceExpected || [];
  const evidence = r.evidence || [];

  if (r.applicability === 'NOT_APPLICABLE_CONFIRMED') {
    return { status: 'NOT_APPLICABLE', gaps: [], reason: 'NOT_APPLICABLE' };
  }
  if (r.applicability === 'NOT_ENOUGH_DATA' || r.applicability === 'REQUIRES_LEGAL_REVIEW') {
    return { status: 'UNDER_REVIEW', gaps: expected.slice(), reason: 'APPLICABILITY_UNRESOLVED' };
  }

  // A dead permit overrides evidence entirely.
  if (r.permit && r.permit.expiryStatus === 'EXPIRED') {
    return { status: 'EXPIRED', gaps: ['PERMIT_EXPIRED:' + (r.permit.number || r.permit.id || '')], reason: 'LINKED_PERMIT_EXPIRED' };
  }

  const satisfied = [];
  const gaps = [];
  for (const item of expected) {
    const hit = evidence.filter((e) => e && e.expects === item);
    if (hit.length === 0) gaps.push(item);
    else if (hit.some((e) => e.status === 'VERIFIED')) satisfied.push(item);
    else gaps.push(item + ' (present, not verified)');
  }

  if (expected.length === 0) {
    return { status: 'POTENTIAL_GAP', gaps: [], reason: 'NO_EVIDENCE_LIST_DEFINED' };
  }
  if (gaps.length === 0) {
    if (r.permit && (r.permit.expiryStatus === 'RENEWAL_DUE' || r.permit.expiryStatus === 'EXPIRING_SOON')) {
      return { status: 'RENEWAL_DUE', gaps: [], reason: 'PERMIT_IN_NOTICE_WINDOW' };
    }
    return { status: 'COMPLIANT_EVIDENCE_VERIFIED', gaps: [], reason: 'ALL_EVIDENCE_VERIFIED' };
  }
  if (satisfied.length === 0) {
    return { status: 'EVIDENCE_MISSING', gaps, reason: 'NO_VERIFIED_EVIDENCE' };
  }
  return { status: 'PARTIALLY_EVIDENCED', gaps, reason: 'SOME_EVIDENCE_VERIFIED' };
}

// ---------------------------------------------------------------------------
// Review states
// ---------------------------------------------------------------------------

export const NODE_REVIEW = Object.freeze(['PROPOSED', 'APPROVED', 'WORKSHEETED', 'COMPLETE']);
export const SCENARIO_REVIEW = Object.freeze(['DRAFT', 'TEAM_REVIEWED', 'FACILITATOR_ACCEPTED', 'CLOSED_OUT']);
export const REC_STATUS = Object.freeze(['OPEN', 'IN_PROGRESS', 'AWAITING_EVIDENCE', 'CLOSED', 'REJECTED', 'DEFERRED']);

export function canAdvance(sequence, from, to) {
  const a = sequence.indexOf(from);
  const b = sequence.indexOf(to);
  if (a === -1 || b === -1) return { ok: false, reason: 'UNKNOWN_STATE' };
  if (b === a + 1) return { ok: true, reason: 'ADVANCE' };
  if (b < a) return { ok: true, reason: 'REOPEN', audit: 'REOPEN_RESETS_DOWNSTREAM' };
  return { ok: false, reason: 'CANNOT_SKIP_STATES' };
}

/**
 * Closing a recommendation requires an authorized human plus evidence when the
 * recommendation demands it. The AI layer can never reach CLOSED.
 */
export function canCloseRecommendation(req) {
  const r = req || {};
  if (r.actorKind === 'ai') return { ok: false, reason: 'AI_CANNOT_CLOSE_RECOMMENDATION' };
  if (['admin', 'facilitator', 'reviewer'].indexOf(r.actorRole) === -1) {
    return { ok: false, reason: 'ROLE_NOT_AUTHORIZED' };
  }
  if (r.closureEvidenceRequired && !(r.evidence && r.evidence.length)) {
    return { ok: false, reason: 'CLOSURE_EVIDENCE_REQUIRED' };
  }
  if (!r.verifier) return { ok: false, reason: 'VERIFIER_REQUIRED' };
  return { ok: true, reason: 'CLOSE_PERMITTED' };
}

export const SOURCE_LABELS = Object.freeze([
  'STATUTE',
  'RULE',
  'NOTIFICATION',
  'GAZETTE',
  'REGULATOR_GUIDANCE',
  'LICENCE_CONDITION',
  'CONSENT_CONDITION',
  'EC_CONDITION',
  'STANDARD',
  'COMPANY_STANDARD',
  'SDS',
  'MANUFACTURER_DATA',
  'SCIENTIFIC_SOURCE',
  'PROJECT_DOCUMENT',
  'AI_INFERENCE',
]);

// Official-source hierarchy (LEGAL_COMPLIANCE §5). Lower index = more authoritative.
export const LEGAL_SOURCE_HIERARCHY = Object.freeze([
  'GAZETTE',
  'INDIA_CODE',
  'MINISTRY_OR_REGULATOR',
  'STATE_OFFICIAL',
  'USER_UPLOADED_OFFICIAL',
  'OFFICIAL_GUIDANCE',
  'STANDARDS_BODY',
  'SECONDARY',
]);

export function legalSourceRank(kind) {
  const i = LEGAL_SOURCE_HIERARCHY.indexOf(kind);
  return i === -1 ? LEGAL_SOURCE_HIERARCHY.length : i;
}

/**
 * A secondary source can never overwrite an official one.
 * @returns {Object} { ok, reason }
 */
export function canOverwriteLegalSource(existingKind, incomingKind) {
  const a = legalSourceRank(existingKind);
  const b = legalSourceRank(incomingKind);
  if (b < a) return { ok: true, reason: 'MORE_AUTHORITATIVE' };
  if (b === a) return { ok: false, reason: 'SAME_RANK_REQUIRES_REVIEW' };
  return { ok: false, reason: 'LESS_AUTHORITATIVE_CANNOT_OVERWRITE' };
}
