// app/views/legal.js — compliance register, permit tracker, threshold entry,
// legal sources and update review.

import { h, field, input, select, textarea, toast, drawer, closeDrawer, confirmAction, emptyState, sectionRule, tableWrap, tile, applicBadge, expiryBadge, statusBadge, truncate, dateFmt, dtFmt, nowIso, chips } from '../util.js';
import { S, go, render, project, scoped, complianceRegister, complianceCounts, applicability, permitStatuses, taskStatuses, thresholdSets, chemicalsResolved, nodeById, instrumentsIndex } from '../state.js';
import { LEGAL_INSTRUMENTS, LEGAL_OBLIGATIONS, LEGAL_DOMAINS, SOURCE_ROOTS, domainLabel, standardIsMandatory, LEGAL_LIBRARY_VERSION, LEGAL_LIBRARY_SEEDED_AT } from '../../packages/legal/library.js';
import { validateThresholdEntry, evaluateInventory } from '../../packages/legal/thresholds.js';
import { legalStatusTransition, computeComplianceStatus, COMPLIANCE_STATUS, canOverwriteLegalSource } from '../../packages/domain/status.js';
import { expiryStatus, FREQUENCIES, nextDue } from '../../packages/calculations/dates.js';
import { aiAvailable, explainApplicability, extractPermitConditions } from '../ai.js';

const LEGAL_TABS = [
  { key: 'register', label: 'Register' },
  { key: 'questions', label: 'Open questions' },
  { key: 'thresholds', label: 'Thresholds' },
  { key: 'permits', label: 'Permits & consents' },
  { key: 'tasks', label: 'Returns & monitoring' },
  { key: 'sources', label: 'Legal sources' },
  { key: 'updates', label: 'Updates' },
];

export function renderLegal() {
  const p = project();
  if (!p) return h('div', { class: 'page' }, emptyState('No project selected', 'Pick a project first.', null));

  const tab = S.filters.legalTab || 'register';
  const page = h('div', { class: 'page wide' });
  const cc = complianceCounts();

  page.appendChild(h('div', { class: 'page-head' }, h('div', {}, h('div', { class: 'eyebrow', text: 'Legal & regulatory compliance' }), h('h1', { class: 'page-title', text: 'Compliance' }))));
  page.appendChild(h('p', { class: 'page-sub', text: 'The system identifies what may apply and says why. It does not declare the facility compliant, and it does not invent a statutory threshold, a licence condition or an obligation.' }));

  page.appendChild(h('div', { class: 'grid c4' }, tile('Applicable (confirmed)', cc.APPLICABLE_CONFIRMED), tile('Potentially applicable', cc.POTENTIALLY_APPLICABLE, 'Triggers met; unverified', cc.POTENTIALLY_APPLICABLE ? 'accent' : null), tile('Not enough data', cc.NOT_ENOUGH_DATA, 'A trigger fact is unresolved', cc.NOT_ENOUGH_DATA ? 'alert' : 'ok'), tile('Evidence gaps', cc.evidenceGaps, 'No evidence attached', cc.evidenceGaps ? 'alert' : 'ok')));

  const tabs = h('div', { class: 'tabs', style: { 'margin-top': '14px' } });
  for (const t of LEGAL_TABS) tabs.appendChild(h('button', { class: 'tab', 'aria-selected': String(t.key === tab), text: t.label, onclick: () => { S.filters.legalTab = t.key; render(); } }));
  page.appendChild(tabs);

  if (tab === 'register') page.appendChild(registerTab());
  else if (tab === 'questions') page.appendChild(questionsTab());
  else if (tab === 'thresholds') page.appendChild(thresholdsTab(p));
  else if (tab === 'permits') page.appendChild(permitsTab(p));
  else if (tab === 'tasks') page.appendChild(tasksTab(p));
  else if (tab === 'sources') page.appendChild(legalSourcesTab());
  else if (tab === 'updates') page.appendChild(updatesTab(p));

  return page;
}

// ------------------------------------------------------------------ register

function registerTab() {
  const reg = complianceRegister();
  const wrap = h('div', {});
  const f = S.filters;

  const bar = h('div', { class: 'filters' });
  bar.appendChild(h('label', { text: 'Domain' }));
  bar.appendChild(select([{ value: '', label: 'All' }].concat(LEGAL_DOMAINS.map((d) => ({ value: d.key, label: d.label }))), f.legalDomain || '', { onchange: (e) => { S.filters.legalDomain = e.target.value; render(); } }));
  bar.appendChild(h('label', { text: 'Status' }));
  bar.appendChild(select([{ value: '', label: 'All' }, 'APPLICABLE_CONFIRMED', 'POTENTIALLY_APPLICABLE', 'NOT_ENOUGH_DATA', 'NOT_APPLICABLE_CONFIRMED', 'REQUIRES_LEGAL_REVIEW'].map((x) => (typeof x === 'string' ? { value: x, label: x.replace(/_/g, ' ') } : x)), f.legalStatus || '', { onchange: (e) => { S.filters.legalStatus = e.target.value; render(); } }));
  bar.appendChild(h('label', { text: 'Show' }));
  bar.appendChild(select([{ value: '', label: 'Everything' }, { value: 'GAPS', label: 'Evidence gaps only' }, { value: 'HIDE_NA', label: 'Hide not applicable' }], f.legalShow || 'HIDE_NA', { onchange: (e) => { S.filters.legalShow = e.target.value; render(); } }));
  bar.appendChild(h('label', { text: 'Search' }));
  bar.appendChild(input({ value: f.legalQ || '', placeholder: 'instrument, topic, authority…', oninput: (e) => { S.filters.legalQ = e.target.value; render(); } }));
  wrap.appendChild(bar);

  let list = reg;
  if (f.legalDomain) list = list.filter((r) => r.domain === f.legalDomain);
  if (f.legalStatus) list = list.filter((r) => r.effectiveStatus === f.legalStatus);
  const show = f.legalShow === undefined ? 'HIDE_NA' : f.legalShow;
  if (show === 'HIDE_NA') list = list.filter((r) => r.effectiveStatus !== 'NOT_APPLICABLE_CONFIRMED');
  if (show === 'GAPS') list = list.filter((r) => ['APPLICABLE_CONFIRMED', 'POTENTIALLY_APPLICABLE'].indexOf(r.effectiveStatus) !== -1 && (!r.evidence || !r.evidence.length));
  if (f.legalQ) {
    const q = String(f.legalQ).toLowerCase();
    list = list.filter((r) => (r.instrumentTitle + ' ' + r.topic + ' ' + (r.authority || '') + ' ' + (r.sectionRuleSchedule || '')).toLowerCase().indexOf(q) !== -1);
  }

  if (!list.length) {
    wrap.appendChild(emptyState('Nothing matches', 'Adjust the filters, or answer the open questions so instruments can be brought into the register or excluded with a reason.', h('button', { class: 'btn primary', text: 'Open questions', onclick: () => { S.filters.legalTab = 'questions'; render(); } })));
    return wrap;
  }

  const rows = list.map((r) => {
    const evidenceHeld = (r.evidence || []).length;
    const expected = (r.evidenceExpected || []).length;
    return h(
      'tr',
      {},
      h('td', {}, h('span', { class: 'tag', title: domainLabel(r.domain), text: r.domain || '—' })),
      h('td', {}, h('div', { style: { 'font-weight': '500' }, text: truncate(r.instrumentTitle, 54) }), r.isStandardGuidance ? h('span', { class: 'badge', text: 'STANDARD, NOT LAW' }) : null),
      h('td', { class: 'small', text: truncate(r.sectionRuleSchedule || '', 48) }),
      h('td', {}, h('div', { text: r.topic }), h('div', { class: 'muted small', text: truncate(r.applicabilityReason || '', 120) })),
      h('td', {}, applicBadge(r.effectiveStatus), r.humanStatus ? h('div', { class: 'muted', style: { 'font-size': '9.5px' }, text: 'set by a reviewer' }) : null),
      h('td', { class: 'num small', text: expected ? evidenceHeld + '/' + expected : '—' }),
      h('td', {}, r.complianceStatus ? h('span', { class: 'badge ' + complianceClass(r.complianceStatus), text: r.complianceStatus.replace(/_/g, ' ') }) : h('span', { class: 'muted small', text: '—' })),
      h('td', { class: 'small', text: truncate(r.authority || '', 36) }),
      h('td', { class: 'small nowrap', text: r.dueDate ? dateFmt(r.dueDate) : '—' }),
      h('td', { class: 'num small', text: String(linkedNodeCount(r)) }),
      h('td', { class: 'small' }, (r.sourceRefs || [])[0] && r.sourceRefs[0].url ? h('a', { href: r.sourceRefs[0].url, target: '_blank', rel: 'noopener', text: 'official source' }) : h('span', { class: 'muted', text: '—' })),
      h('td', { class: 'nowrap' }, h('button', { class: 'btn sm ghost', text: 'Open', onclick: () => recordDrawer(r) }))
    );
  });

  wrap.appendChild(
    tableWrap(
      [{ label: 'Domain', width: '74px' }, { label: 'Law / rule', width: '230px' }, { label: 'Section / rule', width: '160px' }, { label: 'Obligation', width: '300px' }, { label: 'Applicability', width: '106px' }, { label: 'Evidence', cls: 'num', width: '70px' }, { label: 'Status', width: '110px' }, { label: 'Authority', width: '150px' }, { label: 'Due / renewal', width: '96px' }, { label: 'Nodes', cls: 'num', width: '56px' }, { label: 'Source', width: '84px' }, { label: '', width: '58px' }],
      rows,
      { tableClass: 'wide-register' }
    )
  );
  wrap.appendChild(h('p', { class: 'muted small', style: { 'margin-top': '8px' }, text: 'Seed library ' + LEGAL_LIBRARY_VERSION + ', metadata seeded ' + LEGAL_LIBRARY_SEEDED_AT + '. Every instrument ships as METADATA_SEEDED_UNVERIFIED: the app tells you where the official text lives and does not pretend to have read it.' }));
  return wrap;
}

