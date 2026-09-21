// app/research.js — getting a missing value from outside the app.
//
// The deployed page cannot make a web request. The artifact runtime's content
// policy allows a handful of script CDNs and nothing else, so `fetch` to
// pubchem.ncbi.nlm.nih.gov is blocked before it leaves the frame. That is not
// a limitation to work around — it is why this module exists in the shape it
// does. There are four honest routes to an outside fact, and the app offers
// all four, labelled:
//
//   CONNECTOR  A web-search or fetch MCP connector on the viewer's own
//              claude.ai account, called with the viewer's credentials. A
//              value from here is WEB_SOURCED with a real URL.
//   PASTE      The user opens the authority themselves — the app gives them
//              the query and the link — and pastes the passage back. The
//              assistant extracts the figure; the citation is the URL they
//              pasted from. WEB_SOURCED.
//   SERVER     The Docker deployment's own search provider. WEB_SOURCED.
//   RECALL     The assistant states what it remembers, with no document.
//              AI_INFERRED, and the alert and threshold engines will not use
//              it. It is offered because a remembered order of magnitude is
//              still useful for deciding what to go and look up.
//
// What this module never does is let a remembered figure wear a citation.

import { S, render, project, scoped } from './state.js';
import { toast, nowIso, uid, truncate } from './util.js';
import { getAdapter, aiAvailable } from './ai.js';
import {
  chemicalQueryPlan,
  companyQueryPlan,
  rankGaps,
  EVIDENCE_CLASSES,
  evidenceClass,
  attestedStatus,
  COMPANY_FIELDS,
  COMPANY_FIELD_LABELS,
  COMPANY_FIELD_GATES,
  authority,
} from '../packages/research/sources.js';
import {
  assessFinding,
  reconcile,
  toPropertyRecord,
  toCompanyFieldRecord,
  propertyExpectation,
  researchSummary,
  parseFinding,
} from '../packages/research/resolve.js';
import { ALL_PROPERTIES, CRITICAL_PROPERTIES, propertyMeta } from '../packages/chemical/properties.js';

export const RESEARCH_RUNTIME_VERSION = 'research-runtime-1.0.0';

/** The routes, in the order the UI offers them. */
export const ROUTES = Object.freeze([
  {
    key: 'CONNECTOR',
    label: 'Your web connector',
    note: 'Runs a search on your own claude.ai connector, with your credentials. Returns a citable URL.',
  },
  { key: 'PASTE', label: 'Open it and paste it back', note: 'Always available. You read the authority; the app records what you pasted and where from.' },
  { key: 'SERVER', label: 'This deployment\'s search provider', note: 'Available in the server deployment, where a provider is configured.' },
  { key: 'RECALL', label: 'Ask the assistant what it remembers', note: 'No document, so the value is recorded as inferred and the engines will not use it.' },
]);

/**
 * The connectors this page's manifest names, and the tool names it calls on
 * each. `callTool` will not touch a connector that is not in the manifest, and
 * the manifest is fixed when the page is published.
 *
 * It is empty, and that is a statement of fact rather than an oversight: the
 * account this page was published from has no web-search or fetch connector,
 * and a manifest may only name connectors that actually exist on the
 * publishing account — a speculative name is refused at publish time. So the
 * connector route reports itself unavailable and the paste route, which needs
 * no connector, does the work.
 *
 * Adding one is a one-line change: put the connector's display name exactly as
 * claude.ai shows it, with the tool names it exposes, and republish. The
 * research view and Settings pick it up from here with no other edit.
 */
export const DECLARED_SERVERS = Object.freeze([]);

let mcpCap = null;
let mcpServers = [];
let mcpChecked = false;

/** Attach the mcp capability at boot. Absence is normal; the UI says so. */
export function attachMcp(cap) {
  mcpCap = cap || null;
}

/**
 * Which connectors this view can actually reach. Listing never prompts the
 * viewer, so it is safe to call at load.
 */
