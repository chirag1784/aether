// app/views/projects.js — project CRUD, profile and the jurisdiction resolver.

import { h, field, input, select, textarea, triState, toast, drawer, closeDrawer, confirmAction, emptyState, sectionRule, dateFmt, uid, todayIso, tile, statusBadge } from '../util.js';
import { S, go, render, project, allProjects, setProject, scoped, applicability, completeness } from '../state.js';
import { REQUIRED_JURISDICTION } from '../../packages/calculations/completeness.js';
import { FACT_QUESTIONS, resolveJurisdiction } from '../../packages/legal/applicability.js';
import { UTILITIES } from '../../packages/domain/guidewords.js';
import { seedDemoProject } from '../seed.js';

const PROJECT_TYPES = [
  { value: '', label: '— select —' },
  { value: 'greenfield', label: 'Greenfield' },
  { value: 'brownfield', label: 'Brownfield' },
  { value: 'existing', label: 'Existing plant' },
  { value: 'revalidation', label: 'Revalidation' },
];

export function renderProjects() {
  const p = project();
  const page = h('div', { class: 'page' });

  if (!p) {
    page.appendChild(h('div', { class: 'page-head' }, h('h1', { class: 'page-title', text: 'Projects' })));
    page.appendChild(h('p', { class: 'page-sub', text: 'A project is one HAZOP study: one site, one process, one revision history.' }));
    const list = allProjects();
    if (!list.length) {
      page.appendChild(
        emptyState(
          'No projects yet',
          'Create a project to begin, or load the worked example — a calcium-stearate plant in Vilayat GIDC, seeded from a real study report including the discrepancies that report contains.',
          h('div', { class: 'btn-row', style: { 'justify-content': 'center' } }, h('button', { class: 'btn primary', text: 'New project', onclick: newProjectDialog }), h('button', { class: 'btn', text: 'Load the worked example', onclick: loadDemo }))
        )
      );
      return page;
    }
    page.appendChild(h('div', { class: 'btn-row', style: { 'margin-bottom': '12px' } }, h('button', { class: 'btn primary', text: 'New project', onclick: newProjectDialog })));
    page.appendChild(h('div', { class: 'grid c2' }, list.map(projectCard)));
    return page;
  }

  page.appendChild(
    h(
      'div',
      { class: 'page-head' },
      h('div', {}, h('div', { class: 'eyebrow', text: 'Project profile' }), h('h1', { class: 'page-title', text: p.projectName || 'Untitled project' })),
      h(
        'div',
        { class: 'page-actions' },
        h('button', { class: 'btn', text: 'New project', onclick: newProjectDialog }),
        h('button', { class: 'btn danger', text: 'Delete project', onclick: () => deleteProject(p) })
      )
    )
  );
  page.appendChild(h('p', { class: 'page-sub', text: 'Everything here feeds the report cover, the completeness meters and the legal applicability engine. A field left blank is reported as missing, never guessed.' }));

  page.appendChild(identityCard(p));
  page.appendChild(processCard(p));
  page.appendChild(jurisdictionCard(p));
  page.appendChild(settingsCard(p));
  return page;
}

function projectCard(p) {
  return h(
    'div',
    { class: 'card' },
    h('div', { class: 'between' }, h('h3', { class: 'card-title', text: p.projectName || 'Untitled' }), h('span', { class: 'badge', text: 'REV ' + (p.revision || 'R0') })),
    h('p', { class: 'card-note', text: [p.clientName, p.siteName].filter(Boolean).join(' · ') || 'No client or site recorded' }),
    h('dl', { class: 'kv' }, h('dt', { text: 'Product' }), h('dd', { text: p.product || '—' }), h('dt', { text: 'Process' }), h('dd', { text: p.process || '—' }), h('dt', { text: 'Started' }), h('dd', { text: p.studyStartDate ? dateFmt(p.studyStartDate) : '—' })),
    h('div', { class: 'btn-row', style: { 'margin-top': '10px' } }, h('button', { class: 'btn primary sm', text: 'Open', onclick: () => { setProject(p.id); go('dashboard'); } }))
  );
}

// ------------------------------------------------------------------ identity

