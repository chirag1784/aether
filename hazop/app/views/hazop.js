// app/views/hazop.js — the worksheet grid.
//
// Spreadsheet-like editing, sticky headers, row expansion, an evidence drawer,
// risk badges, a legal-relevance badge, filters and keyboard-friendly edits.
// Every risk value on screen comes from riskFromLS(); nothing is stored that
// the engine did not produce.

import { h, field, input, select, textarea, toast, drawer, closeDrawer, confirmAction, emptyState, sectionRule, riskBadge, statusBadge, truncate, tile, chips, nowIso, uid, clear } from '../util.js';
import { S, go, render, project, scoped, nodesSorted, scenariosFor, nodeById, equipById, chemById, matrix, legalLinksForNode, chemicalsResolved, scenariosWithRisk } from '../state.js';
import { riskFromLS, tryRiskFromLS, validateResidual, RESIDUAL_BASIS_KINDS, riskMagnitude } from '../../packages/calculations/risk.js';
import { generateDeviations } from '../../packages/domain/guidewords.js';
import { CAUSE_FAMILIES, CONSEQUENCE_FAMILIES, SAFEGUARD_CLASSES, consequenceCreditsSafeguard, classifyCause, classifyConsequence, classifySafeguard, severityDimensions } from '../../packages/domain/causes.js';
import { SCENARIO_REVIEW, canAdvance } from '../../packages/domain/status.js';
import { aiAvailable, draftScenarios, draftRecommendations } from '../ai.js';
import { CONTROL_LEVELS } from '../../packages/calculations/dedup.js';
import { legalPanel } from './nodes.js';

export function renderHazop() {
  const p = project();
  if (!p) return h('div', { class: 'page' }, emptyState('No project selected', 'Pick a project first.', null));

  const nodes = nodesSorted();
  if (!nodes.length) {
    return h('div', { class: 'page' }, emptyState('No nodes yet', 'The worksheet is organised by node. Create a node first.', h('button', { class: 'btn primary', text: 'Go to nodes', onclick: () => go('nodes') })));
  }

  const nodeId = S.selection.nodeId && nodeById(S.selection.nodeId) ? S.selection.nodeId : nodes[0].id;
  S.selection.nodeId = nodeId;
  const node = nodeById(nodeId);
  const m = matrix();
  const page = h('div', { class: 'page wide' });

  page.appendChild(
    h(
      'div',
      { class: 'page-head' },
      h('div', {}, h('div', { class: 'eyebrow', text: 'HAZOP worksheet · ' + (m.name || m.id) + ' v' + m.version }), h('h1', { class: 'page-title', text: 'Node ' + (node.nodeNumber || '') + ' — ' + (node.worksheetName || 'Worksheet') })),
      h(
        'div',
        { class: 'page-actions' },
        h('button', { class: 'btn', text: 'Add row', onclick: () => addRowDialog(node) }),
        aiAvailable() ? h('button', { class: 'btn', text: 'Draft the uncovered rows', onclick: () => draftDialog(node) }) : null,
        h('button', { class: 'btn ghost', text: 'Legal relevance', onclick: () => legalPanel(node) })
      )
    )
  );

  // node switcher
  const tabs = h('div', { class: 'tabs' });
  for (const n of nodes) {
    tabs.appendChild(h('button', { class: 'tab', 'aria-selected': String(n.id === nodeId), text: 'Node ' + (n.nodeNumber || '?'), title: n.worksheetName || '', onclick: () => go('hazop', { nodeId: n.id }) }));
  }
  page.appendChild(tabs);

  if (node.reviewStatus === 'PROPOSED') {
    page.appendChild(h('div', { class: 'note warn', style: { 'margin-bottom': '12px' } }, h('strong', { text: 'This node is still PROPOSED. ' }), 'Approve it on the nodes page before the team works the sheet, so the report can show who approved the node boundaries.', h('div', { class: 'btn-row', style: { 'margin-top': '6px' } }, h('button', { class: 'btn sm', text: 'Go to nodes', onclick: () => go('nodes') }))));
  }

  page.appendChild(
    h('div', { class: 'card', style: { 'margin-bottom': '12px' } }, h('div', { class: 'tile-label', text: 'Design intent' }), h('p', { style: { margin: '3px 0 0' }, text: node.designIntent || 'Not recorded.' }), h('div', { class: 'row', style: { gap: '6px', 'margin-top': '8px' } }, chips((node.equipmentIds || []).map((id) => (equipById(id) || {}).tag).filter(Boolean)), node.operatingTemperature !== null && node.operatingTemperature !== undefined ? h('span', { class: 'tag', text: 'Op T ' + node.operatingTemperature + ' °C' }) : null, node.operatingTemperatureMax ? h('span', { class: 'tag', text: 'Max T ' + node.operatingTemperatureMax + ' °C' }) : null))
  );

  const all = scenariosFor(nodeId).map((s) => decorate(s, m));
  page.appendChild(filterBar(all));
  const rowsShown = applyFilters(all);

  if (!all.length) {
    page.appendChild(emptyState('No rows on this node', 'Add a row from the node\'s meaningful deviation set, or let the model draft the uncovered ones for the team to review.', h('div', { class: 'btn-row', style: { 'justify-content': 'center' } }, h('button', { class: 'btn primary', text: 'Add row', onclick: () => addRowDialog(node) }), aiAvailable() ? h('button', { class: 'btn', text: 'Draft the uncovered rows', onclick: () => draftDialog(node) }) : null)));
    return page;
  }

  page.appendChild(grid(node, rowsShown, m));
  page.appendChild(h('p', { class: 'muted small', style: { 'margin-top': '8px' }, text: 'Showing ' + rowsShown.length + ' of ' + all.length + ' row(s). Click a cell to edit; Tab moves on. Click the row number to open evidence, sources and the full row.' }));
  return page;
}

