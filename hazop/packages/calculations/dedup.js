// packages/calculations/dedup.js
// Recommendation deduplication. Merges only on technical equivalence and never
// loses a backlink to the originating scenario.

export const DEDUP_VERSION = 'dedup-1.0.0';

const STOPWORDS = new Set([
  'a', 'an', 'the', 'to', 'of', 'for', 'and', 'or', 'in', 'on', 'at', 'is', 'are', 'be',
  'should', 'shall', 'must', 'may', 'ensure', 'please', 'provide', 'provided', 'providing',
  'system', 'systems', 'all', 'any', 'as', 'per', 'with', 'by', 'from', 'that', 'this',
  'it', 'its', 'do', 'done', 'being', 'shall',
]);

// Words that change the engineering meaning of an action. Two recommendations
// that differ on any of these are NOT equivalent, however similar their wording.
const DISCRIMINATORS = new Set([
  'alarm', 'trip', 'interlock', 'psv', 'relief', 'rupture', 'disc', 'sil', 'sif',
  'nitrogen', 'inerting', 'earthing', 'bonding', 'grounding', 'vent', 'scrubber',
  'flame', 'arrestor', 'detector', 'detection', 'sprinkler', 'deluge', 'hydrant',
  'calibration', 'maintenance', 'pm', 'sop', 'training', 'ppe', 'signage',
  'dyke', 'bund', 'kerb', 'spill', 'kit', 'isolation', 'lockout', 'dust',
  'collector', 'ventilation', 'cooling', 'jacket', 'agitator', 'stirrer',
  'level', 'temperature', 'pressure', 'flow', 'ph', 'sampling', 'valve',
  'nrv', 'check', 'pump', 'blower', 'filter', 'conductivity', 'static',
  'thermic', 'brine', 'chilled', 'steam', 'emergency', 'shutdown', 'esd',
]);

export function tokenize(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s./-]/g, ' ')
    .split(/\s+/)
    .map((t) => t.replace(/^[-./]+|[-./]+$/g, ''))
    .filter((t) => t.length > 1 && !STOPWORDS.has(t));
}

function jaccard(a, b) {
  const sa = new Set(a);
  const sb = new Set(b);
  if (sa.size === 0 && sb.size === 0) return 1;
  let inter = 0;
  for (const t of sa) if (sb.has(t)) inter += 1;
  return inter / (sa.size + sb.size - inter);
}

function discriminatorsOf(tokens) {
  return new Set(tokens.filter((t) => DISCRIMINATORS.has(t)));
}

function setsEqual(a, b) {
  if (a.size !== b.size) return false;
  for (const x of a) if (!b.has(x)) return false;
  return true;
}

export const DEFAULT_SIMILARITY = 0.72;

/**
 * Are two recommendations technically equivalent?
 *
 * Requires: the same equipment scope, the same discriminator set, the same
 * hierarchy-of-control level, and high lexical similarity. Any difference in
 * the discriminator set blocks the merge even at similarity 0.99.
 */
export function isTechnicallyEquivalent(a, b, opts) {
  const o = opts || {};
  const threshold = Number.isFinite(Number(o.threshold)) ? Number(o.threshold) : DEFAULT_SIMILARITY;

  const ta = tokenize(a.text);
  const tb = tokenize(b.text);
  const sim = jaccard(ta, tb);

  const da = discriminatorsOf(ta);
  const db = discriminatorsOf(tb);
  if (!setsEqual(da, db)) {
    return { equivalent: false, similarity: sim, reason: 'DIFFERENT_TECHNICAL_MEASURE', a: Array.from(da), b: Array.from(db) };
  }

  const eqA = (a.equipmentTags || []).slice().sort().join('|');
  const eqB = (b.equipmentTags || []).slice().sort().join('|');
  if (eqA !== eqB) return { equivalent: false, similarity: sim, reason: 'DIFFERENT_EQUIPMENT_SCOPE' };

  if ((a.controlLevel || '') !== (b.controlLevel || '')) {
    return { equivalent: false, similarity: sim, reason: 'DIFFERENT_CONTROL_LEVEL' };
  }
  if (sim < threshold) return { equivalent: false, similarity: sim, reason: 'BELOW_SIMILARITY_THRESHOLD' };
  return { equivalent: true, similarity: sim, reason: 'TECHNICALLY_EQUIVALENT' };
}

/**
 * Deduplicate a list of recommendations.
 * Nothing is deleted: the survivor accumulates mergedFrom[] and every
 * originating scenario keeps a backlink in raisedFrom[].
 *
 * @param {Array} recs [{ id, text, scenarioId, nodeId, equipmentTags[], controlLevel, priority, ... }]
 * @returns {Object} { kept: [...], merges: [{ survivorId, mergedId, similarity }] }
 */