function identityCard(p) {
  const save = (k) => (e) => patch(p, k, e.target.value);
  return h(
    'div',
    { class: 'card' },
    h('h3', { class: 'card-title', text: 'Identity' }),
    h('p', { class: 'card-note', text: 'Printed on the report cover.' }),
    h(
      'div',
      { class: 'grid c3' },
      field('Project name', input({ value: p.projectName || '', id: 'p-name', onchange: save('projectName') })),
      field('Client', input({ value: p.clientName || '', id: 'p-client', onchange: save('clientName') })),
      field('Site', input({ value: p.siteName || '', id: 'p-site', onchange: save('siteName') })),
      field('Department', input({ value: p.department || '', id: 'p-dept', onchange: save('department') })),
      field('Product', input({ value: p.product || '', id: 'p-product', onchange: save('product') })),
      field('Process', input({ value: p.process || '', id: 'p-process', onchange: save('process') })),
      field('Process stage', input({ value: p.processStage || '', id: 'p-stage', onchange: save('processStage'), placeholder: 'e.g. Stage 1 to 3' })),
      field('Project type', select(PROJECT_TYPES, p.projectType || '', { id: 'p-type', onchange: save('projectType') })),
      field('Revision', input({ value: p.revision || 'R0', id: 'p-rev', onchange: save('revision') })),
      field('Study start', input({ type: 'date', value: p.studyStartDate || '', id: 'p-start', onchange: save('studyStartDate') })),
      field('Study end', input({ type: 'date', value: p.studyEndDate || '', id: 'p-end', onchange: save('studyEndDate') })),
      field('Industrial estate', input({ value: p.industrialEstate || '', id: 'p-estate', onchange: save('industrialEstate') }))
    ),
    field('Site address', textarea({ value: p.siteAddress || '', id: 'p-addr', rows: 2, onchange: save('siteAddress') }))
  );
}

function processCard(p) {
  const save = (k) => (e) => patch(p, k, e.target.value);
  const utilSet = new Set(p.utilities || []);
  return h(
    'div',
    { class: 'card' },
    h('h3', { class: 'card-title', text: 'Process basis' }),
    h('p', { class: 'card-note', text: 'The design intent of every node has to come from somewhere. This is that somewhere.' }),
    field('Process description', textarea({ value: p.processDescription || '', id: 'p-pd', rows: 5, onchange: save('processDescription') }), 'A node without a process basis cannot generate meaningful deviations. This is a blocking check on the report.'),
    h(
      'div',
      { class: 'grid c3' },
      field('Chemistry', textarea({ value: p.chemistry || '', id: 'p-chem', rows: 2, onchange: save('chemistry') })),
      field('Batch size', input({ value: p.batchSize || '', id: 'p-batch', onchange: save('batchSize') })),
      field('Production rate', input({ value: p.productionRate || '', id: 'p-rate', onchange: save('productionRate') })),
      field('Charging sequence', textarea({ value: p.chargingSequence || '', id: 'p-charge', rows: 2, onchange: save('chargingSequence') })),
      field('Reaction sequence', textarea({ value: p.reactionSequence || '', id: 'p-react', rows: 2, onchange: save('reactionSequence') })),
      field('Reaction time', input({ value: p.reactionTime || '', id: 'p-rtime', onchange: save('reactionTime') })),
      field('Normal operating range', input({ value: p.normalOperatingRange || '', id: 'p-nor', onchange: save('normalOperatingRange') })),
      field('Design range', input({ value: p.designRange || '', id: 'p-dr', onchange: save('designRange') })),
      field('Start-up basis', textarea({ value: p.startupBasis || '', id: 'p-su', rows: 2, onchange: save('startupBasis') })),
      field('Shutdown basis', textarea({ value: p.shutdownBasis || '', id: 'p-sd', rows: 2, onchange: save('shutdownBasis') })),
      field('Emergency shutdown basis', textarea({ value: p.emergencyShutdownBasis || '', id: 'p-esd', rows: 2, onchange: save('emergencyShutdownBasis') })),
      field('Abnormal operating cases', textarea({ value: p.abnormalCases || '', id: 'p-abn', rows: 2, onchange: save('abnormalCases') }))
    ),
    h('div', { class: 'field' }, h('span', { text: 'Site utilities' }), h(
      'div',
      { class: 'row', style: { gap: '5px' } },
      UTILITIES.map((u) =>
        h('button', {
          class: 'pill' + (utilSet.has(u.key) ? ' on' : ''),
          type: 'button',
          text: u.label,
          onclick: () => {
            const next = new Set(p.utilities || []);
            if (next.has(u.key)) next.delete(u.key);
            else next.add(u.key);
            patch(p, 'utilities', Array.from(next));
          },
        })
      )
    ), h('div', { class: 'field-hint', text: 'A utility declared here can be selected on a node, which is what enables the utility-failure rows in the worksheet.' }))
  );
}

