// Coordinates, not pictures.
//
// Every diagram in the app is laid out here and drawn in `app/diagrams.js`.
// Keeping the arithmetic in `packages/` means a matrix plot can be checked by
// a test instead of by squinting at a screenshot, and means the same layout
// serves the on-screen SVG and the printed report.
//
// Conventions: y grows downward (SVG). Likelihood runs left to right along x,
// severity runs bottom to top along y, which is how a risk matrix is read on
// paper. Every function returns plain data and touches no DOM.

export const DIAGRAM_VERSION = 'diagrams-1.0.0';

/** Deterministic small offset for a point, so two scenarios in one cell do not
 * sit on top of each other. Seeded from the id: the same scenario lands in the
 * same place every render, which matters when the picture is in a report. */
function jitter(seed, index, count, radius) {
  if (count <= 1) return { dx: 0, dy: 0 };
  let h = 2166136261;
  const s = String(seed);
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  // Spread the cell's occupants around a ring, starting at a per-cell angle.
  const base = ((h >>> 0) % 360) * (Math.PI / 180);
  const angle = base + (index / count) * Math.PI * 2;
  const r = count === 2 ? radius * 0.55 : radius * (0.45 + 0.35 * ((index % 2) === 0 ? 1 : 0.6));
  return { dx: Math.cos(angle) * r, dy: Math.sin(angle) * r };
}

/**
 * Lay out a risk matrix: the cell rectangles, the axis ticks and the band of
 * each cell. `matrix` is a `DEFAULT_MATRIX`-shaped object; `bandOf` is the
 * caller's `(matrix, l, s) => bandKey` (passed in so this module stays free of
 * the risk engine and can be tested on its own).
 */
export function matrixLayout(req) {
  const matrix = req.matrix;
  const bandOf = req.bandOf;
  const box = req.box || { width: 520, height: 420 };
  const pad = Object.assign({ top: 16, right: 16, bottom: 46, left: 74 }, req.pad || {});
  const ls = matrix.likelihoodScale || [];
  const ss = matrix.severityScale || [];
  const cols = ls.length;
  const rows = ss.length;
  if (cols === 0 || rows === 0) return { ok: false, reason: 'EMPTY_SCALE' };

  const plotW = box.width - pad.left - pad.right;
  const plotH = box.height - pad.top - pad.bottom;
  if (plotW <= 0 || plotH <= 0) return { ok: false, reason: 'BOX_TOO_SMALL' };
  const cw = plotW / cols;
  const ch = plotH / rows;

  const cells = [];
  for (let ci = 0; ci < cols; ci += 1) {
    for (let ri = 0; ri < rows; ri += 1) {
      const l = ls[ci].value;
      const s = ss[ri].value;
      // Severity ascends up the page: the highest severity is the top row.
      const y = pad.top + (rows - 1 - ri) * ch;
      cells.push({
        likelihood: l,
        severity: s,
        band: bandOf ? bandOf(matrix, l, s) : null,
        x: pad.left + ci * cw,
        y,
        width: cw,
        height: ch,
        cx: pad.left + ci * cw + cw / 2,
        cy: y + ch / 2,
      });
    }
  }

  return {
    ok: true,
    box,
    pad,
    cols,
    rows,
    cellWidth: cw,
    cellHeight: ch,
    cells,
    plot: { x: pad.left, y: pad.top, width: plotW, height: plotH },
    xTicks: ls.map((d, i) => ({
      value: d.value,
      label: d.label,
      descriptor: d.descriptor || null,
      x: pad.left + i * cw + cw / 2,
      y: pad.top + plotH,
    })),
    yTicks: ss.map((d, i) => ({
      value: d.value,
      label: d.label,
      descriptor: d.people || null,
      x: pad.left,
      y: pad.top + (rows - 1 - i) * ch + ch / 2,
    })),
    axisLabels: {
      x: { text: 'Likelihood', x: pad.left + plotW / 2, y: box.height - 8 },
      y: { text: 'Severity', x: 14, y: pad.top + plotH / 2 },
    },
  };
}

/** Where is the cell for this likelihood/severity pair? */
export function cellAt(layout, likelihood, severity) {
  if (!layout || !layout.ok) return null;
  return (
    layout.cells.find((c) => c.likelihood === Number(likelihood) && c.severity === Number(severity)) || null
  );
}

/**
 * Place the scenarios on a matrix layout.
 *
 * `points` are `migrationPlan()` points. Each returns a `before` position
 * always, an `after` position when one exists, and the arrow between them.
 * Occupants of a cell are spread on a ring so a stack of eight scenarios in
 * one cell reads as eight marks rather than one.
 */