function decorate(s, m) {
  let initial;
  let residual;
  try {
    initial = riskFromLS(m, s.initialLikelihood, s.initialSeverity);
  } catch (e) {
    initial = { ok: false, reason: 'OFF_SCALE' };
  }
  try {
    residual = riskFromLS(m, s.residualLikelihood, s.residualSeverity);
  } catch (e) {
    residual = { ok: false, reason: 'OFF_SCALE' };
  }
  return Object.assign({}, s, { initial, residual });
}

// ------------------------------------------------------------------- filters

function filterBar(all) {
  const f = S.filters;
  const bar = h('div', { class: 'filters' });
  bar.appendChild(h('label', { text: 'Filter' }));
  bar.appendChild(
    select(
      [{ value: '', label: 'All rows' }, { value: 'HIGH', label: 'Top two risk bands' }, { value: 'UNRATED', label: 'Not rated' }, { value: 'NO_REC', label: 'High risk with no action' }, { value: 'DRAFT', label: 'Drafts' }, { value: 'AI', label: 'AI drafted' }, { value: 'NMD', label: 'No meaningful deviation' }],
      f.hazop || '',
      { onchange: (e) => { S.filters.hazop = e.target.value; render(); } }
    )
  );
  bar.appendChild(h('label', { text: 'Parameter' }));
  const params = Array.from(new Set(all.map((s) => s.parameterLabel || s.parameter))).sort();
  bar.appendChild(select([{ value: '', label: 'Any' }].concat(params.map((x) => ({ value: x, label: x }))), f.hazopParam || '', { onchange: (e) => { S.filters.hazopParam = e.target.value; render(); } }));
  bar.appendChild(h('label', { text: 'Search' }));
  bar.appendChild(input({ value: f.hazopQ || '', placeholder: 'cause, consequence, safeguard…', oninput: (e) => { S.filters.hazopQ = e.target.value; render(); } }));
  if (f.hazop || f.hazopParam || f.hazopQ) bar.appendChild(h('button', { class: 'btn sm ghost', text: 'Clear', onclick: () => { S.filters.hazop = ''; S.filters.hazopParam = ''; S.filters.hazopQ = ''; render(); } }));
  return bar;
}

function applyFilters(all) {
  const f = S.filters;
  const m = matrix();
  let out = all;
  if (f.hazop === 'HIGH') {
    const top = m.bands.slice(-2).map((b) => b.key);
    out = out.filter((s) => s.initial.ok && top.indexOf(s.initial.bandKey) !== -1);
  } else if (f.hazop === 'UNRATED') out = out.filter((s) => !s.noMeaningfulDeviation && !s.initial.ok);
  else if (f.hazop === 'NO_REC') {
    const top = m.bands.slice(-2).map((b) => b.key);
    out = out.filter((s) => s.initial.ok && top.indexOf(s.initial.bandKey) !== -1 && !scoped('recommendations').some((r) => r.scenarioId === s.id) && !(s.acceptanceRationale || '').trim());
  } else if (f.hazop === 'DRAFT') out = out.filter((s) => (s.reviewerStatus || 'DRAFT') === 'DRAFT');
  else if (f.hazop === 'AI') out = out.filter((s) => s.aiDrafted);
  else if (f.hazop === 'NMD') out = out.filter((s) => s.noMeaningfulDeviation);

  if (f.hazopParam) out = out.filter((s) => (s.parameterLabel || s.parameter) === f.hazopParam);
  if (f.hazopQ) {
    const q = String(f.hazopQ).toLowerCase();
    out = out.filter((s) => {
      const hay = [s.deviation, (s.causes || []).map((c) => c.text).join(' '), (s.consequences || []).map((c) => c.text).join(' '), (s.existingSafeguards || []).map((c) => c.text).join(' ')].join(' ').toLowerCase();
      return hay.indexOf(q) !== -1;
    });
  }
  return out;
}

// ---------------------------------------------------------------- the grid

