// app/ai.js — the AI layer.
//
// One provider interface. The adapter that runs in the published deployment
// asks Claude on the viewer's own account; the HTTP adapter is the seam for the
// Docker deployment where the server-side Anthropic / OpenAI / Google /
// OpenRouter / local adapters live and where keys never reach the browser.
//
// Nothing in this file computes a risk score, a threshold crossing, a unit
// conversion or an applicability status. Those are the deterministic packages,
// and the AI output is validated against them before it can touch project data.

import { S, rows, scoped, project, nodeById } from './state.js';
import { uid, nowIso } from './util.js';
import { generateDeviations } from '../packages/domain/guidewords.js';
import { CAUSE_FAMILIES, CONSEQUENCE_FAMILIES, SAFEGUARD_CLASSES, classifyCause, classifyConsequence, classifySafeguard } from '../packages/domain/causes.js';
import { CONTROL_LEVELS, assessRecommendationQuality } from '../packages/calculations/dedup.js';

export const AI_LAYER_VERSION = 'ai-1.0.0';
export const PROMPT_VERSION = 'p1';
export const SCHEMA_VERSION = 's1';

const TIER = { light: 'quick', medium: 'default', strong: 'complex' };

// The output contract every structured task must satisfy (MASTER_STRUCTURE §31).
const CONTRACT_NOTE =
  'Reply with ONLY one JSON object of the shape ' +
  '{"facts_used":[string],"assumptions":[string],"missing_data":[string],"result":<as specified>,"sources":[string],"confidence":0.0,"human_review_required":true}. ' +
  'Rules you must follow: never state a process condition, capacity, design pressure or temperature, ' +
  'interlock, chemical property, SDS value, legal threshold or statutory obligation that is not present in the ' +
  'PROJECT FACTS below — if it is not there, name it in missing_data instead. Never output a risk score, a ' +
  'likelihood or severity rating, a threshold comparison or a compliance conclusion. Never claim a value is verified.';

export class SampleAdapter {
  constructor(sample) {
    this.name = 'viewer-claude';
    this.sample = sample;
  }

  get available() {
    return !!this.sample;
  }

  async generateStructured(task) {
    const tier = TIER[task.taskClass] || 'default';
    const started = Date.now();
    const prompt = buildPrompt(task);
    const out = { provider: this.name, modelTierRequested: tier };
    const data = await this.sample.json(prompt, { modelTier: tier, signal: task.signal, cache: false });
    out.runtimeMs = Date.now() - started;
    out.raw = data;
    return out;
  }

  async chat(turns, opts) {
    return this.sample(turns, opts);
  }
}

export class HttpAdapter {
  constructor(endpoint) {
    this.name = 'server';
    this.endpoint = endpoint || '/api/ai';
  }

  get available() {
    return false; // enabled in the Docker deployment, where the endpoint exists
  }

  async generateStructured(task) {
    const res = await fetch(this.endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ task: task.name, taskClass: task.taskClass, promptVersion: PROMPT_VERSION, schemaVersion: SCHEMA_VERSION, context: task.context, instruction: task.instruction, shape: task.shape }),
    });
    if (!res.ok) throw Object.assign(new Error('AI endpoint returned ' + res.status), { code: 'upstream_error' });
    return { provider: this.name, raw: await res.json() };
  }
}

let adapter = null;
export function setAdapter(a) {
  adapter = a;
}
export function getAdapter() {
  return adapter;
}
export function aiAvailable() {
  return !!(adapter && adapter.available);
}

function buildPrompt(task) {
  return [
    'You are assisting a HAZOP facilitator. ' + CONTRACT_NOTE,
    '',
    'TASK: ' + task.instruction,
    '',
    'REQUIRED SHAPE OF "result": ' + task.shape,
    '',
    'PROJECT FACTS (the only facts you may rely on):',
    JSON.stringify(task.context, null, 1).slice(0, 44000),
  ].join('\n');
}

// --------------------------------------------------------------- validation

