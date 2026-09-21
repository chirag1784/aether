// packages/calculations/units.js
// Deterministic unit normalization with a recorded conversion trail.
// Every conversion returns the steps it took, so a threshold comparison can
// print its own arithmetic. No LLM touches this file.

export const UNITS_VERSION = 'units-1.0.0';

// --- mass: canonical kg -----------------------------------------------------
const MASS = {
  mg: 1e-6,
  g: 1e-3,
  kg: 1,
  q: 100, // quintal
  t: 1000,
  mt: 1000, // metric tonne
  tonne: 1000,
  tonnes: 1000,
  ton: 1000, // metric ton assumed; flagged below
  lb: 0.45359237,
  lbs: 0.45359237,
};

// --- volume: canonical L ----------------------------------------------------
const VOLUME = {
  ml: 1e-3,
  l: 1,
  lit: 1,
  litre: 1,
  litres: 1,
  liter: 1,
  kl: 1000,
  m3: 1000,
  cum: 1000,
  gal: 3.785411784, // US liquid gallon
  usgal: 3.785411784,
  impgal: 4.54609,
};

// --- temperature: canonical degC -------------------------------------------
const TEMP_UNITS = ['c', 'degc', '°c', 'celsius', 'k', 'kelvin', 'f', 'degf', '°f', 'fahrenheit'];

// --- pressure: canonical bar(g|a) ------------------------------------------
// Pressure needs a gauge/absolute basis; we keep the basis rather than guess.
const PRESSURE = {
  bar: 1,
  barg: 1,
  bara: 1,
  kpa: 0.01,
  mpa: 10,
  pa: 1e-5,
  psi: 0.0689475729,
  psig: 0.0689475729,
  psia: 0.0689475729,
  atm: 1.01325,
  kgcm2: 0.980665,
  'kg/cm2': 0.980665,
  mmhg: 0.001333224,
  torr: 0.001333224,
};

export function normalizeUnitToken(unit) {
  if (unit === null || unit === undefined) return '';
  return String(unit)
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/³/g, '3')
    .replace(/^m\^3$/, 'm3')
    .replace(/^cubicmet(er|re)s?$/, 'm3')
    .replace(/^kg\/cm²$/, 'kg/cm2')
    .replace(/^kgf?\/cm2$/, 'kg/cm2')
    .replace(/[.]$/, '');
}

export function unitDimension(unit) {
  const u = normalizeUnitToken(unit);
  if (Object.prototype.hasOwnProperty.call(MASS, u)) return 'mass';
  if (Object.prototype.hasOwnProperty.call(VOLUME, u)) return 'volume';
  if (TEMP_UNITS.indexOf(u) !== -1) return 'temperature';
  if (Object.prototype.hasOwnProperty.call(PRESSURE, u)) return 'pressure';
  return null;
}

function fail(reason, detail) {
  return { ok: false, reason, detail: detail || null, value: null, unit: null, steps: [] };
}

/**
 * Convert a mass quantity to kg.
 * @returns {Object} { ok, value, unit:'kg', steps[], notes[] }
 */
export function toKg(qty, unit) {
  const u = normalizeUnitToken(unit);
  if (!Object.prototype.hasOwnProperty.call(MASS, u)) return fail('UNKNOWN_MASS_UNIT', u);
  const n = Number(qty);
  if (!Number.isFinite(n)) return fail('NON_NUMERIC_QUANTITY', qty);
  const factor = MASS[u];
  const notes = [];
  if (u === 'ton') notes.push('"ton" read as metric tonne (1000 kg); confirm against the source document.');
  return {
    ok: true,
    value: n * factor,
    unit: 'kg',
    steps: [{ from: n + ' ' + u, factor, to: n * factor + ' kg', rule: '1 ' + u + ' = ' + factor + ' kg' }],
    notes,
  };
}

/** Convert a volume quantity to litres. */
export function toLitres(qty, unit) {
  const u = normalizeUnitToken(unit);
  if (!Object.prototype.hasOwnProperty.call(VOLUME, u)) return fail('UNKNOWN_VOLUME_UNIT', u);
  const n = Number(qty);
  if (!Number.isFinite(n)) return fail('NON_NUMERIC_QUANTITY', qty);
  const factor = VOLUME[u];
  const notes = [];
  if (u === 'gal' || u === 'usgal') notes.push('US liquid gallon assumed.');
  return {
    ok: true,
    value: n * factor,
    unit: 'L',
    steps: [{ from: n + ' ' + u, factor, to: n * factor + ' L', rule: '1 ' + u + ' = ' + factor + ' L' }],
    notes,
  };
}

/**
 * Convert any mass or volume quantity to kg. A volume needs a density with a
 * usable status — there is no default density.
 *
 * @param {Object} req { qty, unit, density, densityUnit, densityStatus }
 * @returns {Object} { ok, value, unit:'kg', steps[], notes[], reason? }
 */