function grid(node, list, m) {
  const head = [
    { label: '#', width: '42px', cls: 'num' },
    { label: 'Parameter', width: '104px' },
    { label: 'Guideword', width: '92px' },
    { label: 'Deviation', width: '150px' },
    { label: 'Causes', width: '190px' },
    { label: 'Consequences', width: '190px' },
    { label: 'Existing safeguards', width: '190px' },
    { label: 'L', width: '38px', cls: 'num' },
    { label: 'S', width: '38px', cls: 'num' },
    { label: 'Risk', width: '96px' },
    { label: 'Recommendations', width: '190px' },
    { label: 'L', width: '38px', cls: 'num' },
    { label: 'S', width: '38px', cls: 'num' },
    { label: 'Residual', width: '96px' },
    { label: 'Status', width: '104px' },
  ];

  const tbody = h('tbody', {});
  const legal = legalLinksForNode(node.id);

  for (const s of list) {
    const recs = scoped('recommendations').filter((r) => r.scenarioId === s.id);
    const expanded = S.selection.expandedRow === s.id;

    const tr = h('tr', { class: expanded ? 'expanded' : '' });
    tr.appendChild(
      h(
        'td',
        { class: 'num' },
        h('button', { class: 'btn sm ghost', style: { padding: '1px 4px' }, text: String(s.rowNumber || '·'), title: 'Open the full row, evidence and sources', onclick: () => { S.selection.expandedRow = expanded ? null : s.id; render(); } }),
        legal.length ? h('div', { title: legal.length + ' legal obligation(s) relevant to this node', style: { 'font-size': '9px', color: 'var(--ochre)', 'text-align': 'center' }, text: '§' }) : null
      )
    );
    tr.appendChild(h('td', { class: 'small', text: s.parameterLabel || s.parameter }));
    tr.appendChild(h('td', { class: 'mono small', text: s.guidewordLabel || s.guideword }));
    tr.appendChild(h('td', {}, h('div', { style: { 'font-weight': '500' }, text: s.deviation }), s.noMeaningfulDeviation ? h('span', { class: 'badge na', text: 'NO MEANINGFUL DEVIATION' }) : null));

    if (s.noMeaningfulDeviation) {
      tr.appendChild(h('td', { colspan: 10, class: 'small muted', text: s.noMeaningfulReason || 'Recorded as having no meaningful deviation.' }));
    } else {
      tr.appendChild(listCell(s, 'causes', CAUSE_FAMILIES));
      tr.appendChild(listCell(s, 'consequences', CONSEQUENCE_FAMILIES));
      tr.appendChild(listCell(s, 'existingSafeguards', SAFEGUARD_CLASSES));
      tr.appendChild(ratingCell(s, 'initialLikelihood', m.likelihoodScale));
      tr.appendChild(ratingCell(s, 'initialSeverity', m.severityScale));
      tr.appendChild(h('td', {}, riskBadge(s.initial), s.initial.ok && s.initial.action ? h('div', { class: 'muted', style: { 'font-size': '9.5px' }, text: s.initial.action.replace(/_/g, ' ').toLowerCase() }) : null));
      tr.appendChild(
        h(
          'td',
          {},
          recs.length
            ? h('ul', { class: 'list-compact small' }, recs.map((r) => h('li', {}, h('span', { class: 'mono', text: r.recId || '—' }), ' ', truncate(r.text, 64))))
            : h('span', { class: 'muted small', text: '—' }),
          h('div', { class: 'btn-row', style: { 'margin-top': '3px' } }, h('button', { class: 'btn sm ghost', style: { padding: '1px 5px' }, text: '+ Rec', onclick: () => recDialog(s, null) }), aiAvailable() && !recs.length ? h('button', { class: 'btn sm ghost', style: { padding: '1px 5px' }, text: 'Draft', onclick: () => draftRecsFor(s) }) : null)
        )
      );
      tr.appendChild(ratingCell(s, 'residualLikelihood', m.likelihoodScale));
      tr.appendChild(ratingCell(s, 'residualSeverity', m.severityScale));
      tr.appendChild(h('td', {}, riskBadge(s.residual), s.residualBasisKind ? h('div', { class: 'muted', style: { 'font-size': '9.5px' }, text: s.residualBasisKind.replace(/_/g, ' ').toLowerCase() }) : s.residual.ok && riskMagnitude(s.residual) < riskMagnitude(s.initial) ? h('span', { class: 'badge conflict', text: 'NO BASIS' }) : null));
      tr.appendChild(h('td', {}, statusSelect(s)));
    }
    tbody.appendChild(tr);

    if (expanded) tbody.appendChild(h('tr', { class: 't-detail' }, h('td', { colspan: head.length }, detailPanel(node, s, m))));
  }

  return h('div', { class: 'table-wrap' }, h('table', { class: 'wide-grid' }, h('thead', {}, h('tr', {}, head.map((c) => h('th', { class: c.cls || '', style: { width: c.width }, text: c.label }))), h('tr', {}, h('th', { colspan: 7, class: 'small', style: { 'text-transform': 'none', 'letter-spacing': '0' }, text: 'Consequences are recorded before credit for safeguards' }), h('th', { colspan: 3, class: 'small', style: { 'text-transform': 'none', 'letter-spacing': '0' }, text: 'Initial risk' }), h('th', { colspan: 5, class: 'small', style: { 'text-transform': 'none', 'letter-spacing': '0' }, text: 'After the recommendations' }))), tbody));
}

function listCell(s, key, families) {
  const items = s[key] || [];
  const cell = h('td', {});
  if (!items.length) cell.appendChild(h('span', { class: 'muted small', text: '—' }));
  else {
    cell.appendChild(
      h(
        'ul',
        { class: 'list-compact small' },
        items.map((it) => {
          const fam = families.filter((f) => f.key === it.family)[0];
          return h('li', { title: fam ? fam.label : '' }, it.text, it.safeguardCreditFlag ? h('span', { class: 'badge conflict', style: { 'margin-left': '4px' }, text: 'SAFEGUARD CREDITED' }) : null);
        })
      )
    );
  }
  cell.appendChild(h('button', { class: 'btn sm ghost', style: { padding: '1px 5px', 'margin-top': '2px' }, text: '+', title: 'Add', onclick: () => listDialog(s, key, families) }));
  return cell;
}

function ratingCell(s, key, scale) {
  const cur = s[key];
  const sel = h('select', { class: 'cell-edit', style: { 'font-family': 'var(--mono)', width: '34px' } });
  sel.appendChild(h('option', { value: '', text: '–' }));
  for (const item of scale) {
    const o = h('option', { value: item.value, text: String(item.value), title: item.label });
    if (String(cur) === String(item.value)) o.selected = true;
    sel.appendChild(o);
  }
  sel.addEventListener('change', async () => {
    const v = sel.value === '' ? null : Number(sel.value);
    await saveRating(s, key, v);
  });
  const td = h('td', { class: 'num' }, sel);
  const item = scale.filter((x) => String(x.value) === String(cur))[0];
  if (item) td.title = item.label + (item.people ? ' — ' + item.people : '');
  return td;
}

