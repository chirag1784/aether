// app/views/documents.js — document register, ingestion pipeline, data review.
//
// Pipeline: upload -> hash -> classify -> parse -> extract -> locator ->
// confidence -> canonical mapping -> user review.
// Scanned-image OCR and P&ID graphical parsing need the server deployment;
// the browser extracts text layers only and says so.

import { h, field, input, select, textarea, toast, drawer, closeDrawer, confirmAction, emptyState, sectionRule, dateFmt, dtFmt, statusBadge, statusExplain, truncate, tableWrap, uid, nowIso, tile } from '../util.js';
import { S, go, render, project, scoped, chemById, equipById } from '../state.js';
import { aiAvailable, extractFromDocument } from '../ai.js';
import { sourcePrecedence } from '../../packages/domain/status.js';

const DOC_CLASSES = [
  'PFD', 'P&ID', 'BMR / BPR', 'SOP / SMP', 'SDS / MSDS', 'Equipment datasheet',
  'Line list', 'Instrument index', 'Cause & effect / interlock matrix',
  'Relief device datasheet', 'Chemical inventory', 'Licence / consent / approval',
  'EC / CTE / CTO / CCA', 'PESO licence', 'Factory registration', 'Fire approval',
  'Boiler document', 'Electrical inspection', 'Emergency plan',
  'Past HAZOP / QRA', 'Other',
];

const CRITICAL_FIELDS = ['capacity', 'designPressure', 'designTemperature', 'quantity', 'reliefArrangement', 'materialOfConstruction', 'operatingTemperature', 'flashPoint'];

export function renderDocuments() {
  const p = project();
  if (!p) return h('div', { class: 'page' }, emptyState('No project selected', 'Pick a project first.', null));

  const docs = scoped('documents').slice().sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  const page = h('div', { class: 'page wide' });

  page.appendChild(
    h(
      'div',
      { class: 'page-head' },
      h('div', {}, h('div', { class: 'eyebrow', text: 'Document intelligence' }), h('h1', { class: 'page-title', text: 'Documents' })),
      h('div', { class: 'page-actions' }, h('button', { class: 'btn primary', text: 'Register a document', onclick: () => uploadDialog(p) }))
    )
  );
  page.appendChild(h('p', { class: 'page-sub', text: 'Every extracted value keeps the document, version, page and the original text it came from. Two documents that disagree produce a conflict, not an average.' }));

  const caps = window.__HAZOP_CAPS || {};
  if (!caps.assets) {
    page.appendChild(
      h('div', { class: 'note plain', style: { 'margin-bottom': '12px' } }, h('strong', { text: 'File storage is not available in this view. ' }), 'You can still register documents and paste their text for extraction — the register, the provenance chain and the report\'s document list all work. Uploading the file itself needs edit access to this page.')
    );
  }

  if (!docs.length) {
    page.appendChild(emptyState('No documents registered', 'Register the PFD, BMR, SDSs and any licences the study relies on. A document can be registered with its metadata alone — the file is optional, and the report prints the register either way.', h('button', { class: 'btn primary', text: 'Register a document', onclick: () => uploadDialog(p) })));
    return page;
  }

  const rows = docs.map((d) => {
    const fields = scoped('extracted_fields').filter((f) => (f.sourceRefs || []).some((r) => r.documentId === d.id));
    return h(
      'tr',
      {},
      h('td', {}, h('div', { style: { 'font-weight': '500' }, text: d.title }), h('div', { class: 'muted small', text: [d.docNumber, d.docRevision ? 'Rev ' + d.docRevision : null].filter(Boolean).join(' · ') })),
      h('td', {}, h('span', { class: 'pill', text: d.docClass || 'Other' })),
      h('td', { class: 'mono small', text: d.sha256 ? d.sha256.slice(0, 12) : '—' }),
      h('td', { class: 'num', text: d.version || 1 }),
      h('td', { class: 'num', text: d.pageCount || '—' }),
      h('td', {}, parseBadge(d)),
      h('td', { class: 'num', text: fields.length }),
      h('td', { class: 'small muted nowrap', text: d.issuedDate ? dateFmt(d.issuedDate) : '—' }),
      h(
        'td',
        { class: 'nowrap' },
        h('button', { class: 'btn sm ghost', text: 'Open', onclick: () => docDrawer(d) }),
        d.text ? h('button', { class: 'btn sm ghost', text: 'Extract', onclick: () => runExtraction(d) }) : null
      )
    );
  });

  page.appendChild(
    tableWrap(
      [{ label: 'Document' }, { label: 'Class' }, { label: 'SHA-256' }, { label: 'Ver', cls: 'num' }, { label: 'Pages', cls: 'num' }, { label: 'Parse' }, { label: 'Fields', cls: 'num' }, { label: 'Issued' }, { label: '' }],
      rows
    )
  );

  return page;
}

