// app/views/nodes.js — node list, node editor, and the per-node legal panel.

import { h, field, input, select, textarea, toast, drawer, closeDrawer, confirmAction, emptyState, sectionRule, tableWrap, statusBadge, applicBadge, truncate, tile, chips, nowIso, uid } from '../util.js';
import { S, go, render, project, scoped, nodesSorted, scenariosFor, nodeById, equipById, chemById, legalLinksForNode, chemicalsResolved, complianceRegister } from '../state.js';
import { generateDeviations, deriveNodeFacts, deviationCoverage, UTILITIES } from '../../packages/domain/guidewords.js';
import { causeFamilyCoverage } from '../../packages/domain/causes.js';
import { canAdvance, NODE_REVIEW } from '../../packages/domain/status.js';
import { aiAvailable, proposeNodes } from '../ai.js';
import { runNodeAlerts } from '../../packages/chemical/alerts.js';

export function renderNodes() {
  const p = project();
  if (!p) return h('div', { class: 'page' }, emptyState('No project selected', 'Pick a project first.', null));

  const nodes = nodesSorted();
  const page = h('div', { class: 'page wide' });

  page.appendChild(
    h(
      'div',
      { class: 'page-head' },
      h('div', {}, h('div', { class: 'eyebrow', text: 'HAZOP node engine' }), h('h1', { class: 'page-title', text: 'Nodes' })),
      h('div', { class: 'page-actions' }, aiAvailable() ? h('button', { class: 'btn', text: 'Propose nodes from the process model', onclick: () => proposeDialog(p) }) : null, h('button', { class: 'btn primary', text: 'Add node', onclick: () => nodeDialog(p, null) }))
    )
  );
  page.appendChild(h('p', { class: 'page-sub', text: 'A node is a section of the process with one design intent. A proposed node cannot be worksheeted until the team approves it, and the deviations the worksheet offers come from the node\'s own facts — not from a template.' }));

  if (!nodes.length) {
    page.appendChild(emptyState('No nodes yet', 'Add nodes by hand, or let the model propose them from the process steps and equipment. Proposals always arrive as drafts for the team to approve, edit or delete.', h('div', { class: 'btn-row', style: { 'justify-content': 'center' } }, h('button', { class: 'btn primary', text: 'Add node', onclick: () => nodeDialog(p, null) }), aiAvailable() ? h('button', { class: 'btn', text: 'Propose from the process model', onclick: () => proposeDialog(p) }) : null)));
    return page;
  }

  page.appendChild(h('div', { class: 'grid c4' }, tile('Nodes', nodes.length), tile('Proposed', nodes.filter((n) => n.reviewStatus === 'PROPOSED').length, 'Awaiting team approval', nodes.some((n) => n.reviewStatus === 'PROPOSED') ? 'accent' : 'ok'), tile('Worksheeted', nodes.filter((n) => n.reviewStatus === 'WORKSHEETED' || n.reviewStatus === 'COMPLETE').length), tile('Complete', nodes.filter((n) => n.reviewStatus === 'COMPLETE').length)));

  const list = h('div', { class: 'stack', style: { 'margin-top': '12px' } });
  nodes.forEach((n, i) => list.appendChild(nodeCard(n, i, nodes)));
  page.appendChild(list);
  return page;
}