export function deduplicateRecommendations(recs, opts) {
  const list = (recs || []).slice();
  const kept = [];
  const merges = [];

  for (const rec of list) {
    let target = null;
    let verdict = null;
    for (const k of kept) {
      const v = isTechnicallyEquivalent(k, rec, opts);
      if (v.equivalent) {
        target = k;
        verdict = v;
        break;
      }
    }
    if (!target) {
      kept.push(
        Object.assign({}, rec, {
          mergedFrom: (rec.mergedFrom || []).slice(),
          raisedFrom: dedupeRefs((rec.raisedFrom || []).concat([{ scenarioId: rec.scenarioId, nodeId: rec.nodeId, recId: rec.id }])),
        })
      );
      continue;
    }
    target.mergedFrom = dedupeStrings(target.mergedFrom.concat([rec.id]));
    target.raisedFrom = dedupeRefs(
      target.raisedFrom.concat(rec.raisedFrom || [], [{ scenarioId: rec.scenarioId, nodeId: rec.nodeId, recId: rec.id }])
    );
    // The survivor keeps the highest priority and the earliest target date.
    target.priority = higherPriority(target.priority, rec.priority);
    target.targetDate = earlierDate(target.targetDate, rec.targetDate);
    merges.push({ survivorId: target.id, mergedId: rec.id, similarity: verdict.similarity });
  }

  return { kept, merges, engine: DEDUP_VERSION };
}

const PRIORITY_ORDER = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

export function higherPriority(a, b) {
  const ia = PRIORITY_ORDER.indexOf(a);
  const ib = PRIORITY_ORDER.indexOf(b);
  if (ia === -1) return b || a || null;
  if (ib === -1) return a;
  return ia >= ib ? a : b;
}

function earlierDate(a, b) {
  if (!a) return b || null;
  if (!b) return a;
  return String(a) <= String(b) ? a : b;
}

function dedupeStrings(arr) {
  return Array.from(new Set((arr || []).filter(Boolean)));
}

function dedupeRefs(arr) {
  const seen = new Set();
  const out = [];
  for (const r of arr || []) {
    if (!r) continue;
    const k = (r.scenarioId || '') + '|' + (r.nodeId || '') + '|' + (r.recId || '');
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(r);
  }
  return out;
}

// Vague recommendation text the engine flags (MASTER_STRUCTURE §14).
const VAGUE_PATTERNS = [
  /^\s*take\s+care\b/i,
  /^\s*be\s+careful\b/i,
  /^\s*use\s+ppe\.?\s*$/i,
  /^\s*wear\s+ppe\.?\s*$/i,
  /^\s*follow\s+sop\.?\s*$/i,
  /^\s*train\s+(the\s+)?operator\.?\s*$/i,
  /^\s*ensure\s+safety\.?\s*$/i,
  /^\s*good\s+housekeeping\.?\s*$/i,
];

export function assessRecommendationQuality(rec) {
  const text = String((rec && rec.text) || '').trim();
  const issues = [];
  if (text.length < 12) issues.push({ code: 'TOO_SHORT', detail: 'State the measure, the location and the acceptance condition.' });
  for (const p of VAGUE_PATTERNS) {
    if (p.test(text)) {
      issues.push({ code: 'VAGUE_ACTION', detail: 'Replace with a specific measure; consider an engineering control first.' });
      break;
    }
  }
  if (!rec || !rec.controlLevel) issues.push({ code: 'NO_CONTROL_LEVEL', detail: 'Classify against the hierarchy of control.' });
  if (rec && rec.controlLevel === 'PPE') {
    issues.push({ code: 'PPE_AS_PRIMARY', detail: 'PPE is the last resort; record why elimination, substitution or an engineering control is not reasonably practicable.' });
  }
  if (!rec || !rec.responsibleDepartment) issues.push({ code: 'NO_OWNER', detail: 'Assign a responsible department.' });
  if (!rec || !rec.targetDate) issues.push({ code: 'NO_TARGET_DATE', detail: 'Set a target date.' });
  if (!rec || !rec.technicalBasis) issues.push({ code: 'NO_TECHNICAL_BASIS', detail: 'Record the technical basis for the action.' });
  return { ok: issues.length === 0, issues };
}

export const CONTROL_LEVELS = Object.freeze([
  { key: 'ELIMINATE', label: 'Eliminate', rank: 1 },
  { key: 'SUBSTITUTE', label: 'Substitute', rank: 2 },
  { key: 'ENGINEERING', label: 'Engineering control', rank: 3 },
  { key: 'ADMINISTRATIVE', label: 'Administrative control', rank: 4 },
  { key: 'PPE', label: 'PPE', rank: 5 },
]);
