// packages/legal/library.js
// Seed legal library — METADATA ONLY.
//
// Every entry records what an instrument IS, who administers it, where its
// official text lives and where the obligation sits. No entry asserts a numeric
// statutory threshold, a licence condition or an applicability conclusion.
// Threshold figures ship as `value: null` with status REQUIRES_VERIFICATION and
// must be entered by a user from the official schedule, with a citation, before
// the threshold engine will compute a crossing.
//
// `triggers` are the project facts that make an instrument a CANDIDATE. Nothing
// here is applicable by default.

export const LEGAL_LIBRARY_VERSION = 'legal-library-1.0.0';
export const LEGAL_LIBRARY_SEEDED_AT = '2026-09-21';

export const INSTRUMENT_TYPES = Object.freeze([
  'law', 'rule', 'notification', 'licence_condition', 'consent_condition',
  'ec_condition', 'standard', 'guideline', 'company_requirement',
]);

export const LEGAL_DOMAINS = Object.freeze([
  { key: 'OSH', label: 'Occupational safety / factory' },
  { key: 'CHEM', label: 'Hazardous chemicals / MAH' },
  { key: 'ENV', label: 'Environment / pollution / waste' },
  { key: 'LIAB', label: 'Public liability' },
  { key: 'PESO', label: 'PESO / flammables / pressure vessels / explosives' },
  { key: 'FIRE', label: 'Fire / building / local authority' },
  { key: 'ELEC', label: 'Electrical safety' },
  { key: 'BOILER', label: 'Boiler / pressure equipment' },
  { key: 'OTHER', label: 'Other conditional domains' },
]);

export const SOURCE_ROOTS = Object.freeze([
  { key: 'INDIA_CODE', label: 'India Code', url: 'https://www.indiacode.nic.in/', rank: 'INDIA_CODE' },
  { key: 'MOLE', label: 'Ministry of Labour & Employment', url: 'https://labour.gov.in/', rank: 'MINISTRY_OR_REGULATOR' },
  { key: 'MOEFCC', label: 'MoEF&CC — Rules & Regulations', url: 'https://moef.gov.in/', rank: 'MINISTRY_OR_REGULATOR' },
  { key: 'PARIVESH', label: 'PARIVESH', url: 'https://parivesh.nic.in/', rank: 'MINISTRY_OR_REGULATOR' },
  { key: 'CPCB', label: 'Central Pollution Control Board', url: 'https://cpcb.nic.in/', rank: 'MINISTRY_OR_REGULATOR' },
  { key: 'PESO', label: 'Petroleum and Explosives Safety Organisation', url: 'https://peso.gov.in/', rank: 'MINISTRY_OR_REGULATOR' },
  { key: 'SHRAMSETU', label: 'Gujarat ShramSetu', url: 'https://shramsetu.gujarat.gov.in/', rank: 'STATE_OFFICIAL' },
  { key: 'GPCB', label: 'Gujarat Pollution Control Board', url: 'https://gpcb.gujarat.gov.in/', rank: 'STATE_OFFICIAL' },
  { key: 'GIDC', label: 'Gujarat Industrial Development Corporation', url: 'https://gidc.gujarat.gov.in/', rank: 'STATE_OFFICIAL' },
  { key: 'BIS', label: 'Bureau of Indian Standards', url: 'https://www.bis.gov.in/', rank: 'STANDARDS_BODY' },
]);

export function sourceRoot(key) {
  return SOURCE_ROOTS.filter((s) => s.key === key)[0] || null;
}

const SEEDED = 'METADATA_SEEDED_UNVERIFIED';

/**
 * Legal instruments. Fields follow the LegalInstrument schema in
 * MASTER_STRUCTURE §17.5.
 */