export function toMassKg(req) {
  const r = req || {};
  const dim = unitDimension(r.unit);
  if (dim === 'mass') return toKg(r.qty, r.unit);
  if (dim !== 'volume') return fail('NOT_A_QUANTITY_UNIT', normalizeUnitToken(r.unit));

  const vol = toLitres(r.qty, r.unit);
  if (!vol.ok) return vol;

  if (r.density === null || r.density === undefined || !Number.isFinite(Number(r.density))) {
    return {
      ok: false,
      reason: 'DENSITY_REQUIRED_FOR_VOLUME_TO_MASS',
      detail: 'Inventory is a volume; a density with a usable status is required. No default density is applied.',
      value: null,
      unit: null,
      steps: vol.steps,
    };
  }
  if (r.densityStatus && ['VERIFIED', 'USER_CONFIRMED', 'DOCUMENT_EXTRACTED', 'WEB_SOURCED'].indexOf(r.densityStatus) === -1) {
    return {
      ok: false,
      reason: 'DENSITY_STATUS_NOT_USABLE',
      detail: 'Density status is ' + r.densityStatus + '; an inferred density cannot support a threshold conclusion.',
      value: null,
      unit: null,
      steps: vol.steps,
    };
  }

  // Density canonical unit: kg/L. Accept kg/m3 and g/cm3.
  const du = normalizeUnitToken(r.densityUnit || 'kg/l');
  let dKgPerL;
  let dRule;
  if (du === 'kg/l' || du === 'kgl' || du === 'g/ml' || du === 'g/cm3' || du === 'sg' || du === '') {
    dKgPerL = Number(r.density);
    dRule = '1 kg/L';
  } else if (du === 'kg/m3' || du === 'kgm3' || du === 'g/l') {
    dKgPerL = Number(r.density) / 1000;
    dRule = '1 kg/m3 = 0.001 kg/L';
  } else {
    return fail('UNKNOWN_DENSITY_UNIT', du);
  }
  if (!(dKgPerL > 0)) return fail('NON_POSITIVE_DENSITY', r.density);

  const kg = vol.value * dKgPerL;
  return {
    ok: true,
    value: kg,
    unit: 'kg',
    steps: vol.steps.concat([
      { from: vol.value + ' L', factor: dKgPerL, to: kg + ' kg', rule: 'density ' + r.density + ' ' + (r.densityUnit || 'kg/L') + ' (' + dRule + ')' },
    ]),
    notes: (vol.notes || []).concat(['Volume converted to mass using a declared density; the density source is cited with the result.']),
  };
}

/** Temperature to degrees Celsius. */
export function toCelsius(value, unit) {
  const u = normalizeUnitToken(unit);
  const n = Number(value);
  if (!Number.isFinite(n)) return fail('NON_NUMERIC_QUANTITY', value);
  if (u === 'c' || u === 'degc' || u === '°c' || u === 'celsius' || u === '') {
    return { ok: true, value: n, unit: 'degC', steps: [{ from: n + ' °C', to: n + ' °C', rule: 'identity' }], notes: [] };
  }
  if (u === 'k' || u === 'kelvin') {
    return { ok: true, value: n - 273.15, unit: 'degC', steps: [{ from: n + ' K', to: n - 273.15 + ' °C', rule: '°C = K - 273.15' }], notes: [] };
  }
  if (u === 'f' || u === 'degf' || u === '°f' || u === 'fahrenheit') {
    const c = ((n - 32) * 5) / 9;
    return { ok: true, value: c, unit: 'degC', steps: [{ from: n + ' °F', to: c + ' °C', rule: '°C = (°F - 32) x 5/9' }], notes: [] };
  }
  return fail('UNKNOWN_TEMPERATURE_UNIT', u);
}

/**
 * Pressure to bar, preserving the gauge/absolute basis. A value whose basis is
 * unknown is returned with basis 'UNKNOWN' and must not be compared with a
 * value of a different basis.
 */
export function toBar(value, unit) {
  const u = normalizeUnitToken(unit);
  if (!Object.prototype.hasOwnProperty.call(PRESSURE, u)) return fail('UNKNOWN_PRESSURE_UNIT', u);
  const n = Number(value);
  if (!Number.isFinite(n)) return fail('NON_NUMERIC_QUANTITY', value);
  const basis = /g$/.test(u) ? 'GAUGE' : /a$/.test(u) || u === 'atm' ? 'ABSOLUTE' : 'UNKNOWN';
  const factor = PRESSURE[u];
  return {
    ok: true,
    value: n * factor,
    unit: 'bar',
    basis,
    steps: [{ from: n + ' ' + u, factor, to: n * factor + ' bar', rule: '1 ' + u + ' = ' + factor + ' bar' }],
    notes: basis === 'UNKNOWN' ? ['Gauge/absolute basis not stated in the source; comparison across bases is blocked.'] : [],
  };
}

/**
 * Compare two pressures safely. Returns null when the bases are not
 * comparable — the caller must then report a data gap, not a conclusion.
 */
export function comparePressure(a, b) {
  if (!a || !b || !a.ok || !b.ok) return null;
  if (a.basis !== b.basis && a.basis !== 'UNKNOWN' && b.basis !== 'UNKNOWN') {
    // gauge vs absolute differ by 1.01325 bar; refuse rather than assume site elevation
    return { comparable: false, reason: 'PRESSURE_BASIS_MISMATCH', a, b };
  }
  if (a.basis === 'UNKNOWN' || b.basis === 'UNKNOWN') {
    return { comparable: false, reason: 'PRESSURE_BASIS_UNKNOWN', a, b };
  }
  return { comparable: true, delta: a.value - b.value, a, b };
}

/** Round for display without losing the stored precision. */
export function fmt(n, dp) {
  if (n === null || n === undefined || !Number.isFinite(Number(n))) return '—';
  const d = dp === undefined ? 3 : dp;
  const v = Number(n);
  const r = Number(v.toFixed(d));
  return String(r);
}