export function plotMigration(req) {
  const layout = req.layout;
  const points = req.points || [];
  if (!layout || !layout.ok) return { ok: false, reason: 'NO_LAYOUT' };
  const radius = Math.min(layout.cellWidth, layout.cellHeight) * 0.28;
  const markR = Math.max(3.5, Math.min(7, Math.min(layout.cellWidth, layout.cellHeight) * 0.09));

  // Group by the cell each point starts in, so the jitter index is stable.
  const beforeGroups = new Map();
  for (const p of points) {
    const k = p.before.likelihood + ':' + p.before.severity;
    if (!beforeGroups.has(k)) beforeGroups.set(k, []);
    beforeGroups.get(k).push(p);
  }
  const afterGroups = new Map();
  for (const p of points) {
    const pos = p.after || p.before;
    const k = pos.likelihood + ':' + pos.severity;
    if (!afterGroups.has(k)) afterGroups.set(k, []);
    afterGroups.get(k).push(p);
  }

  const marks = [];
  const arrows = [];
  const skipped = [];

  for (const [k, group] of beforeGroups) {
    const cell = cellAt(layout, Number(k.split(':')[0]), Number(k.split(':')[1]));
    if (!cell) {
      for (const p of group) skipped.push({ ref: p.ref, why: 'Rating is off the scale of this matrix.' });
      continue;
    }
    group.forEach((p, i) => {
      const j = jitter(k, i, group.length, radius);
      marks.push({
        phase: 'before',
        scenarioId: p.scenarioId,
        ref: p.ref,
        deviation: p.deviation,
        band: p.before.band,
        score: p.before.score,
        likelihood: p.before.likelihood,
        severity: p.before.severity,
        x: cell.cx + j.dx,
        y: cell.cy + j.dy,
        r: markR,
        moved: p.moved,
      });
    });
  }

  for (const [k, group] of afterGroups) {
    const cell = cellAt(layout, Number(k.split(':')[0]), Number(k.split(':')[1]));
    if (!cell) continue;
    group.forEach((p, i) => {
      const j = jitter('a' + k, i, group.length, radius);
      const pos = p.after || p.before;
      marks.push({
        phase: 'after',
        scenarioId: p.scenarioId,
        ref: p.ref,
        deviation: p.deviation,
        band: pos.band,
        score: pos.score,
        likelihood: pos.likelihood,
        severity: pos.severity,
        x: cell.cx + j.dx,
        y: cell.cy + j.dy,
        r: markR,
        moved: p.moved,
        creditedTo: p.creditedTo || [],
        reasonNotMoved: p.reasonNotMoved || null,
      });
    });
  }

  // One arrow per scenario that actually moved.
  const byId = new Map();
  for (const m of marks) {
    if (!byId.has(m.scenarioId)) byId.set(m.scenarioId, {});
    byId.get(m.scenarioId)[m.phase] = m;
  }
  for (const [id, pair] of byId) {
    if (!pair.before || !pair.after) continue;
    const p = points.find((x) => x.scenarioId === id);
    if (!p || !p.moved) continue;
    const dx = pair.after.x - pair.before.x;
    const dy = pair.after.y - pair.before.y;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    // Stop the arrowhead short of the target mark so it points at it, not into it.
    const trim = pair.after.r + 2.5;
    arrows.push({
      scenarioId: id,
      ref: pair.before.ref,
      x1: pair.before.x + (dx / len) * (pair.before.r + 1),
      y1: pair.before.y + (dy / len) * (pair.before.r + 1),
      x2: pair.after.x - (dx / len) * trim,
      y2: pair.after.y - (dy / len) * trim,
      fromBand: pair.before.band,
      toBand: pair.after.band,
      creditedTo: pair.after.creditedTo || [],
    });
  }

  return { ok: true, marks, arrows, skipped, markRadius: markR };
}

/**
 * A slope chart of band counts, before against after — the picture that
 * answers "did the risk profile actually move".
 *
 * Bands are ordered as the matrix orders them, worst at the top, so a line
 * sloping downward means work has moved scenarios out of that band.
 */
