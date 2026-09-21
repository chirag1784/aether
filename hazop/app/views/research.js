// app/views/research.js — filling the gaps from outside the app.
//
// The view is built around one honest sentence: this page cannot reach the
// internet by itself. So it does the part it can do well — work out exactly
// what is missing, rank it by what it blocks, name the authority that
// publishes it, build the query, and then take a value back with its
// provenance intact by whichever of the four routes is open.

import {
  h,
  field,
  input,
  select,
  textarea,
  toast,
  drawer,
  closeDrawer,
  emptyState,
  sectionRule,
  statusBadge,
  tile,
  tableWrap,
  truncate,
  meter,
  dtFmt,
  nowIso,
  debounce,
} from '../util.js';
import { S, render, project, scoped, go } from '../state.js';
import {
  openGaps,
  planFor,
  routeAvailability,
  listConnectors,
  searchViaConnector,
  mcpErrorCopy,
  extractFromText,
  recallValue,
  preview,
  apply,
  recordOutcome,
  summary,
  ROUTES,
} from '../research.js';
import { EVIDENCE_CLASSES, evidenceClass, COMPANY_FIELDS, COMPANY_FIELD_LABELS } from '../../packages/research/sources.js';
import { aiAvailable } from '../ai.js';

const TABS = [
  { key: 'gaps', label: 'What is missing' },
  { key: 'company', label: 'Company profile' },
  { key: 'findings', label: 'Findings register' },
  { key: 'routes', label: 'How research works here' },
];

export function renderResearch() {
  const p = project();
  if (!p) return h('div', { class: 'page' }, emptyState('No project selected', 'Pick a project first.', null));

  const tab = S.researchTab || 'gaps';
  const page = h('div', { class: 'page' });

  page.appendChild(
    h(
      'div',
      { class: 'page-head' },
      h('div', {}, h('div', { class: 'eyebrow', text: 'Research' }), h('h1', { class: 'page-title', text: 'Missing data' })),
      h('div', { class: 'page-actions' }, h('button', { class: 'btn', text: 'How this works', onclick: () => setTab('routes') }))
    )
  );
  page.appendChild(
    h('p', {
      class: 'page-sub',
      text:
        'A missing chemical property or company fact is a gap with a named owner, not an absence of hazard. This page ranks the gaps by what each one blocks, names the authority that publishes it, and records whatever comes back with its source, its class of evidence and the date it was retrieved.',
    })
  );

  page.appendChild(
    h(
      'div',
      { class: 'tabs' },
      TABS.map((t) =>
        h('button', { class: 'tab' + (tab === t.key ? ' on' : ''), text: t.label, onclick: () => setTab(t.key) })
      )
    )
  );

  if (tab === 'gaps') page.appendChild(researchGapsTab());
  else if (tab === 'company') page.appendChild(companyTab());
  else if (tab === 'findings') page.appendChild(findingsTab());
  else page.appendChild(routesTab());

  return page;
}

function setTab(k) {
  S.researchTab = k;
  render();
}

// ---------------------------------------------------------------------------
// What is missing
// ---------------------------------------------------------------------------