function parseBadge(d) {
  const map = { PARSED: 'verified', PENDING: 'missing', FAILED: 'conflict', TEXT_ONLY: 'extracted', METADATA_ONLY: 'na', NO_TEXT_LAYER: 'sourced' };
  const label = { PARSED: 'PARSED', PENDING: 'PENDING', FAILED: 'FAILED', TEXT_ONLY: 'TEXT', METADATA_ONLY: 'METADATA', NO_TEXT_LAYER: 'NO TEXT LAYER' };
  const s = d.parseStatus || 'PENDING';
  return h('span', { class: 'badge ' + (map[s] || 'missing'), text: label[s] || s, title: d.parseError || '' });
}

// ------------------------------------------------------------------ upload

function uploadDialog(p) {
  const title = input({ placeholder: 'Document title', id: 'd-title' });
  const cls = select(DOC_CLASSES.map((c) => ({ value: c, label: c })), 'PFD', { id: 'd-class' });
  const number = input({ placeholder: 'Document number', id: 'd-number' });
  const rev = input({ placeholder: 'Revision', id: 'd-rev' });
  const issued = input({ type: 'date', id: 'd-issued' });
  const file = h('input', { type: 'file', id: 'd-file', accept: '.pdf,.txt,.csv,.md,.json,.xml,.htm,.html' });
  const pasted = textarea({ placeholder: 'Or paste the document text here — extraction works from pasted text exactly as it does from a file.', rows: 5, id: 'd-text' });
  const status = h('div', { class: 'field-hint', text: '' });

  const body = h(
    'div',
    {},
    field('Title', title),
    h('div', { class: 'grid c2' }, field('Class', cls), field('Document number', number), field('Revision', rev), field('Issued date', issued)),
    field('File', file, 'PDF text layers, and plain text / CSV / Markdown, are read in the browser. A scanned PDF has no text layer — register it and paste the text, or use the server deployment for OCR.'),
    field('Document text', pasted),
    status
  );

  drawer('Register a document', body, [
    h('button', { class: 'btn', text: 'Cancel', onclick: closeDrawer }),
    h('button', {
      class: 'btn primary',
      text: 'Register',
      onclick: async (e) => {
        const btn = e.target;
        btn.disabled = true;
        try {
          status.textContent = 'Reading…';
          const f = file.files && file.files[0];
          let text = pasted.value.trim();
          let sha = null;
          let pages = null;
          let parseStatus = 'METADATA_ONLY';
          let parseError = null;
          let assetId = null;
          let assetUrl = null;

          if (f) {
            const buf = await f.arrayBuffer();
            sha = await sha256Hex(buf);
            if (/\.pdf$/i.test(f.name)) {
              status.textContent = 'Extracting the PDF text layer…';
              const out = await extractPdfText(buf);
              pages = out.pages;
              if (out.text.trim().length > 40) {
                text = out.text;
                parseStatus = 'PARSED';
              } else {
                parseStatus = 'NO_TEXT_LAYER';
                parseError = 'The PDF has no usable text layer (' + out.pages + ' page(s) scanned). Paste the text, or run OCR in the server deployment.';
              }
            } else {
              text = new TextDecoder().decode(buf);
              parseStatus = 'PARSED';
            }
            const caps = window.__HAZOP_CAPS || {};
            if (caps.assets) {
              try {
                status.textContent = 'Storing the file…';
                const up = await caps.assets.upload(f);
                assetId = up.id;
                assetUrl = up.url;
              } catch (err) {
                parseError = (parseError ? parseError + ' ' : '') + 'File storage failed: ' + ((err && err.message) || 'unknown');
              }
            }
          } else if (text) {
            sha = await sha256Hex(new TextEncoder().encode(text).buffer);
            parseStatus = 'TEXT_ONLY';
          }

          const rec = await S.store.create(
            'documents',
            {
              projectId: p.id,
              title: title.value.trim() || (f ? f.name : 'Untitled document'),
              docClass: cls.value,
              docNumber: number.value.trim(),
              docRevision: rev.value.trim(),
              issuedDate: issued.value || null,
              fileName: f ? f.name : null,
              mimeType: f ? f.type : text ? 'text/plain' : null,
              byteSize: f ? f.size : text ? text.length : null,
              sha256: sha,
              pageCount: pages,
              version: 1,
              parseStatus,
              parseError,
              assetId,
              assetUrl,
              text: text ? text.slice(0, 400000) : null,
            },
            { projectId: p.id }
          );

          await S.store.create('sources', { projectId: p.id, sourceType: 'PROJECT_DOCUMENT', title: rec.title, locator: rec.docNumber || null, documentId: rec.id, sha256: sha, retrievedAt: nowIso() }, { projectId: p.id });

          closeDrawer();
          toast('Document registered', 'ok');
          if (text && aiAvailable()) runExtraction(rec);
          else render();
        } catch (err) {
          status.textContent = '';
          toast('Could not register the document: ' + ((err && err.message) || 'unknown error'), 'err');
          btn.disabled = false;
        }
      },
    }),
  ]);
}

