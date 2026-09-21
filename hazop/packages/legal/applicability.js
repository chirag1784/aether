// packages/legal/applicability.js
// Jurisdiction resolver + deterministic applicability engine.
// Facts are tri-state: true / false / null. A null fact yields NOT_ENOUGH_DATA,
// never a guess. No LLM arithmetic and no LLM decision reaches this file.

import { LEGAL_INSTRUMENTS, LEGAL_OBLIGATIONS, instrumentById, thresholdSetById, standardIsMandatory } from './library.js';
import { evaluateInventory } from './thresholds.js';
import { isUsable } from '../domain/status.js';

export const APPLICABILITY_ENGINE_VERSION = 'applicability-1.0.0';

/**
 * Derive the trigger facts the library refers to, from the project's
 * jurisdiction profile, chemical inventory and equipment list.
 *
 * Every fact is accompanied by the project field(s) that produced it, so the
 * register can show exactly which facts a conclusion rests on.
 *
 * @param {Object} ctx { project, chemicals[], chemProperties[], equipment[] }
 * @returns {Object} { facts, provenance }
 */
export function resolveJurisdiction(ctx) {
  const c = ctx || {};
  const p = c.project || {};
  const j = p.jurisdiction || {};
  const chems = c.chemicals || [];
  const equip = c.equipment || [];
  const facts = {};
  const provenance = {};

  const put = (key, value, from, note) => {
    facts[key] = value;
    provenance[key] = { from: from, value: value, note: note || null };
  };

  put('always', true, ['—'], 'Always a candidate; applicability still depends on the obligation.');
  put('isEstablishment', j.establishmentCategory ? true : null, ['jurisdiction.establishmentCategory']);
  put('stateGujarat', j.state ? /gujarat/i.test(String(j.state)) : null, ['jurisdiction.state']);
  put('inIndustrialEstate', p.industrialEstate ? true : j.industrialEstate === false ? false : null, ['project.industrialEstate']);

  const ag = String(j.appropriateGovernment || '').toLowerCase();
  put('appropriateGovernmentCentral', ag ? ag.indexOf('central') !== -1 : null, ['jurisdiction.appropriateGovernment']);
  put('appropriateGovernmentState', ag ? ag.indexOf('state') !== -1 : null, ['jurisdiction.appropriateGovernment']);

  put('hazardousProcess', tri(j.hazardousProcess), ['jurisdiction.hazardousProcess']);
  put('workerCount', Number.isFinite(Number(j.workerCount)) ? Number(j.workerCount) : null, ['jurisdiction.workerCount']);

  // Chemicals present at all?
  if (chems.length === 0) {
    put('hazardousChemicalsPresent', null, ['chemicals'], 'No chemical inventory recorded.');
  } else {
    const anyClassified = chems.some((x) => x.hazardousClassification === true || (typeof x.hazardousClassification === 'string' && x.hazardousClassification.trim() !== ''));
    const anyUnknown = chems.some((x) => x.hazardousClassification === null || x.hazardousClassification === undefined || x.hazardousClassification === '');
    put(
      'hazardousChemicalsPresent',
      anyClassified ? true : anyUnknown ? null : false,
      ['chemicals[].hazardousClassification'],
      anyUnknown && !anyClassified ? 'Some chemicals have no hazardous classification recorded.' : null
    );
  }

  put('emitsToAir', tri(j.emitsToAir !== undefined ? j.emitsToAir : p.emitsToAir), ['jurisdiction.emitsToAir']);
  put('dischargesToWaterOrLand', tri(j.dischargesToWaterOrLand !== undefined ? j.dischargesToWaterOrLand : p.dischargesToWaterOrLand), ['jurisdiction.dischargesToWaterOrLand']);
  put('hazardousWasteGenerated', tri(j.hazardousWasteGenerated), ['jurisdiction.hazardousWasteGenerated']);
  put('groundwaterAbstraction', tri(j.groundwaterAbstraction), ['jurisdiction.groundwaterAbstraction']);
  put('dispatchesHazardousGoods', tri(j.dispatchesHazardousGoods), ['jurisdiction.dispatchesHazardousGoods']);
  put('scheduledActivityQuestion', tri(j.scheduledActivity), ['jurisdiction.scheduledActivity'], 'Whether the activity appears in the EIA Notification schedule must be established from the official text.');

  put('petroleumClassPresent', tri(j.petroleumClassPresent), ['jurisdiction.petroleumClassPresent']);
  put('compressedGasCylindersPresent', tri(j.compressedGasPresent), ['jurisdiction.compressedGasPresent']);
  put('explosivesRelevant', tri(j.explosivesRelevant), ['jurisdiction.explosivesRelevant']);
  put('ammoniumNitrateRelevant', tri(j.ammoniumNitrateRelevant), ['jurisdiction.ammoniumNitrateRelevant']);
  put('calciumCarbideRelevant', tri(j.calciumCarbideRelevant), ['jurisdiction.calciumCarbideRelevant']);

  // Equipment-derived facts
  const pv = equip.filter((e) => e.pressureEquipment);
  const pvGas = pv.filter((e) => e.compressedGasService);
  put(
    'pressureVesselCompressedGas',
    pvGas.length > 0 ? true : j.pressureVesselPresent === false ? false : pv.length > 0 ? null : tri(j.pressureVesselPresent),
    ['equipment[].pressureEquipment', 'equipment[].compressedGasService', 'jurisdiction.pressureVesselPresent'],
    pv.length > 0 && pvGas.length === 0 ? 'Pressure equipment exists but no compressed-gas service is declared on it; SMPV(U) scope is unresolved.' : null
  );
  const boilers = equip.filter((e) => /boiler|steam\s*generator/i.test(String(e.type || '') + ' ' + String(e.service || '')));
  put('boilerInScope', boilers.length > 0 ? true : tri(j.boilerInScope), ['equipment[].type', 'jurisdiction.boilerInScope']);

  return { facts, provenance, engine: APPLICABILITY_ENGINE_VERSION };
}