function complianceClass(s) {
  const map = { COMPLIANT_EVIDENCE_VERIFIED: 'verified', PARTIALLY_EVIDENCED: 'extracted', EVIDENCE_MISSING: 'missing', POTENTIAL_GAP: 'sourced', NOT_APPLICABLE: 'na', UNDER_REVIEW: 'inferred', EXPIRED: 'conflict', RENEWAL_DUE: 'sourced' };
  return map[s] || 'missing';
}

function linkedNodeCount(r) {
  const nodes = scoped('nodes');
  const crossedChemIds = (r.crossings || []).map((x) => x.chemicalId);
  let n = 0;
  for (const node of nodes) if ((node.chemicalIds || []).some((id) => crossedChemIds.indexOf(id) !== -1)) n += 1;
  const stored = scoped('legal_node_links').filter((l) => l.obligationId === r.obligationId).length;
  return Math.max(n, stored);
}

function recordDrawer(r) {
  const body = h('div', { class: 'stack' });

  body.appendChild(h('div', { class: 'row', style: { gap: '7px' } }, applicBadge(r.effectiveStatus), h('span', { class: 'tag', text: domainLabel(r.domain) }), r.isStandardGuidance ? h('span', { class: 'badge', text: 'STANDARD, NOT LAW' }) : null));
  body.appendChild(h('h3', { class: 'card-title', text: r.instrumentTitle }));
  body.appendChild(h('div', { class: 'small muted', text: r.sectionRuleSchedule }));
  body.appendChild(h('p', { style: { margin: '6px 0' }, text: r.topic }));

  const ob = LEGAL_OBLIGATIONS.filter((o) => o.id === r.obligationId)[0];
  if (ob) body.appendChild(h('div', { class: 'note plain' }, ob.summary));

  body.appendChild(h('div', { class: 'section-rule' }, h('h2', { text: 'Why this status' })));
  body.appendChild(h('div', { class: 'note' }, h('strong', { text: (r.setBy || '').replace(/_/g, ' ') + ': ' }), r.applicabilityReason));

  if (r.factsUsed && r.factsUsed.length) {
    body.appendChild(h('div', { class: 'tile-label', style: { 'margin-top': '10px' }, text: 'Project facts used' }));
    body.appendChild(
      h('div', { class: 'table-wrap', style: { 'max-height': 'none' } }, h('table', {}, h('thead', {}, h('tr', {}, h('th', { text: 'Fact' }), h('th', { text: 'Value' }), h('th', { text: 'From' }))), h('tbody', {}, r.factsUsed.map((f) => h('tr', {}, h('td', { class: 'mono small', text: f.fact }), h('td', {}, f.value === true ? h('span', { class: 'badge verified', text: 'TRUE' }) : f.value === false ? h('span', { class: 'badge na', text: 'FALSE' }) : f.value === null ? h('span', { class: 'badge missing', text: 'NOT RESOLVED' }) : h('span', { text: String(f.value) })), h('td', { class: 'small muted', text: (f.provenance && (f.provenance.from || []).join(', ')) || '' }))))))
    );
  }

  if (r.missingFacts && r.missingFacts.length) {
    body.appendChild(h('div', { class: 'note warn', style: { 'margin-top': '8px' } }, h('strong', { text: 'Unresolved facts: ' }), r.missingFacts.join(', '), '. Resolve them on the jurisdiction profile or the chemical inventory.'));
  }

  if (r.thresholdEvaluation) {
    const te = r.thresholdEvaluation;
    body.appendChild(h('div', { class: 'section-rule' }, h('h2', { text: 'Threshold evaluation' })));
    body.appendChild(h('p', { class: 'card-note', text: 'Conclusion: ' + te.conclusion.replace(/_/g, ' ') + '. Every comparison below is computed in code, never by the model.' }));
    if ((te.results || []).length) {
      body.appendChild(
        h('div', { class: 'table-wrap', style: { 'max-height': 'none' } }, h('table', {}, h('thead', {}, h('tr', {}, h('th', { text: 'Chemical' }), h('th', { text: 'Status' }), h('th', { text: 'Arithmetic' }), h('th', { text: 'Schedule' }))), h('tbody', {}, te.results.map((x) => h('tr', {}, h('td', { text: x.chemicalName || '—' }), h('td', {}, h('span', { class: 'badge ' + (x.crossed ? 'conflict' : x.status === 'EVALUATED' ? 'verified' : 'missing'), text: x.comparison || x.status })), h('td', { class: 'mono small', text: x.arithmetic || x.detail || '—' }), h('td', { class: 'small muted', text: truncate(x.thresholdLocator || '', 48) }))))))
      );
    }
    if ((te.unmatched || []).length) {
      body.appendChild(h('div', { class: 'note warn', style: { 'margin-top': '8px' } }, h('strong', { text: 'No schedule entry recorded for: ' }), te.unmatched.map((u) => u.chemicalName).join(', '), '. Absence of an entry is not a finding that the chemical is unscheduled.'));
    }
    if (te.aggregationQuestion) body.appendChild(h('div', { class: 'note plain small', style: { 'margin-top': '8px' }, text: te.aggregationQuestion }));
    if (r.actionNeeded === 'ENTER_VERIFIED_THRESHOLD') {
      body.appendChild(h('div', { class: 'btn-row', style: { 'margin-top': '8px' } }, h('button', { class: 'btn sm primary', text: 'Enter the scheduled quantities', onclick: () => { closeDrawer(); S.filters.legalTab = 'thresholds'; render(); } })));
    }
  }

  body.appendChild(h('div', { class: 'section-rule' }, h('h2', { text: 'Evidence expected' })));
  if ((r.evidenceExpected || []).length) {
    body.appendChild(
      h('ul', { class: 'list-none stack' }, r.evidenceExpected.map((item) => {
        const held = (r.evidence || []).filter((e) => e.expects === item);
        return h('li', { class: 'note plain' }, h('div', { class: 'between' }, h('span', { text: item }), held.some((e) => e.status === 'VERIFIED') ? h('span', { class: 'badge verified', text: 'VERIFIED' }) : held.length ? h('span', { class: 'badge extracted', text: 'HELD, NOT VERIFIED' }) : h('span', { class: 'badge missing', text: 'MISSING' })), held.length ? h('div', { class: 'muted small', text: held.map((e) => e.title).join(', ') }) : null, h('button', { class: 'btn sm ghost', style: { 'margin-top': '5px' }, text: 'Attach evidence', onclick: () => complianceEvidenceDialog(r, item) }));
      }))
    );
  } else {
    body.appendChild(h('p', { class: 'muted small', text: 'No evidence list defined for this obligation.' }));
  }

  body.appendChild(h('div', { class: 'section-rule' }, h('h2', { text: 'Source' })));
  for (const ref of r.sourceRefs || []) {
    body.appendChild(h('div', { class: 'note plain small' }, h('div', {}, h('strong', { text: 'Where to read it: ' }), ref.locator || '—'), ref.url ? h('div', {}, h('a', { href: ref.url, target: '_blank', rel: 'noopener', text: ref.url })) : null, h('div', { class: 'muted' }, 'Source status: ', ref.sourceStatus || 'unknown', '. ', ref.sourceStatus === 'METADATA_SEEDED_UNVERIFIED' ? 'The official text has not been retrieved in this deployment — fetch the current version before relying on it.' : '')));
  }

  body.appendChild(h('div', { class: 'section-rule' }, h('h2', { text: 'Reviewer decision' })));
  const statusSel = select([{ value: '', label: '— keep the engine\'s status —' }].concat(['APPLICABLE_CONFIRMED', 'NOT_APPLICABLE_CONFIRMED', 'REQUIRES_LEGAL_REVIEW'].map((x) => ({ value: x, label: x.replace(/_/g, ' ') }))), r.humanStatus || '', { id: 'cr-status' });
  const reason = textarea({ value: r.humanReason || '', rows: 3, id: 'cr-reason', placeholder: 'What did you check, and on what basis?' });
  const compSel = select([{ value: '', label: '— not set —' }].concat(COMPLIANCE_STATUS.map((x) => ({ value: x, label: x.replace(/_/g, ' ') }))), r.complianceStatus || '', { id: 'cr-comp' });
  const owner = input({ value: r.owner || '', id: 'cr-owner' });
  const due = input({ type: 'date', value: r.dueDate || '', id: 'cr-due' });
  const gap = textarea({ value: r.gapDescription || '', rows: 2, id: 'cr-gap' });
  const permitSel = select([{ value: '', label: '— none —' }].concat(scoped('permits').map((x) => ({ value: x.id, label: (x.permitType || 'permit') + ' ' + (x.number || '') }))), r.permitId || '', { id: 'cr-permit' });

  body.appendChild(h('div', { class: 'note plain small' }, 'A confirmed status is a reviewer\'s decision, not the engine\'s. The engine records why it reached its own status and keeps it alongside yours.'));
  body.appendChild(field('Applicability (reviewer)', statusSel));
  body.appendChild(field('Reason', reason));
  body.appendChild(h('div', { class: 'grid c2' }, field('Compliance status', compSel), field('Linked permit', permitSel), field('Owner', owner), field('Due / renewal date', due)));
  body.appendChild(field('Gap description', gap));

  const computeBtn = h('button', {
    class: 'btn sm',
    text: 'Compute the compliance status from the evidence',
    onclick: () => {
      const permit = scoped('permits').filter((x) => x.id === permitSel.value)[0];
      const e = permit ? expiryStatus({ expiryDate: permit.expiryDate, renewalDate: permit.renewalDate, today: new Date().toISOString().slice(0, 10), revoked: permit.revoked }) : null;
      const out = computeComplianceStatus({ applicability: statusSel.value || r.applicabilityStatus, evidenceExpected: r.evidenceExpected, evidence: r.evidence, permit: permit ? { expiryStatus: e.status, number: permit.number } : null });
      compSel.value = out.status;
      gap.value = out.gaps.join('; ');
      toast('Computed: ' + out.status.replace(/_/g, ' ') + ' — ' + out.reason.replace(/_/g, ' ').toLowerCase(), 'ok');
    },
  });
  body.appendChild(h('div', { class: 'btn-row' }, computeBtn, aiAvailable() ? h('button', { class: 'btn sm ghost', text: 'Explain this finding', onclick: () => explain(r) }) : null));

  drawer('Compliance record', body, [
    h('button', { class: 'btn', text: 'Cancel', onclick: closeDrawer }),
    h('button', {
      class: 'btn primary',
      text: 'Save decision',
      onclick: async () => {
        if (statusSel.value) {
          const check = legalStatusTransition({ from: r.effectiveStatus, to: statusSel.value, actorKind: 'human', actorRole: S.actor.role, factsAllVerified: (r.missingFacts || []).length === 0 });
          if (!check.ok) {
            toast(explainTransition(check.reason), 'err');
            return;
          }
          if (!reason.value.trim()) {
            toast('A confirmed status needs a recorded reason.', 'err');
            return;
          }
        }
        const rec = {
          projectId: S.projectId,
          obligationId: r.obligationId,
          instrumentId: r.instrumentId,
          applicabilityStatus: statusSel.value || null,
          humanReason: reason.value.trim(),
          complianceStatus: compSel.value || null,
          owner: owner.value.trim(),
          dueDate: due.value || null,
          gapDescription: gap.value.trim(),
          permitId: permitSel.value || null,
          reviewedBy: statusSel.value ? S.actor.id : r.reviewedBy || null,
          reviewedAt: statusSel.value ? nowIso() : r.reviewedAt || null,
          legalSourceVersion: r.legalSourceVersion,
          engineStatus: r.applicabilityStatus,
          engineReason: r.applicabilityReason,
        };
        if (r.storedId) await S.store.update('compliance', r.storedId, rec, { projectId: S.projectId, field: 'applicabilityStatus' });
        else await S.store.create('compliance', rec, { projectId: S.projectId });
        closeDrawer();
        toast('Decision recorded', 'ok');
        render();
      },
    }),
  ]);
}