async function sha256Hex(buf) {
  if (!(window.crypto && window.crypto.subtle)) return null;
  const digest = await window.crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function extractPdfText(buf) {
  const lib = window.pdfjsLib;
  if (!lib) return { text: '', pages: null };
  try {
    if (lib.GlobalWorkerOptions) lib.GlobalWorkerOptions.workerSrc = window.__PDFJS_WORKER || '';
    const pdf = await lib.getDocument({ data: buf, disableWorker: !window.__PDFJS_WORKER, isEvalSupported: false }).promise;
    const parts = [];
    const max = Math.min(pdf.numPages, 60);
    for (let i = 1; i <= max; i += 1) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const line = content.items.map((it) => it.str).join(' ');
      parts.push('[page ' + i + '] ' + line);
    }
    return { text: parts.join('\n'), pages: pdf.numPages };
  } catch (e) {
    return { text: '', pages: null, error: (e && e.message) || 'PDF read failed' };
  }
}

// -------------------------------------------------------------- extraction

async function runExtraction(doc) {
  if (!aiAvailable()) {
    toast('Extraction needs AI assistance, which is not available in this view. You can enter the values by hand on the process, equipment and chemicals pages.', 'err');
    return;
  }
  if (!doc.text) {
    toast('This document has no text to extract from. Paste its text on the document panel.', 'err');
    return;
  }
  const p = project();
  if (p && p.confidentialDocuments !== false) {
    const ok = await confirmAction('Send this document\'s text for extraction?', 'The project is set to treat documents as confidential. Extraction sends the text to Claude on your own account. Turn the setting off on the project profile to stop being asked, or cancel here.');
    if (!ok) return;
  }
  toast('Extracting…');
  try {
    const out = await extractFromDocument(doc, doc.text);
    const applied = await applyExtraction(doc, out.extraction, out.runId);
    await S.store.update('documents', doc.id, { parseStatus: 'PARSED', lastExtractedAt: nowIso(), lastAiRunId: out.runId }, { projectId: doc.projectId });
    toast(applied.fields + ' field(s), ' + applied.equipment + ' equipment, ' + applied.chemicals + ' chemical(s) extracted · ' + applied.conflicts + ' conflict(s) raised', 'ok');
    go('data-review');
  } catch (e) {
    toast('Extraction failed: ' + ((e && e.message) || 'unknown error'), 'err');
  }
}

/**
 * Write the extraction into the project model. Nothing overwrites a VERIFIED or
 * USER_CONFIRMED value; a disagreement becomes a conflict record.
 */
