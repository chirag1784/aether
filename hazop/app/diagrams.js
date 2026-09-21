// app/diagrams.js — the SVG drawings.
//
// Geometry comes from `packages/diagrams/geometry.js`; this file turns
// coordinates into elements and attaches the interaction. Every label goes in
// through `textContent`, like every other value in the app.
//
// The colours are the risk-band tokens from styles.css, so a band is the same
// colour in a diagram, a badge and a table cell. A diagram that invented its
// own palette would be a second, contradictory answer to "how bad is this".

import { h, svg, truncate } from './util.js';
import {
  matrixLayout,
  plotMigration,
  bandSlopeLayout,
  bowTieLayout,
  nodeFlowLayout,
  stackedBandBar,
} from '../packages/diagrams/geometry.js';
import { tryRiskFromLS } from '../packages/calculations/risk.js';

// Marker ids have to be unique across the whole document: two SVGs on one page
// sharing an id would both resolve to whichever came first.
let markerSeq = 0;
function arrowMarker() {
  markerSeq += 1;
  const id = 'hz-arrow-' + markerSeq;
  return {
    id,
    ref: 'url(#' + id + ')',
    defs: svg(
      'defs',
      {},
      svg(
        'marker',
        { id, viewBox: '0 0 10 10', refX: '8', refY: '5', markerWidth: '5', markerHeight: '5', orient: 'auto-start-reverse' },
        svg('path', { d: 'M 0 0 L 10 5 L 0 10 z', fill: 'var(--ink)' })
      )
    ),
  };
}

/** The band of a cell, for the layout's `bandOf` hook. */
function bandOf(matrix, l, s) {
  const r = tryRiskFromLS(matrix, l, s);
  return r && r.ok ? r.bandKey : null;
}

function bandFill(bandKey) {
  return bandKey ? 'var(--risk-' + String(bandKey).toLowerCase() + ', var(--surface-2))' : 'var(--surface-2)';
}

/**
 * The before-and-after risk matrix.
 *
 * `phase` is 'before', 'after' or 'both'. With 'both' the initial marks are
 * hollow, the residual marks solid, and an arrow joins them — one picture
 * instead of two the reader has to hold in their head.
 */
