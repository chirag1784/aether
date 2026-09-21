// app/views/recommendations.js — the final node-wise recommendation register,
// action tracking and close-out.

import { h, field, input, select, textarea, toast, drawer, closeDrawer, confirmAction, emptyState, sectionRule, riskBadge, tile, tableWrap, truncate, dateFmt, nowIso, chips } from '../util.js';
import { S, go, render, project, scoped, recommendationRegister, nodeById, matrix, scenariosWithRisk } from '../state.js';
import { tryRiskFromLS } from '../../packages/calculations/risk.js';
import { canCloseRecommendation, REC_STATUS } from '../../packages/domain/status.js';
import { assessRecommendationQuality, CONTROL_LEVELS } from '../../packages/calculations/dedup.js';
import { EFFORT_FIELDS, doability, DOABILITY_BANDS, rankRecommendations, recRef } from '../../packages/calculations/doability.js';

export function renderRecommendations() {
  const p = project();
  if (!p) return h('div', { class: 'page' }, emptyState('No project selected', 'Pick a project first.', null));

  const reg = recommendationRegister();
  const m = matrix();
  const today = new Date().toISOString().slice(0, 10);
  const page = h('div', { class: 'page wide' });

  page.appendChild(h('div', { class: 'page-head' }, h('div', {}, h('div', { class: 'eyebrow', text: 'Final node-wise register' }), h('h1', { class: 'page-title', text: 'Recommendations' })), h('div', { class: 'page-actions' }, h('button', { class: 'btn', text: 'Renumber', onclick: () => renumber(reg) }))));
  page.appendChild(h('p', { class: 'page-sub', text: 'Grouped by node, deduplicated only on technical equivalence. A merged recommendation appears once and lists every deviation that raised it, so no scenario loses its backlink.' }));

  if (!reg.all.length) {
    page.appendChild(emptyState('No recommendations yet', 'Recommendations are raised from the worksheet against the scenario they address. Open a node worksheet and add one to a row.', h('button', { class: 'btn primary', text: 'Go to the worksheet', onclick: () => go('hazop') })));
    return page;
  }

  const open = reg.kept.filter((r) => ['OPEN', 'IN_PROGRESS', 'AWAITING_EVIDENCE'].indexOf(r.status || 'OPEN') !== -1);
  const overdue = open.filter((r) => r.targetDate && String(r.targetDate) < today);
  const quality = reg.kept.map((r) => ({ r, q: assessRecommendationQuality(r) })).filter((x) => !x.q.ok);

  page.appendChild(h('div', { class: 'grid c4' }, tile('Recommendations', reg.kept.length, reg.merges.length ? reg.merges.length + ' merged as technically equivalent' : 'No duplicates found'), tile('Open', open.length), tile('Overdue', overdue.length, overdue.length ? 'Past target date' : 'None past target', overdue.length ? 'crit' : 'ok'), tile('Closed', reg.kept.filter((r) => r.status === 'CLOSED').length)));

  if (quality.length) {
    page.appendChild(
      h('div', { class: 'note warn', style: { 'margin-top': '12px' } }, h('strong', { text: quality.length + ' recommendation(s) need attention before the report: ' }), h('ul', { class: 'list-compact small', style: { 'margin-top': '5px' } }, quality.slice(0, 6).map((x) => h('li', {}, h('span', { class: 'mono', text: x.r.recId || '—' }), ' ', x.q.issues.map((i) => i.detail).join(' ')))))
    );
  }

  page.appendChild(doabilityStrip(reg, m));

  if (reg.merges.length) {
    page.appendChild(sectionRule('Deduplication'));
    page.appendChild(
      h('div', { class: 'card' }, h('p', { class: 'card-note', text: 'Merged only where the technical measure, the equipment scope and the hierarchy level all match. A high-temperature alarm never merges with a high-temperature trip, however similar the wording.' }), h('ul', { class: 'list-compact small' }, reg.merges.map((mg) => h('li', {}, h('span', { class: 'mono', text: mg.mergedId }), ' merged into ', h('span', { class: 'mono', text: mg.survivorId }), h('span', { class: 'muted', text: ' (similarity ' + Math.round(mg.similarity * 100) + '%)' })))))
    );
  }

  // Node-wise register
  const nodeKeys = Array.from(reg.byNode.keys()).sort();
  for (const key of nodeKeys) {
    const list = reg.byNode.get(key);
    const node = list[0] && list[0].node;
    page.appendChild(sectionRule('NODE ' + key + (node && node.worksheetName ? ' — ' + node.worksheetName : '')));
    const rows = list.map((r) => {
      const sc = r.scenario;
      const initial = sc ? tryRiskFromLS(m, sc.initialLikelihood, sc.initialSeverity) : null;
      const residual = sc ? tryRiskFromLS(m, sc.residualLikelihood, sc.residualSeverity) : null;
      const isOverdue = r.targetDate && String(r.targetDate) < today && ['CLOSED', 'REJECTED'].indexOf(r.status || 'OPEN') === -1;
      return h(
        'tr',
        {},
        h('td', { class: 'mono nowrap', style: { 'font-weight': '600' }, text: r.recId || '—' }),
        h('td', { class: 'small' }, chips(r.equipmentTags || [])),
        h('td', { class: 'small', text: sc ? sc.deviation : '—' }),
        h('td', { class: 'small', text: sc ? truncate((sc.causes || []).map((c) => c.text).join('; '), 64) : '—' }),
        h('td', { class: 'small', text: sc ? truncate((sc.consequences || []).map((c) => c.text).join('; '), 64) : '—' }),
        h('td', {}, initial ? riskBadge(initial) : h('span', { class: 'muted', text: '—' })),
        h('td', {}, h('div', { text: r.text }), r.technicalBasis ? h('div', { class: 'muted small', text: 'Basis: ' + truncate(r.technicalBasis, 90) }) : null, (r.mergedFrom || []).length ? h('div', { class: 'muted small', text: 'Raised from ' + (r.raisedFrom || []).length + ' scenario(s): ' + (r.raisedFrom || []).map((x) => x.recId).filter(Boolean).join(', ') }) : null),
        h('td', { class: 'small' }, r.legalBasis ? h('div', { text: r.legalBasis }) : null, r.standardBasis ? h('div', { class: 'muted', text: r.standardBasis }) : null, !r.legalBasis && !r.standardBasis ? h('span', { class: 'muted', text: '—' }) : null),
        h('td', {}, residual ? riskBadge(residual) : h('span', { class: 'muted', text: '—' })),
        h('td', { class: 'small' }, r.controlLevel ? h('span', { class: 'tag', text: r.controlLevel }) : null, r.priority ? h('div', { class: 'muted', text: r.priority }) : null),
        h('td', { class: 'small', text: [r.responsibleDepartment, r.responsiblePerson].filter(Boolean).join(' / ') || '—' }),
        h('td', { class: 'small nowrap', style: isOverdue ? { color: 'var(--critical)', 'font-weight': '600' } : {}, text: r.targetDate ? dateFmt(r.targetDate) : '—' }),
        h('td', {}, h('span', { class: 'badge ' + statusClass(r.status), text: r.status || 'OPEN' })),
        h('td', { class: 'nowrap' }, h('button', { class: 'btn sm ghost', text: 'Open', onclick: () => recDrawer(r) }))
      );
    });
    page.appendChild(
      tableWrap(
        [{ label: 'Rec ID', width: '74px' }, { label: 'Equipment', width: '110px' }, { label: 'Deviation', width: '170px' }, { label: 'Cause', width: '190px' }, { label: 'Consequence', width: '190px' }, { label: 'Initial', width: '104px' }, { label: 'Recommendation', width: '300px' }, { label: 'Legal / standard basis', width: '150px' }, { label: 'Residual', width: '104px' }, { label: 'Control', width: '110px' }, { label: 'Owner', width: '130px' }, { label: 'Target', width: '94px' }, { label: 'Status', width: '84px' }, { label: '', width: '58px' }],
        rows,
        { tableClass: 'wide-grid' }
      )
    );
  }

  return page;
}