async function saveRating(s, key, v) {
  const m = matrix();
  const next = Object.assign({}, s);
  next[key] = v;

  // A residual entry must pass the basis guard before it is stored.
  if (key.indexOf('residual') === 0) {
    const check = validateResidual({
      matrix: m,
      initial: { likelihood: next.initialLikelihood, severity: next.initialSeverity },
      residual: { likelihood: next.residualLikelihood, severity: next.residualSeverity },
      basis: next.residualBasisKind ? { kind: next.residualBasisKind, text: next.residualBasisText } : null,
    });
    if (!check.ok) {
      residualBasisDialog(s, key, v, check);
      return;
    }
  }

  const patch = {};
  patch[key] = v;
  const initial = tryRiskFromLS(m, next.initialLikelihood, next.initialSeverity);
  const residual = tryRiskFromLS(m, next.residualLikelihood, next.residualSeverity);
  patch.initialRisk = initial.ok ? initial : null;
  patch.residualRisk = residual.ok ? residual : null;
  patch.severityDimensions = severityDimensions(next.consequences);
  await S.store.update('scenarios', s.id, patch, { projectId: s.projectId, field: key });
  render();
}

function residualBasisDialog(s, key, v, check) {
  const m = matrix();
  const kindSel = select([{ value: '', label: '— choose —' }].concat(RESIDUAL_BASIS_KINDS.map((k) => ({ value: k, label: k.replace(/_/g, ' ').toLowerCase() }))), s.residualBasisKind || '', { id: 'rb-kind' });
  const text = textarea({ value: s.residualBasisText || '', rows: 3, id: 'rb-text', placeholder: 'e.g. High-temperature trip on TT-201 closes the thermic-fluid valve independently of the temperature controller.' });
  const err = h('div', { class: 'field-err', text: check.detail || '' });

  const body = h(
    'div',
    {},
    h('div', { class: 'note crit' }, h('strong', { text: check.reason.replace(/_/g, ' ') + '. ' }), check.detail || 'A residual reduction needs an explicit technical basis.'),
    h('p', { class: 'card-note', style: { 'margin-top': '10px' }, text: 'A recommendation existing is not a basis. State the control and why it changes the rating.' }),
    field('Basis kind', kindSel),
    field('Technical basis', text),
    err
  );

  drawer('Residual risk basis required', body, [
    h('button', { class: 'btn', text: 'Cancel', onclick: () => { closeDrawer(); render(); } }),
    h('button', {
      class: 'btn primary',
      text: 'Save basis and rating',
      onclick: async () => {
        const next = Object.assign({}, s);
        next[key] = v;
        next.residualBasisKind = kindSel.value;
        next.residualBasisText = text.value.trim();
        const recheck = validateResidual({ matrix: m, initial: { likelihood: next.initialLikelihood, severity: next.initialSeverity }, residual: { likelihood: next.residualLikelihood, severity: next.residualSeverity }, basis: { kind: next.residualBasisKind, text: next.residualBasisText } });
        if (!recheck.ok) {
          err.textContent = (recheck.detail || recheck.reason.replace(/_/g, ' ')) + '';
          return;
        }
        const patch = {};
        patch[key] = v;
        patch.residualBasisKind = next.residualBasisKind;
        patch.residualBasisText = next.residualBasisText;
        const residual = tryRiskFromLS(m, next.residualLikelihood, next.residualSeverity);
        patch.residualRisk = residual.ok ? residual : null;
        await S.store.update('scenarios', s.id, patch, { projectId: s.projectId, field: key });
        closeDrawer();
        toast('Residual rating saved with its basis', 'ok');
        render();
      },
    }),
  ]);
}

function statusSelect(s) {
  const sel = h('select', { class: 'cell-edit', style: { 'font-size': '11px' } });
  for (const st of SCENARIO_REVIEW) {
    const o = h('option', { value: st, text: st.replace(/_/g, ' ').toLowerCase() });
    if ((s.reviewerStatus || 'DRAFT') === st) o.selected = true;
    sel.appendChild(o);
  }
  sel.addEventListener('change', async () => {
    const v = canAdvance(SCENARIO_REVIEW, s.reviewerStatus || 'DRAFT', sel.value);
    if (!v.ok) {
      toast('Cannot move to ' + sel.value + ': ' + v.reason.replace(/_/g, ' ').toLowerCase(), 'err');
      render();
      return;
    }
    await S.store.update('scenarios', s.id, { reviewerStatus: sel.value, reviewedBy: S.actor.id, reviewedAt: nowIso() }, { projectId: s.projectId, field: 'reviewerStatus', note: v.audit || null });
    render();
  });
  return sel;
}

// --------------------------------------------------------------- detail row

