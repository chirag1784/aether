// app/views/reports.js — the quality gate, the report preview (the PDF path)
// and the export buttons.

import { h, field, input, select, textarea, toast, drawer, closeDrawer, confirmAction, emptyState, sectionRule, tableWrap, tile, meter, riskBadge, statusBadge, applicBadge, truncate, dateFmt, dtFmt, nowIso, pct } from '../util.js';
import { S, go, render, project, scoped, qualityGate, reportReady, matrix, nodesSorted, scenariosFor, recommendationRegister, complianceRegister, dataGapsAll, chemicalsResolved, completeness } from '../state.js';
import { canSetReportStatus, REPORT_STATUSES, REPORT_SECTIONS, CAUTION_TEXT } from '../../packages/reports/quality-gate.js';
import { tryRiskFromLS } from '../../packages/calculations/risk.js';
import { exportDocx, exportHazopXlsx, exportRecommendationsXlsx, exportComplianceXlsx, exportJson, printReport, engineVersions } from '../exports.js';

const REPORT_TABS = [
  { key: 'gate', label: 'Quality gate' },
  { key: 'preview', label: 'Report preview' },
  { key: 'exports', label: 'Exports' },
  { key: 'revisions', label: 'Revisions' },
];

export function renderReports() {
  const p = project();
  if (!p) return h('div', { class: 'page' }, emptyState('No project selected', 'Pick a project first.', null));

  const tab = S.filters.reportTab || 'gate';
  const page = h('div', { class: 'page wide' });
  page.appendChild(h('div', { class: 'page-head' }, h('div', {}, h('div', { class: 'eyebrow', text: 'Report generator' }), h('h1', { class: 'page-title', text: 'Reports' }))));
  page.appendChild(h('p', { class: 'page-sub', text: 'A DRAFT export is always available. REVIEWED and APPROVED need every blocking check to pass and an authorized person to say so — the gate itself approves nothing.' }));

  const tabs = h('div', { class: 'tabs' });
  for (const t of REPORT_TABS) tabs.appendChild(h('button', { class: 'tab', 'aria-selected': String(t.key === tab), text: t.label, onclick: () => { S.filters.reportTab = t.key; render(); } }));
  page.appendChild(tabs);

  if (tab === 'gate') page.appendChild(gateTab(p));
  else if (tab === 'preview') page.appendChild(previewTab(p));
  else if (tab === 'exports') page.appendChild(exportsTab(p));
  else page.appendChild(revisionsTab(p));

  return page;
}

// ----------------------------------------------------------------- the gate

function gateTab(p) {
  const gate = qualityGate();
  const ready = reportReady();
  const wrap = h('div', {});

  wrap.appendChild(
    h(
      'div',
      { class: 'card' },
      h('div', { class: 'between' }, h('div', {}, h('h3', { class: 'card-title', text: 'Gate status: ' + gate.status.replace(/_/g, ' ') }), h('p', { class: 'card-note', text: gate.summary.blockingPassed + ' of ' + gate.summary.blockingTotal + ' blocking checks pass · ' + gate.summary.advisoryPassed + ' of ' + gate.summary.advisoryTotal + ' advisories' })), h('div', { class: 'meters' }, meter('Report readiness', ready.percent, ''))),
      h('div', { class: 'note ' + (gate.status === 'BLOCKED' ? 'crit' : gate.status === 'READY' ? '' : 'warn'), style: { 'margin-top': '10px' } }, gate.status === 'BLOCKED' ? 'Blocking items remain. A DRAFT export is still available and is watermarked.' : gate.status === 'READY' ? 'Every check passes. An authorized reviewer can mark this revision REVIEWED or APPROVED.' : 'Every blocking check passes; advisories remain. An authorized reviewer can proceed.'),
      h('div', { class: 'btn-row', style: { 'margin-top': '10px' } }, h('button', { class: 'btn', text: 'Export DRAFT (DOCX)', onclick: () => doExport(p, exportDocx, 'DRAFT') }), h('button', { class: 'btn primary', text: 'Record a revision', onclick: () => revisionDialog(p, gate) }))
    )
  );

  wrap.appendChild(sectionRule('Blocking checks'));
  wrap.appendChild(h('div', { class: 'card' }, gate.blocking.map((k) => checkRow(k))));

  wrap.appendChild(sectionRule('Advisory checks'));
  wrap.appendChild(h('div', { class: 'card' }, gate.advisory.map((k) => checkRow(k))));

  wrap.appendChild(h('div', { class: 'note plain', style: { 'margin-top': '14px' } }, h('strong', { text: 'Caution text printed on every export: ' }), CAUTION_TEXT));
  return wrap;
}

