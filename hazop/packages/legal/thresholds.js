// packages/legal/thresholds.js
// Deterministic chemical threshold matching. No LLM arithmetic reaches this
// file, and it imports nothing from the AI layer — the test suite asserts that.

import { toMassKg, toKg, fmt } from '../calculations/units.js';
import { isUsable } from '../domain/status.js';
import { validateCas, identityBlocksThreshold } from '../chemical/properties.js';

export const THRESHOLD_ENGINE_VERSION = 'threshold-1.0.0';

export const APPROACHING_FRACTION = 0.8; // >= 80 % of the figure is "approaching"

/**
 * Evaluate ONE chemical against ONE threshold entry.
 *
 * @param {Object} req {
 *   chemical: { id, canonicalName, cas, quantity, quantityUnit, density, densityUnit,
 *               densityStatus, quantityStatus, identityResolution },
 *   thresholdEntry: { chemicalName, cas, value, unit, basis, locator, status, sourceRefs },
 *   aggregationNote
 * }
 * @returns {Object} full evaluation with the arithmetic shown
 */
export function evaluateThreshold(req) {
  const r = req || {};
  const chem = r.chemical || {};
  const t = r.thresholdEntry || {};
  const out = {
    engine: THRESHOLD_ENGINE_VERSION,
    chemicalId: chem.id || null,
    chemicalName: chem.canonicalName || chem.name || null,
    thresholdLocator: t.locator || null,
    thresholdSourceRefs: t.sourceRefs || [],
    conversion: [],
    notes: [],
  };

  // 1. The threshold figure itself must be verified and cited.
  if (t.value === null || t.value === undefined || t.value === '' || !Number.isFinite(Number(t.value))) {
    return Object.assign(out, {
      status: 'THRESHOLD_NOT_VERIFIED',
      comparison: null,
      detail:
        'No threshold figure has been entered for this entry. Read the quantity from the official schedule, enter it and cite the schedule entry. The engine will not assume a figure.',
      blocks: 'APPLICABILITY_CONCLUSION',
    });
  }
  if (t.status && t.status !== 'VERIFIED' && t.status !== 'USER_CONFIRMED') {
    return Object.assign(out, {
      status: 'THRESHOLD_NOT_VERIFIED',
      comparison: null,
      detail: 'The threshold figure is present but its status is ' + t.status + '. A threshold must be VERIFIED or USER_CONFIRMED with a citation before it can support a conclusion.',
      blocks: 'APPLICABILITY_CONCLUSION',
    });
  }
  if (!(t.sourceRefs && t.sourceRefs.length) && !t.locator) {
    return Object.assign(out, {
      status: 'THRESHOLD_NOT_CITED',
      comparison: null,
      detail: 'The threshold figure has no citation. Record the schedule and entry it comes from.',
      blocks: 'APPLICABILITY_CONCLUSION',
    });
  }

  // 2. Identity must be resolved.
  if (identityBlocksThreshold(chem.identityResolution)) {
    return Object.assign(out, {
      status: 'REQUIRES_HUMAN_CONFIRMATION',
      comparison: null,
      detail:
        'Chemical identity is not resolved (' +
        ((chem.identityResolution && chem.identityResolution.matchKind) || 'UNRESOLVED') +
        '). Confirm the identity against the SDS before comparing quantities.',
      blocks: 'APPLICABILITY_CONCLUSION',
    });
  }
  if (chem.cas && t.cas) {
    const a = validateCas(chem.cas);
    const b = validateCas(t.cas);
    if (a.valid && b.valid && a.normalized !== b.normalized) {
      return Object.assign(out, {
        status: 'IDENTITY_MISMATCH',
        comparison: null,
        detail: 'Inventory CAS ' + a.normalized + ' does not match the schedule entry CAS ' + b.normalized + '.',
        blocks: 'APPLICABILITY_CONCLUSION',
      });
    }
  }

  // 3. Quantity must exist with a usable status.
  if (chem.quantity === null || chem.quantity === undefined || chem.quantity === '' || !Number.isFinite(Number(chem.quantity))) {
    return Object.assign(out, {
      status: 'NOT_ENOUGH_DATA',
      comparison: null,
      detail: 'No inventory quantity recorded for ' + (out.chemicalName || 'this chemical') + '. A threshold crossing cannot be concluded without it.',
      blocks: 'APPLICABILITY_CONCLUSION',
      missingFacts: ['chemical.quantity'],
    });
  }
  if (chem.quantityStatus && !isUsable(chem.quantityStatus)) {
    return Object.assign(out, {
      status: 'NOT_ENOUGH_DATA',
      comparison: null,
      detail: 'Inventory quantity status is ' + chem.quantityStatus + '. An inferred quantity cannot support a threshold conclusion.',
      blocks: 'APPLICABILITY_CONCLUSION',
      missingFacts: ['chemical.quantity(status)'],
    });
  }

  // 4. Normalize both sides to kg.
  const inv = toMassKg({
    qty: chem.quantity,
    unit: chem.quantityUnit,
    density: chem.density,
    densityUnit: chem.densityUnit,
    densityStatus: chem.densityStatus,
  });
  if (!inv.ok) {
    return Object.assign(out, {
      status: inv.reason === 'DENSITY_REQUIRED_FOR_VOLUME_TO_MASS' || inv.reason === 'DENSITY_STATUS_NOT_USABLE' ? 'NOT_ENOUGH_DATA' : 'UNIT_ERROR',
      comparison: null,
      detail: inv.detail || 'Could not normalize the inventory quantity: ' + inv.reason,
      conversion: inv.steps || [],
      blocks: 'APPLICABILITY_CONCLUSION',
      missingFacts: inv.reason && inv.reason.indexOf('DENSITY') !== -1 ? ['chemical.density'] : [],
    });
  }

  const thr = toKg(t.value, t.unit);
  if (!thr.ok) {
    return Object.assign(out, {
      status: 'UNIT_ERROR',
      comparison: null,
      detail: 'Could not normalize the threshold figure: ' + thr.reason + ' (' + t.unit + ').',
      conversion: inv.steps,
      blocks: 'APPLICABILITY_CONCLUSION',
    });
  }

  const conversion = (inv.steps || []).concat(thr.steps || []);
  const notes = (inv.notes || []).concat(thr.notes || []);
  const invKg = inv.value;
  const thrKg = thr.value;
  const ratio = thrKg > 0 ? invKg / thrKg : null;

  let comparison;
  if (invKg > thrKg) comparison = 'EXCEEDS';
  else if (invKg === thrKg) comparison = 'AT_OR_ABOVE';
  else if (ratio !== null && ratio >= APPROACHING_FRACTION) comparison = 'APPROACHING';
  else comparison = 'BELOW';

  const arithmetic =
    fmt(invKg) + ' kg (site) ' + (comparison === 'BELOW' || comparison === 'APPROACHING' ? '<' : comparison === 'AT_OR_ABOVE' ? '=' : '>') + ' ' + fmt(thrKg) + ' kg (schedule)';

  return Object.assign(out, {
    status: 'EVALUATED',
    comparison,
    crossed: comparison === 'EXCEEDS' || comparison === 'AT_OR_ABOVE',
    normalized: { inventoryKg: invKg, thresholdKg: thrKg, ratio },
    ratioPercent: ratio === null ? null : Math.round(ratio * 1000) / 10,
    arithmetic,
    conversion,
    notes: notes.concat(
      comparison === 'APPROACHING'
        ? ['Inventory is at ' + Math.round(ratio * 100) + ' % of the scheduled figure. Confirm the maximum quantity liable to be present, not only the normal holding.']
        : []
    ),
    factsUsed: [
      { field: 'chemical.quantity', value: chem.quantity, unit: chem.quantityUnit, status: chem.quantityStatus || null, chemicalId: chem.id },
      chem.density ? { field: 'chemical.density', value: chem.density, unit: chem.densityUnit || 'kg/L', status: chem.densityStatus || null, chemicalId: chem.id } : null,
      { field: 'threshold.value', value: t.value, unit: t.unit, locator: t.locator, status: t.status || 'VERIFIED' },
    ].filter(Boolean),
  });
}