// -------------------------------------------------------------- jurisdiction

const TRI_FIELDS = [
  { key: 'hazardousProcess', label: 'Hazardous process' },
  { key: 'mahCandidate', label: 'Major-accident-hazard candidate' },
  { key: 'scheduledActivity', label: 'Activity scheduled under the EIA Notification' },
  { key: 'emitsToAir', label: 'Emission to air' },
  { key: 'dischargesToWaterOrLand', label: 'Discharge to water or land' },
  { key: 'hazardousWasteGenerated', label: 'Hazardous waste generated' },
  { key: 'groundwaterAbstraction', label: 'Groundwater abstraction' },
  { key: 'dispatchesHazardousGoods', label: 'Dispatches hazardous goods' },
  { key: 'petroleumClassPresent', label: 'Petroleum (as defined by the Act) present' },
  { key: 'compressedGasPresent', label: 'Compressed-gas cylinders present' },
  { key: 'pressureVesselPresent', label: 'Unfired pressure vessel in compressed-gas service' },
  { key: 'explosivesRelevant', label: 'Explosives present' },
  { key: 'ammoniumNitrateRelevant', label: 'Ammonium nitrate handled' },
  { key: 'calciumCarbideRelevant', label: 'Calcium carbide handled' },
  { key: 'boilerInScope', label: 'Boiler / IBR-scope equipment' },
];

