// Where a missing fact is allowed to come from.
//
// This module is a registry, not a search engine. It names the authorities that
// publish each class of fact, ranks them, and builds the queries a human or a
// connector would run. It performs no network I/O and holds no values — the
// same reason `packages/legal/library.js` ships no numeric threshold.

export const RESEARCH_VERSION = 'research-1.0.0';

/**
 * Credibility classes for a retrieved fact, best first. `rank` is used to
 * order candidates; `attest` says whether a value from this class may be
 * recorded as WEB_SOURCED at all, or must stay AI_INFERRED until a human
 * reads the primary document.
 */
export const EVIDENCE_CLASSES = Object.freeze([
  {
    key: 'PRIMARY_REGULATOR',
    rank: 1,
    label: 'Regulator or statutory register',
    attest: 'WEB_SOURCED',
    note: 'A government register, gazette or licensing portal. The authority of record.',
  },
  {
    key: 'SUPPLIER_SDS',
    rank: 2,
    label: "Supplier's own SDS",
    attest: 'WEB_SOURCED',
    note: 'The safety data sheet for the grade actually purchased. Preferred for every property.',
  },
  {
    key: 'MANUFACTURER_SDS',
    rank: 3,
    label: "Manufacturer's SDS for an equivalent grade",
    attest: 'WEB_SOURCED',
    note: 'Correct chemistry, possibly the wrong grade. Note the grade difference on the record.',
  },
  {
    key: 'AUTHORITATIVE_DATABASE',
    rank: 4,
    label: 'Authoritative chemical database',
    attest: 'WEB_SOURCED',
    note: 'PubChem, ECHA, NIST, the NJ or NIOSH hazard sheets. Cite the accession, not the search page.',
  },
  {
    key: 'PEER_REVIEWED',
    rank: 5,
    label: 'Peer-reviewed literature or standard',
    attest: 'WEB_SOURCED',
    note: 'A cited paper or published standard. Record the measurement conditions.',
  },
  {
    key: 'COMMERCIAL_CATALOGUE',
    rank: 6,
    label: 'Commercial catalogue or distributor page',
    attest: 'WEB_SOURCED',
    note: 'Usually correct, rarely complete, almost never states conditions. Confirm before design use.',
  },
  {
    key: 'AGGREGATOR',
    rank: 7,
    label: 'Aggregator or encyclopaedia',
    attest: 'WEB_SOURCED',
    note: 'Useful for orientation and for finding the primary source. Not a design basis.',
  },
  {
    key: 'MODEL_RECALL',
    rank: 9,
    label: 'Model recall, no document retrieved',
    attest: 'AI_INFERRED',
    note: 'The assistant remembered a figure. It cannot be cited and the engines will not use it.',
  },
]);

const CLASS_BY_KEY = new Map(EVIDENCE_CLASSES.map((c) => [c.key, c]));

export function evidenceClass(key) {
  return CLASS_BY_KEY.get(key) || null;
}

export function evidenceRank(key) {
  const c = CLASS_BY_KEY.get(key);
  return c ? c.rank : 99;
}

/** The status a value from this evidence class is allowed to carry. */
export function attestedStatus(key) {
  const c = CLASS_BY_KEY.get(key);
  return c ? c.attest : 'AI_INFERRED';
}

// ---------------------------------------------------------------------------
// Chemical authorities
// ---------------------------------------------------------------------------

/**
 * Chemical-property authorities. `url` is a site root or a query template with
 * `{q}` for the search term; nothing here is fetched by this module.
 */