function researchGapsTab() {
  const wrap = h('div', {});
  const gaps = openGaps();
  const sum = summary();

  const blocking = gaps.filter((g) => g.reasons.indexOf('BLOCKS_ALERT') >= 0);
  const gating = gaps.filter((g) => g.reasons.indexOf('GATES_LEGAL') >= 0);
  const critical = gaps.filter((g) => g.reasons.indexOf('CRITICAL_PROPERTY') >= 0);

  wrap.appendChild(
    h(
      'div',
      { class: 'grid c4' },
      tile('Open gaps', String(gaps.length), gaps.length ? 'Ranked by what each one blocks' : 'Nothing outstanding'),
      tile('Blocking a hazard check', String(blocking.length), 'An alert rule cannot run without these'),
      tile('Gating a legal question', String(gating.length), 'An obligation stays unresolved without these'),
      tile('Values sourced so far', String(sum.webSourced), sum.inferred ? sum.inferred + ' more are inferred only' : 'With citations')
    )
  );

  if (sum.caution) {
    wrap.appendChild(h('p', { class: 'note plain small' }, h('strong', { text: 'Sourced is not verified. ' }), sum.caution));
  }

  if (gaps.length === 0) {
    wrap.appendChild(
      emptyState(
        'Every property and profile field the app tracks is recorded',
        'That does not mean every value is right. Check the findings register for anything recorded as inferred, and read the cited document before a figure is used as a design basis.',
        h('button', { class: 'btn', text: 'Open the findings register', onclick: () => setTab('findings') })
      )
    );
    return wrap;
  }

  const avail = routeAvailability();
  const openRoutes = ROUTES.filter((r) => avail[r.key].available);
  wrap.appendChild(
    h(
      'div',
      { class: 'note plain small', style: { 'margin-top': '12px' } },
      h('strong', { text: 'Routes open in this view: ' }),
      openRoutes.map((r) => r.label).join(', ') || 'none',
      '. ',
      h('button', { class: 'linkish', text: 'What each route means', onclick: () => setTab('routes') })
    )
  );

  wrap.appendChild(sectionRule('Ranked by what it blocks'));
  const rows = gaps.slice(0, 60).map((g) =>
    h(
      'tr',
      {},
      h('td', {}, h('div', { style: { 'font-weight': '500' }, text: g.label }), g.cas ? h('div', { class: 'mono small muted', text: 'CAS ' + g.cas }) : null),
      h('td', {}, g.reasons.map((r) => h('span', { class: 'tag', title: reasonNote(r), text: reasonLabel(r) }))),
      h('td', { class: 'mono small', text: String(g.priority) }),
      h(
        'td',
        {},
        h('button', { class: 'btn sm primary', text: 'Research', onclick: () => gapDrawer(g) })
      )
    )
  );
  wrap.appendChild(
    tableWrap(
      [
        { label: 'Missing value', width: '44%' },
        { label: 'Because', width: '30%' },
        { label: 'Rank', width: '8%' },
        { label: '', width: '18%' },
      ],
      rows,
      { tableClass: 'wide-register' }
    )
  );
  if (gaps.length > 60) {
    wrap.appendChild(h('p', { class: 'muted small', text: 'Showing the 60 highest-ranked of ' + gaps.length + '.' }));
  }
  return wrap;
}

function reasonLabel(r) {
  return { BLOCKS_ALERT: 'blocks a hazard check', GATES_LEGAL: 'gates a legal question', CRITICAL_PROPERTY: 'critical property', REPORT_FIELD: 'report field', NICE_TO_HAVE: 'optional' }[r] || r;
}

function reasonNote(r) {
  return {
    BLOCKS_ALERT: 'A chemical alert rule needs this value on both sides of the comparison before it can fire.',
    GATES_LEGAL: 'An applicability question cannot be answered without it, so obligations stay unresolved.',
    CRITICAL_PROPERTY: 'The app treats this as a property no process-safety study should be without.',
    REPORT_FIELD: 'It fills a table in the report but blocks no engine.',
  }[r] || '';
}

// ---------------------------------------------------------------------------
// The research drawer: one gap, four routes
// ---------------------------------------------------------------------------

