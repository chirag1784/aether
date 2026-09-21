// app/views/chat.js — the persistent AI panel.
//
// The chat may read project state and PROPOSE actions. It never mutates
// anything directly: a proposed action is rendered as a confirmation card and
// runs through the same validators as a human edit.

import { h, clear, toast, truncate, nowIso, uid } from '../util.js';
import { S, render, project, scoped, nodesSorted, matrix, complianceRegister, complianceCounts, applicability, qualityGate, alerts, recommendationRegister, completeness, permitStatuses, chemicalsResolved, thresholdSets, go } from '../state.js';
import { aiAvailable, getAdapter, buildContext } from '../ai.js';
import { riskFromLS } from '../../packages/calculations/risk.js';
import { generateDeviations } from '../../packages/domain/guidewords.js';

const SUGGESTIONS = [
  'Which laws may apply to this reactor node, and why?',
  'Why did you flag MSIHC for this project?',
  'Show me the threshold calculation.',
  'What compliance evidence is missing?',
  'Show upcoming renewals.',
  'Which worksheet rows are high risk with no action?',
  'What is blocking the report?',
  'Which cause families has node 01 not considered?',
];

let controller = null;

export function renderChat() {
  const panel = h('div', { style: { display: 'contents' } });
  const head = h(
    'div',
    { class: 'chat-head' },
    h('h2', { text: 'Assistant' }),
    S.chatBusy ? h('button', { class: 'btn sm ghost', text: 'Stop', onclick: () => { if (controller) controller.abort(); } }) : null,
    S.chat.length ? h('button', { class: 'btn sm ghost', text: 'Clear', onclick: () => { S.chat = []; render(); } }) : null,
    h('button', { class: 'btn ghost icon', 'aria-label': 'Close the assistant', text: '✕', onclick: () => { S.chatOpen = false; render(); } })
  );

  const log = h('div', { class: 'chat-log', id: 'chat-log' });

  if (!aiAvailable()) {
    log.appendChild(
      h('div', { class: 'note plain small' }, h('strong', { text: 'The assistant is not available in this view. ' }), 'Every deterministic part of the app still works. When it is available it runs on your own Claude account, and it can read this project\'s data to answer questions — it cannot change anything without your confirmation.')
    );
  } else if (!S.chat.length) {
    log.appendChild(h('div', { class: 'msg system' }, h('div', { class: 'msg-body', text: 'Ask about this project. The assistant reads the project record and the app\'s own findings; it does not compute risk scores or threshold crossings, and it cannot change project data without your confirmation.' })));
    log.appendChild(h('div', { class: 'chat-suggest' }, SUGGESTIONS.map((s) => h('button', { text: s, onclick: () => send(s) }))));
  }

  for (const m of S.chat) {
    if (m.role === 'action') {
      log.appendChild(actionCard(m));
      continue;
    }
    log.appendChild(h('div', { class: 'msg ' + m.role }, h('div', { class: 'msg-role', text: m.role === 'user' ? 'You' : m.role === 'ai' ? 'Assistant' : 'Note' }), h('div', { class: 'msg-body', text: m.text })));
  }

  if (S.chatBusy) log.appendChild(h('div', { class: 'msg ai' }, h('div', { class: 'msg-role', text: 'Assistant' }), h('div', { class: 'msg-body' }, h('span', { class: 'spin' }), h('span', { text: ' Thinking…' }))));

  const box = h('textarea', { id: 'chat-input', placeholder: aiAvailable() ? 'Ask about this project…' : 'Unavailable in this view', rows: 2, disabled: !aiAvailable() });
  box.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      const v = box.value.trim();
      if (v) {
        box.value = '';
        send(v);
      }
    }
  });
  const foot = h(
    'div',
    { class: 'chat-foot' },
    box,
    h('div', { class: 'between', style: { 'margin-top': '6px' } }, h('span', { class: 'muted small', text: 'Cmd/Ctrl + Enter to send' }), h('button', { class: 'btn sm primary', text: 'Send', disabled: !aiAvailable() || S.chatBusy, onclick: () => { const v = box.value.trim(); if (!v) return; box.value = ''; send(v); } }))
  );

  panel.appendChild(head);
  panel.appendChild(log);
  panel.appendChild(foot);
  setTimeout(() => {
    const el = document.getElementById('chat-log');
    if (el) el.scrollTop = el.scrollHeight;
  }, 30);
  return panel;
}