export const CHEMICAL_AUTHORITIES = Object.freeze([
  {
    key: 'PUBCHEM',
    name: 'PubChem (NIH)',
    evidenceClass: 'AUTHORITATIVE_DATABASE',
    url: 'https://pubchem.ncbi.nlm.nih.gov/#query={q}',
    covers: ['identity', 'physical', 'tox'],
    note: 'Best single starting point. Each value carries its own source citation — record that, not PubChem.',
  },
  {
    key: 'ECHA_CHEM',
    name: 'ECHA registered substances',
    evidenceClass: 'PRIMARY_REGULATOR',
    url: 'https://echa.europa.eu/search-for-chemicals?q={q}',
    covers: ['identity', 'transport', 'tox', 'environment'],
    note: 'REACH registration dossiers. Authoritative for classification and for CLP hazard statements.',
  },
  {
    key: 'NIOSH_WISH',
    name: 'NIOSH Pocket Guide',
    evidenceClass: 'PRIMARY_REGULATOR',
    url: 'https://www.cdc.gov/niosh/npg/search.html?q={q}',
    covers: ['tox', 'fire', 'reactivity'],
    note: 'Occupational exposure limits and IDLH values in one page per substance.',
  },
  {
    key: 'NJ_RTK',
    name: 'New Jersey Right to Know hazard sheets',
    evidenceClass: 'PRIMARY_REGULATOR',
    url: 'https://web.doh.state.nj.us/rtkhsfs/search.aspx?q={q}',
    covers: ['tox', 'reactivity'],
    note: 'Plain-language hazard summary per substance. Good for reactivity and first aid.',
  },
  {
    key: 'CAMEO',
    name: 'CAMEO Chemicals (NOAA)',
    evidenceClass: 'PRIMARY_REGULATOR',
    url: 'https://cameochemicals.noaa.gov/search/simple?query={q}',
    covers: ['reactivity'],
    note: 'The reactivity matrix. Use it for the incompatible-storage question specifically.',
  },
  {
    key: 'NIST_WEBBOOK',
    name: 'NIST Chemistry WebBook',
    evidenceClass: 'AUTHORITATIVE_DATABASE',
    url: 'https://webbook.nist.gov/cgi/cbook.cgi?Name={q}',
    covers: ['physical', 'fire'],
    note: 'Vapour pressure, heat of formation and phase data with the measurement citation.',
  },
  {
    key: 'GESTIS_DUST',
    name: 'GESTIS-DUST-EX database',
    evidenceClass: 'AUTHORITATIVE_DATABASE',
    url: 'https://www.dguv.de/ifa/gestis/gestis-staub-ex/index-2.jsp',
    covers: ['dust'],
    note: 'Kst, Pmax, MIE and minimum ignition temperature for tested powders. The only broad public source for dust constants.',
  },
  {
    key: 'SUPPLIER',
    name: "The supplier's own SDS",
    evidenceClass: 'SUPPLIER_SDS',
    url: null,
    covers: ['identity', 'physical', 'fire', 'dust', 'tox', 'reactivity', 'transport'],
    note: 'Ask the purchasing department. For a grade-dependent property this is the only correct answer.',
  },
]);

/**
 * Which authorities are worth trying for a given property group, in order.
 * A property whose value depends on the grade purchased routes to the supplier
 * first however good the databases are.
 */
// Keyed on the property groups in `packages/chemical/properties.js`. A group
// with no entry falls back to `physical`.
export const PROPERTY_ROUTES = Object.freeze({
  identity: ['PUBCHEM', 'ECHA_CHEM', 'SUPPLIER'],
  physical: ['NIST_WEBBOOK', 'PUBCHEM', 'SUPPLIER'],
  fire: ['NIOSH_WISH', 'PUBCHEM', 'SUPPLIER'],
  dust: ['GESTIS_DUST', 'SUPPLIER', 'PUBCHEM'],
  tox: ['NIOSH_WISH', 'NJ_RTK', 'ECHA_CHEM'],
  reactivity: ['CAMEO', 'NJ_RTK', 'ECHA_CHEM'],
  environment: ['ECHA_CHEM', 'PUBCHEM'],
  transport: ['ECHA_CHEM', 'SUPPLIER', 'PUBCHEM'],
});