export const LEGAL_INSTRUMENTS = Object.freeze([
  // --- A. Occupational safety / factory / hazardous process -----------------
  {
    id: 'IN-OSHWC-CODE-2020',
    title: 'Occupational Safety, Health and Working Conditions Code, 2020',
    instrumentType: 'law',
    domain: 'OSH',
    jurisdictionCountry: 'India',
    jurisdictionState: null,
    authority: 'Ministry of Labour & Employment; appropriate government as determined under the Code',
    sourceRootKey: 'INDIA_CODE',
    officialSourceUrl: 'https://www.indiacode.nic.in/',
    amendmentStatus: 'IN_FORCE_SUBJECT_TO_VERIFICATION',
    sourceStatus: SEEDED,
    lastVerifiedAt: null,
    notes:
      'The four Labour Codes, including this Code, were brought into force from 21-Nov-2025. Whether Central or State rules and which authority apply must be resolved for the particular establishment — the system does not assume either.',
    triggers: ['isEstablishment'],
  },
  {
    id: 'IN-OSHWC-RULES-CENTRAL',
    title: 'Occupational Safety, Health and Working Conditions (Central) Rules',
    instrumentType: 'rule',
    domain: 'OSH',
    parentInstrumentId: 'IN-OSHWC-CODE-2020',
    jurisdictionCountry: 'India',
    jurisdictionState: null,
    authority: 'Central Government',
    sourceRootKey: 'MOLE',
    officialSourceUrl: 'https://labour.gov.in/',
    amendmentStatus: 'VERSION_MUST_BE_CONFIRMED',
    sourceStatus: SEEDED,
    lastVerifiedAt: null,
    notes:
      'Applies where the appropriate government for the establishment is the Central Government. Confirm the current published version before relying on any rule.',
    triggers: ['appropriateGovernmentCentral'],
  },
  {
    id: 'GJ-OSHWC-RULES-STATE',
    title: 'State rules under the OSHWC Code — Gujarat',
    instrumentType: 'rule',
    domain: 'OSH',
    parentInstrumentId: 'IN-OSHWC-CODE-2020',
    jurisdictionCountry: 'India',
    jurisdictionState: 'Gujarat',
    authority: 'Labour, Skill Development and Employment Department, Government of Gujarat; Directorate of Industrial Safety and Health',
    sourceRootKey: 'SHRAMSETU',
    officialSourceUrl: 'https://shramsetu.gujarat.gov.in/',
    amendmentStatus: 'VERSION_MUST_BE_CONFIRMED',
    sourceStatus: SEEDED,
    lastVerifiedAt: null,
    notes:
      'Gujarat ShramSetu provides registration and licensing workflows under the OSH&WC Code. Confirm which registrations and returns the establishment falls under.',
    triggers: ['stateGujarat', 'appropriateGovernmentState'],
  },

  // --- B. Hazardous chemicals / MAH ----------------------------------------
  {
    id: 'IN-EPA-1986',
    title: 'Environment (Protection) Act, 1986',
    instrumentType: 'law',
    domain: 'CHEM',
    jurisdictionCountry: 'India',
    authority: 'Ministry of Environment, Forest and Climate Change',
    sourceRootKey: 'INDIA_CODE',
    officialSourceUrl: 'https://www.indiacode.nic.in/',
    amendmentStatus: 'IN_FORCE',
    sourceStatus: SEEDED,
    lastVerifiedAt: null,
    notes: 'The parent enactment for the rules and notifications below.',
    triggers: ['always'],
  },
  {
    id: 'IN-MSIHC-1989',
    title: 'Manufacture, Storage and Import of Hazardous Chemicals Rules, 1989 (as amended)',
    instrumentType: 'rule',
    domain: 'CHEM',
    parentInstrumentId: 'IN-EPA-1986',
    jurisdictionCountry: 'India',
    authority: 'MoEF&CC; concerned authorities notified under the Rules',
    sourceRootKey: 'MOEFCC',
    officialSourceUrl: 'https://moef.gov.in/',
    amendmentStatus: 'AS_AMENDED_VERSION_MUST_BE_CONFIRMED',
    sourceStatus: SEEDED,
    lastVerifiedAt: null,
    notes:
      'Carries the hazardous-chemical definitions and the schedules of threshold quantities that decide isolated-storage and industrial-activity duties, including major-accident-hazard classification. The threshold figures are in the Rules\' schedules and must be read from the official text.',
    triggers: ['hazardousChemicalsPresent'],
  },
  {
    id: 'IN-CAEPPR-1996',
    title: 'Chemical Accidents (Emergency Planning, Preparedness and Response) Rules, 1996',
    instrumentType: 'rule',
    domain: 'CHEM',
    parentInstrumentId: 'IN-EPA-1986',
    jurisdictionCountry: 'India',
    authority: 'MoEF&CC; Central, State, District and Local Crisis Groups',
    sourceRootKey: 'MOEFCC',
    officialSourceUrl: 'https://moef.gov.in/',
    amendmentStatus: 'IN_FORCE',
    sourceStatus: SEEDED,
    lastVerifiedAt: null,
    notes: 'Crisis-group structure and emergency planning interfaces for sites handling hazardous chemicals.',
    triggers: ['hazardousChemicalsPresent'],
  },

  // --- C. Environment / waste ----------------------------------------------
  {
    id: 'IN-WATER-1974',
    title: 'Water (Prevention and Control of Pollution) Act, 1974',
    instrumentType: 'law',
    domain: 'ENV',
    jurisdictionCountry: 'India',
    authority: 'CPCB; State Pollution Control Board / Pollution Control Committee',
    sourceRootKey: 'INDIA_CODE',
    officialSourceUrl: 'https://www.indiacode.nic.in/',
    amendmentStatus: 'IN_FORCE',
    sourceStatus: SEEDED,
    lastVerifiedAt: null,
    triggers: ['dischargesToWaterOrLand'],
  },
  {
    id: 'IN-AIR-1981',
    title: 'Air (Prevention and Control of Pollution) Act, 1981',
    instrumentType: 'law',
    domain: 'ENV',
    jurisdictionCountry: 'India',
    authority: 'CPCB; State Pollution Control Board / Pollution Control Committee',
    sourceRootKey: 'INDIA_CODE',
    officialSourceUrl: 'https://www.indiacode.nic.in/',
    amendmentStatus: 'IN_FORCE',
    sourceStatus: SEEDED,
    lastVerifiedAt: null,
    triggers: ['emitsToAir'],
  },
  {
    id: 'IN-HOWM-2016',
    title: 'Hazardous and Other Wastes (Management and Transboundary Movement) Rules, 2016 (as amended)',
    instrumentType: 'rule',
    domain: 'ENV',
    parentInstrumentId: 'IN-EPA-1986',
    jurisdictionCountry: 'India',
    authority: 'MoEF&CC; CPCB; State Pollution Control Board',
    sourceRootKey: 'MOEFCC',
    officialSourceUrl: 'https://moef.gov.in/',
    amendmentStatus: 'AS_AMENDED_VERSION_MUST_BE_CONFIRMED',
    sourceStatus: SEEDED,
    lastVerifiedAt: null,
    notes: 'Authorization, storage, manifest, record and disposal duties for hazardous waste streams. Confirm the current amendment.',
    triggers: ['hazardousWasteGenerated'],
  },
  {
    id: 'IN-EIA-2006',
    title: 'EIA Notification, 2006 (as amended)',
    instrumentType: 'notification',
    domain: 'ENV',
    parentInstrumentId: 'IN-EPA-1986',
    jurisdictionCountry: 'India',
    authority: 'MoEF&CC; SEIAA / SEAC as applicable',
    sourceRootKey: 'PARIVESH',
    officialSourceUrl: 'https://parivesh.nic.in/',
    amendmentStatus: 'AS_AMENDED_VERSION_MUST_BE_CONFIRMED',
    sourceStatus: SEEDED,
    lastVerifiedAt: null,
    notes:
      'Applies only where the project or activity, and its capacity, fall within the Notification\'s schedule. Whether the activity is scheduled, and its category, must be established from the official text — not assumed from the fact that the site is a chemical plant.',
    triggers: ['scheduledActivityQuestion'],
  },
  {
    id: 'GJ-GPCB-CONSENTS',
    title: 'GPCB consents and authorizations (CTE / CTO / CCA, hazardous-waste authorization)',
    instrumentType: 'consent_condition',
    domain: 'ENV',
    jurisdictionCountry: 'India',
    jurisdictionState: 'Gujarat',
    authority: 'Gujarat Pollution Control Board',
    sourceRootKey: 'GPCB',
    officialSourceUrl: 'https://gpcb.gujarat.gov.in/',
    amendmentStatus: 'PROJECT_SPECIFIC',
    sourceStatus: SEEDED,
    lastVerifiedAt: null,
    notes:
      'The controlling text for a specific site is the consent document issued to that site. Upload it so its conditions can be extracted verbatim; nothing here substitutes for it.',
    triggers: ['stateGujarat'],
  },

  // --- D. Public liability --------------------------------------------------
  {
    id: 'IN-PLIA-1991',
    title: 'Public Liability Insurance Act, 1991 (and rules / notifications made under it)',
    instrumentType: 'law',
    domain: 'LIAB',
    jurisdictionCountry: 'India',
    authority: 'MoEF&CC',
    sourceRootKey: 'INDIA_CODE',
    officialSourceUrl: 'https://www.indiacode.nic.in/',
    amendmentStatus: 'IN_FORCE',
    sourceStatus: SEEDED,
    lastVerifiedAt: null,
    notes:
      'Insurance duty attaches to the handling of hazardous substances above the quantities notified under the Act. The notified quantities must be read from the official text.',
    triggers: ['hazardousChemicalsPresent'],
  },

  // --- E. PESO / flammables / gas / pressure vessels / explosives -----------
  {
    id: 'IN-PETROLEUM-RULES-2002',
    title: 'Petroleum Act and Petroleum Rules, 2002 (as amended)',
    instrumentType: 'rule',
    domain: 'PESO',
    jurisdictionCountry: 'India',
    authority: 'Petroleum and Explosives Safety Organisation (PESO)',
    sourceRootKey: 'PESO',
    officialSourceUrl: 'https://peso.gov.in/',
    amendmentStatus: 'AS_AMENDED_VERSION_MUST_BE_CONFIRMED',
    sourceStatus: SEEDED,
    lastVerifiedAt: null,
    notes:
      'Relevant where petroleum as defined by the Act is stored or handled. The petroleum class of each material, and the quantity limits that trigger a licence, come from the official text and the approved drawings.',
    triggers: ['petroleumClassPresent'],
  },
  {
    id: 'IN-GAS-CYLINDERS-2016',
    title: 'Gas Cylinders Rules, 2016 (as amended)',
    instrumentType: 'rule',
    domain: 'PESO',
    jurisdictionCountry: 'India',
    authority: 'PESO',
    sourceRootKey: 'PESO',
    officialSourceUrl: 'https://peso.gov.in/',
    amendmentStatus: 'AS_AMENDED_VERSION_MUST_BE_CONFIRMED',
    sourceStatus: SEEDED,
    lastVerifiedAt: null,
    triggers: ['compressedGasCylindersPresent'],
  },
  {
    id: 'IN-SMPV-2016',
    title: 'Static and Mobile Pressure Vessels (Unfired) Rules, 2016 (as amended)',
    instrumentType: 'rule',
    domain: 'PESO',
    jurisdictionCountry: 'India',
    authority: 'PESO',
    sourceRootKey: 'PESO',
    officialSourceUrl: 'https://peso.gov.in/',
    amendmentStatus: 'AS_AMENDED_VERSION_MUST_BE_CONFIRMED',
    sourceStatus: SEEDED,
    lastVerifiedAt: null,
    notes: 'Relevant where an unfired pressure vessel storing a compressed gas falls within the Rules\' scope.',
    triggers: ['pressureVesselCompressedGas'],
  },
  {
    id: 'IN-EXPLOSIVES-RULES-2008',
    title: 'Explosives Act and Explosives Rules, 2008',
    instrumentType: 'rule',
    domain: 'PESO',
    jurisdictionCountry: 'India',
    authority: 'PESO',
    sourceRootKey: 'PESO',
    officialSourceUrl: 'https://peso.gov.in/',
    amendmentStatus: 'VERSION_MUST_BE_CONFIRMED',
    sourceStatus: SEEDED,
    lastVerifiedAt: null,
    triggers: ['explosivesRelevant'],
  },
  {
    id: 'IN-AMMONIUM-NITRATE-2012',
    title: 'Ammonium Nitrate Rules, 2012',
    instrumentType: 'rule',
    domain: 'PESO',
    jurisdictionCountry: 'India',
    authority: 'PESO',
    sourceRootKey: 'PESO',
    officialSourceUrl: 'https://peso.gov.in/',
    amendmentStatus: 'VERSION_MUST_BE_CONFIRMED',
    sourceStatus: SEEDED,
    lastVerifiedAt: null,
    triggers: ['ammoniumNitrateRelevant'],
  },
  {
    id: 'IN-CALCIUM-CARBIDE-RULES',
    title: 'Calcium Carbide Rules',
    instrumentType: 'rule',
    domain: 'PESO',
    jurisdictionCountry: 'India',
    authority: 'PESO',
    sourceRootKey: 'PESO',
    officialSourceUrl: 'https://peso.gov.in/',
    amendmentStatus: 'VERSION_MUST_BE_CONFIRMED',
    sourceStatus: SEEDED,
    lastVerifiedAt: null,
    triggers: ['calciumCarbideRelevant'],
  },

  // --- F. Fire / building / local authority ---------------------------------
  {
    id: 'GJ-FIRE-SAFETY',
    title: 'State fire-safety legislation and rules — Gujarat, and local fire NOC conditions',
    instrumentType: 'rule',
    domain: 'FIRE',
    jurisdictionCountry: 'India',
    jurisdictionState: 'Gujarat',
    authority: 'State / municipal fire authority having jurisdiction',
    sourceRootKey: null,
    officialSourceUrl: null,
    amendmentStatus: 'VERSION_MUST_BE_CONFIRMED',
    sourceStatus: SEEDED,
    lastVerifiedAt: null,
    notes:
      'The controlling text is the state legislation together with the NOC or approval issued to the site. Upload the NOC so its conditions can be extracted.',
    triggers: ['stateGujarat'],
  },
  {
    id: 'IN-NBC',
    title: 'National Building Code of India — fire and life-safety provisions',
    instrumentType: 'standard',
    domain: 'FIRE',
    jurisdictionCountry: 'India',
    authority: 'Bureau of Indian Standards',
    sourceRootKey: 'BIS',
    officialSourceUrl: 'https://www.bis.gov.in/',
    amendmentStatus: 'STANDARD',
    sourceStatus: SEEDED,
    lastVerifiedAt: null,
    isStandard: true,
    mandatoryVia: [],
    notes:
      'A standard, not a law. It becomes mandatory only where adopted by legislation, a licence or consent condition, a contract or a company standard. Record that route in mandatoryVia before treating it as an obligation.',
    triggers: ['always'],
  },
  {
    id: 'GJ-GIDC-ESTATE',
    title: 'GIDC / notified industrial-estate requirements',
    instrumentType: 'licence_condition',
    domain: 'FIRE',
    jurisdictionCountry: 'India',
    jurisdictionState: 'Gujarat',
    authority: 'Gujarat Industrial Development Corporation / estate authority',
    sourceRootKey: 'GIDC',
    officialSourceUrl: 'https://gidc.gujarat.gov.in/',
    amendmentStatus: 'PROJECT_SPECIFIC',
    sourceStatus: SEEDED,
    lastVerifiedAt: null,
    triggers: ['inIndustrialEstate'],
  },

  // --- G. Electrical --------------------------------------------------------
  {
    id: 'IN-CEA-SAFETY',
    title: 'Electricity Act and Central Electricity Authority safety regulations',
    instrumentType: 'rule',
    domain: 'ELEC',
    jurisdictionCountry: 'India',
    authority: 'Central Electricity Authority; State Electrical Inspectorate',
    sourceRootKey: 'INDIA_CODE',
    officialSourceUrl: 'https://www.indiacode.nic.in/',
    amendmentStatus: 'VERSION_MUST_BE_CONFIRMED',
    sourceStatus: SEEDED,
    lastVerifiedAt: null,
    notes: 'Includes hazardous-area electrical requirements and electrical inspector approvals where applicable.',
    triggers: ['always'],
  },

  // --- H. Boiler ------------------------------------------------------------
  {
    id: 'IN-BOILER',
    title: 'Boiler legislation and rules / IBR requirements',
    instrumentType: 'rule',
    domain: 'BOILER',
    jurisdictionCountry: 'India',
    authority: 'Chief Inspector of Boilers of the State',
    sourceRootKey: 'INDIA_CODE',
    officialSourceUrl: 'https://www.indiacode.nic.in/',
    amendmentStatus: 'VERSION_MUST_BE_CONFIRMED',
    sourceStatus: SEEDED,
    lastVerifiedAt: null,
    notes: 'Applies where the equipment falls within the definition of a boiler or an IBR-scope component.',
    triggers: ['boilerInScope'],
  },

  // --- I. Other conditional -------------------------------------------------
  {
    id: 'IN-DG-TRANSPORT',
    title: 'Transport of dangerous goods — carriage rules and manifest requirements',
    instrumentType: 'rule',
    domain: 'OTHER',
    jurisdictionCountry: 'India',
    authority: 'Ministry of Road Transport and Highways; PESO where applicable',
    sourceRootKey: 'INDIA_CODE',
    officialSourceUrl: 'https://www.indiacode.nic.in/',
    amendmentStatus: 'VERSION_MUST_BE_CONFIRMED',
    sourceStatus: SEEDED,
    lastVerifiedAt: null,
    triggers: ['dispatchesHazardousGoods'],
  },
  {
    id: 'IN-GROUNDWATER',
    title: 'Groundwater abstraction permission',
    instrumentType: 'rule',
    domain: 'OTHER',
    jurisdictionCountry: 'India',
    authority: 'Central Ground Water Authority / State authority as applicable',
    sourceRootKey: null,
    officialSourceUrl: null,
    amendmentStatus: 'VERSION_MUST_BE_CONFIRMED',
    sourceStatus: SEEDED,
    lastVerifiedAt: null,
    triggers: ['groundwaterAbstraction'],
  },
  {
    id: 'IEC-61882-HAZOP',
    title: 'IS 16957:2018 / IEC 61882:2016 — Hazard and operability studies (HAZOP studies) — Application guide',
    instrumentType: 'standard',
    domain: 'OTHER',
    jurisdictionCountry: 'International / India',
    authority: 'IEC / Bureau of Indian Standards',
    sourceRootKey: 'BIS',
    officialSourceUrl: 'https://www.bis.gov.in/',
    amendmentStatus: 'STANDARD',
    sourceStatus: SEEDED,
    lastVerifiedAt: null,
    isStandard: true,
    mandatoryVia: [],
    notes: 'The methodology standard for the study itself. A standard, not a law.',
    triggers: ['always'],
  },
]);

