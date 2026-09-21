// app/views/settings.js — AI, research, legal and template settings, plus the
// deployment facts a user needs to know about where their data lives.

import { h, field, input, select, textarea, toast, emptyState, sectionRule, tile, tableWrap, dtFmt } from '../util.js';
import { S, render, project, scoped } from '../state.js';
import { aiAvailable, getAdapter, PROMPT_VERSION, SCHEMA_VERSION, AI_LAYER_VERSION } from '../ai.js';
import { engineVersions } from '../exports.js';
import { LEGAL_LIBRARY_VERSION, LEGAL_LIBRARY_SEEDED_AT, LEGAL_INSTRUMENTS, LEGAL_OBLIGATIONS } from '../../packages/legal/library.js';
import { ROLES } from '../../packages/domain/status.js';
import { HAZOP_ROLES } from './team.js';

export function renderSettings() {
  const page = h('div', { class: 'page' });
  const caps = window.__HAZOP_CAPS || {};
  const p = project();

  page.appendChild(h('div', { class: 'page-head' }, h('div', {}, h('div', { class: 'eyebrow', text: 'Configuration' }), h('h1', { class: 'page-title', text: 'Settings' }))));

  // ---------------------------------------------------------- deployment
  page.appendChild(sectionRule('This deployment'));
  page.appendChild(
    h(
      'div',
      { class: 'card' },
      h(
        'dl',
        { class: 'kv' },
        h('dt', { text: 'Project store' }),
        h('dd', {}, S.storeKind === 'db' ? h('span', {}, h('span', { class: 'badge verified', text: 'SHARED' }), ' Changes are saved and visible to everyone with access to this page. The store is organization-internal and cannot be shared by public link.') : h('span', {}, h('span', { class: 'badge conflict', text: 'THIS TAB ONLY' }), ' ', S.storeMessage)),
        h('dt', { text: 'You' }),
        h('dd', { text: (S.actor.name || 'Unknown') + ' · ' + S.actor.role + (S.actor.level ? ' (sharing level: ' + S.actor.level + ')' : '') }),
        h('dt', { text: 'AI assistance' }),
        h('dd', {}, aiAvailable() ? h('span', {}, h('span', { class: 'badge verified', text: 'AVAILABLE' }), ' Runs on your own Claude account through the platform. There is no provider key in this deployment, so none can leak.') : h('span', {}, h('span', { class: 'badge missing', text: 'UNAVAILABLE' }), ' Every deterministic engine still works: the worksheet, the risk engine, the threshold engine, the register and every export.')),
        h('dt', { text: 'File storage' }),
        h('dd', { text: caps.assets ? 'Available — uploaded documents are stored with this page.' : 'Unavailable in this view. Documents can be registered with their text pasted in.' }),
        h('dt', { text: 'File downloads' }),
        h('dd', { text: caps.downloads ? 'Available.' : 'Unavailable in this view. Use Print on the report preview for a PDF.' })
      )
    )
  );

  // ---------------------------------------------------------- AI
  page.appendChild(sectionRule('AI'));
  page.appendChild(
    h(
      'div',
      { class: 'card' },
      h('h3', { class: 'card-title', text: 'What the model may and may not do' }),
      h('p', { class: 'card-note', text: 'This is enforced in code, not in prompt text. The AI action layer accepts a fixed set of schemas, and each one runs through the same validators as a human edit.' }),
      h('div', { class: 'grid c2' },
        h('div', {}, h('div', { class: 'tile-label', text: 'May' }), h('ul', { class: 'list-compact small' }, ['Propose node boundaries and design intents, as PROPOSED drafts', 'Draft causes, consequences and existing safeguards for deviations the engine has already decided are meaningful', 'Draft recommendations with a technical basis', 'Extract fields from a document with page locators', 'Extract permit conditions verbatim, with any reading kept separate', 'Explain a finding the application has already made', 'Draft the narrative report sections'].map((x) => h('li', { text: x })))),
        h('div', {}, h('div', { class: 'tile-label', text: 'May never' }), h('ul', { class: 'list-compact small' }, ['Compute a risk score, a threshold crossing, a unit conversion or a renewal date', 'Set or change an applicability status to a confirmed value', 'Mark compliance verified, or a recommendation closed', 'Approve a report', 'Overwrite a VERIFIED or USER_CONFIRMED value', 'Resolve a conflict', 'Add a deviation the engine did not emit for that node'].map((x) => h('li', { text: x }))))
      ),
      h('dl', { class: 'kv', style: { 'margin-top': '12px' } }, h('dt', { text: 'Adapter' }), h('dd', { text: getAdapter() ? getAdapter().name : 'none' }), h('dt', { text: 'Layer / prompt / schema version' }), h('dd', { class: 'mono', text: AI_LAYER_VERSION + ' / ' + PROMPT_VERSION + ' / ' + SCHEMA_VERSION }), h('dt', { text: 'Task routing' }), h('dd', { text: 'light → quick, medium → default, strong → complex. Every run records the tier applied, so a fallback is visible.' }))
    )
  );

  // ---------------------------------------------------------- research
  if (p) {
    page.appendChild(sectionRule('Research (this project)'));
    page.appendChild(
      h(
        'div',
        { class: 'card' },
        h('label', { class: 'field inline' }, h('input', { type: 'checkbox', id: 'st-research', checked: !!p.researchEnabled, onchange: (e) => patchProject(p, 'researchEnabled', e.target.checked) }), h('span', { text: 'External research enabled' })),
        h('label', { class: 'field inline' }, h('input', { type: 'checkbox', id: 'st-conf', checked: p.confidentialDocuments !== false, onchange: (e) => patchProject(p, 'confidentialDocuments', e.target.checked) }), h('span', { text: 'Treat uploaded documents as confidential (ask before sending text for extraction)' })),
        h('label', { class: 'field inline' }, h('input', { type: 'checkbox', id: 'st-prec', checked: !!p.sourcePrecedenceEnabled, onchange: (e) => patchProject(p, 'sourcePrecedenceEnabled', e.target.checked) }), h('span', { text: 'Allow automatic conflict resolution by source precedence' })),
        h('p', { class: 'field-hint', text: 'With precedence on, a stronger status beats a weaker one for the same field. Two sources of equal status that disagree still stay a conflict, and the value not chosen is always retained.' })
      )
    );
  }

  // ---------------------------------------------------------- legal
  page.appendChild(sectionRule('Legal library'));
  page.appendChild(
    h(
      'div',
      { class: 'card' },
      h('div', { class: 'grid c4' }, tile('Instruments', LEGAL_INSTRUMENTS.length), tile('Obligations', LEGAL_OBLIGATIONS.length), tile('Threshold figures', scoped('legal_thresholds').length, 'Entered by users with citations'), tile('Library version', LEGAL_LIBRARY_VERSION, 'Seeded ' + LEGAL_LIBRARY_SEEDED_AT)),
      h('p', { class: 'card-note', style: { 'margin-top': '10px' }, text: 'Every instrument ships as METADATA_SEEDED_UNVERIFIED: the library records what an instrument is, who administers it, where its official text lives and where the obligation sits. It does not ship the text, and it ships no numeric statutory threshold at all — those are read from the official schedule by a user and cited.' }),
      h('p', { class: 'field-hint', text: 'Automated legal-update crawling is disabled (LEGAL_UPDATE_CHECK_ENABLED=false) until the register and applicability model are in production use. Record a source change manually on the legal Updates tab; it creates a review event and changes no conclusion.' })
    )
  );

  // ---------------------------------------------------------- roles
  page.appendChild(sectionRule('Your role in this project'));
  const roleSel = select(ROLES.map((r) => ({ value: r, label: r })), S.actor.role, { id: 'st-role', onchange: (e) => { S.actor.role = e.target.value; if (S.store) S.store.setActor(S.actor); toast('Role set to ' + e.target.value + ' for this session', 'ok'); render(); } });
  page.appendChild(
    h(
      'div',
      { class: 'card' },
      field('Role', roleSel, 'In the shared deployment your base role comes from your sharing level on this page; you can narrow it here for this session, which is useful for checking what a viewer or engineer can do.'),
      h('div', { class: 'table-wrap', style: { 'max-height': 'none' } }, h('table', {}, h('thead', {}, h('tr', {}, h('th', { text: 'Action' }), ROLES.map((r) => h('th', { text: r })))), h('tbody', {}, PERMISSIONS.map((row) => h('tr', {}, h('td', { text: row.label }), ROLES.map((r) => h('td', { style: { 'text-align': 'center' }, text: row.roles.indexOf(r) !== -1 ? '✓' : '·' })))))))
    )
  );

  // ---------------------------------------------------------- templates
  page.appendChild(sectionRule('Report template'));
  page.appendChild(
    h(
      'div',
      { class: 'card' },
      h('p', { class: 'card-note', text: 'The section order is fixed so that a reader can find the same thing in the same place across studies. Conditional sections are omitted when empty rather than printed as "None".' }),
      h('ol', { class: 'list-compact small' }, REPORT_SECTION_LABELS.map((s) => h('li', {}, s.label, s.conditional ? h('span', { class: 'muted', text: ' (conditional)' }) : null)))
    )
  );

  // ---------------------------------------------------------- engines
  page.appendChild(sectionRule('Engine versions'));
  const ev = engineVersions();
  page.appendChild(h('div', { class: 'card' }, h('p', { class: 'card-note', text: 'Every calculated value records the engine version that produced it, so a restored backup recomputes identically and a report says what it was checked against.' }), h('dl', { class: 'kv' }, Object.keys(ev).map((k) => [h('dt', { text: k }), h('dd', { class: 'mono', text: ev[k] })]).reduce((a, b) => a.concat(b), []))));

  return page;
}

