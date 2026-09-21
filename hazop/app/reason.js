// app/reason.js — the reasoning passes.
//
// A HAZOP review has a handful of questions that are genuinely hard, and they
// are hard in a way retrieval does not help with: what did the team not think
// of, what would break several safeguards at once, which safeguard is weaker
// than it looks. Those are the passes here.
//
// Each pass follows the same discipline:
//   * it states its method on screen before it runs, so the engineer can
//     judge the method and not just the output;
//   * it is given the project's own facts and told, explicitly, that a
//     finding it cannot ground in those facts is not a finding;
//   * it runs on the strong tier, because a cheap answer to "what did we
//     miss" is worse than no answer;
//   * it returns findings, never writes. Each finding may carry a proposed
//     record, and the engineer accepts them one at a time.
//
// The deterministic engines set the boundary. The guideword engine already
// knows which deviations a node should have covered, so the missing-deviation
// pass is not asked to invent that list — it is asked the harder question of
// what falls outside the list.

import { S, project, scoped, nodesSorted, matrix } from './state.js';
import { truncate, nowIso, uid } from './util.js';
import { getAdapter, aiAvailable } from './ai.js';
import {
  scenariosWithRisk,
  chemicalsResolved,
  alerts,
  recommendationRegister,
  qualityGate,
} from './state.js';
import { generateDeviations, deviationCoverage, deriveNodeFacts } from '../packages/domain/guidewords.js';
import { causeFamilyCoverage, CAUSE_FAMILIES, SAFEGUARD_CLASSES, CONSEQUENCE_FAMILIES } from '../packages/domain/causes.js';
import { rankRecommendations, selectDoable, migrationPlan, recRef, scenarioRef, EFFORT_FIELDS } from '../packages/calculations/doability.js';
import { CONTROL_LEVELS } from '../packages/calculations/dedup.js';

export const REASON_VERSION = 'reason-1.0.0';
export const REASON_PROMPT_VERSION = 'reason-p1';

/**
 * The shared preamble. It is long on purpose: every line of it is a mistake
 * this kind of pass makes when the line is absent.
 */
const DISCIPLINE = [
  'You are reviewing a HAZOP study as an experienced process-safety reviewer would — the person who reads the worksheet after the workshop and asks what the team was too close to see.',
  '',
  'The rules of this review:',
  '1. Every finding must be grounded in the project facts given below. Put the specific fact it rests on in "basedOn". A finding you cannot ground is not a finding — leave it out. Returning three grounded findings is better than returning ten with two invented.',
  '2. Never state a process condition, capacity, design pressure, chemical property, SDS value or legal threshold that is not in the facts. Where the absence of a fact is the point, say that the fact is missing — that is itself a finding worth having.',
  '3. Never produce a risk score, a likelihood, a severity or a threshold comparison. The application computes those. You may refer to a band the facts already carry.',
  '4. Do not repeat what the study already has. The facts include what is already written; a finding that duplicates an existing row, cause, safeguard or recommendation wastes the team\'s time.',
  '5. Say how confident you are, honestly: HIGH when the facts plainly support it, MEDIUM when it is a reasonable inference, LOW when it is a question worth asking rather than a conclusion.',
  '6. Write for an engineer. Name the node, the equipment tag, the guideword, the row number. No preamble, no restating the question.',
].join('\n');

/**
 * The passes. `method` is shown to the user before the pass runs — it is the
 * pass's own account of how it works, and the user judges it.
 */