/**
 * Obligations. `applicabilityLogic` is a declarative predicate the engine
 * evaluates; `summary` describes the SUBJECT of the duty, not an invented
 * numeric requirement. `legalReviewRequired: true` means the engine will never
 * go past POTENTIALLY_APPLICABLE without a human.
 */
export const LEGAL_OBLIGATIONS = Object.freeze([
  {
    id: 'OB-OSH-REGISTRATION',
    instrumentId: 'IN-OSHWC-CODE-2020',
    sectionRuleSchedule: 'Registration / licensing provisions of the Code and the applicable rules',
    topic: 'Registration or licence of the establishment',
    summary: 'The establishment must hold the registration or licence required under the Code and the applicable Central or State rules.',
    applicabilityLogic: { all: [{ fact: 'isEstablishment', eq: true }] },
    frequency: 'ON_EVENT',
    responsibleAuthority: 'Appropriate government / registering officer',
    evidenceExpected: ['Registration or licence certificate', 'Current amendment reflecting installed capacity and worker count'],
    affectedProcessTypes: ['*'],
    legalReviewRequired: true,
    sourceQuoteLocator: 'Read from the official text of the Code and the rules that apply to this establishment.',
  },
  {
    id: 'OB-OSH-HAZARDOUS-PROCESS',
    instrumentId: 'IN-OSHWC-CODE-2020',
    sectionRuleSchedule: 'Provisions relating to hazardous processes',
    topic: 'Duties attaching to a hazardous process',
    summary:
      'Where the establishment carries on a hazardous process, additional duties attach — among them site appraisal, a safety policy, disclosure of hazard information to workers and the authority, and emergency planning. The precise duty set is in the official text.',
    applicabilityLogic: { all: [{ fact: 'hazardousProcess', eq: true }] },
    frequency: 'ON_EVENT',
    responsibleAuthority: 'Appropriate government / inspector-cum-facilitator',
    evidenceExpected: ['Safety policy', 'Hazard information disclosed to workers', 'On-site emergency plan', 'Site appraisal report where required'],
    affectedProcessTypes: ['chemical', 'pharmaceutical', 'petrochemical'],
    legalReviewRequired: true,
    sourceQuoteLocator: 'Hazardous-process provisions of the Code and the schedule that lists hazardous processes.',
  },
  {
    id: 'OB-OSH-SAFETY-COMMITTEE',
    instrumentId: 'IN-OSHWC-CODE-2020',
    sectionRuleSchedule: 'Safety committee and safety officer provisions',
    topic: 'Safety committee and safety officer',
    summary:
      'A safety committee and the appointment of safety officers are required where the worker-count and hazardous-process thresholds in the Code and the applicable rules are met. Those figures are in the official text and are not reproduced here.',
    applicabilityLogic: { all: [{ fact: 'isEstablishment', eq: true }] },
    unresolvedQuestions: ['Worker count at the establishment', 'The worker-count threshold stated in the applicable rules'],
    frequency: 'ON_EVENT',
    responsibleAuthority: 'Appropriate government',
    evidenceExpected: ['Safety committee constitution and minutes', 'Safety officer appointment letter and qualifications'],
    affectedProcessTypes: ['*'],
    legalReviewRequired: true,
    sourceQuoteLocator: 'Worker-count and hazardous-process thresholds in the Code and applicable rules.',
  },
  {
    id: 'OB-MSIHC-CLASSIFY',
    instrumentId: 'IN-MSIHC-1989',
    sectionRuleSchedule: 'Hazardous-chemical definitions and the schedules of threshold quantities',
    topic: 'Hazardous-chemical classification and threshold comparison',
    summary:
      'Each chemical handled must be checked against the hazardous-chemical criteria and the scheduled threshold quantities, because the duty set that follows depends on which thresholds the site crosses.',
    applicabilityLogic: { all: [{ fact: 'hazardousChemicalsPresent', eq: true }] },
    thresholdRef: 'MSIHC-SCHEDULE-THRESHOLDS',
    frequency: 'ON_EVENT',
    responsibleAuthority: 'Concerned authority notified under the Rules',
    evidenceExpected: ['Chemical inventory with quantities and storage form', 'Classification record against the Rules\' criteria', 'Threshold comparison with the schedule entry cited'],
    affectedChemicalClasses: ['*'],
    legalReviewRequired: true,
    sourceQuoteLocator: 'Schedules of the Rules that list hazardous chemicals and their threshold quantities.',
  },
  {
    id: 'OB-MSIHC-NOTIFY',
    instrumentId: 'IN-MSIHC-1989',
    sectionRuleSchedule: 'Notification of industrial activity and of a major accident',
    topic: 'Notification duties',
    summary:
      'Where the site\'s activity falls within the Rules, notification of the industrial activity to the concerned authority, and notification of a major accident when one occurs, are required.',
    applicabilityLogic: { all: [{ fact: 'hazardousChemicalsPresent', eq: true }], requiresThreshold: 'MSIHC-SCHEDULE-THRESHOLDS' },
    frequency: 'ON_EVENT',
    responsibleAuthority: 'Concerned authority notified under the Rules',
    evidenceExpected: ['Notification of industrial activity with acknowledgement', 'Major-accident notification procedure'],
    legalReviewRequired: true,
    sourceQuoteLocator: 'Notification provisions of the Rules.',
  },
  {
    id: 'OB-MSIHC-SAFETY-REPORT',
    instrumentId: 'IN-MSIHC-1989',
    sectionRuleSchedule: 'Safety report, safety audit and on-site emergency plan provisions',
    topic: 'Safety report / safety audit / on-site emergency plan',
    summary:
      'Sites whose quantities bring them within the relevant schedule must prepare a safety report, have safety audits carried out, and maintain an on-site emergency plan, at the intervals the Rules state.',
    applicabilityLogic: { all: [{ fact: 'hazardousChemicalsPresent', eq: true }], requiresThreshold: 'MSIHC-SCHEDULE-THRESHOLDS' },
    frequency: 'ANNUAL',
    responsibleAuthority: 'Concerned authority notified under the Rules',
    evidenceExpected: ['Safety report', 'Latest safety audit report and compliance status', 'On-site emergency plan and last rehearsal record'],
    legalReviewRequired: true,
    sourceQuoteLocator: 'Safety report / audit / emergency plan provisions and the schedule that sets the trigger.',
    linksToHazop: true,
  },
  {
    id: 'OB-EPPR-CRISIS-GROUP',
    instrumentId: 'IN-CAEPPR-1996',
    sectionRuleSchedule: 'Crisis-group and off-site plan interfaces',
    topic: 'Emergency planning interfaces',
    summary: 'Sites handling hazardous chemicals interface with the district and local crisis groups and with the off-site emergency plan.',
    applicabilityLogic: { all: [{ fact: 'hazardousChemicalsPresent', eq: true }] },
    frequency: 'ANNUAL',
    responsibleAuthority: 'District / Local Crisis Group',
    evidenceExpected: ['Participation record with the local crisis group', 'Information furnished for the off-site plan'],
    legalReviewRequired: true,
    sourceQuoteLocator: 'Crisis-group provisions of the Rules.',
  },
  {
    id: 'OB-WATER-CONSENT',
    instrumentId: 'IN-WATER-1974',
    sectionRuleSchedule: 'Consent provisions',
    topic: 'Consent to establish / operate — water',
    summary: 'Consent of the State Board is required for an outlet or discharge within the Act\'s scope, and its conditions bind the site.',
    applicabilityLogic: { all: [{ fact: 'dischargesToWaterOrLand', eq: true }] },
    frequency: 'ON_EVENT',
    responsibleAuthority: 'State Pollution Control Board / Pollution Control Committee',
    evidenceExpected: ['Current consent document', 'Monitoring results against the consent conditions', 'Returns filed'],
    legalReviewRequired: true,
    sourceQuoteLocator: 'Consent provisions of the Act and the conditions of the consent issued to the site.',
  },
  {
    id: 'OB-AIR-CONSENT',
    instrumentId: 'IN-AIR-1981',
    sectionRuleSchedule: 'Consent provisions',
    topic: 'Consent to establish / operate — air',
    summary: 'Consent of the State Board is required to establish or operate an industrial plant in an air-pollution control area, and its conditions bind the site.',
    applicabilityLogic: { all: [{ fact: 'emitsToAir', eq: true }] },
    frequency: 'ON_EVENT',
    responsibleAuthority: 'State Pollution Control Board / Pollution Control Committee',
    evidenceExpected: ['Current consent document', 'Stack and ambient monitoring results', 'Returns filed'],
    legalReviewRequired: true,
    sourceQuoteLocator: 'Consent provisions of the Act and the conditions of the consent issued to the site.',
  },
  {
    id: 'OB-HOWM-AUTHORIZATION',
    instrumentId: 'IN-HOWM-2016',
    sectionRuleSchedule: 'Authorization, storage, manifest and record provisions',
    topic: 'Hazardous-waste authorization and handling',
    summary:
      'An occupier generating hazardous waste requires authorization and must meet the storage, packaging, labelling, manifest, record and disposal requirements of the Rules.',
    applicabilityLogic: { all: [{ fact: 'hazardousWasteGenerated', eq: true }] },
    frequency: 'ANNUAL',
    responsibleAuthority: 'State Pollution Control Board',
    evidenceExpected: ['Authorization', 'Waste inventory and manifests', 'Annual return', 'Disposal receipts from an authorized facility'],
    legalReviewRequired: true,
    sourceQuoteLocator: 'Authorization and handling provisions of the Rules, and the schedules identifying waste categories.',
  },
  {
    id: 'OB-EIA-CLEARANCE',
    instrumentId: 'IN-EIA-2006',
    sectionRuleSchedule: 'Schedule of projects and activities',
    topic: 'Environmental Clearance',
    summary:
      'Prior environmental clearance is required where the project or activity and its capacity appear in the Notification\'s schedule. Whether this project is scheduled, and its category, must be established from the official text.',
    applicabilityLogic: { all: [{ fact: 'scheduledActivityQuestion', eq: true }] },
    frequency: 'ON_EVENT',
    responsibleAuthority: 'MoEF&CC / SEIAA as applicable',
    evidenceExpected: ['Environmental Clearance letter', 'Compliance reports against EC conditions'],
    legalReviewRequired: true,
    sourceQuoteLocator: 'Schedule to the Notification and the applicable amendments.',
  },
  {
    id: 'OB-PLIA-INSURANCE',
    instrumentId: 'IN-PLIA-1991',
    sectionRuleSchedule: 'Insurance duty and the notified quantities',
    topic: 'Public liability insurance',
    summary:
      'An owner handling a hazardous substance in a quantity above the notified quantity must take out an insurance policy of the kind the Act requires and contribute to the Environment Relief Fund.',
    applicabilityLogic: { all: [{ fact: 'hazardousChemicalsPresent', eq: true }], requiresThreshold: 'PLIA-NOTIFIED-QUANTITIES' },
    thresholdRef: 'PLIA-NOTIFIED-QUANTITIES',
    frequency: 'ANNUAL',
    responsibleAuthority: 'MoEF&CC',
    evidenceExpected: ['Current public liability insurance policy', 'Environment Relief Fund contribution receipt'],
    legalReviewRequired: true,
    sourceQuoteLocator: 'Insurance provisions of the Act and the notified quantities of hazardous substances.',
  },
  {
    id: 'OB-PETROLEUM-LICENCE',
    instrumentId: 'IN-PETROLEUM-RULES-2002',
    sectionRuleSchedule: 'Licensing, storage and approved-drawing provisions',
    topic: 'Petroleum storage licence',
    summary:
      'Storage of petroleum above the exempt quantity requires a licence, in premises built to the approved drawing, with the licence conditions observed.',
    applicabilityLogic: { all: [{ fact: 'petroleumClassPresent', eq: true }], requiresThreshold: 'PETROLEUM-EXEMPT-QUANTITIES' },
    thresholdRef: 'PETROLEUM-EXEMPT-QUANTITIES',
    frequency: 'ON_EVENT',
    responsibleAuthority: 'PESO',
    evidenceExpected: ['Petroleum licence', 'Approved drawing', 'Latest inspection / renewal record'],
    affectedEquipmentTypes: ['storage tank', 'drum store', 'tank farm'],
    legalReviewRequired: true,
    sourceQuoteLocator: 'Licensing and exempt-quantity provisions of the Rules.',
  },
  {
    id: 'OB-SMPV-APPROVAL',
    instrumentId: 'IN-SMPV-2016',
    sectionRuleSchedule: 'Approval, testing and licensing provisions',
    topic: 'Unfired pressure vessel approval',
    summary: 'A static or mobile unfired pressure vessel within the Rules\' scope requires approval, periodic testing and a licence where applicable.',
    applicabilityLogic: { all: [{ fact: 'pressureVesselCompressedGas', eq: true }] },
    frequency: 'FIVE_YEARLY',
    responsibleAuthority: 'PESO',
    evidenceExpected: ['Approval / licence', 'Design and fabrication certificate', 'Latest hydrostatic / periodic test certificate'],
    affectedEquipmentTypes: ['pressure vessel', 'storage vessel'],
    legalReviewRequired: true,
    sourceQuoteLocator: 'Scope, approval and testing provisions of the Rules.',
  },
  {
    id: 'OB-GAS-CYLINDERS',
    instrumentId: 'IN-GAS-CYLINDERS-2016',
    sectionRuleSchedule: 'Filling, storage and possession provisions',
    topic: 'Gas cylinder storage and possession',
    summary: 'Possession, storage and use of compressed-gas cylinders must meet the Rules\' requirements, including any licence where the quantity requires one.',
    applicabilityLogic: { all: [{ fact: 'compressedGasCylindersPresent', eq: true }] },
    frequency: 'ON_EVENT',
    responsibleAuthority: 'PESO',
    evidenceExpected: ['Cylinder storage licence where required', 'Cylinder test dates record', 'Storage area compliance record'],
    affectedEquipmentTypes: ['cylinder store'],
    legalReviewRequired: true,
    sourceQuoteLocator: 'Storage and possession provisions of the Rules.',
  },
  {
    id: 'OB-FIRE-NOC',
    instrumentId: 'GJ-FIRE-SAFETY',
    sectionRuleSchedule: 'State fire legislation and the NOC issued to the premises',
    topic: 'Fire NOC and fire-safety provisions',
    summary: 'The premises must hold the fire approval required by the authority having jurisdiction and comply with its conditions.',
    applicabilityLogic: { all: [{ fact: 'stateGujarat', eq: true }] },
    frequency: 'ANNUAL',
    responsibleAuthority: 'Fire authority having jurisdiction',
    evidenceExpected: ['Fire NOC', 'Fire-system test and maintenance records', 'Fire drill records'],
    legalReviewRequired: true,
    sourceQuoteLocator: 'State fire legislation and the conditions of the NOC issued to this site.',
  },
  {
    id: 'OB-ELEC-APPROVAL',
    instrumentId: 'IN-CEA-SAFETY',
    sectionRuleSchedule: 'Electrical installation approval and hazardous-area provisions',
    topic: 'Electrical installation approval and hazardous-area classification',
    summary:
      'The electrical installation requires the inspectorate approval that applies to it, and equipment in a classified hazardous area must be suitable for that area.',
    applicabilityLogic: { all: [] },
    frequency: 'BIENNIAL',
    responsibleAuthority: 'State Electrical Inspectorate',
    evidenceExpected: ['Electrical inspector approval', 'Hazardous-area classification drawing', 'Flameproof equipment certificates'],
    legalReviewRequired: true,
    sourceQuoteLocator: 'Applicable electrical safety regulations and the approval issued to the site.',
    linksToHazop: true,
  },
  {
    id: 'OB-BOILER-CERT',
    instrumentId: 'IN-BOILER',
    sectionRuleSchedule: 'Registration, certification and inspection provisions',
    topic: 'Boiler certificate',
    summary: 'A boiler within scope must be registered and hold a current certificate, with inspections at the stated interval.',
    applicabilityLogic: { all: [{ fact: 'boilerInScope', eq: true }] },
    frequency: 'ANNUAL',
    responsibleAuthority: 'Chief Inspector of Boilers',
    evidenceExpected: ['Boiler certificate', 'Latest inspection report', 'Boiler attendant / operator competency certificate'],
    affectedEquipmentTypes: ['boiler', 'steam generator'],
    legalReviewRequired: true,
    sourceQuoteLocator: 'Registration and certification provisions of the applicable boiler legislation.',
  },
  {
    id: 'OB-GROUNDWATER-PERMISSION',
    instrumentId: 'IN-GROUNDWATER',
    sectionRuleSchedule: 'Abstraction permission provisions',
    topic: 'Groundwater abstraction permission',
    summary: 'Abstraction of groundwater for industrial use requires the permission that applies in the area.',
    applicabilityLogic: { all: [{ fact: 'groundwaterAbstraction', eq: true }] },
    frequency: 'ANNUAL',
    responsibleAuthority: 'Central Ground Water Authority / State authority',
    evidenceExpected: ['Abstraction permission', 'Flow-meter readings and returns'],
    legalReviewRequired: true,
    sourceQuoteLocator: 'Applicable abstraction rules for the area.',
  },
  {
    id: 'OB-DG-TRANSPORT',
    instrumentId: 'IN-DG-TRANSPORT',
    sectionRuleSchedule: 'Carriage, labelling and documentation provisions',
    topic: 'Dangerous-goods dispatch',
    summary: 'Dispatch of hazardous goods must meet the carriage, packaging, labelling, documentation and driver-training requirements that apply.',
    applicabilityLogic: { all: [{ fact: 'dispatchesHazardousGoods', eq: true }] },
    frequency: 'ON_EVENT',
    responsibleAuthority: 'MoRTH / transport authority',
    evidenceExpected: ['TREM cards', 'Transport emergency contact record', 'Driver training records', 'Vehicle documentation'],
    legalReviewRequired: true,
    sourceQuoteLocator: 'Applicable carriage rules for dangerous goods.',
  },
]);