/**
 * How much of this register can actually be sequenced, and what the honest
 * order is. It sits above the table because "which of these first" is the
 * question a plant asks the moment the workshop ends.
 */
function doabilityStrip(reg, m) {
  const ranking = rankRecommendations({ recommendations: reg.kept, matrix: m, scenarios: scoped('scenarios'), partial: true });
  const box = h('div', {});
  box.appendChild(sectionRule('Practicability', h('button', { class: 'btn sm', text: 'See the before-and-after picture', onclick: () => go('risk') })));

  if (ranking.scored.length === 0) {
    box.appendChild(
      h(
        'div',
        { class: 'note warn' },
        h('strong', { text: 'No action has its effort declared, so the register cannot be sequenced. ' }),
        'Open any recommendation and answer the seven effort questions — cost, lead time, outage, engineering, who does the work, external approval, space. The engine will not guess them, because a wrong guess produces a wrong priority order and that is worse than none.'
      )
    );
    return box;
  }

  const counts = ranking.counts;
  box.appendChild(
    h(
      'div',
      { class: 'grid c4' },
      DOABILITY_BANDS.map((b) => {
        const n = ranking.scored.filter((x) => x.doability.band === b.key).length;
        return tile(b.label, String(n), b.note, b.key === 'DO_NOW' ? 'ok' : b.key === 'PROJECT' ? 'alert' : null);
      })
    )
  );
  if (counts.undecidable) {
    box.appendChild(
      h('p', {
        class: 'muted small',
        text:
          counts.undecidable +
          ' action(s) are not in that count because their effort is undeclared. They are left out of the ranking rather than assumed easy.',
      })
    );
  }

  const top = ranking.byValue.slice(0, 5);
  if (top.length) {
    box.appendChild(
      h(
        'div',
        { class: 'card' },
        h('h3', { class: 'card-title', text: 'Most risk removed per unit of effort' }),
        h(
          'ol',
          { class: 'list-compact small', style: { margin: '4px 0 0 18px' } },
          top.map((x) =>
            h(
              'li',
              {},
              h('span', { class: 'mono', text: recRef(x.recommendation) }),
              ' ' + truncate(x.recommendation.text, 110) + ' ',
              h('span', { class: 'muted', text: '(' + x.doability.bandLabel.toLowerCase() + ', ' + (x.benefit.measured ? 'removes ' + x.benefit.riskDelta + ' of risk magnitude' : 'benefit not quantified — no residual rating') + ')' })
            )
          )
        ),
        h('p', {
          class: 'card-note',
          text: 'Risk removed is the drop in the matrix magnitude across the rows this action is raised against, using only residual ratings the team has actually recorded. Where none is recorded the benefit is unquantified, not zero.',
        })
      )
    );
  }
  return box;
}