// Plain-language questions for the facts that gate instrument candidacy.
// Shown on the legal page so the unresolved set is answerable, not just listed.
export const FACT_QUESTIONS = Object.freeze({
  isEstablishment: 'What is the establishment / factory category for this site?',
  stateGujarat: 'Which state or union territory is the site in?',
  inIndustrialEstate: 'Is the site inside a notified industrial estate?',
  appropriateGovernmentCentral: 'Is the appropriate government for this establishment the Central Government or the State Government?',
  appropriateGovernmentState: 'Is the appropriate government for this establishment the Central Government or the State Government?',
  hazardousProcess: 'Does the establishment carry on a hazardous process as defined in the applicable law?',
  hazardousChemicalsPresent: 'Are any of the chemicals handled classified as hazardous chemicals?',
  emitsToAir: 'Does the site have any emission to air within the scope of the Air Act?',
  dischargesToWaterOrLand: 'Does the site discharge effluent to water or land?',
  hazardousWasteGenerated: 'Does the site generate hazardous waste?',
  groundwaterAbstraction: 'Does the site abstract groundwater?',
  dispatchesHazardousGoods: 'Does the site dispatch hazardous goods by road?',
  scheduledActivityQuestion: 'Does this project or activity appear in the schedule to the EIA Notification, and in which category?',
  petroleumClassPresent: 'Is petroleum, as defined by the Petroleum Act, stored or handled on site?',
  compressedGasCylindersPresent: 'Are compressed-gas cylinders stored or used on site?',
  pressureVesselCompressedGas: 'Is any unfired pressure vessel used for compressed-gas service?',
  explosivesRelevant: 'Are explosives, as defined by the Explosives Act, present on site?',
  ammoniumNitrateRelevant: 'Is ammonium nitrate handled or stored on site?',
  calciumCarbideRelevant: 'Is calcium carbide handled or stored on site?',
  boilerInScope: 'Is any equipment on site a boiler or an IBR-scope component?',
});

