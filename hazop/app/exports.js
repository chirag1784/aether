// app/exports.js — DOCX, XLSX and JSON generation.
//
// DOCX is written as real OOXML (JSZip), so Word opens it as an editable
// document with styles, headings and tables — not as an HTML file with a .doc
// extension. XLSX uses SheetJS. PDF is the print stylesheet over the report
// view, which is what makes page breaks per node work.

import { offerDownload, toast, nowIso, todayIso } from './util.js';
import { S, project, scoped, matrix, nodesSorted, scenariosFor, recommendationRegister, complianceRegister, dataGapsAll, permitStatuses, qualityGate, chemicalsResolved, thresholdSets } from './state.js';
import { tryRiskFromLS } from '../packages/calculations/risk.js';
import { CAUTION_TEXT, REPORT_SECTIONS, QUALITY_GATE_VERSION } from '../packages/reports/quality-gate.js';
import { RISK_ENGINE_VERSION } from '../packages/calculations/risk.js';
import { UNITS_VERSION } from '../packages/calculations/units.js';
import { THRESHOLD_ENGINE_VERSION } from '../packages/legal/thresholds.js';
import { APPLICABILITY_ENGINE_VERSION } from '../packages/legal/applicability.js';
import { DEDUP_VERSION } from '../packages/calculations/dedup.js';
import { GUIDEWORD_VERSION } from '../packages/domain/guidewords.js';
import { ALERTS_VERSION } from '../packages/chemical/alerts.js';
import { LEGAL_LIBRARY_VERSION } from '../packages/legal/library.js';
import { ENGINE_VERSION } from '../packages/domain/status.js';

export function engineVersions() {
  return {
    core: ENGINE_VERSION,
    risk: RISK_ENGINE_VERSION,
    units: UNITS_VERSION,
    thresholds: THRESHOLD_ENGINE_VERSION,
    applicability: APPLICABILITY_ENGINE_VERSION,
    dedup: DEDUP_VERSION,
    guidewords: GUIDEWORD_VERSION,
    alerts: ALERTS_VERSION,
    qualityGate: QUALITY_GATE_VERSION,
    legalLibrary: LEGAL_LIBRARY_VERSION,
  };
}

// --------------------------------------------------------------------- JSON

export function buildBackup() {
  const p = project();
  const collections = {};
  for (const name of ['documents', 'extracted_fields', 'field_conflicts', 'process_steps', 'equipment', 'chemicals', 'chem_properties', 'nodes', 'scenarios', 'safeguards', 'recommendations', 'team_members', 'workshop_sessions', 'assumptions', 'data_gaps', 'sources', 'compliance', 'permits', 'permit_conditions', 'compliance_tasks', 'compliance_evidence', 'legal_thresholds', 'legal_updates', 'legal_node_links', 'risk_matrices', 'ai_runs', 'report_versions']) {
    collections[name] = scoped(name);
  }
  return {
    schemaVersion: 'hazop-backup-1',
    exportedAt: nowIso(),
    exportedBy: S.actor.name || S.actor.id,
    engineVersions: engineVersions(),
    caution: CAUTION_TEXT,
    project: p,
    matrix: matrix(),
    collections,
    audit: scoped('audit'),
  };
}

export async function exportJson() {
  const p = project();
  const data = JSON.stringify(buildBackup(), null, 1);
  return offerDownload(fileBase(p) + '-backup.json', data, 'application/json');
}

// -------------------------------------------------------------------- XLSX

function sheetJs() {
  return window.XLSX || null;
}

