// How practicable is this recommendation, really?
//
// A HAZOP closes with thirty recommendations and a plant that can act on six
// of them this quarter. Deciding which six is an engineering judgement made of
// declared facts: what it costs, how long the lead time is, whether the plant
// has to come down, whether anyone on site can do it. This module scores those
// facts. It does not invent them — an undeclared effort field makes the score
// unavailable, exactly as a missing likelihood makes a risk score unavailable.

import { riskFromLS, riskMagnitude, DEFAULT_MATRIX, requiresAction } from './risk.js';
import { CONTROL_LEVELS } from './dedup.js';

export const DOABILITY_VERSION = 'doability-1.0.0';

/**
 * How a scenario and a recommendation are named on screen. Kept here so the
 * ranking, the migration plan and the diagrams all label a row the same way.
 */
export function scenarioRef(s) {
  if (!s) return '';
  if (s.ref) return String(s.ref);
  if (s.rowNumber !== null && s.rowNumber !== undefined) return '#' + s.rowNumber;
  return String(s.id || '');
}

export function recRef(rec) {
  if (!rec) return '';
  return String(rec.ref || rec.recId || rec.id || '');
}

/**
 * The effort fields. Each is a declared fact about the recommendation, with
 * the weight it carries and what each option means in plain terms. `weight`
 * is the share of the effort score; they sum to 100.
 */
export const EFFORT_FIELDS = Object.freeze([
  {
    key: 'costBand',
    label: 'Cost band',
    weight: 24,
    question: 'Roughly what will this cost to implement?',
    options: [
      { value: 'A', label: 'Under ₹1 lakh — within the maintenance budget', ease: 100 },
      { value: 'B', label: '₹1–10 lakh — needs a purchase requisition', ease: 70 },
      { value: 'C', label: '₹10 lakh–1 crore — needs a capital sanction', ease: 35 },
      { value: 'D', label: 'Over ₹1 crore — a project in its own right', ease: 5 },
    ],
  },
  {
    key: 'leadTime',
    label: 'Lead time',
    weight: 18,
    question: 'How long from decision to the measure being in service?',
    options: [
      { value: 'DAYS', label: 'Days — do it in the next shutdown window', ease: 100 },
      { value: 'WEEKS', label: 'Weeks — order and fit', ease: 75 },
      { value: 'MONTHS', label: 'Months — design, procure, commission', ease: 40 },
      { value: 'OVER_A_YEAR', label: 'Over a year', ease: 10 },
    ],
  },
  {
    key: 'outage',
    label: 'Plant outage',
    weight: 18,
    question: 'Does the plant have to stop for this?',
    options: [
      { value: 'NONE', label: 'No — can be done on line', ease: 100 },
      { value: 'PLANNED_SHUTDOWN', label: 'Yes — fits the next planned shutdown', ease: 60 },
      { value: 'EXTENDED_SHUTDOWN', label: 'Yes — needs a shutdown longer than the planned one', ease: 20 },
    ],
  },
  {
    key: 'engineering',
    label: 'Engineering change',
    weight: 14,
    question: 'What engineering does it need?',
    options: [
      { value: 'NONE', label: 'None — a setting, a procedure, a label', ease: 100 },
      { value: 'MINOR', label: 'Minor — like-for-like or an added instrument', ease: 75 },
      { value: 'MODIFICATION', label: 'A modification under management of change', ease: 40 },
      { value: 'REDESIGN', label: 'Redesign of the equipment or the process', ease: 10 },
    ],
  },
  {
    key: 'competency',
    label: 'Who does the work',
    weight: 12,
    question: 'Is the skill to do this available?',
    options: [
      { value: 'IN_HOUSE', label: 'Site team can do it', ease: 100 },
      { value: 'LOCAL_VENDOR', label: 'A local vendor or contractor', ease: 70 },
      { value: 'SPECIALIST', label: 'A specialist supplier or licensor', ease: 35 },
      { value: 'NOT_IDENTIFIED', label: 'Nobody identified yet', ease: 15 },
    ],
  },
  {
    key: 'approval',
    label: 'External approval',
    weight: 8,
    question: 'Does anyone outside the company have to approve it?',
    options: [
      { value: 'NONE', label: 'No', ease: 100 },
      { value: 'INTERNAL_ONLY', label: 'Internal sanction only', ease: 85 },
      { value: 'REGULATOR', label: 'A regulator or a licence amendment', ease: 25 },
    ],
  },
  {
    key: 'spaceAccess',
    label: 'Space and access',
    weight: 6,
    question: 'Is there room to install it and reach it?',
    options: [
      { value: 'YES', label: 'Yes', ease: 100 },
      { value: 'TIGHT', label: 'Tight — needs a layout study', ease: 55 },
      { value: 'NO', label: 'No — something has to move first', ease: 10 },
    ],
  },
]);

