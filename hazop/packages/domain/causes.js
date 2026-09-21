// packages/domain/causes.js
// Cause / consequence / safeguard families (MASTER_STRUCTURE §12).
// Families exist so a node cannot quietly omit a whole class of failure and so
// the completeness check can say which classes were not considered.

export const FAMILIES_VERSION = 'families-1.0.0';

export const CAUSE_FAMILIES = Object.freeze([
  { key: 'HUMAN_ERROR', label: 'Human error', group: 'Human', prompts: ['Wrong quantity charged', 'Step missed or done out of sequence', 'Wrong valve operated'] },
  { key: 'WRONG_MATERIAL', label: 'Wrong material / wrong sequence', group: 'Human', prompts: ['Wrong drum picked', 'Unlabelled container', 'Charging order reversed'] },
  { key: 'CHARGE_ERROR', label: 'Excess or insufficient charge', group: 'Human', prompts: ['Weighing balance out of calibration', 'Manual charge not verified'] },
  { key: 'VALVE_FAILURE', label: 'Valve failure / wrong line-up', group: 'Equipment', prompts: ['Auto valve fails to open', 'Valve passing', 'Manual valve left open'] },
  { key: 'PUMP_FAILURE', label: 'Pump failure', group: 'Equipment', prompts: ['Pump trip', 'Dry running', 'Seal failure'] },
  { key: 'CONTROL_LOOP', label: 'Control-loop failure', group: 'Control', prompts: ['Controller in manual', 'Setpoint wrong', 'Loop oscillation'] },
  { key: 'INSTRUMENT_FAILURE', label: 'Instrument failure', group: 'Control', prompts: ['TG / PG reading wrong', 'Transmitter drift', 'Sensor fouled'] },
  { key: 'PLC_DCS', label: 'PLC / DCS failure', group: 'Control', prompts: ['I/O card failure', 'Logic fault', 'Communication loss'] },
  { key: 'TRIP_BYPASS', label: 'Trip bypassed or defeated', group: 'Control', prompts: ['Interlock in override', 'Trip not reinstated after maintenance'] },
  { key: 'UTILITY_FAILURE', label: 'Utility failure', group: 'Utility', prompts: ['Power failure', 'Instrument air failure', 'Cooling water failure', 'Nitrogen failure'] },
  { key: 'BLOCKAGE', label: 'Blockage / choking / fouling / scaling', group: 'Equipment', prompts: ['Line choked', 'Jacket scaled', 'Sieve blinded'] },
  { key: 'LEAKAGE', label: 'Line rupture / leakage', group: 'Containment', prompts: ['Gasket failure', 'Hose failure', 'Corrosion'] },
  { key: 'OVERHEATING', label: 'Over- or under-heating', group: 'Thermal', prompts: ['Heating valve fails open', 'Thermic fluid temperature high'] },
  { key: 'COOLING_FAILURE', label: 'Cooling failure', group: 'Thermal', prompts: ['Chiller trip', 'Brine circulation pump failure'] },
  { key: 'AGITATION_FAILURE', label: 'Agitation failure', group: 'Equipment', prompts: ['Gearbox failure', 'Stirrer decoupled', 'Motor trip'] },
  { key: 'VENT_BLOCKAGE', label: 'Vent blockage', group: 'Containment', prompts: ['Vent line plugged with solids', 'Flame arrestor fouled'] },
  { key: 'RELIEF_ISOLATION', label: 'Relief isolated or unavailable', group: 'Containment', prompts: ['PSV isolation valve closed', 'Rupture disc already burst'] },
  { key: 'STATIC', label: 'Static electricity', group: 'Ignition', prompts: ['Powder charging into flammable atmosphere', 'Ungrounded drum', 'Non-conductive hose'] },
  { key: 'INCOMPATIBLE', label: 'Incompatible chemicals', group: 'Reaction', prompts: ['Cross-contamination', 'Wrong material into reactor', 'Co-storage'] },
  { key: 'RUNAWAY', label: 'Runaway reaction / decomposition', group: 'Reaction', prompts: ['Accumulation of unreacted material', 'Loss of cooling during exotherm'] },
  { key: 'REVERSE_FLOW', label: 'Reverse flow', group: 'Process', prompts: ['NRV passing', 'Higher downstream pressure'] },
  { key: 'CONTAMINATION', label: 'Contamination', group: 'Quality', prompts: ['Previous batch residue', 'Water ingress', 'Rust'] },
  { key: 'MAINTENANCE_ERROR', label: 'Maintenance error', group: 'Human', prompts: ['Wrong gasket material', 'Blind left in place', 'Work permit not followed'] },
  { key: 'COMMON_CAUSE', label: 'Common-cause failure', group: 'Systemic', prompts: ['Shared power supply', 'Shared instrument air', 'Single transmitter for control and trip'] },
  { key: 'EXTERNAL', label: 'External event', group: 'Systemic', prompts: ['Adjacent plant incident', 'Flooding', 'Loss of site utilities'] },
]);