export async function exportHazopXlsx() {
  const XLSX = sheetJs();
  if (!XLSX) {
    toast('The spreadsheet library did not load. Use the JSON backup, or print the report to PDF.', 'err');
    return false;
  }
  const p = project();
  const m = matrix();
  const wb = XLSX.utils.book_new();

  const header = ['#', 'Parameter', 'Guideword', 'Deviation', 'Causes', 'Consequences', 'Existing safeguards', 'L', 'S', 'Initial risk', 'Score', 'Recommendations', 'L', 'S', 'Residual risk', 'Residual basis', 'Status'];
  const combined = [header];

  for (const node of nodesSorted()) {
    const rows = [
      ['Node', node.nodeNumber, node.worksheetName || ''],
      ['Design intent', node.designIntent || ''],
      ['Equipment', (node.equipmentIds || []).map((id) => (scoped('equipment').filter((e) => e.id === id)[0] || {}).tag).filter(Boolean).join(', ')],
      ['Chemicals', (node.chemicalIds || []).map((id) => (scoped('chemicals').filter((c) => c.id === id)[0] || {}).canonicalName).filter(Boolean).join(', ')],
      [],
      header,
    ];
    for (const s of scenariosFor(node.id)) {
      const line = worksheetRow(s, m, node);
      rows.push(line);
      combined.push(['Node ' + node.nodeNumber].concat(line.slice(1)));
    }
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = [{ wch: 5 }, { wch: 13 }, { wch: 11 }, { wch: 22 }, { wch: 34 }, { wch: 34 }, { wch: 34 }, { wch: 4 }, { wch: 4 }, { wch: 13 }, { wch: 6 }, { wch: 34 }, { wch: 4 }, { wch: 4 }, { wch: 13 }, { wch: 28 }, { wch: 16 }];
    XLSX.utils.book_append_sheet(wb, ws, ('N' + (node.nodeNumber || '') + ' ' + (node.worksheetName || '')).slice(0, 31) || 'Node');
  }

  const cws = XLSX.utils.aoa_to_sheet(combined);
  XLSX.utils.book_append_sheet(wb, cws, 'All nodes');

  const meta = XLSX.utils.aoa_to_sheet([
    ['HAZOP worksheets'],
    ['Project', p.projectName || ''],
    ['Client', p.clientName || ''],
    ['Site', p.siteName || ''],
    ['Revision', p.revision || ''],
    ['Risk matrix', (m.name || m.id) + ' v' + m.version],
    ['Exported', nowIso()],
    [],
    ['Caution'],
    [CAUTION_TEXT],
  ]);
  meta['!cols'] = [{ wch: 18 }, { wch: 110 }];
  XLSX.utils.book_append_sheet(wb, meta, 'About');

  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  return offerDownload(fileBase(p) + '-hazop.xlsx', new Uint8Array(out), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
}

function worksheetRow(s, m, node) {
  const initial = tryRiskFromLS(m, s.initialLikelihood, s.initialSeverity);
  const residual = tryRiskFromLS(m, s.residualLikelihood, s.residualSeverity);
  const recs = scoped('recommendations').filter((r) => r.scenarioId === s.id);
  return [
    s.rowNumber || '',
    s.parameterLabel || s.parameter,
    s.guidewordLabel || s.guideword,
    s.deviation,
    s.noMeaningfulDeviation ? 'No meaningful deviation — ' + (s.noMeaningfulReason || '') : (s.causes || []).map((c) => '• ' + c.text).join('\n'),
    (s.consequences || []).map((c) => '• ' + c.text).join('\n'),
    (s.existingSafeguards || []).map((c) => '• ' + c.text).join('\n'),
    s.initialLikelihood === null || s.initialLikelihood === undefined ? '' : s.initialLikelihood,
    s.initialSeverity === null || s.initialSeverity === undefined ? '' : s.initialSeverity,
    initial.ok ? initial.bandLabel : 'Not rated',
    initial.ok && initial.score !== null ? initial.score : '',
    recs.map((r) => (r.recId || '') + ' ' + r.text).join('\n'),
    s.residualLikelihood === null || s.residualLikelihood === undefined ? '' : s.residualLikelihood,
    s.residualSeverity === null || s.residualSeverity === undefined ? '' : s.residualSeverity,
    residual.ok ? residual.bandLabel : '',
    s.residualBasisKind ? s.residualBasisKind + ': ' + (s.residualBasisText || '') : '',
    s.reviewerStatus || 'DRAFT',
  ];
}

export async function exportRecommendationsXlsx() {
  const XLSX = sheetJs();
  if (!XLSX) {
    toast('The spreadsheet library did not load.', 'err');
    return false;
  }
  const p = project();
  const m = matrix();
  const reg = recommendationRegister();
  const rows = [['Rec ID', 'Node', 'Equipment', 'Deviation', 'Cause', 'Consequence', 'Initial risk', 'Recommendation', 'Technical basis', 'Legal / standard basis', 'Expected residual risk', 'Priority', 'Control level', 'Responsible dept', 'Responsible person', 'Target date', 'Status', 'Close-out evidence', 'Raised from']];
  for (const key of Array.from(reg.byNode.keys()).sort()) {
    for (const r of reg.byNode.get(key)) {
      const sc = r.scenario;
      const initial = sc ? tryRiskFromLS(m, sc.initialLikelihood, sc.initialSeverity) : { ok: false };
      const residual = sc ? tryRiskFromLS(m, sc.residualLikelihood, sc.residualSeverity) : { ok: false };
      rows.push([
        r.recId || '',
        key,
        (r.equipmentTags || []).join(', '),
        sc ? sc.deviation : '',
        sc ? (sc.causes || []).map((c) => c.text).join('; ') : '',
        sc ? (sc.consequences || []).map((c) => c.text).join('; ') : '',
        initial.ok ? initial.bandLabel + (initial.score !== null ? ' (' + initial.score + ')' : '') : '',
        r.text,
        r.technicalBasis || '',
        [r.legalBasis, r.standardBasis].filter(Boolean).join(' / '),
        residual.ok ? residual.bandLabel : '',
        r.priority || '',
        r.controlLevel || '',
        r.responsibleDepartment || '',
        r.responsiblePerson || '',
        r.targetDate || '',
        r.status || 'OPEN',
        (r.evidence || []).map((e) => e.title).join('; '),
        (r.raisedFrom || []).length > 1 ? (r.raisedFrom || []).map((x) => x.recId).filter(Boolean).join(', ') : '',
      ]);
    }
  }
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{ wch: 9 }, { wch: 7 }, { wch: 14 }, { wch: 22 }, { wch: 30 }, { wch: 30 }, { wch: 15 }, { wch: 46 }, { wch: 34 }, { wch: 24 }, { wch: 15 }, { wch: 9 }, { wch: 14 }, { wch: 16 }, { wch: 16 }, { wch: 11 }, { wch: 11 }, { wch: 24 }, { wch: 18 }];
  XLSX.utils.book_append_sheet(wb, ws, 'Recommendations');
  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  return offerDownload(fileBase(p) + '-recommendations.xlsx', new Uint8Array(out), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
}

export async function exportComplianceXlsx() {
  const XLSX = sheetJs();
  if (!XLSX) {
    toast('The spreadsheet library did not load.', 'err');
    return false;
  }
  const p = project();
  const reg = complianceRegister();
  const rows = [['Domain', 'Law / rule', 'Section / rule / schedule', 'Obligation', 'Applicability', 'Set by', 'Reason', 'Evidence expected', 'Evidence held', 'Status', 'Authority', 'Due / renewal', 'Missing facts', 'Threshold conclusion', 'Source', 'Source status']];
  for (const r of reg) {
    rows.push([
      r.domain || '',
      r.instrumentTitle,
      r.sectionRuleSchedule || '',
      r.topic,
      r.effectiveStatus,
      r.humanStatus ? 'Reviewer' : (r.setBy || '').replace(/_/g, ' '),
      r.humanReason || r.applicabilityReason || '',
      (r.evidenceExpected || []).join('; '),
      (r.evidence || []).map((e) => e.title + (e.status === 'VERIFIED' ? ' (verified)' : '')).join('; '),
      r.complianceStatus || '',
      r.authority || '',
      r.dueDate || '',
      (r.missingFacts || []).join(', '),
      r.thresholdEvaluation ? r.thresholdEvaluation.conclusion : '',
      ((r.sourceRefs || [])[0] || {}).url || '',
      ((r.sourceRefs || [])[0] || {}).sourceStatus || '',
    ]);
  }
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{ wch: 8 }, { wch: 46 }, { wch: 34 }, { wch: 34 }, { wch: 22 }, { wch: 20 }, { wch: 60 }, { wch: 40 }, { wch: 32 }, { wch: 22 }, { wch: 30 }, { wch: 12 }, { wch: 24 }, { wch: 24 }, { wch: 30 }, { wch: 26 }];
  XLSX.utils.book_append_sheet(wb, ws, 'Compliance register');

  const permits = [['Type', 'Authority', 'Number', 'Issued', 'Expiry', 'Renewal', 'Computed status', 'Days', 'Approved capacity', 'Revoked']];
  for (const x of permitStatuses()) permits.push([x.permitType || '', x.issuingAuthority || '', x.number || '', x.issueDate || '', x.expiryDate || '', x.renewalDate || '', x.expiry.status, x.expiry.daysRemaining === null ? '' : x.expiry.daysRemaining, x.approvedCapacity || '', x.revoked ? 'Yes' : 'No']);
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(permits), 'Permits');

  const thr = [['Threshold set', 'Chemical / class', 'CAS', 'Quantity', 'Unit', 'Status', 'Schedule entry cited', 'Entered by']];
  for (const set of thresholdSets()) for (const e of set.entries) thr.push([set.label, e.chemicalName || '', e.cas || '', e.value, e.unit || '', e.status, e.locator || '', e.enteredBy || '']);
  if (thr.length === 1) thr.push(['— no verified threshold figures entered —']);
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(thr), 'Thresholds');

  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  return offerDownload(fileBase(p) + '-compliance.xlsx', new Uint8Array(out), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
}

