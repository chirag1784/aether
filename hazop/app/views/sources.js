// app/views/sources.js — the source register, missing-data register and audit trail.

import { h, field, input, select, textarea, toast, drawer, closeDrawer, confirmAction, emptyState, sectionRule, tableWrap, tile, statusBadge, truncate, dateFmt, dtFmt, nowIso, chips } from '../util.js';
import { S, go, render, project, scoped, dataGapsAll, nodeById, chemById } from '../state.js';
import { SOURCE_LABELS } from '../../packages/domain/status.js';

const SOURCES_TABS = [
  { key: 'sources', label: 'Source register' },
  { key: 'gaps', label: 'Missing data' },
  { key: 'assumptions', label: 'Assumptions' },
  { key: 'ai', label: 'AI runs' },
  { key: 'audit', label: 'Audit trail' },
];

export function renderSources() {
  const p = project();
  if (!p) return h('div', { class: 'page' }, emptyState('No project selected', 'Pick a project first.', null));

  const tab = S.filters.sourcesTab || 'sources';
  const page = h('div', { class: 'page wide' });
  page.appendChild(h('div', { class: 'page-head' }, h('div', {}, h('div', { class: 'eyebrow', text: 'Provenance' }), h('h1', { class: 'page-title', text: 'Sources & audit' }))));
  page.appendChild(h('p', { class: 'page-sub', text: 'Every value the study relies on has a source with a type, so a recommendation in a guidance document can never be read as a statutory obligation. Everything the app or the model did is recorded.' }));

  const tabs = h('div', { class: 'tabs' });
  for (const t of SOURCES_TABS) tabs.appendChild(h('button', { class: 'tab', 'aria-selected': String(t.key === tab), text: t.label, onclick: () => { S.filters.sourcesTab = t.key; render(); } }));
  page.appendChild(tabs);

  if (tab === 'sources') page.appendChild(sourceRegisterTab(p));
  else if (tab === 'gaps') page.appendChild(gapsTab(p));
  else if (tab === 'assumptions') page.appendChild(assumptionsTab(p));
  else if (tab === 'ai') page.appendChild(aiTab());
  else page.appendChild(auditTab());

  return page;
}

function sourceRegisterTab(p) {
  const sources = scoped('sources');
  const wrap = h('div', {});
  wrap.appendChild(h('div', { class: 'btn-row', style: { 'margin-bottom': '12px' } }, h('button', { class: 'btn primary', text: 'Add source', onclick: () => sourceDialog(p, null) })));

  if (!sources.length) {
    wrap.appendChild(emptyState('No sources registered', 'Registering a document adds it here automatically. Add standards, SDSs and external references by hand. The report prints this register grouped by source type.', h('button', { class: 'btn primary', text: 'Add source', onclick: () => sourceDialog(p, null) })));
    return wrap;
  }

  const groups = new Map();
  for (const s of sources) {
    const k = s.sourceType || 'PROJECT_DOCUMENT';
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(s);
  }

  for (const [type, list] of Array.from(groups.entries()).sort()) {
    wrap.appendChild(sectionRule(type.replace(/_/g, ' ') + ' (' + list.length + ')'));
    if (type === 'STANDARD' || type === 'REGULATOR_GUIDANCE') {
      wrap.appendChild(h('p', { class: 'card-note', text: type === 'STANDARD' ? 'A standard is mandatory only where adopted by law, licence, consent, contract or a company standard. The report lists these as guidance unless an adoption route is recorded.' : 'Guidance, not law.' }));
    }
    const rows = list.map((s) =>
      h('tr', {}, h('td', { style: { 'font-weight': '500' }, text: s.title }), h('td', { class: 'small', text: s.publisher || '—' }), h('td', { class: 'small', text: truncate(s.locator || '', 40) }), h('td', { class: 'mono small', text: s.sha256 ? s.sha256.slice(0, 12) : '—' }), h('td', { class: 'small nowrap', text: s.retrievedAt ? dtFmt(s.retrievedAt) : '—' }), h('td', {}, s.verifiedBy ? h('span', { class: 'badge verified', text: 'VERIFIED' }) : h('span', { class: 'badge missing', text: 'NOT VERIFIED' })), h('td', { class: 'small' }, s.url ? h('a', { href: s.url, target: '_blank', rel: 'noopener', text: 'link' }) : h('span', { class: 'muted', text: '—' })), h('td', {}, h('button', { class: 'btn sm ghost', text: 'Edit', onclick: () => sourceDialog(p, s) })))
    );
    wrap.appendChild(tableWrap([{ label: 'Title' }, { label: 'Publisher' }, { label: 'Locator' }, { label: 'Hash' }, { label: 'Retrieved' }, { label: 'Verified' }, { label: 'Link' }, { label: '' }], rows));
  }
  return wrap;
}

