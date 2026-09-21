// app/views/process.js — process steps and the equipment register.

import { h, field, input, select, textarea, toast, drawer, closeDrawer, confirmAction, emptyState, sectionRule, tableWrap, statusBadge, truncate, tile, chips } from '../util.js';
import { S, go, render, project, scoped, equipById } from '../state.js';
import { toBar, toCelsius } from '../../packages/calculations/units.js';

const EQUIP_TYPES = ['reactor', 'vessel', 'tank', 'mixer', 'blender', 'grinder', 'dryer', 'centrifuge', 'filter', 'heat exchanger', 'condenser', 'pump', 'blower', 'compressor', 'boiler', 'cooling tower', 'scrubber', 'silo', 'cylinder store', 'line', 'other'];

export function renderProcess() {
  const p = project();
  if (!p) return h('div', { class: 'page' }, emptyState('No project selected', 'Pick a project first.', null));

  const steps = scoped('process_steps').slice().sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
  const page = h('div', { class: 'page' });

  page.appendChild(
    h('div', { class: 'page-head' }, h('div', {}, h('div', { class: 'eyebrow', text: 'Process model' }), h('h1', { class: 'page-title', text: 'Process steps' })), h('div', { class: 'page-actions' }, h('button', { class: 'btn primary', text: 'Add step', onclick: () => stepDialog(p, null) })))
  );
  page.appendChild(h('p', { class: 'page-sub', text: 'The process sequence the node proposer reads. Steps come from the BMR or SOP; a step with a stated temperature or hold time is what makes a temperature or time deviation meaningful on the node that covers it.' }));

  if (!steps.length) {
    page.appendChild(emptyState('No process steps', 'Add the charging, heating, reaction, transfer and packing steps as the BMR states them. You can also extract them from a registered BMR on the documents page.', h('div', { class: 'btn-row', style: { 'justify-content': 'center' } }, h('button', { class: 'btn primary', text: 'Add step', onclick: () => stepDialog(p, null) }), h('button', { class: 'btn', text: 'Go to documents', onclick: () => go('documents') }))));
    return page;
  }

  const list = h('div', { class: 'stack' });
  steps.forEach((s, i) => {
    list.appendChild(
      h(
        'div',
        { class: 'card' },
        h(
          'div',
          { class: 'between' },
          h('h3', { class: 'card-title' }, h('span', { class: 'mono', style: { color: 'var(--accent)' }, text: s.stepNumber || String(i + 1) }), ' ', s.title),
          h('div', { class: 'btn-row' }, i > 0 ? h('button', { class: 'btn sm ghost icon', text: '↑', title: 'Move up', onclick: () => reorderStep(steps, i, -1) }) : null, i < steps.length - 1 ? h('button', { class: 'btn sm ghost icon', text: '↓', title: 'Move down', onclick: () => reorderStep(steps, i, 1) }) : null, h('button', { class: 'btn sm ghost', text: 'Edit', onclick: () => stepDialog(p, s) }))
        ),
        s.description ? h('p', { style: { margin: '2px 0 8px' }, text: s.description }) : null,
        h('div', { class: 'row', style: { gap: '6px' } }, s.temperature ? h('span', { class: 'tag', text: 'T ' + s.temperature }) : null, s.pressure ? h('span', { class: 'tag', text: 'P ' + s.pressure }) : null, s.duration ? h('span', { class: 'tag', text: 't ' + s.duration }) : null, (s.sourceRefs || [])[0] ? h('span', { class: 'muted small', text: 'from ' + ((s.sourceRefs[0].documentName || '') + (s.sourceRefs[0].page ? ' p.' + s.sourceRefs[0].page : '')) }) : null)
      )
    );
  });
  page.appendChild(list);
  return page;
}