function nodeCard(n, i, all) {
  const scen = scenariosFor(n.id);
  const ctx = { equipment: scoped('equipment'), chemicals: chemicalsResolved(), chemProperties: scoped('chem_properties') };
  const cov = deviationCoverage(n, ctx, scen);
  const derived = deriveNodeFacts(n, ctx);
  const fam = causeFamilyCoverage(derived.facts, scen);
  const legal = legalLinksForNode(n.id);
  const alertsOut = runNodeAlerts({ node: n, equipment: scoped('equipment'), chemicals: chemicalsResolved(), chemProperties: scoped('chem_properties'), safeguards: scoped('safeguards') });

  const statusCls = { PROPOSED: 'missing', APPROVED: 'confirmed', WORKSHEETED: 'extracted', COMPLETE: 'verified' };

  return h(
    'div',
    { class: 'card' },
    h(
      'div',
      { class: 'between' },
      h(
        'div',
        { style: { 'min-width': '0' } },
        h('div', { class: 'row', style: { gap: '8px' } }, h('span', { class: 'mono', style: { color: 'var(--accent)', 'font-weight': '700' }, text: 'NODE ' + (n.nodeNumber || '?') }), h('span', { class: 'badge ' + (statusCls[n.reviewStatus] || 'missing'), text: n.reviewStatus }), n.proposedBy === 'AI' && n.reviewStatus === 'PROPOSED' ? h('span', { class: 'badge inferred', text: 'AI PROPOSED' }) : null),
        h('h3', { class: 'card-title', style: { 'margin-top': '3px' }, text: n.worksheetName || n.description || 'Untitled node' })
      ),
      h(
        'div',
        { class: 'btn-row' },
        i > 0 ? h('button', { class: 'btn sm ghost icon', text: '↑', title: 'Move up', onclick: () => reorder(all, i, -1) }) : null,
        i < all.length - 1 ? h('button', { class: 'btn sm ghost icon', text: '↓', title: 'Move down', onclick: () => reorder(all, i, 1) }) : null,
        n.reviewStatus === 'PROPOSED' ? h('button', { class: 'btn sm primary', text: 'Approve', onclick: () => advance(n, 'APPROVED') }) : null,
        h('button', { class: 'btn sm', text: 'Worksheet', onclick: () => go('hazop', { nodeId: n.id }) }),
        h('button', { class: 'btn sm ghost', text: 'Edit', onclick: () => nodeDialog(project(), n) })
      )
    ),
    n.designIntent ? h('p', { style: { margin: '4px 0 8px' }, text: n.designIntent }) : h('p', { class: 'note warn', style: { margin: '4px 0 8px' }, text: 'No design intent recorded. A deviation has nothing to deviate from until this is written — it is a blocking check on the report.' }),
    h(
      'div',
      { class: 'row', style: { gap: '6px', 'margin-bottom': '8px' } },
      chips((n.equipmentIds || []).map((id) => (equipById(id) || {}).tag).filter(Boolean)),
      (n.chemicalIds || []).length ? h('span', { class: 'muted small', text: '· ' + (n.chemicalIds || []).map((id) => (chemById(id) || {}).canonicalName).filter(Boolean).join(', ') }) : null,
      (n.utilities || []).length ? h('span', { class: 'muted small', text: '· utilities: ' + (n.utilities || []).map((u) => (UTILITIES.filter((x) => x.key === u)[0] || {}).label || u).join(', ') }) : null
    ),
    h(
      'div',
      { class: 'grid c4' },
      tile('Worksheet rows', scen.length, cov.total + ' meaningful deviations'),
      tile('Deviation coverage', cov.percent + '%', cov.uncovered.length + ' not yet addressed', cov.percent === 100 ? 'ok' : 'accent'),
      tile('Cause families', fam.percent + '%', fam.missing.length ? 'Not considered: ' + truncate(fam.labels.join(', '), 34) : 'All expected families considered', fam.missing.length ? 'accent' : 'ok'),
      tile('Hazard alerts', alertsOut.alerts.length, alertsOut.gaps.length + ' data gap(s)', alertsOut.alerts.some((a) => a.severity === 'CRITICAL') ? 'crit' : alertsOut.alerts.length ? 'alert' : 'ok')
    ),
    h('div', { class: 'btn-row', style: { 'margin-top': '10px' } }, h('button', { class: 'btn sm ghost', text: 'Legal / statutory relevance (' + legal.length + ')', onclick: () => legalPanel(n) }), h('button', { class: 'btn sm ghost', text: 'Deviation set (' + cov.total + ')', onclick: () => deviationPanel(n) }), n.reviewStatus !== 'PROPOSED' ? h('button', { class: 'btn sm ghost', text: 'Split node', onclick: () => splitNode(n) }) : null)
  );
}