const PERMISSIONS = [
  { label: 'Create / delete a project', roles: ['admin'] },
  { label: 'Edit the project profile and jurisdiction', roles: ['admin', 'facilitator'] },
  { label: 'Register documents and run extraction', roles: ['admin', 'facilitator', 'engineer'] },
  { label: 'Accept an extracted field', roles: ['admin', 'facilitator', 'engineer'] },
  { label: 'Mark a field VERIFIED', roles: ['admin', 'facilitator', 'reviewer'] },
  { label: 'Approve a node', roles: ['admin', 'facilitator'] },
  { label: 'Edit the worksheet', roles: ['admin', 'facilitator', 'engineer'] },
  { label: 'Enter a threshold figure', roles: ['admin', 'facilitator'] },
  { label: 'Mark a threshold VERIFIED', roles: ['admin', 'facilitator', 'reviewer'] },
  { label: 'Confirm a legal applicability status', roles: ['admin', 'facilitator', 'reviewer'] },
  { label: 'Mark compliance evidence verified', roles: ['admin', 'facilitator', 'reviewer'] },
  { label: 'Close out a recommendation', roles: ['admin', 'facilitator', 'reviewer'] },
  { label: 'Mark a report REVIEWED / APPROVED', roles: ['admin', 'facilitator', 'reviewer'] },
  { label: 'Run AI actions', roles: ['admin', 'facilitator', 'engineer'] },
  { label: 'Export a DRAFT', roles: ['admin', 'facilitator', 'engineer', 'reviewer', 'viewer'] },
];

const REPORT_SECTION_LABELS = [
  { label: 'Cover' }, { label: 'Revision history' }, { label: 'Caution and limitations' }, { label: 'Introduction' }, { label: 'Scope of work' },
  { label: 'Process description' }, { label: 'Documents reviewed' }, { label: 'HAZOP methodology' }, { label: 'Reference standards and guidance' },
  { label: 'Legal / regulatory applicability summary' }, { label: 'Study exclusions and assumptions' }, { label: 'HAZOP team members' },
  { label: 'Risk matrix' }, { label: 'Chemical hazard summary' }, { label: 'Process / PFD / P&ID reference' }, { label: 'Node list' },
  { label: 'Node worksheets' }, { label: 'Node-wise legal relevance', conditional: true }, { label: 'Final node-wise recommendation register' },
  { label: 'Master recommendation / action register' }, { label: 'Compliance-gap register', conditional: true }, { label: 'Missing-data register' },
  { label: 'Final conclusions' }, { label: 'Source register' }, { label: 'Annexures', conditional: true },
];

async function patchProject(p, key, value) {
  const partial = {};
  partial[key] = value;
  await S.store.update('projects', p.id, partial, { projectId: p.id, field: key });
  render();
}