function checkRow(k) {
  return h(
    'div',
    { class: 'gate-check ' + (k.pass ? 'pass' : 'fail') + (k.severity === 'ADVISORY' ? ' advisory' : '') },
    h('div', { class: 'gate-icon', text: k.pass ? '✓' : k.severity === 'BLOCKING' ? '✕' : '!' }),
    h(
      'div',
      { style: { flex: '1', 'min-width': '0' } },
      h('div', { class: 'gate-label', text: k.label }),
      k.detail ? h('div', { class: 'gate-detail', text: k.detail }) : null,
      !k.pass && k.fixHint ? h('div', { class: 'gate-detail', style: { color: 'var(--ink-2)' }, text: '→ ' + k.fixHint }) : null
    ),
    !k.pass && k.route ? h('button', { class: 'btn sm ghost', text: 'Fix', onclick: () => go(k.route) }) : null
  );
}

// -------------------------------------------------------------- the preview

function previewTab(p) {
  const m = matrix();
  const gate = qualityGate();
  const reg = recommendationRegister();
  const creg = complianceRegister();
  const gaps = dataGapsAll();
  const nodes = nodesSorted();
  const status = S.selection.reportStatus || 'DRAFT';
  const wrap = h('div', {});

  wrap.appendChild(
    h('div', { class: 'filters no-print' }, h('label', { text: 'Print' }), h('button', { class: 'btn sm primary', text: 'Print / save as PDF', onclick: printReport }), h('span', { class: 'muted small', text: 'The print stylesheet breaks pages per node and prints risk bands as labels, not colour, so the PDF reads in monochrome.' }))
  );

  const doc = h('div', { class: 'stack' });

  // Cover
  doc.appendChild(
    h(
      'div',
      { class: 'card report-section' },
      h('div', { class: 'eyebrow', text: 'HAZOP study report' }),
      h('h2', { style: { 'font-size': '26px', margin: '4px 0 2px' }, text: p.projectName || '' }),
      h('p', { class: 'muted', text: [p.clientName, p.siteName].filter(Boolean).join(' · ') }),
      status === 'DRAFT' ? h('div', { class: 'note crit', style: { 'margin': '10px 0' }, text: 'DRAFT — not for issue' }) : null,
      h('dl', { class: 'kv' },
        h('dt', { text: 'Site address' }), h('dd', { text: p.siteAddress || '—' }),
        h('dt', { text: 'Product / process' }), h('dd', { text: [p.product, p.process, p.processStage].filter(Boolean).join(' · ') || '—' }),
        h('dt', { text: 'Revision' }), h('dd', { text: p.revision || 'R0' }),
        h('dt', { text: 'Study period' }), h('dd', { text: (p.studyStartDate ? dateFmt(p.studyStartDate) : '—') + ' to ' + (p.studyEndDate ? dateFmt(p.studyEndDate) : '—') }),
        h('dt', { text: 'Risk matrix' }), h('dd', { text: (m.name || m.id) + ' v' + m.version }),
        h('dt', { text: 'Generated' }), h('dd', { text: dtFmt(nowIso()) })
      )
    )
  );

  // Caution
  doc.appendChild(h('div', { class: 'card report-section' }, h('h3', { class: 'card-title', text: 'Caution and limitations' }), h('p', { style: { 'font-style': 'italic' }, text: CAUTION_TEXT })));

  // Scope and process
  doc.appendChild(h('div', { class: 'card report-section' }, h('h3', { class: 'card-title', text: 'Scope and process description' }), h('p', { text: p.processDescription || 'Not recorded.' }), p.chemistry ? h('div', {}, h('div', { class: 'tile-label', text: 'Chemistry' }), h('p', { text: p.chemistry })) : null));

  // Documents
  const docs = scoped('documents');
  doc.appendChild(h('div', { class: 'card report-section' }, h('h3', { class: 'card-title', text: 'Documents reviewed' }), docs.length ? tableWrap([{ label: 'Title' }, { label: 'Class' }, { label: 'Number' }, { label: 'Rev' }, { label: 'SHA-256' }], docs.map((d) => h('tr', {}, h('td', { text: d.title }), h('td', { text: d.docClass || '' }), h('td', { text: d.docNumber || '' }), h('td', { text: d.docRevision || '' }), h('td', { class: 'mono small', text: d.sha256 ? d.sha256.slice(0, 16) : '—' })))) : h('p', { class: 'muted', text: 'None registered.' })));

  // Legal summary
  const counts = {};
  for (const r of creg) counts[r.effectiveStatus] = (counts[r.effectiveStatus] || 0) + 1;
  doc.appendChild(
    h(
      'div',
      { class: 'card report-section' },
      h('h3', { class: 'card-title', text: 'Legal and regulatory applicability summary' }),
      h('p', { style: { 'font-style': 'italic' }, text: 'A status of POTENTIALLY_APPLICABLE, NOT_ENOUGH_DATA or REQUIRES_LEGAL_REVIEW is an unresolved question, not a finding of compliance or non-compliance.' }),
      tableWrap([{ label: 'Law / rule' }, { label: 'Section' }, { label: 'Obligation' }, { label: 'Applicability' }, { label: 'Why' }], creg.filter((r) => r.effectiveStatus !== 'NOT_APPLICABLE_CONFIRMED').map((r) => h('tr', {}, h('td', { class: 'small', text: r.instrumentTitle }), h('td', { class: 'small', text: truncate(r.sectionRuleSchedule || '', 40) }), h('td', { class: 'small', text: r.topic }), h('td', {}, applicBadge(r.effectiveStatus)), h('td', { class: 'small muted', text: truncate(r.humanReason || r.applicabilityReason || '', 160) }))))
    )
  );

  // Team
  const team = scoped('team_members');
  doc.appendChild(h('div', { class: 'card report-section' }, h('h3', { class: 'card-title', text: 'HAZOP team members' }), team.length ? tableWrap([{ label: '#' }, { label: 'Name' }, { label: 'Designation' }, { label: 'Department' }, { label: 'Role' }, { label: 'Signature' }], team.map((t, i) => h('tr', {}, h('td', { class: 'num', text: String(i + 1) }), h('td', { text: t.name }), h('td', { text: t.designation || '' }), h('td', { text: t.department || '' }), h('td', { text: t.role || '' }), h('td', { style: { 'min-width': '110px', 'border-bottom': '1px solid var(--line-strong)' }, text: ' ' })))) : h('p', { class: 'muted', text: 'None recorded.' })));

  // Chemical hazard summary
  const chems = chemicalsResolved();
  doc.appendChild(h('div', { class: 'card report-section' }, h('h3', { class: 'card-title', text: 'Chemical hazard summary' }), chems.length ? tableWrap([{ label: 'Chemical' }, { label: 'CAS' }, { label: 'Quantity' }, { label: 'State' }, { label: 'Classification' }, { label: 'Flash point' }], chems.map((c) => { const fp = scoped('chem_properties').filter((x) => x.chemicalId === c.id && x.key === 'flashPoint')[0]; return h('tr', {}, h('td', { text: c.canonicalName }), h('td', { class: 'mono small', text: c.cas || '—' }), h('td', { text: c.quantity === null || c.quantity === undefined ? 'NOT RECORDED' : c.quantity + ' ' + (c.quantityUnit || '') }), h('td', { text: c.physicalState || '—' }), h('td', { class: 'small', text: c.hazardousClassification || 'not recorded' }), h('td', {}, fp && fp.value !== null && fp.value !== undefined ? h('span', {}, String(fp.value) + ' ' + (fp.unit || '°C'), ' ', statusBadge(fp.status)) : h('span', { class: 'badge missing', text: 'UNKNOWN' }))); })) : h('p', { class: 'muted', text: 'None recorded.' })));

  // Node worksheets
  for (const node of nodes) {
    const rows = scenariosFor(node.id);
    doc.appendChild(
      h(
        'div',
        { class: 'card report-section' },
        h('h3', { class: 'card-title', text: 'Node ' + (node.nodeNumber || '') + ' — ' + (node.worksheetName || '') }),
        h('p', { class: 'card-note', text: 'Design intent: ' + (node.designIntent || 'not recorded') }),
        rows.length
          ? tableWrap(
              [{ label: '#' }, { label: 'Param / GW' }, { label: 'Deviation' }, { label: 'Causes' }, { label: 'Consequences' }, { label: 'Existing safeguards' }, { label: 'L/S' }, { label: 'Risk' }, { label: 'Recommendations' }, { label: 'Residual' }],
              rows.map((s) => {
                const initial = tryRiskFromLS(m, s.initialLikelihood, s.initialSeverity);
                const residual = tryRiskFromLS(m, s.residualLikelihood, s.residualSeverity);
                const recs = scoped('recommendations').filter((r) => r.scenarioId === s.id);
                return h(
                  'tr',
                  {},
                  h('td', { class: 'num', text: String(s.rowNumber || '') }),
                  h('td', { class: 'small', text: (s.parameterLabel || s.parameter) + ' / ' + (s.guidewordLabel || s.guideword) }),
                  h('td', { class: 'small', style: { 'font-weight': '500' }, text: s.deviation }),
                  h('td', { class: 'small', text: s.noMeaningfulDeviation ? 'No meaningful deviation — ' + (s.noMeaningfulReason || '') : (s.causes || []).map((c) => c.text).join('; ') }),
                  h('td', { class: 'small', text: (s.consequences || []).map((c) => c.text).join('; ') }),
                  h('td', { class: 'small', text: (s.existingSafeguards || []).map((c) => c.text).join('; ') }),
                  h('td', { class: 'num mono small', text: (s.initialLikelihood || '–') + '/' + (s.initialSeverity || '–') }),
                  h('td', {}, riskBadge(initial)),
                  h('td', { class: 'small', text: recs.map((r) => (r.recId || '') + ' ' + r.text).join(' | ') || '—' }),
                  h('td', {}, residual.ok ? riskBadge(residual) : h('span', { class: 'muted', text: '—' }))
                );
              })
            )
          : h('p', { class: 'muted', text: 'No rows.' })
      )
    );
  }

  // Recommendation register
  doc.appendChild(h('div', { class: 'card report-section' }, h('h3', { class: 'card-title', text: 'Final node-wise recommendation register' }), Array.from(reg.byNode.keys()).sort().map((key) => h('div', {}, h('h4', { style: { 'font-size': '12px', margin: '10px 0 4px' }, text: 'NODE ' + key }), tableWrap([{ label: 'Rec ID' }, { label: 'Recommendation' }, { label: 'Basis' }, { label: 'Priority' }, { label: 'Owner' }, { label: 'Target' }, { label: 'Status' }], reg.byNode.get(key).map((r) => h('tr', {}, h('td', { class: 'mono', text: r.recId || '' }), h('td', {}, h('div', { text: r.text }), (r.raisedFrom || []).length > 1 ? h('div', { class: 'muted small', text: 'Raised from: ' + (r.raisedFrom || []).map((x) => x.recId).filter(Boolean).join(', ') }) : null), h('td', { class: 'small', text: [r.legalBasis, r.standardBasis].filter(Boolean).join(' / ') || r.technicalBasis || '' }), h('td', { text: r.priority || '' }), h('td', { class: 'small', text: [r.responsibleDepartment, r.responsiblePerson].filter(Boolean).join(' / ') }), h('td', { class: 'small nowrap', text: r.targetDate ? dateFmt(r.targetDate) : '' }), h('td', { text: r.status || 'OPEN' }))))))));

  // Missing data
  doc.appendChild(h('div', { class: 'card report-section' }, h('h3', { class: 'card-title', text: 'Missing-data register' }), gaps.length ? tableWrap([{ label: 'Subject' }, { label: 'Missing item' }, { label: 'Blocks' }, { label: 'Detail' }], gaps.map((g) => h('tr', {}, h('td', { text: g.chemicalName || (g.entityKind === 'project' ? 'Project' : '') }), h('td', { text: g.label || g.field }), h('td', { class: 'small', text: (g.blocks || []).join(', ') }), h('td', { class: 'small muted', text: g.detail || '' })))) : h('p', { class: 'muted', text: 'No gaps recorded.' })));

  // Sources
  const sources = scoped('sources');
  doc.appendChild(h('div', { class: 'card report-section' }, h('h3', { class: 'card-title', text: 'Source register' }), sources.length ? tableWrap([{ label: 'Type' }, { label: 'Title' }, { label: 'Publisher' }, { label: 'Locator' }, { label: 'Retrieved' }], sources.map((s) => h('tr', {}, h('td', {}, h('span', { class: 'badge', text: s.sourceType })), h('td', { text: s.title }), h('td', { class: 'small', text: s.publisher || '' }), h('td', { class: 'small', text: s.locator || '' }), h('td', { class: 'small nowrap', text: s.retrievedAt ? dateFmt(s.retrievedAt) : '' })))) : h('p', { class: 'muted', text: 'None registered.' })));

  // Engine versions
  const ev = engineVersions();
  doc.appendChild(h('div', { class: 'card report-section' }, h('h3', { class: 'card-title', text: 'Engine versions' }), h('dl', { class: 'kv' }, Object.keys(ev).map((k) => [h('dt', { text: k }), h('dd', { class: 'mono', text: ev[k] })]).reduce((a, b) => a.concat(b), []))));

  wrap.appendChild(doc);
  return wrap;
}