function actionCard(m) {
  const a = m.action;
  return h(
    'div',
    { class: 'card', style: { padding: '10px' } },
    h('div', { class: 'row', style: { gap: '6px', 'margin-bottom': '5px' } }, h('span', { class: 'badge inferred', text: 'PROPOSED ACTION' }), h('span', { class: 'tag', text: a.kind })),
    h('div', { style: { 'font-size': '12.5px' }, text: a.summary }),
    m.applied ? h('div', { class: 'badge verified', style: { 'margin-top': '6px' }, text: 'APPLIED' }) : m.declined ? h('div', { class: 'badge na', style: { 'margin-top': '6px' }, text: 'DECLINED' }) : h('div', { class: 'btn-row', style: { 'margin-top': '7px' } }, h('button', { class: 'btn sm primary', text: 'Apply', onclick: () => applyAction(m) }), h('button', { class: 'btn sm ghost', text: 'Decline', onclick: () => { m.declined = true; render(); } }))
  );
}

/**
 * Standing instructions. Kept as a leading user turn that is never dropped.
 */
function instructions() {
  return [
    'You are the assistant inside HAZOP MASTER AI, a process-safety platform. You are talking to a process-safety engineer or HAZOP facilitator.',
    '',
    'RULES YOU MUST FOLLOW:',
    '1. Answer from the PROJECT STATE below and nothing else. If the answer is not there, say what is missing and where in the app to record it.',
    '2. Never state a process condition, capacity, design pressure or temperature, interlock, chemical property, SDS value, legal threshold or statutory obligation that is not in the state.',
    '3. Never compute or assert a risk score, a threshold crossing, a unit conversion or a renewal date. The application computes these; quote the figures it has already computed and say they are the application\'s.',
    '4. Never say the facility is compliant, or that an obligation definitely applies. Those are the application\'s statuses and a reviewer\'s decision.',
    '5. For every legal answer, say clearly which of three things each part is: a source fact, the application\'s own analysis, or an unresolved question.',
    '6. Be concise and specific. Use the plant\'s own terms — node numbers, equipment tags, guidewords. Plain text, short paragraphs, no markdown headings.',
    '7. You may propose an action for the user to confirm. To do so, end your reply with a line starting ACTION: followed by one JSON object of the form {"kind":"add_assumption"|"add_data_gap"|"add_recommendation"|"add_team_member"|"add_scenario_note", "summary":"one line for the user", "payload":{...}}. Propose at most one. Never claim to have made a change.',
  ].join('\n');
}