export async function listConnectors() {
  if (mcpChecked) return mcpServers;
  mcpChecked = true;
  if (!mcpCap || typeof mcpCap.listTools !== 'function') return [];
  try {
    const res = await mcpCap.listTools();
    mcpServers = (res && res.servers ? res.servers : [])
      .filter((sv) => sv.kind !== 'artifact')
      .map((sv) => ({
        server: sv.server,
        authStatus: sv.authStatus,
        tools: (sv.tools || []).map((t) => t.name),
      }));
  } catch (e) {
    mcpServers = [];
  }
  return mcpServers;
}

/**
 * Load the reachable connectors once and re-render, so Settings and the
 * research drawer can offer what is actually there instead of a text box the
 * user has to guess into.
 */
export function loadConnectors(onDone) {
  if (DECLARED_SERVERS.length === 0) {
    S.researchConnectorsSeen = [];
    if (onDone) onDone([]);
    return;
  }
  if (mcpChecked) {
    if (onDone) onDone(mcpServers);
    return;
  }
  listConnectors().then((list) => {
    S.researchConnectorsSeen = list.map((x) => x.server);
    if (!S.researchConnector && list.length === 1) S.researchConnector = list[0].server;
    if (onDone) onDone(list);
    render();
  });
}

/** Route availability, with the reason when a route is not available. */
export function routeAvailability() {
  const connectorName = (S.researchConnector || '').trim();
  const seen = S.researchConnectorsSeen || null;
  return {
    CONNECTOR: DECLARED_SERVERS.length === 0
      ? {
          available: false,
          why:
            'This page names no connector, because the account it was published from has no web-search or fetch connector and a page may only call a connector it names at publish time. Use the paste route, which needs none. Adding a connector is a one-line change to DECLARED_SERVERS in app/research.js.',
        }
      : !mcpCap
        ? { available: false, why: 'This view has no connector bridge at all. Use the paste route.' }
        : seen && seen.length === 0
          ? {
              available: false,
              why:
                'None of the connectors this page names is set up on your account. The page can only call a connector its manifest names: ' +
                DECLARED_SERVERS.map((x) => x.server).join(', ') +
                '. Use the paste route, which needs no connector.',
            }
          : connectorName
            ? { available: true }
            : { available: false, why: 'Choose which of your connectors to search with, in Settings.' },
    PASTE: { available: true },
    SERVER: { available: false, why: 'No search provider is configured. It is available in the server deployment.' },
    RECALL: aiAvailable() ? { available: true } : { available: false, why: 'The assistant is not available in this view.' },
  };
}

/** The error copy for each `mcp` failure code. Each names the fix. */
export function mcpErrorCopy(err) {
  const code = (err && err.code) || 'unavailable';
  const map = {
    server_not_connected:
      'That connector is not set up on your account. Add it at claude.ai, or use the paste route — the query and the link are on this card.',
    needs_reauth: 'Your connector\'s sign-in has lapsed. Reconnect it at claude.ai, then try again.',
    selection_required: 'You have more than one connector with that name. Choose one at claude.ai, then try again.',
    not_in_manifest: 'This page did not declare that connector, so it cannot call it. Use the paste route.',
    blocked_by_policy: 'Your organisation\'s policy blocks that connector here. Use the paste route.',
    approval_required: 'That call needs your approval and none was given.',
    rate_limited: 'The connector is rate-limited. Wait a moment and try again.',
    server_unavailable: 'The connector did not answer. Try again, or use the paste route.',
    upstream_error: 'The connector reported a problem upstream. Try again, or use the paste route.',
    tool_error: 'The connector ran and reported a failure' + (err && err.message ? ': ' + err.message : '') + '.',
    bad_request: 'The search request was malformed — that is a fault in this page, not in your connector.',
    cancelled: 'You cancelled the call.',
  };
  return map[code] || 'The connector could not be reached. Use the paste route; the query and the link are on this card.';
}

// ---------------------------------------------------------------------------
// Finding the gaps worth researching
// ---------------------------------------------------------------------------