// --------------------------------------------------------------- the exports

function exportsTab(p) {
  const wrap = h('div', {});
  const caps = window.__HAZOP_CAPS || {};
  const gate = qualityGate();

  if (!caps.downloads) {
    wrap.appendChild(h('div', { class: 'note warn', style: { 'margin-bottom': '12px' } }, h('strong', { text: 'File downloads are not available in this view. ' }), 'Use Print on the report preview to produce a PDF. To download DOCX and XLSX files, open this page in the Claude desktop app or grant the download permission when prompted.'));
  }

  const items = [
    { label: 'DOCX report', note: 'The full report as an editable Word document: real styles, headings and tables, landscape, one page break per node.', fn: exportDocx, primary: true },
    { label: 'PDF report', note: 'The report preview through the print stylesheet. Risk bands print as labels, not colour, so the document reads in monochrome.', fn: async () => { S.filters.reportTab = 'preview'; render(); setTimeout(printReport, 400); return true; } },
    { label: 'XLSX — HAZOP worksheets', note: 'One sheet per node plus a combined sheet, with the causes, consequences and safeguards as bulleted cells.', fn: exportHazopXlsx },
    { label: 'XLSX — recommendation register', note: 'The node-wise register, one row per recommendation, with the deviation and both risk ratings.', fn: exportRecommendationsXlsx },
    { label: 'XLSX — compliance register', note: 'The register columns, plus the permit tracker and every threshold figure entered with its citation.', fn: exportComplianceXlsx },
    { label: 'JSON backup', note: 'The complete project including provenance, the audit trail and every engine version. This is the restore path.', fn: exportJson },
  ];

  wrap.appendChild(
    h('div', { class: 'grid c2' }, items.map((it) => h('div', { class: 'card' }, h('h3', { class: 'card-title', text: it.label }), h('p', { class: 'card-note', text: it.note }), h('button', { class: 'btn ' + (it.primary ? 'primary' : ''), text: 'Generate', onclick: () => doExport(p, it.fn, S.selection.reportStatus || 'DRAFT') }))))
  );

  wrap.appendChild(sectionRule('Report status'));
  const statusSel = select(REPORT_STATUSES.filter((s) => s !== 'SUPERSEDED').map((s) => ({ value: s, label: s })), S.selection.reportStatus || 'DRAFT', { id: 'rp-status', onchange: (e) => { S.selection.reportStatus = e.target.value; render(); } });
  wrap.appendChild(
    h(
      'div',
      { class: 'card' },
      field('Status to stamp on the export', statusSel),
      h('p', { class: 'field-hint', text: 'DRAFT is always permitted and is watermarked. REVIEWED and APPROVED need every blocking check to pass and the facilitator or reviewer role.' }),
      (S.selection.reportStatus || 'DRAFT') !== 'DRAFT'
        ? (() => {
            const check = canSetReportStatus({ to: S.selection.reportStatus, actorKind: 'human', actorRole: S.actor.role, gate });
            return h('div', { class: 'note ' + (check.ok ? '' : 'crit') }, check.ok ? 'Permitted: ' + check.reason.replace(/_/g, ' ').toLowerCase() + '.' : explainStatus(check));
          })()
        : null
    )
  );

  return wrap;
}

