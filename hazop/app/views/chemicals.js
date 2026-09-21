// app/views/chemicals.js — chemical inventory, property store, intelligence.

import { h, field, input, select, textarea, toast, drawer, closeDrawer, confirmAction, emptyState, sectionRule, tableWrap, statusBadge, statusExplain, truncate, tile, chips, nowIso } from '../util.js';
import { S, go, render, project, scoped, chemicalsResolved, propsFor, alerts, nodeById, chemById } from '../state.js';
import { PROPERTY_GROUPS, ALL_PROPERTIES, propertyMeta, CRITICAL_PROPERTIES, CHEM_SOURCE_CLASSES, sdsCompleteness, validateCas } from '../../packages/chemical/properties.js';
import { sourcePrecedence } from '../../packages/domain/status.js';
import { FIELD_STATUS } from '../../packages/domain/status.js';

const STATES = ['', 'Liquid', 'Solid (powder)', 'Solid (flakes)', 'Solid (granules)', 'Gas', 'Slurry', 'Paste', 'Solution'];

export function renderChemicals() {
  const p = project();
  if (!p) return h('div', { class: 'page' }, emptyState('No project selected', 'Pick a project first.', null));

  const chems = chemicalsResolved();
  const props = scoped('chem_properties');
  const page = h('div', { class: 'page wide' });

  page.appendChild(h('div', { class: 'page-head' }, h('div', {}, h('div', { class: 'eyebrow', text: 'Chemical intelligence' }), h('h1', { class: 'page-title', text: 'Chemicals' })), h('div', { class: 'page-actions' }, h('button', { class: 'btn primary', text: 'Add chemical', onclick: () => chemDialog(p, null) }))));
  page.appendChild(h('p', { class: 'page-sub', text: 'One inventory row per material, with every property carrying its own status and source. A chemical can hold a verified flash point and a conflicting autoignition temperature at the same time, and the app shows both.' }));

  const noQty = chems.filter((c) => c.quantity === null || c.quantity === undefined || c.quantity === '');
  const badCas = chems.filter((c) => c.cas && validateCas(c.cas).valid === false);
  const unresolved = chems.filter((c) => c.identityResolution && (c.identityResolution.matchKind === 'UNRESOLVED' || c.identityResolution.matchKind === 'AMBIGUOUS'));
  const conflicts = props.filter((x) => x.status === 'CONFLICT');

  page.appendChild(h('div', { class: 'grid c4' }, tile('Chemicals', chems.length), tile('No quantity', noQty.length, noQty.length ? 'Blocks every threshold conclusion' : 'All quantities recorded', noQty.length ? 'alert' : 'ok'), tile('Invalid CAS', badCas.length, badCas.length ? 'Check digit fails' : 'All CAS numbers valid', badCas.length ? 'crit' : 'ok'), tile('Property conflicts', conflicts.length, conflicts.length ? 'Sources disagree' : 'No conflicts', conflicts.length ? 'crit' : 'ok')));

  if (!chems.length) {
    page.appendChild(emptyState('No chemicals', 'Add the raw materials, intermediates, products and utilities in the study scope with their quantities. Quantity and physical state are what the legal threshold engine needs.', h('button', { class: 'btn primary', text: 'Add chemical', onclick: () => chemDialog(p, null) })));
    return page;
  }

  const rows = chems.map((c) => {
    const sds = sdsCompleteness(c.id, props);
    const casCheck = c.cas ? validateCas(c.cas) : null;
    return h(
      'tr',
      {},
      h('td', {}, h('div', { style: { 'font-weight': '500' }, text: c.canonicalName }), (c.synonyms || []).length ? h('div', { class: 'muted small', text: truncate((c.synonyms || []).join(', '), 40) }) : null),
      h('td', { class: 'mono small' }, c.cas || '—', casCheck && !casCheck.valid ? h('div', {}, h('span', { class: 'badge conflict', text: 'CAS INVALID', title: casCheck.reason === 'CHECK_DIGIT' ? 'Check digit should be ' + casCheck.expected : 'Format is not nnnnnnn-nn-n' })) : null),
      h('td', { class: 'num' }, c.quantity === null || c.quantity === undefined || c.quantity === '' ? h('span', { class: 'badge missing', text: 'MISSING' }) : h('span', {}, String(c.quantity), ' ', h('span', { class: 'muted', text: c.quantityUnit || '' }))),
      h('td', {}, statusBadge(c.quantityStatus || 'MISSING')),
      h('td', { text: c.physicalState || '—' }),
      h('td', { text: c.concentration || '—' }),
      h('td', { text: truncate(c.hazardousClassification || '', 28) || h('span', { class: 'badge missing', text: 'NOT SET' }) }),
      h('td', {}, h('span', { class: 'badge ' + (sds.status === 'COMPLETE' ? 'verified' : sds.status === 'CONFLICT' ? 'conflict' : sds.status === 'NONE' ? 'missing' : 'extracted'), text: sds.status + ' ' + sds.percent + '%', title: sds.missingLabels.length ? 'Missing: ' + sds.missingLabels.join(', ') : 'All critical properties present' })),
      h('td', { class: 'nowrap' }, h('button', { class: 'btn sm ghost', text: 'Properties', onclick: () => propsDrawer(c) }), h('button', { class: 'btn sm ghost', text: 'Edit', onclick: () => chemDialog(p, c) }))
    );
  });

  page.appendChild(tableWrap([{ label: 'Chemical' }, { label: 'CAS' }, { label: 'Quantity', cls: 'num' }, { label: 'Qty status' }, { label: 'State' }, { label: 'Concentration' }, { label: 'Classification' }, { label: 'SDS data' }, { label: '' }], rows));

  if (unresolved.length) {
    page.appendChild(
      h('div', { class: 'note warn', style: { 'margin-top': '12px' } }, h('strong', { text: unresolved.length + ' chemical identity(ies) unresolved. ' }), 'A threshold comparison is blocked until the identity is confirmed, however clear the arithmetic would be. Add a valid CAS number, or confirm the identity manually on the chemical.')
    );
  }

  return page;
}