function gapDrawer(gap) {
  const plan = planFor(gap);
  const avail = routeAvailability();
  const body = h('div', {});

  if (!plan.ok) {
    body.appendChild(h('div', { class: 'note crit' }, h('strong', { text: 'Cannot be looked up yet. ' }), plan.message));
    drawer('Research: ' + gap.label, body, [h('button', { class: 'btn', text: 'Close', onclick: closeDrawer })]);
    return;
  }

  body.appendChild(
    h(
      'div',
      { class: 'card' },
      h('h3', { class: 'card-title', text: 'The query' }),
      h('div', { class: 'row', style: { gap: '6px', 'align-items': 'center', 'flex-wrap': 'wrap' } },
        h('code', { class: 'mono', style: { padding: '4px 7px', background: 'var(--surface-2)', 'border-radius': '4px' }, text: plan.query }),
        h('button', { class: 'btn sm ghost', text: 'Copy', onclick: () => copy(plan.query) })
      ),
      plan.alternateQueries && plan.alternateQueries.length
        ? h('p', { class: 'card-note', text: 'If that returns nothing: ' + plan.alternateQueries.join(' · ') })
        : null,
      gap.gates ? h('p', { class: 'card-note' }, h('strong', { text: 'Why it matters: ' }), gap.gates) : null,
      plan.gradeWarning ? h('div', { class: 'note warn small', text: plan.gradeWarning }) : null,
      plan.caution ? h('div', { class: 'note warn small', text: plan.caution }) : null
    )
  );

  body.appendChild(sectionRule('Where to look, best source first'));
  const authList = h('div', { class: 'stack' });
  for (const r of plan.routes) {
    const cls = evidenceClass(r.evidenceClass) || {};
    authList.appendChild(
      h(
        'div',
        { class: 'card compact' },
        h(
          'div',
          { class: 'between' },
          h('div', {}, h('div', { style: { 'font-weight': '500' }, text: r.name }), h('div', { class: 'small muted', text: cls.label || r.evidenceClass })),
          r.url ? h('a', { class: 'btn sm', href: r.url, target: '_blank', rel: 'noopener noreferrer', text: 'Open' }) : h('span', { class: 'badge na', text: 'ASK THE SUPPLIER' })
        ),
        h('p', { class: 'card-note', text: r.note })
      )
    );
  }
  body.appendChild(authList);

  body.appendChild(sectionRule('Bring the value back'));
  const routeSel = select(
    ROUTES.map((r) => ({ value: r.key, label: r.label + (avail[r.key].available ? '' : ' — not available here') })),
    avail.CONNECTOR.available ? 'CONNECTOR' : 'PASTE',
    { id: 'rs-route' }
  );
  const routeNote = h('p', { class: 'field-hint', text: '' });
  const panel = h('div', {});
  const paint = () => {
    const key = routeSel.value;
    const r = ROUTES.find((x) => x.key === key);
    routeNote.textContent = avail[key].available ? r.note : avail[key].why;
    while (panel.firstChild) panel.removeChild(panel.firstChild);
    if (!avail[key].available) return;
    if (key === 'CONNECTOR') panel.appendChild(connectorPanel(gap, plan));
    else if (key === 'PASTE') panel.appendChild(pastePanel(gap, plan));
    else if (key === 'RECALL') panel.appendChild(recallPanel(gap, plan));
    else panel.appendChild(h('p', { class: 'muted small', text: avail[key].why || 'Not available in this deployment.' }));
  };
  routeSel.addEventListener('change', paint);
  body.appendChild(field('Route', routeSel));
  body.appendChild(routeNote);
  body.appendChild(panel);
  paint();

  drawer('Research: ' + gap.label, body, [h('button', { class: 'btn', text: 'Close', onclick: closeDrawer })]);
}

function copy(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(
      () => toast('Copied.', 'ok'),
      () => toast('Could not copy — select the text and copy it by hand.', 'err')
    );
  } else {
    toast('Copying is not available in this view — select the text instead.', 'err');
  }
}

/** The connector route: run the search, then extract from what came back. */
function connectorPanel(gap, plan) {
  const box = h('div', {});
  const out = h('div', { style: { 'margin-top': '8px' } });
  const q = input({ value: plan.query, id: 'rs-q' });
  let controller = null;

  const run = async () => {
    while (out.firstChild) out.removeChild(out.firstChild);
    out.appendChild(h('p', { class: 'muted small' }, h('span', { class: 'spin' }), ' Asking ' + (S.researchConnector || 'your connector') + '…'));
    controller = new AbortController();
    try {
      const res = await searchViaConnector(q.value.trim(), { signal: controller.signal });
      while (out.firstChild) out.removeChild(out.firstChild);
      if (!res.text) {
        out.appendChild(h('div', { class: 'note warn small', text: 'The connector answered with nothing this page can read. Use the paste route with the link above.' }));
        return;
      }
      out.appendChild(
        h(
          'div',
          { class: 'note plain small' },
          h('strong', { text: res.server + ' · ' + res.tool + ' ' }),
          res.cachedAt ? 'answered (cached ' + dtFmt(new Date(res.cachedAt).toISOString()) + ')' : 'answered'
        )
      );
      out.appendChild(extractionPanel(gap, plan, { text: res.text, url: null, route: 'CONNECTOR', query: q.value.trim() }));
    } catch (e) {
      while (out.firstChild) out.removeChild(out.firstChild);
      out.appendChild(h('div', { class: 'note crit small', text: mcpErrorCopy(e) }));
      const retryable = e && (e.code === 'server_unavailable' || e.code === 'rate_limited' || e.code === 'upstream_error');
      if (retryable) {
        out.appendChild(h('div', { class: 'btn-row' }, h('button', { class: 'btn sm', text: 'Try once more', onclick: run })));
      }
      out.appendChild(
        h('div', { class: 'btn-row' }, h('button', { class: 'btn sm ghost', text: 'Switch to the paste route', onclick: () => { const sel = document.getElementById('rs-route'); if (sel) { sel.value = 'PASTE'; sel.dispatchEvent(new Event('change')); } } }))
      );
    }
  };

  box.appendChild(field('Search', q, 'Edit it if the authority wants a different phrase.'));
  box.appendChild(h('div', { class: 'btn-row' }, h('button', { class: 'btn primary', text: 'Search', onclick: run })));
  box.appendChild(out);
  return box;
}