async function applyExtraction(doc, ex, runId) {
  const pid = doc.projectId;
  const counts = { fields: 0, equipment: 0, chemicals: 0, conflicts: 0, steps: 0, team: 0 };
  const refOf = (page, quote) => [{ sourceType: 'PROJECT_DOCUMENT', documentId: doc.id, documentName: doc.title, version: doc.version || 1, page: page || null, quote: quote ? String(quote).slice(0, 400) : null, extractedAt: nowIso() }];

  for (const f of (ex.fields || []).slice(0, 200)) {
    if (!f || !f.field) continue;
    const rec = await S.store.create(
      'extracted_fields',
      {
        projectId: pid,
        entityKind: f.entityKind || 'project',
        entityRef: f.entityRef || null,
        field: String(f.field).slice(0, 80),
        value: f.value === null || f.value === undefined ? null : String(f.value).slice(0, 300),
        unit: f.unit ? String(f.unit).slice(0, 24) : null,
        rawText: f.quote ? String(f.quote).slice(0, 400) : null,
        status: 'DOCUMENT_EXTRACTED',
        confidence: Number(f.confidence) >= 0 ? Number(f.confidence) : null,
        method: 'ai-extract',
        sourceRefs: refOf(f.page, f.quote),
        aiRunId: runId,
      },
      { projectId: pid, actorKind: 'ai', aiRunId: runId }
    );
    counts.fields += 1;
    const conflict = await checkConflict(pid, rec);
    if (conflict) counts.conflicts += 1;
  }

  for (const e of (ex.equipment || []).slice(0, 80)) {
    if (!e || !e.tag) continue;
    const existing = scoped('equipment').filter((x) => String(x.tag).toLowerCase() === String(e.tag).toLowerCase())[0];
    if (existing) {
      // Do not overwrite; record what this document says as an extracted field.
      for (const key of ['type', 'service', 'capacity', 'moc']) {
        if (!e[key]) continue;
        const target = key === 'moc' ? 'materialOfConstruction' : key;
        if (String(existing[target] || '') === String(e[key])) continue;
        const rec = await S.store.create('extracted_fields', { projectId: pid, entityKind: 'equipment', entityId: existing.id, entityRef: e.tag, field: target, value: String(e[key]).slice(0, 300), status: 'DOCUMENT_EXTRACTED', method: 'ai-extract', sourceRefs: refOf(e.page, e.quote), aiRunId: runId }, { projectId: pid, actorKind: 'ai', aiRunId: runId });
        counts.fields += 1;
        if (await checkConflict(pid, rec)) counts.conflicts += 1;
      }
      continue;
    }
    await S.store.create('equipment', { projectId: pid, tag: String(e.tag).slice(0, 40), type: e.type || null, service: e.service || null, capacity: e.capacity || null, materialOfConstruction: e.moc || null, sourceRefs: refOf(e.page, e.quote), status: 'DOCUMENT_EXTRACTED' }, { projectId: pid, actorKind: 'ai', aiRunId: runId });
    counts.equipment += 1;
  }

  for (const c of (ex.chemicals || []).slice(0, 60)) {
    if (!c || !c.name) continue;
    const existing = scoped('chemicals').filter((x) => String(x.canonicalName).toLowerCase() === String(c.name).toLowerCase())[0];
    if (existing) {
      if (c.quantity && String(existing.quantity || '') !== String(c.quantity)) {
        const rec = await S.store.create('extracted_fields', { projectId: pid, entityKind: 'chemical', entityId: existing.id, entityRef: c.name, field: 'quantity', value: String(c.quantity), unit: c.unit || null, status: 'DOCUMENT_EXTRACTED', method: 'ai-extract', sourceRefs: refOf(c.page, c.quote), aiRunId: runId }, { projectId: pid, actorKind: 'ai', aiRunId: runId });
        counts.fields += 1;
        if (await checkConflict(pid, rec)) counts.conflicts += 1;
      }
      continue;
    }
    const qty = parseQty(c.quantity);
    await S.store.create(
      'chemicals',
      {
        projectId: pid,
        canonicalName: String(c.name).slice(0, 160),
        cas: c.cas ? String(c.cas).slice(0, 20) : null,
        quantity: qty.value,
        quantityUnit: qty.unit || (c.unit ? String(c.unit) : null),
        quantityStatus: qty.value === null ? 'MISSING' : 'DOCUMENT_EXTRACTED',
        physicalState: c.state || null,
        identityStatus: 'DOCUMENT_EXTRACTED',
        sourceRefs: refOf(c.page, c.quote),
      },
      { projectId: pid, actorKind: 'ai', aiRunId: runId }
    );
    counts.chemicals += 1;
  }

  for (const s of (ex.processSteps || []).slice(0, 60)) {
    if (!s || !s.title) continue;
    if (scoped('process_steps').some((x) => String(x.title).toLowerCase() === String(s.title).toLowerCase())) continue;
    await S.store.create('process_steps', { projectId: pid, stepNumber: String(s.stepNumber || '').slice(0, 16), title: String(s.title).slice(0, 200), description: String(s.description || '').slice(0, 1600), sortOrder: counts.steps, sourceRefs: refOf(s.page, null) }, { projectId: pid, actorKind: 'ai', aiRunId: runId });
    counts.steps += 1;
  }

  for (const t of (ex.teamMembers || []).slice(0, 40)) {
    if (!t || !t.name) continue;
    if (scoped('team_members').some((x) => String(x.name).toLowerCase() === String(t.name).toLowerCase())) continue;
    await S.store.create('team_members', { projectId: pid, name: String(t.name).slice(0, 120), designation: t.designation || null, department: t.department || null, organization: t.organization || null, role: normalizeRole(t.role), sortOrder: counts.team, sourceRefs: refOf(t.page, null), status: 'DOCUMENT_EXTRACTED' }, { projectId: pid, actorKind: 'ai', aiRunId: runId });
    counts.team += 1;
  }

  return counts;
}