export const REASONING_PASSES = Object.freeze([
  {
    key: 'MISSING_DEVIATIONS',
    label: 'What did we miss?',
    tier: 'complex',
    method:
      'The guideword engine lists the deviations each node should have examined and which have no worksheet row. This pass takes that list as the floor and looks for what falls outside it: deviations that arise from this node\'s specific chemistry, materials, utilities and human interactions rather than from the guideword grid.',
  },
  {
    key: 'SAFEGUARD_CHALLENGE',
    label: 'Challenge the safeguards',
    tier: 'complex',
    method:
      'For each safeguard the worksheet credits, ask what it depends on: a person present and trained, a tested trip, a correct sizing case, a power supply, an instrument that has not drifted. A safeguard whose dependency is unrecorded is credited on faith.',
  },
  {
    key: 'COMMON_CAUSE',
    label: 'Find the common causes',
    tier: 'complex',
    method:
      'Look across the whole worksheet for a single failure that would defeat more than one safeguard or initiate more than one scenario at once — a shared power supply, a shared instrument air header, one operator, one utility, one control system. Independence claimed row by row is often not independence.',
  },
  {
    key: 'ESCALATION',
    label: 'Trace the escalation',
    tier: 'complex',
    method:
      'Take the scenarios whose consequence is a release, a fire or a runaway and ask what they set off next: the neighbouring equipment, the drainage, the structure, the emergency response. A HAZOP row usually stops at the first consequence; the site does not.',
  },
  {
    key: 'RECOMMENDATION_QUALITY',
    label: 'Are the actions closeable?',
    tier: 'default',
    method:
      'A recommendation is worth having only if somebody can close it and somebody else can check that it was closed. This pass reads each open action and says what is missing: the equipment tag, the setting, the frequency, the document, the owner, or the evidence that would prove it done.',
  },
  {
    key: 'PRIORITY_CASE',
    label: 'Build the case for doing the work',
    tier: 'default',
    method:
      'Takes the doability ranking and the before-and-after risk picture the application computed, and writes the argument a plant manager needs: what the first package of work is, what it removes, what it leaves, and what the interim measure is for the work that has to wait.',
  },
]);

export function passMeta(key) {
  return REASONING_PASSES.find((p) => p.key === key) || null;
}

// ---------------------------------------------------------------------------
// The facts each pass is given
// ---------------------------------------------------------------------------

function nodeLabel(id) {
  const n = nodesSorted().find((x) => x.id === id);
  return n ? 'Node ' + n.nodeNumber + ' (' + (n.worksheetName || '') + ')' : id;
}

function worksheetFacts(limit) {
  const rows = scenariosWithRisk();
  return rows.slice(0, limit || 40).map((s) => ({
    scenarioId: s.id,
    node: nodeLabel(s.nodeId),
    row: s.rowNumber,
    parameter: s.parameterLabel || s.parameter,
    guideword: s.guidewordLabel || s.guideword,
    deviation: s.deviation,
    causes: (s.causes || []).map((c) => c.text),
    causeFamilies: (s.causes || []).map((c) => c.family).filter(Boolean),
    consequences: (s.consequences || []).map((c) => c.text),
    safeguards: (s.existingSafeguards || []).map((c) => c.text + (c.class ? ' [' + c.class + ']' : '')),
    initialBand: s.initialRiskResult && s.initialRiskResult.ok ? s.initialRiskResult.bandLabel : 'not rated',
    residualBand: s.residualRiskResult && s.residualRiskResult.ok ? s.residualRiskResult.bandLabel : 'not rated',
    recommendations: scoped('recommendations').filter((r) => r.scenarioId === s.id).map((r) => recRef(r) + ': ' + truncate(r.text, 120)),
  }));
}

function nodeFacts() {
  const ctx = { equipment: scoped('equipment'), chemicals: chemicalsResolved(), chemProperties: scoped('chem_properties') };
  return nodesSorted().map((n) => {
    const rows = scoped('scenarios').filter((s) => s.nodeId === n.id);
    const gen = generateDeviations(n, ctx);
    const cov = deviationCoverage(n, ctx, rows);
    const fam = causeFamilyCoverage(deriveNodeFacts(n, ctx), rows);
    return {
      node: 'Node ' + n.nodeNumber + ' (' + (n.worksheetName || '') + ')',
      designIntent: truncate(n.designIntent || '', 400),
      equipment: (n.equipmentIds || []).map((id) => {
        const e = scoped('equipment').find((x) => x.id === id);
        return e
          ? {
              tag: e.tag,
              type: e.type,
              capacity: e.capacity || 'not recorded',
              moc: e.materialOfConstruction || 'not recorded',
              designPressure: e.designPressure || 'not recorded',
              designTemperature: e.designTemperature || 'not recorded',
              relief: e.reliefArrangement || 'not recorded',
              agitator: e.agitator || 'not recorded',
              heating: e.heatingSystem || 'not recorded',
              cooling: e.coolingSystem || 'not recorded',
            }
          : id;
      }),
      chemicals: (n.chemicalIds || []).map((id) => {
        const c = chemicalsResolved().find((x) => x.id === id);
        return c ? { name: c.canonicalName, cas: c.cas, state: c.physicalState, classification: c.hazardousClassification || 'not recorded' } : id;
      }),
      utilities: n.utilities || [],
      operatingTemperature: n.operatingTemperature || 'not recorded',
      operatingPressure: n.operatingPressure || 'not recorded',
      // The engine's own answer, given so the pass does not re-derive it.
      guidewordEngineSaysUncovered: (cov.uncovered || []).map((c) => c.deviation),
      guidewordEngineSaysSuppressed: (gen.suppressed || []).slice(0, 12).map((x) => x.deviation + ' (' + x.reason + ')'),
      causeFamiliesNotUsed: fam.labels || [],
      rowsWritten: rows.length,
    };
  });
}