/** The paste route: always available, and the one an auditor likes best. */
function pastePanel(gap, plan) {
  const box = h('div', {});
  const url = input({ placeholder: 'https://…  the page or PDF you read it in', id: 'rs-url' });
  const text = textarea({ rows: 7, placeholder: 'Paste the passage that contains the value. A few lines around it is ideal.', id: 'rs-text' });
  const out = h('div', {});
  box.appendChild(field('Where it came from', url, 'The citation. A search-results page is not a source; paste the document\'s own URL.'));
  box.appendChild(field('The passage', text));
  box.appendChild(
    h(
      'div',
      { class: 'btn-row' },
      h('button', {
        class: 'btn primary',
        text: aiAvailable() ? 'Pull the value out' : 'Record it by hand',
        onclick: () => {
          while (out.firstChild) out.removeChild(out.firstChild);
          if (!text.value.trim()) {
            out.appendChild(h('div', { class: 'note warn small', text: 'Paste the passage first.' }));
            return;
          }
          out.appendChild(extractionPanel(gap, plan, { text: text.value, url: url.value.trim() || null, route: 'PASTE', query: plan.query }));
        },
      })
    )
  );
  box.appendChild(out);
  return box;
}

/**
 * Extraction and confirmation. Whether the text came from a connector or a
 * paste, the same two steps follow: the assistant names the value it read (or
 * the user types it), then the app shows exactly what would be written.
 */