function projectState() {
  const p = project();
  if (!p) return { note: 'No project is open.' };
  const m = matrix();
  const cc = complianceCounts();
  const gate = qualityGate();
  const reg = recommendationRegister();
  const comp = completeness();
  const al = alerts();
  const run = applicability();

  const nodes = nodesSorted().map((n) => {
    const rows = scoped('scenarios').filter((s) => s.nodeId === n.id);
    const gen = generateDeviations(n, { equipment: scoped('equipment'), chemicals: chemicalsResolved(), chemProperties: scoped('chem_properties') });
    return {
      number: n.nodeNumber,
      name: n.worksheetName,
      designIntent: truncate(n.designIntent || '', 300),
      status: n.reviewStatus,
      equipment: (n.equipmentIds || []).map((id) => (scoped('equipment').filter((e) => e.id === id)[0] || {}).tag).filter(Boolean),
      chemicals: (n.chemicalIds || []).map((id) => (scoped('chemicals').filter((c) => c.id === id)[0] || {}).canonicalName).filter(Boolean),
      utilities: n.utilities,
      operatingTemperature: n.operatingTemperature,
      rowCount: rows.length,
      meaningfulDeviations: gen.combinations.length,
      uncoveredDeviations: gen.combinations.filter((c) => !rows.some((s) => s.parameter === c.parameter && s.guideword === c.guideword)).map((c) => c.deviation).slice(0, 12),
      rows: rows.slice(0, 22).map((s) => {
        let risk = null;
        try {
          risk = riskFromLS(m, s.initialLikelihood, s.initialSeverity);
        } catch (e) {
          risk = null;
        }
        return {
          row: s.rowNumber,
          deviation: s.deviation,
          causes: (s.causes || []).map((c) => c.text),
          consequences: (s.consequences || []).map((c) => c.text),
          existingSafeguards: (s.existingSafeguards || []).map((c) => c.text),
          initialRisk: risk && risk.ok ? { band: risk.bandLabel, score: risk.score, basis: risk.basis, computedBy: 'application' } : 'not rated',
          residualBasis: s.residualBasisKind || null,
          recommendations: scoped('recommendations').filter((r) => r.scenarioId === s.id).map((r) => (r.recId || '') + ': ' + r.text),
          status: s.reviewerStatus,
        };
      }),
    };
  });

  return {
    project: { name: p.projectName, client: p.clientName, site: p.siteName, product: p.product, process: p.process, stage: p.processStage, revision: p.revision, processDescription: truncate(p.processDescription || '', 1400) },
    jurisdiction: p.jurisdiction || {},
    riskMatrix: { id: m.id, version: m.version, combine: m.combine, bands: m.bands.map((b) => ({ key: b.key, label: b.label, min: b.min, max: b.max, action: b.action })) },
    completeness: { data: comp.data.percent, critical: comp.critical.percent, missingCritical: comp.critical.missing.slice(0, 20).map((x) => x.label) },
    chemicals: chemicalsResolved().map((c) => ({
      name: c.canonicalName,
      cas: c.cas,
      casValid: c.casValid,
      quantity: c.quantity === null || c.quantity === undefined ? 'NOT RECORDED' : String(c.quantity) + ' ' + (c.quantityUnit || ''),
      quantityStatus: c.quantityStatus,
      state: c.physicalState,
      classification: c.hazardousClassification || 'not recorded',
      properties: scoped('chem_properties').filter((x) => x.chemicalId === c.id).map((x) => ({ key: x.key, value: x.value, unit: x.unit, status: x.status })),
    })),
    equipment: scoped('equipment').map((e) => ({ tag: e.tag, type: e.type, capacity: e.capacity, moc: e.materialOfConstruction, designPressure: e.designPressure, designTemperature: e.designTemperature, relief: e.reliefArrangement, agitator: e.agitator, heating: e.heatingSystem, cooling: e.coolingSystem })),
    nodes,
    hazardAlerts: al.alerts.slice(0, 12).map((a) => ({ rule: a.rule, severity: a.severity, title: a.title, fact: a.chain.fact, source: a.chain.source, mechanism: a.chain.mechanism, node: a.chain.node, arithmetic: a.arithmetic || null, computedBy: 'application' })),
    dataGaps: al.gaps.slice(0, 15).map((g) => ({ chemical: g.chemicalName, property: g.propertyLabel, blocks: g.blocks })),
    legal: {
      counts: cc,
      pendingQuestions: run ? run.pendingQuestions.map((q) => ({ question: q.question, fact: q.fact, gatesObligations: q.obligationCount })) : [],
      records: complianceRegister().slice(0, 30).map((r) => ({
        instrument: r.instrumentTitle,
        section: r.sectionRuleSchedule,
        obligation: r.topic,
        applicability: r.effectiveStatus,
        setBy: r.humanStatus ? 'reviewer' : r.setBy,
        reasonFromApplication: r.humanReason || r.applicabilityReason,
        missingFacts: r.missingFacts,
        evidenceExpected: r.evidenceExpected,
        evidenceHeld: (r.evidence || []).map((e) => e.title + (e.status === 'VERIFIED' ? ' (verified)' : ' (not verified)')),
        thresholdConclusion: r.thresholdEvaluation ? r.thresholdEvaluation.conclusion : null,
        thresholdArithmetic: r.thresholdEvaluation ? (r.thresholdEvaluation.results || []).map((x) => x.chemicalName + ': ' + (x.arithmetic || x.detail)).slice(0, 6) : null,
        officialSource: ((r.sourceRefs || [])[0] || {}).url || null,
        sourceStatus: ((r.sourceRefs || [])[0] || {}).sourceStatus || null,
      })),
      thresholdSets: thresholdSets().map((s) => ({ label: s.label, locator: s.locator, entriesEntered: s.entries.length, status: s.status })),
    },
    permits: permitStatuses().map((x) => ({ type: x.permitType, number: x.number, authority: x.issuingAuthority, expiry: x.expiryDate, renewal: x.renewalDate, computedStatus: x.expiry.status, daysRemaining: x.expiry.daysRemaining, computedBy: 'application' })),
    recommendations: reg.kept.slice(0, 40).map((r) => ({ id: r.recId, node: r.nodeNumber, text: r.text, controlLevel: r.controlLevel, priority: r.priority, owner: r.responsibleDepartment, target: r.targetDate, status: r.status })),
    qualityGate: gate ? { status: gate.status, blockingFailing: gate.blocking.filter((k) => !k.pass).map((k) => ({ check: k.label, detail: k.detail, fix: k.fixHint })), advisoryFailing: gate.advisory.filter((k) => !k.pass).map((k) => k.label) } : null,
    team: scoped('team_members').map((t) => ({ name: t.name, role: t.role, department: t.department })),
  };
}