export function bandSlopeLayout(req) {
  const matrix = req.matrix;
  const counts = req.counts || { before: {}, after: {} };
  const box = req.box || { width: 420, height: 260 };
  const pad = Object.assign({ top: 24, right: 96, bottom: 28, left: 96 }, req.pad || {});
  const bands = (matrix.bands || []).slice().reverse(); // worst first, top of chart
  if (bands.length === 0) return { ok: false, reason: 'NO_BANDS' };

  const maxCount = Math.max(
    1,
    ...bands.map((b) => Math.max(counts.before[b.key] || 0, counts.after[b.key] || 0))
  );
  const plotH = box.height - pad.top - pad.bottom;
  const rowH = plotH / bands.length;
  const xL = pad.left;
  const xR = box.width - pad.right;

  const rows = bands.map((b, i) => {
    const before = counts.before[b.key] || 0;
    const after = counts.after[b.key] || 0;
    const y = pad.top + i * rowH + rowH / 2;
    return {
      band: b.key,
      label: b.label,
      tone: b.tone,
      before,
      after,
      delta: after - before,
      y,
      x1: xL,
      x2: xR,
      // Bar widths for the optional paired-bar reading of the same data.
      beforeWidth: ((xR - xL) / 2 - 8) * (before / maxCount),
      afterWidth: ((xR - xL) / 2 - 8) * (after / maxCount),
      rowHeight: rowH,
      barHeight: Math.max(8, Math.min(22, rowH * 0.42)),
    };
  });

  return {
    ok: true,
    box,
    pad,
    rows,
    maxCount,
    columns: [
      { key: 'before', label: 'Before', x: xL },
      { key: 'after', label: 'After', x: xR },
    ],
  };
}

/**
 * Bow-tie layout for one scenario: causes on the left, the top event in the
 * middle, consequences on the right, with the preventive barriers between
 * cause and event and the mitigating barriers between event and consequence.
 *
 * This is the diagram that makes a HAZOP row legible to somebody who was not
 * in the workshop, which is most of the people who read the report.
 */
export function bowTieLayout(req) {
  const causes = req.causes || [];
  const consequences = req.consequences || [];
  const preventive = req.preventive || [];
  const mitigating = req.mitigating || [];
  const box = req.box || { width: 960, height: 420 };
  const pad = Object.assign({ top: 28, right: 12, bottom: 28, left: 12 }, req.pad || {});

  const colW = (box.width - pad.left - pad.right) / 5;
  const colX = (i) => pad.left + i * colW;
  const usableH = box.height - pad.top - pad.bottom;
  const spread = (n, height) => {
    if (n === 0) return [];
    const step = height / n;
    return Array.from({ length: n }, (_, i) => pad.top + step * i + step / 2);
  };

  const causeY = spread(causes.length, usableH);
  const consY = spread(consequences.length, usableH);
  const centreY = pad.top + usableH / 2;

  const nodeW = colW * 0.86;
  const nodeH = Math.max(28, Math.min(56, usableH / Math.max(3, Math.max(causes.length, consequences.length)) - 8));

  const causeNodes = causes.map((c, i) => ({
    kind: 'cause',
    id: c.id || 'c' + i,
    text: c.text || c.label || '',
    family: c.family || null,
    x: colX(0),
    y: causeY[i] - nodeH / 2,
    width: nodeW,
    height: nodeH,
    cx: colX(0) + nodeW,
    cy: causeY[i],
  }));

  const consNodes = consequences.map((c, i) => ({
    kind: 'consequence',
    id: c.id || 'q' + i,
    text: c.text || c.label || '',
    family: c.family || null,
    severity: c.severity === undefined ? null : c.severity,
    x: colX(4) + (colW - nodeW),
    y: consY[i] - nodeH / 2,
    width: nodeW,
    height: nodeH,
    cx: colX(4) + (colW - nodeW),
    cy: consY[i],
  }));

  const barrierH = Math.max(22, Math.min(40, usableH / Math.max(3, Math.max(preventive.length, mitigating.length)) - 6));
  const prevNodes = preventive.map((b, i) => {
    const ys = spread(preventive.length, usableH);
    return {
      kind: 'barrier',
      role: 'preventive',
      id: b.id || 'p' + i,
      text: b.text || b.label || '',
      barrierClass: b.class || b.safeguardClass || null,
      credited: b.credited !== false,
      x: colX(1) + (colW - nodeW) / 2,
      y: ys[i] - barrierH / 2,
      width: nodeW,
      height: barrierH,
      cx: colX(1) + colW / 2,
      cy: ys[i],
    };
  });
  const mitNodes = mitigating.map((b, i) => {
    const ys = spread(mitigating.length, usableH);
    return {
      kind: 'barrier',
      role: 'mitigating',
      id: b.id || 'm' + i,
      text: b.text || b.label || '',
      barrierClass: b.class || b.safeguardClass || null,
      credited: b.credited !== false,
      x: colX(3) + (colW - nodeW) / 2,
      y: ys[i] - barrierH / 2,
      width: nodeW,
      height: barrierH,
      cx: colX(3) + colW / 2,
      cy: ys[i],
    };
  });

  const eventW = colW * 0.94;
  const eventH = Math.max(56, Math.min(110, usableH * 0.34));
  const event = {
    kind: 'event',
    text: req.topEvent || 'Top event',
    x: colX(2) + (colW - eventW) / 2,
    y: centreY - eventH / 2,
    width: eventW,
    height: eventH,
    cx: colX(2) + colW / 2,
    cy: centreY,
  };

  // Paths: cause → (through the preventive column) → event, and the mirror.
  const edges = [];
  for (const c of causeNodes) {
    edges.push({
      from: c.id,
      to: 'event',
      side: 'left',
      d: pathThrough(c.cx, c.cy, colX(1) + colW / 2, event.x, event.cy),
    });
  }
  for (const q of consNodes) {
    edges.push({
      from: 'event',
      to: q.id,
      side: 'right',
      d: pathThrough(event.x + event.width, event.cy, colX(3) + colW / 2, q.cx, q.cy),
    });
  }

  return {
    ok: true,
    box,
    pad,
    event,
    causes: causeNodes,
    consequences: consNodes,
    preventive: prevNodes,
    mitigating: mitNodes,
    edges,
    columns: [
      { key: 'causes', label: 'Causes', x: colX(0) + nodeW / 2 },
      { key: 'preventive', label: 'Preventive barriers', x: colX(1) + colW / 2 },
      { key: 'event', label: 'Top event', x: colX(2) + colW / 2 },
      { key: 'mitigating', label: 'Mitigating barriers', x: colX(3) + colW / 2 },
      { key: 'consequences', label: 'Consequences', x: colX(4) + colW / 2 },
    ],
    gaps: {
      preventive: preventive.length === 0,
      mitigating: mitigating.length === 0,
      causes: causes.length === 0,
      consequences: consequences.length === 0,
    },
  };
}

