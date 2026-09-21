// Turning a retrieved finding into a field the engines may use.
//
// A finding arrives as free text from a web page, an SDS, a connector or the
// assistant's memory. Before it becomes a property value it has to survive
// three questions: is there a unit, is there a citation, and does it agree with
// what is already recorded. This module answers those three and nothing else.

import { evidenceRank, attestedStatus, evidenceClass, isGradeDependent } from './sources.js';
import { sourcePrecedence } from '../domain/status.js';
import { normalizeUnitToken, unitDimension } from '../calculations/units.js';

export const RESOLVE_VERSION = 'research-resolve-1.0.0';

/** Why a finding cannot be applied. Each one names the fix. */
export const REJECTIONS = Object.freeze({
  NO_VALUE: 'The finding carries no value.',
  NO_CITATION: 'No document URL or reference was recorded. A web-sourced value has to be traceable.',
  MODEL_RECALL_ONLY: 'This came from the assistant\'s memory, not from a document. It is recorded as inferred and the engines will not use it.',
  NO_UNIT: 'A numeric value needs a unit. Add the unit from the document, or record the value as text.',
  UNIT_MISMATCH: 'The unit is not a unit of the quantity this property measures.',
  RANGE_WITHOUT_BASIS: 'A range was given with no measurement condition. Record the condition or pick the conservative end and say which.',
  GRADE_UNKNOWN: 'This property depends on the grade purchased and no grade is recorded on the chemical.',
});

const NUM_RE = /-?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?/g;

/**
 * Properties where a range has a safe end and an unsafe end. An onset
 * temperature is conservative at its LOW end — the plant reaches it sooner
 * than the optimistic figure says. A pressure or explosion severity is
 * conservative at its HIGH end.
 */
const CONSERVATIVE_END = Object.freeze({
  flashPoint: 'low',
  autoignitionTemperature: 'low',
  decompositionTemperature: 'low',
  onsetTemperature: 'low',
  meltingPoint: 'low',
  boilingPoint: 'low',
  mitCloud: 'low',
  mitLayer: 'low',
  mie: 'low',
  lel: 'low',
  vapourPressure: 'high',
  kst: 'high',
  pmax: 'high',
  uel: 'high',
  ph: 'high',
  twa: 'low',
  stel: 'low',
  ceiling: 'low',
  idlh: 'low',
});

/** Properties whose figure is meaningless without the condition it was measured at. */
const CONDITION_MATTERS = Object.freeze([
  'vapourPressure',
  'density',
  'viscosity',
  'solubility',
  'ph',
  'kst',
  'pmax',
  'mie',
  'mitCloud',
  'mitLayer',
  'particleSize',
]);

/**
 * Adapt a `PROPERTY_GROUPS` entry into what `assessFinding` needs to check.
 * Pass the raw property meta; this fills in the expectations rather than
 * making every caller restate them.
 */
export function propertyExpectation(meta) {
  const m = meta || {};
  const dim = m.unit ? unitDimension(m.unit) : null;
  return {
    key: m.key,
    label: m.label || m.key,
    group: m.group || null,
    numeric: m.type === 'number',
    unit: m.unit || null,
    dimension: dim || (m.type === 'number' && !m.unit ? 'dimensionless' : null),
    critical: !!m.critical,
    conditionMatters: CONDITION_MATTERS.indexOf(m.key) >= 0 || !!m.needsTemperature,
    conservativeEnd: CONSERVATIVE_END[m.key] || 'low',
  };
}

/**
 * Pull the value, unit and range out of a phrase as it appears in a document.
 * Deliberately conservative: anything it is not sure about it reports as text
 * so a human decides, rather than guessing a number.
 */