function sourceDialog(p, s) {
  const type = select(SOURCE_LABELS.map((x) => ({ value: x, label: x.replace(/_/g, ' ') })), (s && s.sourceType) || 'PROJECT_DOCUMENT', { id: 'sr-type' });
  const title = input({ value: (s && s.title) || '', id: 'sr-title' });
  const publisher = input({ value: (s && s.publisher) || '', id: 'sr-pub' });
  const locator = input({ value: (s && s.locator) || '', id: 'sr-loc' });
  const url = input({ value: (s && s.url) || '', id: 'sr-url' });
  const retrieved = input({ type: 'date', value: (s && s.retrievedAt ? String(s.retrievedAt).slice(0, 10) : ''), id: 'sr-ret' });

  drawer(s ? 'Edit source' : 'Add source', h('div', {}, field('Source type', type, 'The type decides how the report treats it. A STANDARD is never printed as a statutory obligation.'), field('Title', title), h('div', { class: 'grid c2' }, field('Publisher', publisher), field('Locator', locator), field('Retrieved', retrieved)), field('URL', url)), [
    s ? h('button', { class: 'btn danger', text: 'Delete', onclick: async () => { await S.store.remove('sources', s.id, { projectId: p.id }); closeDrawer(); render(); } }) : null,
    h('button', { class: 'btn', text: 'Cancel', onclick: closeDrawer }),
    h('button', {
      class: 'btn primary',
      text: 'Save',
      onclick: async () => {
        const rec = { projectId: p.id, sourceType: type.value, title: title.value.trim() || 'Untitled source', publisher: publisher.value.trim(), locator: locator.value.trim(), url: url.value.trim(), retrievedAt: retrieved.value ? retrieved.value + 'T00:00:00.000Z' : nowIso() };
        if (s) await S.store.update('sources', s.id, rec, { projectId: p.id });
        else await S.store.create('sources', rec, { projectId: p.id });
        closeDrawer();
        render();
      },
    }),
  ]);
}

function gapsTab(p) {
  const gaps = dataGapsAll();
  const wrap = h('div', {});
  if (!gaps.length) {
    wrap.appendChild(emptyState('No gaps recorded', 'The missing-data register fills itself from the completeness checks and the chemical alerts. An empty register means the critical fields are present.', null));
    return wrap;
  }
  wrap.appendChild(h('p', { class: 'card-note', text: gaps.length + ' item(s). This register is printed in the report as an annexure — a value that is unknown stays unknown, and the reader can see exactly what was not available.' }));

  const groups = new Map();
  for (const g of gaps) {
    const k = g.group || g.entityKind || 'other';
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(g);
  }
  for (const [group, list] of groups) {
    wrap.appendChild(sectionRule(group + ' (' + list.length + ')'));
    const rows = list.map((g) =>
      h('tr', {}, h('td', { text: g.chemicalName || (g.entityKind === 'project' ? 'Project' : g.entityId || '—') }), h('td', { text: g.label || g.field }), h('td', {}, chips(g.blocks || [])), h('td', { class: 'small', text: (g.nodeIds || []).map((id) => { const n = nodeById(id); return n ? 'Node ' + n.nodeNumber : null; }).filter(Boolean).join(', ') || '—' }), h('td', { class: 'small', text: g.detail || '' }), h('td', {}, chips(g.resolveWith || [])))
    );
    wrap.appendChild(tableWrap([{ label: 'Subject' }, { label: 'Missing item' }, { label: 'Blocks' }, { label: 'Nodes affected' }, { label: 'Detail' }, { label: 'Resolve with' }], rows));
  }
  return wrap;
}

function assumptionsTab(p) {
  const list = scoped('assumptions');
  const wrap = h('div', {});
  wrap.appendChild(h('div', { class: 'btn-row', style: { 'margin-bottom': '12px' } }, h('button', { class: 'btn primary', text: 'Add assumption', onclick: () => assumptionDialog(p, null) })));
  if (!list.length) {
    wrap.appendChild(emptyState('No assumptions recorded', 'Record the study exclusions and the assumptions the team worked under. They are printed in the report, because a conclusion is only as good as what it assumed.', h('button', { class: 'btn primary', text: 'Add assumption', onclick: () => assumptionDialog(p, null) })));
    return wrap;
  }
  const rows = list.map((a) => h('tr', {}, h('td', { class: 'small', text: a.category || '—' }), h('td', { text: a.text }), h('td', { class: 'small muted', text: a.basis || '' }), h('td', { class: 'small', text: a.nodeId ? 'Node ' + ((nodeById(a.nodeId) || {}).nodeNumber || '') : '—' }), h('td', {}, h('button', { class: 'btn sm ghost', text: 'Edit', onclick: () => assumptionDialog(p, a) }))));
  wrap.appendChild(tableWrap([{ label: 'Category' }, { label: 'Assumption' }, { label: 'Basis' }, { label: 'Node' }, { label: '' }], rows));
  return wrap;
}