export const CONSEQUENCE_FAMILIES = Object.freeze([
  // People
  { key: 'EXPOSURE', label: 'Personnel exposure', dimension: 'people' },
  { key: 'INJURY', label: 'Injury', dimension: 'people' },
  { key: 'BURN', label: 'Thermal or chemical burn', dimension: 'people' },
  { key: 'POISONING', label: 'Poisoning / asphyxiation', dimension: 'people' },
  { key: 'FATALITY', label: 'Fatality', dimension: 'people' },
  // Fire / explosion
  { key: 'POOL_FIRE', label: 'Pool fire', dimension: 'fire' },
  { key: 'FLASH_FIRE', label: 'Flash fire', dimension: 'fire' },
  { key: 'JET_FIRE', label: 'Jet fire', dimension: 'fire', requiresMechanism: 'Pressurised release of a flammable' },
  { key: 'DUST_FIRE', label: 'Dust fire', dimension: 'fire' },
  { key: 'DUST_EXPLOSION', label: 'Dust explosion', dimension: 'fire', requiresMechanism: 'Combustible dust evidence + ignition source + confinement' },
  { key: 'VCE', label: 'Vapour-cloud explosion', dimension: 'fire', requiresMechanism: 'Flammable vapour release + confinement/congestion' },
  { key: 'OVERPRESSURE', label: 'Vessel overpressure / rupture', dimension: 'fire' },
  { key: 'RUNAWAY', label: 'Runaway reaction / decomposition', dimension: 'fire' },
  // Environment
  { key: 'AIR_RELEASE', label: 'Air release', dimension: 'environment' },
  { key: 'WATER_SOIL', label: 'Water / soil contamination', dimension: 'environment' },
  { key: 'WASTE', label: 'Hazardous-waste generation', dimension: 'environment' },
  // Business
  { key: 'EQUIPMENT_DAMAGE', label: 'Equipment damage', dimension: 'business' },
  { key: 'PRODUCTION_LOSS', label: 'Production loss', dimension: 'business' },
  { key: 'OFF_SPEC', label: 'Off-specification product', dimension: 'business' },
  { key: 'PROCESS_DELAY', label: 'Process delay', dimension: 'business' },
  { key: 'NO_CONSEQUENCE', label: 'No safety consequence', dimension: 'none' },
]);

export const SAFEGUARD_CLASSES = Object.freeze([
  { key: 'PREVENTION', label: 'Prevention', note: 'Stops the cause from producing the deviation' },
  { key: 'DETECTION', label: 'Detection', note: 'Reveals the deviation in time to act' },
  { key: 'CONTROL', label: 'Control', note: 'Holds the deviation within safe limits' },
  { key: 'MITIGATION', label: 'Mitigation', note: 'Reduces the consequence once it occurs' },
  { key: 'EMERGENCY_RESPONSE', label: 'Emergency response', note: 'Limits harm after the event' },
  { key: 'ADMINISTRATIVE', label: 'Administrative', note: 'Procedure, training, permit, supervision' },
]);