function chemicalFacts() {
  const al = alerts();
  return {
    chemicals: chemicalsResolved().map((c) => ({
      name: c.canonicalName,
      cas: c.cas,
      state: c.physicalState,
      grade: c.grade || 'not recorded',
      quantity: c.quantity == null ? 'NOT RECORDED' : String(c.quantity) + ' ' + (c.quantityUnit || ''),
      classification: c.hazardousClassification || 'not recorded',
      recordedProperties: scoped('chem_properties')
        .filter((x) => x.chemicalId === c.id && x.value)
        .map((x) => (x.property || x.key) + ' = ' + x.value + (x.unit ? ' ' + x.unit : '') + ' [' + x.status + ']'),
    })),
    hazardAlerts: al.alerts.slice(0, 12).map((a) => ({ rule: a.rule, severity: a.severity, title: a.title, mechanism: a.chain.mechanism, node: a.chain.node })),
    propertyGaps: al.gaps.slice(0, 18).map((g) => g.chemicalName + ': ' + g.propertyLabel + ' (blocks ' + (g.blocks || []).join(', ') + ')'),
  };
}

// ---------------------------------------------------------------------------
// The passes themselves
// ---------------------------------------------------------------------------

const SHAPE_FINDINGS =
  'Answer with JSON only, in this shape: {"result":{"method":"one sentence on what you actually did","summary":"two or three sentences of plain findings","findings":[{"title":"the finding, one line","where":"node and row, or the equipment tag","reasoning":"why it matters, two sentences at most","basedOn":"the specific project fact this rests on","confidence":"HIGH|MEDIUM|LOW","proposal":{...}}]}}';

async function ask(req) {
  if (!aiAvailable()) throw { code: 'not_granted', message: 'The assistant is not available in this view.' };
  const prompt = [
    DISCIPLINE,
    '',
    'THE PASS: ' + req.label,
    'THE METHOD YOU MUST FOLLOW: ' + req.method,
    '',
    req.task,
    '',
    SHAPE_FINDINGS,
    req.proposalShape ? '' : null,
    req.proposalShape ? 'For each finding, "proposal" must be: ' + req.proposalShape : null,
    '',
    'PROJECT FACTS (the only facts you may rely on):',
    JSON.stringify(req.facts).slice(0, 42000),
  ]
    .filter((x) => x !== null)
    .join('\n');
  const out = await getAdapter().json(prompt, { modelTier: req.tier || 'complex', signal: req.signal });
  const r = (out && out.result) || out || {};
  return {
    method: r.method || null,
    summary: r.summary || null,
    findings: Array.isArray(r.findings) ? r.findings.slice(0, 14) : [],
  };
}