/** Properties whose value is a function of the grade, not of the chemistry. */
export const GRADE_DEPENDENT = Object.freeze([
  'particleSize',
  'kst',
  'pmax',
  'mie',
  'mitCloud',
  'mitLayer',
  'combustibleDust',
  'density',
  'meltingPoint',
  'flammabilityClass',
]);

export function isGradeDependent(propertyKey) {
  return GRADE_DEPENDENT.indexOf(propertyKey) >= 0;
}

// ---------------------------------------------------------------------------
// Company authorities
// ---------------------------------------------------------------------------

/**
 * Where a company fact is verified. India-first because the seeded legal
 * library is India-first; each entry says what it proves and what it does not.
 */
export const COMPANY_AUTHORITIES = Object.freeze([
  {
    key: 'MCA_MASTER_DATA',
    name: 'MCA — View Company/LLP Master Data',
    jurisdiction: 'IN',
    evidenceClass: 'PRIMARY_REGULATOR',
    url: 'https://www.mca.gov.in/mca/global/en/mca/master-data/MDS.html',
    proves: ['legalName', 'cin', 'incorporatedOn', 'registeredOffice', 'registrationStatus', 'directors'],
    note: 'The register of record for the legal entity. Needs the CIN or an exact name. Proves the entity, not the site.',
  },
  {
    key: 'GST_SEARCH',
    name: 'GST taxpayer search',
    jurisdiction: 'IN',
    evidenceClass: 'PRIMARY_REGULATOR',
    url: 'https://services.gst.gov.in/services/searchtp',
    proves: ['gstin', 'tradeName', 'principalPlaceOfBusiness', 'registrationStatus'],
    note: 'Confirms the trading name and the registered premises per state. A site address here is the one to trust.',
  },
  {
    key: 'GPCB_CONSENT',
    name: 'Gujarat Pollution Control Board — consents and CC&A',
    jurisdiction: 'IN-GJ',
    evidenceClass: 'PRIMARY_REGULATOR',
    url: 'https://gpcb.gujarat.gov.in/',
    proves: ['consentToOperate', 'consentValidity', 'consentedProducts', 'consentedQuantities', 'effluentLimits', 'category'],
    note: 'The consented product list and quantity is the legally binding production limit. Compare it against the HAZOP inventory.',
  },
  {
    key: 'PESO_LICENCE',
    name: 'PESO licence status',
    jurisdiction: 'IN',
    evidenceClass: 'PRIMARY_REGULATOR',
    url: 'https://peso.gov.in/',
    proves: ['pesoLicence', 'pesoValidity', 'licensedQuantities', 'licensedPremises'],
    note: 'Required for petroleum, compressed gas and explosives storage. The licensed quantity caps the inventory.',
  },
  {
    key: 'FACTORY_LICENCE',
    name: 'State factory licence / labour department register',
    jurisdiction: 'IN',
    evidenceClass: 'PRIMARY_REGULATOR',
    url: 'https://labour.gov.in/',
    proves: ['factoryLicence', 'licensedWorkers', 'occupier', 'manager', 'licenceValidity'],
    note: 'Names the occupier and manager — the people the Factories Act makes personally liable.',
  },
  {
    key: 'PARIVESH',
    name: 'PARIVESH — environmental clearance',
    jurisdiction: 'IN',
    evidenceClass: 'PRIMARY_REGULATOR',
    url: 'https://parivesh.nic.in/',
    proves: ['environmentalClearance', 'ecConditions', 'ecCapacity'],
    note: 'Clearance conditions are enforceable commitments. Each one is a compliance obligation with a due date.',
  },
  {
    key: 'GIDC_ESTATE',
    name: 'GIDC estate records',
    jurisdiction: 'IN-GJ',
    evidenceClass: 'PRIMARY_REGULATOR',
    url: 'https://gidc.gujarat.gov.in/',
    proves: ['plotNumber', 'estate', 'plotArea', 'allottee'],
    note: 'Confirms the plot and the estate. Estate-level infrastructure (CETP, fire water) belongs in the HAZOP context.',
  },
  {
    key: 'COMPANY_WEBSITE',
    name: "The company's own website",
    jurisdiction: null,
    evidenceClass: 'COMMERCIAL_CATALOGUE',
    url: null,
    proves: ['tradeName', 'products', 'capacityClaim', 'certifications', 'contact', 'sites'],
    note: 'Good for the product list and the plant photographs. A stated capacity here is a marketing figure until the consent confirms it.',
  },
]);