/**
 * Every missing fact the app knows it needs, ranked. A gap that blocks a
 * hazard alert or gates a legal obligation outranks one that only fills a
 * table in the report, because that is the order an engineer would work in.
 */
export function openGaps() {
  const p = project();
  if (!p) return [];
  const props = scoped('chem_properties');
  const byChem = new Map();
  for (const row of props) {
    const k = row.chemicalId;
    if (!byChem.has(k)) byChem.set(k, new Map());
    byChem.get(k).set(row.property || row.key, row);
  }

  const gaps = [];
  for (const c of scoped('chemicals')) {
    const have = byChem.get(c.id) || new Map();
    for (const meta of ALL_PROPERTIES) {
      const row = have.get(meta.key);
      const missing = !row || row.value === null || row.value === undefined || row.value === '' || row.status === 'MISSING';
      if (!missing) continue;
      const reasons = [];
      if (CRITICAL_PROPERTIES.indexOf(meta.key) >= 0) reasons.push('CRITICAL_PROPERTY');
      if (BLOCKS_ALERT.indexOf(meta.key) >= 0) reasons.push('BLOCKS_ALERT');
      if (reasons.length === 0) reasons.push('REPORT_FIELD');
      gaps.push({
        kind: 'chemical',
        chemicalId: c.id,
        chemicalName: c.canonicalName,
        cas: c.cas || null,
        target: meta.key,
        label: c.canonicalName + ' — ' + meta.label,
        propertyLabel: meta.label,
        group: propertyGroupOf(meta.key),
        reasons,
        existingRecordId: row ? row.id : null,
      });
    }
  }

  const prof = new Map(scoped('company_profile').map((r) => [r.field, r]));
  for (const group of COMPANY_FIELDS) {
    for (const key of group.keys) {
      const row = prof.get(key);
      if (row && row.value) continue;
      const reasons = [];
      if (COMPANY_FIELD_GATES[key]) reasons.push('GATES_LEGAL');
      else reasons.push('REPORT_FIELD');
      gaps.push({
        kind: 'company',
        target: key,
        label: 'Company profile — ' + (COMPANY_FIELD_LABELS[key] || key),
        group: group.group,
        reasons,
        gates: COMPANY_FIELD_GATES[key] || null,
        existingRecordId: row ? row.id : null,
      });
    }
  }

  return rankGaps(gaps);
}

/** Properties whose absence stops a chemical alert rule from firing. */
const BLOCKS_ALERT = Object.freeze([
  'flashPoint',
  'autoignitionTemperature',
  'boilingPoint',
  'decompositionTemperature',
  'vapourPressure',
  'combustibleDust',
  'kst',
  'mie',
  'mitCloud',
  'incompatibleMaterials',
  'incompatibleMoc',
  'conductivityLow',
  'hazardousReactions',
]);

function propertyGroupOf(key) {
  const meta = propertyMeta(key);
  return meta && meta.group ? meta.group : 'physical';
}


/** The plan for one gap: the query and the authorities, from the registry. */
export function planFor(gap) {
  if (gap.kind === 'company') {
    const p = project();
    const prof = {};
    for (const row of scoped('company_profile')) prof[row.field] = row.value;
    return companyQueryPlan({
      company: {
        legalName: prof.legalName || (p && p.clientName) || '',
        tradeName: prof.tradeName || (p && p.clientName) || '',
        state: prof.state || ((p && p.jurisdiction) || {}).state || null,
        district: prof.district || null,
        estate: prof.estate || null,
      },
      field: gap.target,
    });
  }
  const chem = scoped('chemicals').find((c) => c.id === gap.chemicalId);
  const meta = propertyMeta(gap.target) || { key: gap.target, label: gap.propertyLabel, group: gap.group };
  return chemicalQueryPlan({ chemical: chem || {}, property: meta });
}

// ---------------------------------------------------------------------------
// The connector route
// ---------------------------------------------------------------------------

/**
 * Run one search through the viewer's connector.
 *
 * The tool name is not guessable, so the page asks the connector what it has
 * and picks a search-shaped tool. If nothing fits it says so plainly rather
 * than calling something at random.
 */