export function riskMatrixDiagram(req) {
  const matrix = req.matrix;
  const points = req.points || [];
  const phase = req.phase || 'both';
  const box = req.box || { width: 560, height: 440 };
  const onPick = req.onPick || null;

  const layout = matrixLayout({ matrix, bandOf, box });
  if (!layout.ok) {
    return h('p', { class: 'muted small', text: 'This matrix cannot be drawn: ' + layout.reason.toLowerCase().replace(/_/g, ' ') + '.' });
  }
  const plotted = plotMigration({ layout, points });
  const root = svg('svg', {
    class: 'diagram matrix-diagram',
    viewBox: '0 0 ' + box.width + ' ' + box.height,
    role: 'img',
    'aria-label':
      'Risk matrix, likelihood across and severity up, with ' + points.length + ' scenario(s) plotted.',
    preserveAspectRatio: 'xMidYMid meet',
  });

  const marker = arrowMarker();
  root.appendChild(marker.defs);

  // Cells.
  const cellsG = svg('g', { class: 'dg-cells' });
  for (const c of layout.cells) {
    cellsG.appendChild(
      svg('rect', {
        x: c.x,
        y: c.y,
        width: c.width,
        height: c.height,
        fill: bandFill(c.band),
        stroke: 'var(--bg)',
        'stroke-width': '1.5',
      })
    );
  }
  root.appendChild(cellsG);

  // Axis ticks.
  const axesG = svg('g', { class: 'dg-axes' });
  for (const t of layout.xTicks) {
    axesG.appendChild(
      svg('text', {
        x: t.x,
        y: t.y + 15,
        'text-anchor': 'middle',
        class: 'dg-tick',
        text: String(t.value),
      })
    );
    axesG.appendChild(
      svg('text', {
        x: t.x,
        y: t.y + 27,
        'text-anchor': 'middle',
        class: 'dg-tick-sub',
        text: truncate(t.label, 11),
      })
    );
  }
  for (const t of layout.yTicks) {
    axesG.appendChild(
      svg('text', { x: t.x - 7, y: t.y - 2, 'text-anchor': 'end', class: 'dg-tick', text: String(t.value) })
    );
    axesG.appendChild(
      svg('text', { x: t.x - 7, y: t.y + 9, 'text-anchor': 'end', class: 'dg-tick-sub', text: truncate(t.label, 13) })
    );
  }
  axesG.appendChild(
    svg('text', {
      x: layout.axisLabels.x.x,
      y: layout.axisLabels.x.y,
      'text-anchor': 'middle',
      class: 'dg-axis-label',
      text: 'Likelihood →',
    })
  );
  axesG.appendChild(
    svg('text', {
      x: layout.axisLabels.y.x,
      y: layout.axisLabels.y.y,
      'text-anchor': 'middle',
      class: 'dg-axis-label',
      transform: 'rotate(-90 ' + layout.axisLabels.y.x + ' ' + layout.axisLabels.y.y + ')',
      text: 'Severity →',
    })
  );
  root.appendChild(axesG);

  // Arrows, drawn under the marks.
  if (phase === 'both') {
    const arrowG = svg('g', { class: 'dg-arrows' });
    for (const a of plotted.arrows) {
      arrowG.appendChild(
        svg('line', {
          x1: a.x1,
          y1: a.y1,
          x2: a.x2,
          y2: a.y2,
          class: 'dg-arrow',
          'marker-end': marker.ref,
        })
      );
    }
    root.appendChild(arrowG);
  }

  // Marks.
  const marksG = svg('g', { class: 'dg-marks' });
  const wanted = plotted.marks.filter((m) => (phase === 'both' ? true : m.phase === phase));
  for (const m of wanted) {
    const solid = phase === 'before' ? true : m.phase === 'after';
    const title =
      m.ref +
      ' — ' +
      (m.deviation ? truncate(m.deviation, 60) + ' — ' : '') +
      (m.phase === 'before' ? 'initial' : 'after the selected work') +
      ': L' +
      m.likelihood +
      ' × S' +
      m.severity +
      (m.score !== null && m.score !== undefined ? ' = ' + m.score : '') +
      (m.phase === 'after' && m.reasonNotMoved ? '. ' + m.reasonNotMoved : '') +
      (m.phase === 'after' && m.creditedTo && m.creditedTo.length
        ? '. Credited to ' + m.creditedTo.join(', ') + '.'
        : '');
    const mark = svg(
      'g',
      { class: 'dg-mark' + (onPick ? ' pick' : ''), tabindex: onPick ? '0' : null, role: onPick ? 'button' : null },
      svg('circle', {
        cx: m.x,
        cy: m.y,
        r: m.r,
        class: 'dg-dot ' + (solid ? 'solid' : 'hollow'),
        fill: solid ? 'var(--ink)' : 'var(--bg)',
        stroke: 'var(--ink)',
        'stroke-width': solid ? '1' : '1.6',
      }),
      svg('title', { text: title })
    );
    if (onPick) {
      mark.addEventListener('click', () => onPick(m));
      mark.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onPick(m);
        }
      });
    }
    marksG.appendChild(mark);
  }
  root.appendChild(marksG);

  const wrap = h('div', { class: 'diagram-wrap' }, root);
  if (plotted.skipped.length) {
    wrap.appendChild(
      h('p', {
        class: 'muted small',
        text:
          plotted.skipped.length +
          ' rating(s) fall outside this matrix and are not drawn: ' +
          plotted.skipped.map((x) => x.ref).join(', ') +
          '.',
      })
    );
  }
  return wrap;
}

/** The legend for the matrix diagram. Separate so a page can place it freely. */
export function matrixLegend(req) {
  const matrix = req.matrix;
  const phase = req.phase || 'both';
  const row = h('div', { class: 'dg-legend' });
  for (const b of matrix.bands || []) {
    row.appendChild(
      h(
        'span',
        { class: 'dg-legend-item' },
        h('span', { class: 'dg-swatch', style: { background: bandFill(b.key) } }),
        h('span', { text: b.label })
      )
    );
  }
  if (phase === 'both') {
    row.appendChild(
      h(
        'span',
        { class: 'dg-legend-item' },
        h('span', { class: 'dg-swatch ring' }),
        h('span', { text: 'Initial rating' })
      )
    );
    row.appendChild(
      h(
        'span',
        { class: 'dg-legend-item' },
        h('span', { class: 'dg-swatch dot' }),
        h('span', { text: 'After the selected work' })
      )
    );
  }
  return row;
}

