// app/util.js — DOM helpers, formatting, ids.
// Every value that comes from the store or from the model is rendered with
// textContent. There is no innerHTML path for data anywhere in the app.

export function h(tag, attrs) {
  const el = document.createElement(tag);
  const a = attrs || {};
  for (const k of Object.keys(a)) {
    const v = a[k];
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = String(v);
    else if (k === 'dataset') for (const dk of Object.keys(v)) el.dataset[dk] = v[dk];
    else if (k === 'style') for (const sk of Object.keys(v)) el.style.setProperty(sk, v[sk]);
    else if (k.slice(0, 2) === 'on' && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'value') el.value = v;
    else if (k === 'checked' || k === 'disabled' || k === 'selected' || k === 'hidden' || k === 'multiple' || k === 'readOnly') el[k] = !!v;
    else el.setAttribute(k, String(v));
  }
  const kids = Array.prototype.slice.call(arguments, 2);
  add(el, kids);
  return el;
}

function add(el, kids) {
  for (const k of kids) {
    if (k === null || k === undefined || k === false || k === '') continue;
    if (Array.isArray(k)) add(el, k);
    else if (typeof k === 'string' || typeof k === 'number') el.appendChild(document.createTextNode(String(k)));
    else el.appendChild(k);
  }
}

export function clear(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
  return el;
}

export function frag() {
  const f = document.createDocumentFragment();
  add(f, Array.prototype.slice.call(arguments));
  return f;
}

export function qs(sel, root) {
  return (root || document).querySelector(sel);
}

// ---------------------------------------------------------------- ids

let counter = 0;
export function uid(prefix) {
  counter += 1;
  const rnd = Math.random().toString(36).slice(2, 8);
  // Path-segment safe: letters, digits and dashes only.
  return (prefix || 'id') + '-' + Date.now().toString(36) + '-' + counter.toString(36) + rnd;
}

export function nowIso() {
  return new Date().toISOString();
}

export function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

// -------------------------------------------------------------- format

export function num(v, dp) {
  if (v === null || v === undefined || v === '' || !Number.isFinite(Number(v))) return '—';
  const d = dp === undefined ? 2 : dp;
  return Number(Number(v).toFixed(d)).toLocaleString('en-IN');
}

export function pct(v) {
  if (v === null || v === undefined || !Number.isFinite(Number(v))) return '—';
  return Math.round(Number(v)) + '%';
}

export function dateFmt(v) {
  if (!v) return '—';
  const s = String(v).slice(0, 10);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return s;
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return m[3] + ' ' + months[Number(m[2]) - 1] + ' ' + m[1];
}

export function dtFmt(v) {
  if (!v) return '—';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v);
  return dateFmt(d.toISOString()) + ' ' + d.toISOString().slice(11, 16) + ' UTC';
}

export function titleCase(s) {
  return String(s || '')
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b[a-z]/g, (c) => c.toUpperCase());
}

export function sentenceCase(s) {
  const t = String(s || '').replace(/_/g, ' ').toLowerCase();
  return t.charAt(0).toUpperCase() + t.slice(1);
}

export function truncate(s, n) {
  const t = String(s || '');
  return t.length > n ? t.slice(0, n - 1) + '…' : t;
}

export function listText(arr, key) {
  return (arr || []).map((x) => (key ? x[key] : x)).filter(Boolean).join(', ');
}

// -------------------------------------------------------------- badges

const STATUS_CLASS = {
  VERIFIED: 'verified',
  USER_CONFIRMED: 'confirmed',
  DOCUMENT_EXTRACTED: 'extracted',
  WEB_SOURCED: 'sourced',
  AI_INFERRED: 'inferred',
  CONFLICT: 'conflict',
  MISSING: 'missing',
  NOT_APPLICABLE: 'na',
};