/**
 * Evaluate a whole inventory against a threshold set.
 * Aggregation across chemicals is NOT performed automatically: whether
 * quantities of different substances aggregate, and by what rule, is a
 * question for the official text, so the engine reports per-chemical results
 * and flags the aggregation question instead of inventing a summation rule.
 */
export function evaluateInventory(req) {
  const r = req || {};
  const set = r.thresholdSet || {};
  const entries = set.entries || [];
  const results = [];
  const unmatched = [];

  for (const chem of r.chemicals || []) {
    const matches = entries.filter((e) => entryMatchesChemical(e, chem));
    if (matches.length === 0) {
      unmatched.push({
        chemicalId: chem.id,
        chemicalName: chem.canonicalName || chem.name,
        status: 'NO_SCHEDULE_ENTRY',
        detail:
          'No entry in "' + (set.label || set.id) + '" has been recorded for this chemical. Absence of an entry is not a finding that the chemical is unscheduled — check the official schedule and add the entry, or mark it not applicable with a reason.',
      });
      continue;
    }
    for (const e of matches) {
      results.push(Object.assign(evaluateThreshold({ chemical: chem, thresholdEntry: e }), { thresholdSetId: set.id, entryId: e.id || null }));
    }
  }

  const crossed = results.filter((x) => x.crossed);
  const approaching = results.filter((x) => x.comparison === 'APPROACHING');
  const blocked = results.filter((x) => x.blocks === 'APPLICABILITY_CONCLUSION');

  return {
    engine: THRESHOLD_ENGINE_VERSION,
    thresholdSetId: set.id,
    results,
    unmatched,
    summary: {
      evaluated: results.filter((x) => x.status === 'EVALUATED').length,
      crossed: crossed.length,
      approaching: approaching.length,
      blocked: blocked.length,
      unmatched: unmatched.length,
    },
    aggregationQuestion:
      entries.length > 1 && (r.chemicals || []).length > 1
        ? 'Whether quantities of different scheduled substances aggregate, and under what rule, must be read from the official text. The engine has not summed across substances.'
        : null,
    conclusion: crossed.length
      ? 'THRESHOLD_CROSSED'
      : blocked.length
      ? 'CANNOT_CONCLUDE'
      : approaching.length
      ? 'APPROACHING_THRESHOLD'
      : results.length
      ? 'BELOW_ALL_VERIFIED_THRESHOLDS'
      : 'NO_VERIFIED_THRESHOLDS',
  };
}

