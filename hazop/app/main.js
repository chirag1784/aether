// app/main.js — capability wiring, the rail, the router and boot.

import { h, clear, qs, toast, meter, statusBadge, truncate } from './util.js';
import { S, setRenderer, render, attachStore, go, setProject, restoreRoute, allProjects, project, scoped, completeness, complianceCounts, qualityGate, reportReady, nodesSorted, dataGapsAll, recommendationRegister } from './state.js';
import { openStore } from './store.js';
import { setAdapter, SampleAdapter, HttpAdapter, aiAvailable } from './ai.js';
import { renderDashboard } from './views/dashboard.js';
import { renderProjects } from './views/projects.js';
import { renderDocuments, renderDataReview } from './views/documents.js';
import { renderProcess, renderEquipment } from './views/process.js';
import { renderChemicals, renderChemicalIntelligence } from './views/chemicals.js';
import { renderNodes } from './views/nodes.js';
import { renderHazop } from './views/hazop.js';
import { renderRisk } from './views/risk.js';
import { renderRecommendations } from './views/recommendations.js';
import { renderTeam } from './views/team.js';
import { renderLegal } from './views/legal.js';
import { renderSources } from './views/sources.js';
import { renderReports } from './views/reports.js';
import { renderSettings } from './views/settings.js';
import { renderChat } from './views/chat.js';

const RAIL = [
  {
    group: 'Project',
    items: [
      { key: 'dashboard', label: 'Dashboard' },
      { key: 'projects', label: 'Profile & jurisdiction' },
      { key: 'documents', label: 'Documents', count: () => scoped('documents').length },
      { key: 'data-review', label: 'Data review', count: () => scoped('extracted_fields').length, alert: () => scoped('field_conflicts').filter((c) => c.status === 'OPEN').length > 0 },
    ],
  },
  {
    group: 'Process model',
    items: [
      { key: 'process', label: 'Process steps', count: () => scoped('process_steps').length },
      { key: 'equipment', label: 'Equipment', count: () => scoped('equipment').length },
      { key: 'chemicals', label: 'Chemicals', count: () => scoped('chemicals').length },
      { key: 'chemical-intelligence', label: 'Chemical intelligence', alert: () => false },
    ],
  },
  {
    group: 'HAZOP',
    items: [
      { key: 'nodes', label: 'Nodes', count: () => scoped('nodes').length, alert: () => scoped('nodes').some((n) => n.reviewStatus === 'PROPOSED') },
      { key: 'hazop', label: 'Worksheet', count: () => scoped('scenarios').length },
      { key: 'risk', label: 'Risk matrix' },
      { key: 'recommendations', label: 'Recommendations', count: () => scoped('recommendations').length },
      { key: 'team', label: 'Team members', count: () => scoped('team_members').length },
    ],
  },
  {
    group: 'Compliance',
    items: [{ key: 'legal', label: 'Legal register', count: () => complianceCounts().total, alert: () => complianceCounts().NOT_ENOUGH_DATA > 0 }],
  },
  {
    group: 'Output',
    items: [
      { key: 'sources', label: 'Sources & audit', count: () => scoped('sources').length },
      { key: 'reports', label: 'Reports' },
      { key: 'settings', label: 'Settings' },
    ],
  },
];

const VIEWS = {
  dashboard: renderDashboard,
  projects: renderProjects,
  documents: renderDocuments,
  'data-review': renderDataReview,
  process: renderProcess,
  equipment: renderEquipment,
  chemicals: renderChemicals,
  'chemical-intelligence': renderChemicalIntelligence,
  nodes: renderNodes,
  hazop: renderHazop,
  risk: renderRisk,
  recommendations: renderRecommendations,
  team: renderTeam,
  legal: renderLegal,
  sources: renderSources,
  reports: renderReports,
  settings: renderSettings,
};

// ------------------------------------------------------------------- render