function chemDialog(p, c) {
  const g = (k, d) => (c && c[k] !== undefined && c[k] !== null ? c[k] : d === undefined ? '' : d);
  const name = input({ value: g('canonicalName'), id: 'ch-name' });
  const cas = input({ value: g('cas'), id: 'ch-cas', placeholder: 'e.g. 1592-23-0' });
  const casNote = h('div', { class: 'field-hint', text: '' });
  cas.addEventListener('input', () => {
    const v = cas.value.trim();
    if (!v) {
      casNote.textContent = '';
      casNote.className = 'field-hint';
      return;
    }
    const r = validateCas(v);
    if (r.valid) {
      casNote.textContent = 'Check digit valid.';
      casNote.className = 'field-hint';
    } else {
      casNote.textContent = r.reason === 'CHECK_DIGIT' ? 'Check digit fails — the final digit should be ' + r.expected + '. Verify against the SDS.' : 'Not in the format nnnnnnn-nn-n.';
      casNote.className = 'field-err';
    }
  });
  const syn = input({ value: (c && (c.synonyms || []).join(', ')) || '', id: 'ch-syn' });
  const qty = input({ type: 'number', step: 'any', value: g('quantity'), id: 'ch-qty' });
  const qtyUnit = select(['kg', 'g', 'MT', 't', 'L', 'kL', 'm3', 'lb'], g('quantityUnit', 'kg'), { id: 'ch-qtyu' });
  const qtyStatus = select(FIELD_STATUS.map((s) => ({ value: s, label: s.replace(/_/g, ' ') })), g('quantityStatus', 'USER_CONFIRMED'), { id: 'ch-qtys' });
  const state = select(STATES, g('physicalState'), { id: 'ch-state' });
  const conc = input({ value: g('concentration'), id: 'ch-conc' });
  const procT = input({ type: 'number', step: 'any', value: g('processTemperature'), id: 'ch-pt' });
  const storeQty = input({ type: 'number', step: 'any', value: g('storageQuantity'), id: 'ch-sq' });
  const storeUnit = select(['kg', 'MT', 'L', 'kL', 'm3'], g('storageQuantityUnit', 'kg'), { id: 'ch-squ' });
  const storeType = input({ value: g('storageType'), id: 'ch-st', placeholder: 'e.g. bags on pallet, MS drum, tank' });
  const charging = input({ value: g('chargingMethod'), id: 'ch-cm', placeholder: 'e.g. manual charging through the top manhole' });
  const classification = input({ value: g('hazardousClassification'), id: 'ch-class', placeholder: 'e.g. Combustible dust, Skin Irrit. 2' });
  const identityStatus = select([{ value: 'DOCUMENT_EXTRACTED', label: 'From a document' }, { value: 'USER_CONFIRMED', label: 'I confirm this identity' }, { value: 'VERIFIED', label: 'Verified against the SDS' }, { value: 'MISSING', label: 'Not established' }], g('identityStatus', 'USER_CONFIRMED'), { id: 'ch-ids' });

  const body = h(
    'div',
    {},
    h('div', { class: 'grid c2' }, field('Chemical name', name), h('label', { class: 'field' }, h('span', { text: 'CAS number' }), cas, casNote)),
    field('Synonyms', syn, 'Comma separated. Used when matching a schedule entry or an SDS.'),
    field('Identity status', identityStatus, 'An unresolved or ambiguous identity blocks every legal threshold conclusion for this material.'),
    h('div', { class: 'section-rule' }, h('h2', { text: 'Inventory' })),
    h('div', { class: 'grid c2' }, field('Quantity', h('div', { class: 'row', style: { gap: '5px' } }, qty, qtyUnit)), field('Quantity status', qtyStatus, 'An inferred quantity cannot support a threshold conclusion.'), field('Storage quantity', h('div', { class: 'row', style: { gap: '5px' } }, storeQty, storeUnit)), field('Storage type', storeType)),
    h('div', { class: 'grid c3' }, field('Physical state', state), field('Concentration', conc), field('Process temperature (°C)', procT)),
    field('Charging method', charging),
    field('Hazardous classification', classification, 'What the SDS or the applicable rules classify it as. Left blank, the legal engine reports the hazardous-chemical question as unresolved rather than assuming either way.')
  );

  drawer(c ? 'Edit ' + c.canonicalName : 'Add chemical', body, [
    c ? h('button', { class: 'btn danger', text: 'Delete', onclick: async () => { const ok = await confirmAction('Delete ' + c.canonicalName + '?', 'Its properties are deleted too.'); if (!ok) return; for (const pr of propsFor(c.id)) await S.store.remove('chem_properties', pr.id, { projectId: p.id }); await S.store.remove('chemicals', c.id, { projectId: p.id }); closeDrawer(); render(); } }) : null,
    h('button', { class: 'btn', text: 'Cancel', onclick: closeDrawer }),
    h('button', {
      class: 'btn primary',
      text: 'Save',
      onclick: async () => {
        if (!name.value.trim()) {
          toast('A chemical name is required.', 'err');
          return;
        }
        const casV = cas.value.trim();
        const check = casV ? validateCas(casV) : null;
        const rec = {
          projectId: p.id,
          canonicalName: name.value.trim(),
          cas: casV || null,
          casValid: check ? check.valid : null,
          synonyms: syn.value.split(',').map((s) => s.trim()).filter(Boolean),
          quantity: qty.value === '' ? null : Number(qty.value),
          quantityUnit: qtyUnit.value,
          quantityStatus: qty.value === '' ? 'MISSING' : qtyStatus.value,
          physicalState: state.value,
          concentration: conc.value.trim(),
          processTemperature: procT.value === '' ? null : Number(procT.value),
          processTemperatureUnit: 'C',
          storageQuantity: storeQty.value === '' ? null : Number(storeQty.value),
          storageQuantityUnit: storeUnit.value,
          storageType: storeType.value.trim(),
          chargingMethod: charging.value.trim(),
          hazardousClassification: classification.value.trim() || null,
          identityStatus: identityStatus.value,
        };
        if (c) await S.store.update('chemicals', c.id, rec, { projectId: p.id });
        else await S.store.create('chemicals', rec, { projectId: p.id });
        closeDrawer();
        toast('Chemical saved', 'ok');
        render();
      },
    }),
  ]);
}

