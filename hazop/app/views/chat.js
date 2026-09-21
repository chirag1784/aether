// app/views/chat.js — the assistant panel.
//
// The assistant has authority over the application. It reads every collection
// and every engine result through the tools in `ai-tools.js`, and it writes
// records the same way a human does. Two things shape how that feels:
//
//  * Autonomy is the user's setting. "Ask first" turns every write into a card
//    they confirm; "Act and report" applies it and shows an Undo. The
//    assistant cannot change the setting.
//  * It reasons before it writes. The HAZOP passes below run on the strong
//    tier with a stated method, because "find the deviations this study
//    missed" is not a lookup.
//
// The tools do the calculating. The assistant is never asked to multiply a
// likelihood by a severity — `get_risk` answers that, and the panel says so.

import { h, clear, toast, truncate, nowIso, uid, dtFmt, sectionRule, select } from '../util.js';
import { S, render, project, scoped, go } from '../state.js';
import { aiAvailable, getAdapter } from '../ai.js';
import { instrumentedTools, pending, applyWrite, clearPending, undoAction, AUTONOMY, HUMAN_ONLY } from '../ai-tools.js';
import { REASONING_PASSES, runPass } from '../reason.js';

const SUGGESTIONS = [
  'What has this study missed?',
  'Which rows are high risk with nothing done about them?',
  'What should we actually do first?',
  'Challenge the safeguards on node 01.',
  'What is blocking the report?',
  'Which laws may apply, and what is still unresolved?',
  'Find the common causes across the worksheet.',
  'What data is missing and where do I get it?',
];

let controller = null;