function extractionPanel(gap, plan, ctx) {
  const box = h('div', { class: 'card', style: { 'margin-top': '10px' } });
  const valueIn = input({ placeholder: 'e.g. 205 °C, or 67–72 °C at 1 atm', id: 'rs-val' });
  const classSel = select(
    EVIDENCE_CLASSES.filter((c) => c.key !== 'MODEL_RECALL').map((c) => ({ value: c.key, label: c.label })),
    'AUTHORITATIVE_DATABASE',
    { id: 'rs-class' }
  );
  const urlIn = input({ value: ctx.url || '', placeholder: 'https://…', id: 'rs-url2' });
  const quoteBox = h('p', { class: 'small muted', text: '' });
  const verdict = h('div', { style: { 'margin-top': '9px' } });

  const show = () => {
    while (verdict.firstChild) verdict.removeChild(verdict.firstChild);
    const finding = {
      rawValue: valueIn.value,
      evidenceClass: classSel.value,
      url: urlIn.value.trim() || null,
      retrievedAt: nowIso(),
    };
    const a = preview({ gap, finding });
    if (!a.ok) {
      verdict.appendChild(h('div', { class: 'note crit small' }, h('strong', { text: 'Not recordable. ' }), a.message));
      return;
    }
    const cls = evidenceClass(a.evidenceClass) || {};
    verdict.appendChild(
      h(
        'div',
        { class: 'note ' + (a.status === 'WEB_SOURCED' ? 'plain' : 'warn') },
        h('div', { class: 'row', style: { gap: '6px', 'margin-bottom': '5px' } }, statusBadge(a.status, { long: true }), h('span', { class: 'tag', text: cls.label || a.evidenceClass })),
        h(
          'dl',
          { class: 'kv' },
          h('dt', { text: 'Value as recorded' }),
          h('dd', { class: 'mono', text: String(a.kind === 'RANGE' ? a.conservative : a.value) + (a.unit ? ' ' + a.unit : '') }),
          a.kind === 'RANGE' ? h('dt', { text: 'Range read' }) : null,
          a.kind === 'RANGE' ? h('dd', { class: 'mono', text: a.value.low + ' – ' + a.value.high + (a.unit ? ' ' + a.unit : '') + ' (the conservative end is recorded as the value)' }) : null,
          a.condition ? h('dt', { text: 'Condition' }) : null,
          a.condition ? h('dd', { text: a.condition }) : null,
          h('dt', { text: 'As written' }),
          h('dd', { class: 'mono small', text: a.parsed ? a.parsed.text : '' })
        ),
        a.warnings.length
          ? h('ul', { class: 'small', style: { margin: '6px 0 0 16px' } }, a.warnings.map((w) => h('li', { text: w })))
          : null,
        h(
          'div',
          { class: 'btn-row', style: { 'margin-top': '8px' } },
          h('button', {
            class: 'btn sm primary',
            text: 'Record it',
            onclick: async () => {
              const res = await apply({ gap, assessed: a, route: ctx.route, query: ctx.query, quote: quoteBox.textContent || null });
              if (res.ok) {
                toast(res.message, res.status === 'WEB_SOURCED' ? 'ok' : 'warn');
                closeDrawer();
              } else {
                toast(res.message, 'err');
              }
            },
          }),
          h('button', {
            class: 'btn sm ghost',
            text: 'Not this one',
            onclick: async () => {
              await recordOutcome({ gap, route: ctx.route, query: ctx.query, rawValue: valueIn.value, url: urlIn.value.trim() || null, outcome: 'REJECTED', note: 'Rejected at review.' });
              toast('Kept in the register as rejected, so nobody repeats the search.', 'ok');
              closeDrawer();
            },
          })
        )
      )
    );
  };

  box.appendChild(h('h3', { class: 'card-title', text: 'The value' }));
  if (aiAvailable()) {
    box.appendChild(
      h(
        'div',
        { class: 'btn-row', style: { 'margin-bottom': '8px' } },
        h('button', {
          class: 'btn sm',
          text: 'Let the assistant read the passage',
          onclick: async (ev) => {
            const btn = ev.currentTarget;
            btn.disabled = true;
            btn.textContent = 'Reading…';
            try {
              const r = await extractFromText({
                text: ctx.text,
                url: ctx.url,
                target: gap.target,
                targetLabel: gap.propertyLabel || COMPANY_FIELD_LABELS[gap.target] || gap.target,
                subjectLabel: gap.chemicalName || 'the company',
                expectation: { unit: (plan.routes[0] || {}).unit || null },
              });
              if (!r.found) {
                toast('The passage does not give that value: ' + r.why, 'warn');
              } else {
                valueIn.value = r.rawValue || '';
                if (r.evidenceClass) classSel.value = r.evidenceClass;
                if (r.quote) quoteBox.textContent = '“' + r.quote + '”';
                show();
              }
            } catch (e) {
              toast('Could not read the passage: ' + ((e && e.message) || 'unknown error') + '. Type the value in instead.', 'err');
            } finally {
              btn.disabled = false;
              btn.textContent = 'Let the assistant read the passage';
            }
          },
        })
      )
    );
  }
  box.appendChild(field('Value, exactly as the document writes it', valueIn, 'Keep the unit and the range. The app records what was written as well as the figure it uses.'));
  box.appendChild(field('What kind of source is it', classSel));
  box.appendChild(field('Document URL', urlIn, 'Without a URL the value can only be recorded as inferred.'));
  box.appendChild(quoteBox);
  box.appendChild(h('div', { class: 'btn-row' }, h('button', { class: 'btn sm', text: 'Check it', onclick: show })));
  box.appendChild(verdict);
  return box;
}