function assumptionDialog(p, a) {
  const category = input({ value: (a && a.category) || '', id: 'as-cat', placeholder: 'e.g. Study exclusion, Data conflict' });
  const text = textarea({ value: (a && a.text) || '', rows: 3, id: 'as-text' });
  const basis = input({ value: (a && a.basis) || '', id: 'as-basis' });
  const nodes = scoped('nodes');
  const nodeSel = select([{ value: '', label: '— whole study —' }].concat(nodes.map((n) => ({ value: n.id, label: 'Node ' + n.nodeNumber }))), (a && a.nodeId) || '', { id: 'as-node' });
  drawer(a ? 'Edit assumption' : 'Add assumption', h('div', {}, field('Category', category), field('Assumption', text), field('Basis', basis), field('Applies to', nodeSel)), [
    a ? h('button', { class: 'btn danger', text: 'Delete', onclick: async () => { await S.store.remove('assumptions', a.id, { projectId: p.id }); closeDrawer(); render(); } }) : null,
    h('button', { class: 'btn', text: 'Cancel', onclick: closeDrawer }),
    h('button', {
      class: 'btn primary',
      text: 'Save',
      onclick: async () => {
        const rec = { projectId: p.id, category: category.value.trim(), text: text.value.trim(), basis: basis.value.trim(), nodeId: nodeSel.value || null, raisedBy: S.actor.id };
        if (a) await S.store.update('assumptions', a.id, rec, { projectId: p.id });
        else await S.store.create('assumptions', rec, { projectId: p.id });
        closeDrawer();
        render();
      },
    }),
  ]);
}

function aiTab() {
  const runs = scoped('ai_runs').slice().sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  const wrap = h('div', {});
  if (!runs.length) {
    wrap.appendChild(emptyState('No AI runs', 'Every structured AI call is logged here with the provider, the model tier, the prompt and schema versions, the facts it used, what it said was missing, and whether its output passed validation.', null));
    return wrap;
  }
  wrap.appendChild(h('div', { class: 'grid c4' }, tile('Runs', runs.length), tile('Rejected output', runs.filter((r) => r.outputValid === false).length, 'Failed schema validation', runs.some((r) => r.outputValid === false) ? 'alert' : 'ok'), tile('Tier fallbacks', runs.filter((r) => r.modelTierApplied && r.modelTierApplied !== r.modelTierRequested).length, 'Of ' + runs.filter((r) => r.modelTierApplied).length + ' run(s) that reported a tier'), tile('Median runtime', runs.length ? Math.round(median(runs.map((r) => r.runtimeMs || 0)) / 100) / 10 + 's' : '—')));
  const rows = runs.slice(0, 200).map((r) =>
    h('tr', {}, h('td', { class: 'small nowrap', text: dtFmt(r.createdAt) }), h('td', { class: 'mono small', text: r.task }), h('td', { class: 'small', text: r.taskClass }), h('td', { class: 'small', text: r.provider }), h('td', { class: 'small', text: (r.modelTierRequested || '—') + (r.modelTierApplied && r.modelTierApplied !== r.modelTierRequested ? ' → ' + r.modelTierApplied : '') }), h('td', { class: 'mono small', text: (r.promptVersion || '') + '/' + (r.schemaVersion || '') }), h('td', { class: 'num small', text: r.runtimeMs ? Math.round(r.runtimeMs / 100) / 10 + 's' : '—' }), h('td', { class: 'num small', text: r.confidence === null || r.confidence === undefined ? '—' : Math.round(r.confidence * 100) + '%' }), h('td', {}, r.outputValid === false ? h('span', { class: 'badge conflict', text: 'REJECTED' }) : h('span', { class: 'badge verified', text: 'VALID' })), h('td', { class: 'small muted', text: truncate((r.missingData || []).join('; '), 70) }), h('td', {}, h('button', { class: 'btn sm ghost', text: 'Open', onclick: () => runDrawer(r) })))
  );
  wrap.appendChild(tableWrap([{ label: 'When' }, { label: 'Task' }, { label: 'Class' }, { label: 'Provider' }, { label: 'Tier' }, { label: 'Prompt/schema' }, { label: 'Runtime', cls: 'num' }, { label: 'Confidence', cls: 'num' }, { label: 'Output' }, { label: 'Missing data reported' }, { label: '' }], rows));
  return wrap;
}