function detailPanel(node, s, m) {
  const recs = scoped('recommendations').filter((r) => r.scenarioId === s.id);
  const evidence = s.evidenceRefs || [];
  const wrap = h('div', { class: 'grid c2' });

  wrap.appendChild(
    h(
      'div',
      {},
      h('div', { class: 'tile-label', text: 'Row' }),
      h('h3', { class: 'card-title', text: s.deviation }),
      h('dl', { class: 'kv', style: { 'margin-top': '8px' } },
        h('dt', { text: 'Parameter / guideword' }), h('dd', { text: (s.parameterLabel || s.parameter) + ' / ' + (s.guidewordLabel || s.guideword) }),
        h('dt', { text: 'Initial risk basis' }), h('dd', { text: s.initial.ok ? s.initial.basis + ' — ' + s.initial.bandLabel : 'Not rated' }),
        h('dt', { text: 'Matrix' }), h('dd', { text: (m.name || m.id) + ' v' + m.version }),
        h('dt', { text: 'Residual basis' }), h('dd', { text: s.residualBasisKind ? s.residualBasisKind.replace(/_/g, ' ').toLowerCase() + ' — ' + (s.residualBasisText || '') : 'No reduction claimed' }),
        h('dt', { text: 'Severity dimensions' }), h('dd', { text: (s.severityDimensions || severityDimensions(s.consequences)).join(', ') || '—' }),
        h('dt', { text: 'Drafted by' }), h('dd', { text: s.aiDrafted ? 'AI draft, reviewed by the team' : 'Team' }),
        h('dt', { text: 'Reviewer status' }), h('dd', { text: (s.reviewerStatus || 'DRAFT').replace(/_/g, ' ') })
      ),
      field('Acceptance rationale', textarea({ value: s.acceptanceRationale || '', rows: 3, id: 'sc-acc-' + s.id, onchange: async (e) => { await S.store.update('scenarios', s.id, { acceptanceRationale: e.target.value }, { projectId: s.projectId, field: 'acceptanceRationale' }); render(); } }), 'Required for a high-risk row with no recommendation — the report needs to say why the team accepts the rating.'),
      h('div', { class: 'btn-row' }, h('button', { class: 'btn sm ghost', text: 'Add evidence', onclick: () => rowEvidenceDialog(s) }), h('button', { class: 'btn sm danger', text: 'Delete row', onclick: async () => { const ok = await confirmAction('Delete row ' + s.rowNumber + '?'); if (!ok) return; await S.store.remove('scenarios', s.id, { projectId: s.projectId }); S.selection.expandedRow = null; render(); } }))
    )
  );

  const right = h('div', {});
  right.appendChild(h('div', { class: 'tile-label', text: 'Recommendations' }));
  if (recs.length) {
    right.appendChild(h('div', { class: 'stack', style: { 'margin-top': '5px' } }, recs.map((r) => h('div', { class: 'note plain' }, h('div', { class: 'between' }, h('strong', { class: 'mono', text: r.recId || '—' }), h('span', { class: 'badge', text: r.status || 'OPEN' })), h('div', { text: r.text }), r.technicalBasis ? h('div', { class: 'muted small', text: 'Basis: ' + r.technicalBasis }) : null, h('div', { class: 'row small muted', style: { gap: '8px', 'margin-top': '3px' } }, r.controlLevel ? h('span', { class: 'tag', text: r.controlLevel }) : null, r.responsibleDepartment ? h('span', { text: r.responsibleDepartment }) : null, r.targetDate ? h('span', { text: 'by ' + r.targetDate }) : null), h('button', { class: 'btn sm ghost', style: { 'margin-top': '5px' }, text: 'Edit', onclick: () => recDialog(s, r) })))));
  } else {
    right.appendChild(h('p', { class: 'muted small', text: 'No recommendations on this row.' }));
  }

  right.appendChild(h('div', { class: 'tile-label', style: { 'margin-top': '12px' }, text: 'Evidence and sources' }));
  if (evidence.length) {
    right.appendChild(h('ul', { class: 'list-compact small' }, evidence.map((e) => h('li', {}, e.title || e.documentName || 'Evidence', e.page ? h('span', { class: 'mono', text: ' p.' + e.page }) : null, e.note ? h('span', { class: 'muted', text: ' — ' + e.note }) : null))));
  } else {
    right.appendChild(h('p', { class: 'muted small', text: 'No evidence attached. The report prints a provenance gap for rows whose safeguards have no source.' }));
  }

  const legal = legalLinksForNode(node.id);
  if (legal.length) {
    right.appendChild(h('div', { class: 'tile-label', style: { 'margin-top': '12px' }, text: 'Legal relevance for this node' }));
    right.appendChild(h('ul', { class: 'list-compact small' }, legal.slice(0, 5).map((l) => h('li', {}, l.record.instrumentTitle, ' — ', h('span', { class: 'muted', text: l.record.topic })))));
  }

  wrap.appendChild(right);
  return wrap;
}

// ------------------------------------------------------------------ dialogs

function listDialog(s, key, families) {
  const items = (s[key] || []).slice();
  const labelMap = { causes: 'Cause', consequences: 'Consequence', existingSafeguards: 'Existing safeguard' };
  const text = textarea({ rows: 2, id: 'ld-text', placeholder: labelMap[key] + ' text' });
  const famSel = select([{ value: '', label: '— classify —' }].concat(families.map((f) => ({ value: f.key, label: f.label }))), '', { id: 'ld-fam' });
  const warn = h('div', { class: 'field-err', text: '' });
  const listNode = h('div', { class: 'stack' });

  const refresh = () => {
    clear(listNode);
    if (!items.length) listNode.appendChild(h('p', { class: 'muted small', text: 'Nothing recorded yet.' }));
    items.forEach((it, i) => {
      listNode.appendChild(
        h('div', { class: 'note plain' }, h('div', { class: 'between' }, h('span', { text: it.text }), h('button', { class: 'btn sm ghost', text: '✕', onclick: () => { items.splice(i, 1); refresh(); } })), h('div', { class: 'row', style: { gap: '5px' } }, h('span', { class: 'tag', text: (families.filter((f) => f.key === it.family)[0] || {}).label || 'unclassified' }), it.safeguardCreditFlag ? h('span', { class: 'badge conflict', text: 'CREDITS A SAFEGUARD' }) : null))
      );
    });
  };
  refresh();

  if (key === 'consequences') {
    text.addEventListener('input', () => {
      const f = consequenceCreditsSafeguard(text.value);
      warn.textContent = f.flagged ? f.detail : '';
    });
  }
  text.addEventListener('blur', () => {
    if (!famSel.value && text.value.trim()) {
      const auto = key === 'causes' ? classifyCause(text.value) : key === 'consequences' ? classifyConsequence(text.value) : classifySafeguard(text.value);
      if (auto) famSel.value = auto;
    }
  });

  const body = h('div', {}, h('div', { class: 'section-rule' }, h('h2', { text: 'Current' })), listNode, h('div', { class: 'section-rule' }, h('h2', { text: 'Add' })), field(labelMap[key], text), warn, field('Family', famSel), h('button', {
    class: 'btn sm',
    text: 'Add to the list',
    onclick: () => {
      const t = text.value.trim();
      if (!t) return;
      const item = { text: t, family: famSel.value || null };
      if (key === 'consequences') {
        const f = consequenceCreditsSafeguard(t);
        if (f.flagged) item.safeguardCreditFlag = true;
      }
      items.push(item);
      text.value = '';
      famSel.value = '';
      warn.textContent = '';
      refresh();
    },
  }));

  drawer(labelMap[key] + 's — row ' + (s.rowNumber || ''), body, [
    h('button', { class: 'btn', text: 'Cancel', onclick: closeDrawer }),
    h('button', {
      class: 'btn primary',
      text: 'Save',
      onclick: async () => {
        const patch = {};
        patch[key] = items;
        if (key === 'consequences') patch.severityDimensions = severityDimensions(items);
        await S.store.update('scenarios', s.id, patch, { projectId: s.projectId, field: key });
        closeDrawer();
        render();
      },
    }),
  ]);
}