function explainStatus(check) {
  const map = {
    AI_CANNOT_APPROVE_REPORT: 'The AI layer cannot approve a report.',
    ROLE_NOT_AUTHORIZED: 'This needs the facilitator or reviewer role. Assign yourself the reviewer role on the team page.',
    QUALITY_GATE_BLOCKED: 'The quality gate is blocking. ' + (check.detail || ''),
  };
  return map[check.reason] || check.reason;
}

async function doExport(p, fn, status) {
  const gate = qualityGate();
  if (status !== 'DRAFT') {
    const check = canSetReportStatus({ to: status, actorKind: 'human', actorRole: S.actor.role, gate });
    if (!check.ok) {
      toast(explainStatus(check), 'err');
      return;
    }
  }
  toast('Generating…');
  try {
    const ok = await fn();
    if (ok) toast('Done', 'ok');
  } catch (e) {
    toast('Export failed: ' + ((e && e.message) || 'unknown error'), 'err');
  }
}

// ------------------------------------------------------------- the revisions

function revisionsTab(p) {
  const revs = scoped('report_versions').slice().sort((a, b) => String(b.generatedAt).localeCompare(String(a.generatedAt)));
  const wrap = h('div', {});
  wrap.appendChild(h('div', { class: 'btn-row', style: { 'margin-bottom': '12px' } }, h('button', { class: 'btn primary', text: 'Record a revision', onclick: () => revisionDialog(p, qualityGate()) })));
  if (!revs.length) {
    wrap.appendChild(emptyState('No revisions recorded', 'Recording a revision snapshots the quality-gate result and the engine versions against a revision number, so a reader can tell what the report was checked against.', h('button', { class: 'btn primary', text: 'Record a revision', onclick: () => revisionDialog(p, qualityGate()) })));
    return wrap;
  }
  const rows = revs.map((r) =>
    h('tr', {}, h('td', { class: 'mono', style: { 'font-weight': '600' }, text: r.revision }), h('td', {}, h('span', { class: 'badge ' + (r.status === 'APPROVED' ? 'verified' : r.status === 'REVIEWED' ? 'confirmed' : 'extracted'), text: r.status })), h('td', { class: 'small nowrap', text: dtFmt(r.generatedAt) }), h('td', { class: 'small', text: r.generatedByName || '' }), h('td', {}, r.qualityGate ? h('span', { class: 'badge ' + (r.qualityGate.status === 'BLOCKED' ? 'conflict' : 'verified'), text: r.qualityGate.status.replace(/_/g, ' ') }) : h('span', { class: 'muted', text: '—' })), h('td', { class: 'num small', text: r.qualityGate ? r.qualityGate.summary.blockingPassed + '/' + r.qualityGate.summary.blockingTotal : '—' }), h('td', { class: 'small', text: r.notes || '' }), h('td', {}, h('button', { class: 'btn sm ghost', text: 'Open', onclick: () => revisionDrawer(r) })))
  );
  wrap.appendChild(tableWrap([{ label: 'Revision' }, { label: 'Status' }, { label: 'Generated' }, { label: 'By' }, { label: 'Gate' }, { label: 'Blocking', cls: 'num' }, { label: 'Notes' }, { label: '' }], rows));
  return wrap;
}

