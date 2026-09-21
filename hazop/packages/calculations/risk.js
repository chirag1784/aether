// packages/calculations/risk.js
// The risk engine. Deterministic. Matrices are data; the engine is arithmetic.

export const RISK_ENGINE_VERSION = 'risk-1.0.0';

/**
 * Default 5x5 matrix. Bands follow MASTER_STRUCTURE §13.
 * The reachable products of 1..5 x 1..5 are
 * {1,2,3,4,5,6,8,9,10,12,15,16,20,25}; the bands below cover every integer
 * 1..25 so a custom scale cannot fall through a gap.
 */
export const DEFAULT_MATRIX = Object.freeze({
  id: 'IEC-5x5-v1',
  version: 1,
  name: '5 x 5 likelihood x severity',
  combine: 'product',
  likelihoodScale: Object.freeze([
    { value: 1, label: 'Improbable', descriptor: 'Not known to have occurred in the industry' },
    { value: 2, label: 'Remote', descriptor: 'Has occurred in the industry, not at this site' },
    { value: 3, label: 'Occasional', descriptor: 'Credible once in the life of the plant' },
    { value: 4, label: 'Probable', descriptor: 'Has occurred at this site' },
    { value: 5, label: 'Frequent', descriptor: 'Occurs or may occur more than once a year' },
  ]),
  severityScale: Object.freeze([
    { value: 1, label: 'Negligible', people: 'No injury', env: 'No release', asset: 'Negligible loss' },
    { value: 2, label: 'Minor', people: 'First aid', env: 'Contained release', asset: 'Minor damage' },
    { value: 3, label: 'Moderate', people: 'Lost-time injury', env: 'Reportable release', asset: 'Equipment damage' },
    { value: 4, label: 'Major', people: 'Serious / multiple injuries', env: 'Off-site impact', asset: 'Major damage, production loss' },
    { value: 5, label: 'Catastrophic', people: 'Fatality or multiple fatalities', env: 'Major off-site impact', asset: 'Loss of plant' },
  ]),
  bands: Object.freeze([
    { min: 1, max: 2, key: 'TRIVIAL', label: 'Trivial', action: 'ACCEPT', tone: 'ok' },
    { min: 3, max: 4, key: 'TOLERABLE', label: 'Tolerable', action: 'MONITOR', tone: 'ok' },
    { min: 5, max: 9, key: 'MODERATE', label: 'Moderate', action: 'ALARP_REVIEW', tone: 'warn' },
    { min: 10, max: 16, key: 'SUBSTANTIAL', label: 'Substantial', action: 'ACTION_REQUIRED', tone: 'high' },
    { min: 17, max: 25, key: 'INTOLERABLE', label: 'Intolerable', action: 'ACTION_MANDATORY', tone: 'critical' },
  ]),
  alarpEnabled: true,
});

/** A 4x4 example of a non-multiplicative (lookup) matrix, used in tests. */
export const LOOKUP_4x4_EXAMPLE = Object.freeze({
  id: 'CLIENT-4x4-lookup-v2',
  version: 2,
  name: 'Client 4 x 4 lookup matrix',
  combine: 'lookup',
  likelihoodScale: Object.freeze([
    { value: 1, label: 'L1' }, { value: 2, label: 'L2' }, { value: 3, label: 'L3' }, { value: 4, label: 'L4' },
  ]),
  severityScale: Object.freeze([
    { value: 1, label: 'S1' }, { value: 2, label: 'S2' }, { value: 3, label: 'S3' }, { value: 4, label: 'S4' },
  ]),
  // cells[likelihood][severity] -> band key. Severity dominates in this matrix:
  // any S4 is at least HIGH regardless of likelihood.
  cells: Object.freeze({
    1: { 1: 'LOW', 2: 'LOW', 3: 'MEDIUM', 4: 'HIGH' },
    2: { 1: 'LOW', 2: 'MEDIUM', 3: 'MEDIUM', 4: 'HIGH' },
    3: { 1: 'MEDIUM', 2: 'MEDIUM', 3: 'HIGH', 4: 'EXTREME' },
    4: { 1: 'MEDIUM', 2: 'HIGH', 3: 'EXTREME', 4: 'EXTREME' },
  }),
  bands: Object.freeze([
    { key: 'LOW', label: 'Low', action: 'ACCEPT', rank: 1, tone: 'ok' },
    { key: 'MEDIUM', label: 'Medium', action: 'ALARP_REVIEW', rank: 2, tone: 'warn' },
    { key: 'HIGH', label: 'High', action: 'ACTION_REQUIRED', rank: 3, tone: 'high' },
    { key: 'EXTREME', label: 'Extreme', action: 'ACTION_MANDATORY', rank: 4, tone: 'critical' },
  ]),
  alarpEnabled: false,
});

function scaleValues(scale) {
  return (scale || []).map((s) => s.value);
}

function bandRank(matrix, key) {
  const bands = matrix.bands || [];
  for (let i = 0; i < bands.length; i += 1) {
    if (bands[i].key === key) return bands[i].rank !== undefined ? bands[i].rank : i + 1;
  }
  return null;
}