function median(arr) {
  const a = arr.slice().sort((x, y) => x - y);
  if (!a.length) return 0;
  const mid = Math.floor(a.length / 2);
  return a.length % 2 ? a[mid] : (a[mid - 1] + a[mid]) / 2;
}

function runDrawer(r) {
  drawer(
    'AI run — ' + r.task,
    h(
      'div',
      { class: 'stack' },
      h('dl', { class: 'kv' },
        h('dt', { text: 'When' }), h('dd', { text: dtFmt(r.createdAt) }),
        h('dt', { text: 'Provider' }), h('dd', { text: r.provider }),
        h('dt', { text: 'Task class' }), h('dd', { text: r.taskClass }),
        h('dt', { text: 'Tier requested / applied' }), h('dd', { text: (r.modelTierRequested || '—') + ' / ' + (r.modelTierApplied || 'not reported') }),
        h('dt', { text: 'Prompt version' }), h('dd', { class: 'mono', text: r.promptVersion || '—' }),
        h('dt', { text: 'Schema version' }), h('dd', { class: 'mono', text: r.schemaVersion || '—' }),
        h('dt', { text: 'Runtime' }), h('dd', { text: r.runtimeMs ? r.runtimeMs + ' ms' : '—' }),
        h('dt', { text: 'Output valid' }), h('dd', { text: r.outputValid === false ? 'No' : 'Yes' }),
        h('dt', { text: 'Human review required' }), h('dd', { text: 'Yes — always' })
      ),
      (r.factsUsed || []).length ? h('div', {}, h('div', { class: 'tile-label', text: 'Facts the model said it used' }), h('ul', { class: 'list-compact small' }, r.factsUsed.map((f) => h('li', { text: String(f) })))) : null,
      (r.assumptions || []).length ? h('div', {}, h('div', { class: 'tile-label', text: 'Assumptions it declared' }), h('ul', { class: 'list-compact small' }, r.assumptions.map((f) => h('li', { text: String(f) })))) : null,
      (r.missingData || []).length ? h('div', {}, h('div', { class: 'tile-label', text: 'Missing data it reported' }), h('ul', { class: 'list-compact small' }, r.missingData.map((f) => h('li', { text: String(f) })))) : null,
      (r.validationErrors || []).length ? h('div', { class: 'note crit' }, h('strong', { text: 'Validation errors: ' }), (r.validationErrors || []).join(' ')) : null
    ),
    [h('button', { class: 'btn', text: 'Close', onclick: closeDrawer })]
  );
}

function auditTab() {
  const buckets = scoped('audit').slice().sort((a, b) => String(b.day).localeCompare(String(a.day)));
  const wrap = h('div', {});
  if (!buckets.length) {
    wrap.appendChild(emptyState('No audit entries', 'Every create, update and delete is appended here with who did it, what changed and which AI run, if any, was behind it.', null));
    return wrap;
  }
  const total = buckets.reduce((n, b) => n + (b.count || (b.entries || []).length), 0);
  wrap.appendChild(h('p', { class: 'card-note', text: total + ' entry(ies) across ' + buckets.length + ' day(s). Entries are appended; the app has no path that edits or deletes one.' }));
  for (const b of buckets.slice(0, 14)) {
    wrap.appendChild(sectionRule(dateFmt(b.day) + ' — ' + (b.count || (b.entries || []).length) + ' entry(ies)'));
    const rows = (b.entries || []).slice().reverse().slice(0, 120).map((e) =>
      h('tr', {}, h('td', { class: 'small nowrap', text: String(e.at).slice(11, 19) }), h('td', { class: 'small', text: e.actor || '—' }), h('td', {}, h('span', { class: 'badge ' + (e.actorKind === 'ai' ? 'inferred' : 'confirmed'), text: e.actorKind || 'human' })), h('td', { class: 'mono small', text: e.action }), h('td', { class: 'small', text: e.entity + (e.field ? '.' + e.field : '') }), h('td', { class: 'small mono', text: truncate(JSON.stringify(e.before || null), 46) }), h('td', { class: 'small mono', text: truncate(JSON.stringify(e.after || null), 46) }), h('td', { class: 'small muted', text: e.note || '' }))
    );
    wrap.appendChild(tableWrap([{ label: 'Time' }, { label: 'Actor' }, { label: 'Kind' }, { label: 'Action' }, { label: 'Entity' }, { label: 'Before' }, { label: 'After' }, { label: 'Note' }], rows));
  }
  return wrap;
}
