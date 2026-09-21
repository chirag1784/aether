// app/views/risk.js — risk matrix configuration and the matrix preview grid.

import { h, field, input, select, textarea, toast, drawer, closeDrawer, confirmAction, emptyState, sectionRule, riskBadge, tile, uid, tableWrap, truncate, meter } from '../util.js';
import { S, render, project, scoped, matrix, scenariosWithRisk, go } from '../state.js';
import { DEFAULT_MATRIX, LOOKUP_4x4_EXAMPLE, matrixGrid, validateMatrix, riskFromLS, tolerability, bandsAtOrAbove } from '../../packages/calculations/risk.js';
import { rankRecommendations, selectDoable, migrationPlan, SELECTION_MODES, DOABILITY_BANDS, recRef } from '../../packages/calculations/doability.js';
import { riskMatrixDiagram, matrixLegend, bandSlopeDiagram } from '../diagrams.js';

const RISK_TABS = [
  { key: 'migration', label: 'Before and after' },
  { key: 'matrix', label: 'The matrix' },
];

export function renderRisk() {
  const p = project();
  if (!p) return h('div', { class: 'page' }, emptyState('No project selected', 'Pick a project first.', null));

  const m = matrix();
  const custom = scoped('risk_matrices');
  const scen = scenariosWithRisk();
  const page = h('div', { class: 'page' });
  const tab = S.riskTab || 'migration';

  page.appendChild(
    h('div', { class: 'page-head' }, h('div', {}, h('div', { class: 'eyebrow', text: 'Risk engine' }), h('h1', { class: 'page-title', text: 'Risk picture' })), h('div', { class: 'page-actions' }, h('button', { class: 'btn', text: 'Define a matrix', onclick: () => matrixDialog(p, null) })))
  );
  page.appendChild(
    h(
      'div',
      { class: 'tabs' },
      RISK_TABS.map((t) =>
        h('button', {
          class: 'tab' + (tab === t.key ? ' on' : ''),
          text: t.label,
          onclick: () => {
            S.riskTab = t.key;
            render();
          },
        })
      )
    )
  );

  if (tab === 'migration') {
    page.appendChild(migrationSection(p, m));
    return page;
  }

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

/** A band badge from a band key, for places that have the key but no result. */
function bandChip(m, bandKey) {
  const b = (m.bands || []).find((x) => x.key === bandKey);
  const t = tolerability(m, bandKey);
  return h('span', {
    class: 'risk-badge risk-' + (bandKey || 'none'),
    title: (b ? b.label : 'unrated') + ' — ' + String((t && t.action) || '').replace(/_/g, ' ').toLowerCase(),
    text: b ? b.label : 'not rated',
  });
}

// ---------------------------------------------------------------------------
// Before and after
// ---------------------------------------------------------------------------

/**
 * The picture the report is written around: where the scenarios sit now, and
 * where they would sit if a chosen package of work were done.
 *
 * Two honesty rules hold the section together. A scenario only moves when a
 * residual rating has actually been recorded for it against a justified basis
 * — the app never assumes a recommendation works. And a recommendation is only
 * in the package when its effort has been declared, so the order is built on
 * facts rather than on an optimistic guess about what is cheap.
 */
function migrationSection(p, m) {
  const wrap = h('div', {});
  const scen = scoped('scenarios');
  const recs = scoped('recommendations');
  const mode = S.riskMode || 'THIS_QUARTER';
  const n = S.riskTopN || 5;

  const ranking = rankRecommendations({ recommendations: recs, matrix: m, scenarios: scen, partial: true });
  const selection = selectDoable({ ranking, mode, n, matrix: m, scenarios: scen });
  const plan = migrationPlan({ matrix: m, scenarios: scen, selection });

  wrap.appendChild(
    h('p', {
      class: 'page-sub',
      text:
        'Left: every rated scenario where the team put it. Right: where it would sit if the selected work were done. A scenario moves only where a residual rating has been recorded against a justified basis — the app does not assume a recommendation works, and an arrow you cannot see is a rating nobody has made yet.',
    })
  );

  // The selection control.
  const modeSel = select(
    SELECTION_MODES.filter((x) => x.key !== 'EXPLICIT').map((x) => ({ value: x.key, label: x.label })),
    mode,
    { id: 'rk-mode' }
  );
  modeSel.addEventListener('change', () => {
    S.riskMode = modeSel.value;
    render();
  });
  const nIn = input({ type: 'number', min: '1', max: '40', value: String(n), id: 'rk-n' });
  nIn.addEventListener('change', () => {
    S.riskTopN = Math.max(1, Math.min(40, Number(nIn.value) || 5));
    render();
  });
  const modeMeta = SELECTION_MODES.find((x) => x.key === mode) || {};
  wrap.appendChild(
    h(
      'div',
      { class: 'card' },
      h(
        'div',
        { class: 'grid c2' },
        field('Credit the work that is', modeSel, modeMeta.note || ''),
        mode === 'TOP_N' ? field('How many', nIn, 'Ranked by risk removed per unit of effort.') : h('div', {})
      ),
      h(
        'div',
        { class: 'row', style: { gap: '14px', 'flex-wrap': 'wrap', 'margin-top': '4px' } },
        h('span', { class: 'mono small', text: selection.counts.selected + ' selected' }),
        h('span', { class: 'mono small', text: selection.counts.creditable + ' change the picture' }),
        h('span', { class: 'mono small', text: selection.counts.deferred + ' deferred' }),
        h('span', { class: 'mono small', text: selection.counts.undecidable + ' effort undeclared' })
      )
    )
  );

  if (plan.points.length === 0) {
    wrap.appendChild(
      emptyState(
        'No scenario carries an initial rating yet',
        'The matrix picture needs a likelihood and a severity on at least one worksheet row. Rate the rows on the worksheet and this page fills in.',
        h('button', { class: 'btn', text: 'Open the worksheet', onclick: () => go('hazop') })
      )
    );
    return wrap;
  }

  // The headline numbers.
  const removed = plan.intolerable.before - plan.intolerable.after;
  wrap.appendChild(
    h(
      'div',
      { class: 'grid c4' },
      tile('Rated scenarios', String(plan.points.length), plan.unrated.length ? plan.unrated.length + ' not rated and not drawn' : 'All rated rows are plotted'),
      tile(
        'Needing action now',
        String(plan.intolerable.before),
        'In a band the matrix says requires action',
        plan.intolerable.before ? 'crit' : 'ok'
      ),
      tile(
        'Needing action after',
        String(plan.intolerable.after),
        removed > 0 ? removed + ' fewer' : removed === 0 ? 'no change' : 'more — check the ratings',
        plan.intolerable.after ? 'alert' : 'ok'
      ),
      tile('Rows that move', String(plan.moved), plan.stationary + ' stay where they are')
    )
  );

  // The two matrices, side by side, plus the migration view.
  wrap.appendChild(sectionRule('The matrix'));
  const phase = S.riskPhase || 'both';
  const phaseBar = h(
    'div',
    { class: 'row', style: { gap: '6px', 'margin-bottom': '8px', 'flex-wrap': 'wrap' } },
    [
      { key: 'both', label: 'Both, with the migration' },
      { key: 'before', label: 'Before only' },
      { key: 'after', label: 'After only' },
    ].map((x) =>
      h('button', {
        class: 'btn sm' + (phase === x.key ? ' primary' : ' ghost'),
        text: x.label,
        onclick: () => {
          S.riskPhase = x.key;
          render();
        },
      })
    )
  );
  wrap.appendChild(phaseBar);
  wrap.appendChild(
    h(
      'div',
      { class: 'card' },
      riskMatrixDiagram({
        matrix: m,
        points: plan.points,
        phase,
        box: { width: 580, height: 450 },
        onPick: (mark) => scenarioDialog(mark, plan),
      }),
      matrixLegend({ matrix: m, phase }),
      h('p', {
        class: 'card-note',
        text:
          phase === 'both'
            ? 'A hollow mark is the initial rating, a solid mark the rating after the selected work, and an arrow joins them. Marks are spread within their cell so a stack of rows reads as a stack. Select a mark for the row behind it.'
            : 'Select a mark for the row behind it.',
      })
    )
  );

  // The slope chart.
  wrap.appendChild(sectionRule('What moves between the bands'));
  wrap.appendChild(
    h(
      'div',
      { class: 'card' },
      bandSlopeDiagram({ matrix: m, counts: plan.bandCounts, box: { width: 520, height: 40 + m.bands.length * 42 } }),
      h('p', {
        class: 'card-note',
        text: 'Line thickness carries the count before the work, so a band holding one scenario does not shout as loudly as one holding twelve. A scenario with no residual rating counts in its original band on both sides — it has not moved.',
      })
    )
  );

  if (selection.note) wrap.appendChild(h('div', { class: 'note warn small', text: selection.note }));
  if (plan.caution) wrap.appendChild(h('div', { class: 'note plain small', text: plan.caution }));

  // The package itself.
  wrap.appendChild(sectionRule('The work being credited'));
  if (selection.selected.length === 0) {
    wrap.appendChild(
      h('div', { class: 'note warn' }, h('strong', { text: 'Nothing is selected at this cut. ' }), 'Either no recommendation is practicable enough for "' + (modeMeta.label || mode) + '", or no effort has been declared. Declare the effort on the recommendations register and the ranking fills in.', h('div', { class: 'btn-row', style: { 'margin-top': '7px' } }, h('button', { class: 'btn sm', text: 'Open the register', onclick: () => go('recommendations') })))
    );
  } else {
    const rows = selection.selected.map((x) =>
      h(
        'tr',
        {},
        h('td', { class: 'mono small', text: recRef(x.recommendation) }),
        h('td', { text: truncate(x.recommendation.text, 130) }),
        h('td', {}, h('span', { class: 'badge ' + (x.doability.band === 'DO_NOW' ? 'verified' : x.doability.band === 'PROJECT' ? 'missing' : 'inferred'), text: x.doability.bandLabel })),
        h('td', { class: 'mono small', text: x.doability.score + '/100' + (x.doability.partial ? ' (' + x.doability.coverage + '% declared)' : '') }),
        h('td', { class: 'mono small', text: x.benefit.measured ? String(x.benefit.riskDelta) : 'not quantified' }),
        h('td', { class: 'small muted', text: x.benefit.measured ? x.benefit.quantified + ' of ' + x.benefit.scenarioCount + ' row(s)' : x.benefit.note ? 'no residual rating' : 'no row linked' })
      )
    );
    wrap.appendChild(
      tableWrap(
        [
          { label: 'Ref', width: '8%' },
          { label: 'Action', width: '40%' },
          { label: 'When', width: '13%' },
          { label: 'Doability', width: '13%' },
          { label: 'Risk removed', width: '12%' },
          { label: 'Measured on', width: '14%' },
        ],
        rows,
        { tableClass: 'wide-register' }
      )
    );
  }

  if (selection.undecidable.length) {
    wrap.appendChild(sectionRule('Not ranked, because the effort is undeclared'));
    wrap.appendChild(
      h('p', {
        class: 'muted small',
        text:
          'A recommendation nobody has costed is not a cheap one. These are left out of the ranking rather than assumed easy — declare the effort on the register and they join it.',
      })
    );
    const rows = selection.undecidable.slice(0, 20).map((u) =>
      h(
        'tr',
        {},
        h('td', { class: 'mono small', text: recRef(u.recommendation) }),
        h('td', { text: truncate(u.recommendation.text, 140) }),
        h('td', { class: 'small', text: u.missing.map((mm) => mm.label).join(', ') }),
        h('td', {}, h('button', { class: 'btn sm', text: 'Declare it', onclick: () => go('recommendations', { recId: u.recommendation.id }) }))
      )
    );
    wrap.appendChild(
      tableWrap(
        [
          { label: 'Ref', width: '8%' },
          { label: 'Action', width: '42%' },
          { label: 'Undeclared', width: '38%' },
          { label: '', width: '12%' },
        ],
        rows,
        { tableClass: 'wide-register' }
      )
    );
  }

  // Rows that do not move, and why. This is the section a reviewer reads.
  const stuck = plan.points.filter((x) => !x.after);
  if (stuck.length) {
    wrap.appendChild(sectionRule('Rows the picture does not move, and why'));
    const rows = stuck.slice(0, 30).map((x) =>
      h(
        'tr',
        {},
        h('td', { class: 'mono small', text: x.ref }),
        h('td', { text: truncate(x.deviation || '', 120) }),
        h('td', {}, bandChip(m, x.before.band)),
        h('td', { class: 'small', text: x.reasonNotMoved || '' })
      )
    );
    wrap.appendChild(
      tableWrap(
        [
          { label: 'Row', width: '8%' },
          { label: 'Deviation', width: '38%' },
          { label: 'Stays at', width: '14%' },
          { label: 'Because', width: '40%' },
        ],
        rows,
        { tableClass: 'wide-register' }
      )
    );
    if (stuck.length > 30) wrap.appendChild(h('p', { class: 'muted small', text: 'Showing 30 of ' + stuck.length + '.' }));
  }

  return wrap;
}

function scenarioDialog(mark, plan) {
  const pt = plan.points.find((x) => x.scenarioId === mark.scenarioId);
  if (!pt) return;
  const sc = scoped('scenarios').find((x) => x.id === mark.scenarioId);
  const m = matrix();
  const body = h('div', {});
  body.appendChild(h('p', { style: { 'font-size': '13px' }, text: pt.deviation || '' }));
  body.appendChild(
    h(
      'dl',
      { class: 'kv' },
      h('dt', { text: 'Initial' }),
      h('dd', {}, bandChip(m, pt.before.band), h('span', { class: 'mono small', text: '  L' + pt.before.likelihood + ' × S' + pt.before.severity + ' = ' + pt.before.score })),
      h('dt', { text: 'After the selected work' }),
      h(
        'dd',
        {},
        pt.after
          ? h('span', {}, bandChip(m, pt.after.band), h('span', { class: 'mono small', text: '  L' + pt.after.likelihood + ' × S' + pt.after.severity + ' = ' + pt.after.score }))
          : h('span', { class: 'muted', text: pt.reasonNotMoved || 'unchanged' })
      ),
      pt.creditedTo.length ? h('dt', { text: 'Credited to' }) : null,
      pt.creditedTo.length ? h('dd', { class: 'mono small', text: pt.creditedTo.join(', ') }) : null,
      sc && sc.residualBasisKind ? h('dt', { text: 'Basis for the reduction' }) : null,
      sc && sc.residualBasisKind ? h('dd', {}, h('span', { class: 'tag', text: sc.residualBasisKind }), h('div', { class: 'small', text: sc.residualBasisText || '' })) : null
    )
  );
  if (sc) {
    body.appendChild(sectionRule('Causes'));
    body.appendChild(h('ul', { class: 'small', style: { margin: '0 0 0 16px' } }, (sc.causes || []).map((c) => h('li', { text: c.text }))));
    body.appendChild(sectionRule('Consequences'));
    body.appendChild(h('ul', { class: 'small', style: { margin: '0 0 0 16px' } }, (sc.consequences || []).map((c) => h('li', { text: c.text }))));
    body.appendChild(sectionRule('Safeguards credited'));
    body.appendChild(h('ul', { class: 'small', style: { margin: '0 0 0 16px' } }, (sc.existingSafeguards || []).map((c) => h('li', { text: c.text + (c.class ? ' [' + c.class + ']' : '') }))));
  }
  drawer('Row ' + pt.ref, body, [
    h('button', { class: 'btn', text: 'Close', onclick: closeDrawer }),
    h('button', { class: 'btn primary', text: 'Open on the worksheet', onclick: () => { closeDrawer(); go('hazop', { nodeId: pt.nodeId, scenarioId: pt.scenarioId }); } }),
  ]);
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