async function reorder(all, i, dir) {
  const j = i + dir;
  if (j < 0 || j >= all.length) return;
  await S.store.update('nodes', all[i].id, { sortOrder: j }, { projectId: all[i].projectId });
  await S.store.update('nodes', all[j].id, { sortOrder: i }, { projectId: all[j].projectId });
  render();
}

async function advance(n, to) {
  const v = canAdvance(NODE_REVIEW, n.reviewStatus || 'PROPOSED', to);
  if (!v.ok) {
    toast('Cannot move from ' + n.reviewStatus + ' to ' + to + ': ' + v.reason.replace(/_/g, ' ').toLowerCase(), 'err');
    return;
  }
  if (to === 'APPROVED' && ['admin', 'facilitator'].indexOf(S.actor.role) === -1) {
    toast('Approving a node needs the facilitator role.', 'err');
    return;
  }
  await S.store.update('nodes', n.id, { reviewStatus: to, approvedBy: to === 'APPROVED' ? S.actor.id : n.approvedBy || null, approvedAt: to === 'APPROVED' ? nowIso() : n.approvedAt || null }, { projectId: n.projectId, field: 'reviewStatus', note: v.audit || null });
  toast('Node ' + n.nodeNumber + ' → ' + to, 'ok');
  render();
}

// -------------------------------------------------------------- node editor