/** The recall route. Offered, labelled, and deliberately weak. */
function recallPanel(gap, plan) {
  const box = h('div', {});
  const out = h('div', {});
  box.appendChild(
    h('div', { class: 'note warn small' }, h('strong', { text: 'No document, so no citation. ' }), 'The value is recorded as inferred. The hazard-alert and threshold engines refuse inferred values, so this will not change any conclusion — it tells you what order of magnitude to expect while you find the real source.')
  );
  box.appendChild(
    h(
      'div',
      { class: 'btn-row' },
      h('button', {
        class: 'btn',
        text: 'Ask the assistant',
        onclick: async (ev) => {
          const btn = ev.currentTarget;
          btn.disabled = true;
          while (out.firstChild) out.removeChild(out.firstChild);
          out.appendChild(h('p', { class: 'muted small' }, h('span', { class: 'spin' }), ' Thinking…'));
          try {
            const r = await recallValue({
              target: gap.target,
              targetLabel: gap.propertyLabel || COMPANY_FIELD_LABELS[gap.target] || gap.target,
              subjectLabel: gap.chemicalName || 'the company',
              identifiers: gap.cas ? 'CAS ' + gap.cas : null,
            });
            while (out.firstChild) out.removeChild(out.firstChild);
            if (!r.known) {
              out.appendChild(h('div', { class: 'note plain small', text: 'The assistant does not have a figure for this. That is the honest answer — go to the authority listed above.' }));
              return;
            }
            out.appendChild(
              h(
                'div',
                { class: 'card compact' },
                h('div', { class: 'row', style: { gap: '6px', 'margin-bottom': '5px' } }, statusBadge('AI_INFERRED', { long: true })),
                h('dl', { class: 'kv' },
                  h('dt', { text: 'Remembered value' }), h('dd', { class: 'mono', text: r.value }),
                  r.typicalRange ? h('dt', { text: 'Typical range' }) : null,
                  r.typicalRange ? h('dd', { text: r.typicalRange }) : null,
                  r.dependsOnGrade ? h('dt', { text: 'Grade' }) : null,
                  r.dependsOnGrade ? h('dd', { text: 'This value depends on the grade and particle size. A generic figure is not usable for design.' }) : null,
                  r.checkInstead ? h('dt', { text: 'Check against' }) : null,
                  r.checkInstead ? h('dd', { text: r.checkInstead }) : null
                ),
                r.caveat ? h('p', { class: 'card-note', text: r.caveat }) : null,
                h(
                  'div',
                  { class: 'btn-row' },
                  h('button', {
                    class: 'btn sm',
                    text: 'Record as inferred',
                    onclick: async () => {
                      const a = preview({ gap, finding: { rawValue: r.value, evidenceClass: 'MODEL_RECALL', retrievedAt: nowIso() } });
                      if (!a.ok) {
                        toast(a.message, 'err');
                        return;
                      }
                      const res = await apply({ gap, assessed: a, route: 'RECALL', query: plan.query });
                      toast(res.message, res.ok ? 'warn' : 'err');
                      if (res.ok) closeDrawer();
                    },
                  }),
                  h('button', {
                    class: 'btn sm ghost',
                    text: 'Raise it as a gap instead',
                    onclick: async () => {
                      await S.store.create(
                        'data_gaps',
                        {
                          projectId: project().id,
                          entityKind: gap.kind === 'company' ? 'project' : 'chemical',
                          field: gap.target,
                          label: gap.label,
                          blocks: gap.reasons.indexOf('BLOCKS_ALERT') >= 0 ? ['CHEMICAL_ALERTS'] : gap.reasons.indexOf('GATES_LEGAL') >= 0 ? ['LEGAL_APPLICABILITY'] : ['REPORT_QUALITY_GATE'],
                          resolveWith: (plan.routes || []).slice(0, 3).map((x) => x.name),
                          detail: 'The assistant recalls approximately ' + r.value + ', which is not citable. ' + (r.checkInstead ? 'Confirm against ' + r.checkInstead + '.' : ''),
                          status: 'OPEN',
                        },
                        { projectId: project().id, note: 'Raised from the research view' }
                      );
                      toast('Raised as a data gap with the sources to try.', 'ok');
                      closeDrawer();
                    },
                  })
                )
              )
            );
          } catch (e) {
            while (out.firstChild) out.removeChild(out.firstChild);
            out.appendChild(h('div', { class: 'note crit small', text: 'Could not ask: ' + ((e && e.message) || 'unknown error') + '.' }));
          } finally {
            btn.disabled = false;
          }
        },
      })
    )
  );
  box.appendChild(out);
  return box;
}

// ---------------------------------------------------------------------------
// Company profile
// ---------------------------------------------------------------------------