// ------------------------------------------------------------ property store

function propsDrawer(c) {
  const rows = propsFor(c.id);
  const body = h('div', { class: 'stack' });
  const sds = sdsCompleteness(c.id, scoped('chem_properties'));

  body.appendChild(h('div', { class: 'note plain' }, h('strong', { text: 'Critical properties: ' + sds.present + ' of ' + sds.total + '. ' }), sds.missingLabels.length ? 'Missing: ' + sds.missingLabels.join(', ') + '. A missing property blocks the alerts that depend on it; it is never read as "no hazard".' : 'All critical properties recorded.'));

  for (const group of PROPERTY_GROUPS) {
    const groupRows = group.properties.map((meta) => {
      const rec = rows.filter((r) => r.key === meta.key)[0];
      return h(
        'tr',
        {},
        h('td', {}, meta.label, meta.critical ? h('span', { class: 'badge', style: { 'margin-left': '5px' }, text: 'CRITICAL' }) : null),
        h('td', { class: 'mono small', text: rec && rec.value !== null && rec.value !== undefined && rec.value !== '' ? String(rec.value) + (rec.unit || meta.unit ? ' ' + (rec.unit || meta.unit) : '') : '—' }),
        h('td', {}, statusBadge((rec && rec.status) || 'MISSING', { title: statusExplain((rec && rec.status) || 'MISSING') })),
        h('td', { class: 'small muted', text: rec && (rec.sourceRefs || [])[0] ? truncate(sourceLabel(rec.sourceRefs[0]), 42) : '—' }),
        h('td', { class: 'nowrap' }, h('button', { class: 'btn sm ghost', text: rec ? 'Edit' : 'Set', onclick: () => propDialog(c, meta, rec) }), rec && rec.status === 'CONFLICT' ? h('button', { class: 'btn sm ghost', text: 'Resolve', onclick: () => resolveProp(c, meta, rec) }) : null)
      );
    });
    body.appendChild(h('div', { class: 'section-rule' }, h('h2', { text: group.label })));
    body.appendChild(h('div', { class: 'table-wrap', style: { 'max-height': 'none' } }, h('table', {}, h('thead', {}, h('tr', {}, h('th', { text: 'Property' }), h('th', { text: 'Value' }), h('th', { text: 'Status' }), h('th', { text: 'Source' }), h('th', { text: '' }))), h('tbody', {}, groupRows))));
  }

  drawer(c.canonicalName + ' — properties', body, [h('button', { class: 'btn', text: 'Close', onclick: closeDrawer })]);
}