/** A gentle S-curve from (x1,y1) to (x2,y2) passing the given x. */
function pathThrough(x1, y1, xm, x2, y2) {
  const c1 = x1 + (xm - x1) * 0.6;
  const c2 = x2 - (x2 - xm) * 0.6;
  return 'M ' + r(x1) + ' ' + r(y1) + ' C ' + r(c1) + ' ' + r(y1) + ' ' + r(c2) + ' ' + r(y2) + ' ' + r(x2) + ' ' + r(y2);
}

function r(n) {
  return Math.round(n * 100) / 100;
}

/**
 * The node flow strip: the process steps of a node, left to right, with the
 * equipment on each and the scenario count as a load indicator. It is the
 * "where am I" picture for the worksheet.
 */
export function nodeFlowLayout(req) {
  const steps = req.steps || [];
  const box = req.box || { width: 900, height: 132 };
  const pad = Object.assign({ top: 26, right: 12, bottom: 26, left: 12 }, req.pad || {});
  if (steps.length === 0) return { ok: false, reason: 'NO_STEPS' };
  const gap = 26;
  const avail = box.width - pad.left - pad.right - gap * (steps.length - 1);
  const w = Math.max(72, avail / steps.length);
  const h = box.height - pad.top - pad.bottom;
  const nodes = steps.map((s, i) => ({
    id: s.id,
    index: i,
    label: s.label || s.name || 'Step ' + (i + 1),
    equipment: s.equipment || null,
    scenarioCount: s.scenarioCount || 0,
    alertCount: s.alertCount || 0,
    worstBand: s.worstBand || null,
    x: pad.left + i * (w + gap),
    y: pad.top,
    width: w,
    height: h,
    cx: pad.left + i * (w + gap) + w / 2,
    cy: pad.top + h / 2,
  }));
  const links = nodes.slice(0, -1).map((n, i) => ({
    from: n.id,
    to: nodes[i + 1].id,
    x1: n.x + n.width,
    y1: n.cy,
    x2: nodes[i + 1].x,
    y2: nodes[i + 1].cy,
  }));
  return { ok: true, box, pad, nodes, links, overflow: w <= 72 && steps.length * 98 > box.width };
}

/**
 * A horizontal stacked bar of counts by band — used for the risk distribution
 * strip and for the "after" comparison beneath it.
 */
export function stackedBandBar(req) {
  const matrix = req.matrix;
  const counts = req.counts || {};
  const width = req.width || 320;
  const height = req.height || 18;
  const bands = matrix.bands || [];
  const total = bands.reduce((n, b) => n + (counts[b.key] || 0), 0);
  if (total === 0) return { ok: true, total: 0, segments: [], width, height };
  let x = 0;
  const segments = [];
  for (const b of bands) {
    const n = counts[b.key] || 0;
    if (n === 0) continue;
    const w = (n / total) * width;
    segments.push({ band: b.key, label: b.label, tone: b.tone, count: n, x, width: w, share: n / total });
    x += w;
  }
  return { ok: true, total, segments, width, height };
}