function validateContract(raw) {
  const errors = [];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, errors: ['Output is not a JSON object.'] };
  for (const k of ['facts_used', 'assumptions', 'missing_data', 'sources']) {
    if (raw[k] !== undefined && !Array.isArray(raw[k])) errors.push(k + ' must be an array.');
  }
  if (raw.result === undefined) errors.push('result is missing.');
  if (raw.confidence !== undefined && !(Number(raw.confidence) >= 0 && Number(raw.confidence) <= 1)) errors.push('confidence must be between 0 and 1.');
  return { ok: errors.length === 0, errors };
}

/** Run a structured task, log the ai_run, and return the validated result. */
export async function runTask(task) {
  if (!aiAvailable()) {
    const e = new Error('AI assistance is not available in this view.');
    e.code = 'not_granted';
    throw e;
  }
  const runId = uid('airun');
  const started = Date.now();
  let record = {
    id: runId,
    projectId: S.projectId,
    task: task.name,
    taskClass: task.taskClass,
    provider: adapter.name,
    modelTierRequested: TIER[task.taskClass] || 'default',
    promptVersion: PROMPT_VERSION,
    schemaVersion: SCHEMA_VERSION,
    sourceIds: task.sourceIds || [],
    requestedBy: S.actor.id,
    createdAt: nowIso(),
    humanReviewRequired: true,
  };

  try {
    const out = await adapter.generateStructured(task);
    const raw = out.raw || {};
    const check = validateContract(raw);
    record = Object.assign(record, {
      runtimeMs: out.runtimeMs || Date.now() - started,
      factsUsed: Array.isArray(raw.facts_used) ? raw.facts_used.slice(0, 40) : [],
      assumptions: Array.isArray(raw.assumptions) ? raw.assumptions.slice(0, 40) : [],
      missingData: Array.isArray(raw.missing_data) ? raw.missing_data.slice(0, 40) : [],
      confidence: Number(raw.confidence) >= 0 ? Number(raw.confidence) : null,
      outputValid: check.ok,
      validationErrors: check.ok ? null : check.errors,
      // Always true by policy, whatever the model claims about its own output.
      humanReviewRequired: true,
      // sample.json() resolves the parsed value only, so the tier that actually
      // answered is not reported on this path. Recorded as unknown rather than
      // silently assumed to equal the tier requested.
      modelTierApplied: out.modelTierApplied || null,
    });
    await logRun(record);
    if (!check.ok) {
      const e = new Error('The model returned output that does not match the contract: ' + check.errors.join(' '));
      e.code = 'invalid_output';
      e.aiRunId = runId;
      throw e;
    }
    return { runId, result: raw.result, envelope: raw, record };
  } catch (err) {
    if (!record.outputValid) {
      record.outputValid = false;
      record.validationErrors = [String((err && err.message) || err)];
      record.runtimeMs = Date.now() - started;
      await logRun(record).catch(() => {});
    }
    throw err;
  }
}

async function logRun(record) {
  if (!S.store) return;
  try {
    await S.store.create('ai_runs', record, { projectId: S.projectId, actorKind: 'ai' });
  } catch (e) {
    /* a failed log must not break the user's action */
  }
}

// ------------------------------------------------------------ context builder

/**
 * The RAG context builder. Retrieval order follows MASTER_STRUCTURE §22:
 * project facts first, then verified project conditions, then authoritative
 * chemical data, then methodology. Every fact carries its status so the model
 * can see what is unverified.
 */