// -------------------------------------------------------------------- DOCX

function esc(s) {
  return String(s === null || s === undefined ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function para(text, opts) {
  const o = opts || {};
  const runs = String(text === null || text === undefined ? '' : text)
    .split('\n')
    .map((line, i) => (i ? '<w:r><w:br/></w:r>' : '') + '<w:r>' + rPr(o) + '<w:t xml:space="preserve">' + esc(line) + '</w:t></w:r>')
    .join('');
  return '<w:p>' + pPr(o) + runs + '</w:p>';
}

function pPr(o) {
  let s = '<w:pPr>';
  if (o.style) s += '<w:pStyle w:val="' + o.style + '"/>';
  if (o.align) s += '<w:jc w:val="' + o.align + '"/>';
  if (o.pageBreakBefore) s += '<w:pageBreakBefore/>';
  if (o.spacingAfter !== undefined) s += '<w:spacing w:after="' + o.spacingAfter + '"/>';
  s += '</w:pPr>';
  return s === '<w:pPr></w:pPr>' ? '' : s;
}

function rPr(o) {
  let s = '';
  if (o.bold) s += '<w:b/>';
  if (o.italic) s += '<w:i/>';
  if (o.size) s += '<w:sz w:val="' + o.size + '"/>';
  if (o.color) s += '<w:color w:val="' + o.color + '"/>';
  if (o.mono) s += '<w:rFonts w:ascii="Consolas" w:hAnsi="Consolas"/>';
  return s ? '<w:rPr>' + s + '</w:rPr>' : '';
}

function table(headers, rows, widths) {
  const w = widths || headers.map(() => Math.floor(9300 / headers.length));
  const grid = '<w:tblGrid>' + w.map((x) => '<w:gridCol w:w="' + x + '"/>').join('') + '</w:tblGrid>';
  const tblPr =
    '<w:tblPr><w:tblStyle w:val="HazopTable"/><w:tblW w:w="5000" w:type="pct"/>' +
    '<w:tblBorders>' +
    ['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map((side) => '<w:' + side + ' w:val="single" w:sz="4" w:space="0" w:color="AAAAAA"/>').join('') +
    '</w:tblBorders><w:tblLayout w:type="fixed"/></w:tblPr>';
  const headRow =
    '<w:tr><w:trPr><w:tblHeader/></w:trPr>' +
    headers.map((hd, i) => '<w:tc><w:tcPr><w:tcW w:w="' + w[i] + '" w:type="dxa"/><w:shd w:val="clear" w:fill="E8EDEB"/></w:tcPr>' + para(hd, { bold: true, size: 16 }) + '</w:tc>').join('') +
    '</w:tr>';
  const bodyRows = rows
    .map((r) => '<w:tr>' + r.map((cell, i) => '<w:tc><w:tcPr><w:tcW w:w="' + w[i] + '" w:type="dxa"/></w:tcPr>' + para(cell, { size: 16 }) + '</w:tc>').join('') + '</w:tr>')
    .join('');
  return '<w:tbl>' + tblPr + grid + headRow + bodyRows + '</w:tbl>' + para('');
}

const DOCX_STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:sz w:val="20"/></w:rPr></w:rPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:pPr><w:spacing w:after="180"/></w:pPr><w:rPr><w:b/><w:sz w:val="52"/><w:color w:val="0C6B60"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:pPr><w:outlineLvl w:val="0"/><w:spacing w:before="280" w:after="120"/></w:pPr><w:rPr><w:b/><w:sz w:val="32"/><w:color w:val="10231F"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:pPr><w:outlineLvl w:val="1"/><w:spacing w:before="200" w:after="90"/></w:pPr><w:rPr><w:b/><w:sz w:val="26"/><w:color w:val="0C6B60"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading3"><w:name w:val="heading 3"/><w:pPr><w:outlineLvl w:val="2"/><w:spacing w:before="160" w:after="70"/></w:pPr><w:rPr><w:b/><w:sz w:val="22"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Caution"><w:name w:val="Caution"/><w:pPr><w:pBdr><w:left w:val="single" w:sz="18" w:space="6" w:color="B84C17"/></w:pBdr><w:ind w:left="200"/><w:spacing w:before="120" w:after="120"/></w:pPr><w:rPr><w:i/></w:rPr></w:style>
<w:style w:type="table" w:styleId="HazopTable"><w:name w:val="Hazop Table"/><w:tblPr/></w:style>
</w:styles>`;

export async function exportDocx() {
  const JSZip = window.JSZip;
  if (!JSZip) {
    toast('The document library did not load. Use Print to produce a PDF, or the JSON backup.', 'err');
    return false;
  }
  const p = project();
  const m = matrix();
  const gate = qualityGate();
  const reg = recommendationRegister();
  const creg = complianceRegister();
  const gaps = dataGapsAll();
  const nodes = nodesSorted();
  const status = (S.selection.reportStatus || 'DRAFT');

  const body = [];
  const H1 = (t) => para(t, { style: 'Heading1', pageBreakBefore: true });
  const H2 = (t) => para(t, { style: 'Heading2' });
  const H3 = (t) => para(t, { style: 'Heading3' });

  // 1 Cover
  body.push(para('HAZOP STUDY REPORT', { style: 'Title' }));
  body.push(para(p.projectName || '', { bold: true, size: 30 }));
  body.push(
    table(
      ['Field', 'Detail'],
      [
        ['Client', p.clientName || '—'],
        ['Site', p.siteName || '—'],
        ['Site address', p.siteAddress || '—'],
        ['Product', p.product || '—'],
        ['Process', p.process || '—'],
        ['Process stage', p.processStage || '—'],
        ['Department', p.department || '—'],
        ['Project type', p.projectType || '—'],
        ['Revision', p.revision || 'R0'],
        ['Report status', status],
        ['Study period', (p.studyStartDate || '—') + ' to ' + (p.studyEndDate || '—')],
        ['Risk matrix', (m.name || m.id) + ' v' + m.version],
        ['Generated', todayIso()],
      ],
      [2600, 6700]
    )
  );
  if (status === 'DRAFT') body.push(para('DRAFT — not for issue', { bold: true, color: 'B84C17', size: 28, align: 'center' }));

  // 2 Revision history
  body.push(H1('1. Revision history'));
  const revs = scoped('report_versions').slice().sort((a, b) => String(a.generatedAt).localeCompare(String(b.generatedAt)));
  body.push(
    revs.length
      ? table(['Revision', 'Status', 'Generated', 'By', 'Notes'], revs.map((r) => [r.revision, r.status, String(r.generatedAt).slice(0, 10), r.generatedByName || '', r.notes || '']), [1300, 1400, 1800, 2000, 2800])
      : para('This is the first issue of this report.')
  );

  // 3 Caution
  body.push(H1('2. Caution and limitations'));
  body.push(para(CAUTION_TEXT, { style: 'Caution' }));

  // 4-6 Introduction, scope, process
  body.push(H1('3. Introduction'));
  body.push(para((p.clientName || 'The client') + ' commissioned a Hazard and Operability study of the ' + (p.process || 'process') + ' at ' + (p.siteName || 'the site') + '. This report records the study, the team\'s findings, the recommendations raised and the regulatory questions the study identified.'));
  body.push(H1('4. Scope of work'));
  body.push(para(p.processStage ? 'The study covered ' + (p.process || 'the process') + ', ' + p.processStage + '.' : 'The study covered ' + (p.process || 'the process') + '.'));
  body.push(H1('5. Process description'));
  body.push(para(p.processDescription || 'Not recorded.'));
  if (p.chemistry) {
    body.push(H2('5.1 Chemistry'));
    body.push(para(p.chemistry));
  }
  const steps = scoped('process_steps').slice().sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
  if (steps.length) {
    body.push(H2('5.2 Process sequence'));
    body.push(table(['Step', 'Description', 'T', 'P', 'Duration'], steps.map((s) => [(s.stepNumber || '') + ' ' + s.title, s.description || '', s.temperature || '', s.pressure || '', s.duration || '']), [1600, 4500, 1100, 1100, 1000]));
  }

  // 7 Documents
  body.push(H1('6. Documents reviewed'));
  const docs = scoped('documents');
  body.push(
    docs.length
      ? table(['Title', 'Class', 'Number', 'Rev', 'SHA-256', 'Parse'], docs.map((d) => [d.title, d.docClass || '', d.docNumber || '', d.docRevision || '', d.sha256 ? d.sha256.slice(0, 16) + '…' : '—', d.parseStatus || '']), [3000, 1500, 1400, 700, 1900, 800])
      : para('No documents registered.')
  );

  // 8 Methodology
  body.push(H1('7. HAZOP methodology'));
  body.push(para('The study followed the guideword approach: for each node the team stated the design intent, applied the guidewords to the parameters present in that node, developed credible causes, examined the consequences without credit for safeguards, recorded the safeguards already provided, rated the risk against the project matrix, and raised recommendations where the safeguards were judged insufficient.'));
  body.push(para('The meaningful guideword and parameter combinations for each node were generated deterministically from the node\'s own facts — its equipment, utilities, chemicals and operating steps — rather than from a fixed template, so the worksheet carries the deviations that apply to that node and not a cross-product of every possibility.'));
  body.push(para('Risk ratings, unit conversions, regulatory threshold comparisons and renewal dates were computed in code. Where automated analysis drafted text, the team reviewed it; the report marks any value that remains a model inference.'));

  // 9 Standards
  body.push(H1('8. Reference standards and guidance'));
  const stds = scoped('sources').filter((s) => s.sourceType === 'STANDARD' || s.sourceType === 'REGULATOR_GUIDANCE' || s.sourceType === 'COMPANY_STANDARD');
  body.push(para('The following are standards and guidance. A standard is mandatory only where it is incorporated by law, by a licence or consent condition, by contract or by a company standard; this report does not treat a standard as a statutory obligation.', { italic: true }));
  body.push(stds.length ? table(['Type', 'Title', 'Publisher', 'Locator'], stds.map((s) => [s.sourceType, s.title, s.publisher || '', s.locator || '']), [1900, 3800, 2000, 1600]) : para('None recorded.'));

  // 10 Legal summary
  body.push(H1('9. Legal and regulatory applicability summary'));
  const counts = { APPLICABLE_CONFIRMED: 0, POTENTIALLY_APPLICABLE: 0, NOT_ENOUGH_DATA: 0, NOT_APPLICABLE_CONFIRMED: 0, REQUIRES_LEGAL_REVIEW: 0 };
  for (const r of creg) if (Object.prototype.hasOwnProperty.call(counts, r.effectiveStatus)) counts[r.effectiveStatus] += 1;
  body.push(para('This section records which legal instruments the study identified as relevant, and on what project facts. A status of POTENTIALLY_APPLICABLE, NOT_ENOUGH_DATA or REQUIRES_LEGAL_REVIEW is an unresolved question, not a finding of compliance or non-compliance.', { italic: true }));
  body.push(table(['Applicability', 'Count'], Object.keys(counts).map((k) => [k.replace(/_/g, ' '), String(counts[k])]), [5000, 1400]));
  const shown = creg.filter((r) => r.effectiveStatus !== 'NOT_APPLICABLE_CONFIRMED');
  if (shown.length) {
    body.push(H2('9.1 Instruments identified'));
    body.push(table(['Law / rule', 'Section', 'Obligation', 'Applicability', 'Why', 'Authority'], shown.map((r) => [r.instrumentTitle, r.sectionRuleSchedule || '', r.topic, r.effectiveStatus.replace(/_/g, ' '), r.humanReason || r.applicabilityReason || '', r.authority || '']), [2200, 1500, 1700, 1400, 1700, 1200]));
  }
  const na = creg.filter((r) => r.effectiveStatus === 'NOT_APPLICABLE_CONFIRMED');
  if (na.length) {
    body.push(H2('9.2 Considered and not applicable'));
    body.push(table(['Law / rule', 'Reason'], na.map((r) => [r.instrumentTitle, r.applicabilityReason || '']), [3400, 5900]));
  }

  // 11 Exclusions and assumptions
  body.push(H1('10. Study exclusions and assumptions'));
  const assumptions = scoped('assumptions');
  body.push(assumptions.length ? table(['Category', 'Assumption', 'Basis'], assumptions.map((a) => [a.category || '', a.text, a.basis || '']), [1800, 5000, 2500]) : para('None recorded.'));

  // 12 Team
  body.push(H1('11. HAZOP team members'));
  const team = scoped('team_members').slice().sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
  body.push(
    team.length
      ? table(['#', 'Name', 'Designation', 'Department', 'Organization', 'Role', 'Signature'], team.map((t, i) => [String(i + 1), t.name, t.designation || '', t.department || '', t.organization || '', t.role || '', '']), [500, 1900, 1600, 1500, 1600, 1300, 900])
      : para('No team members recorded.')
  );

  // 13 Matrix
  body.push(H1('12. Risk matrix'));
  body.push(para('Matrix: ' + (m.name || m.id) + ' version ' + m.version + '. ' + (m.combine === 'lookup' ? 'Risk is read from an explicit cell table.' : 'Risk is the product of likelihood and severity.')));
  body.push(H2('12.1 Likelihood'));
  body.push(table(['Value', 'Label', 'Descriptor'], m.likelihoodScale.map((l) => [String(l.value), l.label, l.descriptor || '']), [900, 2200, 6200]));
  body.push(H2('12.2 Severity'));
  body.push(table(['Value', 'Label', 'People', 'Environment', 'Asset'], m.severityScale.map((s) => [String(s.value), s.label, s.people || '', s.env || '', s.asset || '']), [800, 1700, 2400, 2200, 2200]));
  body.push(H2('12.3 Bands'));
  body.push(table(['Band', 'Score', 'Action required'], m.bands.map((b) => [b.label, b.min !== undefined ? b.min + '–' + b.max : 'lookup', (b.action || '').replace(/_/g, ' ')]), [2400, 2000, 4900]));

  // 14 Chemical hazard summary
  body.push(H1('13. Chemical hazard summary'));
  const chems = chemicalsResolved();
  body.push(
    chems.length
      ? table(['Chemical', 'CAS', 'Quantity', 'State', 'Classification', 'Flash point', 'Status'], chems.map((c) => {
          const fp = scoped('chem_properties').filter((x) => x.chemicalId === c.id && x.key === 'flashPoint')[0];
          return [c.canonicalName, c.cas || '—', c.quantity === null || c.quantity === undefined ? 'NOT RECORDED' : c.quantity + ' ' + (c.quantityUnit || ''), c.physicalState || '—', c.hazardousClassification || 'not recorded', fp && fp.value !== null && fp.value !== undefined ? String(fp.value) + ' ' + (fp.unit || '°C') : 'UNKNOWN', fp ? fp.status : 'MISSING'];
        }), [2100, 1200, 1400, 1300, 1700, 1200, 1400])
      : para('No chemicals recorded.')
  );
  body.push(para('A flash point recorded as UNKNOWN is unknown. It is not an indication that the material is not flammable.', { italic: true }));

  // 16-17 Node list and worksheets
  body.push(H1('14. Node list'));
  body.push(
    nodes.length
      ? table(['Node', 'Worksheet', 'Design intent', 'Equipment', 'Status'], nodes.map((n) => [n.nodeNumber || '', n.worksheetName || '', n.designIntent || '', (n.equipmentIds || []).map((id) => (scoped('equipment').filter((e) => e.id === id)[0] || {}).tag).filter(Boolean).join(', '), n.reviewStatus || '']), [800, 1900, 3400, 1900, 1300])
      : para('No nodes defined.')
  );

  body.push(H1('15. Node worksheets'));
  for (const node of nodes) {
    body.push(para('Node ' + (node.nodeNumber || '') + ' — ' + (node.worksheetName || ''), { style: 'Heading2', pageBreakBefore: true }));
    body.push(table(['Field', 'Detail'], [['Design intent', node.designIntent || '—'], ['Boundaries', node.boundaries || '—'], ['Equipment', (node.equipmentIds || []).map((id) => (scoped('equipment').filter((e) => e.id === id)[0] || {}).tag).filter(Boolean).join(', ') || '—'], ['Chemicals', (node.chemicalIds || []).map((id) => (scoped('chemicals').filter((c) => c.id === id)[0] || {}).canonicalName).filter(Boolean).join(', ') || '—'], ['Utilities', (node.utilities || []).join(', ') || '—'], ['Operating conditions', [node.operatingTemperature !== null && node.operatingTemperature !== undefined ? node.operatingTemperature + ' °C' : null, node.operatingPressure !== null && node.operatingPressure !== undefined ? node.operatingPressure + ' bar' : null].filter(Boolean).join(', ') || '—']], [2200, 7100]));
    const rows = scenariosFor(node.id).map((s) => {
      const r = worksheetRow(s, m, node);
      return [String(r[0]), r[1] + ' / ' + r[2], r[3], r[4], r[5], r[6], (r[7] === '' ? '–' : r[7]) + '/' + (r[8] === '' ? '–' : r[8]), r[9] + (r[10] !== '' ? ' (' + r[10] + ')' : ''), r[11], r[14] || '—', r[16]];
    });
    body.push(rows.length ? table(['#', 'Param / GW', 'Deviation', 'Causes', 'Consequences', 'Existing safeguards', 'L/S', 'Risk', 'Recommendations', 'Residual', 'Status'], rows, [450, 900, 1100, 1250, 1250, 1250, 550, 900, 1300, 750, 750]) : para('No worksheet rows on this node.'));
  }

  // 18 Node-wise legal relevance
  const withLinks = creg.filter((r) => (r.crossings || []).length || (LEGAL_LINKED_TOPICS.indexOf(r.topic) !== -1 && r.effectiveStatus !== 'NOT_APPLICABLE_CONFIRMED'));
  if (withLinks.length) {
    body.push(H1('16. Node-wise legal relevance'));
    body.push(para('Only obligations that genuinely touch a node are listed. The study does not force a legal citation onto every worksheet row.', { italic: true }));
    for (const node of nodes) {
      const rel = withLinks.filter((r) => (r.crossings || []).some((c) => (node.chemicalIds || []).indexOf(c.chemicalId) !== -1) || LEGAL_LINKED_TOPICS.indexOf(r.topic) !== -1);
      if (!rel.length) continue;
      body.push(H3('Node ' + (node.nodeNumber || '') + ' — ' + (node.worksheetName || '')));
      body.push(table(['Law / rule', 'Obligation', 'Applicability', 'Missing evidence'], rel.map((r) => [r.instrumentTitle, r.topic, r.effectiveStatus.replace(/_/g, ' '), (r.evidenceExpected || []).filter((e) => !(r.evidence || []).some((x) => x.expects === e)).join('; ')]), [2600, 2300, 1700, 2700]));
    }
  }

  // 19 Node-wise recommendation register
  body.push(H1('17. Final node-wise recommendation register'));
  for (const key of Array.from(reg.byNode.keys()).sort()) {
    const list = reg.byNode.get(key);
    body.push(H3('NODE ' + key));
    body.push(
      table(
        ['Rec ID', 'Deviation', 'Recommendation', 'Legal / standard basis', 'Initial', 'Residual', 'Priority', 'Owner', 'Target', 'Status'],
        list.map((r) => {
          const sc = r.scenario;
          const initial = sc ? tryRiskFromLS(m, sc.initialLikelihood, sc.initialSeverity) : { ok: false };
          const residual = sc ? tryRiskFromLS(m, sc.residualLikelihood, sc.residualSeverity) : { ok: false };
          return [r.recId || '', sc ? sc.deviation : '', r.text + ((r.raisedFrom || []).length > 1 ? '\nRaised from: ' + (r.raisedFrom || []).map((x) => x.recId).filter(Boolean).join(', ') : ''), [r.legalBasis, r.standardBasis].filter(Boolean).join(' / '), initial.ok ? initial.bandLabel : '', residual.ok ? residual.bandLabel : '', r.priority || '', [r.responsibleDepartment, r.responsiblePerson].filter(Boolean).join(' / '), r.targetDate || '', r.status || 'OPEN'];
        }),
        [750, 1050, 2400, 1150, 750, 750, 650, 1100, 700, 700]
      )
    );
  }

  // 21 Compliance gap register
  const gapsReg = creg.filter((r) => ['APPLICABLE_CONFIRMED', 'POTENTIALLY_APPLICABLE'].indexOf(r.effectiveStatus) !== -1 && ((r.evidenceExpected || []).length > (r.evidence || []).length || r.complianceStatus === 'EVIDENCE_MISSING' || r.complianceStatus === 'PARTIALLY_EVIDENCED' || r.complianceStatus === 'EXPIRED'));
  body.push(H1('18. Compliance-gap register'));
  body.push(gapsReg.length ? table(['Law / rule', 'Obligation', 'Applicability', 'Evidence held', 'Missing', 'Owner', 'Due'], gapsReg.map((r) => [r.instrumentTitle, r.topic, r.effectiveStatus.replace(/_/g, ' '), (r.evidence || []).map((e) => e.title).join('; ') || 'none', (r.evidenceExpected || []).filter((e) => !(r.evidence || []).some((x) => x.expects === e)).join('; '), r.owner || '', r.dueDate || '']), [2000, 1700, 1300, 1500, 1600, 700, 500]) : para('No evidence gaps recorded against an applicable or potentially applicable obligation.'));

  // 22 Missing data register
  body.push(H1('19. Missing-data register'));
  body.push(gaps.length ? table(['Subject', 'Missing item', 'Blocks', 'Detail'], gaps.map((g) => [g.chemicalName || (g.entityKind === 'project' ? 'Project' : g.entityId || ''), g.label || g.field, (g.blocks || []).join(', '), g.detail || '']), [2000, 2200, 2100, 3000]) : para('No gaps recorded.'));

  // 23 Conclusions
  body.push(H1('20. Final conclusions'));
  const open = reg.kept.filter((r) => ['OPEN', 'IN_PROGRESS', 'AWAITING_EVIDENCE'].indexOf(r.status || 'OPEN') !== -1).length;
  body.push(para('The study recorded ' + scoped('scenarios').length + ' worksheet rows across ' + nodes.length + ' nodes and raised ' + reg.kept.length + ' recommendations, of which ' + open + ' remain open at this revision.'));
  body.push(para('Each recommendation should be evaluated in detail by the plant design team and closed out with a documented reference. Residual risk ratings in this report assume the recommendations are implemented as described; where no technical basis for a reduction was recorded, the residual rating is left at the initial rating.'));
  if (gate && gate.status === 'BLOCKED') body.push(para('This revision does not clear the report quality gate. Outstanding blocking items: ' + gate.summary.blockingFailedIds.join(', ') + '.', { bold: true, color: 'B84C17' }));

  // 24 Source register
  body.push(H1('21. Source register'));
  const sources = scoped('sources');
  body.push(sources.length ? table(['Type', 'Title', 'Publisher', 'Locator', 'Retrieved', 'Hash'], sources.map((s) => [s.sourceType, s.title, s.publisher || '', s.locator || '', s.retrievedAt ? String(s.retrievedAt).slice(0, 10) : '', s.sha256 ? s.sha256.slice(0, 12) + '…' : '']), [1700, 2600, 1500, 1500, 1100, 900]) : para('No sources registered.'));

  // Engine versions
  body.push(H1('22. Engine versions'));
  body.push(para('The deterministic engines that produced the calculated values in this report:'));
  const ev = engineVersions();
  body.push(table(['Engine', 'Version'], Object.keys(ev).map((k) => [k, ev[k]]), [4600, 4700]));

  const documentXml =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
    '<w:body>' +
    body.join('') +
    '<w:sectPr><w:pgSz w:w="16838" w:h="11906" w:orient="landscape"/><w:pgMar w:top="720" w:right="720" w:bottom="720" w:left="720" w:header="360" w:footer="360"/></w:sectPr>' +
    '</w:body></w:document>';

  const zip = new JSZip();
  zip.file(
    '[Content_Types].xml',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>'
  );
  zip.folder('_rels').file(
    '.rels',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'
  );
  const word = zip.folder('word');
  word.file('document.xml', documentXml);
  word.file('styles.xml', DOCX_STYLES);
  word.folder('_rels').file(
    'document.xml.rels',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>'
  );

  const blob = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
  return offerDownload(fileBase(p) + '-report-' + status.toLowerCase() + '.docx', blob, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
}

const LEGAL_LINKED_TOPICS = ['Safety report / safety audit / on-site emergency plan', 'Electrical installation approval and hazardous-area classification'];

function fileBase(p) {
  const name = (p && p.projectName) || 'hazop';
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48) + '-' + (p && p.revision ? String(p.revision).toLowerCase() : 'r0');
}

export function printReport() {
  window.print();
}
