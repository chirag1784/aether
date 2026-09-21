// app/views/team.js — HAZOP team members, roles and attendance.

import { h, field, input, select, textarea, toast, drawer, closeDrawer, confirmAction, emptyState, sectionRule, tableWrap, tile, dateFmt, statusBadge, nowIso } from '../util.js';
import { S, render, project, scoped } from '../state.js';

export const HAZOP_ROLES = [
  { value: 'chairman', label: 'Chairman' },
  { value: 'facilitator', label: 'Facilitator' },
  { value: 'process engineer', label: 'Process engineer' },
  { value: 'production', label: 'Production / operations' },
  { value: 'maintenance', label: 'Maintenance' },
  { value: 'instrumentation', label: 'Instrumentation' },
  { value: 'electrical', label: 'Electrical' },
  { value: 'ehs', label: 'EHS / process safety' },
  { value: 'quality', label: 'Quality' },
  { value: 'project', label: 'Project' },
  { value: 'r&d', label: 'R&D' },
  { value: 'consultant', label: 'Consultant' },
  { value: 'recorder', label: 'Recorder' },
  { value: 'other', label: 'Other' },
];

export function renderTeam() {
  const p = project();
  if (!p) return h('div', { class: 'page' }, emptyState('No project selected', 'Pick a project first.', null));

  const team = scoped('team_members').slice().sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
  const sessions = scoped('workshop_sessions') || [];
  const page = h('div', { class: 'page wide' });

  page.appendChild(h('div', { class: 'page-head' }, h('div', {}, h('div', { class: 'eyebrow', text: 'A HAZOP is a team process' }), h('h1', { class: 'page-title', text: 'Team members' })), h('div', { class: 'page-actions' }, h('button', { class: 'btn primary', text: 'Add member', onclick: () => memberDialog(p, null) }))));
  page.appendChild(h('p', { class: 'page-sub', text: 'The report records who took part and in what discipline. Automated analysis assists the team; it does not replace the team, and the report says so.' }));

  const hasFacilitator = team.some((m) => m.role === 'facilitator' || m.role === 'chairman');
  const disciplines = new Set(team.map((m) => m.role));

  page.appendChild(h('div', { class: 'grid c4' }, tile('Members', team.length, team.length >= 3 ? 'Multidisciplinary' : 'At least three members are expected', team.length >= 3 ? 'ok' : 'alert'), tile('Disciplines', disciplines.size), tile('Chairman / facilitator', hasFacilitator ? 'Recorded' : 'Missing', hasFacilitator ? '' : 'Blocking on the report', hasFacilitator ? 'ok' : 'crit'), tile('Workshop sessions', sessions.length)));

  if (!team.length) {
    page.appendChild(emptyState('No team members recorded', 'Add the people who took part, with their discipline and role. Extraction from a past HAZOP report also populates this list.', h('button', { class: 'btn primary', text: 'Add member', onclick: () => memberDialog(p, null) })));
    return page;
  }

  const rows = team.map((m, i) =>
    h(
      'tr',
      {},
      h('td', { class: 'num', text: String(m.serialNumber || i + 1) }),
      h('td', { style: { 'font-weight': '500' }, text: m.name }),
      h('td', { text: m.designation || '—' }),
      h('td', { text: m.department || '—' }),
      h('td', { text: m.organization || '—' }),
      h('td', {}, h('span', { class: 'pill', text: (HAZOP_ROLES.filter((r) => r.value === m.role)[0] || {}).label || m.role || '—' })),
      h('td', { text: m.discipline || '—' }),
      h('td', { text: m.experience || '—' }),
      h('td', { class: 'small', text: m.email || '—' }),
      h('td', { class: 'num small', text: (m.attendance || []).length ? (m.attendance || []).length + ' session(s)' : '—' }),
      h('td', {}, m.isReviewer ? h('span', { class: 'badge verified', text: 'REVIEWER' }) : null),
      h('td', { class: 'nowrap' }, h('button', { class: 'btn sm ghost', text: 'Edit', onclick: () => memberDialog(p, m) }))
    )
  );

  page.appendChild(tableWrap([{ label: '#', cls: 'num' }, { label: 'Name' }, { label: 'Designation' }, { label: 'Department' }, { label: 'Organization' }, { label: 'HAZOP role' }, { label: 'Discipline' }, { label: 'Experience' }, { label: 'Email' }, { label: 'Attendance', cls: 'num' }, { label: '' }, { label: '' }], rows));

  page.appendChild(h('p', { class: 'muted small', style: { 'margin-top': '10px' }, text: 'Signature placeholders are printed on the report attendance sheet for physical signing. The app does not capture signatures.' }));

  page.appendChild(sectionRule('Workshop sessions', h('button', { class: 'btn sm', text: 'Add session', onclick: () => sessionDialog(p, null) })));
  if (!sessions.length) {
    page.appendChild(h('p', { class: 'muted small', text: 'No sessions recorded. The report prints the session dates and the attendance record against them.' }));
  } else {
    const srows = sessions.slice().sort((a, b) => String(a.sessionDate).localeCompare(String(b.sessionDate))).map((s) =>
      h('tr', {}, h('td', { class: 'nowrap', text: dateFmt(s.sessionDate) }), h('td', { class: 'small', text: [s.startTime, s.endTime].filter(Boolean).join('–') || '—' }), h('td', { class: 'small', text: (s.nodesCovered || []).join(', ') || '—' }), h('td', { class: 'num', text: team.filter((m) => (m.attendance || []).indexOf(s.id) !== -1).length }), h('td', { class: 'small', text: s.notes || '' }), h('td', {}, h('button', { class: 'btn sm ghost', text: 'Edit', onclick: () => sessionDialog(p, s) })))
    );
    page.appendChild(tableWrap([{ label: 'Date' }, { label: 'Time' }, { label: 'Nodes covered' }, { label: 'Present', cls: 'num' }, { label: 'Notes' }, { label: '' }], srows));
  }

  return page;
}