function tri(v) {
  if (v === true || v === 'true' || v === 'yes') return true;
  if (v === false || v === 'false' || v === 'no') return false;
  return null;
}

/**
 * Evaluate a declarative predicate against the resolved facts.
 * Returns { value: true|false|null, used: [...], unresolved: [...] }
 */
export function evaluatePredicate(logic, facts) {
  const used = [];
  const unresolved = [];
  if (!logic || (!logic.all && !logic.any)) {
    return { value: true, used, unresolved, reason: 'NO_CONDITIONS' };
  }

  let allValue = true;
  for (const cond of logic.all || []) {
    const r = evalCond(cond, facts);
    used.push({ fact: cond.fact, value: r.raw });
    if (r.value === null) {
      unresolved.push(cond.fact);
      allValue = allValue === false ? false : null;
    } else if (r.value === false) {
      allValue = false;
    }
  }

  if (logic.any && logic.any.length) {
    let anyValue = false;
    let anyUnresolved = false;
    for (const cond of logic.any) {
      const r = evalCond(cond, facts);
      used.push({ fact: cond.fact, value: r.raw });
      if (r.value === true) anyValue = true;
      else if (r.value === null) {
        anyUnresolved = true;
        unresolved.push(cond.fact);
      }
    }
    const anyResult = anyValue ? true : anyUnresolved ? null : false;
    if (allValue === false || anyResult === false) return { value: false, used, unresolved };
    if (allValue === null || anyResult === null) return { value: null, used, unresolved };
    return { value: true, used, unresolved };
  }

  return { value: allValue, used, unresolved };
}

function evalCond(cond, facts) {
  const raw = facts ? facts[cond.fact] : undefined;
  if (raw === undefined || raw === null) return { value: null, raw: null };
  if (Object.prototype.hasOwnProperty.call(cond, 'eq')) return { value: raw === cond.eq, raw };
  if (Object.prototype.hasOwnProperty.call(cond, 'gte')) {
    const target = typeof cond.gte === 'string' ? facts[cond.gte] : cond.gte;
    if (target === null || target === undefined) return { value: null, raw };
    return { value: Number(raw) >= Number(target), raw };
  }
  if (Object.prototype.hasOwnProperty.call(cond, 'truthy')) return { value: !!raw === !!cond.truthy, raw };
  return { value: raw === true, raw };
}

/**
 * Evaluate ONE obligation for a project.
 *
 * @param {Object} req { obligation, facts, provenance, thresholdSets, chemicals,
 *                       existingRecord, criticalFactsVerified }
 * @returns {Object} ProjectComplianceRecord shape (applicability part)
 */