function paint() {
  const app = qs('#app');
  if (!app) return;
  app.className = S.chatOpen ? 'with-chat' : '';

  paintTopbar();
  paintRail();

  const main = qs('#main');
  clear(main);
  const fn = VIEWS[S.view] || renderDashboard;
  try {
    main.appendChild(fn());
  } catch (e) {
    main.appendChild(
      h(
        'div',
        { class: 'page' },
        h('div', { class: 'note crit' }, h('strong', { text: 'This page could not be drawn. ' }), String((e && e.message) || e), h('div', { class: 'btn-row', style: { 'margin-top': '8px' } }, h('button', { class: 'btn sm', text: 'Go to the dashboard', onclick: () => go('dashboard') })))
      )
    );
    if (window.console) window.console.error(e);
  }

  const chat = qs('#chat');
  clear(chat);
  if (S.chatOpen) chat.appendChild(renderChat());
}

function paintTopbar() {
  const bar = qs('#topbar');
  clear(bar);
  const p = project();

  bar.appendChild(
    h('div', { class: 'brand' }, h('div', { class: 'brand-mark', text: 'HZ' }), h('div', {}, h('div', { class: 'brand-name', text: 'HAZOP Master' }), h('span', { class: 'brand-sub', text: 'process safety · compliance' })))
  );
  bar.appendChild(h('div', { class: 'bar-sep' }));

  const projects = allProjects();
  const sel = h('select', { 'aria-label': 'Project', onchange: (e) => { if (e.target.value === '__new') { go('projects'); return; } setProject(e.target.value); } });
  sel.appendChild(h('option', { value: '', text: projects.length ? '— select a project —' : 'No projects yet' }));
  for (const x of projects) {
    const o = h('option', { value: x.id, text: x.projectName || 'Untitled' });
    if (x.id === S.projectId) o.selected = true;
    sel.appendChild(o);
  }
  bar.appendChild(h('div', { class: 'project-pick' }, sel, p ? h('span', { class: 'rev-chip', text: 'REV ' + (p.revision || 'R0') }) : null, p && p.isWorkedExample ? h('span', { class: 'rev-chip', title: 'Seeded from the uploaded study report, including the contradictions that report contains.', text: 'WORKED EXAMPLE' }) : null));

  bar.appendChild(h('div', { class: 'bar-spacer' }));

  if (p) {
    const comp = completeness();
    const ready = reportReady();
    bar.appendChild(h('div', { class: 'meters' }, meter('Data', comp.data.percent, ''), meter('Critical', comp.critical.percent, ''), meter('Report', ready.percent, '')));
    bar.appendChild(h('div', { class: 'bar-sep' }));
  }

  if (S.storeKind !== 'db') {
    bar.appendChild(h('span', { class: 'badge conflict', title: S.storeMessage, text: 'NOT SAVED' }));
  }

  bar.appendChild(
    h('button', {
      class: 'btn sm' + (S.chatOpen ? ' primary' : ''),
      text: 'Assistant',
      title: aiAvailable() ? 'Ask about this project' : 'The assistant is unavailable in this view',
      onclick: () => {
        S.chatOpen = !S.chatOpen;
        render();
      },
    })
  );
  bar.appendChild(h('button', { class: 'btn sm ghost icon', title: 'Switch theme', 'aria-label': 'Switch theme', text: themeIcon(), onclick: cycleTheme }));
}

function themeIcon() {
  const t = document.documentElement.getAttribute('data-theme');
  return t === 'dark' ? '☾' : t === 'light' ? '☀' : '◐';
}

function cycleTheme() {
  const cur = document.documentElement.getAttribute('data-theme');
  const next = cur === 'light' ? 'dark' : cur === 'dark' ? null : 'light';
  if (next) document.documentElement.setAttribute('data-theme', next);
  else document.documentElement.removeAttribute('data-theme');
  try {
    if (next) localStorage.setItem('hazop.theme', next);
    else localStorage.removeItem('hazop.theme');
  } catch (e) {
    /* storage may be blocked */
  }
  render();
}