function explainTransition(reason) {
  const map = {
    AI_CANNOT_CONFIRM_APPLICABILITY: 'The AI layer cannot confirm applicability.',
    ROLE_NOT_AUTHORIZED: 'Confirming applicability needs the facilitator or reviewer role.',
    FACTS_NOT_VERIFIED: 'Some facts this conclusion rests on are not resolved. Resolve them first, or record REQUIRES_LEGAL_REVIEW instead.',
  };
  return map[reason] || reason;
}

async function explain(r) {
  toast('Asking…');
  try {
    const out = await explainApplicability(r);
    const e = out.explanation || {};
    drawer(
      'Explanation',
      h(
        'div',
        { class: 'stack' },
        h('div', { class: 'note plain small', text: 'This is an explanation of the application\'s own finding. The status is unchanged, and the model was told it cannot propose a different one.' }),
        h('div', {}, h('div', { class: 'tile-label', text: 'What the project facts say' }), h('p', { text: e.factsSay || '—' })),
        h('div', {}, h('div', { class: 'tile-label', text: 'What the application concluded' }), h('p', { text: e.systemConcluded || '—' })),
        (e.openQuestions || []).length ? h('div', {}, h('div', { class: 'tile-label', text: 'Open questions' }), h('ul', { class: 'list-compact' }, (e.openQuestions || []).map((x) => h('li', { text: x })))) : null,
        (e.toResolve || []).length ? h('div', {}, h('div', { class: 'tile-label', text: 'To resolve it' }), h('ul', { class: 'list-compact' }, (e.toResolve || []).map((x) => h('li', { text: x })))) : null
      ),
      [h('button', { class: 'btn', text: 'Close', onclick: closeDrawer })]
    );
  } catch (err) {
    toast('Could not explain: ' + ((err && err.message) || 'unknown error'), 'err');
  }
}