/** Run one pass. Returns findings, each optionally carrying a proposed write. */
export async function runPass(key, opts) {
  const meta = passMeta(key);
  if (!meta) throw { code: 'bad_request', message: 'Unknown pass.' };
  const p = project();
  if (!p) throw { code: 'bad_request', message: 'No project is open.' };
  const signal = opts && opts.signal;
  const started = Date.now();
  let result;

  if (key === 'MISSING_DEVIATIONS') {
    result = await ask({
      label: meta.label,
      method: meta.method,
      tier: meta.tier,
      signal,
      task: [
        'The guideword engine has already listed, per node, the deviations that have no worksheet row — they are in "guidewordEngineSaysUncovered" and the team can see them. Do NOT simply repeat that list.',
        '',
        'Your job is the part the grid cannot reach. For each node, using its design intent, its equipment, its materials of construction, its chemicals, its utilities and the operations people perform on it, identify deviations or hazards that:',
        '  - arise from this specific chemistry or material rather than from a parameter going high or low (a reaction with a contaminant, a material incompatibility, a phase change, a decomposition, a static accumulation);',
        '  - arise from an operating mode the worksheet does not cover (start-up, shutdown, cleaning, maintenance, sampling, catalyst or filter change, breakdown recovery, plant standing idle);',
        '  - arise from a human interaction (a wrong charge, a wrong sequence, a bypass left in, a valve left shut, a manual intervention under time pressure);',
        '  - arise at the boundary with the next node, where an upset in one becomes a cause in the other.',
        '',
        'Also list any entry in "guidewordEngineSaysSuppressed" you think was suppressed wrongly, and say why the node fact behind the suppression may be incorrect.',
      ].join('\n'),
      proposalShape:
        'either null, or {"kind":"deviation","node":"the node number","parameter":"a parameter label","guideword":"a guideword","deviation":"the deviation as it should appear on the worksheet","causes":["..."],"consequences":["..."]} — and remember the application will only accept a deviation a human adds to the worksheet, so the proposal is a suggestion for the facilitator, not a write.',
      facts: { nodes: nodeFacts(), chemicals: chemicalFacts(), existingRows: worksheetFacts(40) },
    });
    // A deviation is never written by the assistant: the guideword engine owns
    // the worksheet's structure. Each finding becomes a data gap or a note.
    for (const f of result.findings) {
      f.action = {
        op: 'create',
        collection: 'data_gaps',
        patch: {
          entityKind: 'node',
          field: 'deviation_coverage',
          label: truncate(f.title || 'Deviation to consider', 160),
          blocks: ['HAZOP_COMPLETENESS'],
          detail: [f.reasoning, f.basedOn ? 'Based on: ' + f.basedOn : null, f.where ? 'Where: ' + f.where : null].filter(Boolean).join(' '),
        },
        summary: 'Raise "' + truncate(f.title || '', 90) + '" for the facilitator to consider on the worksheet',
      };
    }
  } else if (key === 'SAFEGUARD_CHALLENGE') {
    result = await ask({
      label: meta.label,
      method: meta.method,
      tier: meta.tier,
      signal,
      task: [
        'For each safeguard credited on the worksheet rows below, ask what it silently depends on, and say which of those dependencies the project has recorded and which it has not.',
        '',
        'The dependencies worth asking about:',
        '  - an alarm depends on somebody present, trained, believing it, and having time to act before the consequence;',
        '  - a trip or interlock depends on a proof test at a stated interval, on not being bypassed, and on a final element that will actually move;',
        '  - a relief device depends on the right sizing case, a clear inlet and outlet, and a safe discharge location;',
        '  - a procedure depends on being current, being read, and being followable under the conditions the scenario describes;',
        '  - an instrument depends on calibration, on the right range, and on its tapping not plugging;',
        '  - anything electrical depends on a power supply that the scenario may also have taken out.',
        '',
        'Name the safeguards that are weaker than the worksheet implies, and the ones that should not be credited at all until a dependency is recorded. Where a safeguard class is missing from a row that needs one, say which class.',
        '',
        'Safeguard classes the application recognises: ' + SAFEGUARD_CLASSES.map((s) => s.key).join(', ') + '.',
      ].join('\n'),
      proposalShape:
        'either null, or {"kind":"recommendation","scenarioId":"the scenarioId from the facts","text":"a specific, closeable action naming the equipment tag, the setting or the interval","technicalBasis":"why","controlLevel":"one of ' + CONTROL_LEVELS.map((c) => c.key).join('|') + '"}',
      facts: { rows: worksheetFacts(34), safeguardClasses: SAFEGUARD_CLASSES, nodes: nodeFacts() },
    });
    attachRecommendationActions(result.findings);
  } else if (key === 'COMMON_CAUSE') {
    result = await ask({
      label: meta.label,
      method: meta.method,
      tier: meta.tier,
      signal,
      task: [
        'Read the whole worksheet at once, not row by row. Find single failures that would defeat more than one safeguard, or initiate more than one scenario, at the same time.',
        '',
        'What to look for:',
        '  - one utility serving several safeguards (instrument air, cooling water, electrical supply, nitrogen, steam);',
        '  - one instrument or one transmitter feeding both a control loop and its own alarm;',
        '  - one control system implementing both the control and the protection;',
        '  - one operator expected to respond to several alarms in the same upset;',
        '  - a common environment — the same room, the same bund, the same structure, the same drain;',
        '  - a common maintenance activity, a common calibration, a common spare.',
        '',
        'For each one, list the rows it affects by node and row number, and say what the study would have to record for the independence it currently implies to be real.',
      ].join('\n'),
      proposalShape:
        'either null, or {"kind":"assumption","category":"Common cause","text":"the independence assumption the study is making","basis":"what would have to be true for it to hold"}',
      facts: { rows: worksheetFacts(44), nodes: nodeFacts(), utilities: Array.from(new Set(nodesSorted().flatMap((n) => n.utilities || []))) },
    });
    for (const f of result.findings) {
      f.action = {
        op: 'create',
        collection: 'assumptions',
        patch: {
          category: 'Common cause',
          text: truncate(f.title || '', 700),
          basis: [f.reasoning, f.basedOn ? 'Based on: ' + f.basedOn : null].filter(Boolean).join(' ').slice(0, 300),
        },
        summary: 'Record the independence assumption: ' + truncate(f.title || '', 90),
      };
    }
  } else if (key === 'ESCALATION') {
    result = await ask({
      label: meta.label,
      method: meta.method,
      tier: meta.tier,
      signal,
      task: [
        'Take the rows whose consequence is a loss of containment, a fire, an explosion, a dust cloud or a runaway reaction. For each, ask what happens next on this site.',
        '',
        'The escalation questions:',
        '  - what is next to it, and what does the released material or the heat do to that;',
        '  - where does a spill go — the bund, the drain, the effluent plant, the estate drain, the watercourse;',
        '  - what does a fire do to the structure, the cabling, the relief system and the emergency water supply;',
        '  - what does the emergency response need that the project has not recorded;',
        '  - does the escalated consequence cross the site boundary, and what changes if it does.',
        '',
        'Say for each chain whether the worksheet already carries the escalated consequence or stops at the first one. Where a consequence family is absent from a row that needs it, name the family.',
        '',
        'Consequence families the application recognises: ' + CONSEQUENCE_FAMILIES.map((c) => c.key).join(', ') + '.',
      ].join('\n'),
      proposalShape:
        'either null, or {"kind":"recommendation","scenarioId":"the scenarioId from the facts","text":"a specific, closeable action","technicalBasis":"the escalation path it interrupts","controlLevel":"one of ' + CONTROL_LEVELS.map((c) => c.key).join('|') + '"}',
      facts: { rows: worksheetFacts(34), nodes: nodeFacts(), chemicals: chemicalFacts(), consequenceFamilies: CONSEQUENCE_FAMILIES },
    });
    attachRecommendationActions(result.findings);
  } else if (key === 'RECOMMENDATION_QUALITY') {
    const reg = recommendationRegister();
    result = await ask({
      label: meta.label,
      method: meta.method,
      tier: meta.tier,
      signal,
      task: [
        'Read each open recommendation and answer one question: could somebody close this, and could somebody else check that it was closed?',
        '',
        'What makes an action closeable:',
        '  - it names the equipment by tag, not by description;',
        '  - it states the setting, the interval, the size or the document, where one applies;',
        '  - it names a single deliverable, not a programme of work;',
        '  - it has an owner who can actually do it;',
        '  - the evidence that would prove it done is obvious from the wording.',
        '',
        'For each action that fails, write the version that would pass. Keep the engineering intent exactly the same — you are sharpening the wording, not changing the measure. Where the control level recorded does not match what the action actually is, say so.',
      ].join('\n'),
      proposalShape:
        'either null, or {"kind":"rewrite","recommendationId":"the id from the facts","text":"the sharpened wording","technicalBasis":"unchanged or clarified basis","controlLevel":"one of ' + CONTROL_LEVELS.map((c) => c.key).join('|') + ' if it should change, else null"}',
      facts: {
        recommendations: reg.kept.slice(0, 40).map((r) => ({
          recommendationId: r.id,
          ref: recRef(r),
          node: r.nodeNumber,
          text: r.text,
          technicalBasis: r.technicalBasis || 'not recorded',
          controlLevel: r.controlLevel || 'not recorded',
          owner: r.responsibleDepartment || 'not recorded',
          target: r.targetDate || 'not set',
          status: r.status,
          quality: r.quality || null,
        })),
        controlLevels: CONTROL_LEVELS,
        equipmentTags: scoped('equipment').map((e) => e.tag),
      },
    });
    for (const f of result.findings) {
      const pr = f.proposal;
      if (pr && pr.kind === 'rewrite' && pr.recommendationId && pr.text) {
        const patch = { text: String(pr.text).slice(0, 700) };
        if (pr.technicalBasis) patch.technicalBasis = String(pr.technicalBasis).slice(0, 500);
        if (pr.controlLevel && CONTROL_LEVELS.some((c) => c.key === pr.controlLevel)) patch.controlLevel = pr.controlLevel;
        f.action = {
          op: 'update',
          collection: 'recommendations',
          recordId: pr.recommendationId,
          patch,
          summary: 'Sharpen the wording so the action can be closed and checked',
        };
      }
    }
  } else if (key === 'PRIORITY_CASE') {
    const m = matrix();
    const recs = scoped('recommendations');
    const scen = scoped('scenarios');
    const ranking = rankRecommendations({ recommendations: recs, matrix: m, scenarios: scen, partial: true });
    const selection = selectDoable({ ranking, mode: 'THIS_QUARTER', matrix: m, scenarios: scen });
    const plan = migrationPlan({ matrix: m, scenarios: scen, selection });
    result = await ask({
      label: meta.label,
      method: meta.method,
      tier: meta.tier,
      signal,
      task: [
        'The application has already ranked the open actions by practicability and computed the before-and-after risk profile for the "this quarter" cut. Those numbers are given below and are not yours to recompute.',
        '',
        'Write the case a plant manager needs in order to sanction the first package of work:',
        '  - which actions are in the package, by their reference, and why those;',
        '  - what the package removes, quoting the band counts the application computed;',
        '  - what it leaves — and be specific about the rows still needing action afterwards;',
        '  - for each piece of work that has to wait, what the interim measure is until it happens;',
        '  - where the picture is unreliable because an effort field is undeclared or a residual rating is missing, say so, because a priority order built on undeclared effort is a guess.',
        '',
        'Do not overstate the benefit. Where a selected action has no residual rating, the after picture does not move for it, and that is a gap in the worksheet rather than evidence the action is worthless.',
      ].join('\n'),
      proposalShape:
        'either null, or {"kind":"effort","recommendationId":"the id","effort":{"costBand":"A|B|C|D","leadTime":"DAYS|WEEKS|MONTHS|OVER_A_YEAR","outage":"NONE|PLANNED_SHUTDOWN|EXTENDED_SHUTDOWN","engineering":"NONE|MINOR|MODIFICATION|REDESIGN","competency":"IN_HOUSE|LOCAL_VENDOR|SPECIALIST|NOT_IDENTIFIED","approval":"NONE|INTERNAL_ONLY|REGULATOR","spaceAccess":"YES|TIGHT|NO"}} — only for an action whose effort you can infer from the project facts, and say in "basedOn" what you inferred it from.',
      facts: {
        computedByApplication: {
          counts: ranking.counts,
          bestValue: ranking.byValue.slice(0, 12).map((x) => ({
            recommendationId: x.recommendation.id,
            ref: recRef(x.recommendation),
            text: truncate(x.recommendation.text, 140),
            doabilityScore: x.doability.score,
            band: x.doability.bandLabel,
            effortDeclared: x.doability.coverage + '%',
            riskRemoved: x.benefit.measured ? x.benefit.riskDelta : 'not quantified',
          })),
          effortUndeclared: ranking.undecidable.slice(0, 14).map((u) => ({ recommendationId: u.recommendation.id, ref: recRef(u.recommendation), text: truncate(u.recommendation.text, 110), missing: u.missing.map((mm) => mm.label) })),
          selection: selection.counts,
          bandCountsBefore: plan.bandCounts.before,
          bandCountsAfter: plan.bandCounts.after,
          needingActionBefore: plan.intolerable.before,
          needingActionAfter: plan.intolerable.after,
          rowsWithoutResidualRating: plan.points.filter((x) => !x.after).length,
        },
        effortFields: EFFORT_FIELDS.map((f) => ({ key: f.key, question: f.question, options: f.options.map((o) => o.value + ' = ' + o.label) })),
        equipment: scoped('equipment').map((e) => ({ tag: e.tag, type: e.type })),
        gate: (() => {
          const g = qualityGate();
          return g ? { status: g.status, blocking: g.blocking.filter((k) => !k.pass).map((k) => k.label) } : null;
        })(),
      },
    });
    for (const f of result.findings) {
      const pr = f.proposal;
      if (pr && pr.kind === 'effort' && pr.recommendationId && pr.effort) {
        const eff = {};
        for (const fld of EFFORT_FIELDS) {
          const v = pr.effort[fld.key];
          if (v && fld.options.some((o) => o.value === v)) eff[fld.key] = v;
        }
        if (Object.keys(eff).length) {
          f.action = {
            op: 'update',
            collection: 'recommendations',
            recordId: pr.recommendationId,
            patch: { effort: eff },
            summary: 'Declare effort inferred from the project: ' + Object.keys(eff).join(', '),
          };
        }
      }
    }
  } else {
    throw { code: 'bad_request', message: 'Unknown pass.' };
  }

  await logReasoningRun(key, meta, started, result);
  return result;
}