export function buildContext(opts) {
  const o = opts || {};
  const p = project();
  if (!p) return {};
  const ctx = {
    project: {
      name: p.projectName,
      client: p.clientName,
      site: p.siteName,
      product: p.product,
      process: p.process,
      processStage: p.processStage,
      processDescription: trim(p.processDescription, 2200),
      chemistry: trim(p.chemistry, 900),
      batchSize: p.batchSize,
      productionRate: p.productionRate,
      utilities: p.utilities,
      revision: p.revision,
    },
    jurisdiction: p.jurisdiction || {},
    methodology: {
      guidewordEngine: 'Deterministic rule table; the app decides which guideword/parameter pairs are meaningful for a node. Do not invent parameters the node does not have.',
      riskEngine: 'The app computes every risk score. Do not output ratings.',
      consequenceOrder: 'Consequences are recorded BEFORE credit for safeguards.',
    },
  };

  ctx.chemicals = scoped('chemicals').map((c) => ({
    id: c.id,
    name: c.canonicalName,
    cas: c.cas,
    state: c.physicalState,
    quantity: c.quantity === null || c.quantity === undefined ? null : String(c.quantity) + ' ' + (c.quantityUnit || ''),
    quantityStatus: c.quantityStatus,
    classification: c.hazardousClassification,
    properties: scoped('chem_properties')
      .filter((x) => x.chemicalId === c.id)
      .map((x) => ({ key: x.key, value: x.value, unit: x.unit, status: x.status })),
  }));

  ctx.equipment = scoped('equipment').map((e) => ({
    id: e.id,
    tag: e.tag,
    type: e.type,
    service: e.service,
    capacity: e.capacity,
    moc: e.materialOfConstruction,
    operatingTemperature: e.operatingTemperature,
    designTemperature: e.designTemperature,
    designPressure: e.designPressure,
    agitator: e.agitator,
    heating: e.heatingSystem,
    cooling: e.coolingSystem,
    relief: e.reliefArrangement,
    instruments: e.instruments,
    trips: e.trips,
  }));

  if (o.nodeId) {
    const n = nodeById(o.nodeId);
    if (n) {
      ctx.node = {
        id: n.id,
        number: n.nodeNumber,
        name: n.worksheetName,
        description: trim(n.description, 1200),
        designIntent: trim(n.designIntent, 1200),
        boundaries: n.boundaries,
        equipmentTags: (n.equipmentIds || []).map((id) => (scoped('equipment').filter((e) => e.id === id)[0] || {}).tag).filter(Boolean),
        chemicals: (n.chemicalIds || []).map((id) => (scoped('chemicals').filter((c) => c.id === id)[0] || {}).canonicalName).filter(Boolean),
        utilities: n.utilities,
        operatingTemperature: n.operatingTemperature,
        operatingPressure: n.operatingPressure,
        instruments: n.instruments,
        alarms: n.alarms,
        trips: n.trips,
        reliefs: n.reliefs,
      };
      ctx.existingSafeguardsOnNode = scoped('safeguards')
        .filter((s) => s.nodeId === n.id)
        .map((s) => ({ text: s.text, class: s.class }));
      ctx.existingRowsOnNode = scoped('scenarios')
        .filter((s) => s.nodeId === n.id)
        .map((s) => ({ parameter: s.parameter, guideword: s.guideword, deviation: s.deviation }));
    }
  }

  if (o.includeProcessSteps) {
    ctx.processSteps = scoped('process_steps').map((s) => ({ step: s.stepNumber, title: s.title, description: trim(s.description, 500), temperature: s.temperature, pressure: s.pressure, duration: s.duration }));
  }

  if (o.includeDocuments) {
    ctx.documents = scoped('documents').map((d) => ({ id: d.id, title: d.title, class: d.docClass, number: d.docNumber, revision: d.docRevision, pages: d.pageCount, parsed: d.parseStatus }));
  }

  if (o.extraText) ctx.documentExcerpt = trim(o.extraText, 30000);

  if (o.includeVocabulary) {
    ctx.vocabulary = {
      causeFamilies: CAUSE_FAMILIES.map((f) => f.key),
      consequenceFamilies: CONSEQUENCE_FAMILIES.map((f) => f.key),
      safeguardClasses: SAFEGUARD_CLASSES.map((f) => f.key),
      controlLevels: CONTROL_LEVELS.map((f) => f.key),
    };
  }

  return ctx;
}

function trim(s, n) {
  if (s === null || s === undefined) return null;
  const t = String(s);
  return t.length > n ? t.slice(0, n) + ' …[truncated]' : t;
}

// ------------------------------------------------------------- the tasks