function complianceEvidenceDialog(r, expects) {
  const docs = scoped('documents');
  const title = input({ id: 'ce-title', placeholder: 'What the evidence is' });
  const docSel = select([{ value: '', label: '— none —' }].concat(docs.map((d) => ({ value: d.id, label: d.title }))), '', { id: 'ce-doc' });
  const from = input({ type: 'date', id: 'ce-from' });
  const to = input({ type: 'date', id: 'ce-to' });
  const status = select([{ value: 'DOCUMENT_EXTRACTED', label: 'Held' }, { value: 'VERIFIED', label: 'Verified by me' }], 'DOCUMENT_EXTRACTED', { id: 'ce-status' });
  const note = textarea({ rows: 2, id: 'ce-note' });

  drawer('Attach evidence', h('div', {}, h('div', { class: 'note plain small', text: 'Satisfies: ' + expects }), field('Title', title), field('Document', docSel), h('div', { class: 'grid c2' }, field('Valid from', from), field('Valid to', to)), field('Status', status, 'Only a reviewer or admin may mark evidence VERIFIED, and only verified evidence can make a record COMPLIANT.'), field('Note', note)), [
    h('button', { class: 'btn', text: 'Cancel', onclick: closeDrawer }),
    h('button', {
      class: 'btn primary',
      text: 'Attach',
      onclick: async () => {
        if (status.value === 'VERIFIED' && ['admin', 'facilitator', 'reviewer'].indexOf(S.actor.role) === -1) {
          toast('Marking evidence VERIFIED needs the reviewer role.', 'err');
          return;
        }
        const doc = docs.filter((d) => d.id === docSel.value)[0];
        await S.store.create('compliance_evidence', { projectId: S.projectId, obligationId: r.obligationId, expects, title: title.value.trim() || (doc ? doc.title : 'Evidence'), documentId: doc ? doc.id : null, validFrom: from.value || null, validTo: to.value || null, status: status.value, note: note.value.trim(), verifiedBy: status.value === 'VERIFIED' ? S.actor.id : null, verifiedAt: status.value === 'VERIFIED' ? nowIso() : null }, { projectId: S.projectId });
        closeDrawer();
        toast('Evidence attached', 'ok');
        render();
      },
    }),
  ]);
}

// ----------------------------------------------------------------- questions

function questionsTab() {
  const run = applicability();
  const wrap = h('div', {});
  if (!run || !run.pendingQuestions.length) {
    wrap.appendChild(emptyState('No open questions', 'Every instrument trigger has an answer. The register now reflects the project facts as recorded.', h('button', { class: 'btn primary', text: 'Open the register', onclick: () => { S.filters.legalTab = 'register'; render(); } })));
    return wrap;
  }
  wrap.appendChild(h('p', { class: 'card-note', text: run.pendingQuestions.length + ' unanswered trigger question(s). Each answer either brings an instrument into the register or excludes it with a recorded reason — an unanswered question leaves its obligations at NOT_ENOUGH_DATA, which is honest but not useful.' }));
  for (const q of run.pendingQuestions) {
    wrap.appendChild(
      h(
        'div',
        { class: 'card' },
        h('div', { class: 'between' }, h('h3', { class: 'card-title', text: q.question }), h('span', { class: 'badge', text: q.obligationCount + ' obligation' + (q.obligationCount === 1 ? '' : 's') })),
        h('p', { class: 'card-note', text: 'Gates: ' + q.instruments.map((i) => i.title).join('; ') }),
        h('div', { class: 'btn-row' }, h('button', { class: 'btn sm primary', text: 'Answer on the jurisdiction profile', onclick: () => go('projects') }), h('span', { class: 'mono small muted', text: q.fact }))
      )
    );
  }
  if (run.excluded.length) {
    wrap.appendChild(sectionRule('Excluded instruments (' + run.excluded.length + ')'));
    wrap.appendChild(h('div', { class: 'card' }, h('p', { class: 'card-note', text: 'Excluded because a trigger fact is answered false. The exclusion and its reason are printed in the report, so the reader can see what was considered and ruled out.' }), h('ul', { class: 'list-compact small' }, run.excluded.map((e) => h('li', {}, e.title, h('span', { class: 'muted', text: ' — ' + e.triggers.join(', ') + ' false' }))))));
  }
  return wrap;
}

// ---------------------------------------------------------------- thresholds

function thresholdsTab(p) {
  const sets = thresholdSets();
  const chems = chemicalsResolved();
  const wrap = h('div', {});

  wrap.appendChild(
    h('div', { class: 'note', style: { 'margin-bottom': '12px' } }, h('strong', { text: 'The seed library ships no numeric thresholds, by design. ' }), 'A statutory quantity is a legal fact: it is read from the official schedule and cited, not recalled by a model. Enter the figures below and the engine computes every crossing deterministically, showing its arithmetic and its unit conversions.')
  );

  for (const set of sets) {
    const card = h('div', { class: 'card' });
    card.appendChild(h('div', { class: 'between' }, h('div', {}, h('h3', { class: 'card-title', text: set.label }), h('p', { class: 'card-note', text: set.basis || '' })), h('button', { class: 'btn sm primary', text: 'Add an entry', onclick: () => thresholdDialog(p, set, null) })));
    card.appendChild(h('div', { class: 'note plain small' }, h('strong', { text: 'Where to read it: ' }), set.locator, set.officialSourceUrl ? h('span', {}, ' — ', h('a', { href: set.officialSourceUrl, target: '_blank', rel: 'noopener', text: set.officialSourceUrl })) : null));
    if (set.guidance) card.appendChild(h('p', { class: 'field-hint', text: set.guidance }));

    if (!set.entries.length) {
      card.appendChild(h('p', { class: 'muted small', style: { 'margin-top': '8px' }, text: 'No entries. Obligations that turn on this set stay POTENTIALLY_APPLICABLE until at least one verified entry exists.' }));
    } else {
      const rows = set.entries.map((e) =>
        h('tr', {}, h('td', { text: e.chemicalName || '—' }), h('td', { class: 'mono small', text: e.cas || '—' }), h('td', { class: 'num mono', text: String(e.value) + ' ' + (e.unit || '') }), h('td', {}, statusBadge(e.status)), h('td', { class: 'small', text: truncate(e.locator || '', 54) }), h('td', { class: 'small muted', text: e.enteredBy ? dtFmt(e.enteredAt) : '' }), h('td', {}, h('button', { class: 'btn sm ghost', text: 'Edit', onclick: () => thresholdDialog(p, set, e) })))
      );
      card.appendChild(h('div', { class: 'table-wrap', style: { 'max-height': 'none', 'margin-top': '10px' } }, h('table', {}, h('thead', {}, h('tr', {}, h('th', { text: 'Chemical / class' }), h('th', { text: 'CAS' }), h('th', { text: 'Quantity', cls: 'num' }), h('th', { text: 'Status' }), h('th', { text: 'Schedule entry cited' }), h('th', { text: 'Entered' }), h('th', { text: '' }))), h('tbody', {}, rows))));

      // Live evaluation
      const out = evaluateInventory({ thresholdSet: set, chemicals: chems });
      card.appendChild(h('div', { class: 'section-rule' }, h('h2', { text: 'Evaluation against the site inventory' })));
      card.appendChild(h('p', { class: 'card-note', text: 'Conclusion: ' + out.conclusion.replace(/_/g, ' ') + ' · ' + out.summary.evaluated + ' evaluated, ' + out.summary.crossed + ' crossed, ' + out.summary.blocked + ' blocked, ' + out.summary.unmatched + ' with no entry.' }));
      if ((out.results || []).length) {
        const erows = out.results.map((x) =>
          h('tr', {}, h('td', { text: x.chemicalName || '—' }), h('td', {}, h('span', { class: 'badge ' + (x.crossed ? 'conflict' : x.status === 'EVALUATED' ? 'verified' : 'missing'), text: x.comparison || x.status })), h('td', { class: 'mono small', text: x.arithmetic || '—' }), h('td', { class: 'small' }, (x.conversion || []).length ? h('ul', { class: 'list-compact', style: { 'font-size': '11px' } }, x.conversion.map((c) => h('li', { text: c.rule }))) : h('span', { class: 'muted', text: '—' })), h('td', { class: 'small muted', text: x.detail || (x.notes || []).join(' ') }))
        );
        card.appendChild(h('div', { class: 'table-wrap', style: { 'max-height': 'none' } }, h('table', {}, h('thead', {}, h('tr', {}, h('th', { text: 'Chemical' }), h('th', { text: 'Result' }), h('th', { text: 'Arithmetic' }), h('th', { text: 'Unit-conversion evidence' }), h('th', { text: 'Note' }))), h('tbody', {}, erows))));
      }
      if (out.aggregationQuestion) card.appendChild(h('div', { class: 'note warn small', style: { 'margin-top': '8px' }, text: out.aggregationQuestion }));
    }
    wrap.appendChild(card);
  }
  return wrap;
}