export function evaluateObligation(req) {
  const r = req || {};
  const ob = r.obligation || {};
  const facts = r.facts || {};
  const prov = r.provenance || {};
  const instrument = instrumentById(ob.instrumentId);

  const out = {
    engine: APPLICABILITY_ENGINE_VERSION,
    obligationId: ob.id,
    instrumentId: ob.instrumentId,
    instrumentTitle: instrument ? instrument.title : ob.instrumentId,
    domain: instrument ? instrument.domain : null,
    topic: ob.topic,
    sectionRuleSchedule: ob.sectionRuleSchedule,
    authority: ob.responsibleAuthority,
    evidenceExpected: ob.evidenceExpected || [],
    sourceRefs: instrument ? [{ kind: instrument.sourceRootKey || 'OFFICIAL', url: instrument.officialSourceUrl, locator: ob.sourceQuoteLocator, sourceStatus: instrument.sourceStatus }] : [],
    legalSourceVersion: instrument ? instrument.amendmentStatus : null,
    factsUsed: [],
    missingFacts: [],
    thresholdEvaluation: null,
  };

  // A standard is not an obligation until an adoption route is recorded.
  if (instrument && instrument.isStandard) {
    const m = standardIsMandatory(instrument);
    if (!m.mandatory) {
      return Object.assign(out, {
        applicabilityStatus: 'NOT_APPLICABLE_CONFIRMED',
        applicabilityReason:
          'This is a standard, not a law. ' + (m.detail || '') + ' It is listed as guidance in the report and is not treated as a statutory obligation.',
        isStandardGuidance: true,
        setBy: 'ENGINE_RULE_STANDARD_NOT_LAW',
      });
    }
  }

  // 1. Predicate over project facts.
  const pred = evaluatePredicate(ob.applicabilityLogic, facts);
  out.factsUsed = pred.used.map((u) => Object.assign({}, u, { provenance: prov[u.fact] || null }));
  out.missingFacts = pred.unresolved.slice();

  if (pred.value === false) {
    return Object.assign(out, {
      applicabilityStatus: 'NOT_APPLICABLE_CONFIRMED',
      applicabilityReason: 'A trigger condition is false on verified project facts: ' + describeFalse(pred, facts) + '.',
      setBy: 'ENGINE_DETERMINISTIC_EXCLUSION',
      requiresHumanReview: true,
    });
  }
  if (pred.value === null) {
    return Object.assign(out, {
      applicabilityStatus: 'NOT_ENOUGH_DATA',
      applicabilityReason:
        'Trigger fact' + (pred.unresolved.length > 1 ? 's' : '') + ' not resolved: ' + pred.unresolved.join(', ') + '. Resolve them on the jurisdiction profile or the chemical inventory.',
      setBy: 'ENGINE_MISSING_FACT',
      requiresHumanReview: true,
    });
  }

  // 2. Threshold-gated obligations.
  const thresholdRef = (ob.applicabilityLogic && ob.applicabilityLogic.requiresThreshold) || ob.thresholdRef;
  if (thresholdRef) {
    const set = (r.thresholdSets || []).filter((s) => s.id === thresholdRef)[0] || thresholdSetById(thresholdRef);
    const evaluation = evaluateInventory({ thresholdSet: set || { id: thresholdRef, entries: [] }, chemicals: r.chemicals || [] });
    out.thresholdEvaluation = evaluation;

    if (evaluation.conclusion === 'NO_VERIFIED_THRESHOLDS') {
      return Object.assign(out, {
        applicabilityStatus: 'POTENTIALLY_APPLICABLE',
        applicabilityReason:
          'The trigger conditions are met, but no verified threshold figure has been entered for "' +
          ((set && set.label) || thresholdRef) +
          '". Enter the scheduled quantities from the official text and cite them; the engine will then compute the crossing.',
        setBy: 'ENGINE_THRESHOLD_UNVERIFIED',
        requiresHumanReview: true,
        actionNeeded: 'ENTER_VERIFIED_THRESHOLD',
      });
    }
    if (evaluation.conclusion === 'CANNOT_CONCLUDE') {
      const blockedFacts = evaluation.results.filter((x) => x.blocks).reduce((acc, x) => acc.concat(x.missingFacts || []), []);
      out.missingFacts = out.missingFacts.concat(blockedFacts);
      return Object.assign(out, {
        applicabilityStatus: 'NOT_ENOUGH_DATA',
        applicabilityReason: 'Threshold comparison is blocked: ' + evaluation.results.filter((x) => x.blocks).map((x) => x.detail).slice(0, 2).join(' '),
        setBy: 'ENGINE_THRESHOLD_BLOCKED',
        requiresHumanReview: true,
      });
    }
    if (evaluation.conclusion === 'THRESHOLD_CROSSED') {
      const crossed = evaluation.results.filter((x) => x.crossed);
      const allVerified = r.criticalFactsVerified === true && crossed.every((x) => (x.factsUsed || []).every((f) => !f.status || f.status === 'VERIFIED'));
      return Object.assign(out, {
        applicabilityStatus: allVerified ? 'APPLICABLE_CONFIRMED' : 'POTENTIALLY_APPLICABLE',
        applicabilityReason:
          'Site inventory crosses a verified scheduled quantity: ' +
          crossed.map((x) => x.chemicalName + ' — ' + x.arithmetic).join('; ') +
          (allVerified ? '. All facts used are VERIFIED.' : '. Confirm the facts used, then a reviewer can confirm applicability.'),
        setBy: allVerified ? 'ENGINE_VERIFIED_THRESHOLD_CROSSING' : 'ENGINE_THRESHOLD_CROSSING_UNVERIFIED_FACTS',
        requiresHumanReview: !allVerified,
        crossings: crossed.map((x) => ({ chemicalId: x.chemicalId, chemicalName: x.chemicalName, arithmetic: x.arithmetic, locator: x.thresholdLocator })),
      });
    }
    if (evaluation.conclusion === 'APPROACHING_THRESHOLD') {
      return Object.assign(out, {
        applicabilityStatus: 'POTENTIALLY_APPLICABLE',
        applicabilityReason:
          'Inventory is close to a scheduled quantity: ' + evaluation.results.filter((x) => x.comparison === 'APPROACHING').map((x) => x.chemicalName + ' at ' + x.ratioPercent + ' % of the figure').join('; ') +
          '. Confirm the maximum quantity liable to be present, not only the normal holding.',
        setBy: 'ENGINE_APPROACHING_THRESHOLD',
        requiresHumanReview: true,
      });
    }
    // BELOW_ALL_VERIFIED_THRESHOLDS
    const unmatched = evaluation.unmatched || [];
    if (unmatched.length) {
      return Object.assign(out, {
        applicabilityStatus: 'NOT_ENOUGH_DATA',
        applicabilityReason:
          unmatched.length + ' chemical(s) have no recorded schedule entry, so "below threshold" cannot be concluded for the site: ' + unmatched.map((u) => u.chemicalName).join(', ') + '.',
        setBy: 'ENGINE_UNMATCHED_CHEMICALS',
        requiresHumanReview: true,
      });
    }
    return Object.assign(out, {
      applicabilityStatus: r.criticalFactsVerified === true ? 'NOT_APPLICABLE_CONFIRMED' : 'POTENTIALLY_APPLICABLE',
      applicabilityReason:
        'Every chemical with a verified schedule entry is below its scheduled quantity: ' + evaluation.results.map((x) => x.chemicalName + ' — ' + x.arithmetic).join('; ') + '.',
      setBy: 'ENGINE_BELOW_VERIFIED_THRESHOLDS',
      requiresHumanReview: r.criticalFactsVerified !== true,
    });
  }

  // 3. No threshold gate: the obligation depends on facts alone.
  if (ob.legalReviewRequired) {
    return Object.assign(out, {
      applicabilityStatus: 'POTENTIALLY_APPLICABLE',
      applicabilityReason:
        'Trigger conditions are met on project facts (' +
        pred.used.filter((u) => u.value === true).map((u) => u.fact).join(', ') +
        '). The precise duty set is in the official text, so a competent person must confirm which duties apply and to what extent.',
      setBy: 'ENGINE_TRIGGERS_MET_REVIEW_REQUIRED',
      requiresHumanReview: true,
    });
  }
  return Object.assign(out, {
    applicabilityStatus: 'POTENTIALLY_APPLICABLE',
    applicabilityReason: 'Trigger conditions are met on project facts.',
    setBy: 'ENGINE_TRIGGERS_MET',
    requiresHumanReview: true,
  });
}