const STATUS_SHORT = {
  VERIFIED: 'VERIFIED',
  USER_CONFIRMED: 'CONFIRMED',
  DOCUMENT_EXTRACTED: 'FROM DOC',
  WEB_SOURCED: 'WEB',
  AI_INFERRED: 'AI',
  CONFLICT: 'CONFLICT',
  MISSING: 'MISSING',
  NOT_APPLICABLE: 'N/A',
};

export function statusBadge(status, opts) {
  const s = status || 'MISSING';
  const o = opts || {};
  return h('span', {
    class: 'badge ' + (STATUS_CLASS[s] || 'missing'),
    title: o.title || statusExplain(s),
    text: o.long ? s.replace(/_/g, ' ') : STATUS_SHORT[s] || s,
  });
}

export function statusExplain(s) {
  const map = {
    VERIFIED: 'Checked against a controlling source by an authorized user.',
    USER_CONFIRMED: 'Asserted by a user with no document backing; recorded as an assumption.',
    DOCUMENT_EXTRACTED: 'Extracted from an uploaded document with a page/locator reference.',
    WEB_SOURCED: 'Retrieved from an external source with a URL and retrieval date.',
    AI_INFERRED: 'Model inference from other project facts. Cannot support a conclusion on its own.',
    CONFLICT: 'Two or more sources disagree after normalization. Blocks conclusions until resolved.',
    MISSING: 'No value recorded. Blocks conclusions.',
    NOT_APPLICABLE: 'Explicitly not relevant, with a recorded reason.',
  };
  return map[s] || s;
}

export function riskBadge(result) {
  if (!result || !result.ok) {
    return h('span', { class: 'risk-badge risk-none', title: (result && result.reason) === 'MISSING_INPUT' ? 'Not rated — both likelihood and severity are required. No default is applied.' : 'Not rated' }, 'not rated');
  }
  return h(
    'span',
    { class: 'risk-badge risk-' + result.bandKey, title: result.bandLabel + ' — ' + (result.basis || '') + ' · ' + (result.action || '') },
    result.bandLabel,
    result.score !== null && result.score !== undefined ? h('span', { class: 'rb-score', text: String(result.score) }) : null
  );
}

const APPLIC_CLASS = {
  APPLICABLE_CONFIRMED: 'conflict',
  POTENTIALLY_APPLICABLE: 'sourced',
  NOT_APPLICABLE_CONFIRMED: 'na',
  NOT_ENOUGH_DATA: 'missing',
  REQUIRES_LEGAL_REVIEW: 'inferred',
};

const APPLIC_SHORT = {
  APPLICABLE_CONFIRMED: 'APPLICABLE',
  POTENTIALLY_APPLICABLE: 'POTENTIAL',
  NOT_APPLICABLE_CONFIRMED: 'NOT APPLIC.',
  NOT_ENOUGH_DATA: 'NO DATA',
  REQUIRES_LEGAL_REVIEW: 'LEGAL REVIEW',
};

export function applicBadge(status) {
  return h('span', {
    class: 'badge ' + (APPLIC_CLASS[status] || 'missing'),
    text: APPLIC_SHORT[status] || status,
    title: status.replace(/_/g, ' '),
  });
}

const EXPIRY_CLASS = { VALID: 'verified', RENEWAL_DUE: 'sourced', EXPIRING_SOON: 'sourced', EXPIRED: 'conflict', NO_EXPIRY: 'na', UNKNOWN: 'missing' };

export function expiryBadge(e) {
  const days = e && Number.isFinite(Number(e.daysRemaining)) ? Number(e.daysRemaining) : null;
  const label = e ? e.status.replace(/_/g, ' ') : 'UNKNOWN';
  const suffix = days === null ? '' : days < 0 ? ' ' + Math.abs(days) + 'd ago' : ' ' + days + 'd';
  return h('span', { class: 'badge ' + ((e && EXPIRY_CLASS[e.status]) || 'missing'), text: label + suffix, title: (e && e.reason) || '' });
}