export async function searchViaConnector(query, opts) {
  const server = (S.researchConnector || '').trim();
  if (!mcpCap) throw { code: 'unavailable', message: 'No connector bridge in this view.' };
  if (!server) throw { code: 'bad_request', message: 'No connector named in Settings.' };

  const servers = await listConnectors();
  const info = servers.find((sv) => sv.server === server);
  const tools = info ? info.tools : [];
  const pick =
    tools.find((t) => /web_search|search_web|^search$/i.test(t)) ||
    tools.find((t) => /search/i.test(t)) ||
    tools.find((t) => /fetch|read_url|get_page/i.test(t)) ||
    null;
  if (!pick) {
    throw {
      code: 'tool_error',
      message:
        info && info.authStatus === 'unknown'
          ? 'The connector has not been authorised in this view yet. The first call will ask you; try again.'
          : 'Connector "' + server + '" exposes no search tool this page recognises' + (tools.length ? ' (it has: ' + tools.slice(0, 8).join(', ') + ')' : '') + '. Name a different connector in Settings, or use the paste route.',
    };
  }

  const input = /fetch|read_url|get_page/i.test(pick) ? { url: query } : { query };
  const res = await mcpCap.callTool(server, pick, input, { signal: opts && opts.signal });
  return {
    server,
    tool: pick,
    payload: res && res.payload !== undefined ? res.payload : null,
    text: extractText(res),
    cachedAt: res && res.cache ? res.cache.storedAt : null,
  };
}

function extractText(res) {
  if (!res) return '';
  const blocks = (res.content || []).filter((b) => b && b.type === 'text' && typeof b.text === 'string');
  if (blocks.length) return blocks.map((b) => b.text).join('\n\n');
  if (typeof res.payload === 'string') return res.payload;
  if (res.payload) {
    try {
      return JSON.stringify(res.payload);
    } catch (e) {
      return '';
    }
  }
  return '';
}

// ---------------------------------------------------------------------------
// Extraction: text in, candidate findings out
// ---------------------------------------------------------------------------

const EXTRACT_RULES = [
  'You are extracting one fact from a document for a process-safety record.',
  '',
  'Rules:',
  '1. Extract the value EXACTLY as the document writes it, including the unit and any range or qualifier. Do not convert, round or restate it.',
  '2. If the document does not give the value, return found:false and say in "why" what it does say. Do not supply the value from memory. An empty answer is correct and useful.',
  '3. Record the condition the value was measured at when the document states one (temperature, pressure, grade, particle size).',
  '4. Classify the source honestly using the evidence classes given. A distributor page is not a supplier SDS.',
  '5. Quote the sentence the value came from, verbatim, at most 240 characters.',
].join('\n');

/**
 * Ask the assistant to pull one value out of a passage. Returns candidate
 * findings, not values: nothing is written until it passes `assessFinding`.
 */
export async function extractFromText(req) {
  if (!aiAvailable()) throw { code: 'not_granted', message: 'The assistant is not available in this view.' };
  const target = req.target;
  const label = req.targetLabel || target;
  const prompt = [
    EXTRACT_RULES,
    '',
    'WHAT TO FIND: ' + label + (req.subjectLabel ? ' for ' + req.subjectLabel : ''),
    req.expectation && req.expectation.unit ? 'EXPECTED UNIT OF MEASURE: ' + req.expectation.unit + ' (record the document\'s own unit even if it differs)' : '',
    '',
    'EVIDENCE CLASSES: ' + EVIDENCE_CLASSES.filter((c) => c.key !== 'MODEL_RECALL').map((c) => c.key).join(', '),
    '',
    req.url ? 'DOCUMENT URL: ' + req.url : 'DOCUMENT URL: not supplied',
    '',
    'DOCUMENT TEXT:',
    String(req.text || '').slice(0, 24000),
    '',
    'Answer with JSON only: {"result":{"found":true|false,"rawValue":"the value exactly as written, with unit","condition":"the measurement condition or null","evidenceClass":"ONE OF THE CLASSES","quote":"the verbatim sentence","grade":"the grade the document covers or null","why":"when found is false, what the document says instead"}}',
  ]
    .filter(Boolean)
    .join('\n');

  const out = await getAdapter().json(prompt, { modelTier: 'default', signal: req.signal });
  const r = (out && out.result) || out || {};
  if (!r || r.found === false) {
    return { found: false, why: r.why || 'The passage does not give that value.' };
  }
  return {
    found: true,
    rawValue: r.rawValue,
    condition: r.condition || null,
    evidenceClass: r.evidenceClass || 'AGGREGATOR',
    quote: r.quote ? truncate(String(r.quote), 240) : null,
    grade: r.grade || null,
  };
}