function companyTab() {
  const wrap = h('div', {});
  const p = project();
  const rows = scoped('company_profile');
  const byField = new Map(rows.map((r) => [r.field, r]));

  wrap.appendChild(
    h('p', {
      class: 'note plain small',
    }, h('strong', { text: 'The profile is not marketing copy. ' }), 'Every field here is either on a public register or it is not established. The consented product quantity caps production; the named occupier and manager carry personal duties under the Factories Act; the worker count decides which thresholds bite. Each one is recorded with the register it came from.')
  );

  const filled = rows.filter((r) => r.value).length;
  const total = COMPANY_FIELDS.reduce((n, g) => n + g.keys.length, 0);
  wrap.appendChild(
    h(
      'div',
      { style: { 'margin-top': '10px' } },
      meter('Profile fields recorded', total ? Math.round((filled / total) * 100) : 0, filled + ' of ' + total + ' fields have a value')
    )
  );

  for (const group of COMPANY_FIELDS) {
    wrap.appendChild(sectionRule(group.group));
    const body = group.keys.map((k) => {
      const row = byField.get(k);
      const gap = { kind: 'company', target: k, label: 'Company profile — ' + (COMPANY_FIELD_LABELS[k] || k), reasons: [], existingRecordId: row ? row.id : null };
      return h(
        'tr',
        {},
        h('td', { text: COMPANY_FIELD_LABELS[k] || k }),
        h('td', {}, row && row.value ? h('span', { text: truncate(String(row.value), 120) }) : h('span', { class: 'muted', text: 'not recorded' })),
        h('td', {}, row ? statusBadge(row.status) : h('span', { class: 'badge missing', text: 'MISSING' })),
        h(
          'td',
          { class: 'small' },
          row && row.sourceUrl
            ? h('a', { href: row.sourceUrl, target: '_blank', rel: 'noopener noreferrer', text: truncate(row.authorityKey || row.sourceUrl, 34) })
            : row && row.sourceKind
              ? h('span', { class: 'muted', text: (evidenceClass(row.sourceKind) || {}).label || row.sourceKind })
              : h('span', { class: 'muted', text: '—' })
        ),
        h('td', {}, h('button', { class: 'btn sm', text: row && row.value ? 'Re-source' : 'Research', onclick: () => gapDrawer(gap) }))
      );
    });
    wrap.appendChild(
      tableWrap(
        [
          { label: 'Field', width: '26%' },
          { label: 'Value', width: '30%' },
          { label: 'Status', width: '14%' },
          { label: 'Source', width: '18%' },
          { label: '', width: '12%' },
        ],
        body,
        { tableClass: 'wide-register' }
      )
    );
  }
  return wrap;
}

// ---------------------------------------------------------------------------
// Findings register
// ---------------------------------------------------------------------------