function stepDialog(p, s) {
  const stepNumber = input({ value: (s && s.stepNumber) || '', id: 'ps-num' });
  const title = input({ value: (s && s.title) || '', id: 'ps-title' });
  const desc = textarea({ value: (s && s.description) || '', rows: 4, id: 'ps-desc' });
  const temp = input({ value: (s && s.temperature) || '', id: 'ps-temp', placeholder: 'e.g. 90 °C' });
  const pres = input({ value: (s && s.pressure) || '', id: 'ps-pres', placeholder: 'e.g. atmospheric' });
  const dur = input({ value: (s && s.duration) || '', id: 'ps-dur', placeholder: 'e.g. 10 min' });
  const body = h('div', {}, h('div', { class: 'grid c2' }, field('Step number', stepNumber), field('Title', title)), field('Description', desc), h('div', { class: 'grid c3' }, field('Temperature', temp), field('Pressure', pres), field('Duration', dur)));

  drawer(s ? 'Edit step' : 'Add step', body, [
    s ? h('button', { class: 'btn danger', text: 'Delete', onclick: async () => { const ok = await confirmAction('Delete this step?'); if (!ok) return; await S.store.remove('process_steps', s.id, { projectId: p.id }); closeDrawer(); render(); } }) : null,
    h('button', { class: 'btn', text: 'Cancel', onclick: closeDrawer }),
    h('button', {
      class: 'btn primary',
      text: 'Save',
      onclick: async () => {
        const rec = { projectId: p.id, stepNumber: stepNumber.value.trim(), title: title.value.trim() || 'Untitled step', description: desc.value.trim(), temperature: temp.value.trim(), pressure: pres.value.trim(), duration: dur.value.trim() };
        if (s) await S.store.update('process_steps', s.id, rec, { projectId: p.id });
        else await S.store.create('process_steps', Object.assign(rec, { sortOrder: scoped('process_steps').length, status: 'USER_CONFIRMED' }), { projectId: p.id });
        closeDrawer();
        toast('Step saved', 'ok');
        render();
      },
    }),
  ]);
}

async function reorderStep(steps, i, dir) {
  const j = i + dir;
  if (j < 0 || j >= steps.length) return;
  await S.store.update('process_steps', steps[i].id, { sortOrder: j }, { projectId: steps[i].projectId });
  await S.store.update('process_steps', steps[j].id, { sortOrder: i }, { projectId: steps[j].projectId });
  render();
}

// ------------------------------------------------------------------ equipment

export function renderEquipment() {
  const p = project();
  if (!p) return h('div', { class: 'page' }, emptyState('No project selected', 'Pick a project first.', null));

  const eq = scoped('equipment').slice().sort((a, b) => String(a.tag).localeCompare(String(b.tag)));
  const page = h('div', { class: 'page wide' });

  page.appendChild(h('div', { class: 'page-head' }, h('div', {}, h('div', { class: 'eyebrow', text: 'Process model' }), h('h1', { class: 'page-title', text: 'Equipment' })), h('div', { class: 'page-actions' }, h('button', { class: 'btn primary', text: 'Add equipment', onclick: () => equipDialog(p, null) }))));
  page.appendChild(h('p', { class: 'page-sub', text: 'Equipment attributes gate the guideword engine: an agitator enables the agitation deviations, a heating system enables the temperature deviations, a design pressure enables the vapour-pressure alert. Nothing is assumed from the equipment type alone.' }));

  const pressure = eq.filter((e) => e.pressureEquipment);
  const noRelief = pressure.filter((e) => !e.reliefArrangement);
  const noMoc = eq.filter((e) => !e.materialOfConstruction);
  page.appendChild(h('div', { class: 'grid c4' }, tile('Equipment items', eq.length), tile('Pressure equipment', pressure.length, 'Enables the overpressure checks'), tile('No relief recorded', noRelief.length, noRelief.length ? 'Blocking on the report' : 'All pressure equipment covered', noRelief.length ? 'alert' : 'ok'), tile('No material recorded', noMoc.length, noMoc.length ? 'Blocks compatibility checks' : 'All items covered', noMoc.length ? 'alert' : 'ok')));

  if (!eq.length) {
    page.appendChild(emptyState('No equipment', 'Add the equipment in the study scope with its tag as the P&ID shows it. Extraction from a registered equipment list also populates this.', h('button', { class: 'btn primary', text: 'Add equipment', onclick: () => equipDialog(p, null) })));
    return page;
  }

  const rows = eq.map((e) => {
    const flags = [];
    if (e.agitator) flags.push('agitator');
    if (e.heatingSystem) flags.push('heating');
    if (e.coolingSystem) flags.push('cooling');
    if (e.pressureEquipment) flags.push('pressure');
    if (e.vacuumService) flags.push('vacuum');
    if (e.powderHandling) flags.push('powder');
    if (e.compressedGasService) flags.push('compressed gas');
    return h(
      'tr',
      {},
      h('td', { class: 'mono', style: { 'font-weight': '600' }, text: e.tag }),
      h('td', { text: e.type || '—' }),
      h('td', { text: truncate(e.service || '—', 40) }),
      h('td', { text: e.capacity || '—' }),
      h('td', { text: e.materialOfConstruction || '—' }),
      h('td', { class: 'num small', text: fmtCond(e.operatingTemperature, e.operatingTemperatureUnit, '°C') }),
      h('td', { class: 'num small', text: fmtCond(e.designTemperature, e.designTemperatureUnit, '°C') }),
      h('td', { class: 'num small', text: fmtCond(e.designPressure, e.designPressureUnit, 'barg') }),
      h('td', {}, e.reliefArrangement ? h('span', { class: 'small', text: truncate(e.reliefArrangement, 34) }) : e.pressureEquipment ? h('span', { class: 'badge missing', text: 'NOT RECORDED' }) : h('span', { class: 'muted small', text: '—' })),
      h('td', {}, chips(flags)),
      h('td', { class: 'nowrap' }, h('button', { class: 'btn sm ghost', text: 'Edit', onclick: () => equipDialog(p, e) }))
    );
  });

  page.appendChild(tableWrap([{ label: 'Tag' }, { label: 'Type' }, { label: 'Service' }, { label: 'Capacity' }, { label: 'Material' }, { label: 'Op T', cls: 'num' }, { label: 'Des T', cls: 'num' }, { label: 'Des P', cls: 'num' }, { label: 'Relief / vent' }, { label: 'Characteristics' }, { label: '' }], rows));
  return page;
}