function nodeDialog(p, n) {
  const g = (k, d) => (n && n[k] !== undefined && n[k] !== null ? n[k] : d === undefined ? '' : d);
  const number = input({ value: g('nodeNumber'), id: 'nd-num', placeholder: 'e.g. 01' });
  const name = input({ value: g('worksheetName'), id: 'nd-name', placeholder: 'e.g. Charging and melting' });
  const desc = textarea({ value: g('description'), rows: 3, id: 'nd-desc' });
  const intent = textarea({ value: g('designIntent'), rows: 4, id: 'nd-intent' });
  const bounds = input({ value: g('boundaries'), id: 'nd-bounds', placeholder: 'e.g. from the RM store to the blender inlet' });
  const opT = input({ type: 'number', step: 'any', value: g('operatingTemperature'), id: 'nd-opt' });
  const opTmax = input({ type: 'number', step: 'any', value: g('operatingTemperatureMax'), id: 'nd-optmax' });
  const opP = input({ type: 'number', step: 'any', value: g('operatingPressure'), id: 'nd-opp' });

  const equipment = scoped('equipment');
  const eqSel = h('select', { multiple: true, size: Math.min(8, Math.max(3, equipment.length)), id: 'nd-eq' });
  for (const e of equipment) {
    const o = h('option', { value: e.id, text: e.tag + (e.service ? ' — ' + e.service : '') });
    if ((g('equipmentIds', []) || []).indexOf(e.id) !== -1) o.selected = true;
    eqSel.appendChild(o);
  }
  const chems = scoped('chemicals');
  const chSel = h('select', { multiple: true, size: Math.min(8, Math.max(3, chems.length)), id: 'nd-ch' });
  for (const c of chems) {
    const o = h('option', { value: c.id, text: c.canonicalName });
    if ((g('chemicalIds', []) || []).indexOf(c.id) !== -1) o.selected = true;
    chSel.appendChild(o);
  }
  const utilSet = new Set(g('utilities', []) || []);
  const utilRow = h('div', { class: 'row', style: { gap: '5px' } });
  const projectUtils = (p.utilities || []).length ? UTILITIES.filter((u) => (p.utilities || []).indexOf(u.key) !== -1) : UTILITIES;
  for (const u of projectUtils) {
    const b = h('button', { type: 'button', class: 'pill' + (utilSet.has(u.key) ? ' on' : ''), text: u.label, onclick: () => { if (utilSet.has(u.key)) utilSet.delete(u.key); else utilSet.add(u.key); b.className = 'pill' + (utilSet.has(u.key) ? ' on' : ''); } });
    utilRow.appendChild(b);
  }

  const flags = {};
  const flagDefs = [
    ['hasCharging', 'Charging step'],
    ['hasTransfer', 'Transfer / flow path'],
    ['hasDischarge', 'Discharge step'],
    ['hasSampling', 'Sampling step'],
    ['hasTimedStep', 'Time-controlled step'],
    ['isReactionStep', 'Reaction step'],
    ['exothermic', 'Exothermic'],
    ['phControlled', 'pH controlled'],
    ['manualOperation', 'Manual operation'],
    ['viscousService', 'Viscous service'],
  ];
  const flagGrid = h('div', { class: 'grid c2' });
  for (const [key, label] of flagDefs) {
    const cb = h('input', { type: 'checkbox', id: 'nd-' + key, checked: !!(n && n[key]) });
    flags[key] = cb;
    flagGrid.appendChild(h('label', { class: 'field inline' }, cb, h('span', { text: label })));
  }

  const instruments = input({ value: (n && (n.instruments || []).join(', ')) || '', id: 'nd-inst' });
  const alarms = input({ value: (n && (n.alarms || []).join(', ')) || '', id: 'nd-alarm' });
  const trips = input({ value: (n && (n.trips || []).join(', ')) || '', id: 'nd-trip' });
  const reliefs = input({ value: (n && (n.reliefs || []).join(', ')) || '', id: 'nd-relief' });

  const body = h(
    'div',
    {},
    h('div', { class: 'grid c2' }, field('Node number', number), field('Worksheet name', name)),
    field('Description', desc),
    field('Design intent', intent, 'How the plant intends this section to operate. This is what the deviations deviate from.'),
    field('Boundaries', bounds),
    h('div', { class: 'grid c3' }, field('Operating temperature (°C)', opT), field('Maximum operating temperature (°C)', opTmax, 'Used for the flash-point and decomposition margins.'), field('Operating pressure', opP)),
    h('div', { class: 'section-rule' }, h('h2', { text: 'Scope' })),
    h('div', { class: 'grid c2' }, field('Equipment covered', eqSel, 'Ctrl/Cmd-click for several.'), field('Chemicals present', chSel)),
    h('div', { class: 'field' }, h('span', { text: 'Utilities on this node' }), utilRow, h('div', { class: 'field-hint', text: 'Each utility selected produces its own failure row in the worksheet, because "utility failure" as one row hides which consequence follows.' })),
    h('div', { class: 'section-rule' }, h('h2', { text: 'Node characteristics' })),
    h('p', { class: 'card-note', text: 'These decide which guideword / parameter pairs the engine treats as meaningful for this node.' }),
    flagGrid,
    h('div', { class: 'section-rule' }, h('h2', { text: 'Protection' })),
    h('div', { class: 'grid c2' }, field('Instruments', instruments), field('Alarms', alarms), field('Trips / interlocks', trips), field('Relief systems', reliefs))
  );

  drawer(n ? 'Edit node ' + (n.nodeNumber || '') : 'Add node', body, [
    n ? h('button', { class: 'btn danger', text: 'Delete node', onclick: async () => { const rowsN = scenariosFor(n.id); const ok = await confirmAction('Delete node ' + n.nodeNumber + '?', rowsN.length ? rowsN.length + ' worksheet row(s) on this node are deleted too.' : 'The node has no worksheet rows.'); if (!ok) return; for (const s of rowsN) await S.store.remove('scenarios', s.id, { projectId: n.projectId }); await S.store.remove('nodes', n.id, { projectId: n.projectId }); closeDrawer(); toast('Node deleted'); render(); } }) : null,
    h('button', { class: 'btn', text: 'Cancel', onclick: closeDrawer }),
    h('button', {
      class: 'btn primary',
      text: 'Save',
      onclick: async () => {
        const rec = {
          projectId: p.id,
          nodeNumber: number.value.trim() || String(scoped('nodes').length + 1).padStart(2, '0'),
          worksheetName: name.value.trim(),
          description: desc.value.trim(),
          designIntent: intent.value.trim(),
          boundaries: bounds.value.trim(),
          operatingTemperature: opT.value === '' ? null : Number(opT.value),
          operatingTemperatureMax: opTmax.value === '' ? null : Number(opTmax.value),
          operatingTemperatureUnit: 'C',
          operatingPressure: opP.value === '' ? null : Number(opP.value),
          equipmentIds: Array.from(eqSel.selectedOptions).map((o) => o.value),
          chemicalIds: Array.from(chSel.selectedOptions).map((o) => o.value),
          utilities: Array.from(utilSet),
          instruments: splitNodeList(instruments.value),
          alarms: splitNodeList(alarms.value),
          trips: splitNodeList(trips.value),
          reliefs: splitNodeList(reliefs.value),
        };
        for (const [key] of flagDefs) rec[key] = flags[key].checked;
        if (n) await S.store.update('nodes', n.id, rec, { projectId: p.id });
        else await S.store.create('nodes', Object.assign(rec, { reviewStatus: 'APPROVED', sortOrder: scoped('nodes').length, approvedBy: S.actor.id, approvedAt: nowIso() }), { projectId: p.id });
        closeDrawer();
        toast('Node saved', 'ok');
        render();
      },
    }),
  ]);
}

