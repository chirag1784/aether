// app/views/risk.js — risk matrix configuration and the matrix preview grid.

import { h, field, input, select, textarea, toast, drawer, closeDrawer, confirmAction, emptyState, sectionRule, riskBadge, tile, uid } from '../util.js';
import { S, render, project, scoped, matrix, scenariosWithRisk } from '../state.js';
import { DEFAULT_MATRIX, LOOKUP_4x4_EXAMPLE, matrixGrid, validateMatrix, riskFromLS, tolerability, bandsAtOrAbove } from '../../packages/calculations/risk.js';

export function renderRisk() {
  const p = project();
  if (!p) return h('div', { class: 'page' }, emptyState('No project selected', 'Pick a project first.', null));

  const m = matrix();
  const custom = scoped('risk_matrices');
  const scen = scenariosWithRisk();
  const page = h('div', { class: 'page' });

  page.appendChild(
    h('div', { class: 'page-head' }, h('div', {}, h('div', { class: 'eyebrow', text: 'Risk engine' }), h('h1', { class: 'page-title', text: 'Risk matrix' })), h('div', { class: 'page-actions' }, h('button', { class: 'btn', text: 'Define a matrix', onclick: () => matrixDialog(p, null) })))
  );
  page.appendChild(h('p', { class: 'page-sub', text: 'The matrix is project data, not a constant. Every stored risk score carries the matrix id and version that produced it, so a matrix change marks the affected ratings stale rather than silently reinterpreting them.' }));

  // Stale ratings
  const stale = scen.filter((s) => s.initialRisk && s.initialRisk.matrixVersion !== undefined && (s.initialRisk.matrixId !== m.id || s.initialRisk.matrixVersion !== m.version));
  if (stale.length) {
    page.appendChild(
      h(
        'div',
        { class: 'note crit', style: { 'margin-bottom': '12px' } },
        h('strong', { text: stale.length + ' rating(s) were made against a different matrix version. ' }),
        'They are shown against the current matrix but the stored score is stale. Recompute them so the report and the register agree.',
        h('div', { class: 'btn-row', style: { 'margin-top': '7px' } }, h('button', { class: 'btn sm primary', text: 'Recompute ' + stale.length + ' rating(s)', onclick: () => recompute(stale, m) }))
      )
    );
  }

  // Current matrix
  page.appendChild(
    h(
      'div',
      { class: 'card' },
      h('div', { class: 'between' }, h('div', {}, h('h3', { class: 'card-title', text: m.name || m.id }), h('p', { class: 'card-note' }, h('span', { class: 'mono', text: m.id + ' v' + m.version }), ' · ', m.combine === 'lookup' ? 'explicit cell lookup' : 'likelihood × severity', ' · ', m.alarpEnabled ? 'ALARP narrative enabled' : 'ALARP narrative disabled')), h('div', { class: 'btn-row' }, custom.some((x) => x.id === m.id) ? h('button', { class: 'btn sm ghost', text: 'Edit', onclick: () => matrixDialog(p, m) }) : h('span', { class: 'badge', text: 'BUILT IN' }))),
      matrixPreview(m)
    )
  );

  // Distribution
  const rated = scen.filter((s) => s.initialRiskResult && s.initialRiskResult.ok);
  if (rated.length) {
    page.appendChild(sectionRule('Distribution of the current ratings'));
    const counts = new Map();
    for (const b of m.bands) counts.set(b.key, { band: b, initial: 0, residual: 0 });
    for (const s of rated) {
      const e = counts.get(s.initialRiskResult.bandKey);
      if (e) e.initial += 1;
      if (s.residualRiskResult && s.residualRiskResult.ok) {
        const r = counts.get(s.residualRiskResult.bandKey);
        if (r) r.residual += 1;
      }
    }
    const maxV = Math.max.apply(null, Array.from(counts.values()).map((e) => Math.max(e.initial, e.residual)).concat([1]));
    const bars = h('div', { class: 'stack' });
    for (const e of counts.values()) {
      bars.appendChild(
        h(
          'div',
          {},
          h('div', { class: 'between', style: { 'margin-bottom': '3px' } }, h('span', {}, h('span', { class: 'risk-badge risk-' + e.band.key, text: e.band.label })), h('span', { class: 'mono small', text: e.initial + ' initial · ' + e.residual + ' residual' })),
          h('div', { style: { display: 'flex', gap: '3px', 'align-items': 'center' } }, h('div', { style: { height: '9px', width: (e.initial / maxV) * 100 + '%', 'min-width': e.initial ? '2px' : '0', background: 'var(--risk-' + e.band.key.toLowerCase() + ', var(--accent))', 'border-radius': '2px' } })),
          h('div', { style: { display: 'flex', gap: '3px', 'align-items': 'center', 'margin-top': '2px' } }, h('div', { style: { height: '5px', width: (e.residual / maxV) * 100 + '%', 'min-width': e.residual ? '2px' : '0', background: 'var(--line-strong)', 'border-radius': '2px' } }))
        )
      );
    }
    page.appendChild(h('div', { class: 'card' }, h('p', { class: 'card-note', text: 'Thick bar: initial rating. Thin bar: rating after the recommendations, where a justified basis has been recorded.' }), bars));
  }

  // Scales
  page.appendChild(sectionRule('Scales'));
  page.appendChild(
    h(
      'div',
      { class: 'grid c2' },
      h('div', { class: 'card' }, h('h3', { class: 'card-title', text: 'Likelihood' }), h('dl', { class: 'kv' }, m.likelihoodScale.map((l) => [h('dt', { class: 'mono', text: String(l.value) + ' — ' + l.label }), h('dd', { class: 'small', text: l.descriptor || '' })]).reduce((a, b) => a.concat(b), []))),
      h('div', { class: 'card' }, h('h3', { class: 'card-title', text: 'Severity' }), h('dl', { class: 'kv' }, m.severityScale.map((sv) => [h('dt', { class: 'mono', text: String(sv.value) + ' — ' + sv.label }), h('dd', { class: 'small', text: [sv.people, sv.env, sv.asset].filter(Boolean).join(' · ') })]).reduce((a, b) => a.concat(b), [])))
    )
  );

  // Band actions
  page.appendChild(sectionRule('Band actions'));
  const bandRows = m.bands.map((b) => {
    const t = tolerability(m, b.key);
    return h('tr', {}, h('td', {}, h('span', { class: 'risk-badge risk-' + b.key, text: b.label })), h('td', { class: 'mono small', text: b.min !== undefined ? b.min + '–' + b.max : 'lookup' }), h('td', { text: (t.action || '').replace(/_/g, ' ').toLowerCase() }), h('td', { class: 'small muted', text: t.reason === 'ALARP_NARRATIVE_DISABLED_FOR_PROJECT' ? 'The project methodology does not enable an ALARP narrative, so this band requires action.' : '' }));
  });
  page.appendChild(h('div', { class: 'table-wrap' }, h('table', {}, h('thead', {}, h('tr', {}, h('th', { text: 'Band' }), h('th', { text: 'Score' }), h('th', { text: 'Action required' }), h('th', { text: 'Note' }))), h('tbody', {}, bandRows))));

  page.appendChild(h('p', { class: 'muted small', style: { 'margin-top': '10px' }, text: 'Rows in the top two bands (' + bandsAtOrAbove(m, m.bands[m.bands.length - 2].key).join(', ') + ') must carry either a recommendation or a recorded acceptance rationale before the report can leave DRAFT.' }));

  if (custom.length) {
    page.appendChild(sectionRule('Project matrices'));
    page.appendChild(h('div', { class: 'grid c2' }, custom.map((c) => h('div', { class: 'card' }, h('div', { class: 'between' }, h('h3', { class: 'card-title', text: c.name || c.id }), c.id === m.id ? h('span', { class: 'badge verified', text: 'IN USE' }) : h('button', { class: 'btn sm', text: 'Use', onclick: () => useMatrix(p, c) })), h('p', { class: 'card-note', text: c.combine + ' · ' + c.likelihoodScale.length + '×' + c.severityScale.length })))));
  }

  page.appendChild(sectionRule('Start from an example'));
  page.appendChild(
    h('div', { class: 'grid c2' },
      h('div', { class: 'card' }, h('h3', { class: 'card-title', text: DEFAULT_MATRIX.name }), h('p', { class: 'card-note', text: 'Product of likelihood and severity, five bands. The built-in default.' }), h('button', { class: 'btn sm', text: 'Copy into this project', onclick: () => copyMatrix(p, DEFAULT_MATRIX) })),
      h('div', { class: 'card' }, h('h3', { class: 'card-title', text: LOOKUP_4x4_EXAMPLE.name }), h('p', { class: 'card-note', text: 'A non-multiplicative matrix: severity dominates, so any catastrophic outcome is at least High whatever its likelihood. Use this shape where a client matrix is not a product.' }), h('button', { class: 'btn sm', text: 'Copy into this project', onclick: () => copyMatrix(p, LOOKUP_4x4_EXAMPLE) }))
    )
  );

  return page;
}