function statusClass(s) {
  const map = { OPEN: 'missing', IN_PROGRESS: 'extracted', AWAITING_EVIDENCE: 'sourced', CLOSED: 'verified', REJECTED: 'na', DEFERRED: 'inferred' };
  return map[s || 'OPEN'] || 'missing';
}

function recDrawer(r) {
  const status = select(REC_STATUS.map((s) => ({ value: s, label: s.replace(/_/g, ' ').toLowerCase() })), r.status || 'OPEN', { id: 'rr-status' });
  const dept = input({ value: r.responsibleDepartment || '', id: 'rr-dept' });
  const person = input({ value: r.responsiblePerson || '', id: 'rr-person' });
  const date = input({ type: 'date', value: r.targetDate || '', id: 'rr-date' });
  const priority = select([{ value: '', label: '—' }, 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'], r.priority || '', { id: 'rr-prio' });
  const level = select([{ value: '', label: '—' }].concat(CONTROL_LEVELS.map((l) => ({ value: l.key, label: l.rank + '. ' + l.label }))), r.controlLevel || '', { id: 'rr-level' });
  const comments = textarea({ value: r.closureComments || '', rows: 3, id: 'rr-comments' });
  const verifier = input({ value: r.verifier || '', id: 'rr-verifier', placeholder: 'Who verified the close-out' });
  const evidenceList = (r.evidence || []);
  const q = assessRecommendationQuality(r);

  // Effort: what the doability engine needs before this action can be ranked
  // or credited in the before-and-after picture. Blank means undeclared, which
  // keeps the action out of the ranking rather than assuming it is cheap.
  const effortInputs = {};
  const effortGrid = h('div', { class: 'grid c2' });
  for (const f of EFFORT_FIELDS) {
    const sel = select(
      [{ value: '', label: 'not declared' }].concat(f.options.map((o) => ({ value: o.value, label: o.label }))),
      ((r.effort || {})[f.key]) || '',
      { id: 'rr-eff-' + f.key }
    );
    effortInputs[f.key] = sel;
    effortGrid.appendChild(field(f.label, sel, f.question));
  }
  const scored = doability(r, { partial: true });

  const body = h(
    'div',
    { class: 'stack' },
    h('div', { class: 'note plain' }, h('strong', { class: 'mono', text: r.recId || '—' }), ' ', r.text),
    r.technicalBasis ? h('div', {}, h('div', { class: 'tile-label', text: 'Technical basis' }), h('p', { style: { margin: '2px 0' }, text: r.technicalBasis })) : null,
    q.issues.length ? h('div', { class: 'note warn' }, h('strong', { text: 'Quality: ' }), q.issues.map((i) => i.detail).join(' ')) : h('div', { class: 'note', text: 'This recommendation is specific, classified, owned and dated.' }),
    (r.raisedFrom || []).length > 1 ? h('div', {}, h('div', { class: 'tile-label', text: 'Raised from' }), h('ul', { class: 'list-compact small' }, (r.raisedFrom || []).map((x) => { const n = x.nodeId ? nodeById(x.nodeId) : null; return h('li', { text: (n ? 'Node ' + n.nodeNumber : 'Node —') + (x.recId ? ' (' + x.recId + ')' : '') }); }))) : null,
    h('div', { class: 'section-rule' }, h('h2', { text: 'Tracking' })),
    h('div', { class: 'grid c2' }, field('Status', status), field('Priority', priority), field('Hierarchy of control', level), field('Target date', date), field('Responsible department', dept), field('Responsible person', person)),
    h('div', { class: 'section-rule' }, h('h2', { text: 'How practicable is it' })),
    h('p', {
      class: 'card-note',
      text:
        'These seven facts decide where this action sits in the priority order and whether it is credited in the before-and-after risk picture. Leave a field undeclared and it stays undeclared — an uncosted action is not a cheap one, so the engine leaves it out of the ranking rather than guessing.',
    }),
    scored.ok
      ? h(
          'div',
          { class: 'note plain' },
          h('strong', { text: 'Doability ' + scored.score + '/100 — ' + scored.bandLabel + '. ' }),
          scored.bandNote,
          scored.partial
            ? h('div', { class: 'small', text: 'Based on ' + scored.coverage + '% of the effort fields. The score will move as the rest are declared.' })
            : null,
          scored.drivers.filter((d) => d.direction === 'harder').length
            ? h('div', { class: 'small', text: 'What makes it hard: ' + scored.drivers.filter((d) => d.direction === 'harder').map((d) => d.label.toLowerCase() + ' — ' + d.option).join('; ') + '.' })
            : null
        )
      : h('div', { class: 'note warn' }, h('strong', { text: 'Not ranked. ' }), scored.message + ' Declare them and this action joins the priority order.'),
    effortGrid,
    h('div', { class: 'section-rule' }, h('h2', { text: 'Close-out' })),
    h('p', { class: 'card-note', text: 'Closing needs an authorized user, a named verifier and, where the recommendation requires it, evidence. The AI layer has no path to CLOSED at all.' }),
    field('Close-out evidence', h('div', {}, evidenceList.length ? h('ul', { class: 'list-compact small' }, evidenceList.map((e) => h('li', { text: e.title || 'Evidence' }))) : h('p', { class: 'muted small', text: 'No evidence attached.' }), h('button', { class: 'btn sm', text: 'Attach evidence', onclick: () => attachEvidence(r) }))),
    field('Closure comments', comments),
    field('Verifier', verifier)
  );

  drawer((r.recId || 'Recommendation') + ' — tracking', body, [
    h('button', { class: 'btn', text: 'Cancel', onclick: closeDrawer }),
    h('button', {
      class: 'btn primary',
      text: 'Save',
      onclick: async () => {
        const wantsClose = status.value === 'CLOSED';
        if (wantsClose) {
          const check = canCloseRecommendation({ actorKind: 'human', actorRole: S.actor.role, closureEvidenceRequired: r.closureEvidenceRequired !== false, evidence: evidenceList, verifier: verifier.value.trim() });
          if (!check.ok) {
            toast(explainClose(check.reason), 'err');
            return;
          }
        }
        const effort = {};
        for (const f of EFFORT_FIELDS) {
          const v = effortInputs[f.key].value;
          if (v) effort[f.key] = v;
        }
        await S.store.update(
          'recommendations',
          r.id,
          {
            effort,
            status: status.value,
            priority: priority.value || null,
            controlLevel: level.value || null,
            responsibleDepartment: dept.value.trim(),
            responsiblePerson: person.value.trim(),
            targetDate: date.value || null,
            closureComments: comments.value.trim(),
            verifier: verifier.value.trim() || null,
            verificationDate: wantsClose ? nowIso().slice(0, 10) : r.verificationDate || null,
          },
          { projectId: r.projectId, field: 'status' }
        );
        closeDrawer();
        toast('Recommendation updated', 'ok');
        render();
      },
    }),
  ]);
}

function explainClose(reason) {
  const map = {
    AI_CANNOT_CLOSE_RECOMMENDATION: 'The AI layer cannot close a recommendation.',
    ROLE_NOT_AUTHORIZED: 'Closing a recommendation needs the facilitator or reviewer role.',
    CLOSURE_EVIDENCE_REQUIRED: 'This recommendation requires close-out evidence. Attach it first.',
    VERIFIER_REQUIRED: 'Name the person who verified the close-out.',
  };
  return map[reason] || reason;
}

function attachEvidence(r) {
  const docs = scoped('documents');
  const title = input({ id: 're-title', placeholder: 'What the evidence is' });
  const docSel = select([{ value: '', label: '— none —' }].concat(docs.map((d) => ({ value: d.id, label: d.title }))), '', { id: 're-doc' });
  const note = textarea({ rows: 2, id: 're-note' });
  drawer('Attach close-out evidence', h('div', {}, field('Title', title), field('Document', docSel), field('Note', note)), [
    h('button', { class: 'btn', text: 'Cancel', onclick: closeDrawer }),
    h('button', {
      class: 'btn primary',
      text: 'Attach',
      onclick: async () => {
        const doc = docs.filter((d) => d.id === docSel.value)[0];
        const list = (r.evidence || []).concat([{ title: title.value.trim() || (doc ? doc.title : 'Evidence'), documentId: doc ? doc.id : null, note: note.value.trim() || null, status: 'DOCUMENT_EXTRACTED', attachedAt: nowIso(), attachedBy: S.actor.id }]);
        await S.store.update('recommendations', r.id, { evidence: list }, { projectId: r.projectId, field: 'evidence' });
        closeDrawer();
        toast('Evidence attached', 'ok');
        render();
      },
    }),
  ]);
}

async function renumber(reg) {
  const ok = await confirmAction('Renumber every recommendation?', 'IDs are reassigned in node order as R-001, R-002 and so on. Any report already issued will not match the new numbers.');
  if (!ok) return;
  const nodeKeys = Array.from(reg.byNode.keys()).sort();
  let n = 0;
  for (const key of nodeKeys) {
    for (const r of reg.byNode.get(key)) {
      n += 1;
      const id = 'R-' + String(n).padStart(3, '0');
      if (r.recId !== id) await S.store.update('recommendations', r.id, { recId: id }, { projectId: r.projectId, field: 'recId' });
    }
  }
  toast(n + ' recommendation(s) renumbered in node order', 'ok');
  render();
}