/** Propose nodes from the process model. Output arrives as PROPOSED drafts. */
export async function proposeNodes() {
  const ctx = buildContext({ includeProcessSteps: true, includeDocuments: true });
  const out = await runTask({
    name: 'propose_nodes',
    taskClass: 'medium',
    instruction:
      'Propose HAZOP nodes for this plant from the process steps and equipment listed. Each node is a section of the process with one clear design intent. ' +
      'Group equipment that shares a design intent; split where the intent changes. Use the equipment tags exactly as given. ' +
      'Write the design intent as the plant intends the section to operate, in the plant\'s own terms, using ONLY the conditions given — if a temperature or quantity is not in the facts, do not state one.',
    shape:
      '[{"nodeNumber":"01","worksheetName":string,"description":string,"designIntent":string,"boundaries":string,' +
      '"equipmentTags":[string],"chemicalNames":[string],"utilities":[string],' +
      '"hasCharging":bool,"hasTransfer":bool,"hasDischarge":bool,"hasSampling":bool,"hasTimedStep":bool,' +
      '"isReactionStep":bool,"manualOperation":bool,"rationale":string}]',
    context: ctx,
  });
  const list = Array.isArray(out.result) ? out.result : [];
  return { runId: out.runId, nodes: list.map(sanitizeNodeProposal).filter(Boolean), envelope: out.envelope };
}

function sanitizeNodeProposal(n) {
  if (!n || typeof n !== 'object') return null;
  const tags = (n.equipmentTags || []).map(String);
  const equipment = scoped('equipment');
  const equipmentIds = tags.map((t) => (equipment.filter((e) => String(e.tag).toLowerCase() === t.toLowerCase())[0] || {}).id).filter(Boolean);
  const chems = scoped('chemicals');
  const chemicalIds = (n.chemicalNames || [])
    .map((nm) => (chems.filter((c) => String(c.canonicalName).toLowerCase() === String(nm).toLowerCase())[0] || {}).id)
    .filter(Boolean);
  return {
    nodeNumber: String(n.nodeNumber || '').slice(0, 12) || null,
    worksheetName: String(n.worksheetName || '').slice(0, 160),
    description: String(n.description || '').slice(0, 1200),
    designIntent: String(n.designIntent || '').slice(0, 1200),
    boundaries: String(n.boundaries || '').slice(0, 400),
    equipmentIds,
    chemicalIds,
    // Tags the model named that do not exist are reported, never silently created.
    unknownTags: tags.filter((t) => !equipment.some((e) => String(e.tag).toLowerCase() === t.toLowerCase())),
    utilities: (n.utilities || []).map(String).slice(0, 12),
    hasCharging: !!n.hasCharging,
    hasTransfer: !!n.hasTransfer,
    hasDischarge: !!n.hasDischarge,
    hasSampling: !!n.hasSampling,
    hasTimedStep: !!n.hasTimedStep,
    isReactionStep: !!n.isReactionStep,
    manualOperation: !!n.manualOperation,
    rationale: String(n.rationale || '').slice(0, 600),
    reviewStatus: 'PROPOSED',
    proposedBy: 'AI',
  };
}

/**
 * Draft worksheet rows for a node. The DEVIATION SET is supplied by the
 * deterministic guideword engine — the model fills causes, consequences and
 * safeguards for deviations the app has already decided are meaningful.
 */