function matrixPreview(m) {
  const grid = matrixGrid(m);
  const table = h('table', { class: 'matrix-grid' });
  const head = h('tr', {}, h('th', { class: 'axis', text: 'S ↓ / L →' }), m.likelihoodScale.map((l) => h('th', { class: 'axis', title: l.descriptor || '', text: String(l.value) + ' ' + l.label })));
  table.appendChild(h('thead', {}, head));
  const body = h('tbody', {});
  for (const row of grid) {
    const tr = h('tr', {}, h('th', { class: 'axis', title: [row.severity.people, row.severity.env].filter(Boolean).join(' · '), text: String(row.severity.value) + ' ' + row.severity.label }));
    for (const cell of row.cells) {
      const r = cell.result;
      tr.appendChild(h('td', { class: r.ok ? 'risk-' + r.bandKey : '', style: r.ok ? {} : { background: 'var(--surface-2)', color: 'var(--muted)' }, title: r.ok ? r.bandLabel + ' — ' + r.action : 'n/a', text: r.ok ? (r.score !== null && r.score !== undefined ? String(r.score) : r.bandLabel) : '—' }));
    }
    body.appendChild(tr);
  }
  table.appendChild(body);
  return h('div', { style: { 'overflow-x': 'auto', 'margin-top': '10px' } }, table);
}