/** A finding proposing a recommendation becomes a create on a real scenario. */
function attachRecommendationActions(findings) {
  const rows = scoped('scenarios');
  for (const f of findings) {
    const pr = f.proposal;
    if (!pr || pr.kind !== 'recommendation' || !pr.text) continue;
    const sc = rows.find((s) => s.id === pr.scenarioId);
    if (!sc) {
      // A recommendation with no real row cannot be created; keep the finding
      // and say why, rather than dropping it silently.
      f.note = 'No worksheet row matches the id this proposal named, so it cannot be added automatically. Raise it from the row itself.';
      continue;
    }
    f.action = {
      op: 'create',
      collection: 'recommendations',
      patch: {
        scenarioId: sc.id,
        nodeId: sc.nodeId,
        text: String(pr.text).slice(0, 700),
        technicalBasis: String(pr.technicalBasis || f.reasoning || '').slice(0, 500),
        controlLevel: CONTROL_LEVELS.some((c) => c.key === pr.controlLevel) ? pr.controlLevel : null,
      },
      summary: 'Add an action to ' + nodeLabel(sc.nodeId) + ' row ' + scenarioRef(sc) + ': ' + truncate(pr.text, 80),
    };
  }
}

async function logReasoningRun(key, meta, started, result) {
  if (!S.store) return;
  try {
    await S.store.create(
      'reasoning_runs',
      {
        projectId: S.projectId,
        pass: key,
        label: meta.label,
        tierRequested: meta.tier,
        promptVersion: REASON_PROMPT_VERSION,
        engineVersion: REASON_VERSION,
        runtimeMs: Date.now() - started,
        findingCount: (result.findings || []).length,
        withProposals: (result.findings || []).filter((f) => f.action).length,
        methodStated: result.method || null,
        // A reasoning pass produces proposals, never conclusions.
        humanReviewRequired: true,
        requestedBy: S.actor.id,
        createdAt: nowIso(),
      },
      { projectId: S.projectId, actorKind: 'ai' }
    );
  } catch (e) {
    /* logging failure must not lose the findings */
  }
}