function parseQty(s) {
  if (s === null || s === undefined) return { value: null, unit: null };
  const m = /^\s*([0-9]+(?:\.[0-9]+)?)\s*([A-Za-z/³°%]+)?/.exec(String(s));
  if (!m) return { value: null, unit: null };
  return { value: Number(m[1]), unit: m[2] || null };
}

function normalizeRole(r) {
  const t = String(r || '').toLowerCase();
  const roles = ['chairman', 'facilitator', 'process engineer', 'production', 'maintenance', 'instrumentation', 'electrical', 'ehs', 'quality', 'project', 'r&d', 'consultant', 'recorder'];
  for (const role of roles) if (t.indexOf(role.split(' ')[0]) !== -1) return role;
  return 'other';
}

/** Raise a conflict when a new extracted value disagrees with an existing one. */
async function checkConflict(pid, rec) {
  const siblings = scoped('extracted_fields').filter(
    (f) => f.id !== rec.id && f.field === rec.field && f.entityKind === rec.entityKind && String(f.entityId || f.entityRef || '') === String(rec.entityId || rec.entityRef || '')
  );
  if (!siblings.length) return false;
  const candidates = siblings.concat([rec]).map((f) => ({ id: f.id, value: f.value, normalizedValue: normalizeForCompare(f.value, f.unit), normalizedUnit: f.unit, status: f.status }));
  const p = project();
  const resolution = sourcePrecedence(candidates, { allowPrecedence: !!(p && p.sourcePrecedenceEnabled) });
  if (resolution.status !== 'CONFLICT') return false;

  const key = rec.entityKind + '|' + (rec.entityId || rec.entityRef || '') + '|' + rec.field;
  const existing = scoped('field_conflicts').filter((c) => c.key === key && c.status === 'OPEN')[0];
  const ids = candidates.map((c) => c.id);
  if (existing) {
    await S.store.update('field_conflicts', existing.id, { candidateIds: Array.from(new Set((existing.candidateIds || []).concat(ids))) }, { projectId: pid });
    return true;
  }
  await S.store.create(
    'field_conflicts',
    { projectId: pid, key, entityKind: rec.entityKind, entityId: rec.entityId || null, entityRef: rec.entityRef || null, field: rec.field, candidateIds: ids, critical: CRITICAL_FIELDS.indexOf(rec.field) !== -1, status: 'OPEN', reason: resolution.reason },
    { projectId: pid }
  );
  return true;
}

function normalizeForCompare(value, unit) {
  const n = Number(String(value || '').replace(/[, ]/g, ''));
  if (!Number.isFinite(n)) return null;
  return n;
}

// ------------------------------------------------------------ document panel