function memberDialog(p, m) {
  const g = (k) => (m && m[k] !== undefined && m[k] !== null ? m[k] : '');
  const name = input({ value: g('name'), id: 'tm-name' });
  const designation = input({ value: g('designation'), id: 'tm-desig' });
  const department = input({ value: g('department'), id: 'tm-dept' });
  const organization = input({ value: g('organization'), id: 'tm-org' });
  const role = select(HAZOP_ROLES, g('role') || 'process engineer', { id: 'tm-role' });
  const discipline = input({ value: g('discipline'), id: 'tm-disc' });
  const experience = input({ value: g('experience'), id: 'tm-exp', placeholder: 'e.g. 12 years' });
  const email = input({ type: 'email', value: g('email'), id: 'tm-email' });
  const comments = textarea({ value: g('comments'), rows: 2, id: 'tm-comments' });
  const reviewer = h('input', { type: 'checkbox', id: 'tm-reviewer', checked: !!(m && m.isReviewer) });

  const sessions = scoped('workshop_sessions') || [];
  const attendance = new Set((m && m.attendance) || []);
  const attRow = h('div', { class: 'row', style: { gap: '5px' } });
  for (const s of sessions) {
    const b = h('button', { type: 'button', class: 'pill' + (attendance.has(s.id) ? ' on' : ''), text: dateFmt(s.sessionDate), onclick: () => { if (attendance.has(s.id)) attendance.delete(s.id); else attendance.add(s.id); b.className = 'pill' + (attendance.has(s.id) ? ' on' : ''); } });
    attRow.appendChild(b);
  }

  const body = h(
    'div',
    {},
    h('div', { class: 'grid c2' }, field('Name', name), field('Designation', designation), field('Department', department), field('Organization', organization), field('HAZOP role', role), field('Discipline', discipline), field('Experience', experience), field('Email', email)),
    h('label', { class: 'field inline' }, reviewer, h('span', { text: 'Assign the reviewer role (can verify values, confirm applicability and close out actions)' })),
    sessions.length ? h('div', { class: 'field' }, h('span', { text: 'Attendance' }), attRow) : null,
    field('Comments', comments)
  );

  drawer(m ? 'Edit ' + m.name : 'Add team member', body, [
    m ? h('button', { class: 'btn danger', text: 'Remove', onclick: async () => { const ok = await confirmAction('Remove ' + m.name + ' from the team list?'); if (!ok) return; await S.store.remove('team_members', m.id, { projectId: p.id }); closeDrawer(); render(); } }) : null,
    h('button', { class: 'btn', text: 'Cancel', onclick: closeDrawer }),
    h('button', {
      class: 'btn primary',
      text: 'Save',
      onclick: async () => {
        if (!name.value.trim()) {
          toast('A name is required.', 'err');
          return;
        }
        const rec = { projectId: p.id, name: name.value.trim(), designation: designation.value.trim(), department: department.value.trim(), organization: organization.value.trim(), role: role.value, discipline: discipline.value.trim(), experience: experience.value.trim(), email: email.value.trim(), comments: comments.value.trim(), isReviewer: reviewer.checked, attendance: Array.from(attendance) };
        if (m) await S.store.update('team_members', m.id, rec, { projectId: p.id });
        else await S.store.create('team_members', Object.assign(rec, { serialNumber: scoped('team_members').length + 1, sortOrder: scoped('team_members').length, status: 'USER_CONFIRMED' }), { projectId: p.id });
        closeDrawer();
        toast('Team member saved', 'ok');
        render();
      },
    }),
  ]);
}

function sessionDialog(p, s) {
  const date = input({ type: 'date', value: (s && s.sessionDate) || '', id: 'ws-date' });
  const start = input({ type: 'time', value: (s && s.startTime) || '', id: 'ws-start' });
  const end = input({ type: 'time', value: (s && s.endTime) || '', id: 'ws-end' });
  const nodes = input({ value: (s && (s.nodesCovered || []).join(', ')) || '', id: 'ws-nodes', placeholder: 'e.g. 01, 02' });
  const notes = textarea({ value: (s && s.notes) || '', rows: 2, id: 'ws-notes' });
  drawer(s ? 'Edit session' : 'Add workshop session', h('div', {}, h('div', { class: 'grid c3' }, field('Date', date), field('Start', start), field('End', end)), field('Nodes covered', nodes), field('Notes', notes)), [
    s ? h('button', { class: 'btn danger', text: 'Delete', onclick: async () => { await S.store.remove('workshop_sessions', s.id, { projectId: p.id }); closeDrawer(); render(); } }) : null,
    h('button', { class: 'btn', text: 'Cancel', onclick: closeDrawer }),
    h('button', {
      class: 'btn primary',
      text: 'Save',
      onclick: async () => {
        const rec = { projectId: p.id, sessionDate: date.value || null, startTime: start.value || null, endTime: end.value || null, nodesCovered: nodes.value.split(',').map((x) => x.trim()).filter(Boolean), notes: notes.value.trim() };
        if (s) await S.store.update('workshop_sessions', s.id, rec, { projectId: p.id });
        else await S.store.create('workshop_sessions', rec, { projectId: p.id });
        closeDrawer();
        render();
      },
    }),
  ]);
}