export function renderChat() {
  const panel = h('div', { style: { display: 'contents' } });
  const head = h(
    'div',
    { class: 'chat-head' },
    h('h2', { text: 'Assistant' }),
    autonomyChip(),
    S.chatBusy
      ? h('button', { class: 'btn sm ghost', text: 'Stop', onclick: () => { if (controller) controller.abort(); } })
      : null,
    S.chat.length ? h('button', { class: 'btn sm ghost', text: 'Clear', onclick: () => { S.chat = []; render(); } }) : null,
    h('button', { class: 'btn ghost icon', 'aria-label': 'Close the assistant', text: '✕', onclick: () => { S.chatOpen = false; render(); } })
  );

  const log = h('div', { class: 'chat-log', id: 'chat-log' });

  if (!aiAvailable()) {
    log.appendChild(
      h(
        'div',
        { class: 'note plain small' },
        h('strong', { text: 'The assistant is not available in this view. ' }),
        'Every deterministic part of the app still works — the engines, the registers, the exports. When it is available it runs on your own Claude account and has authority over the project: it reads everything and it writes records, with your chosen level of confirmation.'
      )
    );
  } else if (!S.chat.length) {
    log.appendChild(
      h(
        'div',
        { class: 'msg system' },
        h('div', {
          class: 'msg-body',
          text:
            'Ask about this project, or tell me to change it. I read the worksheet, the chemicals, the compliance register and every engine result through the app\'s own tools, and I write records the same way you do — audited, attributed and reversible. I do not calculate: risk scores, unit conversions and threshold comparisons come back from the engines and I quote them.',
        })
      )
    );
    log.appendChild(h('div', { class: 'chat-suggest' }, SUGGESTIONS.map((s) => h('button', { text: s, onclick: () => send(s) }))));
    log.appendChild(passStrip());
    log.appendChild(boundaryNote());
  }

  for (const m of S.chat) {
    if (m.role === 'tool') {
      log.appendChild(toolTrace(m));
      continue;
    }
    if (m.role === 'pass') {
      log.appendChild(passCard(m));
      continue;
    }
    log.appendChild(
      h(
        'div',
        { class: 'msg ' + m.role },
        h('div', { class: 'msg-role', text: m.role === 'user' ? 'You' : m.role === 'ai' ? 'Assistant' : 'Note' }),
        h('div', { class: 'msg-body', text: m.text })
      )
    );
  }

  for (const q of pending) log.appendChild(pendingCard(q));

  if (S.chatBusy) {
    log.appendChild(
      h(
        'div',
        { class: 'msg ai' },
        h('div', { class: 'msg-role', text: 'Assistant' }),
        h('div', { class: 'msg-body' }, h('span', { class: 'spin' }), h('span', { text: ' ' + (S.chatStage || 'Thinking…') }))
      )
    );
  }

  const ledgerRows = scoped('chat_actions').slice().sort((a, b) => String(b.at || '').localeCompare(String(a.at || '')));
  if (ledgerRows.length && S.chat.length) log.appendChild(ledgerPanel(ledgerRows));

  const box = h('textarea', {
    id: 'chat-input',
    placeholder: aiAvailable() ? 'Ask, or tell me to change something…' : 'Unavailable in this view',
    rows: 2,
    disabled: !aiAvailable(),
  });
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
    h(
      'div',
      { class: 'between', style: { 'margin-top': '6px' } },
      h('span', { class: 'muted small', text: 'Cmd/Ctrl + Enter to send' }),
      h('button', {
        class: 'btn sm primary',
        text: 'Send',
        disabled: !aiAvailable() || S.chatBusy,
        onclick: () => {
          const v = box.value.trim();
          if (!v) return;
          box.value = '';
          send(v);
        },
      })
    )
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

// ---------------------------------------------------------------------------
// Authority, on screen
// ---------------------------------------------------------------------------

function autonomyChip() {
  const cur = AUTONOMY.find((a) => a.key === (S.chatAutonomy || 'ASK')) || AUTONOMY[0];
  const sel = select(AUTONOMY.map((a) => ({ value: a.key, label: a.label })), cur.key, { id: 'chat-autonomy', title: cur.note });
  sel.addEventListener('change', () => {
    S.chatAutonomy = sel.value;
    toast((AUTONOMY.find((a) => a.key === sel.value) || {}).note || '', 'ok');
    render();
  });
  return h('div', { class: 'chat-autonomy', title: cur.note }, sel);
}

function boundaryNote() {
  return h(
    'details',
    { class: 'chat-boundary' },
    h('summary', { text: 'What the assistant may and may not do' }),
    h('p', {
      class: 'small',
      text:
        'It may create, change and delete records in every collection the app tracks, set effort fields, rate residual risk through the same validator your edits pass, raise data gaps and recommendations, and move you around the app. Every change is audited and carries an Undo.',
    }),
    h('p', { class: 'small', text: 'Five acts it will refuse, because each one is a signature rather than a capability:' }),
    h('ul', { class: 'small', style: { margin: '0 0 0 16px' } }, HUMAN_ONLY.map((x) => h('li', { text: x.act + ' — ' + x.who + '.' }))),
    h('p', {
      class: 'small',
      text:
        'It also calculates nothing. Ask it for a risk band and it asks the engine; ask it for a threshold comparison and it quotes the arithmetic the app has already shown.',
    })
  );
}

// ---------------------------------------------------------------------------
// Reasoning passes
// ---------------------------------------------------------------------------

function passStrip() {
  const wrap = h('div', { class: 'chat-passes' });
  wrap.appendChild(h('div', { class: 'chat-passes-label', text: 'Reasoning passes' }));
  for (const p of REASONING_PASSES) {
    wrap.appendChild(
      h('button', {
        class: 'chat-pass',
        title: p.method,
        text: p.label,
        onclick: () => startPass(p.key),
      })
    );
  }
  wrap.appendChild(
    h('p', {
      class: 'muted small',
      text: 'Each pass states its method, runs on the strong tier, and returns findings you accept one at a time. A pass never writes on its own.',
    })
  );
  return wrap;
}

function passCard(m) {
  const p = REASONING_PASSES.find((x) => x.key === m.pass) || { label: m.pass, method: '' };
  const card = h('div', { class: 'card pass-card' });
  card.appendChild(
    h(
      'div',
      { class: 'between' },
      h('div', {}, h('div', { class: 'eyebrow', text: 'Reasoning pass' }), h('h3', { class: 'card-title', text: p.label })),
      m.error ? h('span', { class: 'badge missing', text: 'FAILED' }) : h('span', { class: 'badge inferred', text: 'FOR REVIEW' })
    )
  );
  card.appendChild(h('p', { class: 'card-note', text: p.method }));

  if (m.error) {
    card.appendChild(h('div', { class: 'note crit small', text: m.error }));
    return card;
  }
  if (!m.result) {
    card.appendChild(h('p', { class: 'muted small' }, h('span', { class: 'spin' }), ' Working…'));
    return card;
  }

  if (m.result.method) card.appendChild(h('p', { class: 'small' }, h('strong', { text: 'How it was done: ' }), m.result.method));
  if (m.result.summary) card.appendChild(h('p', { style: { 'font-size': '12.5px' }, text: m.result.summary }));

  const findings = m.result.findings || [];
  if (findings.length === 0) {
    card.appendChild(h('p', { class: 'muted small', text: 'Nothing found. That is a result, not a failure — say so in the report if it holds up.' }));
    return card;
  }

  for (const f of findings) {
    const row = h('div', { class: 'pass-finding' });
    row.appendChild(
      h(
        'div',
        { class: 'row', style: { gap: '5px', 'flex-wrap': 'wrap', 'margin-bottom': '3px' } },
        f.confidence ? h('span', { class: 'tag', text: String(f.confidence).toLowerCase() + ' confidence' }) : null,
        f.where ? h('span', { class: 'mono small muted', text: f.where }) : null
      )
    );
    row.appendChild(h('div', { style: { 'font-size': '12.5px', 'font-weight': '500' }, text: f.title || '' }));
    if (f.reasoning) row.appendChild(h('div', { class: 'small muted', text: f.reasoning }));
    if (f.basedOn) row.appendChild(h('div', { class: 'small' }, h('strong', { text: 'From the project: ' }), f.basedOn));
    if (f.action) {
      row.appendChild(
        h(
          'div',
          { class: 'btn-row', style: { 'margin-top': '5px' } },
          f.accepted
            ? h('span', { class: 'badge verified', text: 'ACCEPTED' })
            : f.dismissed
              ? h('span', { class: 'badge na', text: 'DISMISSED' })
              : h(
                  'div',
                  { class: 'row', style: { gap: '5px' } },
                  h('button', {
                    class: 'btn sm primary',
                    text: acceptLabel(f.action),
                    onclick: async () => {
                      const res = await applyWrite(f.action);
                      toast(res.slice(0, 160), res.indexOf('Done') === 0 ? 'ok' : 'err');
                      if (res.indexOf('Done') === 0) f.accepted = true;
                      render();
                    },
                  }),
                  h('button', { class: 'btn sm ghost', text: 'Not this one', onclick: () => { f.dismissed = true; render(); } })
                )
        )
      );
    }
    card.appendChild(row);
  }

  card.appendChild(
    h('p', { class: 'muted small', style: { 'margin-top': '8px' }, text: 'These are proposals from a model. Each one needs an engineer\'s judgement before it enters the study.' })
  );
  return card;
}

function acceptLabel(action) {
  if (!action) return 'Accept';
  if (action.op === 'create') return 'Add it';
  if (action.op === 'update') return 'Apply it';
  if (action.op === 'remove') return 'Remove it';
  return 'Accept';
}

async function startPass(key) {
  if (!aiAvailable() || S.chatBusy) return;
  const p = REASONING_PASSES.find((x) => x.key === key);
  if (!p) return;
  const msg = { role: 'pass', pass: key, result: null, error: null };
  S.chat.push(msg);
  S.chatBusy = true;
  S.chatStage = p.label + '…';
  render();
  controller = new AbortController();
  try {
    msg.result = await runPass(key, { signal: controller.signal });
  } catch (e) {
    msg.error = errorCopy(e);
  } finally {
    S.chatBusy = false;
    S.chatStage = '';
    controller = null;
    render();
  }
}

// ---------------------------------------------------------------------------
// Pending confirmations and the ledger
// ---------------------------------------------------------------------------

function pendingCard(q) {
  return h(
    'div',
    { class: 'card pending-card' },
    h(
      'div',
      { class: 'row', style: { gap: '6px', 'margin-bottom': '5px', 'flex-wrap': 'wrap' } },
      h('span', { class: 'badge inferred', text: 'WAITING FOR YOU' }),
      h('span', { class: 'tag', text: q.op + ' ' + q.collection })
    ),
    h('div', { style: { 'font-size': '12.5px' }, text: q.summary }),
    q.patch ? h('div', { class: 'mono small muted', text: truncate(JSON.stringify(q.patch), 240) }) : null,
    q.dropped && q.dropped.length
      ? h('div', { class: 'small muted', text: 'Ignored fields: ' + q.dropped.join(', ') + '.' })
      : null,
    h(
      'div',
      { class: 'btn-row', style: { 'margin-top': '7px' } },
      h('button', {
        class: 'btn sm primary',
        text: 'Apply',
        onclick: async () => {
          const res = await applyWrite(q);
          clearPending(q.id);
          S.chat.push({ role: 'system', text: res });
          toast(res.slice(0, 160), res.indexOf('Done') === 0 ? 'ok' : 'err');
          render();
        },
      }),
      h('button', {
        class: 'btn sm ghost',
        text: 'Decline',
        onclick: () => {
          clearPending(q.id);
          S.chat.push({ role: 'system', text: 'You declined: ' + q.summary });
          render();
        },
      })
    )
  );
}

function ledgerPanel(rows) {
  const live = rows.filter((r) => !r.undone);
  const box = h('details', { class: 'chat-ledger' });
  box.appendChild(
    h('summary', { text: 'Changes the assistant made (' + live.length + ' live, ' + (rows.length - live.length) + ' undone)' })
  );
  for (const r of rows.slice(0, 20)) {
    box.appendChild(
      h(
        'div',
        { class: 'ledger-row' },
        h(
          'div',
          { class: 'between' },
          h('span', { class: 'mono small', text: r.op + ' ' + r.collection }),
          h('span', { class: 'muted small', text: r.at ? dtFmt(r.at) : '' })
        ),
        h('div', { class: 'small', text: r.summary || '' }),
        r.undone
          ? h('span', { class: 'badge na', text: 'UNDONE' })
          : h('button', { class: 'btn sm ghost', text: 'Undo', onclick: () => undoAction(r) })
      )
    );
  }
  return box;
}

function toolTrace(m) {
  const calls = m.calls || [];
  const box = h('details', { class: 'chat-tools' });
  box.appendChild(h('summary', { text: calls.length + ' tool call' + (calls.length === 1 ? '' : 's') }));
  for (const c of calls) {
    box.appendChild(
      h(
        'div',
        { class: 'tool-row' },
        h('span', { class: 'mono small', text: c.tool }),
        h('span', { class: 'tag', text: c.kind }),
        h('span', { class: 'muted small', text: c.ms + ' ms' }),
        c.ok ? null : h('span', { class: 'badge missing', text: 'FAILED' })
      )
    );
  }
  return box;
}

// ---------------------------------------------------------------------------
// The turn
// ---------------------------------------------------------------------------

function instructions() {
  const mode = S.chatAutonomy === 'ACT' ? 'ACT' : 'ASK';
  return [
    'You are the assistant inside HAZOP MASTER AI, a process-safety and compliance platform. You are talking to a process-safety engineer or a HAZOP facilitator. Write as one engineer to another: specific, plain, no padding.',
    '',
    'HOW YOU WORK',
    '1. Call a tool before you answer anything about this project. You have no project knowledge except what the tools return. Start with get_worksheet, get_chemicals, get_legal, get_coverage, get_doability or get_gate depending on the question, and read get_reference before you propose a value for a coded field.',
    '2. You do not calculate. Never multiply a likelihood by a severity, convert a unit, compare a quantity against a threshold or work out a renewal date. get_risk answers the first; the other three are already computed and the read tools return them. Say the figure is the application\'s.',
    '3. Never state a process condition, capacity, design pressure, interlock, chemical property, SDS value or statutory threshold that a tool did not return. If it is not there, say what is missing and offer to raise it as a data gap.',
    '4. Never say the facility is compliant, or that an obligation definitely applies. Those are the application\'s statuses and a reviewer\'s decision. For a legal answer, mark each part as a source fact, the application\'s analysis, or an open question.',
    '',
    'YOUR AUTHORITY',
    mode === 'ACT'
      ? '5. The user has set "Act and report". Make the change with create_record, update_record, delete_record or set_effort, then tell them what you did in one line. Every change carries an Undo, so a wrong change is cheap — but a change they did not ask for is not. Stay inside what they asked.'
      : '5. The user has set "Ask first". A write tool queues the change and tells you so. When that happens, say it is waiting for their confirmation. Never describe a queued change as done.',
    '6. A write tool\'s result is the only truth about what happened. If it starts "Refused" or "Failed", say so plainly and say what would fix it. Never claim a change the tool did not confirm.',
    '7. Five acts you cannot perform, because they are signatures on an engineering document: marking a field VERIFIED, marking compliance evidence verified, closing a recommendation, approving a report, and entering a statutory threshold as verified. Call request_human_attestation to get the exact words to ask with.',
    '',
    'THINKING WELL ABOUT HAZOP',
    '8. Before you propose a deviation, cause or safeguard, check get_coverage: the guideword engine already knows what the node should have examined, and repeating a row that exists wastes the team\'s time.',
    '9. Challenge a safeguard by asking what it depends on. An alarm needs somebody present, trained and able to act in time; an interlock needs a tested trip; a relief device needs the right sizing case. Say which of those the project has recorded and which it has not.',
    '10. A recommendation is worth having only if it is specific enough to close. Name the equipment tag, the setting, the frequency or the document. "Review the procedure" cannot be closed by anyone.',
    '11. Prefer a control high in the hierarchy over one that depends on a person acting correctly. Say when you are proposing an administrative control because nothing better is available.',
    '',
    'FORMAT',
    'Short paragraphs of plain text. No markdown headings, no bullet characters at the start of lines. Use the plant\'s own terms — node numbers, equipment tags, guidewords, R-numbers.',
  ].join('\n');
}

async function send(text) {
  if (!aiAvailable() || S.chatBusy) return;
  S.chat.push({ role: 'user', text });
  S.chatBusy = true;
  S.chatStage = 'Reading the project…';
  render();

  const calls = [];
  const trace = { role: 'tool', calls };
  const tools = instrumentedTools({
    mode: 'full',
    log: (c) => {
      calls.push(c);
      S.chatStage = c.tool.replace(/_/g, ' ') + '…';
      render();
    },
  });

  const turns = [{ role: 'user', content: instructions() }];
  for (const m of S.chat.slice(-10)) {
    if (m.role === 'user') turns.push({ role: 'user', content: m.text });
    else if (m.role === 'ai' && m.text) turns.push({ role: 'assistant', content: m.text });
  }
  if (turns[turns.length - 1].role !== 'user') turns.push({ role: 'user', content: text });

  controller = new AbortController();
  const msg = { role: 'ai', text: '' };
  S.chat.push(trace);
  S.chat.push(msg);
  const runId = uid('airun');
  const started = Date.now();

  try {
    const out = await getAdapter().chat(turns, {
      signal: controller.signal,
      tools,
      onText: ({ text: whole }) => {
        msg.text = whole;
        S.chatStage = '';
        render();
      },
    });
    msg.text = out.text || msg.text;
    if (!msg.text) msg.text = calls.length ? 'I read the project but produced no answer. Ask again, more narrowly.' : 'No answer came back. Try again.';
    await logChatRun(runId, started, out, null, calls);
  } catch (e) {
    if (e && e.code === 'cancelled') {
      msg.text = (e.text || msg.text || '') + '\n\n[stopped]';
    } else if (e && e.code === 'tools_unavailable') {
      S.chat.pop();
      S.chat.push({
        role: 'system',
        text:
          'This view does not allow the assistant to call the application\'s tools, so it cannot read the project or change anything. The deterministic parts of the app are unaffected. Ask your question on a view where tool calling is available.',
      });
    } else {
      S.chat.pop();
      S.chat.push({ role: 'system', text: errorCopy(e) });
    }
    await logChatRun(runId, started, null, e, calls);
  } finally {
    S.chatBusy = false;
    S.chatStage = '';
    controller = null;
    render();
  }
}

export function errorCopy(e) {
  const code = (e && e.code) || '';
  const map = {
    not_granted: 'You have not allowed this page to use Claude. The deterministic parts of the app are unaffected.',
    rate_limited: 'Too many requests, or your usage limit was reached. Try again in a little while.',
    session_expired: 'Your session expired — sign in again.',
    prompt_too_large:
      'Too much went into that request. Ask about one node, one chemical or one obligation rather than the whole project.',
    refused: 'The assistant declined this request.',
    invalid_json: 'The reply could not be read as the shape this pass needs. Try again.',
    sampling_disabled: 'Claude is not available for this account.',
    tools_unavailable: 'This view does not allow tool calling, so the assistant cannot read or change the project here.',
    cancelled: 'Stopped.',
  };
  return map[code] || 'The request failed' + (e && e.message ? ': ' + e.message : '') + '.';
}

async function logChatRun(runId, started, out, err, calls) {
  if (!S.store) return;
  const writes = (calls || []).filter((c) => c.kind === 'write');
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
        promptVersion: 'chat-p2',
        schemaVersion: 'chat-s2',
        runtimeMs: Date.now() - started,
        toolCalls: (calls || []).length,
        toolNames: (calls || []).map((c) => c.tool),
        writeCalls: writes.length,
        autonomy: S.chatAutonomy || 'ASK',
        outputValid: !err,
        validationErrors: err ? [String((err && err.code) || err)] : null,
        // Always true: nothing the assistant produces is a conclusion.
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

export { send as sendChat };