export async function draftScenarios(nodeId, deviations) {
  const node = nodeById(nodeId);
  if (!node) throw new Error('Node not found.');
  const gen = generateDeviations(node, { equipment: scoped('equipment'), chemicals: scoped('chemicals'), chemProperties: scoped('chem_properties') });
  const target = (deviations && deviations.length ? deviations : gen.combinations).slice(0, 14);
  const ctx = buildContext({ nodeId, includeVocabulary: true });
  ctx.deviationsToAddress = target.map((d) => ({ parameter: d.parameter, guideword: d.guideword, deviation: d.deviation, whyMeaningful: d.rationale }));

  const out = await runTask({
    name: 'draft_scenarios',
    taskClass: 'strong',
    instruction:
      'For each deviation in deviationsToAddress, draft the worksheet row: credible causes arising WITHIN this node, the consequences ASSUMING THE SAFEGUARDS DO NOT WORK, ' +
      'and the safeguards that already exist according to the facts given. Do not invent a safeguard that is not in existingSafeguardsOnNode or in the node\'s instruments, alarms, trips or reliefs. ' +
      'Do not rate risk. If a deviation has no credible cause in this node, set noMeaningfulDeviation true and give the reason. ' +
      'Classify each cause, consequence and safeguard using the vocabulary keys provided.',
    shape:
      '[{"parameter":string,"guideword":string,"noMeaningfulDeviation":bool,"noMeaningfulReason":string,' +
      '"causes":[{"text":string,"family":string}],"consequences":[{"text":string,"family":string}],' +
      '"existingSafeguards":[{"text":string,"class":string}],"notes":string}]',
    context: ctx,
  });

  const list = Array.isArray(out.result) ? out.result : [];
  return {
    runId: out.runId,
    rows: list.map((r) => sanitizeScenarioDraft(r, target)).filter(Boolean),
    envelope: out.envelope,
  };
}

function sanitizeScenarioDraft(r, target) {
  if (!r || typeof r !== 'object') return null;
  const match = target.filter((t) => t.parameter === r.parameter && t.guideword === r.guideword)[0];
  if (!match) return null; // the model may not add deviations of its own
  const famKeys = CAUSE_FAMILIES.map((f) => f.key);
  const consKeys = CONSEQUENCE_FAMILIES.map((f) => f.key);
  const sgKeys = SAFEGUARD_CLASSES.map((f) => f.key);
  return {
    parameter: match.parameter,
    parameterLabel: match.parameterLabel,
    guideword: match.guideword,
    guidewordLabel: match.guidewordLabel,
    deviation: match.deviation,
    deviationKind: match.kind,
    noMeaningfulDeviation: !!r.noMeaningfulDeviation,
    noMeaningfulReason: String(r.noMeaningfulReason || '').slice(0, 300),
    causes: (r.causes || []).slice(0, 8).map((c) => ({
      text: String((c && c.text) || c || '').slice(0, 300),
      family: famKeys.indexOf(c && c.family) !== -1 ? c.family : classifyCause((c && c.text) || c),
    })).filter((c) => c.text),
    consequences: (r.consequences || []).slice(0, 8).map((c) => ({
      text: String((c && c.text) || c || '').slice(0, 300),
      family: consKeys.indexOf(c && c.family) !== -1 ? c.family : classifyConsequence((c && c.text) || c),
    })).filter((c) => c.text),
    existingSafeguards: (r.existingSafeguards || []).slice(0, 10).map((s) => ({
      text: String((s && s.text) || s || '').slice(0, 300),
      class: sgKeys.indexOf(s && s.class) !== -1 ? s.class : classifySafeguard((s && s.text) || s),
    })).filter((s) => s.text),
    notes: String(r.notes || '').slice(0, 400),
    reviewerStatus: 'DRAFT',
    aiDrafted: true,
  };
}