/** Company fields the platform tracks, grouped for the UI. */
export const COMPANY_FIELDS = Object.freeze([
  { group: 'Entity', keys: ['legalName', 'tradeName', 'cin', 'gstin', 'incorporatedOn', 'registrationStatus'] },
  { group: 'Site', keys: ['siteAddress', 'estate', 'plotNumber', 'plotArea', 'district', 'state'] },
  { group: 'People named in law', keys: ['occupier', 'factoryManager', 'directors'] },
  { group: 'Permissions', keys: ['factoryLicence', 'consentToOperate', 'consentValidity', 'environmentalClearance', 'pesoLicence'] },
  { group: 'Scale', keys: ['consentedProducts', 'consentedQuantities', 'workerCount', 'shiftPattern', 'installedCapacity'] },
]);

export const COMPANY_FIELD_LABELS = Object.freeze({
  legalName: 'Registered legal name',
  tradeName: 'Trading name',
  cin: 'CIN',
  gstin: 'GSTIN',
  incorporatedOn: 'Incorporated on',
  registrationStatus: 'Registration status',
  siteAddress: 'Site address',
  estate: 'Industrial estate',
  plotNumber: 'Plot number',
  plotArea: 'Plot area',
  district: 'District',
  state: 'State',
  occupier: 'Occupier (Factories Act)',
  factoryManager: 'Factory manager',
  directors: 'Directors',
  factoryLicence: 'Factory licence number',
  consentToOperate: 'Consent to operate / CC&A',
  consentValidity: 'Consent valid until',
  environmentalClearance: 'Environmental clearance',
  pesoLicence: 'PESO licence',
  consentedProducts: 'Consented products',
  consentedQuantities: 'Consented quantities',
  workerCount: 'Workers on site',
  shiftPattern: 'Shift pattern',
  installedCapacity: 'Installed capacity',
});

/**
 * Company facts that gate a legal applicability question. Filling one of these
 * resolves something in the compliance register, so the Research view ranks
 * them above the rest.
 */
export const COMPANY_FIELD_GATES = Object.freeze({
  workerCount: 'Worker-count thresholds in the Factories Act and the OSH Code.',
  consentedQuantities: 'The consented quantity is the legal production ceiling to compare inventory against.',
  occupier: 'The Factories Act places duties on a named occupier.',
  factoryManager: 'The Factories Act places duties on a named manager.',
  state: 'Chooses which state rules apply at all.',
  district: 'Chooses the regional pollution board office and the local emergency plan.',
  consentToOperate: 'Whether the site may legally operate, and on what conditions.',
  installedCapacity: 'Feeds the MAH-site and clearance-category questions.',
});

// ---------------------------------------------------------------------------
// Query construction
// ---------------------------------------------------------------------------

function fill(template, q) {
  if (!template) return null;
  return template.replace('{q}', encodeURIComponent(q));
}

const AUTH_BY_KEY = new Map(
  CHEMICAL_AUTHORITIES.map((a) => [a.key, a]).concat(COMPANY_AUTHORITIES.map((a) => [a.key, a]))
);

export function authority(key) {
  return AUTH_BY_KEY.get(key) || null;
}

/**
 * Build the query plan for one missing chemical property.
 * Returns the search string, the authorities to try in order, and the reason
 * the property is being looked up at all.
 */