function describeFalse(pred, facts) {
  const falses = pred.used.filter((u) => facts[u.fact] === false);
  if (!falses.length) return 'a trigger condition is not satisfied';
  return falses.map((u) => u.fact + ' = false').join(', ');
}

/**
 * Select candidate instruments and evaluate every obligation.
 *
 * @param {Object} ctx { project, chemicals, chemProperties, equipment, thresholdSets, existingRecords }
 */
export function runApplicability(ctx) {
  const c = ctx || {};
  const resolved = resolveJurisdiction(c);
  const facts = resolved.facts;

  // Candidate instruments: any instrument whose triggers are true or unresolved.
  const candidates = [];
  const excluded = [];
  for (const inst of LEGAL_INSTRUMENTS) {
    const trig = inst.triggers || [];
    if (trig.length === 0) {
      candidates.push({ instrument: inst, reason: 'NO_TRIGGERS' });
      continue;
    }
    const values = trig.map((t) => facts[t]);
    if (values.some((v) => v === true)) candidates.push({ instrument: inst, reason: 'TRIGGER_TRUE', triggers: trig });
    else if (values.some((v) => v === null || v === undefined)) candidates.push({ instrument: inst, reason: 'TRIGGER_UNRESOLVED', triggers: trig });
    else excluded.push({ instrument: inst, reason: 'ALL_TRIGGERS_FALSE', triggers: trig });
  }

  const criticalFactsVerified = c.criticalFactsVerified === true;
  const records = [];
  for (const cand of candidates) {
    for (const ob of LEGAL_OBLIGATIONS.filter((o) => o.instrumentId === cand.instrument.id)) {
      records.push(
        Object.assign(
          evaluateObligation({
            obligation: ob,
            facts,
            provenance: resolved.provenance,
            thresholdSets: c.thresholdSets,
            chemicals: c.chemicals,
            criticalFactsVerified,
          }),
          { candidateReason: cand.reason }
        )
      );
    }
  }

  const counts = { APPLICABLE_CONFIRMED: 0, POTENTIALLY_APPLICABLE: 0, NOT_APPLICABLE_CONFIRMED: 0, NOT_ENOUGH_DATA: 0, REQUIRES_LEGAL_REVIEW: 0 };
  for (const rec of records) if (Object.prototype.hasOwnProperty.call(counts, rec.applicabilityStatus)) counts[rec.applicabilityStatus] += 1;

  // Unresolved trigger facts, grouped so the UI can say "answer these N
  // questions to resolve M obligations" instead of burying them in the register.
  const pending = new Map();
  for (const cand of candidates) {
    if (cand.reason !== 'TRIGGER_UNRESOLVED') continue;
    for (const t of cand.triggers || []) {
      if (facts[t] !== null && facts[t] !== undefined) continue;
      if (!pending.has(t)) pending.set(t, { fact: t, question: FACT_QUESTIONS[t] || 'Resolve the project fact "' + t + '".', instruments: [], obligationCount: 0 });
      const e = pending.get(t);
      e.instruments.push({ id: cand.instrument.id, title: cand.instrument.title });
      e.obligationCount += LEGAL_OBLIGATIONS.filter((o) => o.instrumentId === cand.instrument.id).length;
    }
  }

  return {
    pendingQuestions: Array.from(pending.values()).sort((a, b) => b.obligationCount - a.obligationCount),
    engine: APPLICABILITY_ENGINE_VERSION,
    resolvedFacts: facts,
    provenance: resolved.provenance,
    candidates: candidates.map((x) => ({ instrumentId: x.instrument.id, title: x.instrument.title, reason: x.reason })),
    excluded: excluded.map((x) => ({ instrumentId: x.instrument.id, title: x.instrument.title, reason: x.reason, triggers: x.triggers })),
    records,
    counts,
    unresolvedFacts: Array.from(new Set(records.reduce((a, r) => a.concat(r.missingFacts || []), []))),
  };
}