// Cause families a node of a given character should not silently omit.
const EXPECTED_BY_FACT = Object.freeze({
  anyOperation: ['HUMAN_ERROR', 'MAINTENANCE_ERROR'],
  anyUtility: ['UTILITY_FAILURE'],
  agitator: ['AGITATION_FAILURE'],
  heatingSystem: ['OVERHEATING'],
  coolingSystem: ['COOLING_FAILURE'],
  transferPath: ['VALVE_FAILURE', 'BLOCKAGE'],
  charging: ['CHARGE_ERROR', 'WRONG_MATERIAL'],
  reactionStep: ['RUNAWAY', 'INCOMPATIBLE'],
  staticRisk: ['STATIC'],
  pressureRelevant: ['RELIEF_ISOLATION'],
  holdupVessel: ['VENT_BLOCKAGE'],
  hazardousInventory: ['LEAKAGE'],
});

/**
 * Which cause families the node's facts say should be considered, and which of
 * those no scenario on the node has touched yet.
 *
 * @param {Object} facts   from deriveNodeFacts()
 * @param {Array} scenarios  the node's scenarios
 */
export function causeFamilyCoverage(facts, scenarios) {
  const expected = new Set();
  for (const factKey of Object.keys(EXPECTED_BY_FACT)) {
    if (facts && facts[factKey]) for (const f of EXPECTED_BY_FACT[factKey]) expected.add(f);
  }
  const used = new Set();
  for (const s of scenarios || []) {
    for (const c of s.causes || []) if (c && c.family) used.add(c.family);
  }
  const missing = Array.from(expected).filter((f) => !used.has(f));
  return {
    expected: Array.from(expected),
    used: Array.from(used),
    missing,
    percent: expected.size ? Math.round(((expected.size - missing.length) / expected.size) * 100) : 100,
    labels: missing.map((k) => (CAUSE_FAMILIES.filter((f) => f.key === k)[0] || {}).label || k),
  };
}

/** The severity dimension a scenario's consequences point at. */
export function severityDimensions(consequences) {
  const dims = new Set();
  for (const c of consequences || []) {
    const fam = CONSEQUENCE_FAMILIES.filter((f) => f.key === c.family)[0];
    if (fam && fam.dimension !== 'none') dims.add(fam.dimension);
  }
  return Array.from(dims);
}

// A consequence phrased as a safeguard is a common worksheet error: it credits
// the safeguard before the consequence has been stated.
const SAFEGUARD_PHRASING = [
  /\bprevented by\b/i,
  /\bcontrolled by\b/i,
  /\bmitigated by\b/i,
  /\bno consequence (as|because|since)\b/i,
  /\bavoided (by|due to)\b/i,
  /\btaken care (of )?by\b/i,
];

export function consequenceCreditsSafeguard(text) {
  const t = String(text || '');
  for (const p of SAFEGUARD_PHRASING) {
    if (p.test(t)) {
      return {
        flagged: true,
        reason: 'CONSEQUENCE_CREDITS_SAFEGUARD',
        detail: 'Consequences are assessed before safeguard credit. Record the unmitigated consequence here and list the safeguard in the safeguards column.',
      };
    }
  }
  return { flagged: false };
}

/** Free-text cause to a family, for extraction and AI-drafted rows. */
export function classifyCause(text) {
  const t = String(text || '').toLowerCase();
  const rules = [
    [/human\s*error|operator\s*error|wrong\s*(valve|drum|material)|manual\s*mistake/, 'HUMAN_ERROR'],
    [/weigh(ing)?\s*(balance|scale)|excess\s*charge|less\s*charge|over\s*charg/, 'CHARGE_ERROR'],
    [/power\s*failure|instrument\s*air|utility|nitrogen\s*failure|steam\s*failure/, 'UTILITY_FAILURE'],
    [/valve\s*(malfunction|fail|pass|stuck)|line-?up/, 'VALVE_FAILURE'],
    [/pump\s*(fail|trip|seal)/, 'PUMP_FAILURE'],
    [/stirrer|agitat|gear\s*box|decoupl/, 'AGITATION_FAILURE'],
    [/chok|block|scal|foul|blind/, 'BLOCKAGE'],
    [/leak|ruptur|gasket|hose\s*fail|corros/, 'LEAKAGE'],
    [/cooling\s*(fail|loss)|chiller|brine/, 'COOLING_FAILURE'],
    [/over\s*heat|high\s*temp|tfh|thermic/, 'OVERHEATING'],
    [/static|earth|ground|bond/, 'STATIC'],
    [/incompat|contaminat|cross/, 'INCOMPATIBLE'],
    [/runaway|decompos|exotherm/, 'RUNAWAY'],
    [/reverse\s*flow|nrv|non\s*return/, 'REVERSE_FLOW'],
    [/instrument|transmitter|sensor|gauge|tg\b|pg\b|calibrat/, 'INSTRUMENT_FAILURE'],
    [/plc|dcs|logic|i\/o/, 'PLC_DCS'],
    [/bypass|override|interlock\s*defeat/, 'TRIP_BYPASS'],
    [/maintenance|permit|shutdown\s*work/, 'MAINTENANCE_ERROR'],
    [/vent\s*(block|plug)|flame\s*arrest/, 'VENT_BLOCKAGE'],
    [/psv|relief|rupture\s*disc/, 'RELIEF_ISOLATION'],
    [/clock|timer|time/, 'HUMAN_ERROR'],
  ];
  for (const [re, key] of rules) if (re.test(t)) return key;
  return null;
}