export function parseFinding(raw) {
  const text = String(raw == null ? '' : raw).trim();
  if (!text) return { kind: 'EMPTY', text: '' };

  const nums = text.match(NUM_RE);
  if (!nums || nums.length === 0) return { kind: 'TEXT', text, value: text };

  // Unit: the token run after the last number, stopping at a comma or bracket.
  const lastNum = nums[nums.length - 1];
  const tail = text.slice(text.lastIndexOf(lastNum) + lastNum.length);
  const unitMatch = tail.match(/^\s*([^\s,;()[\]]+)/);
  const unitRaw = unitMatch ? unitMatch[1].replace(/[.:]$/, '') : null;
  const unit = unitRaw ? normalizeUnitToken(unitRaw) : null;

  // A condition stated in brackets or after "at".
  const condMatch = text.match(/\bat\s+([^,;)]+)/i) || text.match(/\(([^)]*\b(?:°C|C|K|bar|kPa|atm|%)\b[^)]*)\)/i);
  const condition = condMatch ? condMatch[1].trim() : null;

  const isRange = /(?:\d)\s*(?:–|—|-|to)\s*(?:\d)/.test(text) && nums.length >= 2;
  if (isRange) {
    const lo = Number(nums[0]);
    const hi = Number(nums[1]);
    return {
      kind: 'RANGE',
      text,
      low: Math.min(lo, hi),
      high: Math.max(lo, hi),
      unit,
      unitRaw,
      condition,
    };
  }

  const cmp = /^\s*(<=|>=|<|>|≤|≥|about|approx\.?|ca\.?|~)/i.exec(text);
  return {
    kind: 'NUMBER',
    text,
    value: Number(nums[0]),
    unit,
    unitRaw,
    condition,
    qualifier: cmp ? cmp[1].toLowerCase() : null,
  };
}

/**
 * Decide whether a finding may be applied to a property, and with what status.
 * Returns `{ok, status, value, unit, warnings[], rejection?}`. It never writes
 * and never picks between two disagreeing findings — that is `reconcile()`.
 */
export function assessFinding(req) {
  const finding = req.finding || {};
  const prop = req.property || {};
  const chem = req.chemical || null;
  const cls = finding.evidenceClass || 'MODEL_RECALL';
  const warnings = [];

  const parsed = parseFinding(finding.rawValue != null ? finding.rawValue : finding.value);
  if (parsed.kind === 'EMPTY') {
    return { ok: false, rejection: 'NO_VALUE', message: REJECTIONS.NO_VALUE };
  }

  const status = attestedStatus(cls);
  const hasCitation = !!(finding.url || finding.documentRef);

  if (status === 'WEB_SOURCED' && !hasCitation) {
    return { ok: false, rejection: 'NO_CITATION', message: REJECTIONS.NO_CITATION };
  }
  if (cls === 'MODEL_RECALL') {
    warnings.push(REJECTIONS.MODEL_RECALL_ONLY);
  }

  const expectDim = prop.dimension || null;
  if (prop.numeric && (parsed.kind === 'NUMBER' || parsed.kind === 'RANGE')) {
    if (!parsed.unit && expectDim && expectDim !== 'dimensionless') {
      return { ok: false, rejection: 'NO_UNIT', message: REJECTIONS.NO_UNIT, parsed };
    }
    if (parsed.unit && expectDim && expectDim !== 'dimensionless') {
      const dim = unitDimension(parsed.unit);
      if (dim && dim !== expectDim) {
        return {
          ok: false,
          rejection: 'UNIT_MISMATCH',
          message:
            REJECTIONS.UNIT_MISMATCH +
            ' ' +
            prop.label +
            ' is a ' +
            expectDim +
            '; "' +
            (parsed.unitRaw || parsed.unit) +
            '" measures ' +
            dim +
            '.',
          parsed,
        };
      }
    }
  }

  if (parsed.kind === 'RANGE' && !parsed.condition && prop.conditionMatters) {
    warnings.push(REJECTIONS.RANGE_WITHOUT_BASIS);
  }
  // Same quantity, different unit family — the mg/m³ against ppm trap on an
  // exposure limit. The dimension check above cannot catch it because neither
  // unit is a mass, volume, temperature or pressure, and converting between
  // them needs the molecular weight. So say so rather than let it pass silently.
  if (
    prop.unit &&
    parsed.unit &&
    normalizeUnitToken(prop.unit) !== parsed.unit &&
    !unitDimension(prop.unit) &&
    !unitDimension(parsed.unit)
  ) {
    warnings.push(
      'The document gives this in ' +
        (parsed.unitRaw || parsed.unit) +
        '; the field expects ' +
        prop.unit +
        '. The value is recorded in the document\'s own unit — converting between them needs the molecular weight, so do not assume they are interchangeable.'
    );
  }
  if (isGradeDependent(prop.key)) {
    if (!chem || !chem.grade) {
      warnings.push(
        'No grade is recorded for ' +
          ((chem && chem.name) || 'this chemical') +
          '. ' +
          prop.label +
          ' varies with grade, so treat this figure as indicative until the supplier SDS confirms it.'
      );
    } else if (finding.grade && finding.grade !== chem.grade) {
      warnings.push(
        'The document covers grade "' + finding.grade + '"; the project records grade "' + chem.grade + '".'
      );
    }
  }
  if (parsed.qualifier) {
    warnings.push('The document qualifies this figure ("' + parsed.qualifier + '"). It is not an exact measurement.');
  }

  const value =
    parsed.kind === 'RANGE'
      ? { low: parsed.low, high: parsed.high, text: parsed.text }
      : parsed.kind === 'NUMBER'
        ? parsed.value
        : parsed.text;

  return {
    ok: true,
    status,
    kind: parsed.kind,
    value,
    // For a range, the conservative end for a hazard property is the low end of
    // an onset temperature and the high end of a pressure. The engine never
    // picks: it records both and asks.
    conservative:
      parsed.kind === 'RANGE'
        ? prop.conservativeEnd === 'high'
          ? parsed.high
          : parsed.low
        : null,
    unit: parsed.unit,
    unitAsWritten: parsed.unitRaw || null,
    condition: parsed.condition || null,
    evidenceClass: cls,
    evidenceRank: evidenceRank(cls),
    citation: finding.url || finding.documentRef || null,
    retrievedAt: finding.retrievedAt || null,
    warnings,
    parsed,
  };
}