/**
 * Ask the assistant what it remembers, with no document. The answer is
 * explicitly labelled as recall and cannot be promoted: `attestedStatus`
 * returns AI_INFERRED for MODEL_RECALL, and the alert and threshold engines
 * refuse inferred values.
 */
export async function recallValue(req) {
  if (!aiAvailable()) throw { code: 'not_granted', message: 'The assistant is not available in this view.' };
  const prompt = [
    'A process-safety engineer needs an order of magnitude for a property while they go and find the primary document.',
    '',
    'Rules:',
    '1. Give the value you are most confident of, with its unit, or say you do not know.',
    '2. Say which kind of source the figure typically comes from, and name the authority they should check.',
    '3. Do not present it as a citation. It will be recorded as inferred and the application will refuse to use it in any hazard or threshold calculation.',
    '4. If the value depends on the grade or particle size, say so — that matters more than the number.',
    '',
    'WHAT: ' + (req.targetLabel || req.target) + (req.subjectLabel ? ' for ' + req.subjectLabel : ''),
    req.identifiers ? 'IDENTIFIERS: ' + req.identifiers : '',
    '',
    'Answer with JSON only: {"result":{"known":true|false,"value":"value with unit or null","typicalRange":"or null","dependsOnGrade":true|false,"checkInstead":"the authority to verify against","caveat":"one sentence"}}',
  ]
    .filter(Boolean)
    .join('\n');
  const out = await getAdapter().json(prompt, { modelTier: 'default', signal: req.signal });
  const r = (out && out.result) || out || {};
  return {
    known: r.known !== false && !!r.value,
    value: r.value || null,
    typicalRange: r.typicalRange || null,
    dependsOnGrade: !!r.dependsOnGrade,
    checkInstead: r.checkInstead || null,
    caveat: r.caveat || null,
  };
}

// ---------------------------------------------------------------------------
// Applying a finding
// ---------------------------------------------------------------------------

/**
 * Assess a candidate finding against the gap it is meant to fill, without
 * writing anything. The Research view shows this before the Apply button so
 * the user sees exactly what would be recorded, with what status and why.
 */
export function preview(req) {
  const gap = req.gap;
  const finding = req.finding;
  if (gap.kind === 'company') {
    return assessFinding({
      finding,
      property: { key: gap.target, label: COMPANY_FIELD_LABELS[gap.target] || gap.target, numeric: gap.target === 'workerCount', dimension: gap.target === 'workerCount' ? 'dimensionless' : null },
    });
  }
  const meta = propertyMeta(gap.target) || { key: gap.target, label: gap.propertyLabel, group: gap.group };
  const chem = scoped('chemicals').find((c) => c.id === gap.chemicalId) || null;
  return assessFinding({ finding, property: propertyExpectation(meta), chemical: chem });
}