function docDrawer(d) {
  const fields = scoped('extracted_fields').filter((f) => (f.sourceRefs || []).some((r) => r.documentId === d.id));
  const textArea = textarea({ value: d.text || '', rows: 8, id: 'dd-text' });
  const body = h(
    'div',
    { class: 'stack' },
    h(
      'dl',
      { class: 'kv' },
      h('dt', { text: 'Class' }), h('dd', { text: d.docClass || '—' }),
      h('dt', { text: 'Number / revision' }), h('dd', { text: [d.docNumber, d.docRevision].filter(Boolean).join(' Rev ') || '—' }),
      h('dt', { text: 'File' }), h('dd', { text: d.fileName || 'No file stored' }),
      h('dt', { text: 'SHA-256' }), h('dd', { class: 'mono small', text: d.sha256 || '—' }),
      h('dt', { text: 'Pages' }), h('dd', { text: d.pageCount || '—' }),
      h('dt', { text: 'Parse status' }), h('dd', {}, parseBadge(d), d.parseError ? h('div', { class: 'muted small', text: d.parseError }) : null),
      h('dt', { text: 'Registered' }), h('dd', { text: dtFmt(d.createdAt) }),
      h('dt', { text: 'Last extraction' }), h('dd', { text: d.lastExtractedAt ? dtFmt(d.lastExtractedAt) : 'Not extracted' })
    ),
    d.assetUrl ? h('div', {}, h('a', { class: 'btn sm', href: d.assetUrl, target: '_blank', rel: 'noopener', text: 'Open the stored file' })) : null,
    h('div', { class: 'section-rule' }, h('h2', { text: 'Document text' })),
    field('Text used for extraction', textArea, 'Paste or correct the text here. Extraction reads exactly this.'),
    h('div', { class: 'btn-row' }, h('button', { class: 'btn sm', text: 'Save text', onclick: async () => { await S.store.update('documents', d.id, { text: textArea.value.slice(0, 400000), parseStatus: textArea.value.trim() ? 'TEXT_ONLY' : d.parseStatus }, { projectId: d.projectId }); toast('Text saved', 'ok'); closeDrawer(); render(); } }), h('button', { class: 'btn sm primary', text: 'Extract fields', disabled: !d.text, onclick: () => { closeDrawer(); runExtraction(d); } })),
    h('div', { class: 'section-rule' }, h('h2', { text: 'Extracted from this document (' + fields.length + ')' })),
    fields.length
      ? h('ul', { class: 'list-none stack' }, fields.slice(0, 60).map((f) => h('li', { class: 'note plain' }, h('div', { class: 'row', style: { gap: '6px' } }, h('span', { class: 'mono small', text: f.entityKind + '.' + f.field }), statusBadge(f.status)), h('div', { text: (f.value || '—') + (f.unit ? ' ' + f.unit : '') }), (f.sourceRefs || [])[0] && (f.sourceRefs[0].page || f.sourceRefs[0].quote) ? h('div', { class: 'muted small', text: (f.sourceRefs[0].page ? 'p.' + f.sourceRefs[0].page + ' — ' : '') + truncate(f.sourceRefs[0].quote || '', 160) }) : null)))
      : h('p', { class: 'muted small', text: 'Nothing extracted from this document yet.' })
  );
  drawer(d.title, body, [h('button', { class: 'btn danger', text: 'Remove document', onclick: async () => { const ok = await confirmAction('Remove "' + d.title + '" from the register?', 'Values already extracted from it stay in the project but lose their source link, which will show as a provenance gap in the report.'); if (!ok) return; await S.store.remove('documents', d.id, { projectId: d.projectId }); closeDrawer(); toast('Document removed'); render(); } }), h('button', { class: 'btn', text: 'Close', onclick: closeDrawer })]);
}

// ------------------------------------------------------------- data review

