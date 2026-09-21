// packages/domain/guidewords.js
// Guideword x parameter engine. Emits ONLY combinations that are meaningful for
// the node's own facts, each with the rationale that justified it.
//
// A blind cross-product of 11 guidewords x 22 parameters is 242 rows per node.
// That is how worksheets become unreviewable, so this module is a rule table.

export const GUIDEWORD_VERSION = 'guidewords-1.0.0';

export const GUIDEWORDS = Object.freeze([
  { key: 'NO', label: 'NO / NOT', meaning: 'The intent is not achieved at all' },
  { key: 'MORE', label: 'MORE', meaning: 'Quantitative increase' },
  { key: 'LESS', label: 'LESS', meaning: 'Quantitative decrease' },
  { key: 'REVERSE', label: 'REVERSE', meaning: 'Opposite of the intent' },
  { key: 'AS_WELL_AS', label: 'AS WELL AS', meaning: 'Intent achieved plus something else' },
  { key: 'PART_OF', label: 'PART OF', meaning: 'Only some of the intent achieved' },
  { key: 'OTHER_THAN', label: 'OTHER THAN', meaning: 'Something completely different' },
  { key: 'EARLY', label: 'EARLY', meaning: 'Before the intended time' },
  { key: 'LATE', label: 'LATE', meaning: 'After the intended time' },
  { key: 'BEFORE', label: 'BEFORE', meaning: 'Out of sequence, earlier' },
  { key: 'AFTER', label: 'AFTER', meaning: 'Out of sequence, later' },
]);

/**
 * Parameter table. `guidewords` lists the guidewords that have a defined
 * semantic for that parameter — this is the core of the rule table.
 * `requires` names the node facts that must be true for the parameter to exist
 * in the node at all.
 */
export const PARAMETERS = Object.freeze([
  { key: 'flow', label: 'Flow', guidewords: ['NO', 'MORE', 'LESS', 'REVERSE', 'PART_OF', 'OTHER_THAN'], requires: ['transferPath'], group: 'Process' },
  { key: 'quantity', label: 'Quantity', guidewords: ['NO', 'MORE', 'LESS', 'PART_OF', 'OTHER_THAN'], requires: ['charging'], group: 'Process' },
  { key: 'pressure', label: 'Pressure', guidewords: ['MORE', 'LESS', 'NO'], requires: ['pressureRelevant'], group: 'Process' },
  { key: 'vacuum', label: 'Vacuum', guidewords: ['NO', 'MORE', 'LESS'], requires: ['vacuumService'], group: 'Process' },
  { key: 'temperature', label: 'Temperature', guidewords: ['MORE', 'LESS', 'NO'], requires: ['thermalDuty'], group: 'Process' },
  { key: 'level', label: 'Level', guidewords: ['MORE', 'LESS', 'NO'], requires: ['holdupVessel'], group: 'Process' },
  { key: 'time', label: 'Time', guidewords: ['MORE', 'LESS', 'EARLY', 'LATE'], requires: ['timedStep'], group: 'Process' },
  { key: 'agitation', label: 'Agitation', guidewords: ['NO', 'MORE', 'LESS', 'REVERSE'], requires: ['agitator'], group: 'Process' },
  { key: 'composition', label: 'Composition', guidewords: ['AS_WELL_AS', 'PART_OF', 'OTHER_THAN'], requires: ['multiComponent'], group: 'Quality' },
  { key: 'concentration', label: 'Concentration', guidewords: ['MORE', 'LESS', 'OTHER_THAN'], requires: ['solutionHandling'], group: 'Quality' },
  { key: 'ph', label: 'pH', guidewords: ['MORE', 'LESS', 'OTHER_THAN'], requires: ['phControlled'], group: 'Quality' },
  { key: 'reaction', label: 'Reaction', guidewords: ['NO', 'MORE', 'LESS', 'OTHER_THAN', 'EARLY', 'LATE'], requires: ['reactionStep'], group: 'Process' },
  { key: 'heating', label: 'Heating', guidewords: ['NO', 'MORE', 'LESS'], requires: ['heatingSystem'], group: 'Utility' },
  { key: 'cooling', label: 'Cooling', guidewords: ['NO', 'MORE', 'LESS'], requires: ['coolingSystem'], group: 'Utility' },
  { key: 'transfer', label: 'Transfer', guidewords: ['NO', 'MORE', 'LESS', 'REVERSE', 'EARLY', 'LATE', 'PART_OF'], requires: ['transferPath'], group: 'Process' },
  { key: 'charging', label: 'Charging', guidewords: ['NO', 'MORE', 'LESS', 'OTHER_THAN', 'EARLY', 'LATE', 'BEFORE', 'AFTER', 'PART_OF'], requires: ['charging'], group: 'Process' },
  { key: 'discharge', label: 'Discharge', guidewords: ['NO', 'MORE', 'LESS', 'EARLY', 'LATE', 'PART_OF'], requires: ['dischargeStep'], group: 'Process' },
  { key: 'inerting', label: 'Inerting', guidewords: ['NO', 'LESS', 'PART_OF'], requires: ['inertGas'], group: 'Utility' },
  { key: 'ventilation', label: 'Ventilation', guidewords: ['NO', 'LESS'], requires: ['ventilationRelevant'], group: 'Utility' },
  { key: 'sampling', label: 'Sampling', guidewords: ['NO', 'OTHER_THAN', 'EARLY', 'LATE'], requires: ['samplingStep'], group: 'Operations' },
  { key: 'staticCharge', label: 'Static charge', guidewords: ['AS_WELL_AS', 'MORE'], requires: ['staticRisk'], group: 'Hazard' },
  { key: 'utility', label: 'Utility', guidewords: ['NO', 'LESS', 'OTHER_THAN'], requires: ['anyUtility'], group: 'Utility' },
]);