async function send(text) {
  if (!aiAvailable() || S.chatBusy) return;
  S.chat.push({ role: 'user', text });
  S.chatBusy = true;
  render();

  const turns = [{ role: 'user', content: instructions() + '\n\nPROJECT STATE:\n' + JSON.stringify(projectState()).slice(0, 46000) }];
  for (const m of S.chat.slice(-8)) {
    if (m.role === 'user') turns.push({ role: 'user', content: m.text });
    else if (m.role === 'ai') turns.push({ role: 'assistant', content: m.text });
  }
  if (turns[turns.length - 1].role !== 'user') turns.push({ role: 'user', content: text });

  controller = new AbortController();
  const msg = { role: 'ai', text: '' };
  S.chat.push(msg);
  const runId = uid('airun');
  const started = Date.now();

  try {
    const out = await getAdapter().chat(turns, {
      cache: false,
      signal: controller.signal,
      onText: ({ text: whole }) => {
        msg.text = whole;
        render();
      },
    });
    msg.text = out.text;
    const parsed = extractAction(out.text);
    if (parsed.action) {
      msg.text = parsed.text;
      S.chat.push({ role: 'action', action: parsed.action });
    }
    await logChatRun(runId, started, out, null);
  } catch (e) {
    if (e && e.code === 'cancelled') {
      msg.text = (e.text || msg.text || '') + '\n\n[stopped]';
    } else {
      S.chat.pop();
      S.chat.push({ role: 'system', text: chatError(e) });
    }
    await logChatRun(runId, started, null, e);
  } finally {
    S.chatBusy = false;
    controller = null;
    render();
  }
}

function chatError(e) {
  const code = (e && e.code) || '';
  const map = {
    not_granted: 'You have not allowed this page to use Claude. The deterministic parts of the app are unaffected.',
    rate_limited: 'Too many requests, or your usage limit was reached. Try again in a little while.',
    session_expired: 'Your session expired — sign in again.',
    prompt_too_large: 'This project is too large to send in one go. Ask about a single node or a single obligation.',
    refused: 'The assistant declined this request.',
    invalid_json: 'The reply could not be read. Try asking again.',
    sampling_disabled: 'Claude is not available for this account.',
  };
  return map[code] || 'The request failed' + (e && e.message ? ': ' + e.message : '') + '.';
}

async function logChatRun(runId, started, out, err) {
  if (!S.store) return;
  try {
    await S.store.create(
      'ai_runs',
      {
        id: runId,
        projectId: S.projectId,
        task: 'chat',
        taskClass: 'medium',
        provider: getAdapter() ? getAdapter().name : 'unknown',
        modelTierRequested: 'default',
        modelTierApplied: out && out.modelTierApplied ? out.modelTierApplied : null,
        promptVersion: 'chat-p1',
        schemaVersion: 'chat-s1',
        runtimeMs: Date.now() - started,
        outputValid: !err,
        validationErrors: err ? [String((err && err.code) || err)] : null,
        humanReviewRequired: true,
        requestedBy: S.actor.id,
        createdAt: nowIso(),
      },
      { projectId: S.projectId, actorKind: 'ai' }
    );
  } catch (e) {
    /* logging failure must not break the chat */
  }
}

const ALLOWED_ACTIONS = ['add_assumption', 'add_data_gap', 'add_recommendation', 'add_team_member', 'add_scenario_note'];