/**
 * The core calculation.
 *
 * @param {Object} matrix
 * @param {number|null} likelihood
 * @param {number|null} severity
 * @returns {Object} { ok, score, band, bandKey, bandLabel, action, tone,
 *                     matrixId, matrixVersion, engine, reason? }
 */
export function riskFromLS(matrix, likelihood, severity) {
  const m = matrix || DEFAULT_MATRIX;
  const base = { matrixId: m.id, matrixVersion: m.version, engine: RISK_ENGINE_VERSION };

  const hasL = likelihood !== null && likelihood !== undefined && likelihood !== '';
  const hasS = severity !== null && severity !== undefined && severity !== '';
  if (!hasL || !hasS) {
    // Never default a missing rating to 1.
    return Object.assign({}, base, {
      ok: false,
      score: null,
      bandKey: null,
      bandLabel: null,
      action: null,
      tone: null,
      reason: 'MISSING_INPUT',
      missing: [!hasL ? 'likelihood' : null, !hasS ? 'severity' : null].filter(Boolean),
    });
  }

  const l = Number(likelihood);
  const s = Number(severity);
  const ls = scaleValues(m.likelihoodScale);
  const ss = scaleValues(m.severityScale);
  if (ls.indexOf(l) === -1) throw new RangeError('likelihood ' + likelihood + ' is not on scale ' + JSON.stringify(ls));
  if (ss.indexOf(s) === -1) throw new RangeError('severity ' + severity + ' is not on scale ' + JSON.stringify(ss));

  if (m.combine === 'lookup') {
    const row = m.cells && m.cells[l];
    const key = row ? row[s] : null;
    if (!key) throw new RangeError('lookup matrix ' + m.id + ' has no cell for L' + l + '/S' + s);
    const band = (m.bands || []).filter((b) => b.key === key)[0];
    if (!band) throw new RangeError('lookup matrix ' + m.id + ' cell L' + l + '/S' + s + ' names unknown band ' + key);
    return Object.assign({}, base, {
      ok: true,
      score: null,
      likelihood: l,
      severity: s,
      bandKey: band.key,
      bandLabel: band.label,
      action: band.action,
      tone: band.tone || null,
      rank: bandRank(m, band.key),
      basis: 'lookup cell L' + l + ' / S' + s,
    });
  }

  const score = l * s;
  const band = (m.bands || []).filter((b) => score >= b.min && score <= b.max)[0];
  if (!band) throw new RangeError('matrix ' + m.id + ' has no band covering score ' + score);
  return Object.assign({}, base, {
    ok: true,
    score,
    likelihood: l,
    severity: s,
    bandKey: band.key,
    bandLabel: band.label,
    action: band.action,
    tone: band.tone || null,
    rank: bandRank(m, band.key),
    basis: 'L' + l + ' x S' + s + ' = ' + score,
  });
}

/**
 * riskFromLS() throws for an off-scale rating, which is right for a save path:
 * a bad value must not be stored. A render path wants to draw the row anyway,
 * so it uses this wrapper instead of a local try/catch in every view.
 */
export function tryRiskFromLS(matrix, likelihood, severity) {
  try {
    return riskFromLS(matrix, likelihood, severity);
  } catch (e) {
    return { ok: false, score: null, bandKey: null, bandLabel: null, reason: 'OFF_SCALE', detail: (e && e.message) || 'rating is not on the matrix scale' };
  }
}

/** Comparable magnitude for a risk result, across product and lookup matrices. */
export function riskMagnitude(result) {
  if (!result || !result.ok) return null;
  if (result.score !== null && result.score !== undefined) return result.score;
  return result.rank;
}

export const RESIDUAL_BASIS_KINDS = Object.freeze([
  'ELIMINATION',
  'SUBSTITUTION',
  'ENGINEERING_CONTROL',
  'INSTRUMENTED_FUNCTION',
  'ADMINISTRATIVE',
]);

// Basis kinds that may reduce likelihood but never severity: the consequence of
// a release does not change because a procedure was written.
const LIKELIHOOD_ONLY_BASIS = Object.freeze(['ADMINISTRATIVE']);

/**
 * Guard a residual risk entry.
 *
 * @param {Object} req { matrix, initial:{likelihood,severity}, residual:{likelihood,severity},
 *                       basis:{kind,text}, recommendationIds[] }
 * @returns {Object} { ok, reason, detail? }
 */