export function renderDataReview() {
  const p = project();
  if (!p) return h('div', { class: 'page' }, emptyState('No project selected', 'Pick a project first.', null));

  const fields = scoped('extracted_fields');
  const conflicts = scoped('field_conflicts').filter((c) => c.status === 'OPEN');
  const pending = fields.filter((f) => f.status === 'DOCUMENT_EXTRACTED' || f.status === 'WEB_SOURCED' || f.status === 'AI_INFERRED');
  const page = h('div', { class: 'page wide' });

  page.appendChild(h('div', { class: 'page-head' }, h('div', {}, h('div', { class: 'eyebrow', text: 'Completeness and conflict engine' }), h('h1', { class: 'page-title', text: 'Data review' }))));
  page.appendChild(h('p', { class: 'page-sub', text: 'Accept what the documents say, mark what you have verified, and resolve disagreements. Nothing here is resolved automatically unless the project explicitly enables source precedence.' }));

  page.appendChild(h('div', { class: 'grid c4' }, tile('Extracted values', fields.length, 'Across every document'), tile('Awaiting review', pending.length, 'Extracted but not accepted', pending.length ? 'accent' : 'ok'), tile('Open conflicts', conflicts.length, conflicts.filter((c) => c.critical).length + ' on critical fields', conflicts.length ? 'crit' : 'ok'), tile('Verified', fields.filter((f) => f.status === 'VERIFIED').length, 'Checked against a controlling source')));

  if (conflicts.length) {
    page.appendChild(sectionRule('Conflicts — engineering review required'));
    for (const c of conflicts) page.appendChild(conflictCard(c));
  }

  page.appendChild(sectionRule('Extracted values'));
  if (!fields.length) {
    page.appendChild(emptyState('Nothing extracted yet', 'Register a document and run extraction, or enter values directly on the process, equipment and chemicals pages.', h('button', { class: 'btn primary', text: 'Go to documents', onclick: () => go('documents') })));
    return page;
  }

  const rows = fields
    .slice()
    .sort((a, b) => (a.entityKind + a.field).localeCompare(b.entityKind + b.field))
    .map((f) => {
      const ref = (f.sourceRefs || [])[0] || {};
      return h(
        'tr',
        {},
        h('td', { class: 'mono small' }, f.entityKind, h('br'), h('span', { class: 'muted', text: f.entityRef || (f.entityId ? labelFor(f) : '') })),
        h('td', { class: 'mono small', text: f.field }),
        h('td', {}, h('strong', { text: (f.value === null || f.value === undefined ? '—' : String(f.value)) + (f.unit ? ' ' + f.unit : '') })),
        h('td', {}, statusBadge(f.status, { title: statusExplain(f.status) })),
        h('td', { class: 'num small', text: f.confidence === null || f.confidence === undefined ? '—' : Math.round(f.confidence * 100) + '%' }),
        h('td', { class: 'small muted' }, ref.documentName ? h('span', {}, ref.documentName, ref.page ? h('span', { class: 'mono', text: ' p.' + ref.page } ) : null) : h('span', { text: f.method === 'manual' ? 'Entered manually' : '—' })),
        h('td', { class: 'small muted', text: truncate(ref.quote || '', 90) }),
        h(
          'td',
          { class: 'nowrap' },
          f.status !== 'USER_CONFIRMED' && f.status !== 'VERIFIED' ? h('button', { class: 'btn sm ghost', text: 'Accept', title: 'Record that you accept this value as the project value.', onclick: () => setStatus(f, 'USER_CONFIRMED') }) : null,
          f.status !== 'VERIFIED' ? h('button', { class: 'btn sm ghost', text: 'Verify', title: 'Record that you have checked this against the controlling source.', onclick: () => setStatus(f, 'VERIFIED') }) : null,
          h('button', { class: 'btn sm ghost', text: 'N/A', onclick: () => setStatus(f, 'NOT_APPLICABLE') })
        )
      );
    });

  page.appendChild(tableWrap([{ label: 'Entity' }, { label: 'Field' }, { label: 'Value' }, { label: 'Status' }, { label: 'Conf.', cls: 'num' }, { label: 'Source' }, { label: 'Original text' }, { label: '' }], rows));
  return page;
}

function labelFor(f) {
  if (f.entityKind === 'equipment') {
    const e = equipById(f.entityId);
    return e ? e.tag : '';
  }
  if (f.entityKind === 'chemical') {
    const c = chemById(f.entityId);
    return c ? c.canonicalName : '';
  }
  return '';
}

async function setStatus(f, status) {
  if (status === 'VERIFIED' && ['admin', 'facilitator', 'reviewer'].indexOf(S.actor.role) === -1) {
    toast('Marking a value VERIFIED needs the facilitator or reviewer role.', 'err');
    return;
  }
  await S.store.update('extracted_fields', f.id, { status, verifiedBy: status === 'VERIFIED' ? S.actor.id : f.verifiedBy || null, verifiedAt: status === 'VERIFIED' ? nowIso() : f.verifiedAt || null }, { projectId: f.projectId, field: 'status' });
  render();
}

function conflictCard(c) {
  const candidates = (c.candidateIds || []).map((id) => scoped('extracted_fields').filter((f) => f.id === id)[0]).filter(Boolean);
  const card = h('div', { class: 'card', style: { 'border-left': '2px solid var(--critical)' } });
  card.appendChild(h('div', { class: 'between' }, h('h3', { class: 'card-title' }, c.field, ' ', h('span', { class: 'muted small', text: c.entityKind + (c.entityRef ? ' · ' + c.entityRef : '') })), h('span', { class: 'badge conflict', text: c.critical ? 'CRITICAL CONFLICT' : 'CONFLICT' })));
  card.appendChild(h('p', { class: 'card-note', text: c.reason === 'PRECEDENCE_DISABLED' ? 'Sources disagree. Automatic resolution is off for this project, so the field stays a conflict until you decide.' : 'Sources of equal standing disagree, so precedence cannot resolve it.' }));

  const list = h('div', { class: 'stack' });
  for (const f of candidates) {
    const ref = (f.sourceRefs || [])[0] || {};
    list.appendChild(
      h(
        'div',
        { class: 'note plain' },
        h('div', { class: 'between' }, h('strong', { text: (f.value === null ? '—' : String(f.value)) + (f.unit ? ' ' + f.unit : '') }), statusBadge(f.status)),
        h('div', { class: 'muted small', text: [ref.documentName, ref.page ? 'p.' + ref.page : null].filter(Boolean).join(' · ') || (f.method === 'manual' ? 'Entered manually' : '') }),
        ref.quote ? h('div', { class: 'small', style: { 'font-style': 'italic' }, text: '“' + truncate(ref.quote, 200) + '”' } ) : null,
        h('div', { class: 'btn-row', style: { 'margin-top': '6px' } }, h('button', { class: 'btn sm', text: 'Use this value', onclick: () => resolveConflict(c, f, 'RESOLVED') }))
      )
    );
  }
  card.appendChild(list);
  card.appendChild(
    h(
      'div',
      { class: 'btn-row', style: { 'margin-top': '10px' } },
      h('button', { class: 'btn sm ghost', text: 'Keep as a conflict and record an assumption', onclick: () => keepAsAssumption(c, candidates) }),
      h('button', { class: 'btn sm ghost', text: 'Enter a different value', onclick: () => enterValue(c) })
    )
  );
  return card;
}