/**
 * Two or more assessed findings for the same property. Delegates the decision
 * to `sourcePrecedence()` so the conflict rules are the same ones the document
 * extractor uses, then adds the evidence-class tiebreak that is specific to
 * research: a regulator beats an aggregator even at equal field status.
 */
export function reconcile(assessed, opts) {
  const usable = (assessed || []).filter((a) => a && a.ok);
  if (usable.length === 0) return { status: 'MISSING', reason: 'NO_USABLE_FINDINGS', candidates: [] };

  const candidates = usable.map((a) => ({
    status: a.status,
    value: a.kind === 'NUMBER' ? a.value : a.kind === 'RANGE' ? a.conservative : a.value,
    normalizedValue: a.kind === 'NUMBER' ? a.value : a.kind === 'RANGE' ? a.conservative : null,
    normalizedUnit: a.unit || null,
    sourceKind: a.evidenceClass,
    citation: a.citation,
    _assessed: a,
  }));

  const decision = sourcePrecedence(candidates, { allowPrecedence: !!(opts && opts.allowPrecedence) });

  if (decision.status !== 'CONFLICT') {
    return {
      status: decision.status,
      reason: decision.reason,
      chosen: decision.chosen ? decision.chosen._assessed : null,
      candidates,
      conflicting: (decision.conflicting || []).map((c) => c._assessed),
    };
  }

  // Equal field status, different values. Rank by evidence class; a single
  // clear best source resolves it, a tie stays a conflict for a human.
  const ranked = candidates.slice().sort((a, b) => evidenceRank(a.sourceKind) - evidenceRank(b.sourceKind));
  const bestRank = evidenceRank(ranked[0].sourceKind);
  const atBest = ranked.filter((c) => evidenceRank(c.sourceKind) === bestRank);
  if (atBest.length === 1) {
    return {
      status: atBest[0].status,
      reason: 'RESOLVED_BY_EVIDENCE_CLASS',
      chosen: atBest[0]._assessed,
      candidates,
      conflicting: candidates.filter((c) => c !== atBest[0]).map((c) => c._assessed),
      explanation:
        (evidenceClass(atBest[0].sourceKind) || {}).label +
        ' outranks the other sources for this property; the other values are retained.',
    };
  }
  return {
    status: 'CONFLICT',
    reason: 'EQUAL_EVIDENCE_DISAGREEMENT',
    candidates,
    conflicting: usable,
    explanation:
      'Two sources of the same standing give different values. Read both documents and record which grade or condition each one measured.',
  };
}

/**
 * Map an evidence class onto the chemical source class the property register
 * already sorts by, so a researched value takes its place in the same
 * precedence order as one typed in from a document.
 */
function chemSourceClassFor(evidence) {
  const map = {
    SUPPLIER_SDS: 'SUPPLIER_SDS',
    MANUFACTURER_SDS: 'SUPPLIER_SDS',
    PRIMARY_REGULATOR: 'REGULATOR_DB',
    AUTHORITATIVE_DATABASE: 'SCIENTIFIC_DB',
    PEER_REVIEWED: 'LITERATURE',
    COMMERCIAL_CATALOGUE: 'OTHER_TECHNICAL',
    AGGREGATOR: 'OTHER_TECHNICAL',
    MODEL_RECALL: 'OTHER_TECHNICAL',
  };
  return map[evidence] || 'OTHER_TECHNICAL';
}