/**
 * Link an obligation to the nodes it genuinely touches. The system does not
 * force a citation onto every worksheet row.
 *
 * @param {Object} req { record, nodes[], chemicals[], equipment[], permitConditions[] }
 * @returns {Array} links [{ nodeId, reason, detail }]
 */
export function linkObligationToNodes(req) {
  const r = req || {};
  const rec = r.record || {};
  const links = [];

  // 1. A threshold crossing on a chemical present in the node.
  const crossedChemIds = (rec.crossings || []).map((x) => x.chemicalId);
  for (const n of r.nodes || []) {
    const hit = (n.chemicalIds || []).filter((id) => crossedChemIds.indexOf(id) !== -1);
    if (hit.length) {
      links.push({
        nodeId: n.id,
        reason: 'THRESHOLD_CROSSING_CHEMICAL_IN_NODE',
        detail: 'A chemical in this node crosses a scheduled quantity for ' + rec.instrumentTitle + '.',
        chemicalIds: hit,
      });
    }
  }

  // 2. Equipment class triggers.
  const affected = (rec.affectedEquipmentTypes || []).concat(((LEGAL_OBLIGATIONS.filter((o) => o.id === rec.obligationId)[0] || {}).affectedEquipmentTypes) || []);
  if (affected.length) {
    for (const n of r.nodes || []) {
      const eq = (r.equipment || []).filter((e) => (n.equipmentIds || []).indexOf(e.id) !== -1);
      const match = eq.filter((e) => affected.some((t) => String(e.type || '').toLowerCase().indexOf(String(t).toLowerCase()) !== -1 || String(e.service || '').toLowerCase().indexOf(String(t).toLowerCase()) !== -1));
      if (match.length && !links.some((l) => l.nodeId === n.id)) {
        links.push({
          nodeId: n.id,
          reason: 'EQUIPMENT_CLASS_IN_SCOPE',
          detail: 'Equipment in this node (' + match.map((e) => e.tag || e.id).join(', ') + ') falls within the equipment classes this obligation addresses.',
          equipmentIds: match.map((e) => e.id),
        });
      }
    }
  }

  // 3. A permit condition naming the node's equipment tag or chemical.
  for (const cond of r.permitConditions || []) {
    if (cond.obligationId && cond.obligationId !== rec.obligationId) continue;
    for (const n of r.nodes || []) {
      const eqTags = (r.equipment || []).filter((e) => (n.equipmentIds || []).indexOf(e.id) !== -1).map((e) => e.tag).filter(Boolean);
      const chemNames = (r.chemicals || []).filter((x) => (n.chemicalIds || []).indexOf(x.id) !== -1).map((x) => x.canonicalName || x.name).filter(Boolean);
      const text = String(cond.text || '').toLowerCase();
      const named = eqTags.concat(chemNames).filter((t) => text.indexOf(String(t).toLowerCase()) !== -1);
      if (named.length) {
        links.push({
          nodeId: n.id,
          reason: 'PERMIT_CONDITION_NAMES_NODE_ITEM',
          detail: 'A condition of ' + (cond.permitLabel || 'an uploaded permit') + ' names ' + named.join(', ') + '.',
          conditionId: cond.id,
        });
      }
    }
  }

  // 4. Obligations the library marks as HAZOP-linked apply to every node.
  const ob = LEGAL_OBLIGATIONS.filter((o) => o.id === rec.obligationId)[0];
  if (ob && ob.linksToHazop && rec.applicabilityStatus !== 'NOT_APPLICABLE_CONFIRMED') {
    for (const n of r.nodes || []) {
      if (!links.some((l) => l.nodeId === n.id)) {
        links.push({ nodeId: n.id, reason: 'STUDY_LEVEL_OBLIGATION', detail: 'This obligation concerns the study and its findings, so it is relevant to every node.' });
      }
    }
  }

  return links;
}

/** Are the facts a record rests on all VERIFIED? Used to gate CONFIRMED statuses. */
export function factsAllVerified(record, extractedFields) {
  const used = (record && record.factsUsed) || [];
  if (!used.length) return false;
  for (const u of used) {
    const f = (extractedFields || []).filter((x) => x.field === u.fact)[0];
    if (!f) return false;
    if (f.status !== 'VERIFIED') return false;
    if (!isUsable(f.status)) return false;
  }
  return true;
}
