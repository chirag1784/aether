// app/views/dashboard.js
// Transparent counts and status categories. There is deliberately no single
// blended "compliance score" (MASTER_STRUCTURE §3).

import { h, tile, meter, pct, dtFmt, dateFmt, sectionRule, emptyState, riskBadge, applicBadge, expiryBadge, truncate } from '../util.js';
import { S, go, project, scoped, completeness, complianceCounts, alerts, permitStatuses, taskStatuses, recommendationRegister, qualityGate, reportReady, scenariosWithRisk, nodesSorted, applicability, dataGapsAll } from '../state.js';
import { bandsAtOrAbove } from '../../packages/calculations/risk.js';
import { matrix } from '../state.js';

export function renderDashboard() {
  const p = project();
  if (!p) {
    return h('div', { class: 'page' }, emptyState('No project selected', 'Create a project, or pick one from the selector in the top bar, to see its dashboard.', h('button', { class: 'btn primary', text: 'Go to projects', onclick: () => go('projects') })));
  }

  const comp = completeness();
  const cc = complianceCounts();
  const al = alerts();
  const permits = permitStatuses();
  const tasks = taskStatuses();
  const recs = recommendationRegister();
  const gate = qualityGate();
  const ready = reportReady();
  const scen = scenariosWithRisk();
  const nodes = nodesSorted();
  const docs = scoped('documents');
  const chems = scoped('chemicals');
  const gaps = dataGapsAll();
  const run = applicability();

  const m = matrix();
  const highBands = bandsAtOrAbove(m, m.combine === 'lookup' ? 'HIGH' : 'SUBSTANTIAL');
  const highRisk = scen.filter((s) => s.initialRiskResult.ok && highBands.indexOf(s.initialRiskResult.bandKey) !== -1);
  const unrated = scen.filter((s) => !s.noMeaningfulDeviation && !s.initialRiskResult.ok);

  const openRecs = recs.kept.filter((r) => ['OPEN', 'IN_PROGRESS', 'AWAITING_EVIDENCE'].indexOf(r.status || 'OPEN') !== -1);
  const today = new Date().toISOString().slice(0, 10);
  const overdueRecs = openRecs.filter((r) => r.targetDate && String(r.targetDate) < today);

  const expiringPermits = permits.filter((x) => ['EXPIRED', 'RENEWAL_DUE', 'EXPIRING_SOON'].indexOf(x.expiry.status) !== -1);
  const legalUpdates = scoped('legal_updates').filter((u) => u.status === 'REVIEW_REQUIRED');
  const lastAiRun = scoped('ai_runs').slice().sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))[0];
  const lastReport = scoped('report_versions').slice().sort((a, b) => String(b.generatedAt).localeCompare(String(a.generatedAt)))[0];

  const page = h('div', { class: 'page wide' });

  page.appendChild(h('div', { class: 'eyebrow', text: (p.clientName || '—') + ' · ' + (p.siteName || '—') }));
  page.appendChild(
    h(
      'div',
      { class: 'page-head' },
      h('h1', { class: 'page-title', text: p.projectName || 'Untitled project' }),
      h('div', { class: 'row', style: { gap: '6px' } }, h('span', { class: 'badge', text: 'REV ' + (p.revision || 'R0') }), p.processStage ? h('span', { class: 'pill', text: p.processStage }) : null, p.projectType ? h('span', { class: 'pill', text: p.projectType }) : null)
    )
  );
  page.appendChild(h('p', { class: 'page-sub', text: [p.product, p.process, p.department].filter(Boolean).join(' · ') || 'No product or process recorded yet.' }));

  // ---------------------------------------------------------- readiness
  page.appendChild(
    h(
      'div',
      { class: 'card' },
      h(
        'div',
        { class: 'grid c4' },
        meter('Data completeness', comp.data.percent, comp.data.missing.length + ' field(s) outstanding'),
        meter('Critical completeness', comp.critical.percent, comp.critical.missing.length + ' blocking item(s)'),
        meter('Report readiness', ready.percent, ready.pass + ' of ' + ready.total + ' blocking checks pass'),
        h(
          'div',
          { class: 'meter' },
          h('div', { class: 'meter-top' }, h('span', { text: 'Quality gate' }), h('span', { class: 'meter-val', text: gate ? gate.status.replace(/_/g, ' ') : '—' })),
          h('div', { class: 'meter-track' }, h('div', { class: 'meter-fill ' + (gate && gate.status === 'BLOCKED' ? 'low' : gate && gate.status === 'READY' ? '' : 'warn'), style: { width: ready.percent + '%' } })),
          h('div', { class: 'tile-note', text: gate && gate.summary.blockingFailedIds.length ? truncate(gate.summary.blockingFailedIds.join(', '), 46) : 'No blocking checks failing' })
        )
      ),
      h('div', { class: 'row', style: { 'margin-top': '10px' } }, h('button', { class: 'btn sm', text: 'Open the quality gate', onclick: () => go('reports') }), h('button', { class: 'btn sm ghost', text: 'What is still missing?', onclick: () => go('data-review') }))
    )
  );

  // ---------------------------------------------------------- study
  page.appendChild(sectionRule('Study progress'));
  page.appendChild(
    h(
      'div',
      { class: 'grid c4' },
      tile('Documents', docs.length, docs.filter((d) => d.parseStatus === 'FAILED').length + ' failed · ' + docs.filter((d) => d.parseStatus === 'PENDING').length + ' pending'),
      tile('Chemicals', chems.length, chems.filter((c) => c.sdsStatus === 'COMPLETE').length + ' with complete SDS data'),
      tile('Nodes', nodes.length, nodes.filter((n) => n.reviewStatus === 'PROPOSED').length + ' proposed · ' + nodes.filter((n) => n.reviewStatus === 'COMPLETE').length + ' complete'),
      tile('Worksheet rows', scen.length, scen.filter((s) => s.reviewerStatus !== 'DRAFT').length + ' reviewed'),
      tile('High-risk scenarios', highRisk.length, 'Initial rating in the top bands', highRisk.length ? 'alert' : 'ok'),
      tile('Rows not yet rated', unrated.length, unrated.length ? 'Both L and S are required' : 'All rows rated', unrated.length ? 'alert' : 'ok'),
      tile('Open recommendations', openRecs.length, recs.kept.length + ' total after deduplication'),
      tile('Overdue recommendations', overdueRecs.length, overdueRecs.length ? 'Past target date' : 'None past target date', overdueRecs.length ? 'crit' : 'ok')
    )
  );

  // ---------------------------------------------------------- compliance
  page.appendChild(sectionRule('Legal and regulatory', h('button', { class: 'btn sm ghost', text: 'Open register', onclick: () => go('legal') })));
  page.appendChild(
    h(
      'div',
      { class: 'grid c4' },
      tile('Applicable (confirmed)', cc.APPLICABLE_CONFIRMED, 'Confirmed by a reviewer on verified facts'),
      tile('Potentially applicable', cc.POTENTIALLY_APPLICABLE, 'Triggers met; a fact or threshold is unverified', cc.POTENTIALLY_APPLICABLE ? 'accent' : null),
      tile('Not enough data', cc.NOT_ENOUGH_DATA, 'A trigger fact is unresolved', cc.NOT_ENOUGH_DATA ? 'alert' : 'ok'),
      tile('Not applicable (confirmed)', cc.NOT_APPLICABLE_CONFIRMED, 'Excluded on verified facts, with a reason'),
      tile('Evidence gaps', cc.evidenceGaps, 'Applicable or potential with no evidence attached', cc.evidenceGaps ? 'alert' : 'ok'),
      tile('Licences near expiry', expiringPermits.length, permits.length + ' permit(s) tracked', expiringPermits.some((x) => x.expiry.status === 'EXPIRED') ? 'crit' : expiringPermits.length ? 'alert' : 'ok'),
      tile('Compliance tasks due', tasks.filter((t) => ['OVERDUE', 'DUE_SOON'].indexOf(t.due.status) !== -1).length, tasks.length + ' recurring task(s)'),
      tile('Legal updates to review', legalUpdates.length, 'Source changes never alter past conclusions', legalUpdates.length ? 'alert' : 'ok')
    )
  );

  if (run && run.pendingQuestions && run.pendingQuestions.length) {
    const q = run.pendingQuestions.slice(0, 4);
    page.appendChild(
      h(
        'div',
        { class: 'note warn', style: { 'margin-top': '12px' } },
        h('strong', { text: run.pendingQuestions.length === 1 ? 'One unanswered question gates the register. ' : run.pendingQuestions.length + ' unanswered questions gate the register. ' }),
        'Answering them resolves obligations instead of leaving them as "not enough data". Highest impact first: ',
        h('ul', { class: 'list-compact', style: { 'margin-top': '5px' } }, q.map((x) => h('li', {}, x.question, ' ', h('span', { class: 'muted small', text: '(' + x.obligationCount + ' obligation' + (x.obligationCount === 1 ? '' : 's') + ')' })))),
        h('button', { class: 'btn sm', style: { 'margin-top': '6px' }, text: 'Answer on the jurisdiction profile', onclick: () => go('projects') })
      )
    );
  }

  // ---------------------------------------------------------- alerts
  if (al.alerts.length) {
    page.appendChild(sectionRule('Chemical / process hazard alerts', h('button', { class: 'btn sm ghost', text: 'Open chemical intelligence', onclick: () => go('chemical-intelligence') })));
    const list = h('div', { class: 'stack' });
    for (const a of al.alerts.slice(0, 5)) {
      list.appendChild(
        h(
          'div',
          { class: 'card', style: { display: 'flex', gap: '11px' } },
          h('div', { class: 'sev-stripe sev-' + a.severity }),
          h(
            'div',
            { style: { flex: '1', 'min-width': '0' } },
            h('div', { class: 'row', style: { gap: '7px', 'margin-bottom': '3px' } }, h('span', { class: 'badge', text: a.severity }), h('span', { class: 'tag', text: a.rule }), h('span', { class: 'muted small', text: a.nodeLabel })),
            h('div', { style: { 'font-weight': '600', 'font-size': '13px' }, text: a.title }),
            h('div', { class: 'muted small', text: a.chain.mechanism })
          )
        )
      );
    }
    page.appendChild(list);
  }

  if (gaps.length) {
    page.appendChild(sectionRule('Missing data blocking conclusions'));
    const byBlock = gaps.slice(0, 8);
    page.appendChild(
      h(
        'div',
        { class: 'card' },
        h('p', { class: 'card-note', text: gaps.length + ' item(s) in the missing-data register. A missing value is reported as missing; it is never inferred and never read as "no hazard".' }),
        h('ul', { class: 'list-compact' }, byBlock.map((g) => h('li', {}, h('strong', { text: (g.chemicalName ? g.chemicalName + ' — ' : '') + (g.label || g.field) }), g.detail ? h('span', { class: 'muted small', text: ' ' + g.detail }) : null)))
      )
    );
  }

  // ---------------------------------------------------------- footer
  page.appendChild(sectionRule('Activity'));
  page.appendChild(
    h(
      'div',
      { class: 'card' },
      h(
        'dl',
        { class: 'kv' },
        h('dt', { text: 'Last AI run' }),
        h('dd', { text: lastAiRun ? lastAiRun.task + ' — ' + dtFmt(lastAiRun.createdAt) + (lastAiRun.outputValid === false ? ' (output rejected)' : '') : 'No AI run recorded' }),
        h('dt', { text: 'Last report revision' }),
        h('dd', { text: lastReport ? lastReport.revision + ' (' + lastReport.status + ') — ' + dtFmt(lastReport.generatedAt) : 'No report generated' }),
        h('dt', { text: 'Study dates' }),
        h('dd', { text: (p.studyStartDate ? dateFmt(p.studyStartDate) : '—') + ' to ' + (p.studyEndDate ? dateFmt(p.studyEndDate) : '—') }),
        h('dt', { text: 'Risk matrix' }),
        h('dd', { text: (m.name || m.id) + ' v' + m.version }),
        h('dt', { text: 'Project store' }),
        h('dd', { text: S.storeKind === 'db' ? 'Shared store — changes are saved and visible to everyone with access.' : 'This browser tab only — nothing is saved.' })
      )
    )
  );

  return page;
}