/**
 * Operational deviations that the reference study treats as parameters but that
 * are not guideword-driven. Emitted with guideword OTHER_THAN and a plain
 * deviation phrase.
 */
export const OPERATIONAL_DEVIATIONS = Object.freeze([
  { key: 'startUp', label: 'Start-up', deviation: 'Deviation during start-up', requires: ['anyOperation'] },
  { key: 'shutdown', label: 'Shutdown', deviation: 'Deviation during shutdown', requires: ['anyOperation'] },
  { key: 'emergencyShutdown', label: 'Emergency shutdown', deviation: 'Emergency shutdown not effective', requires: ['anyOperation'] },
  { key: 'maintenance', label: 'Maintenance', deviation: 'Deviation during maintenance / breakdown', requires: ['anyOperation'] },
  { key: 'leakage', label: 'Leakage', deviation: 'Loss of containment / leakage', requires: ['hazardousInventory'] },
  { key: 'exposure', label: 'Exposure', deviation: 'Personnel exposure during the operation', requires: ['manualOperation'] },
  { key: 'quality', label: 'Quality', deviation: 'Off-specification product', requires: ['anyOperation'] },
  { key: 'viscosity', label: 'Viscosity', deviation: 'Viscosity outside the workable range', requires: ['viscousService'] },
]);

export const UTILITIES = Object.freeze([
  { key: 'power', label: 'Electrical power' },
  { key: 'steam', label: 'Steam' },
  { key: 'thermicFluid', label: 'Thermic fluid' },
  { key: 'coolingWater', label: 'Cooling water' },
  { key: 'chilledWater', label: 'Chilled water' },
  { key: 'brine', label: 'Brine' },
  { key: 'nitrogen', label: 'Nitrogen' },
  { key: 'instrumentAir', label: 'Instrument air' },
  { key: 'compressedAir', label: 'Compressed air' },
  { key: 'vacuum', label: 'Vacuum' },
]);

const INERT_UTILITIES = ['nitrogen'];
const HEATING_UTILITIES = ['steam', 'thermicFluid'];
const COOLING_UTILITIES = ['coolingWater', 'chilledWater', 'brine'];

/**
 * Derive the boolean facts that gate parameters, from the node and the
 * equipment / chemical records it references. Nothing is assumed: a fact is
 * true only because a record says so.
 *
 * @param {Object} node
 * @param {Object} ctx { equipment: [...], chemicals: [...], chemProperties: [...] }
 * @returns {Object} facts with a `why` map explaining each true fact
 */