function revisionDialog(p, gate) {
  const rev = input({ value: nextRev(p), id: 'rv-rev' });
  const status = select(REPORT_STATUSES.filter((s) => s !== 'SUPERSEDED').map((s) => ({ value: s, label: s })), 'DRAFT', { id: 'rv-status' });
  const notes = textarea({ rows: 3, id: 'rv-notes' });
  const warn = h('div', { class: 'field-err', text: '' });

  const body = h(
    'div',
    {},
    h('div', { class: 'note plain small', text: 'A revision records the quality-gate result and every engine version at this moment, against the revision number. It does not generate a file — use the exports tab for that.' }),
    h('div', { class: 'grid c2' }, field('Revision', rev), field('Status', status)),
    field('Notes', notes),
    h('div', { class: 'note ' + (gate.status === 'BLOCKED' ? 'crit' : '') }, 'Gate at this moment: ' + gate.status.replace(/_/g, ' ') + ' — ' + gate.summary.blockingPassed + '/' + gate.summary.blockingTotal + ' blocking checks pass.'),
    warn
  );

  drawer('Record a revision', body, [
    h('button', { class: 'btn', text: 'Cancel', onclick: closeDrawer }),
    h('button', {
      class: 'btn primary',
      text: 'Record',
      onclick: async () => {
        const check = canSetReportStatus({ to: status.value, actorKind: 'human', actorRole: S.actor.role, gate });
        if (!check.ok) {
          warn.textContent = explainStatus(check);
          return;
        }
        for (const r of scoped('report_versions')) {
          if (r.status !== 'SUPERSEDED') await S.store.update('report_versions', r.id, { status: 'SUPERSEDED' }, { projectId: p.id, field: 'status' });
        }
        await S.store.create('report_versions', { projectId: p.id, revision: rev.value.trim() || nextRev(p), status: status.value, qualityGate: { status: gate.status, summary: gate.summary }, engineVersions: engineVersions(), sections: REPORT_SECTIONS.map((s) => s.key), generatedAt: nowIso(), generatedBy: S.actor.id, generatedByName: S.actor.name, notes: notes.value.trim(), reviewedBy: status.value !== 'DRAFT' ? S.actor.id : null, reviewedAt: status.value !== 'DRAFT' ? nowIso() : null }, { projectId: p.id });
        await S.store.update('projects', p.id, { revision: rev.value.trim() || nextRev(p) }, { projectId: p.id, field: 'revision' });
        closeDrawer();
        toast('Revision recorded', 'ok');
        render();
      },
    }),
  ]);
}