function thresholdDialog(p, set, e) {
  const chems = chemicalsResolved();
  const name = input({ value: (e && e.chemicalName) || '', id: 'th-name', placeholder: 'Exactly as the schedule names it' });
  const cas = input({ value: (e && e.cas) || '', id: 'th-cas' });
  const isClass = h('input', { type: 'checkbox', id: 'th-class', checked: !!(e && e.isClass) });
  const value = input({ type: 'number', step: 'any', value: (e && e.value) || '', id: 'th-value' });
  const unit = select(['kg', 'MT', 't', 'g', 'lb'], (e && e.unit) || 'MT', { id: 'th-unit' });
  const locator = input({ value: (e && e.locator) || '', id: 'th-loc', placeholder: 'e.g. Schedule 1, Part II, entry 24' });
  const url = input({ value: (e && e.sourceUrl) || set.officialSourceUrl || '', id: 'th-url' });
  const status = select([{ value: 'USER_CONFIRMED', label: 'I read this from the official text (USER_CONFIRMED)' }, { value: 'VERIFIED', label: 'Verified against the official text (VERIFIED)' }], (e && e.status) || 'USER_CONFIRMED', { id: 'th-status' });
  const err = h('div', { class: 'field-err', text: '' });

  const suggest = h('div', { class: 'row', style: { gap: '4px' } }, chems.map((c) => h('button', { class: 'pill', type: 'button', text: c.canonicalName, onclick: () => { name.value = c.canonicalName; if (c.cas) cas.value = c.cas; } })));

  const body = h(
    'div',
    {},
    h('div', { class: 'note plain small', text: 'Entering a figure records it as a project fact with your name against it. It is never taken from the model.' }),
    field('Chemical or class name', name),
    h('div', { class: 'field' }, h('span', { text: 'From the inventory' }), suggest),
    h('div', { class: 'grid c2' }, field('CAS', cas), h('label', { class: 'field inline' }, isClass, h('span', { text: 'This is a class entry, not a single substance' }))),
    h('div', { class: 'grid c2' }, field('Quantity', value), field('Unit', unit)),
    field('Schedule entry', locator, 'Required. The engine refuses to use an uncited figure.'),
    field('Official source URL', url),
    field('Status', status),
    err
  );

  drawer(e ? 'Edit threshold entry' : 'Add a threshold entry', body, [
    e ? h('button', { class: 'btn danger', text: 'Delete', onclick: async () => { await S.store.remove('legal_thresholds', e.id, { projectId: p.id }); closeDrawer(); render(); } }) : null,
    h('button', { class: 'btn', text: 'Cancel', onclick: closeDrawer }),
    h('button', {
      class: 'btn primary',
      text: 'Save',
      onclick: async () => {
        const entry = { chemicalName: name.value.trim(), cas: cas.value.trim() || null, isClass: isClass.checked, value: value.value === '' ? null : Number(value.value), unit: unit.value, locator: locator.value.trim(), status: status.value };
        const v = validateThresholdEntry(entry);
        if (!v.ok) {
          err.textContent = v.errors.join(' ');
          return;
        }
        if (entry.status === 'VERIFIED' && ['admin', 'facilitator', 'reviewer'].indexOf(S.actor.role) === -1) {
          err.textContent = 'Marking a threshold VERIFIED needs the reviewer role. Use USER_CONFIRMED instead.';
          return;
        }
        const rec = Object.assign({}, entry, { projectId: p.id, setKey: set.id, instrumentId: set.instrumentId, sourceUrl: url.value.trim() || null, sourceRefs: [{ sourceType: 'RULE', kind: 'USER_UPLOADED_OFFICIAL', locator: entry.locator, url: url.value.trim() || null, retrievedAt: nowIso() }], enteredBy: S.actor.id, enteredAt: nowIso(), verifiedBy: entry.status === 'VERIFIED' ? S.actor.id : null, verifiedAt: entry.status === 'VERIFIED' ? nowIso() : null });
        if (e) await S.store.update('legal_thresholds', e.id, rec, { projectId: p.id });
        else await S.store.create('legal_thresholds', rec, { projectId: p.id });
        closeDrawer();
        toast('Threshold entry saved — the engine will now compute the comparison', 'ok');
        render();
      },
    }),
  ]);
}

// ------------------------------------------------------------------- permits

const PERMIT_TYPES = ['OSH / factory registration', 'OSH / factory licence', 'GPCB CTE', 'GPCB CTO', 'GPCB CCA', 'Hazardous-waste authorization', 'Environmental Clearance', 'PESO petroleum licence', 'PESO SMPV approval', 'PESO gas cylinder licence', 'Fire NOC', 'Boiler certificate', 'Electrical inspector approval', 'Groundwater permission', 'Public liability insurance', 'Other'];

function permitsTab(p) {
  const permits = permitStatuses();
  const wrap = h('div', {});
  wrap.appendChild(h('div', { class: 'btn-row', style: { 'margin-bottom': '12px' } }, h('button', { class: 'btn primary', text: 'Add permit / consent', onclick: () => permitDialog(p, null) })));

  if (!permits.length) {
    wrap.appendChild(emptyState('No permits recorded', 'Record the registrations, consents, licences and approvals the site holds. An expired permit forces every compliance record that depends on it to EXPIRED, whatever its evidence says.', h('button', { class: 'btn primary', text: 'Add permit / consent', onclick: () => permitDialog(p, null) })));
    return wrap;
  }

  const rows = permits.map((x) =>
    h(
      'tr',
      {},
      h('td', {}, h('div', { style: { 'font-weight': '500' }, text: x.permitType || 'Permit' }), x.label ? h('div', { class: 'muted small', text: x.label }) : null),
      h('td', { class: 'small', text: x.issuingAuthority || '—' }),
      h('td', { class: 'mono small', text: x.number || '—' }),
      h('td', { class: 'small nowrap', text: x.issueDate ? dateFmt(x.issueDate) : '—' }),
      h('td', { class: 'small nowrap', text: x.expiryDate ? dateFmt(x.expiryDate) : '—' }),
      h('td', { class: 'small nowrap', text: x.renewalDate ? dateFmt(x.renewalDate) : '—' }),
      h('td', {}, expiryBadge(x.expiry)),
      h('td', { class: 'small', text: truncate(x.approvedCapacity || '', 28) }),
      h('td', { class: 'num small', text: String((scoped('permit_conditions').filter((c) => c.permitId === x.id) || []).length) }),
      h('td', { class: 'nowrap' }, h('button', { class: 'btn sm ghost', text: 'Open', onclick: () => permitDialog(p, x) }), h('button', { class: 'btn sm ghost', text: 'Conditions', onclick: () => conditionsDrawer(x) }))
    )
  );

  wrap.appendChild(tableWrap([{ label: 'Type' }, { label: 'Authority' }, { label: 'Number' }, { label: 'Issued' }, { label: 'Expiry' }, { label: 'Renewal' }, { label: 'Status' }, { label: 'Approved capacity' }, { label: 'Conditions', cls: 'num' }, { label: '' }], rows));

  const expired = permits.filter((x) => x.expiry.status === 'EXPIRED');
  if (expired.length) wrap.appendChild(h('div', { class: 'note crit', style: { 'margin-top': '12px' } }, h('strong', { text: expired.length + ' permit(s) are expired. ' }), 'Every compliance record linked to them reads EXPIRED, and the report is blocked until this is resolved or the status is corrected.'));
  return wrap;
}