function jurisdictionCard(p) {
  const j = p.jurisdiction || {};
  const run = applicability();
  const resolved = resolveJurisdiction({ project: p, chemicals: scoped('chemicals'), equipment: scoped('equipment') });
  const unresolved = REQUIRED_JURISDICTION.filter((f) => j[f.path] === null || j[f.path] === undefined || j[f.path] === '');

  const saveJ = (k) => (e) => patchJ(p, k, e.target.value);

  const card = h('div', { class: 'card' });
  card.appendChild(h('h3', { class: 'card-title', text: 'Jurisdiction profile' }));
  card.appendChild(
    h('p', { class: 'card-note', text: 'The legal engine reads these facts before it applies anything. Every yes/no below has a third state — "not resolved" — and that is a real answer: it makes the engine report NOT_ENOUGH_DATA instead of guessing.' })
  );

  if (unresolved.length) {
    card.appendChild(
      h('div', { class: 'note warn', style: { 'margin-bottom': '12px' } }, h('strong', { text: unresolved.length + ' required field(s) unresolved: ' }), unresolved.map((f) => f.label).join(', '), '. Until these are set no obligation can reach a confirmed status.')
    );
  }

  card.appendChild(
    h(
      'div',
      { class: 'grid c3' },
      field('Country', input({ value: j.country || '', id: 'j-country', onchange: saveJ('country') })),
      field('State / UT', input({ value: j.state || '', id: 'j-state', onchange: saveJ('state') })),
      field('District / local authority', input({ value: j.district || '', id: 'j-district', onchange: saveJ('district') })),
      field('Appropriate government', select([{ value: '', label: '— not resolved —' }, { value: 'Central Government', label: 'Central Government' }, { value: 'State Government', label: 'State Government' }], j.appropriateGovernment || '', { id: 'j-ag', onchange: saveJ('appropriateGovernment') }), 'Decides whether Central or State rules under the OSHWC Code apply.'),
      field('Establishment / factory category', input({ value: j.establishmentCategory || '', id: 'j-cat', onchange: saveJ('establishmentCategory'), placeholder: 'e.g. Factory' })),
      field('Process category', input({ value: j.processCategory || '', id: 'j-pcat', onchange: saveJ('processCategory'), placeholder: 'e.g. Bulk chemical manufacture' })),
      field('Worker count', input({ type: 'number', value: j.workerCount === null || j.workerCount === undefined ? '' : j.workerCount, id: 'j-workers', onchange: (e) => patchJ(p, 'workerCount', e.target.value === '' ? null : Number(e.target.value)) })),
      field('Environmental category', input({ value: j.environmentalCategory || '', id: 'j-ecat', onchange: saveJ('environmentalCategory') })),
      field('Consent authority', input({ value: j.consentAuthority || '', id: 'j-consent', onchange: saveJ('consentAuthority'), placeholder: 'e.g. GPCB' })),
      field('Fire authority', input({ value: j.fireAuthority || '', id: 'j-fire', onchange: saveJ('fireAuthority') })),
      field('Electrical inspectorate', input({ value: j.electricalInspectorate || '', id: 'j-elec', onchange: saveJ('electricalInspectorate') })),
      field('Industrial estate authority', input({ value: j.industrialEstateAuthority || '', id: 'j-estate', onchange: saveJ('industrialEstateAuthority') }))
    )
  );

  card.appendChild(h('div', { class: 'section-rule' }, h('h2', { text: 'Trigger questions' })));
  card.appendChild(h('p', { class: 'card-note', text: 'Each answer either brings an instrument into the register or excludes it outright, with the reason recorded.' }));

  const triGrid = h('div', { class: 'grid c2' });
  for (const f of TRI_FIELDS) {
    const cur = j[f.key];
    const value = cur === true ? true : cur === false ? false : null;
    const gated = run && run.pendingQuestions ? run.pendingQuestions.filter((q) => q.fact === factNameFor(f.key))[0] : null;
    triGrid.appendChild(
      h(
        'div',
        { class: 'field' },
        h('span', { text: f.label }),
        triState(value, (v) => patchJ(p, f.key, v)),
        h('div', { class: 'field-hint', text: gated ? gated.obligationCount + ' obligation(s) are waiting on this answer.' : FACT_QUESTIONS[factNameFor(f.key)] || '' })
      )
    );
  }
  card.appendChild(triGrid);

  card.appendChild(h('div', { class: 'section-rule' }, h('h2', { text: 'Resolved facts' })));
  const factRows = Object.keys(resolved.facts)
    .filter((k) => k !== 'always')
    .map((k) => {
      const v = resolved.facts[k];
      return h(
        'tr',
        {},
        h('td', { class: 'mono', text: k }),
        h('td', {}, v === true ? h('span', { class: 'badge verified', text: 'TRUE' }) : v === false ? h('span', { class: 'badge na', text: 'FALSE' }) : typeof v === 'number' ? h('span', { class: 'mono', text: String(v) }) : h('span', { class: 'badge missing', text: 'NOT RESOLVED' })),
        h('td', { class: 'small muted', text: (resolved.provenance[k] && (resolved.provenance[k].from || []).join(', ')) || '' }),
        h('td', { class: 'small muted', text: (resolved.provenance[k] && resolved.provenance[k].note) || '' })
      );
    });
  card.appendChild(
    h('div', { class: 'table-wrap', style: { 'max-height': '340px' } }, h('table', {}, h('thead', {}, h('tr', {}, h('th', { text: 'Fact' }), h('th', { text: 'Value' }), h('th', { text: 'Derived from' }), h('th', { text: 'Note' }))), h('tbody', {}, factRows)))
  );

  return card;
}

// The resolver's internal fact names differ from the profile field names in
// a few places; keep the mapping in one spot.
function factNameFor(profileKey) {
  const map = {
    compressedGasPresent: 'compressedGasCylindersPresent',
    pressureVesselPresent: 'pressureVesselCompressedGas',
    scheduledActivity: 'scheduledActivityQuestion',
  };
  return map[profileKey] || profileKey;
}

function settingsCard(p) {
  return h(
    'div',
    { class: 'card' },
    h('h3', { class: 'card-title', text: 'Project settings' }),
    h(
      'div',
      { class: 'grid c2' },
      h('label', { class: 'field inline' }, h('input', { type: 'checkbox', id: 'p-research', checked: !!p.researchEnabled, onchange: (e) => patch(p, 'researchEnabled', e.target.checked) }), h('span', { text: 'External research enabled for this project' })),
      h('label', { class: 'field inline' }, h('input', { type: 'checkbox', id: 'p-conf', checked: p.confidentialDocuments !== false, onchange: (e) => patch(p, 'confidentialDocuments', e.target.checked) }), h('span', { text: 'Treat uploaded documents as confidential' })),
      h('label', { class: 'field inline' }, h('input', { type: 'checkbox', id: 'p-prec', checked: !!p.sourcePrecedenceEnabled, onchange: (e) => patch(p, 'sourcePrecedenceEnabled', e.target.checked) }), h('span', { text: 'Allow automatic conflict resolution by source precedence' }))
    ),
    h('p', { class: 'field-hint', text: 'Automatic resolution is off by default. With it on, a stronger status beats a weaker one for the same field — but two sources of equal status that disagree still stay a conflict, and the losing value is kept.' })
  );
}