function sourceLabel(ref) {
  if (!ref) return '—';
  return [ref.sourceLabel || ref.sourceType || ref.sourceClass, ref.documentName, ref.page ? 'p.' + ref.page : null, ref.url].filter(Boolean).join(' · ');
}

function propDialog(c, meta, rec) {
  const value = meta.type === 'boolean' ? select([{ value: '', label: '— not set —' }, { value: 'true', label: 'Yes' }, { value: 'false', label: 'No' }], rec ? String(rec.value) : '', { id: 'pr-val' }) : meta.type === 'list' ? textarea({ value: rec ? (Array.isArray(rec.value) ? rec.value.join(', ') : String(rec.value || '')) : '', rows: 2, id: 'pr-val' }) : input({ value: rec ? rec.value : '', id: 'pr-val' });
  const unit = input({ value: (rec && rec.unit) || meta.unit || '', id: 'pr-unit' });
  const atT = input({ type: 'number', step: 'any', value: (rec && rec.atTemperature) || '', id: 'pr-att' });
  const status = select(FIELD_STATUS.map((s) => ({ value: s, label: s.replace(/_/g, ' ') })), (rec && rec.status) || 'DOCUMENT_EXTRACTED', { id: 'pr-status' });
  const sourceClass = select(CHEM_SOURCE_CLASSES.map((s) => ({ value: s.key, label: s.label })), (rec && rec.sourceClass) || 'SUPPLIER_SDS', { id: 'pr-sc' });
  const sourceTitle = input({ value: (rec && (rec.sourceRefs || [])[0] && rec.sourceRefs[0].documentName) || '', id: 'pr-st', placeholder: 'e.g. Supplier SDS, Rev 3, 2024' });
  const sourcePage = input({ value: (rec && (rec.sourceRefs || [])[0] && rec.sourceRefs[0].page) || '', id: 'pr-sp', placeholder: 'Section / page' });
  const sourceUrl = input({ value: (rec && (rec.sourceRefs || [])[0] && rec.sourceRefs[0].url) || '', id: 'pr-su' });

  const body = h(
    'div',
    {},
    field(meta.label, value, meta.authoritativeOnly ? 'Record this only where an authoritative source gives it.' : ''),
    meta.type === 'number' ? h('div', { class: 'grid c2' }, field('Unit', unit), meta.needsTemperature ? field('At temperature (°C)', atT) : null) : null,
    field('Status', status, 'AI_INFERRED values are never used in an alert or a conclusion.'),
    h('div', { class: 'section-rule' }, h('h2', { text: 'Source' })),
    field('Source class', sourceClass, 'Priority order: supplier SDS, regulator database, occupational-health database, scientific database, literature, other.'),
    h('div', { class: 'grid c2' }, field('Source title', sourceTitle), field('Section / page', sourcePage)),
    field('URL', sourceUrl)
  );

  drawer(meta.label, body, [
    rec ? h('button', { class: 'btn danger', text: 'Clear', onclick: async () => { await S.store.remove('chem_properties', rec.id, { projectId: c.projectId }); closeDrawer(); propsDrawer(chemById(c.id) || c); } }) : null,
    h('button', { class: 'btn', text: 'Cancel', onclick: closeDrawer }),
    h('button', {
      class: 'btn primary',
      text: 'Save',
      onclick: async () => {
        let v = value.value;
        if (meta.type === 'boolean') v = v === '' ? null : v === 'true';
        else if (meta.type === 'list') v = String(v).split(',').map((s) => s.trim()).filter(Boolean);
        else if (meta.type === 'number') v = v === '' ? null : Number(v);
        const refs = sourceTitle.value.trim() || sourceUrl.value.trim() ? [{ sourceType: sourceClass.value === 'SUPPLIER_SDS' ? 'SDS' : 'SCIENTIFIC_SOURCE', sourceClass: sourceClass.value, documentName: sourceTitle.value.trim(), page: sourcePage.value.trim() || null, url: sourceUrl.value.trim() || null, retrievedAt: nowIso() }] : [];
        const body2 = {
          projectId: c.projectId,
          chemicalId: c.id,
          group: meta.group,
          key: meta.key,
          value: v,
          unit: unit.value.trim() || meta.unit || null,
          atTemperature: atT.value === '' ? null : Number(atT.value),
          status: status.value,
          sourceClass: sourceClass.value,
          sourceRefs: refs,
        };
        // A second value that disagrees becomes a conflict rather than an overwrite.
        if (rec && rec.status !== 'MISSING' && String(rec.value) !== String(v) && rec.status !== 'AI_INFERRED') {
          const resolution = sourcePrecedence(
            [
              { value: rec.value, normalizedValue: Number(rec.value), normalizedUnit: rec.unit, status: rec.status, sourceClass: rec.sourceClass },
              { value: v, normalizedValue: Number(v), normalizedUnit: body2.unit, status: body2.status, sourceClass: body2.sourceClass },
            ],
            { allowPrecedence: false }
          );
          if (resolution.status === 'CONFLICT') {
            await S.store.update('chem_properties', rec.id, Object.assign({}, body2, { status: 'CONFLICT', conflictCandidates: [{ value: rec.value, unit: rec.unit, status: rec.status, sourceRefs: rec.sourceRefs, sourceClass: rec.sourceClass }, { value: v, unit: body2.unit, status: body2.status, sourceRefs: refs, sourceClass: body2.sourceClass }], value: null }), { projectId: c.projectId, field: meta.key });
            closeDrawer();
            toast('Values disagree — recorded as a conflict, not overwritten.', 'err');
            propsDrawer(chemById(c.id) || c);
            return;
          }
        }
        if (rec) await S.store.update('chem_properties', rec.id, body2, { projectId: c.projectId, field: meta.key });
        else await S.store.create('chem_properties', body2, { projectId: c.projectId });
        closeDrawer();
        toast('Property saved', 'ok');
        propsDrawer(chemById(c.id) || c);
      },
    }),
  ]);
}