function splitNodeList(v) {
  return String(v || '').split(',').map((s) => s.trim()).filter(Boolean);
}

// ----------------------------------------------------------- deviation panel

function deviationPanel(n) {
  const ctx = { equipment: scoped('equipment'), chemicals: chemicalsResolved(), chemProperties: scoped('chem_properties') };
  const gen = generateDeviations(n, ctx);
  const existing = scenariosFor(n.id);
  const covered = new Set(existing.map((s) => s.parameter + '|' + s.guideword));

  const body = h('div', { class: 'stack' });
  body.appendChild(
    h('div', { class: 'note' }, h('strong', { text: gen.combinations.length + ' meaningful deviations' }), ' from a possible cross-product of ' + gen.counts.crossProduct + '. ' + gen.suppressed.length + ' parameter(s) were suppressed because this node does not have them. Every row below states the node fact that justifies it.')
  );

  const groups = new Map();
  for (const c of gen.combinations) {
    if (!groups.has(c.group)) groups.set(c.group, []);
    groups.get(c.group).push(c);
  }
  for (const [group, items] of groups) {
    body.appendChild(h('div', { class: 'section-rule' }, h('h2', { text: group })));
    const rows = items.map((c) =>
      h(
        'tr',
        {},
        h('td', { class: 'mono small', text: c.guidewordLabel }),
        h('td', { text: c.parameterLabel }),
        h('td', { style: { 'font-weight': '500' }, text: c.deviation }),
        h('td', { class: 'small muted', text: (c.rationale || []).join('; ') }),
        h('td', {}, covered.has(c.parameter + '|' + c.guideword) ? h('span', { class: 'badge verified', text: 'ON SHEET' }) : h('span', { class: 'badge missing', text: 'NOT ADDRESSED' }))
      )
    );
    body.appendChild(h('div', { class: 'table-wrap', style: { 'max-height': 'none' } }, h('table', {}, h('thead', {}, h('tr', {}, h('th', { text: 'Guideword' }), h('th', { text: 'Parameter' }), h('th', { text: 'Deviation' }), h('th', { text: 'Why it is meaningful here' }), h('th', { text: 'Status' }))), h('tbody', {}, rows))));
  }

  if (gen.suppressed.length) {
    body.appendChild(h('div', { class: 'section-rule' }, h('h2', { text: 'Suppressed (' + gen.suppressed.length + ')' })));
    body.appendChild(h('p', { class: 'card-note', text: 'These parameters are not present in this node. Give the node the characteristic, or add the equipment or utility, and the deviation appears.' }));
    body.appendChild(h('ul', { class: 'list-compact' }, gen.suppressed.map((s) => h('li', {}, h('strong', { text: s.parameterLabel }), h('span', { class: 'muted small', text: ' — needs: ' + s.unmetFacts.join(', ') })))));
  }

  drawer('Node ' + n.nodeNumber + ' — deviation set', body, [h('button', { class: 'btn primary', text: 'Open the worksheet', onclick: () => { closeDrawer(); go('hazop', { nodeId: n.id }); } }), h('button', { class: 'btn', text: 'Close', onclick: closeDrawer })]);
}