function findingsTab() {
  const wrap = h('div', {});
  const rows = scoped('research_findings').slice().sort((a, b) => String(b.retrievedAt || '').localeCompare(String(a.retrievedAt || '')));
  const sum = summary();

  wrap.appendChild(
    h(
      'div',
      { class: 'grid c4' },
      tile('Findings recorded', String(sum.attempted), 'Every search this project has run'),
      tile('Applied', String(sum.applied), sum.webSourced + ' with a citation'),
      tile('Inferred only', String(sum.inferred), 'The engines will not use these'),
      tile('Rejected or conflicting', String(sum.rejected + sum.conflicts), 'Kept so nobody repeats the search')
    )
  );

  if (sum.byEvidenceClass.length) {
    wrap.appendChild(sectionRule('By class of evidence'));
    wrap.appendChild(
      h(
        'div',
        { class: 'card' },
        h('dl', { class: 'kv' }, sum.byEvidenceClass.map((c) => [h('dt', { text: c.label }), h('dd', { class: 'mono', text: String(c.count) })]).reduce((a, b) => a.concat(b), []))
      )
    );
  }

  if (rows.length === 0) {
    wrap.appendChild(emptyState('Nothing researched yet', 'Open "What is missing" and start with the highest-ranked gap.', h('button', { class: 'btn', text: 'What is missing', onclick: () => setTab('gaps') })));
    return wrap;
  }

  wrap.appendChild(sectionRule('Every finding, newest first'));
  const body = rows.slice(0, 120).map((r) =>
    h(
      'tr',
      {},
      h('td', {}, h('div', { text: (r.subjectLabel || '') + ' — ' + (r.targetLabel || r.target) }), r.query ? h('div', { class: 'mono small muted', text: truncate(r.query, 60) }) : null),
      h('td', { class: 'mono small', text: r.rawValue ? truncate(String(r.rawValue), 40) : '—' }),
      h('td', {}, r.status ? statusBadge(r.status) : h('span', { class: 'badge na', text: r.outcome || '—' })),
      h('td', { class: 'small', text: (evidenceClass(r.evidenceClass) || {}).label || r.evidenceClass || '—' }),
      h('td', { class: 'small' }, r.url ? h('a', { href: r.url, target: '_blank', rel: 'noopener noreferrer', text: truncate(r.url.replace(/^https?:\/\//, ''), 30) }) : h('span', { class: 'muted', text: 'no document' })),
      h('td', { class: 'small muted', text: r.retrievedAt ? dtFmt(r.retrievedAt) : '' })
    )
  );
  wrap.appendChild(
    tableWrap(
      [
        { label: 'What was looked up', width: '28%' },
        { label: 'Value read', width: '14%' },
        { label: 'Status', width: '13%' },
        { label: 'Evidence class', width: '16%' },
        { label: 'Document', width: '17%' },
        { label: 'Retrieved', width: '12%' },
      ],
      body,
      { tableClass: 'wide-register' }
    )
  );
  return wrap;
}

// ---------------------------------------------------------------------------
// How research works here
// ---------------------------------------------------------------------------

function routesTab() {
  const wrap = h('div', {});
  const avail = routeAvailability();

  wrap.appendChild(
    h(
      'div',
      { class: 'card' },
      h('h3', { class: 'card-title', text: 'This page cannot reach the internet on its own' }),
      h('p', { class: 'card-note', text: 'The runtime that hosts it allows scripts from a few fixed CDNs and blocks every other request before it leaves the frame. That is a good security property and it is not going to change, so the app is built around it rather than pretending otherwise. Four routes get an outside fact in, and each one is labelled on the record it produces.' })
    )
  );

  for (const r of ROUTES) {
    const a = avail[r.key];
    wrap.appendChild(
      h(
        'div',
        { class: 'card' },
        h('div', { class: 'between' }, h('h3', { class: 'card-title', text: r.label }), a.available ? h('span', { class: 'badge verified', text: 'AVAILABLE' }) : h('span', { class: 'badge na', text: 'NOT HERE' })),
        h('p', { class: 'card-note', text: r.note }),
        a.available ? null : h('p', { class: 'small' }, h('strong', { text: 'Why not: ' }), a.why),
        r.key === 'CONNECTOR'
          ? h(
              'div',
              {},
              h('p', { class: 'card-note', text: 'Name the connector in Settings exactly as claude.ai shows it. The page then looks for a search-shaped tool on it; the first call asks your permission, and the search runs with your credentials — this page never sees a token.' }),
              h('button', { class: 'btn sm', text: 'Open Settings', onclick: () => go('settings') })
            )
          : null
      )
    );
  }

  wrap.appendChild(sectionRule('What each class of evidence is worth'));
  const body = EVIDENCE_CLASSES.map((c) =>
    h(
      'tr',
      {},
      h('td', { class: 'mono small', text: String(c.rank) }),
      h('td', { text: c.label }),
      h('td', {}, statusBadge(c.attest, { long: true })),
      h('td', { class: 'small', text: c.note })
    )
  );
  wrap.appendChild(
    tableWrap(
      [
        { label: 'Rank', width: '7%' },
        { label: 'Class', width: '26%' },
        { label: 'Recorded as', width: '17%' },
        { label: 'What it is good for', width: '50%' },
      ],
      body,
      { tableClass: 'wide-register' }
    )
  );

  wrap.appendChild(
    h(
      'div',
      { class: 'note plain', style: { 'margin-top': '12px' } },
      h('strong', { text: 'Nothing researched is ever verified. ' }),
      'A researched value is WEB_SOURCED at best, and the difference matters: VERIFIED means a named engineer read the primary document and signed for the figure. The app will not apply that status on anyone\'s behalf, and no amount of agreement between sources substitutes for it.'
    )
  );
  return wrap;
}