/**
 * The write a resolved finding turns into. Shaped so the caller passes it
 * straight to `store.create('chem_properties', …)` — building the record here
 * keeps provenance out of view code, where it gets forgotten.
 */
export function toPropertyRecord(req) {
  const a = req.assessed;
  const prop = req.property || {};
  if (!a || !a.ok) return null;
  const value = a.kind === 'RANGE' ? a.conservative : a.value;
  // `key` and `group` are the field names the rest of the app already uses for
  // a property record; `property` is written alongside so the research
  // register can read either. One shape, not two.
  return {
    projectId: req.projectId,
    chemicalId: req.chemicalId,
    key: prop.key,
    property: prop.key,
    group: prop.group || null,
    value: value == null ? null : String(value),
    valueLow: a.kind === 'RANGE' ? String(a.value.low) : null,
    valueHigh: a.kind === 'RANGE' ? String(a.value.high) : null,
    unit: a.unit || null,
    unitAsWritten: a.unitAsWritten || null,
    condition: a.condition || null,
    status: a.status,
    sourceKind: a.evidenceClass,
    sourceClass: chemSourceClassFor(a.evidenceClass),
    sourceUrl: a.citation,
    sourceRefs: a.citation
      ? [
          {
            sourceType: a.evidenceClass === 'SUPPLIER_SDS' || a.evidenceClass === 'MANUFACTURER_SDS' ? 'SDS' : 'SCIENTIFIC_SOURCE',
            sourceClass: chemSourceClassFor(a.evidenceClass),
            sourceLabel: a.evidenceClass,
            documentName: req.documentName || null,
            url: a.citation,
            retrievedAt: a.retrievedAt,
          },
        ]
      : [{ sourceType: 'AI_INFERENCE', sourceLabel: 'MODEL_RECALL', documentName: 'No document retrieved', extractedAt: a.retrievedAt }],
    retrievedAt: a.retrievedAt,
    researchNote: a.warnings.length ? a.warnings.join(' ') : null,
    valueAsWritten: a.parsed ? a.parsed.text : null,
    // A researched value is never an attestation. A human still reads the
    // document and marks it VERIFIED if they want the engines to rely on it.
    verifiedBy: null,
    verifiedAt: null,
  };
}

/**
 * The write a resolved company finding turns into: one field on the company
 * profile, with its own provenance, so a profile is never a block of
 * unattributed text.
 */
export function toCompanyFieldRecord(req) {
  const a = req.assessed;
  if (!a || !a.ok) return null;
  return {
    projectId: req.projectId,
    field: req.field,
    value: a.kind === 'NUMBER' ? String(a.value) : String(a.kind === 'RANGE' ? a.parsed.text : a.value),
    status: a.status,
    sourceKind: a.evidenceClass,
    authorityKey: req.authorityKey || null,
    sourceUrl: a.citation,
    retrievedAt: a.retrievedAt,
    researchNote: a.warnings.length ? a.warnings.join(' ') : null,
    verifiedBy: null,
    verifiedAt: null,
  };
}

/**
 * A short, honest account of what a research pass achieved — the text the
 * Research view shows and the report carries. Counts, not adjectives.
 */
export function researchSummary(results) {
  const rows = results || [];
  const applied = rows.filter((r) => r.outcome === 'APPLIED');
  const conflicts = rows.filter((r) => r.outcome === 'CONFLICT');
  const rejected = rows.filter((r) => r.outcome === 'REJECTED');
  const inferred = applied.filter((r) => r.status === 'AI_INFERRED');
  const sourced = applied.filter((r) => r.status === 'WEB_SOURCED');
  const byClass = new Map();
  for (const r of applied) {
    const k = r.evidenceClass || 'UNKNOWN';
    byClass.set(k, (byClass.get(k) || 0) + 1);
  }
  return {
    attempted: rows.length,
    applied: applied.length,
    webSourced: sourced.length,
    inferred: inferred.length,
    conflicts: conflicts.length,
    rejected: rejected.length,
    byEvidenceClass: Array.from(byClass.entries())
      .map(([k, n]) => ({ evidenceClass: k, label: (evidenceClass(k) || {}).label || k, count: n }))
      .sort((a, b) => evidenceRank(a.evidenceClass) - evidenceRank(b.evidenceClass)),
    // The line that matters: nothing researched is verified.
    verifiedCount: 0,
    caution:
      applied.length > 0
        ? 'Researched values are recorded as sourced or inferred, never as verified. Read each cited document before the figure is used as a design basis.'
        : null,
  };
}