/** Draft recommendations for a scenario. Never sets a residual rating. */
export async function draftRecommendations(scenario) {
  const node = nodeById(scenario.nodeId);
  const ctx = buildContext({ nodeId: scenario.nodeId, includeVocabulary: true });
  ctx.scenario = {
    deviation: scenario.deviation,
    causes: (scenario.causes || []).map((c) => c.text),
    consequences: (scenario.consequences || []).map((c) => c.text),
    existingSafeguards: (scenario.existingSafeguards || []).map((s) => s.text),
  };
  const out = await runTask({
    name: 'draft_recommendations',
    taskClass: 'medium',
    instruction:
      'Draft recommendations for this scenario, working down the hierarchy of control: eliminate, substitute, engineering control, administrative control, PPE. ' +
      'Each recommendation must name a specific measure, where it goes, and the condition that would show it is done. ' +
      'Do not write "take care", "be careful", "use PPE" or "follow SOP" as an action. Do not state a residual risk rating. ' +
      'Give the technical basis in one sentence. Where a legal or standard basis is genuinely relevant, name it only if it appears in the facts.',
    shape: '[{"text":string,"technicalBasis":string,"controlLevel":string,"priority":"LOW|MEDIUM|HIGH|CRITICAL","responsibleDepartment":string,"legalBasis":string,"standardBasis":string}]',
    context: ctx,
  });
  const levels = CONTROL_LEVELS.map((l) => l.key);
  const list = (Array.isArray(out.result) ? out.result : []).slice(0, 6).map((r) => ({
    text: String((r && r.text) || '').slice(0, 700),
    technicalBasis: String((r && r.technicalBasis) || '').slice(0, 500),
    controlLevel: levels.indexOf(r && r.controlLevel) !== -1 ? r.controlLevel : null,
    priority: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].indexOf(r && r.priority) !== -1 ? r.priority : null,
    responsibleDepartment: String((r && r.responsibleDepartment) || '').slice(0, 120),
    legalBasis: String((r && r.legalBasis) || '').slice(0, 300),
    standardBasis: String((r && r.standardBasis) || '').slice(0, 300),
    nodeId: scenario.nodeId,
    scenarioId: scenario.id,
    nodeNumber: node ? node.nodeNumber : null,
  })).filter((r) => r.text);
  // Run the quality assessment the human would otherwise have to run by eye.
  for (const r of list) r.quality = assessRecommendationQuality(r);
  return { runId: out.runId, recommendations: list, envelope: out.envelope };
}

/** Extract structured fields from document text, with page locators. */
export async function extractFromDocument(doc, text) {
  const ctx = buildContext({ includeDocuments: true });
  ctx.documentUnderExtraction = { id: doc.id, title: doc.title, class: doc.docClass, pages: doc.pageCount };
  const out = await runTask({
    name: 'extract_fields',
    taskClass: 'strong',
    instruction:
      'Read the document excerpt and extract engineering facts into the field list. For EVERY value give the page and the exact original text you read it from. ' +
      'Extract only what the text states. Do not convert units — give the value and unit as written. Do not carry a value over from the project facts; extract only from this document. ' +
      'If the document states a value that conflicts with the project facts, still extract it: the app raises the conflict.',
    shape:
      '{"fields":[{"entityKind":"project|equipment|chemical|process_step","entityRef":string,"field":string,"value":string,"unit":string,"page":number,"quote":string,"confidence":0.0}],' +
      '"equipment":[{"tag":string,"type":string,"service":string,"capacity":string,"moc":string,"page":number,"quote":string}],' +
      '"chemicals":[{"name":string,"cas":string,"quantity":string,"unit":string,"state":string,"page":number,"quote":string}],' +
      '"processSteps":[{"stepNumber":string,"title":string,"description":string,"page":number}],' +
      '"teamMembers":[{"name":string,"designation":string,"department":string,"organization":string,"role":string,"page":number}]}',
    context: ctx,
    extraText: text,
    sourceIds: [doc.id],
  });
  return { runId: out.runId, extraction: out.result || {}, envelope: out.envelope };
}