/**
 * The band slope chart: how many scenarios sit in each band before and after.
 * Reads top to bottom worst to least, so the eye lands on the intolerable row.
 */
export function bandSlopeDiagram(req) {
  const matrix = req.matrix;
  const counts = req.counts;
  const box = req.box || { width: 460, height: 250 };
  const layout = bandSlopeLayout({ matrix, counts, box });
  if (!layout.ok) return h('p', { class: 'muted small', text: 'No bands are defined on this matrix.' });

  const root = svg('svg', {
    class: 'diagram slope-diagram',
    viewBox: '0 0 ' + box.width + ' ' + box.height,
    role: 'img',
    'aria-label': 'Scenario count by risk band, before and after the selected work.',
    preserveAspectRatio: 'xMidYMid meet',
  });

  for (const c of layout.columns) {
    root.appendChild(
      svg('text', {
        x: c.x,
        y: 14,
        'text-anchor': c.key === 'before' ? 'start' : 'end',
        class: 'dg-axis-label',
        text: c.label,
      })
    );
  }

  for (const r of layout.rows) {
    root.appendChild(
      svg('text', {
        x: r.x1 - 8,
        y: r.y + 4,
        'text-anchor': 'end',
        class: 'dg-tick',
        text: r.label,
      })
    );
    // The connector. Thickness carries the count so a band with one scenario
    // does not shout as loudly as a band with twelve.
    const w = Math.max(1.5, Math.min(14, 1.5 + r.before * 2.2));
    root.appendChild(
      svg('path', {
        d:
          'M ' + r.x1 + ' ' + r.y + ' C ' + (r.x1 + (r.x2 - r.x1) * 0.45) + ' ' + r.y + ' ' +
          (r.x1 + (r.x2 - r.x1) * 0.55) + ' ' + r.y + ' ' + r.x2 + ' ' + r.y,
        stroke: bandFill(r.band),
        'stroke-width': String(w),
        fill: 'none',
        opacity: r.before === 0 && r.after === 0 ? '0.25' : '0.85',
      })
    );
    root.appendChild(
      svg(
        'g',
        {},
        svg('circle', { cx: r.x1, cy: r.y, r: 5, fill: bandFill(r.band), stroke: 'var(--bg)', 'stroke-width': '1.5' }),
        svg('circle', { cx: r.x2, cy: r.y, r: 5, fill: bandFill(r.band), stroke: 'var(--bg)', 'stroke-width': '1.5' }),
        svg('title', {
          text:
            r.label +
            ': ' +
            r.before +
            ' before, ' +
            r.after +
            ' after (' +
            (r.delta === 0 ? 'no change' : r.delta > 0 ? '+' + r.delta : String(r.delta)) +
            ').',
        })
      )
    );
    root.appendChild(svg('text', { x: r.x1 + 10, y: r.y + 4, class: 'dg-tick', text: String(r.before) }));
    root.appendChild(
      svg('text', { x: r.x2 - 10, y: r.y + 4, 'text-anchor': 'end', class: 'dg-tick', text: String(r.after) })
    );
    if (r.delta !== 0) {
      root.appendChild(
        svg('text', {
          x: r.x2 + 10,
          y: r.y + 4,
          class: 'dg-delta ' + (r.delta < 0 ? 'down' : 'up'),
          text: (r.delta > 0 ? '+' : '') + r.delta,
        })
      );
    }
  }

  return h('div', { class: 'diagram-wrap' }, root);
}