async function resolveConflict(c, chosen, status) {
  for (const id of c.candidateIds || []) {
    if (id === chosen.id) continue;
    const other = scoped('extracted_fields').filter((f) => f.id === id)[0];
    // The losing value is retained, marked so the report can still show it.
    if (other) await S.store.update('extracted_fields', id, { supersededBy: chosen.id, status: other.status === 'VERIFIED' ? other.status : 'NOT_APPLICABLE', supersededReason: 'Not selected in conflict resolution' }, { projectId: c.projectId, field: 'status' });
  }
  await S.store.update('extracted_fields', chosen.id, { status: 'USER_CONFIRMED' }, { projectId: c.projectId, field: 'status' });
  await S.store.update('field_conflicts', c.id, { status, resolvedValueId: chosen.id, resolvedBy: S.actor.id, resolvedAt: nowIso() }, { projectId: c.projectId });
  toast('Conflict resolved. The other value is kept in the record.', 'ok');
  render();
}

function keepAsAssumption(c, candidates) {
  const text = textarea({ rows: 3, id: 'ca-text', value: 'Sources disagree on ' + c.field + ' (' + candidates.map((f) => String(f.value) + (f.unit ? ' ' + f.unit : '')).join(' vs ') + '). The study proceeds on the more conservative value pending engineering confirmation.' });
  drawer('Record the conflict as an assumption', h('div', {}, field('Assumption', text), h('p', { class: 'field-hint', text: 'The conflict stays open and is printed in the report\'s missing-data register together with this assumption.' })), [
    h('button', { class: 'btn', text: 'Cancel', onclick: closeDrawer }),
    h('button', {
      class: 'btn primary',
      text: 'Record',
      onclick: async () => {
        await S.store.create('assumptions', { projectId: c.projectId, category: 'Data conflict', text: text.value.trim(), basis: 'Conflict on ' + c.entityKind + '.' + c.field, raisedBy: S.actor.id }, { projectId: c.projectId });
        await S.store.update('field_conflicts', c.id, { status: 'ACCEPTED_AS_ASSUMPTION', resolvedBy: S.actor.id, resolvedAt: nowIso() }, { projectId: c.projectId });
        closeDrawer();
        toast('Assumption recorded; the conflict stays visible.', 'ok');
        render();
      },
    }),
  ]);
}

function enterValue(c) {
  const val = input({ id: 'cv-val' });
  const unit = input({ id: 'cv-unit' });
  const basis = textarea({ rows: 2, id: 'cv-basis', placeholder: 'What did you check to get this value?' });
  drawer('Enter the project value', h('div', {}, h('div', { class: 'grid c2' }, field('Value', val), field('Unit', unit)), field('Basis', basis)), [
    h('button', { class: 'btn', text: 'Cancel', onclick: closeDrawer }),
    h('button', {
      class: 'btn primary',
      text: 'Save as verified',
      onclick: async () => {
        const rec = await S.store.create('extracted_fields', { projectId: c.projectId, entityKind: c.entityKind, entityId: c.entityId, entityRef: c.entityRef, field: c.field, value: val.value.trim(), unit: unit.value.trim() || null, status: 'VERIFIED', method: 'manual', rawText: basis.value.trim(), sourceRefs: [{ sourceType: 'PROJECT_DOCUMENT', documentName: 'Entered by ' + (S.actor.name || 'user'), extractedAt: nowIso() }], verifiedBy: S.actor.id, verifiedAt: nowIso() }, { projectId: c.projectId });
        await resolveConflict(c, rec, 'RESOLVED');
        closeDrawer();
      },
    }),
  ]);
}