function nextRev(p) {
  const cur = String((p && p.revision) || 'R0');
  const m = /^R(\d+)$/i.exec(cur);
  if (m) return 'R' + (Number(m[1]) + 1);
  return cur + 'a';
}

function revisionDrawer(r) {
  const ev = r.engineVersions || {};
  drawer(
    'Revision ' + r.revision,
    h(
      'div',
      { class: 'stack' },
      h('dl', { class: 'kv' }, h('dt', { text: 'Status' }), h('dd', { text: r.status }), h('dt', { text: 'Generated' }), h('dd', { text: dtFmt(r.generatedAt) }), h('dt', { text: 'By' }), h('dd', { text: r.generatedByName || r.generatedBy || '' }), h('dt', { text: 'Notes' }), h('dd', { text: r.notes || '—' })),
      r.qualityGate ? h('div', { class: 'note ' + (r.qualityGate.status === 'BLOCKED' ? 'crit' : '') }, 'Gate: ' + r.qualityGate.status.replace(/_/g, ' ') + ' · ' + r.qualityGate.summary.blockingPassed + '/' + r.qualityGate.summary.blockingTotal + ' blocking checks passed' + (r.qualityGate.summary.blockingFailedIds && r.qualityGate.summary.blockingFailedIds.length ? '. Failing: ' + r.qualityGate.summary.blockingFailedIds.join(', ') : '')) : null,
      h('div', {}, h('div', { class: 'tile-label', text: 'Engine versions at this revision' }), h('dl', { class: 'kv' }, Object.keys(ev).map((k) => [h('dt', { text: k }), h('dd', { class: 'mono', text: ev[k] })]).reduce((a, b) => a.concat(b), [])))
    ),
    [h('button', { class: 'btn', text: 'Close', onclick: closeDrawer })]
  );
}