const FIELD_BY_KEY = new Map(EFFORT_FIELDS.map((f) => [f.key, f]));

export function effortField(key) {
  return FIELD_BY_KEY.get(key) || null;
}

export function effortOption(key, value) {
  const f = FIELD_BY_KEY.get(key);
  if (!f) return null;
  return f.options.find((o) => o.value === value) || null;
}

export const EFFORT_TOTAL_WEIGHT = EFFORT_FIELDS.reduce((n, f) => n + f.weight, 0);

/** The practicability bands, easiest first. */
export const DOABILITY_BANDS = Object.freeze([
  {
    key: 'DO_NOW',
    label: 'Do now',
    min: 80,
    note: 'Cheap, quick, no outage, in-house. There is no reason for this to be open at the next review.',
  },
  {
    key: 'THIS_QUARTER',
    label: 'This quarter',
    min: 60,
    note: 'Needs a requisition or a vendor, but nothing structural.',
  },
  {
    key: 'NEXT_SHUTDOWN',
    label: 'Next shutdown',
    min: 40,
    note: 'Practicable, but the plant has to stop or the design has to change.',
  },
  {
    key: 'PROJECT',
    label: 'Capital project',
    min: 0,
    note: 'Real work with real money. Justify it against the risk it removes, and put an interim measure in place meanwhile.',
  },
]);

export function doabilityBand(score) {
  for (const b of DOABILITY_BANDS) if (score >= b.min) return b;
  return DOABILITY_BANDS[DOABILITY_BANDS.length - 1];
}

/**
 * Score one recommendation's practicability from its declared effort fields.
 *
 * Returns `{ok:false, reason:'MISSING_INPUT', missing[]}` when a field has not
 * been declared. It does NOT assume a default: a recommendation nobody has
 * costed is not a cheap one.
 */
export function doability(rec, opts) {
  const options = opts || {};
  const effort = (rec && rec.effort) || {};
  const missing = [];
  const drivers = [];
  let earned = 0;
  let availableWeight = 0;

  for (const f of EFFORT_FIELDS) {
    const raw = effort[f.key];
    if (raw === null || raw === undefined || raw === '') {
      missing.push({ key: f.key, label: f.label, question: f.question });
      continue;
    }
    const opt = f.options.find((o) => o.value === raw);
    if (!opt) {
      missing.push({ key: f.key, label: f.label, question: f.question, invalid: String(raw) });
      continue;
    }
    availableWeight += f.weight;
    earned += (opt.ease / 100) * f.weight;
    if (opt.ease <= 35) drivers.push({ key: f.key, label: f.label, option: opt.label, direction: 'harder' });
    else if (opt.ease >= 100) drivers.push({ key: f.key, label: f.label, option: opt.label, direction: 'easier' });
  }

  if (missing.length > 0 && !options.partial) {
    return {
      ok: false,
      reason: 'MISSING_INPUT',
      missing,
      declaredWeight: availableWeight,
      totalWeight: EFFORT_TOTAL_WEIGHT,
      message:
        missing.length === 1
          ? 'One effort field is undeclared: ' + missing[0].label + '.'
          : missing.length + ' effort fields are undeclared.',
    };
  }

  // With `partial`, the score is over the weight actually declared and the
  // confidence says how much of the picture that is.
  const denom = options.partial ? availableWeight : EFFORT_TOTAL_WEIGHT;
  if (denom === 0) {
    return { ok: false, reason: 'MISSING_INPUT', missing, declaredWeight: 0, totalWeight: EFFORT_TOTAL_WEIGHT, message: 'Nothing has been declared about the effort.' };
  }
  const score = Math.round((earned / denom) * 100);
  const band = doabilityBand(score);
  return {
    ok: true,
    score,
    band: band.key,
    bandLabel: band.label,
    bandNote: band.note,
    drivers,
    missing,
    declaredWeight: availableWeight,
    totalWeight: EFFORT_TOTAL_WEIGHT,
    coverage: Math.round((availableWeight / EFFORT_TOTAL_WEIGHT) * 100),
    partial: missing.length > 0,
  };
}