async function recompute(stale, m) {
  for (const s of stale) {
    let initial = null;
    let residual = null;
    try {
      initial = riskFromLS(m, s.initialLikelihood, s.initialSeverity);
    } catch (e) {
      initial = null;
    }
    try {
      residual = riskFromLS(m, s.residualLikelihood, s.residualSeverity);
    } catch (e) {
      residual = null;
    }
    await S.store.update('scenarios', s.id, { initialRisk: initial && initial.ok ? initial : null, residualRisk: residual && residual.ok ? residual : null }, { projectId: s.projectId, field: 'initialRisk', note: 'Recomputed against ' + m.id + ' v' + m.version });
  }
  toast(stale.length + ' rating(s) recomputed against ' + m.id + ' v' + m.version, 'ok');
  render();
}

async function useMatrix(p, m) {
  await S.store.update('projects', p.id, { riskMatrixId: m.id }, { projectId: p.id, field: 'riskMatrixId' });
  toast('Matrix in use: ' + (m.name || m.id), 'ok');
  render();
}

async function copyMatrix(p, base) {
  const rec = Object.assign({}, JSON.parse(JSON.stringify(base)), { projectId: p.id, id: base.id + '-' + p.id.slice(-6), version: 1, name: base.name + ' (project copy)' });
  const created = await S.store.create('risk_matrices', rec, { projectId: p.id });
  await S.store.update('projects', p.id, { riskMatrixId: created.id }, { projectId: p.id, field: 'riskMatrixId' });
  toast('Matrix copied into the project and put in use', 'ok');
  render();
}

function matrixDialog(p, existing) {
  const base = existing && existing.likelihoodScale ? existing : DEFAULT_MATRIX;
  const name = input({ value: (existing && existing.name) || '', id: 'mx-name', placeholder: 'e.g. Client 5×5 matrix' });
  const combine = select([{ value: 'product', label: 'Likelihood × severity' }, { value: 'lookup', label: 'Explicit cell lookup' }], (existing && existing.combine) || 'product', { id: 'mx-combine' });
  const alarp = h('input', { type: 'checkbox', id: 'mx-alarp', checked: existing ? existing.alarpEnabled !== false : true });
  const json = textarea({ rows: 16, id: 'mx-json', value: JSON.stringify({ likelihoodScale: base.likelihoodScale, severityScale: base.severityScale, bands: base.bands, cells: base.cells || undefined }, null, 1) });
  const err = h('div', { class: 'field-err', text: '' });

  const body = h(
    'div',
    {},
    h('div', { class: 'grid c2' }, field('Name', name), field('Combination', combine)),
    h('label', { class: 'field inline' }, alarp, h('span', { text: 'Allow an ALARP narrative for the middle band' })),
    field('Scales and bands', json, 'Bands need min and max for a product matrix, or a key referenced by every cell for a lookup matrix. Validation checks that every reachable score falls in exactly one band.'),
    err
  );

  drawer(existing ? 'Edit matrix' : 'Define a matrix', body, [
    h('button', { class: 'btn', text: 'Cancel', onclick: closeDrawer }),
    h('button', {
      class: 'btn primary',
      text: 'Validate and save',
      onclick: async () => {
        let parsed;
        try {
          parsed = JSON.parse(json.value);
        } catch (e) {
          err.textContent = 'That is not valid JSON: ' + ((e && e.message) || '');
          return;
        }
        const rec = Object.assign({}, parsed, { id: (existing && existing.id) || 'MX-' + uid('m').slice(-8), version: existing ? (existing.version || 1) + 1 : 1, name: name.value.trim() || 'Project matrix', combine: combine.value, alarpEnabled: alarp.checked, projectId: p.id });
        const v = validateMatrix(rec);
        if (!v.ok) {
          err.textContent = v.errors.slice(0, 4).join(' ');
          return;
        }
        if (existing && scoped('risk_matrices').some((x) => x.id === existing.id)) await S.store.replace('risk_matrices', existing.id, rec, { projectId: p.id });
        else await S.store.create('risk_matrices', rec, { projectId: p.id });
        await S.store.update('projects', p.id, { riskMatrixId: rec.id }, { projectId: p.id, field: 'riskMatrixId' });
        closeDrawer();
        toast('Matrix saved and put in use. Existing ratings are now marked stale until you recompute them.', 'ok');
        render();
      },
    }),
  ]);
}