// --------------------------------------------------------------- legal panel

export function legalPanel(n) {
  const links = legalLinksForNode(n.id);
  const conditions = scoped('permit_conditions').filter((c) => {
    const eqTags = (n.equipmentIds || []).map((id) => (equipById(id) || {}).tag).filter(Boolean);
    const chemNames = (n.chemicalIds || []).map((id) => (chemById(id) || {}).canonicalName).filter(Boolean);
    const text = String(c.text || '').toLowerCase();
    return eqTags.concat(chemNames).some((t) => text.indexOf(String(t).toLowerCase()) !== -1) || (c.nodeIds || []).indexOf(n.id) !== -1;
  });

  const body = h('div', { class: 'stack' });
  body.appendChild(h('p', { class: 'card-note', text: 'Only obligations that genuinely touch this node are listed. A citation is never forced onto a worksheet row.' }));

  if (!links.length && !conditions.length) {
    body.appendChild(h('div', { class: 'empty' }, h('h3', { text: 'Nothing linked to this node' }), h('p', { text: 'A link is created by a threshold crossing on a chemical in the node, an equipment class the obligation addresses, a permit condition that names this equipment or chemical, or a manual link.' })));
  }

  for (const l of links) {
    const rec = l.record;
    body.appendChild(
      h(
        'div',
        { class: 'card' },
        h('div', { class: 'between' }, h('div', { class: 'row', style: { gap: '6px' } }, applicBadge(rec.effectiveStatus), h('span', { class: 'tag', text: rec.domain || '' }), l.manual ? h('span', { class: 'badge', text: 'MANUAL' }) : null), h('span', { class: 'muted small', text: rec.authority || '' })),
        h('h3', { class: 'card-title', style: { 'margin-top': '5px' }, text: rec.instrumentTitle }),
        h('div', { class: 'small muted', text: rec.sectionRuleSchedule }),
        h('p', { style: { margin: '6px 0 4px', 'font-weight': '500' }, text: rec.topic }),
        h('div', { class: 'note plain small' }, h('strong', { text: 'Why this node: ' }), l.link.detail),
        rec.evidenceExpected && rec.evidenceExpected.length ? h('div', { style: { 'margin-top': '7px' } }, h('div', { class: 'tile-label', text: 'Evidence expected' }), h('ul', { class: 'list-compact small' }, rec.evidenceExpected.map((e) => h('li', {}, e, (rec.evidence || []).some((x) => x.expects === e) ? h('span', { class: 'badge verified', style: { 'margin-left': '5px' }, text: 'HELD' }) : h('span', { class: 'badge missing', style: { 'margin-left': '5px' }, text: 'MISSING' }))))) : null,
        h('div', { class: 'btn-row', style: { 'margin-top': '8px' } }, h('button', { class: 'btn sm ghost', text: 'Open in the register', onclick: () => { closeDrawer(); go('legal'); } }))
      )
    );
  }

  if (conditions.length) {
    body.appendChild(h('div', { class: 'section-rule' }, h('h2', { text: 'Licence / consent conditions naming this node' })));
    for (const c of conditions) {
      const permit = scoped('permits').filter((x) => x.id === c.permitId)[0];
      body.appendChild(
        h(
          'div',
          { class: 'card' },
          h('div', { class: 'row', style: { gap: '6px' } }, h('span', { class: 'tag', text: c.conditionNumber || '—' }), h('span', { class: 'muted small', text: permit ? (permit.permitType || '') + ' ' + (permit.number || '') : '' }), c.category ? h('span', { class: 'pill', text: c.category }) : null),
          h('p', { style: { margin: '6px 0', 'font-style': 'italic' }, text: '“' + c.text + '”' }),
          c.analysis ? h('div', { class: 'note plain small' }, h('strong', { text: 'Analysis (not the document\'s words): ' }), c.analysis) : null
        )
      );
    }
  }

  body.appendChild(h('div', { class: 'section-rule' }, h('h2', { text: 'Add a manual link' })));
  const reg = complianceRegister();
  const sel = select([{ value: '', label: '— choose an obligation —' }].concat(reg.map((r) => ({ value: r.obligationId, label: truncate(r.instrumentTitle + ' — ' + r.topic, 90) }))), '', { id: 'lp-sel' });
  const note = input({ id: 'lp-note', placeholder: 'Why does this obligation touch this node?' });
  body.appendChild(h('div', {}, field('Obligation', sel), field('Reason', note), h('button', {
    class: 'btn sm primary',
    text: 'Link',
    onclick: async () => {
      if (!sel.value) return;
      await S.store.create('legal_node_links', { projectId: n.projectId, nodeId: n.id, obligationId: sel.value, note: note.value.trim() || 'Linked manually.', createdBy: S.actor.id }, { projectId: n.projectId });
      closeDrawer();
      toast('Linked', 'ok');
      render();
    },
  })));

  drawer('Node ' + n.nodeNumber + ' — legal / statutory relevance', body, [h('button', { class: 'btn', text: 'Close', onclick: closeDrawer })]);
}