function resolveProp(c, meta, rec) {
  const cands = rec.conflictCandidates || [];
  const body = h('div', { class: 'stack' }, h('p', { class: 'card-note', text: 'Two sources disagree on ' + meta.label + '. Choose the value the study will use, or keep the conflict and record an assumption. Whichever you choose, both values stay in the record and are printed in the report.' }));
  for (const cand of cands) {
    body.appendChild(
      h(
        'div',
        { class: 'note plain' },
        h('div', { class: 'between' }, h('strong', { text: String(cand.value) + (cand.unit ? ' ' + cand.unit : '') }), statusBadge(cand.status)),
        h('div', { class: 'muted small', text: sourceLabel((cand.sourceRefs || [])[0]) }),
        h('div', { class: 'btn-row', style: { 'margin-top': '6px' } }, h('button', {
          class: 'btn sm',
          text: 'Use this value',
          onclick: async () => {
            await S.store.update('chem_properties', rec.id, { value: cand.value, unit: cand.unit, status: 'USER_CONFIRMED', sourceRefs: cand.sourceRefs, resolvedFrom: cands, conflictCandidates: cands, resolvedBy: S.actor.id, resolvedAt: nowIso() }, { projectId: c.projectId, field: meta.key });
            closeDrawer();
            toast('Resolved. The other value is retained in the record.', 'ok');
            render();
          },
        }))
      )
    );
  }
  drawer('Resolve ' + meta.label, body, [h('button', { class: 'btn', text: 'Keep the conflict', onclick: closeDrawer })]);
}