function extractAction(text) {
  const idx = text.lastIndexOf('ACTION:');
  if (idx === -1) return { text, action: null };
  const before = text.slice(0, idx).trim();
  const raw = text.slice(idx + 7).trim();
  let obj = null;
  try {
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start !== -1 && end > start) obj = JSON.parse(raw.slice(start, end + 1));
  } catch (e) {
    obj = null;
  }
  if (!obj || ALLOWED_ACTIONS.indexOf(obj.kind) === -1 || !obj.summary) return { text: before || text, action: null };
  return { text: before, action: { kind: obj.kind, summary: String(obj.summary).slice(0, 300), payload: obj.payload || {} } };
}

async function applyAction(m) {
  const a = m.action;
  const p = project();
  if (!p) return;
  const pl = a.payload || {};
  try {
    if (a.kind === 'add_assumption') {
      await S.store.create('assumptions', { projectId: p.id, category: String(pl.category || 'Assistant').slice(0, 60), text: String(pl.text || a.summary).slice(0, 900), basis: String(pl.basis || 'Proposed by the assistant and confirmed by ' + (S.actor.name || 'a user')).slice(0, 300), raisedBy: S.actor.id }, { projectId: p.id, actorKind: 'ai', note: 'Confirmed by a user from the assistant panel' });
    } else if (a.kind === 'add_data_gap') {
      await S.store.create('data_gaps', { projectId: p.id, entityKind: String(pl.entityKind || 'project').slice(0, 30), field: String(pl.field || 'unspecified').slice(0, 60), label: String(pl.label || a.summary).slice(0, 160), blocks: Array.isArray(pl.blocks) ? pl.blocks.slice(0, 6).map(String) : [], detail: String(pl.detail || '').slice(0, 400), status: 'OPEN' }, { projectId: p.id, actorKind: 'ai' });
    } else if (a.kind === 'add_recommendation') {
      // A recommendation must attach to a real scenario; the assistant cannot
      // invent one, and a residual rating is never set here.
      const node = nodesSorted().filter((n) => String(n.nodeNumber) === String(pl.nodeNumber))[0];
      const sc = node ? scoped('scenarios').filter((s) => s.nodeId === node.id && String(s.rowNumber) === String(pl.rowNumber))[0] : null;
      if (!sc) {
        toast('That row could not be found, so the recommendation was not added. Add it from the worksheet row instead.', 'err');
        return;
      }
      const n = scoped('recommendations').length + 1;
      await S.store.create('recommendations', { projectId: p.id, scenarioId: sc.id, nodeId: sc.nodeId, recId: 'R-' + String(n).padStart(3, '0'), text: String(pl.text || a.summary).slice(0, 700), technicalBasis: String(pl.technicalBasis || '').slice(0, 500), controlLevel: ['ELIMINATE', 'SUBSTITUTE', 'ENGINEERING', 'ADMINISTRATIVE', 'PPE'].indexOf(pl.controlLevel) !== -1 ? pl.controlLevel : null, priority: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].indexOf(pl.priority) !== -1 ? pl.priority : null, responsibleDepartment: String(pl.responsibleDepartment || '').slice(0, 120), status: 'OPEN', closureEvidenceRequired: true }, { projectId: p.id, actorKind: 'ai', note: 'Confirmed by a user from the assistant panel' });
    } else if (a.kind === 'add_team_member') {
      await S.store.create('team_members', { projectId: p.id, name: String(pl.name || '').slice(0, 120), designation: String(pl.designation || '').slice(0, 120), department: String(pl.department || '').slice(0, 120), organization: String(pl.organization || '').slice(0, 120), role: String(pl.role || 'other').slice(0, 40), serialNumber: scoped('team_members').length + 1, sortOrder: scoped('team_members').length, status: 'USER_CONFIRMED' }, { projectId: p.id, actorKind: 'ai' });
    } else if (a.kind === 'add_scenario_note') {
      const node = nodesSorted().filter((n) => String(n.nodeNumber) === String(pl.nodeNumber))[0];
      const sc = node ? scoped('scenarios').filter((s) => s.nodeId === node.id && String(s.rowNumber) === String(pl.rowNumber))[0] : null;
      if (!sc) {
        toast('That row could not be found.', 'err');
        return;
      }
      await S.store.update('scenarios', sc.id, { notes: String(pl.note || a.summary).slice(0, 600) }, { projectId: p.id, field: 'notes', actorKind: 'ai' });
    }
    m.applied = true;
    toast('Applied', 'ok');
    render();
  } catch (e) {
    toast('Could not apply: ' + ((e && e.message) || 'unknown error'), 'err');
  }
}

export { send as sendChat };