/** Write an assessed finding, with its provenance, into the store. */
export async function apply(req) {
  const p = project();
  if (!p) return { ok: false, message: 'No project is open.' };
  const gap = req.gap;
  const assessed = req.assessed;
  if (!assessed || !assessed.ok) return { ok: false, message: (assessed && assessed.message) || 'Nothing to apply.' };

  try {
    if (gap.kind === 'company') {
      const rec = toCompanyFieldRecord({ assessed, projectId: p.id, field: gap.target, authorityKey: req.authorityKey || null });
      if (gap.existingRecordId) {
        await S.store.update('company_profile', gap.existingRecordId, rec, { projectId: p.id, field: gap.target, note: 'Researched: ' + (assessed.citation || 'recall') });
      } else {
        await S.store.create('company_profile', rec, { projectId: p.id, field: gap.target, note: 'Researched: ' + (assessed.citation || 'recall') });
      }
    } else {
      const meta = propertyMeta(gap.target) || { key: gap.target, label: gap.propertyLabel };
      const rec = toPropertyRecord({ assessed, property: meta, projectId: p.id, chemicalId: gap.chemicalId });
      if (gap.existingRecordId) {
        await S.store.update('chem_properties', gap.existingRecordId, rec, { projectId: p.id, field: gap.target, note: 'Researched: ' + (assessed.citation || 'recall') });
      } else {
        await S.store.create('chem_properties', rec, { projectId: p.id, field: gap.target, note: 'Researched: ' + (assessed.citation || 'recall') });
      }
    }

    // Keep the finding itself, so the register shows what was read and where.
    await S.store.create(
      'research_findings',
      {
        projectId: p.id,
        subjectKind: gap.kind,
        subjectId: gap.chemicalId || null,
        subjectLabel: gap.kind === 'company' ? 'Company profile' : gap.chemicalName,
        target: gap.target,
        targetLabel: gap.propertyLabel || COMPANY_FIELD_LABELS[gap.target] || gap.target,
        query: req.query || null,
        route: req.route || null,
        rawValue: assessed.parsed ? assessed.parsed.text : null,
        valueApplied: assessed.kind === 'RANGE' ? assessed.conservative : assessed.value,
        unit: assessed.unit || null,
        evidenceClass: assessed.evidenceClass,
        url: assessed.citation || null,
        quote: req.quote || null,
        retrievedAt: assessed.retrievedAt || nowIso(),
        status: assessed.status,
        warnings: assessed.warnings || [],
        outcome: 'APPLIED',
      },
      { projectId: p.id, note: 'Research finding applied' }
    );

    render();
    return {
      ok: true,
      status: assessed.status,
      message:
        assessed.status === 'WEB_SOURCED'
          ? 'Recorded as web-sourced with its citation. It is not verified — read the document before using it as a design basis.'
          : 'Recorded as inferred. The hazard and threshold engines will not use it; it is there to tell you what to go and look up.',
    };
  } catch (e) {
    return { ok: false, message: (e && e.message) || 'The store rejected the write.' };
  }
}

/** Keep a rejected or conflicting finding, so the next person does not repeat it. */
export async function recordOutcome(req) {
  const p = project();
  if (!p || !S.store) return;
  try {
    await S.store.create(
      'research_findings',
      {
        projectId: p.id,
        subjectKind: req.gap.kind,
        subjectId: req.gap.chemicalId || null,
        subjectLabel: req.gap.kind === 'company' ? 'Company profile' : req.gap.chemicalName,
        target: req.gap.target,
        targetLabel: req.gap.propertyLabel || COMPANY_FIELD_LABELS[req.gap.target] || req.gap.target,
        query: req.query || null,
        route: req.route || null,
        rawValue: req.rawValue || null,
        url: req.url || null,
        outcome: req.outcome,
        note: req.note || null,
        retrievedAt: nowIso(),
      },
      { projectId: p.id, note: 'Research outcome: ' + req.outcome }
    );
  } catch (e) {
    /* the register is a convenience; a failure here must not lose the finding */
  }
}

/** The honest summary of what research has achieved on this project. */
export function summary() {
  const rows = scoped('research_findings');
  return researchSummary(
    rows.map((r) => ({ outcome: r.outcome, status: r.status, evidenceClass: r.evidenceClass }))
  );
}

export { evidenceClass, attestedStatus, parseFinding, reconcile, EVIDENCE_CLASSES, COMPANY_FIELD_LABELS, authority };