// -------------------------------------------------------- intelligence view

export function renderChemicalIntelligence() {
  const p = project();
  if (!p) return h('div', { class: 'page' }, emptyState('No project selected', 'Pick a project first.', null));

  const al = alerts();
  const page = h('div', { class: 'page' });
  page.appendChild(h('div', { class: 'page-head' }, h('div', {}, h('div', { class: 'eyebrow', text: 'Process vs property reasoning' }), h('h1', { class: 'page-title', text: 'Chemical intelligence' }))));
  page.appendChild(h('p', { class: 'page-sub', text: 'Deterministic comparisons between what the chemicals are and how the process runs them. An alert is emitted only when both sides have a usable value; a missing property becomes a data gap, never a finding of no hazard.' }));

  page.appendChild(h('div', { class: 'grid c4' }, tile('Alerts', al.alerts.length, al.alerts.filter((a) => a.severity === 'CRITICAL').length + ' critical · ' + al.alerts.filter((a) => a.severity === 'HIGH').length + ' high', al.alerts.some((a) => a.severity === 'CRITICAL') ? 'crit' : al.alerts.length ? 'alert' : 'ok'), tile('Data gaps blocking alerts', al.gaps.length, al.gaps.length ? 'Properties needed to complete the checks' : 'No gaps', al.gaps.length ? 'alert' : 'ok'), tile('Chemicals assessed', chemicalsResolved().length), tile('Nodes assessed', scoped('nodes').length)));

  if (!al.alerts.length && !al.gaps.length) {
    page.appendChild(emptyState('Nothing to report yet', 'Alerts need a node with a chemical and an operating condition, plus a property with a usable status. Add operating temperatures to nodes and attach SDS values to chemicals, and the checks run on their own.', h('button', { class: 'btn primary', text: 'Go to nodes', onclick: () => go('nodes') })));
    return page;
  }

  if (al.alerts.length) {
    page.appendChild(sectionRule('Alerts'));
    for (const a of al.alerts) page.appendChild(alertCard(a));
  }

  if (al.gaps.length) {
    page.appendChild(sectionRule('Data gaps blocking these checks'));
    const rows = al.gaps.map((g) =>
      h('tr', {}, h('td', { text: g.chemicalName || '—' }), h('td', { text: g.propertyLabel }), h('td', {}, chips(g.blocks || [])), h('td', { class: 'small muted', text: (g.nodeIds || []).map((id) => { const n = nodeById(id); return n ? 'Node ' + n.nodeNumber : id; }).join(', ') }), h('td', { class: 'small', text: g.detail }), h('td', {}, chips(g.resolveWith || [])))
    );
    page.appendChild(tableWrap([{ label: 'Chemical' }, { label: 'Property' }, { label: 'Blocks' }, { label: 'Nodes' }, { label: 'What is needed' }, { label: 'Resolve with' }], rows));
  }

  return page;
}