/** The thin band strip used in cards and headers. */
export function bandStrip(req) {
  const layout = stackedBandBar({ matrix: req.matrix, counts: req.counts, width: req.width || 300, height: req.height || 14 });
  const root = svg('svg', {
    class: 'diagram band-strip',
    viewBox: '0 0 ' + layout.width + ' ' + layout.height,
    role: 'img',
    'aria-label': req.label || 'Distribution by risk band.',
    preserveAspectRatio: 'none',
  });
  if (layout.total === 0) {
    root.appendChild(svg('rect', { x: 0, y: 0, width: layout.width, height: layout.height, fill: 'var(--surface-2)', rx: '3' }));
  } else {
    for (const seg of layout.segments) {
      root.appendChild(
        svg(
          'g',
          {},
          svg('rect', { x: seg.x, y: 0, width: Math.max(1, seg.width), height: layout.height, fill: bandFill(seg.band) }),
          svg('title', { text: seg.label + ': ' + seg.count })
        )
      );
    }
  }
  return root;
}

/**
 * The bow-tie for one scenario. Causes on the left through the preventive
 * barriers to the top event, then out through the mitigating barriers to the
 * consequences. An empty barrier column is drawn as an empty column and
 * labelled, because that absence is the finding.
 */
export function bowTieDiagram(req) {
  const box = req.box || { width: 980, height: 440 };
  const layout = bowTieLayout({
    causes: req.causes,
    consequences: req.consequences,
    preventive: req.preventive,
    mitigating: req.mitigating,
    topEvent: req.topEvent,
    box,
  });

  const root = svg('svg', {
    class: 'diagram bowtie-diagram',
    viewBox: '0 0 ' + box.width + ' ' + box.height,
    role: 'img',
    'aria-label':
      'Bow-tie for ' +
      (req.topEvent || 'the top event') +
      ': ' +
      layout.causes.length +
      ' cause(s), ' +
      layout.preventive.length +
      ' preventive barrier(s), ' +
      layout.mitigating.length +
      ' mitigating barrier(s), ' +
      layout.consequences.length +
      ' consequence(s).',
    preserveAspectRatio: 'xMidYMid meet',
  });

  for (const c of layout.columns) {
    root.appendChild(svg('text', { x: c.x, y: 14, 'text-anchor': 'middle', class: 'dg-col-label', text: c.label }));
  }

  const edgeG = svg('g', { class: 'dg-edges' });
  for (const e of layout.edges) {
    edgeG.appendChild(svg('path', { d: e.d, class: 'dg-edge', fill: 'none' }));
  }
  root.appendChild(edgeG);

  const nodeBox = (n, cls, label) =>
    svg(
      'g',
      { class: 'dg-node ' + cls },
      svg('rect', { x: n.x, y: n.y, width: n.width, height: n.height, rx: '4', class: 'dg-node-rect' }),
      wrapText(n.text, n.x + 6, n.y + 14, n.width - 12, n.height - 8),
      svg('title', { text: (label ? label + ': ' : '') + n.text })
    );

  for (const n of layout.causes) root.appendChild(nodeBox(n, 'cause', n.family || 'Cause'));
  for (const n of layout.consequences) root.appendChild(nodeBox(n, 'consequence', n.family || 'Consequence'));
  for (const n of layout.preventive)
    root.appendChild(nodeBox(n, 'barrier preventive' + (n.credited ? '' : ' uncredited'), 'Preventive barrier'));
  for (const n of layout.mitigating)
    root.appendChild(nodeBox(n, 'barrier mitigating' + (n.credited ? '' : ' uncredited'), 'Mitigating barrier'));

  root.appendChild(
    svg(
      'g',
      { class: 'dg-node event' },
      svg('rect', {
        x: layout.event.x,
        y: layout.event.y,
        width: layout.event.width,
        height: layout.event.height,
        rx: '6',
        class: 'dg-node-rect',
      }),
      wrapText(layout.event.text, layout.event.x + 8, layout.event.y + 18, layout.event.width - 16, layout.event.height - 12),
      svg('title', { text: 'Top event: ' + layout.event.text })
    )
  );

  const wrap = h('div', { class: 'diagram-wrap wide' }, root);
  const missing = [];
  if (layout.gaps.preventive) missing.push('no preventive barrier is recorded');
  if (layout.gaps.mitigating) missing.push('no mitigating barrier is recorded');
  if (layout.gaps.causes) missing.push('no cause is recorded');
  if (layout.gaps.consequences) missing.push('no consequence is recorded');
  if (missing.length) {
    wrap.appendChild(
      h('p', {
        class: 'note warn small',
        text: 'For this row ' + missing.join(', ') + '. A bow-tie with an empty column is the finding, not a drawing error.',
      })
    );
  }
  return wrap;
}