function addRowDialog(node) {
  const ctx = { equipment: scoped('equipment'), chemicals: chemicalsResolved(), chemProperties: scoped('chem_properties') };
  const gen = generateDeviations(node, ctx);
  const existing = new Set(scenariosFor(node.id).map((s) => s.parameter + '|' + s.guideword));
  const options = gen.combinations.filter((c) => !existing.has(c.parameter + '|' + c.guideword));

  if (!options.length) {
    drawer('Add row', h('div', {}, h('p', { text: 'Every meaningful deviation for this node already has a row. To add something outside the engine\'s set, give the node the characteristic that makes it meaningful — for example declare an inert-gas utility to enable the inerting deviations.' })), [h('button', { class: 'btn', text: 'Close', onclick: closeDrawer })]);
    return;
  }

  const sel = h('select', { size: Math.min(12, options.length), id: 'ar-sel', style: { width: '100%' } });
  for (const c of options) sel.appendChild(h('option', { value: c.parameter + '|' + c.guideword, text: c.deviation + '  (' + c.group + ')' }));
  sel.selectedIndex = 0;
  const rationale = h('div', { class: 'field-hint', text: '' });
  const showRationale = () => {
    const c = options[sel.selectedIndex] || options[0];
    rationale.textContent = c ? 'Meaningful here because: ' + (c.rationale || []).join('; ') : '';
  };
  sel.addEventListener('change', showRationale);
  showRationale();

  drawer('Add a row from the deviation set', h('div', {}, h('p', { class: 'card-note', text: options.length + ' meaningful deviation(s) are not yet on the sheet.' }), field('Deviation', sel), rationale), [
    h('button', { class: 'btn', text: 'Cancel', onclick: closeDrawer }),
    h('button', {
      class: 'btn primary',
      text: 'Add row',
      onclick: async () => {
        const c = options[sel.selectedIndex];
        if (!c) return;
        const rowNumber = scenariosFor(node.id).length + 1;
        await S.store.create('scenarios', { projectId: node.projectId, nodeId: node.id, rowNumber, parameter: c.parameter, parameterLabel: c.parameterLabel, guideword: c.guideword, guidewordLabel: c.guidewordLabel, deviation: c.deviation, deviationKind: c.kind, causes: [], consequences: [], existingSafeguards: [], reviewerStatus: 'DRAFT' }, { projectId: node.projectId });
        if (node.reviewStatus === 'APPROVED') await S.store.update('nodes', node.id, { reviewStatus: 'WORKSHEETED' }, { projectId: node.projectId, field: 'reviewStatus' });
        closeDrawer();
        render();
      },
    }),
  ]);
}