function fmtCond(v, unit, dflt) {
  if (v === null || v === undefined || v === '') return '—';
  return String(v) + ' ' + (unit || dflt);
}

function equipDialog(p, e) {
  const g = (k, d) => (e && e[k] !== undefined && e[k] !== null ? e[k] : d === undefined ? '' : d);
  const tag = input({ value: g('tag'), id: 'eq-tag', placeholder: 'e.g. PSM-01' });
  const type = select([{ value: '', label: '— select —' }].concat(EQUIP_TYPES.map((t) => ({ value: t, label: t }))), g('type'), { id: 'eq-type' });
  const service = input({ value: g('service'), id: 'eq-service' });
  const capacity = input({ value: g('capacity'), id: 'eq-cap', placeholder: 'e.g. 2.5 kL' });
  const moc = input({ value: g('materialOfConstruction'), id: 'eq-moc', placeholder: 'e.g. SS 316' });
  const opT = input({ type: 'number', step: 'any', value: g('operatingTemperature'), id: 'eq-opt' });
  const opTU = select(['C', 'K', 'F'], g('operatingTemperatureUnit', 'C'), { id: 'eq-optu' });
  const desT = input({ type: 'number', step: 'any', value: g('designTemperature'), id: 'eq-dest' });
  const desTU = select(['C', 'K', 'F'], g('designTemperatureUnit', 'C'), { id: 'eq-destu' });
  const opP = input({ type: 'number', step: 'any', value: g('operatingPressure'), id: 'eq-opp' });
  const desP = input({ type: 'number', step: 'any', value: g('designPressure'), id: 'eq-desp' });
  const presU = select(['barg', 'bara', 'kg/cm2', 'psig', 'kPa', 'MPa'], g('designPressureUnit', 'barg'), { id: 'eq-pu' });
  const relief = textarea({ value: g('reliefArrangement'), rows: 2, id: 'eq-relief', placeholder: 'e.g. PSV-101 set 3.5 barg, or "none fitted"' });
  const vent = input({ value: g('ventArrangement'), id: 'eq-vent' });
  const heating = input({ value: g('heatingSystem'), id: 'eq-heat', placeholder: 'e.g. thermic fluid jacket' });
  const cooling = input({ value: g('coolingSystem'), id: 'eq-cool', placeholder: 'e.g. brine jacket' });
  const agit = h('input', { type: 'checkbox', id: 'eq-agit', checked: !!(e && e.agitator) });
  const pres = h('input', { type: 'checkbox', id: 'eq-pres', checked: !!(e && e.pressureEquipment) });
  const gas = h('input', { type: 'checkbox', id: 'eq-gas', checked: !!(e && e.compressedGasService) });
  const vac = h('input', { type: 'checkbox', id: 'eq-vac', checked: !!(e && e.vacuumService) });
  const powder = h('input', { type: 'checkbox', id: 'eq-powder', checked: !!(e && e.powderHandling) });
  const instruments = input({ value: (e && (e.instruments || []).join(', ')) || '', id: 'eq-inst', placeholder: 'TG-01, PG-02' });
  const alarms = input({ value: (e && (e.alarms || []).join(', ')) || '', id: 'eq-alarm' });
  const trips = input({ value: (e && (e.trips || []).join(', ')) || '', id: 'eq-trip' });
  const inspection = textarea({ value: g('inspectionData'), rows: 2, id: 'eq-insp' });

  const body = h(
    'div',
    {},
    h('div', { class: 'grid c2' }, field('Tag', tag), field('Type', type), field('Service', service), field('Capacity', capacity), field('Material of construction', moc, 'Needed for the chemical-compatibility check.')),
    h('div', { class: 'section-rule' }, h('h2', { text: 'Conditions' })),
    h('div', { class: 'grid c2' }, field('Operating temperature', h('div', { class: 'row', style: { gap: '5px' } }, opT, opTU)), field('Design temperature', h('div', { class: 'row', style: { gap: '5px' } }, desT, desTU)), field('Operating pressure', opP), field('Design pressure', h('div', { class: 'row', style: { gap: '5px' } }, desP, presU), 'State gauge or absolute. The engine refuses to compare a gauge value with an absolute one rather than assume.')),
    field('Relief arrangement', relief, 'Record the device, or state that none is fitted. "Not recorded" is a blocking check for pressure equipment.'),
    field('Vent arrangement', vent),
    h('div', { class: 'section-rule' }, h('h2', { text: 'Characteristics' })),
    h('p', { class: 'card-note', text: 'These flags decide which deviations the guideword engine will emit for a node containing this item.' }),
    h('div', { class: 'grid c2' }, field('Heating system', heating), field('Cooling system', cooling)),
    h('div', { class: 'grid c2' }, h('label', { class: 'field inline' }, agit, h('span', { text: 'Agitated' })), h('label', { class: 'field inline' }, pres, h('span', { text: 'Pressure equipment' })), h('label', { class: 'field inline' }, gas, h('span', { text: 'Compressed-gas service' })), h('label', { class: 'field inline' }, vac, h('span', { text: 'Vacuum service' })), h('label', { class: 'field inline' }, powder, h('span', { text: 'Powder / granular handling' }))),
    h('div', { class: 'section-rule' }, h('h2', { text: 'Instrumentation' })),
    h('div', { class: 'grid c3' }, field('Instruments', instruments), field('Alarms', alarms), field('Trips / interlocks', trips)),
    field('Inspection / test data', inspection)
  );

  drawer(e ? 'Edit ' + e.tag : 'Add equipment', body, [
    e ? h('button', { class: 'btn danger', text: 'Delete', onclick: async () => { const ok = await confirmAction('Delete ' + e.tag + '?', 'Nodes referencing it keep the reference but will show it as missing.'); if (!ok) return; await S.store.remove('equipment', e.id, { projectId: p.id }); closeDrawer(); render(); } }) : null,
    h('button', { class: 'btn', text: 'Cancel', onclick: closeDrawer }),
    h('button', {
      class: 'btn primary',
      text: 'Save',
      onclick: async () => {
        if (!tag.value.trim()) {
          toast('A tag is required — it is how nodes, conditions and drawings refer to this item.', 'err');
          return;
        }
        const rec = {
          projectId: p.id,
          tag: tag.value.trim(),
          type: type.value,
          service: service.value.trim(),
          capacity: capacity.value.trim(),
          materialOfConstruction: moc.value.trim(),
          operatingTemperature: numOrNull(opT.value),
          operatingTemperatureUnit: opTU.value,
          designTemperature: numOrNull(desT.value),
          designTemperatureUnit: desTU.value,
          operatingPressure: numOrNull(opP.value),
          operatingPressureUnit: presU.value,
          designPressure: numOrNull(desP.value),
          designPressureUnit: presU.value,
          reliefArrangement: relief.value.trim(),
          ventArrangement: vent.value.trim(),
          heatingSystem: heating.value.trim(),
          coolingSystem: cooling.value.trim(),
          agitator: agit.checked,
          pressureEquipment: pres.checked,
          compressedGasService: gas.checked,
          vacuumService: vac.checked,
          powderHandling: powder.checked,
          instruments: splitList(instruments.value),
          alarms: splitList(alarms.value),
          trips: splitList(trips.value),
          inspectionData: inspection.value.trim(),
        };
        if (e) await S.store.update('equipment', e.id, rec, { projectId: p.id });
        else await S.store.create('equipment', Object.assign(rec, { status: 'USER_CONFIRMED' }), { projectId: p.id });
        closeDrawer();
        toast('Equipment saved', 'ok');
        render();
      },
    }),
  ]);
}

function numOrNull(v) {
  if (v === '' || v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function splitList(v) {
  return String(v || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}