function alertCard(a) {
  const card = h('div', { class: 'card', style: { display: 'flex', gap: '12px' } });
  card.appendChild(h('div', { class: 'sev-stripe sev-' + a.severity }));
  const main = h('div', { style: { flex: '1', 'min-width': '0' } });
  main.appendChild(h('div', { class: 'row', style: { gap: '7px', 'margin-bottom': '4px' } }, h('span', { class: 'badge', text: a.severity }), h('span', { class: 'tag', text: a.rule }), h('span', { class: 'muted small', text: a.nodeLabel })));
  main.appendChild(h('h3', { class: 'card-title', text: a.title }));
  main.appendChild(
    h(
      'dl',
      { class: 'chain', style: { 'margin-top': '8px' } },
      h('dt', { text: 'Fact' }), h('dd', { text: a.chain.fact }),
      h('dt', { text: 'Source' }), h('dd', { class: 'small muted', text: a.chain.source }),
      h('dt', { text: 'Process context' }), h('dd', { text: a.chain.processContext }),
      a.arithmetic ? h('dt', { text: 'Comparison' }) : null, a.arithmetic ? h('dd', { class: 'mono small', text: a.arithmetic }) : null,
      h('dt', { text: 'Mechanism' }), h('dd', { text: a.chain.mechanism }),
      h('dt', { text: 'Affected node' }), h('dd', { text: a.chain.node }),
      h('dt', { text: 'Review' }), h('dd', { text: a.chain.review })
    )
  );
  if (a.suggestParameters && a.suggestParameters.length && a.nodeId) {
    main.appendChild(
      h(
        'div',
        { class: 'btn-row', style: { 'margin-top': '10px' } },
        h('button', { class: 'btn sm', text: 'Open the node worksheet', onclick: () => go('hazop', { nodeId: a.nodeId }) }),
        h('span', { class: 'muted small', text: 'Suggests: ' + a.suggestParameters.map((s) => s.guideword.replace(/_/g, ' ') + ' ' + s.parameter).join(', ') })
      )
    );
  }
  card.appendChild(main);
  return card;
}