// ---------------------------------------------------------------- proposals

function proposeDialog(p) {
  const steps = scoped('process_steps').length;
  const eq = scoped('equipment').length;
  const body = h(
    'div',
    { class: 'stack' },
    h('p', { text: 'The model reads the ' + steps + ' process step(s) and ' + eq + ' equipment item(s) recorded on this project and proposes node boundaries with a design intent for each.' }),
    h('div', { class: 'note plain' }, 'Proposals arrive as ', h('strong', { text: 'PROPOSED' }), ' drafts. Nothing is worksheeted until the team approves it, and any equipment tag the model names that does not exist is reported rather than created.'),
    steps === 0 && eq === 0 ? h('div', { class: 'note warn', text: 'There are no process steps and no equipment recorded, so there is nothing to propose from. Add them first, or extract them from a registered BMR or equipment list.' }) : null,
    h('div', { class: 'status-line' })
  );
  const status = body.querySelector('.status-line');

  drawer('Propose nodes', body, [
    h('button', { class: 'btn', text: 'Cancel', onclick: closeDrawer }),
    h('button', {
      class: 'btn primary',
      text: 'Propose',
      disabled: steps === 0 && eq === 0,
      onclick: async (e) => {
        const btn = e.target;
        btn.disabled = true;
        status.textContent = '';
        status.appendChild(h('span', { class: 'spin' }));
        status.appendChild(h('span', { text: ' Thinking — this takes up to a minute.' }));
        try {
          const out = await proposeNodes();
          closeDrawer();
          reviewProposals(p, out);
        } catch (err) {
          status.textContent = '';
          toast('Proposal failed: ' + ((err && err.message) || 'unknown error'), 'err');
          btn.disabled = false;
        }
      },
    }),
  ]);
}