/**
 * Threshold sets. Every entry ships with value: null.
 * The engine refuses to conclude a crossing until a user enters the figure from
 * the official schedule and cites it.
 */
export const LEGAL_THRESHOLD_SETS = Object.freeze([
  {
    id: 'MSIHC-SCHEDULE-THRESHOLDS',
    instrumentId: 'IN-MSIHC-1989',
    label: 'MSIHC Rules — scheduled threshold quantities',
    basis: 'Quantity of the named hazardous chemical present or liable to be present at the site',
    locator: 'Schedules to the Manufacture, Storage and Import of Hazardous Chemicals Rules, 1989, as amended',
    officialSourceUrl: 'https://moef.gov.in/',
    status: 'REQUIRES_VERIFICATION',
    entries: [],
    guidance:
      'Enter one entry per chemical or chemical class from the official schedule: the chemical as named there, the quantity, the unit, and which schedule and entry it comes from. The engine then compares the site inventory deterministically and shows the arithmetic.',
  },
  {
    id: 'PLIA-NOTIFIED-QUANTITIES',
    instrumentId: 'IN-PLIA-1991',
    label: 'Public Liability Insurance Act — notified quantities of hazardous substances',
    basis: 'Quantity of the hazardous substance handled',
    locator: 'Quantities notified under the Public Liability Insurance Act, 1991 and the rules made under it',
    officialSourceUrl: 'https://www.indiacode.nic.in/',
    status: 'REQUIRES_VERIFICATION',
    entries: [],
  },
  {
    id: 'PETROLEUM-EXEMPT-QUANTITIES',
    instrumentId: 'IN-PETROLEUM-RULES-2002',
    label: 'Petroleum Rules — exempt quantities by petroleum class',
    basis: 'Quantity stored, by petroleum class and container type',
    locator: 'Exempt-quantity provisions of the Petroleum Rules, 2002, as amended',
    officialSourceUrl: 'https://peso.gov.in/',
    status: 'REQUIRES_VERIFICATION',
    entries: [],
  },
]);

export function instrumentById(id) {
  return LEGAL_INSTRUMENTS.filter((i) => i.id === id)[0] || null;
}

export function obligationsForInstrument(id) {
  return LEGAL_OBLIGATIONS.filter((o) => o.instrumentId === id);
}

export function thresholdSetById(id) {
  return LEGAL_THRESHOLD_SETS.filter((t) => t.id === id)[0] || null;
}

export function domainLabel(key) {
  const d = LEGAL_DOMAINS.filter((x) => x.key === key)[0];
  return d ? d.label : key;
}

/** A standard is an obligation only where a route to mandatory status is recorded. */
export function standardIsMandatory(instrument) {
  if (!instrument || !instrument.isStandard) return { mandatory: false, reason: 'NOT_A_STANDARD' };
  const via = instrument.mandatoryVia || [];
  if (via.length === 0) {
    return {
      mandatory: false,
      reason: 'NO_ADOPTION_ROUTE_RECORDED',
      detail: 'This is a standard. It is mandatory only where adopted by law, licence, consent, contract or a company standard. Record that route before treating it as an obligation.',
    };
  }
  return { mandatory: true, reason: 'ADOPTED', via };
}