function permitDialog(p, x) {
  const g = (k) => (x && x[k] !== undefined && x[k] !== null ? x[k] : '');
  const type = select(PERMIT_TYPES.map((t) => ({ value: t, label: t })), g('permitType') || PERMIT_TYPES[0], { id: 'pm-type' });
  const label = input({ value: g('label'), id: 'pm-label' });
  const authority = input({ value: g('issuingAuthority'), id: 'pm-auth' });
  const number = input({ value: g('number'), id: 'pm-num' });
  const issue = input({ type: 'date', value: g('issueDate'), id: 'pm-issue' });
  const effective = input({ type: 'date', value: g('effectiveDate'), id: 'pm-eff' });
  const expiry = input({ type: 'date', value: g('expiryDate'), id: 'pm-exp' });
  const renewal = input({ type: 'date', value: g('renewalDate'), id: 'pm-ren' });
  const notice = input({ type: 'number', value: x && x.noticeDays ? x.noticeDays : 90, id: 'pm-notice' });
  const capacity = input({ value: g('approvedCapacity'), id: 'pm-cap' });
  const conditions = textarea({ value: g('keyConditions'), rows: 4, id: 'pm-cond' });
  const revoked = h('input', { type: 'checkbox', id: 'pm-revoked', checked: !!(x && x.revoked) });
  const ack = h('input', { type: 'checkbox', id: 'pm-ack', checked: !!(x && x.renewalAcknowledged) });
  const docs = scoped('documents');
  const docSel = select([{ value: '', label: '— none —' }].concat(docs.map((d) => ({ value: d.id, label: d.title }))), g('documentId'), { id: 'pm-doc' });

  const live = h('div', { class: 'note plain small' });
  const updateLive = () => {
    const e = expiryStatus({ expiryDate: expiry.value, renewalDate: renewal.value, today: new Date().toISOString().slice(0, 10), noticeDays: Number(notice.value) || 90, revoked: revoked.checked });
    live.textContent = 'Computed status: ' + e.status.replace(/_/g, ' ') + (e.daysRemaining === null ? '' : ' (' + e.daysRemaining + ' day(s))') + ' — ' + e.reason.replace(/_/g, ' ').toLowerCase() + '.';
  };
  [expiry, renewal, notice].forEach((el) => el.addEventListener('change', updateLive));
  revoked.addEventListener('change', updateLive);
  updateLive();

  const body = h(
    'div',
    {},
    h('div', { class: 'grid c2' }, field('Type', type), field('Label', label), field('Issuing authority', authority), field('Number', number)),
    h('div', { class: 'grid c2' }, field('Issue date', issue), field('Effective date', effective), field('Expiry date', expiry), field('Renewal date', renewal), field('Notice window (days)', notice, 'How far ahead the app flags an expiry.')),
    live,
    h('div', { class: 'grid c2' }, h('label', { class: 'field inline' }, revoked, h('span', { text: 'Revoked or suspended' })), h('label', { class: 'field inline' }, ack, h('span', { text: 'Renewal acknowledged' }))),
    field('Approved capacity', capacity),
    field('Source document', docSel, 'Upload the permit on the documents page, then select it here so its conditions can be extracted.'),
    field('Key conditions (summary)', conditions, 'Use the Conditions panel to record conditions verbatim; this field is a summary only.')
  );

  drawer(x ? 'Edit permit' : 'Add permit / consent', body, [
    x ? h('button', { class: 'btn danger', text: 'Delete', onclick: async () => { const ok = await confirmAction('Delete this permit record?', 'Its extracted conditions are deleted too.'); if (!ok) return; for (const c of scoped('permit_conditions').filter((c2) => c2.permitId === x.id)) await S.store.remove('permit_conditions', c.id, { projectId: p.id }); await S.store.remove('permits', x.id, { projectId: p.id }); closeDrawer(); render(); } }) : null,
    h('button', { class: 'btn', text: 'Cancel', onclick: closeDrawer }),
    h('button', {
      class: 'btn primary',
      text: 'Save',
      onclick: async () => {
        const rec = { projectId: p.id, permitType: type.value, label: label.value.trim(), issuingAuthority: authority.value.trim(), number: number.value.trim(), issueDate: issue.value || null, effectiveDate: effective.value || null, expiryDate: expiry.value || null, renewalDate: renewal.value || null, noticeDays: Number(notice.value) || 90, approvedCapacity: capacity.value.trim(), keyConditions: conditions.value.trim(), revoked: revoked.checked, renewalAcknowledged: ack.checked, documentId: docSel.value || null };
        if (x) await S.store.update('permits', x.id, rec, { projectId: p.id });
        else await S.store.create('permits', rec, { projectId: p.id });
        closeDrawer();
        toast('Permit saved', 'ok');
        render();
      },
    }),
  ]);
}

function conditionsDrawer(permit) {
  const conditions = scoped('permit_conditions').filter((c) => c.permitId === permit.id);
  const doc = permit.documentId ? scoped('documents').filter((d) => d.id === permit.documentId)[0] : null;
  const body = h('div', { class: 'stack' });

  body.appendChild(h('div', { class: 'note plain small' }, h('strong', { text: 'Conditions are stored verbatim. ' }), 'Any interpretation is stored separately and labelled as analysis, so a reading is never mistaken for the document\'s words.'));

  if (doc && doc.text && aiAvailable()) {
    body.appendChild(h('div', { class: 'btn-row' }, h('button', { class: 'btn sm primary', text: 'Extract conditions from ' + truncate(doc.title, 30), onclick: () => extractConditions(permit, doc) })));
  } else if (!doc) {
    body.appendChild(h('p', { class: 'muted small', text: 'Link the permit document on the permit record to extract its conditions, or add them by hand below.' }));
  }

  body.appendChild(h('div', { class: 'btn-row' }, h('button', { class: 'btn sm', text: 'Add a condition', onclick: () => conditionDialog(permit, null) })));

  if (!conditions.length) body.appendChild(h('p', { class: 'muted small', text: 'No conditions recorded.' }));
  for (const c of conditions) {
    const due = c.frequency ? nextDue({ frequency: c.frequency, lastCompleted: c.lastCompleted, startFrom: c.statedDueDate || permit.issueDate, today: new Date().toISOString().slice(0, 10) }) : null;
    body.appendChild(
      h(
        'div',
        { class: 'card' },
        h('div', { class: 'between' }, h('div', { class: 'row', style: { gap: '6px' } }, h('span', { class: 'tag', text: c.conditionNumber || '—' }), c.category ? h('span', { class: 'pill', text: c.category }) : null, c.frequency ? h('span', { class: 'badge', text: (FREQUENCIES[c.frequency] || {}).label || c.frequency }) : null), h('button', { class: 'btn sm ghost', text: 'Edit', onclick: () => conditionDialog(permit, c) })),
        h('p', { style: { margin: '6px 0', 'font-style': 'italic' }, text: '“' + c.text + '”' }),
        c.analysis ? h('div', { class: 'note plain small' }, h('strong', { text: 'Analysis — not the document\'s words: ' }), c.analysis, ' ', statusBadge(c.analysisStatus || 'AI_INFERRED')) : null,
        due ? h('div', { class: 'small muted', style: { 'margin-top': '5px' }, text: 'Next due: ' + (due.dueDate ? dateFmt(due.dueDate) : due.status.replace(/_/g, ' ').toLowerCase()) + (due.status === 'OVERDUE' ? ' — overdue' : '') }) : null,
        due && due.dueDate ? h('button', { class: 'btn sm', style: { 'margin-top': '6px' }, text: 'Create a compliance task', onclick: () => createTaskFromCondition(permit, c, due) }) : null
      )
    );
  }

  drawer((permit.permitType || 'Permit') + ' ' + (permit.number || '') + ' — conditions', body, [h('button', { class: 'btn', text: 'Close', onclick: closeDrawer })]);
}