export function validateResidual(req) {
  const r = req || {};
  const matrix = r.matrix || DEFAULT_MATRIX;
  const init = r.initial || {};
  const res = r.residual || {};

  const initial = riskFromLS(matrix, init.likelihood, init.severity);
  if (!initial.ok) return { ok: false, reason: 'INITIAL_RISK_INCOMPLETE' };

  const hasResidual =
    res.likelihood !== null && res.likelihood !== undefined && res.likelihood !== '' &&
    res.severity !== null && res.severity !== undefined && res.severity !== '';
  if (!hasResidual) return { ok: true, reason: 'NO_RESIDUAL_ENTERED' };

  const residual = riskFromLS(matrix, res.likelihood, res.severity);
  if (!residual.ok) return { ok: false, reason: 'RESIDUAL_RISK_INCOMPLETE' };

  const im = riskMagnitude(initial);
  const rm = riskMagnitude(residual);

  if (rm > im) {
    return { ok: false, reason: 'RESIDUAL_ABOVE_INITIAL', detail: 'A recommendation cannot increase risk; re-rate the initial risk instead.' };
  }
  if (rm === im) return { ok: true, reason: 'NO_REDUCTION_CLAIMED', initial, residual };

  const basis = r.basis || {};
  if (!basis.kind || RESIDUAL_BASIS_KINDS.indexOf(basis.kind) === -1) {
    return { ok: false, reason: 'RESIDUAL_BASIS_KIND_REQUIRED', detail: 'One of: ' + RESIDUAL_BASIS_KINDS.join(', ') };
  }
  if (!basis.text || String(basis.text).trim().length < 12) {
    return { ok: false, reason: 'RESIDUAL_BASIS_TEXT_REQUIRED', detail: 'State the technical basis for the reduction. The existence of a recommendation is not a basis.' };
  }
  if (LIKELIHOOD_ONLY_BASIS.indexOf(basis.kind) !== -1 && Number(res.severity) < Number(init.severity)) {
    return {
      ok: false,
      reason: 'ADMINISTRATIVE_BASIS_CANNOT_REDUCE_SEVERITY',
      detail: 'An administrative or PPE measure may reduce likelihood or exposure, not the consequence severity of the scenario.',
    };
  }
  return { ok: true, reason: 'REDUCTION_JUSTIFIED', initial, residual };
}

/** The project's action requirement for a band. */
export function tolerability(matrix, bandKey) {
  const m = matrix || DEFAULT_MATRIX;
  const band = (m.bands || []).filter((b) => b.key === bandKey)[0];
  if (!band) return { action: null, reason: 'UNKNOWN_BAND' };
  if (band.action === 'ALARP_REVIEW' && !m.alarpEnabled) {
    return { action: 'ACTION_REQUIRED', reason: 'ALARP_NARRATIVE_DISABLED_FOR_PROJECT' };
  }
  return { action: band.action, reason: 'MATRIX_BAND_ACTION' };
}

/** Bands ranked at or above the given band key — used by the quality gate. */
export function bandsAtOrAbove(matrix, bandKey) {
  const m = matrix || DEFAULT_MATRIX;
  const target = bandRank(m, bandKey);
  if (target === null) return [];
  return (m.bands || []).filter((b, i) => (b.rank !== undefined ? b.rank : i + 1) >= target).map((b) => b.key);
}

/** Every cell of a matrix, for the matrix preview grid. */
export function matrixGrid(matrix) {
  const m = matrix || DEFAULT_MATRIX;
  const rows = [];
  for (const sev of (m.severityScale || []).slice().reverse()) {
    const row = { severity: sev, cells: [] };
    for (const lik of m.likelihoodScale || []) {
      let cell;
      try {
        cell = riskFromLS(m, lik.value, sev.value);
      } catch (e) {
        cell = { ok: false, reason: 'MATRIX_ERROR', bandLabel: '—' };
      }
      row.cells.push({ likelihood: lik, result: cell });
    }
    rows.push(row);
  }
  return rows;
}

/** Validate a user-authored matrix before it can be saved to a project. */
export function validateMatrix(m) {
  const errors = [];
  if (!m || typeof m !== 'object') return { ok: false, errors: ['Matrix must be an object.'] };
  if (!m.id) errors.push('Matrix needs an id.');
  if (!Number.isFinite(Number(m.version))) errors.push('Matrix needs a numeric version.');
  if (!(m.likelihoodScale || []).length) errors.push('Matrix needs a likelihood scale.');
  if (!(m.severityScale || []).length) errors.push('Matrix needs a severity scale.');
  if (!(m.bands || []).length) errors.push('Matrix needs bands.');
  if (m.combine !== 'product' && m.combine !== 'lookup') errors.push('combine must be "product" or "lookup".');

  if (m.combine === 'product' && (m.bands || []).length) {
    const maxScore = Math.max.apply(null, scaleValues(m.likelihoodScale)) * Math.max.apply(null, scaleValues(m.severityScale));
    for (let score = 1; score <= maxScore; score += 1) {
      const hits = (m.bands || []).filter((b) => score >= b.min && score <= b.max);
      if (hits.length === 0) errors.push('No band covers score ' + score + '.');
      if (hits.length > 1) errors.push('Score ' + score + ' falls in ' + hits.length + ' bands.');
    }
  }
  if (m.combine === 'lookup') {
    for (const l of scaleValues(m.likelihoodScale)) {
      for (const s of scaleValues(m.severityScale)) {
        const key = m.cells && m.cells[l] && m.cells[l][s];
        if (!key) errors.push('Lookup cell L' + l + '/S' + s + ' is empty.');
        else if (!(m.bands || []).some((b) => b.key === key)) errors.push('Cell L' + l + '/S' + s + ' names unknown band "' + key + '".');
      }
    }
  }
  return { ok: errors.length === 0, errors };
}