// --------------------------------------------------------------- toast

export function toast(message, kind) {
  const host = qs('#toasts');
  if (!host) return;
  const t = h('div', { class: 'toast' + (kind ? ' ' + kind : ''), text: message });
  host.appendChild(t);
  setTimeout(() => {
    t.style.transition = 'opacity .3s';
    t.style.opacity = '0';
    setTimeout(() => t.remove(), 320);
  }, kind === 'err' ? 6000 : 3200);
}

// -------------------------------------------------------------- drawer

let openDrawer = null;

export function drawer(title, bodyNode, footNodes) {
  closeDrawer();
  const scrim = h('div', { class: 'drawer-scrim', onclick: closeDrawer });
  const panel = h(
    'aside',
    { class: 'drawer', role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
    h('div', { class: 'drawer-head' }, h('h2', { text: title }), h('button', { class: 'btn ghost icon', onclick: closeDrawer, 'aria-label': 'Close', text: '✕' })),
    h('div', { class: 'drawer-body' }, bodyNode),
    footNodes ? h('div', { class: 'drawer-foot' }, footNodes) : null
  );
  document.body.appendChild(scrim);
  document.body.appendChild(panel);
  openDrawer = [scrim, panel];
  const onKey = (e) => {
    if (e.key === 'Escape') closeDrawer();
  };
  document.addEventListener('keydown', onKey);
  openDrawer.onKey = onKey;
  const focusable = panel.querySelector('input, select, textarea, button.primary, button');
  if (focusable) focusable.focus();
  return panel;
}

export function closeDrawer() {
  if (!openDrawer) return;
  document.removeEventListener('keydown', openDrawer.onKey);
  for (const n of openDrawer) n.remove();
  openDrawer = null;
}

export function confirmAction(message, detail) {
  return new Promise((resolve) => {
    const body = h('div', { class: 'stack' }, h('p', { text: message, style: { margin: '0', 'font-size': '13.5px' } }), detail ? h('p', { class: 'muted small', text: detail, style: { margin: '0' } }) : null);
    drawer('Confirm', body, [
      h('button', { class: 'btn', onclick: () => { closeDrawer(); resolve(false); }, text: 'Cancel' }),
      h('button', { class: 'btn primary', onclick: () => { closeDrawer(); resolve(true); }, text: 'Confirm' }),
    ]);
  });
}

// ---------------------------------------------------------------- forms

export function field(label, control, hint) {
  return h('label', { class: 'field' }, h('span', { text: label }), control, hint ? h('div', { class: 'field-hint', text: hint }) : null);
}

export function input(attrs) {
  return h('input', Object.assign({ type: 'text' }, attrs || {}));
}

export function select(options, value, attrs) {
  const sel = h('select', attrs || {});
  for (const o of options) {
    const opt = h('option', { value: o.value === undefined ? o : o.value, text: o.label === undefined ? String(o) : o.label });
    if (String(opt.value) === String(value)) opt.selected = true;
    sel.appendChild(opt);
  }
  return sel;
}

export function textarea(attrs) {
  return h('textarea', attrs || {});
}

/** Tri-state control: yes / no / not resolved. `null` is a real answer here. */
export function triState(value, onChange) {
  const wrap = h('div', { class: 'tri-group' });
  const opts = [
    { v: true, label: 'Yes' },
    { v: false, label: 'No' },
    { v: null, label: 'Not resolved', cls: 'unset' },
  ];
  for (const o of opts) {
    const b = h('button', {
      type: 'button',
      class: o.cls || '',
      'aria-pressed': String(value === o.v),
      text: o.label,
      onclick: () => onChange(o.v),
    });
    wrap.appendChild(b);
  }
  return wrap;
}

export function chips(items) {
  return h('div', { class: 'row', style: { gap: '4px' } }, (items || []).map((t) => h('span', { class: 'tag', text: String(t) })));
}

export function emptyState(title, body, actionNode) {
  return h('div', { class: 'empty' }, h('h3', { text: title }), h('p', { text: body }), actionNode);
}

export function meter(label, value, note, tone) {
  const cls = tone || (value >= 80 ? '' : value >= 50 ? 'warn' : 'low');
  return h(
    'div',
    { class: 'meter' },
    h('div', { class: 'meter-top' }, h('span', { text: label }), h('span', { class: 'meter-val', text: pct(value) })),
    h('div', { class: 'meter-track' }, h('div', { class: 'meter-fill ' + cls, style: { width: Math.max(0, Math.min(100, value || 0)) + '%' } })),
    note ? h('div', { class: 'tile-note', text: note }) : null
  );
}

export function tile(label, value, note, tone) {
  return h('div', { class: 'tile' + (tone ? ' ' + tone : '') }, h('div', { class: 'tile-label', text: label }), h('div', { class: 'tile-value', text: String(value) }), note ? h('div', { class: 'tile-note', text: note }) : null);
}

export function sectionRule(label, actionNode) {
  return h('div', { class: 'section-rule' }, h('h2', { text: label }), actionNode);
}

export function tableWrap(head, rows, opts) {
  const o = opts || {};
  const thead = h('thead', {}, h('tr', {}, head.map((c) => h('th', { class: c.cls || '', style: c.width ? { width: c.width } : null, text: c.label === undefined ? c : c.label }))));
  const tbody = h('tbody', {}, rows);
  return h('div', { class: 'table-wrap' + (o.wrapClass ? ' ' + o.wrapClass : '') }, h('table', { class: o.tableClass || '' }, thead, tbody));
}

/** Download without relying on a page-initiated download (sandbox blocks those). */
const DOWNLOAD_ERRORS = {
  declined: null, // the viewer said no; that is not an error
  rate_limited: 'A save prompt is already open. Finish that one, then try again.',
  too_large: 'That file is too large for the destination you chose. Export a single node or a single register instead of the whole project.',
  rejected_extension: 'This view will not accept that file type.',
  extension_not_enabled: 'That format is not available in this view. Use Print on the report preview for a PDF.',
  unavailable: 'Saving files is not available in this view. Use Print on the report preview for a PDF.',
  not_granted: 'Saving files is not allowed for this page. Use Print on the report preview for a PDF.',
};

export async function offerDownload(filename, data, mime) {
  const caps = window.__HAZOP_CAPS || {};
  if (!caps.downloads) {
    toast('Saving files is not available in this view. Use Print on the report preview for a PDF, or open the page in the Claude desktop app.', 'err');
    return false;
  }
  try {
    const out = await caps.downloads.save({ filename, data });
    if (out && out.status === 'delivered') toast(filename + ' delivered', 'ok');
    else toast('Saved ' + filename, 'ok');
    return true;
  } catch (e) {
    const code = (e && e.code) || '';
    if (code === 'declined' || code === 'cancelled') return false;
    const copy = Object.prototype.hasOwnProperty.call(DOWNLOAD_ERRORS, code) ? DOWNLOAD_ERRORS[code] : 'Could not save ' + filename + ': ' + ((e && e.message) || 'unknown error');
    if (copy) toast(copy, 'err');
    return false;
  }
}

export function debounce(fn, ms) {
  let t = null;
  return function () {
    const args = arguments;
    if (t) clearTimeout(t);
    t = setTimeout(() => fn.apply(null, args), ms || 300);
  };
}

export function groupBy(arr, keyFn) {
  const m = new Map();
  for (const x of arr || []) {
    const k = keyFn(x);
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(x);
  }
  return m;
}

export function sortBy(arr, keyFn, desc) {
  return (arr || []).slice().sort((a, b) => {
    const ka = keyFn(a);
    const kb = keyFn(b);
    if (ka === kb) return 0;
    const r = ka > kb ? 1 : -1;
    return desc ? -r : r;
  });
}