async function extractConditions(permit, doc) {
  toast('Extracting conditions…');
  try {
    const out = await extractPermitConditions(permit, doc.text);
    let made = 0;
    for (const c of out.conditions) {
      if (scoped('permit_conditions').some((x) => x.permitId === permit.id && x.text === c.text)) continue;
      await S.store.create('permit_conditions', Object.assign({}, c, { projectId: permit.projectId, permitId: permit.id, aiRunId: out.runId, sourceRefs: [{ sourceType: permit.permitType && /consent/i.test(permit.permitType) ? 'CONSENT_CONDITION' : 'LICENCE_CONDITION', documentId: doc.id, documentName: doc.title, extractedAt: nowIso() }] }), { projectId: permit.projectId, actorKind: 'ai', aiRunId: out.runId });
      made += 1;
    }
    toast(made + ' condition(s) extracted verbatim', 'ok');
    closeDrawer();
    render();
  } catch (e) {
    toast('Extraction failed: ' + ((e && e.message) || 'unknown error'), 'err');
  }
}

function conditionDialog(permit, c) {
  const number = input({ value: (c && c.conditionNumber) || '', id: 'pc-num' });
  const text = textarea({ value: (c && c.text) || '', rows: 4, id: 'pc-text', placeholder: 'The condition, word for word' });
  const category = select(['monitoring', 'return', 'capacity', 'infrastructure', 'reporting', 'other'], (c && c.category) || 'other', { id: 'pc-cat' });
  const freq = select([{ value: '', label: '— none —' }].concat(Object.keys(FREQUENCIES).map((k) => ({ value: k, label: FREQUENCIES[k].label }))), (c && c.frequency) || '', { id: 'pc-freq' });
  const dueDate = input({ type: 'date', value: (c && c.statedDueDate) || '', id: 'pc-due' });
  const analysis = textarea({ value: (c && c.analysis) || '', rows: 3, id: 'pc-analysis' });

  drawer(c ? 'Edit condition' : 'Add condition', h('div', {}, h('div', { class: 'grid c2' }, field('Condition number', number), field('Category', category)), field('Condition text (verbatim)', text, 'Reproduce it exactly. Do not paraphrase.'), h('div', { class: 'grid c2' }, field('Frequency', freq), field('Stated due date', dueDate, 'Only if the document states one. The app does not invent a date.')), field('Analysis (clearly separate from the condition)', analysis)), [
    c ? h('button', { class: 'btn danger', text: 'Delete', onclick: async () => { await S.store.remove('permit_conditions', c.id, { projectId: permit.projectId }); closeDrawer(); render(); } }) : null,
    h('button', { class: 'btn', text: 'Cancel', onclick: closeDrawer }),
    h('button', {
      class: 'btn primary',
      text: 'Save',
      onclick: async () => {
        if (!text.value.trim()) {
          toast('The condition text is required.', 'err');
          return;
        }
        const rec = { projectId: permit.projectId, permitId: permit.id, conditionNumber: number.value.trim(), text: text.value.trim(), category: category.value, frequency: freq.value || null, statedDueDate: dueDate.value || null, analysis: analysis.value.trim(), analysisStatus: analysis.value.trim() ? 'USER_CONFIRMED' : null };
        if (c) await S.store.update('permit_conditions', c.id, rec, { projectId: permit.projectId });
        else await S.store.create('permit_conditions', rec, { projectId: permit.projectId });
        closeDrawer();
        render();
      },
    }),
  ]);
}

async function createTaskFromCondition(permit, c, due) {
  await S.store.create('compliance_tasks', { projectId: permit.projectId, permitId: permit.id, conditionId: c.id, title: (c.category || 'Condition') + ' — ' + truncate(c.text, 80), detail: c.text, frequency: c.frequency, anchorDate: c.statedDueDate || permit.issueDate, dueDate: due.dueDate, status: due.status, evidenceRequired: true }, { projectId: permit.projectId });
  toast('Compliance task created', 'ok');
  closeDrawer();
  render();
}

// --------------------------------------------------------------------- tasks

function tasksTab(p) {
  const tasks = taskStatuses();
  const wrap = h('div', {});
  wrap.appendChild(h('div', { class: 'btn-row', style: { 'margin-bottom': '12px' } }, h('button', { class: 'btn primary', text: 'Add task', onclick: () => taskDialog(p, null) })));
  if (!tasks.length) {
    wrap.appendChild(emptyState('No recurring tasks', 'Returns, monitoring and inspections come from permit conditions, or you can add them directly. Due dates are computed from the frequency and the last completion, never guessed.', h('button', { class: 'btn primary', text: 'Add task', onclick: () => taskDialog(p, null) })));
    return wrap;
  }
  const rows = tasks.map((t) =>
    h('tr', {}, h('td', { text: t.title }), h('td', { class: 'small', text: (FREQUENCIES[t.frequency] || {}).label || t.frequency || '—' }), h('td', { class: 'small nowrap', text: t.lastCompleted ? dateFmt(t.lastCompleted) : '—' }), h('td', { class: 'small nowrap', text: t.due.dueDate ? dateFmt(t.due.dueDate) : '—' }), h('td', {}, h('span', { class: 'badge ' + (t.due.status === 'OVERDUE' ? 'conflict' : t.due.status === 'DUE_SOON' ? 'sourced' : t.due.status === 'SCHEDULED' ? 'verified' : 'missing'), text: t.due.status.replace(/_/g, ' ') + (t.due.daysRemaining !== null && t.due.daysRemaining !== undefined ? ' ' + t.due.daysRemaining + 'd' : '') })), h('td', { class: 'small', text: t.owner || '—' }), h('td', {}, h('button', { class: 'btn sm ghost', text: 'Edit', onclick: () => taskDialog(p, t) }), h('button', { class: 'btn sm ghost', text: 'Mark done', onclick: () => markDone(t) })))
  );
  wrap.appendChild(tableWrap([{ label: 'Task' }, { label: 'Frequency' }, { label: 'Last completed' }, { label: 'Next due' }, { label: 'Status' }, { label: 'Owner' }, { label: '' }], rows));
  return wrap;
}

function taskDialog(p, t) {
  const title = input({ value: (t && t.title) || '', id: 'tk-title' });
  const detail = textarea({ value: (t && t.detail) || '', rows: 2, id: 'tk-detail' });
  const freq = select(Object.keys(FREQUENCIES).map((k) => ({ value: k, label: FREQUENCIES[k].label })), (t && t.frequency) || 'ANNUAL', { id: 'tk-freq' });
  const anchor = input({ type: 'date', value: (t && t.anchorDate) || '', id: 'tk-anchor' });
  const last = input({ type: 'date', value: (t && t.lastCompleted) || '', id: 'tk-last' });
  const owner = input({ value: (t && t.owner) || '', id: 'tk-owner' });
  drawer(t ? 'Edit task' : 'Add compliance task', h('div', {}, field('Title', title), field('Detail', detail), h('div', { class: 'grid c2' }, field('Frequency', freq), field('Owner', owner), field('Anchor date', anchor, 'The date the cycle starts from, where nothing has been completed yet.'), field('Last completed', last))), [
    t ? h('button', { class: 'btn danger', text: 'Delete', onclick: async () => { await S.store.remove('compliance_tasks', t.id, { projectId: p.id }); closeDrawer(); render(); } }) : null,
    h('button', { class: 'btn', text: 'Cancel', onclick: closeDrawer }),
    h('button', {
      class: 'btn primary',
      text: 'Save',
      onclick: async () => {
        const rec = { projectId: p.id, title: title.value.trim() || 'Untitled task', detail: detail.value.trim(), frequency: freq.value, anchorDate: anchor.value || null, lastCompleted: last.value || null, owner: owner.value.trim() };
        if (t) await S.store.update('compliance_tasks', t.id, rec, { projectId: p.id });
        else await S.store.create('compliance_tasks', rec, { projectId: p.id });
        closeDrawer();
        render();
      },
    }),
  ]);
}

async function markDone(t) {
  const today = new Date().toISOString().slice(0, 10);
  await S.store.update('compliance_tasks', t.id, { lastCompleted: today }, { projectId: t.projectId, field: 'lastCompleted' });
  toast('Marked complete today; the next due date is recomputed.', 'ok');
  render();
}