function reviewProposals(p, out) {
  const chosen = new Set(out.nodes.map((_, i) => i));
  const body = h('div', { class: 'stack' });
  body.appendChild(h('p', { class: 'card-note', text: out.nodes.length + ' node(s) proposed. Deselect anything you do not want. Each will be created as PROPOSED for the team to approve.' }));
  if (out.envelope && (out.envelope.missing_data || []).length) {
    body.appendChild(h('div', { class: 'note warn' }, h('strong', { text: 'The model reported missing data: ' }), (out.envelope.missing_data || []).join('; ')));
  }

  out.nodes.forEach((n, i) => {
    const cb = h('input', { type: 'checkbox', checked: true, id: 'np-' + i, onchange: (e) => { if (e.target.checked) chosen.add(i); else chosen.delete(i); } });
    body.appendChild(
      h(
        'div',
        { class: 'card' },
        h('label', { class: 'row', style: { gap: '8px', 'align-items': 'flex-start' } }, cb, h('div', { style: { flex: '1' } }, h('strong', { text: 'Node ' + (n.nodeNumber || i + 1) + ' — ' + (n.worksheetName || '') }), h('p', { style: { margin: '3px 0' }, text: n.designIntent }), h('div', { class: 'row', style: { gap: '5px' } }, chips((n.equipmentIds || []).map((id) => (equipById(id) || {}).tag).filter(Boolean))), n.unknownTags && n.unknownTags.length ? h('div', { class: 'note warn small', style: { 'margin-top': '5px' } }, 'Named equipment that does not exist in the project: ' + n.unknownTags.join(', ') + '. These were not created.') : null, n.rationale ? h('div', { class: 'muted small', style: { 'margin-top': '4px' }, text: n.rationale }) : null))
      )
    );
  });

  drawer('Review proposed nodes', body, [
    h('button', { class: 'btn', text: 'Discard', onclick: closeDrawer }),
    h('button', {
      class: 'btn primary',
      text: 'Create selected',
      onclick: async () => {
        let base = scoped('nodes').length;
        let made = 0;
        for (let i = 0; i < out.nodes.length; i += 1) {
          if (!chosen.has(i)) continue;
          const n = out.nodes[i];
          await S.store.create('nodes', Object.assign({}, n, { projectId: p.id, nodeNumber: n.nodeNumber || String(base + made + 1).padStart(2, '0'), sortOrder: base + made, aiRunId: out.runId, unknownTags: undefined }), { projectId: p.id, actorKind: 'ai', aiRunId: out.runId });
          made += 1;
        }
        closeDrawer();
        toast(made + ' node(s) created as PROPOSED', 'ok');
        render();
      },
    }),
  ]);
}

function splitNode(n) {
  const name = input({ id: 'sn-name', placeholder: 'Name for the new node' });
  const body = h('div', {}, h('p', { class: 'card-note', text: 'Creates a second node that inherits this node\'s document references, equipment, chemicals and assumptions. Existing worksheet rows stay on the original node; move them from the worksheet.' }), field('New node name', name));
  drawer('Split node ' + n.nodeNumber, body, [
    h('button', { class: 'btn', text: 'Cancel', onclick: closeDrawer }),
    h('button', {
      class: 'btn primary',
      text: 'Split',
      onclick: async () => {
        const all = nodesSorted();
        const rec = Object.assign({}, n);
        delete rec.id;
        delete rec.createdAt;
        delete rec.rev;
        await S.store.create('nodes', Object.assign(rec, { nodeNumber: n.nodeNumber + 'A', worksheetName: name.value.trim() || (n.worksheetName || '') + ' (split)', sortOrder: (n.sortOrder || 0) + 0.5, splitFrom: n.id, reviewStatus: 'PROPOSED' }), { projectId: n.projectId, note: 'Split from node ' + n.nodeNumber });
        // Re-number the sort order so the new node sits next to its parent.
        const fresh = nodesSorted();
        for (let i = 0; i < fresh.length; i += 1) if (fresh[i].sortOrder !== i) await S.store.update('nodes', fresh[i].id, { sortOrder: i }, { projectId: n.projectId });
        closeDrawer();
        toast('Node split — the new node is PROPOSED', 'ok');
        render();
      },
    }),
  ]);
}

export { nodeDialog };