export function deriveNodeFacts(node, ctx) {
  const n = node || {};
  const c = ctx || {};
  const eqAll = c.equipment || [];
  const chAll = c.chemicals || [];
  const props = c.chemProperties || [];

  const eq = eqAll.filter((e) => (n.equipmentIds || []).indexOf(e.id) !== -1);
  const chems = chAll.filter((x) => (n.chemicalIds || []).indexOf(x.id) !== -1);
  const utils = n.utilities || [];
  const why = {};
  const set = (k, v, reason) => {
    if (v && reason) why[k] = reason;
    return v;
  };

  const eqTags = eq.map((e) => e.tag || e.id).join(', ');

  const hasAgitator = eq.some((e) => e.agitator);
  const hasHeating = eq.some((e) => e.heatingSystem) || utils.some((u) => HEATING_UTILITIES.indexOf(u) !== -1);
  const hasCooling = eq.some((e) => e.coolingSystem) || utils.some((u) => COOLING_UTILITIES.indexOf(u) !== -1);
  const isPressure = eq.some((e) => e.pressureEquipment) || utils.indexOf('compressedAir') !== -1;
  const isVacuum = eq.some((e) => e.vacuumService) || utils.indexOf('vacuum') !== -1;
  const holdup = eq.some((e) => e.holdup !== false && (e.capacity || e.type === 'vessel' || e.type === 'reactor' || e.type === 'tank' || e.type === 'mixer' || e.type === 'blender'));
  const powder = chems.some((x) => /solid|powder|granule|flake/i.test(x.physicalState || '')) || eq.some((e) => e.powderHandling);
  const lowConductivityLiquid = chems.some((x) => /liquid/i.test(x.physicalState || '') && propVal(props, x.id, 'conductivityLow') === true);

  const facts = {
    transferPath: set('transferPath', !!(n.hasTransfer || eq.some((e) => e.type === 'pump' || e.type === 'line' || e.transferPath) || (n.lineIds || []).length > 0), 'Node includes a transfer path or pump/line: ' + eqTags),
    charging: set('charging', !!n.hasCharging, 'Node design intent includes a charging step'),
    dischargeStep: set('dischargeStep', !!n.hasDischarge, 'Node design intent includes a discharge / transfer-out step'),
    pressureRelevant: set('pressureRelevant', isPressure, 'Pressure equipment or compressed-air service in node: ' + eqTags),
    vacuumService: set('vacuumService', isVacuum, 'Vacuum service declared in node'),
    thermalDuty: set('thermalDuty', hasHeating || hasCooling, 'Node has a heating or cooling duty'),
    heatingSystem: set('heatingSystem', hasHeating, 'Heating system or heating utility present'),
    coolingSystem: set('coolingSystem', hasCooling, 'Cooling system or cooling utility present'),
    holdupVessel: set('holdupVessel', holdup, 'Node contains a vessel/tank/mixer with hold-up: ' + eqTags),
    timedStep: set('timedStep', !!n.hasTimedStep, 'Node has a time-controlled step (hold, reaction time, mixing time)'),
    agitator: set('agitator', hasAgitator, 'Agitated equipment in node: ' + eqTags),
    multiComponent: set('multiComponent', chems.length > 1, chems.length + ' chemicals present in the node'),
    solutionHandling: set('solutionHandling', chems.some((x) => x.concentration !== undefined && x.concentration !== null && x.concentration !== ''), 'A chemical in the node is handled as a solution with a stated concentration'),
    phControlled: set('phControlled', !!n.phControlled, 'Node declares pH control'),
    reactionStep: set('reactionStep', !!n.isReactionStep, 'Node is a reaction step'),
    inertGas: set('inertGas', utils.some((u) => INERT_UTILITIES.indexOf(u) !== -1), 'Inert gas utility declared on the node'),
    ventilationRelevant: set('ventilationRelevant', !!n.manualOperation || powder || chems.some((x) => propUsable(props, x.id, 'acuteToxicity')), 'Manual operation, powder handling or a toxic material in the node'),
    samplingStep: set('samplingStep', !!n.hasSampling, 'Node includes a sampling step'),
    staticRisk: set('staticRisk', powder || lowConductivityLiquid, powder ? 'Powder / granular handling in the node' : 'Low-conductivity liquid transfer in the node'),
    anyUtility: set('anyUtility', utils.length > 0, 'Utilities declared on the node: ' + utils.join(', ')),
    anyOperation: set('anyOperation', true, 'Every node has an operating sequence'),
    hazardousInventory: set('hazardousInventory', chems.some((x) => x.hazardousClassification || propUsable(props, x.id, 'flashPoint') || propUsable(props, x.id, 'acuteToxicity')), 'A classified or hazardous material is present in the node'),
    manualOperation: set('manualOperation', !!n.manualOperation, 'Node involves a manual operation'),
    viscousService: set('viscousService', !!n.viscousService, 'Node declares a viscous service'),
    powderHandling: set('powderHandling', powder, 'Powder / granular handling in the node'),
  };

  return { facts, why, equipment: eq, chemicals: chems, utilities: utils };
}