// ------------------------------------------------------------------- sources

function legalSourcesTab() {
  const wrap = h('div', {});
  wrap.appendChild(h('p', { class: 'card-note', text: 'The instruments the register can draw on, and where their official text lives. Nothing here claims to have read the text: an instrument ships as metadata, and the app tells you to fetch the current version before relying on it.' }));

  wrap.appendChild(sectionRule('Official source roots'));
  wrap.appendChild(h('div', { class: 'grid c3' }, SOURCE_ROOTS.map((s) => h('div', { class: 'card' }, h('h3', { class: 'card-title', text: s.label }), h('p', { class: 'card-note mono small', text: s.rank.replace(/_/g, ' ').toLowerCase() }), h('a', { href: s.url, target: '_blank', rel: 'noopener', class: 'small', text: s.url })))));

  wrap.appendChild(sectionRule('Instruments in the library (' + LEGAL_INSTRUMENTS.length + ')'));
  const rows = LEGAL_INSTRUMENTS.map((i) => {
    const std = standardIsMandatory(i);
    return h(
      'tr',
      {},
      h('td', {}, h('span', { class: 'tag', title: domainLabel(i.domain), text: i.domain })),
      h('td', {}, h('div', { style: { 'font-weight': '500' }, text: i.title }), i.notes ? h('div', { class: 'muted small', text: truncate(i.notes, 140) }) : null),
      h('td', {}, h('span', { class: 'badge ' + (i.isStandard ? 'inferred' : 'confirmed'), text: i.instrumentType.replace(/_/g, ' ') })),
      h('td', { class: 'small', text: i.jurisdictionState ? i.jurisdictionCountry + ' / ' + i.jurisdictionState : i.jurisdictionCountry }),
      h('td', { class: 'small', text: truncate(i.authority, 44) }),
      h('td', { class: 'small', text: (i.amendmentStatus || '').replace(/_/g, ' ').toLowerCase() }),
      h('td', {}, h('span', { class: 'badge missing', text: 'UNVERIFIED' })),
      h('td', { class: 'small' }, i.isStandard ? (std.mandatory ? h('span', { class: 'badge verified', text: 'ADOPTED' }) : h('span', { class: 'badge', title: std.detail, text: 'GUIDANCE ONLY' })) : h('span', { class: 'muted', text: '—' })),
      h('td', { class: 'small' }, i.officialSourceUrl ? h('a', { href: i.officialSourceUrl, target: '_blank', rel: 'noopener', text: 'source' }) : h('span', { class: 'muted', text: '—' })),
      h('td', { class: 'mono small', text: (i.triggers || []).join(', ') })
    );
  });
  wrap.appendChild(tableWrap([{ label: 'Domain', width: '74px' }, { label: 'Instrument', width: '320px' }, { label: 'Type', width: '110px' }, { label: 'Jurisdiction', width: '120px' }, { label: 'Authority', width: '190px' }, { label: 'Amendment status', width: '150px' }, { label: 'Text retrieved', width: '96px' }, { label: 'Standard', width: '100px' }, { label: 'Official source', width: '90px' }, { label: 'Triggers', width: '150px' }], rows, { tableClass: 'wide-register' }));
  return wrap;
}

// ------------------------------------------------------------------- updates

function updatesTab(p) {
  const updates = scoped('legal_updates');
  const wrap = h('div', {});
  wrap.appendChild(h('div', { class: 'note plain', style: { 'margin-bottom': '12px' } }, h('strong', { text: 'A source change creates a review event and nothing else. ' }), 'No project conclusion changes automatically, and a conclusion keeps the legal source version it was made against. Automated crawling stays disabled until the register and the applicability model are in production use.'));
  wrap.appendChild(h('div', { class: 'btn-row', style: { 'margin-bottom': '12px' } }, h('button', { class: 'btn', text: 'Record a source change', onclick: () => updateDialog(p) })));

  if (!updates.length) {
    wrap.appendChild(emptyState('No update events', 'When you notice that an instrument has been amended, record it here. Every project record that cites the old version is flagged for review; none of them changes on its own.', h('button', { class: 'btn primary', text: 'Record a source change', onclick: () => updateDialog(p) })));
    return wrap;
  }

  const rows = updates.map((u) => {
    const inst = LEGAL_INSTRUMENTS.filter((i) => i.id === u.instrumentId)[0];
    return h('tr', {}, h('td', { text: inst ? inst.title : u.instrumentId }), h('td', { class: 'small', text: u.oldVersion || '—' }), h('td', { class: 'small', text: u.newVersion || '—' }), h('td', { class: 'small nowrap', text: u.changeDate ? dateFmt(u.changeDate) : '—' }), h('td', { class: 'small nowrap', text: dtFmt(u.detectedAt || u.createdAt) }), h('td', { class: 'small', text: (u.sectionsToReview || []).join(', ') || '—' }), h('td', {}, h('span', { class: 'badge ' + (u.status === 'REVIEW_REQUIRED' ? 'conflict' : 'verified'), text: (u.status || '').replace(/_/g, ' ') })), h('td', {}, u.status === 'REVIEW_REQUIRED' ? h('button', { class: 'btn sm', text: 'Mark reviewed', onclick: () => markReviewed(u) }) : h('span', { class: 'small muted', text: u.reviewNote || '' })));
  });
  wrap.appendChild(tableWrap([{ label: 'Instrument' }, { label: 'Old version' }, { label: 'New version' }, { label: 'Change date' }, { label: 'Detected' }, { label: 'Sections to review' }, { label: 'Status' }, { label: '' }], rows));
  return wrap;
}

function updateDialog(p) {
  const inst = select(LEGAL_INSTRUMENTS.map((i) => ({ value: i.id, label: truncate(i.title, 70) })), '', { id: 'lu-inst' });
  const oldV = input({ id: 'lu-old', placeholder: 'e.g. as amended to 2019' });
  const newV = input({ id: 'lu-new', placeholder: 'e.g. as amended to 2026' });
  const date = input({ type: 'date', id: 'lu-date' });
  const sections = input({ id: 'lu-sections', placeholder: 'Sections or schedules affected' });
  const note = textarea({ rows: 2, id: 'lu-note' });
  drawer('Record a source change', h('div', {}, field('Instrument', inst), h('div', { class: 'grid c2' }, field('Version cited so far', oldV), field('New version', newV), field('Change date', date), field('Sections to review', sections)), field('Note', note), h('p', { class: 'field-hint', text: 'Recording this does not alter any compliance record. It flags them for review and keeps the version each conclusion was made against.' })), [
    h('button', { class: 'btn', text: 'Cancel', onclick: closeDrawer }),
    h('button', {
      class: 'btn primary',
      text: 'Record',
      onclick: async () => {
        await S.store.create('legal_updates', { projectId: p.id, instrumentId: inst.value, oldVersion: oldV.value.trim(), newVersion: newV.value.trim(), changeDate: date.value || null, detectedAt: nowIso(), detectionMethod: 'MANUAL', sectionsToReview: sections.value.split(',').map((x) => x.trim()).filter(Boolean), status: 'REVIEW_REQUIRED', note: note.value.trim() }, { projectId: p.id });
        closeDrawer();
        toast('Review event recorded', 'ok');
        render();
      },
    }),
  ]);
}

async function markReviewed(u) {
  const note = textarea({ rows: 3, id: 'lr-note', placeholder: 'What did the review conclude? What changed in the project, if anything?' });
  drawer('Mark reviewed', h('div', {}, field('Review note', note)), [
    h('button', { class: 'btn', text: 'Cancel', onclick: closeDrawer }),
    h('button', {
      class: 'btn primary',
      text: 'Mark reviewed',
      onclick: async () => {
        await S.store.update('legal_updates', u.id, { status: 'REVIEWED', reviewedBy: S.actor.id, reviewedAt: nowIso(), reviewNote: note.value.trim() }, { projectId: u.projectId, field: 'status' });
        closeDrawer();
        render();
      },
    }),
  ]);
}