function entryMatchesChemical(entry, chem) {
  if (!entry || !chem) return false;
  if (entry.cas && chem.cas) {
    const a = validateCas(entry.cas);
    const b = validateCas(chem.cas);
    if (a.valid && b.valid) return a.normalized === b.normalized;
  }
  const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const en = norm(entry.chemicalName);
  if (!en) return false;
  const names = [chem.canonicalName, chem.name].concat(chem.synonyms || []).map(norm).filter(Boolean);
  if (names.indexOf(en) !== -1) return true;
  // A class-level entry matches when the chemical declares that class.
  if (entry.isClass && (chem.hazardClasses || []).map(norm).indexOf(en) !== -1) return true;
  return false;
}

/**
 * Validate a threshold entry a user is about to save. A figure without a
 * citation is rejected at the boundary, not silently stored.
 */
export function validateThresholdEntry(entry) {
  const e = entry || {};
  const errors = [];
  if (!e.chemicalName && !e.cas) errors.push('Name the chemical or chemical class exactly as the schedule names it.');
  if (!Number.isFinite(Number(e.value)) || Number(e.value) <= 0) errors.push('Enter the quantity from the schedule as a positive number.');
  if (!e.unit) errors.push('Enter the unit as the schedule states it.');
  else {
    const k = toKg(1, e.unit);
    if (!k.ok) errors.push('Unit "' + e.unit + '" is not a recognized mass unit. Use kg, t/MT, g or lb.');
  }
  if (!e.locator || String(e.locator).trim().length < 4) errors.push('Cite the schedule and entry this figure comes from.');
  if (!e.status || (e.status !== 'VERIFIED' && e.status !== 'USER_CONFIRMED')) {
    errors.push('Mark the figure VERIFIED (read from the official text) or USER_CONFIRMED (asserted by you, recorded as an assumption).');
  }
  return { ok: errors.length === 0, errors };
}