// ---------------------------------------------------------------------------
// What the recommendation buys
// ---------------------------------------------------------------------------

/**
 * Which control levels can carry a residual rating recorded against a given
 * basis. A reduction justified by an instrumented function is not delivered by
 * writing a procedure, so an administrative recommendation cannot claim it —
 * even though both actions address the same row.
 *
 * `ADMINISTRATIVE` is the weakest basis, so anything satisfies it. A
 * recommendation with no control level recorded satisfies nothing but an
 * administrative basis: unclassified is not a synonym for adequate.
 */
const BASIS_SATISFIED_BY = Object.freeze({
  ELIMINATION: ['ELIMINATE'],
  SUBSTITUTION: ['ELIMINATE', 'SUBSTITUTE'],
  ENGINEERING_CONTROL: ['ELIMINATE', 'SUBSTITUTE', 'ENGINEERING'],
  INSTRUMENTED_FUNCTION: ['ELIMINATE', 'SUBSTITUTE', 'ENGINEERING'],
  ADMINISTRATIVE: ['ELIMINATE', 'SUBSTITUTE', 'ENGINEERING', 'ADMINISTRATIVE', 'PPE'],
});

/**
 * May this recommendation be credited with this scenario's recorded reduction?
 * Returns `{ok}` or `{ok:false, reason, detail}` naming the mismatch.
 */
export function basisCredit(rec, scenario) {
  const basis = scenario && scenario.residualBasisKind;
  if (!basis) return { ok: true, reason: 'NO_BASIS_RECORDED' };
  const allowed = BASIS_SATISFIED_BY[basis];
  if (!allowed) return { ok: true, reason: 'UNKNOWN_BASIS_KIND' };
  const level = rec && rec.controlLevel;
  if (!level) {
    return allowed.indexOf('ADMINISTRATIVE') >= 0
      ? { ok: true, reason: 'ADMINISTRATIVE_BASIS_ACCEPTS_ANY' }
      : {
          ok: false,
          reason: 'CONTROL_LEVEL_NOT_RECORDED',
          detail:
            'The reduction is recorded against a ' +
            basis.replace(/_/g, ' ').toLowerCase() +
            ' basis, and this action has no hierarchy-of-control level recorded, so it cannot be credited with delivering it.',
        };
  }
  if (allowed.indexOf(level) >= 0) return { ok: true, reason: 'BASIS_MATCHED' };
  return {
    ok: false,
    reason: 'BASIS_NOT_DELIVERED_BY_THIS_CONTROL',
    detail:
      'The reduction is recorded against a ' +
      basis.replace(/_/g, ' ').toLowerCase() +
      ' basis, which a ' +
      level.replace(/_/g, ' ').toLowerCase() +
      ' measure does not deliver.',
  };
}

/**
 * The risk reduction a recommendation delivers, summed over the scenarios it
 * is raised against. Uses only ratings actually recorded: a scenario with no
 * residual rating contributes nothing and is listed in `unrated`.
 */