/** Free-text consequence to a family. */
export function classifyConsequence(text) {
  const t = String(text || '').toLowerCase();
  const rules = [
    [/fatal|death/, 'FATALITY'],
    [/dust\s*explosion/, 'DUST_EXPLOSION'],
    [/dust(ing)?\b/, 'EXPOSURE'],
    [/flash\s*fire/, 'FLASH_FIRE'],
    [/pool\s*fire/, 'POOL_FIRE'],
    [/jet\s*fire/, 'JET_FIRE'],
    [/vapour\s*cloud|vce/, 'VCE'],
    [/fire\s*hazard|fire\b/, 'FLASH_FIRE'],
    [/overpressure|ruptur|burst/, 'OVERPRESSURE'],
    [/runaway|decompos/, 'RUNAWAY'],
    [/burn|scald/, 'BURN'],
    [/poison|asphyx|toxic\s*exposure/, 'POISONING'],
    [/exposure|inhalation|skin\s*contact|health\s*impact/, 'EXPOSURE'],
    [/injur/, 'INJURY'],
    [/air\s*(release|emission)/, 'AIR_RELEASE'],
    [/effluent|water\s*contam|soil\s*contam|spill/, 'WATER_SOIL'],
    [/waste/, 'WASTE'],
    [/equipment\s*damage|damage\s*to/, 'EQUIPMENT_DAMAGE'],
    [/production\s*loss|batch\s*loss|utility\/energy\s*loss|energy\s*loss/, 'PRODUCTION_LOSS'],
    [/off\s*spec|quality\s*(impact|affect)|no\s*reaction|improper\s*reaction/, 'OFF_SPEC'],
    [/delay/, 'PROCESS_DELAY'],
    [/no\s*safety\s*consequence/, 'NO_CONSEQUENCE'],
  ];
  for (const [re, key] of rules) if (re.test(t)) return key;
  return null;
}

/** Free-text safeguard to a class. */
export function classifySafeguard(text) {
  const t = String(text || '').toLowerCase();
  if (/alarm|detector|detection|monitor|indicat|gauge|analys/.test(t)) return 'DETECTION';
  if (/interlock|trip|shutdown|esd|psv|relief|rupture\s*disc|arrestor|nrv/.test(t)) return 'PREVENTION';
  if (/controller|control\s*loop|thermostat|cascade|dosing\s*control/.test(t)) return 'CONTROL';
  if (/extinguisher|hydrant|sprinkler|deluge|scrubber|dyke|bund|spill\s*kit|dust\s*collector|ventilation|earth|ground|bond/.test(t)) return 'MITIGATION';
  if (/emergency|evacuat|first\s*aid|mutual\s*aid|on-?site\s*plan/.test(t)) return 'EMERGENCY_RESPONSE';
  if (/sop|bmr|training|trained|supervis|permit|checklist|doer|checker|calibrat|pm\b|preventive\s*maintenance|label/.test(t)) return 'ADMINISTRATIVE';
  return null;
}