// ------------------------------------------------------------------ actions

async function patch(p, key, value) {
  const partial = {};
  partial[key] = value;
  await S.store.update('projects', p.id, partial, { projectId: p.id, field: key });
  render();
}

async function patchJ(p, key, value) {
  const j = Object.assign({}, p.jurisdiction || {});
  j[key] = value === '' ? null : value;
  await S.store.update('projects', p.id, { jurisdiction: j }, { projectId: p.id, field: 'jurisdiction.' + key });
  render();
}

function newProjectDialog() {
  const name = input({ placeholder: 'e.g. HAZOP — Calcium stearate plant', id: 'np-name' });
  const client = input({ placeholder: 'Client name', id: 'np-client' });
  const site = input({ placeholder: 'Site', id: 'np-site' });
  const body = h('div', {}, field('Project name', name), field('Client', client), field('Site', site), h('p', { class: 'field-hint', text: 'You can fill in the rest on the project profile. Nothing is required to start.' }));
  drawer('New project', body, [
    h('button', { class: 'btn', text: 'Cancel', onclick: closeDrawer }),
    h('button', {
      class: 'btn primary',
      text: 'Create',
      onclick: async () => {
        const rec = await S.store.create('projects', {
          projectName: name.value.trim() || 'Untitled project',
          clientName: client.value.trim(),
          siteName: site.value.trim(),
          revision: 'R0',
          studyStartDate: todayIso(),
          projectType: '',
          utilities: [],
          jurisdiction: { country: 'India' },
          confidentialDocuments: true,
          researchEnabled: false,
          sourcePrecedenceEnabled: false,
        });
        closeDrawer();
        setProject(rec.id);
        toast('Project created', 'ok');
        go('projects');
      },
    }),
  ]);
}

async function loadDemo() {
  const line = h('div', { class: 'row' }, h('span', { class: 'spin' }), h('span', { text: ' Writing records…' }));
  const bar = h('div', { class: 'meter-track' }, h('div', { class: 'meter-fill', style: { width: '2%' } }));
  drawer(
    'Loading the worked example',
    h(
      'div',
      { class: 'stack' },
      h('p', { text: 'Seeding a calcium-stearate plant from a real study report: two nodes, eighteen worksheet rows, the study\'s own causes, consequences, safeguards and recommendations, and the contradictions the source report contains.' }),
      line,
      bar
    ),
    null
  );
  try {
    const id = await seedDemoProject(S.store, (done, total) => {
      const pctDone = Math.min(99, Math.round((done / total) * 100));
      bar.firstChild.style.width = pctDone + '%';
      line.lastChild.textContent = ' ' + done + ' records written';
    });
    closeDrawer();
    setProject(id);
    toast('Worked example loaded', 'ok');
    go('dashboard');
  } catch (e) {
    closeDrawer();
    toast('Could not load the example: ' + ((e && e.message) || 'unknown error'), 'err');
  }
}

async function deleteProject(p) {
  const ok = await confirmAction('Delete "' + (p.projectName || 'this project') + '"?', 'Every node, worksheet row, recommendation and compliance record in it is deleted. This cannot be undone. Export a JSON backup first if you may need it.');
  if (!ok) return;
  const collections = ['documents', 'extracted_fields', 'field_conflicts', 'process_steps', 'equipment', 'chemicals', 'chem_properties', 'nodes', 'scenarios', 'safeguards', 'recommendations', 'team_members', 'assumptions', 'data_gaps', 'sources', 'compliance', 'permits', 'permit_conditions', 'compliance_tasks', 'compliance_evidence', 'legal_thresholds', 'legal_updates', 'legal_node_links', 'risk_matrices', 'report_versions'];
  for (const c of collections) {
    for (const r of scoped(c)) {
      await S.store.remove(c, r.id, { projectId: p.id });
    }
  }
  await S.store.remove('projects', p.id, { projectId: p.id });
  setProject(null);
  toast('Project deleted');
  go('projects');
}

export { newProjectDialog, loadDemo };
