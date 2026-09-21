// packages/chemical/properties.js
// Chemical identity resolution and the fixed property schema (MASTER_STRUCTURE §7.2).
// The property key list is fixed so the alert engine can rely on it.

export const CHEM_VERSION = 'chemical-1.0.0';

/**
 * CAS check-digit validation. Not a regex: the last digit is
 * sum(digit_i * position_from_right) mod 10.
 * 64-19-7 (acetic acid) validates; 64-19-8 does not.
 */
export function validateCas(cas) {
  const s = String(cas || '').trim();
  const m = /^(\d{2,7})-(\d{2})-(\d)$/.exec(s);
  if (!m) return { valid: false, reason: 'FORMAT', normalized: null };
  const digits = (m[1] + m[2]).split('').reverse();
  let sum = 0;
  for (let i = 0; i < digits.length; i += 1) sum += Number(digits[i]) * (i + 1);
  const expected = sum % 10;
  const given = Number(m[3]);
  if (expected !== given) return { valid: false, reason: 'CHECK_DIGIT', normalized: s, expected, given };
  return { valid: true, reason: 'OK', normalized: s };
}

function normName(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/\(.*?\)/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

/**
 * Resolve a chemical identity against the project's own chemical list and any
 * supplied reference entries. There is no built-in chemical database: the
 * system does not invent a CAS number for a name it has not been given.
 *
 * @param {Object} input { name, cas, synonyms[] }
 * @param {Array} known  existing chemical records to match against
 * @returns {Object} { canonicalName, cas, casValid, matchKind, candidates[], notes[] }
 */
export function resolveChemical(input, known) {
  const inp = input || {};
  const list = known || [];
  const notes = [];
  const casCheck = inp.cas ? validateCas(inp.cas) : null;
  if (casCheck && !casCheck.valid) {
    notes.push(
      casCheck.reason === 'CHECK_DIGIT'
        ? 'CAS ' + inp.cas + ' fails its check digit (expected final digit ' + casCheck.expected + '). Correct it against the source document.'
        : 'CAS "' + inp.cas + '" is not in the format nnnnnnn-nn-n.'
    );
  }

  if (casCheck && casCheck.valid) {
    const hit = list.filter((k) => k.cas === casCheck.normalized);
    if (hit.length === 1) {
      return { canonicalName: hit[0].canonicalName || hit[0].name, cas: casCheck.normalized, casValid: true, matchKind: 'EXACT_CAS', candidates: hit, notes };
    }
    if (hit.length > 1) {
      return { canonicalName: null, cas: casCheck.normalized, casValid: true, matchKind: 'AMBIGUOUS', candidates: hit, notes: notes.concat(['More than one inventory record carries this CAS.']) };
    }
    return { canonicalName: inp.name || null, cas: casCheck.normalized, casValid: true, matchKind: 'EXACT_CAS', candidates: [], notes };
  }

  const n = normName(inp.name);
  if (!n) return { canonicalName: null, cas: null, casValid: casCheck ? casCheck.valid : null, matchKind: 'UNRESOLVED', candidates: [], notes: notes.concat(['No name or CAS supplied.']) };

  const exact = list.filter((k) => normName(k.canonicalName || k.name) === n);
  if (exact.length === 1) {
    return { canonicalName: exact[0].canonicalName || exact[0].name, cas: exact[0].cas || null, casValid: exact[0].cas ? validateCas(exact[0].cas).valid : null, matchKind: 'EXACT_NAME', candidates: exact, notes };
  }
  if (exact.length > 1) return { canonicalName: null, cas: null, casValid: null, matchKind: 'AMBIGUOUS', candidates: exact, notes };

  const syn = list.filter((k) => (k.synonyms || []).some((s) => normName(s) === n));
  if (syn.length === 1) {
    return { canonicalName: syn[0].canonicalName || syn[0].name, cas: syn[0].cas || null, casValid: syn[0].cas ? validateCas(syn[0].cas).valid : null, matchKind: 'SYNONYM', candidates: syn, notes };
  }
  if (syn.length > 1) return { canonicalName: null, cas: null, casValid: null, matchKind: 'AMBIGUOUS', candidates: syn, notes };

  return {
    canonicalName: inp.name || null,
    cas: casCheck && casCheck.valid ? casCheck.normalized : null,
    casValid: casCheck ? casCheck.valid : null,
    matchKind: 'UNRESOLVED',
    candidates: [],
    notes: notes.concat(['Not matched to an existing inventory record. Confirm the identity before any threshold evaluation.']),
  };
}

/** Identity states that block every downstream legal threshold conclusion. */
export function identityBlocksThreshold(resolution) {
  if (!resolution) return true;
  if (resolution.matchKind === 'AMBIGUOUS' || resolution.matchKind === 'UNRESOLVED') return true;
  if (resolution.casValid === false) return true;
  return false;
}

// ---------------------------------------------------------------------------
// Property schema
// ---------------------------------------------------------------------------

export const PROPERTY_GROUPS = Object.freeze([
  {
    key: 'identity',
    label: 'Identity',
    properties: [
      { key: 'ecNumber', label: 'EC number', type: 'text' },
      { key: 'formula', label: 'Molecular formula', type: 'text' },
      { key: 'molecularWeight', label: 'Molecular weight', type: 'number', unit: 'g/mol' },
    ],
  },
  {
    key: 'physical',
    label: 'Physical',
    properties: [
      { key: 'meltingPoint', label: 'Melting / freezing point', type: 'number', unit: 'degC' },
      { key: 'boilingPoint', label: 'Boiling point', type: 'number', unit: 'degC' },
      { key: 'density', label: 'Density', type: 'number', unit: 'kg/L' },
      { key: 'vapourPressure', label: 'Vapour pressure', type: 'number', unit: 'bar', needsTemperature: true },
      { key: 'vapourDensity', label: 'Vapour density (air = 1)', type: 'number' },
      { key: 'solubility', label: 'Solubility in water', type: 'text' },
      { key: 'ph', label: 'pH', type: 'number' },
      { key: 'viscosity', label: 'Viscosity', type: 'number', unit: 'cP' },
      { key: 'conductivityLow', label: 'Low electrical conductivity (static-accumulating)', type: 'boolean' },
    ],
  },
  {
    key: 'fire',
    label: 'Fire / explosion',
    properties: [
      { key: 'flashPoint', label: 'Flash point', type: 'number', unit: 'degC', critical: true },
      { key: 'autoignitionTemperature', label: 'Autoignition temperature', type: 'number', unit: 'degC' },
      { key: 'lel', label: 'LEL', type: 'number', unit: 'vol%' },
      { key: 'uel', label: 'UEL', type: 'number', unit: 'vol%' },
      { key: 'flammabilityClass', label: 'Flammability class', type: 'text' },
      { key: 'oxidizing', label: 'Oxidizing', type: 'boolean' },
      { key: 'decompositionTemperature', label: 'Decomposition onset temperature', type: 'number', unit: 'degC', critical: true },
    ],
  },
  {
    key: 'dust',
    label: 'Dust',
    properties: [
      { key: 'combustibleDust', label: 'Combustible-dust evidence', type: 'boolean', critical: true },
      { key: 'kst', label: 'Kst', type: 'number', unit: 'bar·m/s' },
      { key: 'pmax', label: 'Pmax', type: 'number', unit: 'bar' },
      { key: 'mie', label: 'MIE', type: 'number', unit: 'mJ' },
      { key: 'mitCloud', label: 'MIT (cloud)', type: 'number', unit: 'degC' },
      { key: 'mitLayer', label: 'MIT (layer)', type: 'number', unit: 'degC' },
      { key: 'particleSize', label: 'Particle size relevance', type: 'text' },
    ],
  },
  {
    key: 'tox',
    label: 'Toxicology / exposure',
    properties: [
      { key: 'acuteToxicity', label: 'Acute toxicity', type: 'text', critical: true },
      { key: 'inhalation', label: 'Inhalation effects', type: 'text' },
      { key: 'dermal', label: 'Dermal effects', type: 'text' },
      { key: 'eyeSkin', label: 'Eye / skin', type: 'text' },
      { key: 'sensitization', label: 'Sensitization', type: 'text' },
      { key: 'carcinogenicity', label: 'Carcinogenicity', type: 'text' },
      { key: 'reproductiveToxicity', label: 'Reproductive toxicity', type: 'text' },
      { key: 'stot', label: 'STOT', type: 'text' },
      { key: 'twa', label: 'TWA', type: 'number', unit: 'ppm' },
      { key: 'stel', label: 'STEL', type: 'number', unit: 'ppm' },
      { key: 'ceiling', label: 'Ceiling', type: 'number', unit: 'ppm' },
      { key: 'idlh', label: 'IDLH', type: 'number', unit: 'ppm', authoritativeOnly: true },
    ],
  },
  {
    key: 'reactivity',
    label: 'Reactivity',
    properties: [
      { key: 'incompatibleMaterials', label: 'Incompatible materials', type: 'list', critical: true },
      { key: 'hazardousReactions', label: 'Hazardous reactions', type: 'text' },
      { key: 'decompositionProducts', label: 'Hazardous decomposition products', type: 'text' },
      { key: 'waterReactive', label: 'Water reactive', type: 'boolean' },
      { key: 'polymerization', label: 'Hazardous polymerization', type: 'boolean' },
      { key: 'incompatibleMoc', label: 'Incompatible materials of construction', type: 'list' },
    ],
  },
  {
    key: 'environment',
    label: 'Environment',
    properties: [
      { key: 'aquaticToxicity', label: 'Aquatic toxicity', type: 'text' },
      { key: 'persistence', label: 'Persistence', type: 'text' },
      { key: 'bioaccumulation', label: 'Bioaccumulation', type: 'text' },
    ],
  },
  {
    key: 'transport',
    label: 'Transport / GHS',
    properties: [
      { key: 'unNumber', label: 'UN number', type: 'text' },
      { key: 'transportClass', label: 'Transport class', type: 'text' },
      { key: 'packingGroup', label: 'Packing group', type: 'text' },
      { key: 'signalWord', label: 'Signal word', type: 'text' },
      { key: 'pictograms', label: 'Pictograms', type: 'list' },
      { key: 'hStatements', label: 'H statements', type: 'list' },
      { key: 'pStatements', label: 'P statements', type: 'list' },
    ],
  },
]);

export const ALL_PROPERTIES = Object.freeze(
  PROPERTY_GROUPS.reduce((acc, g) => acc.concat(g.properties.map((p) => Object.assign({}, p, { group: g.key, groupLabel: g.label }))), [])
);

export function propertyMeta(key) {
  return ALL_PROPERTIES.filter((p) => p.key === key)[0] || null;
}

export const CRITICAL_PROPERTIES = Object.freeze(ALL_PROPERTIES.filter((p) => p.critical).map((p) => p.key));

// Chemical source classes in priority order (MASTER_STRUCTURE §7.1).
export const CHEM_SOURCE_CLASSES = Object.freeze([
  { key: 'SUPPLIER_SDS', label: 'Manufacturer / supplier SDS', rank: 1 },
  { key: 'REGULATOR_DB', label: 'Government or regulator database', rank: 2 },
  { key: 'OCCUPATIONAL_DB', label: 'Occupational-health database', rank: 3 },
  { key: 'SCIENTIFIC_DB', label: 'Scientific chemical database', rank: 4 },
  { key: 'LITERATURE', label: 'Peer-reviewed literature', rank: 5 },
  { key: 'OTHER_TECHNICAL', label: 'Other technical source', rank: 6 },
]);

export function chemSourceRank(key) {
  const c = CHEM_SOURCE_CLASSES.filter((x) => x.key === key)[0];
  return c ? c.rank : CHEM_SOURCE_CLASSES.length + 1;
}

/**
 * SDS completeness for one chemical: how many critical properties have a
 * usable status. Returns what is missing, not just a number.
 */
export function sdsCompleteness(chemicalId, properties) {
  const usable = ['VERIFIED', 'USER_CONFIRMED', 'DOCUMENT_EXTRACTED', 'WEB_SOURCED'];
  const rows = (properties || []).filter((p) => p.chemicalId === chemicalId);
  const missing = [];
  const conflicts = [];
  let present = 0;
  for (const key of CRITICAL_PROPERTIES) {
    const p = rows.filter((x) => x.key === key)[0];
    if (p && p.status === 'CONFLICT') {
      conflicts.push(key);
      continue;
    }
    if (p && (usable.indexOf(p.status) !== -1 || p.status === 'NOT_APPLICABLE')) present += 1;
    else missing.push(key);
  }
  const total = CRITICAL_PROPERTIES.length;
  return {
    percent: total ? Math.round((present / total) * 100) : 0,
    present,
    total,
    missing,
    conflicts,
    missingLabels: missing.map((k) => (propertyMeta(k) || {}).label || k),
    status: conflicts.length ? 'CONFLICT' : missing.length === 0 ? 'COMPLETE' : present === 0 ? 'NONE' : 'PARTIAL',
  };
}