/** Extract conditions from an uploaded licence / consent / EC, verbatim. */
export async function extractPermitConditions(permit, text) {
  const out = await runTask({
    name: 'extract_permit_conditions',
    taskClass: 'strong',
    instruction:
      'Extract the conditions from this licence / consent / approval. Reproduce each condition VERBATIM in "text" — do not paraphrase, shorten or reinterpret it. ' +
      'Put any interpretation in "analysis", clearly separate from the condition, and mark what is your reading rather than the document\'s words. ' +
      'Identify recurring monitoring, return or inspection requirements and their stated frequency. Give the condition number as the document gives it. ' +
      'If a due date is stated, give it; do not calculate one.',
    shape:
      '[{"conditionNumber":string,"text":string,"category":"monitoring|return|capacity|infrastructure|reporting|other",' +
      '"frequency":"DAILY|WEEKLY|FORTNIGHTLY|MONTHLY|QUARTERLY|HALF_YEARLY|ANNUAL|BIENNIAL|FIVE_YEARLY|ON_EVENT|ONE_TIME",' +
      '"statedDueDate":string,"analysis":string,"namesEquipment":[string],"namesChemicals":[string]}]',
    context: { permit: { type: permit.permitType, authority: permit.issuingAuthority, number: permit.number }, equipmentTags: scoped('equipment').map((e) => e.tag), chemicalNames: scoped('chemicals').map((c) => c.canonicalName) },
    extraText: text,
  });
  const freqs = ['DAILY', 'WEEKLY', 'FORTNIGHTLY', 'MONTHLY', 'QUARTERLY', 'HALF_YEARLY', 'ANNUAL', 'BIENNIAL', 'FIVE_YEARLY', 'ON_EVENT', 'ONE_TIME'];
  const list = (Array.isArray(out.result) ? out.result : []).slice(0, 80).map((c) => ({
    conditionNumber: String((c && c.conditionNumber) || '').slice(0, 24),
    text: String((c && c.text) || '').slice(0, 2000),
    category: ['monitoring', 'return', 'capacity', 'infrastructure', 'reporting', 'other'].indexOf(c && c.category) !== -1 ? c.category : 'other',
    frequency: freqs.indexOf(c && c.frequency) !== -1 ? c.frequency : null,
    statedDueDate: /^\d{4}-\d{2}-\d{2}$/.test((c && c.statedDueDate) || '') ? c.statedDueDate : null,
    analysis: String((c && c.analysis) || '').slice(0, 900),
    analysisStatus: 'AI_INFERRED',
    namesEquipment: (c && c.namesEquipment) || [],
    namesChemicals: (c && c.namesChemicals) || [],
  })).filter((c) => c.text);
  return { runId: out.runId, conditions: list, envelope: out.envelope };
}

/** Explain a legal applicability finding. The status itself is never changed. */
export async function explainApplicability(record) {
  const out = await runTask({
    name: 'explain_applicability',
    taskClass: 'strong',
    instruction:
      'Explain, for a plant engineer, why the system has given this obligation the status it has, and exactly what would resolve it. ' +
      'The status is fixed and computed by the application — do not propose a different one. Separate three things clearly: what the project facts say, ' +
      'what the application concluded from them, and what remains an open question. Do not state the content of any legal provision beyond what the facts below give.',
    shape: '{"factsSay":string,"systemConcluded":string,"openQuestions":[string],"toResolve":[string]}',
    context: {
      obligation: { instrument: record.instrumentTitle, topic: record.topic, section: record.sectionRuleSchedule, authority: record.authority, evidenceExpected: record.evidenceExpected },
      status: record.applicabilityStatus,
      engineReason: record.applicabilityReason,
      factsUsed: record.factsUsed,
      missingFacts: record.missingFacts,
      thresholdEvaluation: record.thresholdEvaluation ? { conclusion: record.thresholdEvaluation.conclusion, results: (record.thresholdEvaluation.results || []).map((r) => ({ chemical: r.chemicalName, status: r.status, arithmetic: r.arithmetic })) } : null,
      sourceRefs: record.sourceRefs,
    },
  });
  return { runId: out.runId, explanation: out.result || {} };
}

/** Write the narrative report sections from the project record. */
export async function draftReportSection(sectionKey, label) {
  const ctx = buildContext({ includeDocuments: true, includeProcessSteps: true });
  ctx.nodes = scoped('nodes').map((n) => ({ number: n.nodeNumber, name: n.worksheetName, intent: n.designIntent }));
  ctx.recommendationCount = scoped('recommendations').length;
  const out = await runTask({
    name: 'draft_report_section',
    taskClass: 'medium',
    instruction:
      'Write the "' + label + '" section of a HAZOP report for this project, in formal engineering English, from the facts given only. ' +
      'Do not state conditions, capacities or conclusions that are not in the facts. Do not claim compliance with anything. Plain paragraphs, no markdown headings.',
    shape: '{"paragraphs":[string]}',
    context: ctx,
  });
  const paras = ((out.result && out.result.paragraphs) || []).map((p) => String(p).slice(0, 2500)).filter(Boolean);
  return { runId: out.runId, paragraphs: paras };
}