function recDialog(s, r) {
  const text = textarea({ value: (r && r.text) || '', rows: 3, id: 'rd-text' });
  const basis = textarea({ value: (r && r.technicalBasis) || '', rows: 2, id: 'rd-basis' });
  const level = select([{ value: '', label: '— classify —' }].concat(CONTROL_LEVELS.map((l) => ({ value: l.key, label: l.rank + '. ' + l.label }))), (r && r.controlLevel) || '', { id: 'rd-level' });
  const priority = select([{ value: '', label: '—' }, 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'], (r && r.priority) || '', { id: 'rd-prio' });
  const dept = input({ value: (r && r.responsibleDepartment) || '', id: 'rd-dept' });
  const person = input({ value: (r && r.responsiblePerson) || '', id: 'rd-person' });
  const date = input({ type: 'date', value: (r && r.targetDate) || '', id: 'rd-date' });
  const legalBasis = input({ value: (r && r.legalBasis) || '', id: 'rd-legal' });
  const stdBasis = input({ value: (r && r.standardBasis) || '', id: 'rd-std' });

  const body = h(
    'div',
    {},
    field('Recommendation', text, 'Name the measure, where it goes, and the condition that shows it is done.'),
    field('Technical basis', basis),
    h('div', { class: 'grid c2' }, field('Hierarchy of control', level, 'Engineering controls before administrative ones.'), field('Priority', priority), field('Responsible department', dept), field('Responsible person', person), field('Target date', date)),
    h('div', { class: 'grid c2' }, field('Legal basis (optional)', legalBasis), field('Standard basis (optional)', stdBasis)),
    h('p', { class: 'field-hint', text: 'Adding a recommendation does not change the residual rating. A reduction needs its own technical basis, recorded on the row.' })
  );

  drawer(r ? 'Edit ' + (r.recId || 'recommendation') : 'Add recommendation', body, [
    r ? h('button', { class: 'btn danger', text: 'Delete', onclick: async () => { const ok = await confirmAction('Delete ' + (r.recId || 'this recommendation') + '?'); if (!ok) return; await S.store.remove('recommendations', r.id, { projectId: s.projectId }); closeDrawer(); render(); } }) : null,
    h('button', { class: 'btn', text: 'Cancel', onclick: closeDrawer }),
    h('button', {
      class: 'btn primary',
      text: 'Save',
      onclick: async () => {
        if (!text.value.trim()) {
          toast('Recommendation text is required.', 'err');
          return;
        }
        const node = nodeById(s.nodeId);
        const rec = {
          projectId: s.projectId,
          scenarioId: s.id,
          nodeId: s.nodeId,
          text: text.value.trim(),
          technicalBasis: basis.value.trim(),
          controlLevel: level.value || null,
          priority: priority.value || null,
          responsibleDepartment: dept.value.trim(),
          responsiblePerson: person.value.trim(),
          targetDate: date.value || null,
          legalBasis: legalBasis.value.trim(),
          standardBasis: stdBasis.value.trim(),
          equipmentTags: node ? (node.equipmentIds || []).map((id) => (equipById(id) || {}).tag).filter(Boolean) : [],
        };
        if (r) await S.store.update('recommendations', r.id, rec, { projectId: s.projectId });
        else {
          const n = scoped('recommendations').length + 1;
          await S.store.create('recommendations', Object.assign(rec, { recId: 'R-' + String(n).padStart(3, '0'), status: 'OPEN', closureEvidenceRequired: true }), { projectId: s.projectId });
        }
        closeDrawer();
        toast('Recommendation saved', 'ok');
        render();
      },
    }),
  ]);
}

function rowEvidenceDialog(s) {
  const docs = scoped('documents');
  const docSel = select([{ value: '', label: '— none —' }].concat(docs.map((d) => ({ value: d.id, label: d.title }))), '', { id: 'ev-doc' });
  const title = input({ id: 'ev-title', placeholder: 'What the evidence is' });
  const page = input({ id: 'ev-page', placeholder: 'Page / section' });
  const note = textarea({ rows: 2, id: 'ev-note' });
  drawer('Attach evidence to row ' + (s.rowNumber || ''), h('div', {}, field('Title', title), field('Document', docSel), field('Page / section', page), field('Note', note)), [
    h('button', { class: 'btn', text: 'Cancel', onclick: closeDrawer }),
    h('button', {
      class: 'btn primary',
      text: 'Attach',
      onclick: async () => {
        const doc = docs.filter((d) => d.id === docSel.value)[0];
        const refs = (s.evidenceRefs || []).concat([{ title: title.value.trim() || (doc ? doc.title : 'Evidence'), documentId: doc ? doc.id : null, documentName: doc ? doc.title : null, page: page.value.trim() || null, note: note.value.trim() || null, attachedAt: nowIso() }]);
        await S.store.update('scenarios', s.id, { evidenceRefs: refs }, { projectId: s.projectId, field: 'evidenceRefs' });
        closeDrawer();
        render();
      },
    }),
  ]);
}

// ---------------------------------------------------------------- AI drafting

function draftDialog(node) {
  const ctx = { equipment: scoped('equipment'), chemicals: chemicalsResolved(), chemProperties: scoped('chem_properties') };
  const gen = generateDeviations(node, ctx);
  const existing = new Set(scenariosFor(node.id).map((s) => s.parameter + '|' + s.guideword));
  const uncovered = gen.combinations.filter((c) => !existing.has(c.parameter + '|' + c.guideword));

  if (!uncovered.length) {
    drawer('Draft rows', h('div', {}, h('p', { text: 'Every meaningful deviation for this node already has a row.' })), [h('button', { class: 'btn', text: 'Close', onclick: closeDrawer })]);
    return;
  }

  const body = h(
    'div',
    { class: 'stack' },
    h('p', { text: uncovered.length + ' meaningful deviation(s) have no row. The model will draft causes, consequences and existing safeguards for up to 14 of them.' }),
    h('div', { class: 'note plain' }, 'The deviation set comes from the app, not the model: it can only fill rows for deviations the engine has already decided are meaningful for this node. It cannot rate risk, and it cannot invent a safeguard that is not recorded on the node.'),
    h('ul', { class: 'list-compact small' }, uncovered.slice(0, 14).map((c) => h('li', { text: c.deviation }))),
    h('div', { class: 'status-line' })
  );
  const status = body.querySelector('.status-line');

  drawer('Draft the uncovered rows', body, [
    h('button', { class: 'btn', text: 'Cancel', onclick: closeDrawer }),
    h('button', {
      class: 'btn primary',
      text: 'Draft',
      onclick: async (e) => {
        const btn = e.target;
        btn.disabled = true;
        clear(status);
        status.appendChild(h('span', { class: 'spin' }));
        status.appendChild(h('span', { text: ' Thinking — this can take a minute for a full node.' }));
        try {
          const out = await draftScenarios(node.id, uncovered.slice(0, 14));
          closeDrawer();
          reviewDrafts(node, out);
        } catch (err) {
          clear(status);
          toast('Drafting failed: ' + ((err && err.message) || 'unknown error'), 'err');
          btn.disabled = false;
        }
      },
    }),
  ]);
}

function reviewDrafts(node, out) {
  const chosen = new Set(out.rows.map((_, i) => i));
  const body = h('div', { class: 'stack' });
  body.appendChild(h('p', { class: 'card-note', text: out.rows.length + ' row(s) drafted. Every row arrives as a DRAFT with no risk rating — the team rates them. Deselect anything you do not want.' }));
  if (out.envelope && (out.envelope.missing_data || []).length) body.appendChild(h('div', { class: 'note warn' }, h('strong', { text: 'Missing data the model reported: ' }), (out.envelope.missing_data || []).join('; ')));
  if (out.envelope && (out.envelope.assumptions || []).length) body.appendChild(h('div', { class: 'note plain' }, h('strong', { text: 'Assumptions the model made: ' }), (out.envelope.assumptions || []).join('; ')));

  out.rows.forEach((r, i) => {
    const cb = h('input', { type: 'checkbox', checked: true, onchange: (e) => { if (e.target.checked) chosen.add(i); else chosen.delete(i); } });
    body.appendChild(
      h(
        'div',
        { class: 'card' },
        h('label', { class: 'row', style: { gap: '8px', 'align-items': 'flex-start' } }, cb, h(
          'div',
          { style: { flex: '1', 'min-width': '0' } },
          h('strong', { text: r.deviation }),
          r.noMeaningfulDeviation ? h('div', { class: 'badge na', text: 'NO MEANINGFUL DEVIATION' }) : null,
          r.noMeaningfulReason ? h('div', { class: 'muted small', text: r.noMeaningfulReason }) : null,
          r.causes.length ? h('div', { class: 'small', style: { 'margin-top': '4px' } }, h('strong', { text: 'Causes: ' }), r.causes.map((c) => c.text).join('; ')) : null,
          r.consequences.length ? h('div', { class: 'small' }, h('strong', { text: 'Consequences: ' }), r.consequences.map((c) => c.text).join('; ')) : null,
          r.existingSafeguards.length ? h('div', { class: 'small' }, h('strong', { text: 'Existing safeguards: ' }), r.existingSafeguards.map((c) => c.text).join('; ')) : null
        ))
      )
    );
  });

  drawer('Review drafted rows', body, [
    h('button', { class: 'btn', text: 'Discard', onclick: closeDrawer }),
    h('button', {
      class: 'btn primary',
      text: 'Add selected as drafts',
      onclick: async () => {
        let n = scenariosFor(node.id).length;
        let made = 0;
        for (let i = 0; i < out.rows.length; i += 1) {
          if (!chosen.has(i)) continue;
          const r = out.rows[i];
          n += 1;
          await S.store.create('scenarios', Object.assign({}, r, { projectId: node.projectId, nodeId: node.id, rowNumber: n, aiRunId: out.runId, severityDimensions: severityDimensions(r.consequences) }), { projectId: node.projectId, actorKind: 'ai', aiRunId: out.runId });
          made += 1;
        }
        if (made && node.reviewStatus === 'APPROVED') await S.store.update('nodes', node.id, { reviewStatus: 'WORKSHEETED' }, { projectId: node.projectId, field: 'reviewStatus' });
        closeDrawer();
        toast(made + ' row(s) added as drafts — rate and review them', 'ok');
        render();
      },
    }),
  ]);
}

async function draftRecsFor(s) {
  toast('Drafting recommendations…');
  try {
    const out = await draftRecommendations(s);
    if (!out.recommendations.length) {
      toast('The model returned no recommendations for this row.', 'err');
      return;
    }
    const chosen = new Set(out.recommendations.map((_, i) => i));
    const body = h('div', { class: 'stack' }, h('p', { class: 'card-note', text: 'Drafted for: ' + s.deviation }));
    out.recommendations.forEach((r, i) => {
      const cb = h('input', { type: 'checkbox', checked: true, onchange: (e) => { if (e.target.checked) chosen.add(i); else chosen.delete(i); } });
      body.appendChild(
        h('div', { class: 'card' }, h('label', { class: 'row', style: { gap: '8px', 'align-items': 'flex-start' } }, cb, h('div', { style: { flex: '1' } }, h('div', { text: r.text }), r.technicalBasis ? h('div', { class: 'muted small', text: 'Basis: ' + r.technicalBasis }) : null, h('div', { class: 'row', style: { gap: '5px', 'margin-top': '4px' } }, r.controlLevel ? h('span', { class: 'tag', text: r.controlLevel }) : null, r.priority ? h('span', { class: 'tag', text: r.priority }) : null, r.responsibleDepartment ? h('span', { class: 'muted small', text: r.responsibleDepartment }) : null), r.quality && r.quality.issues.length ? h('div', { class: 'note warn small', style: { 'margin-top': '5px' } }, r.quality.issues.map((x) => x.detail).join(' ')) : null)))
      );
    });
    drawer('Review drafted recommendations', body, [
      h('button', { class: 'btn', text: 'Discard', onclick: closeDrawer }),
      h('button', {
        class: 'btn primary',
        text: 'Add selected',
        onclick: async () => {
          let n = scoped('recommendations').length;
          const node = nodeById(s.nodeId);
          for (let i = 0; i < out.recommendations.length; i += 1) {
            if (!chosen.has(i)) continue;
            const r = out.recommendations[i];
            n += 1;
            await S.store.create('recommendations', { projectId: s.projectId, scenarioId: s.id, nodeId: s.nodeId, recId: 'R-' + String(n).padStart(3, '0'), text: r.text, technicalBasis: r.technicalBasis, controlLevel: r.controlLevel, priority: r.priority, responsibleDepartment: r.responsibleDepartment, legalBasis: r.legalBasis, standardBasis: r.standardBasis, status: 'OPEN', closureEvidenceRequired: true, aiRunId: out.runId, equipmentTags: node ? (node.equipmentIds || []).map((id) => (equipById(id) || {}).tag).filter(Boolean) : [] }, { projectId: s.projectId, actorKind: 'ai', aiRunId: out.runId });
          }
          closeDrawer();
          toast('Recommendations added', 'ok');
          render();
        },
      }),
    ]);
  } catch (e) {
    toast('Drafting failed: ' + ((e && e.message) || 'unknown error'), 'err');
  }
}