export function chemicalQueryPlan(req) {
  const chem = req.chemical || {};
  const prop = req.property || {};
  const group = prop.group || 'physical';
  const ident = chem.cas ? chem.cas : chem.name || '';
  if (!ident) {
    return {
      ok: false,
      reason: 'NO_IDENTIFIER',
      message: 'This chemical has neither a name nor a CAS number. Nothing can be looked up until one is recorded.',
    };
  }
  const label = prop.label || prop.key || 'property';
  const terms = [ident, label];
  if (chem.cas && chem.name) terms.splice(1, 0, chem.name);
  if (isGradeDependent(prop.key) && chem.grade) terms.push(chem.grade);
  const query = terms.join(' ') + ' SDS';
  const routeKeys = PROPERTY_ROUTES[group] || PROPERTY_ROUTES.physical;
  const routes = routeKeys
    .map((k) => AUTH_BY_KEY.get(k))
    .filter(Boolean)
    .map((a) => ({
      key: a.key,
      name: a.name,
      evidenceClass: a.evidenceClass,
      url: fill(a.url, ident),
      note: a.note,
    }));
  return {
    ok: true,
    subject: { kind: 'chemical', id: chem.id || null, name: chem.name || null, cas: chem.cas || null },
    property: prop.key,
    query,
    alternateQueries: [
      ident + ' safety data sheet ' + label,
      (chem.name || ident) + ' ' + label + ' value units',
    ],
    routes,
    gradeDependent: isGradeDependent(prop.key),
    gradeWarning: isGradeDependent(prop.key)
      ? 'This value depends on the grade and the particle size actually purchased. A database figure is indicative; the supplier SDS for the purchased grade is the answer.'
      : null,
  };
}

/** Build the query plan for one missing company field. */
export function companyQueryPlan(req) {
  const co = req.company || {};
  const field = req.field;
  const ident = co.legalName || co.tradeName || '';
  if (!ident) {
    return {
      ok: false,
      reason: 'NO_IDENTIFIER',
      message: 'No company name is recorded on the project. Record the name before researching the profile.',
    };
  }
  const jur = co.state ? 'IN-' + co.state : 'IN';
  const routes = COMPANY_AUTHORITIES.filter((a) => a.proves.indexOf(field) >= 0)
    .filter((a) => !a.jurisdiction || a.jurisdiction === 'IN' || a.jurisdiction === jur)
    .sort((a, b) => evidenceRank(a.evidenceClass) - evidenceRank(b.evidenceClass))
    .map((a) => ({
      key: a.key,
      name: a.name,
      evidenceClass: a.evidenceClass,
      url: fill(a.url, ident),
      note: a.note,
      proves: a.proves,
    }));
  const label = COMPANY_FIELD_LABELS[field] || field;
  const parts = [ident];
  if (co.district) parts.push(co.district);
  if (co.state) parts.push(co.state);
  parts.push(label);
  return {
    ok: true,
    subject: { kind: 'company', name: ident },
    field,
    query: parts.join(' '),
    alternateQueries: [
      ident + ' ' + (co.estate || '') + ' ' + label,
      ident + ' CIN MCA master data',
    ].map((s) => s.replace(/\s+/g, ' ').trim()),
    routes,
    gates: COMPANY_FIELD_GATES[field] || null,
    caution:
      routes.length === 0
        ? 'No registry in the library publishes this field. It has to come from the company itself.'
        : null,
  };
}

/**
 * Rank the gaps worth researching. A gap that gates a legal obligation or a
 * chemical alert outranks one that only fills a report table.
 */
export function rankGaps(gaps) {
  const weight = { BLOCKS_ALERT: 40, GATES_LEGAL: 30, CRITICAL_PROPERTY: 20, REPORT_FIELD: 10, NICE_TO_HAVE: 2 };
  return gaps
    .map((g) => {
      const reasons = g.reasons || [];
      let score = 0;
      for (const r of reasons) score += weight[r] || 0;
      return Object.assign({}, g, { priority: score });
    })
    .sort((a, b) => b.priority - a.priority || String(a.label).localeCompare(String(b.label)));
}