function propVal(props, chemId, key) {
  const p = (props || []).filter((x) => x.chemicalId === chemId && x.key === key)[0];
  return p ? p.value : undefined;
}

function propUsable(props, chemId, key) {
  const p = (props || []).filter((x) => x.chemicalId === chemId && x.key === key)[0];
  if (!p) return false;
  return ['VERIFIED', 'USER_CONFIRMED', 'DOCUMENT_EXTRACTED', 'WEB_SOURCED'].indexOf(p.status) !== -1;
}

function deviationPhrase(guidewordKey, parameterLabel) {
  const gw = GUIDEWORDS.filter((g) => g.key === guidewordKey)[0];
  const label = gw ? gw.label : guidewordKey;
  return label + ' ' + parameterLabel.toLowerCase();
}

/**
 * Generate the meaningful deviation set for a node.
 *
 * @param {Object} node
 * @param {Object} ctx { equipment, chemicals, chemProperties }
 * @param {Object} opts { includeOperational: boolean (default true) }
 * @returns {Object} { combinations: [...], suppressed: [...], facts, engine }
 */
export function generateDeviations(node, ctx, opts) {
  const o = opts || {};
  const derived = deriveNodeFacts(node, ctx);
  const facts = derived.facts;
  const why = derived.why;
  const combinations = [];
  const suppressed = [];

  for (const param of PARAMETERS) {
    const unmet = (param.requires || []).filter((f) => !facts[f]);
    if (unmet.length > 0) {
      suppressed.push({
        parameter: param.key,
        parameterLabel: param.label,
        reason: 'PARAMETER_NOT_PRESENT_IN_NODE',
        unmetFacts: unmet,
      });
      continue;
    }
    for (const gwKey of param.guidewords) {
      combinations.push({
        parameter: param.key,
        parameterLabel: param.label,
        group: param.group,
        guideword: gwKey,
        guidewordLabel: (GUIDEWORDS.filter((g) => g.key === gwKey)[0] || {}).label || gwKey,
        deviation: deviationPhrase(gwKey, param.label),
        rationale: (param.requires || []).map((f) => why[f]).filter(Boolean),
        kind: 'GUIDEWORD',
      });
    }
  }

  if (o.includeOperational !== false) {
    for (const od of OPERATIONAL_DEVIATIONS) {
      const unmet = (od.requires || []).filter((f) => !facts[f]);
      if (unmet.length > 0) {
        suppressed.push({ parameter: od.key, parameterLabel: od.label, reason: 'OPERATION_NOT_PRESENT_IN_NODE', unmetFacts: unmet });
        continue;
      }
      combinations.push({
        parameter: od.key,
        parameterLabel: od.label,
        group: 'Operations',
        guideword: 'OTHER_THAN',
        guidewordLabel: 'OTHER THAN',
        deviation: od.deviation,
        rationale: (od.requires || []).map((f) => why[f]).filter(Boolean),
        kind: 'OPERATIONAL',
      });
    }
  }

  // Utility failure rows: one per declared utility, because "utility failure"
  // as a single row hides which utility and therefore which consequence.
  for (const u of derived.utilities) {
    const util = UTILITIES.filter((x) => x.key === u)[0];
    if (!util) continue;
    combinations.push({
      parameter: 'utility:' + u,
      parameterLabel: util.label,
      group: 'Utility',
      guideword: 'NO',
      guidewordLabel: 'NO / NOT',
      deviation: 'Failure of ' + util.label.toLowerCase(),
      rationale: [why.anyUtility].filter(Boolean),
      kind: 'UTILITY',
    });
  }

  return {
    combinations,
    suppressed,
    facts,
    why,
    engine: GUIDEWORD_VERSION,
    counts: { emitted: combinations.length, suppressed: suppressed.length, crossProduct: PARAMETERS.length * GUIDEWORDS.length },
  };
}

/** Which of a node's meaningful deviations have no scenario yet. */
export function deviationCoverage(node, ctx, scenarios) {
  const gen = generateDeviations(node, ctx);
  const existing = new Set((scenarios || []).map((s) => (s.parameter || '') + '|' + (s.guideword || '')));
  const covered = [];
  const uncovered = [];
  for (const c of gen.combinations) {
    if (existing.has(c.parameter + '|' + c.guideword)) covered.push(c);
    else uncovered.push(c);
  }
  return {
    covered,
    uncovered,
    percent: gen.combinations.length ? Math.round((covered.length / gen.combinations.length) * 100) : 0,
    total: gen.combinations.length,
  };
}