export function benefit(req) {
  const rec = req.recommendation || {};
  const matrix = req.matrix || DEFAULT_MATRIX;
  const scenarios = req.scenarios || [];
  const ids = new Set(
    []
      .concat(rec.scenarioIds || [])
      .concat(rec.scenarioId ? [rec.scenarioId] : [])
      .concat(rec.raisedFrom || [])
      .filter(Boolean)
  );
  const linked = scenarios.filter((s) => ids.has(s.id));
  const rows = [];
  const unrated = [];
  let delta = 0;
  let intolerableRemoved = 0;

  for (const s of linked) {
    const init = riskFromLS(matrix, s.initialLikelihood, s.initialSeverity);
    if (!init.ok) {
      unrated.push({ scenarioId: s.id, ref: scenarioRef(s), why: 'No initial rating.' });
      continue;
    }
    const res = riskFromLS(matrix, s.residualLikelihood, s.residualSeverity);
    if (!res.ok) {
      unrated.push({ scenarioId: s.id, ref: scenarioRef(s), why: 'No residual rating recorded, so the reduction is unquantified.' });
      continue;
    }
    // The reduction was justified by a particular kind of measure. Only a
    // recommendation of that kind may be credited with delivering it.
    const credit = basisCredit(rec, s);
    if (!credit.ok) {
      unrated.push({ scenarioId: s.id, ref: scenarioRef(s), why: credit.detail, reason: credit.reason });
      continue;
    }
    const im = riskMagnitude(init);
    const rm = riskMagnitude(res);
    const d = im - rm;
    delta += Math.max(0, d);
    if (requiresAction(matrix, init.bandKey) && !requiresAction(matrix, res.bandKey)) intolerableRemoved += 1;
    rows.push({
      scenarioId: s.id,
      ref: scenarioRef(s),
      initial: { band: init.bandKey, magnitude: im, likelihood: Number(s.initialLikelihood), severity: Number(s.initialSeverity) },
      residual: { band: res.bandKey, magnitude: rm, likelihood: Number(s.residualLikelihood), severity: Number(s.residualSeverity) },
      delta: Math.max(0, d),
    });
  }

  const level = CONTROL_LEVELS.find((c) => c.key === rec.controlLevel) || null;
  return {
    scenarioCount: linked.length,
    quantified: rows.length,
    unrated,
    riskDelta: delta,
    intolerableRemoved,
    controlLevel: rec.controlLevel || null,
    controlLevelRank: level ? level.rank : null,
    rows,
    // Honest about its own limits: a delta of 0 with unrated scenarios means
    // "not measured", not "no benefit".
    measured: rows.length > 0,
    note:
      rows.length === 0 && linked.length > 0
        ? 'None of the linked scenarios carries a residual rating, so this recommendation\'s benefit is not quantified. Rate the residual risk on the worksheet.'
        : null,
  };
}

/**
 * Rank recommendations by what they buy per unit of effort.
 *
 * Two orderings are returned because they answer different questions:
 * `byDoability` is "what can we get done", `byValue` is "what is worth doing".
 * A recommendation whose effort is undeclared appears in neither — it appears
 * in `undecidable`, which is the list to go and fill in.
 */
export function rankRecommendations(req) {
  const recs = req.recommendations || [];
  const matrix = req.matrix || DEFAULT_MATRIX;
  const scenarios = req.scenarios || [];
  const scored = [];
  const undecidable = [];

  for (const rec of recs) {
    if (rec.status === 'CLOSED' || rec.status === 'REJECTED') continue;
    const d = doability(rec, { partial: !!req.partial });
    const b = benefit({ recommendation: rec, matrix, scenarios });
    if (!d.ok) {
      undecidable.push({ recommendation: rec, missing: d.missing, benefit: b, message: d.message });
      continue;
    }
    // Benefit per effort. Effort is (101 - score) so a score of 100 costs 1
    // rather than 0, and the ratio stays finite.
    const effortCost = 101 - d.score;
    const ratio = b.measured ? b.riskDelta / effortCost : null;
    scored.push({
      recommendation: rec,
      doability: d,
      benefit: b,
      valuePerEffort: ratio,
      // A control higher in the hierarchy is worth more than its arithmetic
      // delta suggests, because it does not depend on a human acting.
      hierarchyBonus: b.controlLevelRank !== null && b.controlLevelRank <= 2 ? 1 : 0,
    });
  }

  const byDoability = scored
    .slice()
    .sort(
      (a, b) =>
        b.doability.score - a.doability.score ||
        (b.benefit.riskDelta || 0) - (a.benefit.riskDelta || 0) ||
        String(recRef(a.recommendation)).localeCompare(String(recRef(b.recommendation)))
    );

  const byValue = scored
    .slice()
    .sort((a, b) => {
      const av = a.valuePerEffort === null ? -1 : a.valuePerEffort;
      const bv = b.valuePerEffort === null ? -1 : b.valuePerEffort;
      return (
        bv - av ||
        b.benefit.intolerableRemoved - a.benefit.intolerableRemoved ||
        b.doability.score - a.doability.score
      );
    });

  return {
    scored,
    byDoability,
    byValue,
    undecidable,
    counts: {
      total: recs.length,
      scored: scored.length,
      undecidable: undecidable.length,
      doNow: scored.filter((s) => s.doability.band === 'DO_NOW').length,
      thisQuarter: scored.filter((s) => s.doability.band === 'THIS_QUARTER').length,
      nextShutdown: scored.filter((s) => s.doability.band === 'NEXT_SHUTDOWN').length,
      project: scored.filter((s) => s.doability.band === 'PROJECT').length,
    },
  };
}