function paintRail() {
  const rail = qs('#rail');
  clear(rail);
  const hasProject = !!project();
  for (const group of RAIL) {
    const g = h('div', { class: 'rail-group' });
    g.appendChild(h('div', { class: 'rail-group-label', text: group.group }));
    for (const item of group.items) {
      const disabled = !hasProject && item.key !== 'projects' && item.key !== 'settings' && item.key !== 'dashboard';
      let count = null;
      let alert = false;
      if (hasProject) {
        try {
          count = item.count ? item.count() : null;
          alert = item.alert ? item.alert() : false;
        } catch (e) {
          count = null;
        }
      }
      g.appendChild(
        h(
          'button',
          { class: 'rail-item', 'aria-current': S.view === item.key ? 'page' : null, disabled, onclick: () => go(item.key) },
          h('span', { class: 'ri-label', text: item.label }),
          alert ? h('span', { class: 'ri-dot', title: 'Needs attention' }) : null,
          count !== null && count !== undefined ? h('span', { class: 'ri-count', text: String(count) }) : null
        )
      );
    }
    rail.appendChild(g);
  }
}

// --------------------------------------------------------------------- boot

async function boot() {
  try {
    const t = localStorage.getItem('hazop.theme');
    if (t) document.documentElement.setAttribute('data-theme', t);
  } catch (e) {
    /* storage may be blocked */
  }

  setRenderer(paint);

  // Capabilities. Every one is optional and the app states what is missing.
  const caps = {};
  window.__HAZOP_CAPS = caps;
  window.__HAZOP_ON_DB_ERROR = (collection, err) => {
    if (err && err.code === 'revoked') toast('Your access to the shared store was withdrawn. The page is now read-only.', 'err');
    else if (err && err.code === 'quota_exceeded') toast('The project store is full. Delete some records, or export a JSON backup and start a fresh project.', 'err');
    else if (err) toast('The shared store reported a problem on ' + collection + ': ' + (err.code || 'unknown') + '.', 'err');
  };

  const claude = window.claude;
  if (claude && typeof claude.use === 'function') {
    const [db, sample, user, downloads, assets] = await Promise.all([
      claude.use('db').catch(() => null),
      claude.use('sample').catch(() => null),
      claude.use('user').catch(() => null),
      claude.use('downloads').catch(() => null),
      claude.use('assets').catch(() => null),
    ]);
    caps.db = db;
    caps.sample = sample;
    caps.user = user;
    caps.downloads = downloads;
    caps.assets = assets;

    if (sample) setAdapter(new SampleAdapter(sample));
    else setAdapter(new HttpAdapter());

    if (user) {
      const [isOwner, canEdit, canWrite, id, me] = await Promise.all([
        Promise.resolve(user.isOwner()).catch(() => false),
        Promise.resolve(user.canEdit()).catch(() => false),
        Promise.resolve(user.can('data.write')).catch(() => null),
        Promise.resolve(user.id ? user.id() : null).catch(() => null),
        Promise.resolve(user.me ? user.me() : null).catch(() => null),
      ]);
      // Sharing level maps onto the role matrix in docs/SECURITY.md.
      const level = isOwner ? 'owner' : canEdit ? 'admin' : canWrite === false ? 'view' : 'interact';
      S.actor = {
        id: id || 'local',
        name: (me && me.name) || 'You',
        role: isOwner ? 'admin' : canEdit ? 'facilitator' : canWrite === false ? 'viewer' : 'engineer',
        level,
      };
      caps.readOnly = canWrite === false;
    }
  } else {
    setAdapter(new HttpAdapter());
  }

  const store = await openStore((info) => {
    S.storeKind = info.kind;
    S.storeMessage = info.message;
  });
  store.setActor(S.actor);
  await attachStore(store, { kind: store.kind, message: S.storeMessage });

  // Route restore, then a first paint.
  const route = restoreRoute();
  if (route.view && VIEWS[route.view]) S.view = route.view;
  if (route.projectId) S.projectId = route.projectId;

  // Wait one tick for the first snapshots so the opening screen is not empty.
  setTimeout(() => {
    if (!S.projectId) {
      const first = allProjects()[0];
      if (first) S.projectId = first.id;
      else if (S.view === 'dashboard') S.view = 'projects';
    }
    if (window.innerWidth >= 1180 && aiAvailable() && S.projectId) S.chatOpen = true;
    render();
  }, 350);

  render();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