/** Break a label onto lines that fit the box. SVG has no text wrapping. */
function wrapText(text, x, y, width, maxHeight) {
  const g = svg('g', { class: 'dg-node-text' });
  const words = String(text || '').split(/\s+/).filter(Boolean);
  const charW = 5.4; // 9.5px monospace-ish average at our label size
  const perLine = Math.max(6, Math.floor(width / charW));
  const lineH = 11;
  const maxLines = Math.max(1, Math.floor(maxHeight / lineH));
  const lines = [];
  let cur = '';
  for (const w of words) {
    const next = cur ? cur + ' ' + w : w;
    if (next.length > perLine && cur) {
      lines.push(cur);
      cur = w;
      if (lines.length === maxLines) break;
    } else {
      cur = next;
    }
  }
  if (cur && lines.length < maxLines) lines.push(cur);
  if (lines.length === maxLines && words.join(' ').length > lines.join(' ').length) {
    lines[lines.length - 1] = truncate(lines[lines.length - 1], perLine - 1);
  }
  lines.forEach((ln, i) => {
    g.appendChild(svg('text', { x: x, y: y + i * lineH, class: 'dg-node-line', text: ln }));
  });
  return g;
}

/** The node's process steps, left to right, with their scenario load. */
export function nodeFlowDiagram(req) {
  const box = req.box || { width: 920, height: 138 };
  const layout = nodeFlowLayout({ steps: req.steps || [], box });
  if (!layout.ok) return h('p', { class: 'muted small', text: 'No process steps are recorded for this node.' });

  const root = svg('svg', {
    class: 'diagram flow-diagram',
    viewBox: '0 0 ' + box.width + ' ' + box.height,
    role: 'img',
    'aria-label': 'Process steps in this node, in order, with the number of worksheet rows on each.',
    preserveAspectRatio: 'xMidYMid meet',
  });

  const marker = arrowMarker();
  root.appendChild(marker.defs);
  for (const l of layout.links) {
    root.appendChild(
      svg('line', { x1: l.x1, y1: l.y1, x2: l.x2, y2: l.y2, class: 'dg-arrow', 'marker-end': marker.ref })
    );
  }

  for (const n of layout.nodes) {
    root.appendChild(
      svg(
        'g',
        { class: 'dg-node step' + (n.worstBand ? ' band-' + n.worstBand.toLowerCase() : '') },
        svg('rect', {
          x: n.x,
          y: n.y,
          width: n.width,
          height: n.height,
          rx: '4',
          class: 'dg-node-rect',
          stroke: n.worstBand ? bandFill(n.worstBand) : 'var(--line)',
          'stroke-width': n.worstBand ? '2.5' : '1',
        }),
        wrapText(n.label, n.x + 6, n.y + 14, n.width - 12, n.height - 28),
        svg('text', {
          x: n.x + n.width / 2,
          y: n.y + n.height - 6,
          'text-anchor': 'middle',
          class: 'dg-tick-sub',
          text:
            (n.equipment ? n.equipment + ' · ' : '') +
            n.scenarioCount +
            ' row' +
            (n.scenarioCount === 1 ? '' : 's') +
            (n.alertCount ? ' · ' + n.alertCount + ' alert' + (n.alertCount === 1 ? '' : 's') : ''),
        }),
        svg('title', {
          text:
            n.label +
            (n.equipment ? ' (' + n.equipment + ')' : '') +
            ': ' +
            n.scenarioCount +
            ' worksheet row(s)' +
            (n.alertCount ? ', ' + n.alertCount + ' hazard alert(s)' : '') +
            '.',
        })
      )
    );
  }

  const wrap = h('div', { class: 'diagram-wrap wide' }, root);
  if (layout.overflow) {
    wrap.appendChild(h('p', { class: 'muted small', text: 'Scroll sideways to see the rest of the sequence.' }));
  }
  return wrap;
}