/**
 * Select the set to credit in the "after" picture.
 *
 * `mode` decides the cut:
 *  - `DO_NOW`, `THIS_QUARTER`, `NEXT_SHUTDOWN`, `ALL_PRACTICABLE` — every
 *    recommendation at or above that band;
 *  - `TOP_N` with `n` — the n highest by value per effort;
 *  - `EXPLICIT` with `ids` — exactly the ones the user ticked.
 *
 * Nothing is credited that has no residual rating, whatever the mode: the
 * "after" matrix shows recorded engineering judgement, never an assumption.
 */
export const SELECTION_MODES = Object.freeze([
  { key: 'DO_NOW', label: 'Only what we can do now', note: 'Cheap, quick, in-house. The honest short-term picture.' },
  { key: 'THIS_QUARTER', label: 'Do now + this quarter', note: 'Everything short of a shutdown or a design change.' },
  { key: 'NEXT_SHUTDOWN', label: 'Through the next shutdown', note: 'Adds the work that needs the plant down.' },
  { key: 'ALL_PRACTICABLE', label: 'Everything scored', note: 'Including capital projects. The long-term target.' },
  { key: 'TOP_N', label: 'Best value, top N', note: 'Most risk removed per unit of effort.' },
  { key: 'EXPLICIT', label: 'The ones I tick', note: 'Build the case for a specific package of work.' },
]);

const BAND_ORDER = ['DO_NOW', 'THIS_QUARTER', 'NEXT_SHUTDOWN', 'PROJECT'];

export function selectDoable(req) {
  const ranking = req.ranking || rankRecommendations(req);
  const mode = req.mode || 'THIS_QUARTER';
  const selected = [];
  const deferred = [];

  if (mode === 'EXPLICIT') {
    const ids = new Set(req.ids || []);
    for (const s of ranking.scored) (ids.has(s.recommendation.id) ? selected : deferred).push(s);
  } else if (mode === 'TOP_N') {
    const n = Math.max(0, Number(req.n) || 5);
    const ordered = ranking.byValue;
    for (let i = 0; i < ordered.length; i += 1) (i < n ? selected : deferred).push(ordered[i]);
  } else {
    const cut = BAND_ORDER.indexOf(mode === 'ALL_PRACTICABLE' ? 'PROJECT' : mode);
    for (const s of ranking.scored) {
      const at = BAND_ORDER.indexOf(s.doability.band);
      (at <= cut ? selected : deferred).push(s);
    }
  }

  const creditable = selected.filter((s) => s.benefit.measured);
  const uncredited = selected.filter((s) => !s.benefit.measured);

  return {
    mode,
    selected,
    deferred,
    creditable,
    uncredited,
    undecidable: ranking.undecidable,
    counts: {
      selected: selected.length,
      creditable: creditable.length,
      uncredited: uncredited.length,
      deferred: deferred.length,
      undecidable: ranking.undecidable.length,
    },
    note:
      uncredited.length > 0
        ? uncredited.length +
          ' selected recommendation(s) carry no residual rating, so the after picture does not move for them. That is a gap in the worksheet, not a claim that they achieve nothing.'
        : null,
  };
}

/**
 * The before-and-after positions, ready to plot.
 *
 * For each scenario: its initial cell always; its residual cell only when a
 * residual rating is recorded AND at least one selected recommendation is
 * raised against it. A scenario whose only recommendations were deferred
 * shows as staying where it is — which is the point of the picture.
 */
export function migrationPlan(req) {
  const matrix = req.matrix || DEFAULT_MATRIX;
  const scenarios = req.scenarios || [];
  const selection = req.selection || selectDoable(req);
  const creditedIds = new Set();
  const creditedBy = new Map();
  for (const s of selection.creditable) {
    for (const row of s.benefit.rows) {
      creditedIds.add(row.scenarioId);
      if (!creditedBy.has(row.scenarioId)) creditedBy.set(row.scenarioId, []);
      creditedBy.get(row.scenarioId).push(recRef(s.recommendation));
    }
  }

  // Every scenario a SELECTED recommendation is raised against, whether or not
  // that recommendation can be credited. The difference is the whole point of
  // the "why did this not move" column: "nobody is acting on this row" and
  // "somebody is acting on it but nobody has rated the result" are different
  // findings, and only the second one is a gap in the worksheet.
  const addressedIds = new Set();
  // Why a rating that exists was not credited. A basis mismatch is the most
  // useful thing this whole section can tell a reviewer, so it wins over the
  // generic reasons below.
  const blockedBasis = new Map();
  for (const s of selection.selected) {
    for (const id of []
      .concat(s.recommendation.scenarioIds || [])
      .concat(s.recommendation.scenarioId ? [s.recommendation.scenarioId] : [])
      .concat(s.recommendation.raisedFrom || [])
      .filter(Boolean)) {
      addressedIds.add(id);
    }
    for (const u of s.benefit.unrated) {
      if (u.reason && !blockedBasis.has(u.scenarioId) && !creditedIds.has(u.scenarioId)) {
        blockedBasis.set(u.scenarioId, u.why);
      }
    }
  }

  const points = [];
  const unrated = [];
  for (const s of scenarios) {
    const init = riskFromLS(matrix, s.initialLikelihood, s.initialSeverity);
    if (!init.ok) {
      unrated.push({ scenarioId: s.id, ref: scenarioRef(s), why: init.reason || 'No initial rating.' });
      continue;
    }
    const credited = creditedIds.has(s.id);
    const res = credited ? riskFromLS(matrix, s.residualLikelihood, s.residualSeverity) : { ok: false };
    points.push({
      scenarioId: s.id,
      ref: scenarioRef(s),
      nodeId: s.nodeId || null,
      deviation: s.deviation || null,
      before: {
        likelihood: Number(s.initialLikelihood),
        severity: Number(s.initialSeverity),
        score: init.score,
        band: init.bandKey,
        magnitude: riskMagnitude(init),
      },
      after: res.ok
        ? {
            likelihood: Number(s.residualLikelihood),
            severity: Number(s.residualSeverity),
            score: res.score,
            band: res.bandKey,
            magnitude: riskMagnitude(res),
          }
        : null,
      moved:
        res.ok &&
        (Number(s.residualLikelihood) !== Number(s.initialLikelihood) ||
          Number(s.residualSeverity) !== Number(s.initialSeverity)),
      creditedTo: creditedBy.get(s.id) || [],
      reasonNotMoved: res.ok
        ? null
        : blockedBasis.get(s.id) ||
          (addressedIds.has(s.id)
            ? 'A selected recommendation addresses this scenario but no residual rating is recorded.'
            : 'No selected recommendation addresses this scenario.'),
    });
  }

  // Band counts before and after. A scenario with no after position counts in
  // its before band on both sides — it has not moved.
  const bandKeys = (matrix.bands || []).map((b) => b.key);
  const before = {};
  const after = {};
  for (const k of bandKeys) {
    before[k] = 0;
    after[k] = 0;
  }
  for (const p of points) {
    if (before[p.before.band] !== undefined) before[p.before.band] += 1;
    const k = p.after ? p.after.band : p.before.band;
    if (after[k] !== undefined) after[k] += 1;
  }

  const intolerableBefore = points.filter((p) => requiresAction(matrix, p.before.band)).length;
  const intolerableAfter = points.filter((p) =>
    requiresAction(matrix, p.after ? p.after.band : p.before.band)
  ).length;

  return {
    matrixId: matrix.id,
    mode: selection.mode,
    points,
    unrated,
    bandCounts: { before, after },
    intolerable: { before: intolerableBefore, after: intolerableAfter },
    moved: points.filter((p) => p.moved).length,
    stationary: points.filter((p) => !p.moved).length,
    selection: selection.counts,
    caution:
      unrated.length > 0
        ? unrated.length + ' scenario(s) have no initial rating and are absent from both pictures.'
        : null,
  };
}
