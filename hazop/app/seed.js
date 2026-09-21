// app/seed.js — the worked example.
//
// Seeded from the uploaded HAZOP study report for a calcium-stearate plant
// (Arti Chemical Industries, Vilayat GIDC Estate, Bharuch; study by Technodraft
// Technical Service Pvt. Ltd.). The causes, consequences, safeguards and
// recommendations below are the study's own, carried in as
// DOCUMENT_EXTRACTED with the source text attached.
//
// Three things in the example are deliberate, and marked as such in the app:
//   1. The source report contradicts itself on the product and the site. Those
//      contradictions are seeded as real CONFLICT records rather than smoothed
//      over — resolving them is the first thing a user does.
//   2. The risk ratings on two rows are illustrative, so the dashboards have
//      something to show. An assumption record says so, and every other row is
//      left unrated, because the engine never invents a rating.
//   3. No legal threshold figure is seeded. The register therefore sits at
//      POTENTIALLY_APPLICABLE until a user enters the scheduled quantities
//      from the official text and cites them.

import { nowIso, todayIso } from './util.js';
import { suspendRender } from './state.js';

const DOC_TITLE = 'HAZOP study report — Calcium stearate (uploaded)';

export async function seedDemoProject(baseStore, onProgress) {
  // One create per record, counted, with painting suspended until the end.
  let written = 0;
  const store = {
    create: async (collection, rec, meta) => {
      const out = await baseStore.create(collection, rec, meta);
      written += 1;
      if (onProgress) onProgress(written, TOTAL_RECORDS);
      return out;
    },
  };
  suspendRender(true);
  try {
    return await build(store, onProgress);
  } finally {
    suspendRender(false);
  }
}

// Kept roughly in step with the seed below; used only for the progress line.
const TOTAL_RECORDS = 160;

async function build(store, onProgress) {
  const ref = (quote, page) => [{ sourceType: 'PROJECT_DOCUMENT', documentName: DOC_TITLE, page: page || null, quote: quote || null, extractedAt: nowIso() }];

  // ------------------------------------------------------------- project
  const project = await store.create('projects', {
    projectName: 'HAZOP — Calcium stearate plant',
    clientName: 'Arti Chemical Industries',
    siteName: 'Plot E-21, Vilayat GIDC Estate',
    siteAddress: 'Plot No. E-21, Vilayat GIDC Estate, Ta. Vagra, Dist. Bharuch, Gujarat, India',
    industrialEstate: 'Vilayat GIDC Estate',
    department: 'Production',
    product: 'Calcium stearate',
    process: 'Batch manufacture of calcium stearate by direct reaction of stearic acid with calcium hydroxide',
    processStage: 'Charging and melting through to packing',
    projectType: 'existing',
    revision: 'R0',
    studyStartDate: todayIso(),
    processDescription:
      'Stearic acid is charged to a plough shear mixer and heated with thermic fluid to melt it. Calcium hydroxide is then charged, followed by a catalyst. After a short stirring period the mass converts to the product in granule form and is transferred by an automatic system to a blender, where it is cooled. The cooled mass is ground, screened through a vibro shifter and packed.',
    chemistry: 'Stearic acid + calcium hydroxide → calcium stearate + water. The reaction is carried out in the melt with the water of reaction driven off.',
    batchSize: '450 kg stearic acid + 72 kg calcium hydroxide + 10 kg catalyst per batch',
    productionRate: '250 kg/h through the grinder',
    chargingSequence: 'Stearic acid → heat to melt → calcium hydroxide → catalyst → stir 10 min',
    reactionTime: '10 min stirring after the catalyst charge',
    normalOperatingRange: 'Melting and reaction at 90 °C; cooling in the blender to 50–55 °C',
    utilities: ['power', 'thermicFluid', 'brine', 'coolingWater', 'instrumentAir'],
    startupBasis: 'Cold start with an empty mixer; utilities lined up before charging.',
    shutdownBasis: 'Batch completion, transfer out, mixer left empty.',
    emergencyShutdownBasis: 'Not recorded in the source study.',
    jurisdiction: {
      country: 'India',
      state: 'Gujarat',
      district: 'Bharuch',
      localAuthority: 'Vilayat GIDC / Vagra taluka',
      appropriateGovernment: 'State Government',
      establishmentCategory: 'Factory',
      processCategory: 'Chemical manufacture — metallic stearate',
      industrialEstate: 'Vilayat GIDC Estate',
      consentAuthority: 'Gujarat Pollution Control Board',
      hazardousProcess: null,
      mahCandidate: null,
      workerCount: null,
      environmentalCategory: null,
      scheduledActivity: null,
      emitsToAir: true,
      dischargesToWaterOrLand: null,
      hazardousWasteGenerated: null,
      groundwaterAbstraction: null,
      dispatchesHazardousGoods: null,
      petroleumClassPresent: false,
      compressedGasPresent: false,
      pressureVesselPresent: false,
      explosivesRelevant: false,
      ammoniumNitrateRelevant: false,
      calciumCarbideRelevant: false,
      boilerInScope: null,
      fireAuthority: null,
      electricalInspectorate: null,
    },
    confidentialDocuments: true,
    researchEnabled: false,
    sourcePrecedenceEnabled: false,
    isWorkedExample: true,
  });
  const pid = project.id;
  const P = { projectId: pid };

  // ------------------------------------------------------------- documents
  const doc = await store.create('documents', {
    projectId: pid,
    title: DOC_TITLE,
    docClass: 'Past HAZOP / QRA',
    docNumber: '0201-SOP-ES-00052-05',
    docRevision: '—',
    pageCount: 19,
    version: 1,
    parseStatus: 'PARSED',
    fileName: 'HAZOP_study_-_CALCIUM_STEARATE.doc',
    text: null,
    note: 'The study report this example was seeded from. Register the file itself to attach it.',
  }, P);

  await store.create('sources', { projectId: pid, sourceType: 'PROJECT_DOCUMENT', title: DOC_TITLE, publisher: 'Technodraft Technical Service Pvt. Ltd., Ankleshwar', locator: '0201-SOP-ES-00052-05', documentId: doc.id, retrievedAt: nowIso() }, P);
  await store.create('sources', { projectId: pid, sourceType: 'STANDARD', title: 'IS 16957:2018 / IEC 61882:2016 — Hazard and operability studies (HAZOP studies) — Application guide', publisher: 'Bureau of Indian Standards / IEC', locator: 'Methodology reference cited by the study', retrievedAt: nowIso() }, P);

  // -------------------------------------------- the source's own conflicts
  // The report names three different subjects and two different sites. These
  // are its words, not ours, and they are seeded as conflicts.
  const f1 = await store.create('extracted_fields', { projectId: pid, entityKind: 'project', field: 'product', value: 'Calcium stearate', status: 'DOCUMENT_EXTRACTED', method: 'ai-extract', confidence: 0.95, sourceRefs: ref('HAZOP STUDY REPORT — Product Name: CALCIUM STEARATE', 1) }, P);
  const f2 = await store.create('extracted_fields', { projectId: pid, entityKind: 'project', field: 'product', value: 'Amidoxime Core', status: 'DOCUMENT_EXTRACTED', method: 'ai-extract', confidence: 0.9, sourceRefs: ref('SCOPE OF WORK — The scope of work comprises of HAZOP study of Amidoxime Core.', 3) }, P);
  const f3 = await store.create('extracted_fields', { projectId: pid, entityKind: 'project', field: 'product', value: 'Adenine (Stage 1 to 3)', status: 'DOCUMENT_EXTRACTED', method: 'ai-extract', confidence: 0.9, sourceRefs: ref('STUDY SCOPE — This study was limited to the following processes of the Plant: Adenine (Stage: 1 to 3)', 5) }, P);
  await store.create('field_conflicts', { projectId: pid, key: 'project||product', entityKind: 'project', field: 'product', candidateIds: [f1.id, f2.id, f3.id], critical: true, status: 'OPEN', reason: 'PRECEDENCE_DISABLED' }, P);

  const s1 = await store.create('extracted_fields', { projectId: pid, entityKind: 'project', field: 'siteName', value: 'Plot E-21, Vilayat GIDC Estate, Ta. Vagra, Dist. Bharuch', status: 'DOCUMENT_EXTRACTED', method: 'ai-extract', confidence: 0.95, sourceRefs: ref('Plot No: Plot-E-21, Vilayat GIDC Estate, Ta- Vagara, Dist- Bharuch, Gujarat, India.', 1) }, P);
  const s2 = await store.create('extracted_fields', { projectId: pid, entityKind: 'project', field: 'siteName', value: 'Dahej', status: 'DOCUMENT_EXTRACTED', method: 'ai-extract', confidence: 0.85, sourceRefs: ref('…for conducting Hazard and Operability (HAZOP) study of at its plant located at Dahej.', 3) }, P);
  await store.create('field_conflicts', { projectId: pid, key: 'project||siteName', entityKind: 'project', field: 'siteName', candidateIds: [s1.id, s2.id], critical: true, status: 'OPEN', reason: 'PRECEDENCE_DISABLED' }, P);

  await store.create('extracted_fields', { projectId: pid, entityKind: 'project', field: 'operatingTemperature', value: '90', unit: 'degC', status: 'DOCUMENT_EXTRACTED', method: 'ai-extract', confidence: 0.6, rawText: 'heating up to 900C for melting', sourceRefs: ref('Charging of Stearic Acid 450 kg and heating up to 900C for melting', 12) }, P);

  await store.create('assumptions', { projectId: pid, category: 'Source legibility', text: 'The degree symbol is lost in the source document, so "900C" and "500C to 550C" have been read as 90 °C and 50 °C to 55 °C. Confirm against the BMR before relying on these figures.', basis: 'Source document text', raisedBy: 'seed' }, P);
  await store.create('assumptions', { projectId: pid, category: 'Worked example', text: 'Two worksheet rows in this example carry illustrative risk ratings so the dashboards have something to show. They are not the source study\'s ratings. Every other row is deliberately left unrated — the engine never invents a rating, and a row with only one of likelihood or severity stays unrated.', basis: 'Seeded example', raisedBy: 'seed' }, P);
  await store.create('assumptions', { projectId: pid, category: 'Worked example', text: 'No legal threshold figure is seeded. Obligations that turn on a scheduled quantity therefore sit at POTENTIALLY_APPLICABLE until a user reads the figure from the official schedule and cites it on the Thresholds tab.', basis: 'Seeded example', raisedBy: 'seed' }, P);

  // Study exclusions, in the report's own words.
  const exclusions = [
    'Simultaneous occurrence of two unrelated incidents was not considered.',
    'Correctness of the design basis and the codes used was not examined.',
    'Failures of manual valves were not considered.',
    'Passing of NRVs and PSVs was not considered.',
    'Simultaneous failure of more than one protection device was not considered.',
    'Natural calamity and sabotage were not considered.',
    'Risk was qualified only; no quantitative assessment was carried out.',
    'Mechanical protection devices (PSVs, rupture discs) are expected to work.',
    'A single check valve is taken as adequate to prevent reverse flow unless reverse flow causes pressure to exceed test pressure or unacceptable contamination.',
    'Equipment and items are deemed suitable for the design condition.',
    'Trip / interlock / shutdown systems, alarm systems for operator action, sampling and quality monitoring systems, and the SOP / SMP and operating manual are assumed to be in place.',
    'Equipment failure modes were not identified; only the failure results of the control system were considered.',
  ];
  for (const text of exclusions) await store.create('assumptions', { projectId: pid, category: 'Study exclusion', text, basis: 'Section: STUDY EXCLUSIONS of the source study', raisedBy: 'seed' }, P);

  // ------------------------------------------------------------- equipment
  const psm = await store.create('equipment', { projectId: pid, tag: 'PSM-01', type: 'mixer', service: 'Plough shear mixer — charging, melting and reaction', capacity: '2.5 kL', materialOfConstruction: 'SS 316', operatingTemperature: 90, operatingTemperatureUnit: 'C', heatingSystem: 'Thermic fluid jacket (TFH)', agitator: true, agitatorDetails: 'Plough shear agitator with gearbox drive', powderHandling: true, pressureEquipment: false, instruments: ['TG-01', 'PG-01'], alarms: [], trips: [], reliefArrangement: '', ventArrangement: 'Vent to atmosphere (arrangement not recorded in the source study)', status: 'DOCUMENT_EXTRACTED', sourceRefs: ref('EQUIPMENTS COVERED IN THIS NODE — Plough shear mixer; Possibility of static charge build-up during charging in Plough shear mixer', 12) }, P);
  const blender = await store.create('equipment', { projectId: pid, tag: 'BL-01', type: 'blender', service: 'Blender — cooling of reaction mass to 50–55 °C', capacity: '2.5 KL', materialOfConstruction: 'SS 304', operatingTemperature: 55, operatingTemperatureUnit: 'C', coolingSystem: 'Brine / cooling water jacket', agitator: true, powderHandling: true, instruments: ['TG-02', 'PG-02'], status: 'DOCUMENT_EXTRACTED', sourceRefs: ref('Cooling of Mass into Blender up to 500C to 550C … Cooling Tower, Blender, Grinder SEM-30 , Vibro shifter — 80 TR/2.5 KL/250 KG/Hr/', 15) }, P);
  const grinder = await store.create('equipment', { projectId: pid, tag: 'GR-01', type: 'grinder', service: 'Grinder SEM-30 — size reduction of the cooled mass', capacity: '250 kg/h', materialOfConstruction: 'MS with SS contact parts', powderHandling: true, status: 'DOCUMENT_EXTRACTED', sourceRefs: ref('Grinder SEM-30 … 250 KG/Hr', 15) }, P);
  const shifter = await store.create('equipment', { projectId: pid, tag: 'VS-01', type: 'other', service: 'Vibro shifter — screening before packing', powderHandling: true, status: 'DOCUMENT_EXTRACTED', sourceRefs: ref('material pass through vibro shifter and packing', 15) }, P);
  const ct = await store.create('equipment', { projectId: pid, tag: 'CT-01', type: 'cooling tower', service: 'Cooling tower', capacity: '80 TR', status: 'DOCUMENT_EXTRACTED', sourceRefs: ref('Cooling Tower … 80 TR', 15) }, P);

  // ------------------------------------------------------------- chemicals
  const stearic = await store.create('chemicals', { projectId: pid, canonicalName: 'Stearic acid', synonyms: ['Octadecanoic acid'], cas: '57-11-4', casValid: true, quantity: 450, quantityUnit: 'kg', quantityStatus: 'DOCUMENT_EXTRACTED', physicalState: 'Solid (flakes)', processTemperature: 90, processTemperatureUnit: 'C', chargingMethod: 'Manual charging to the plough shear mixer', identityStatus: 'DOCUMENT_EXTRACTED', hazardousClassification: null, sourceRefs: ref('Charging of Stearic Acid 450 kg', 12) }, P);
  const lime = await store.create('chemicals', { projectId: pid, canonicalName: 'Calcium hydroxide', synonyms: ['Hydrated lime', 'Slaked lime'], cas: '1305-62-0', casValid: true, quantity: 72, quantityUnit: 'kg', quantityStatus: 'DOCUMENT_EXTRACTED', physicalState: 'Solid (powder)', chargingMethod: 'Manual charging to the plough shear mixer', identityStatus: 'DOCUMENT_EXTRACTED', hazardousClassification: null, sourceRefs: ref('addition of Calcium hydroxide 72 kg', 12) }, P);
  const catalyst = await store.create('chemicals', { projectId: pid, canonicalName: 'Catalyst (not named in the source study)', cas: null, casValid: null, quantity: 10, quantityUnit: 'kg', quantityStatus: 'DOCUMENT_EXTRACTED', physicalState: null, identityStatus: 'MISSING', hazardousClassification: null, sourceRefs: ref('then add 10 kg of catalyst', 12) }, P);
  const product = await store.create('chemicals', { projectId: pid, canonicalName: 'Calcium stearate', synonyms: ['Octadecanoic acid, calcium salt'], cas: '1592-23-0', casValid: true, quantity: null, quantityUnit: 'kg', quantityStatus: 'MISSING', physicalState: 'Solid (granules)', identityStatus: 'DOCUMENT_EXTRACTED', hazardousClassification: null, sourceRefs: ref('mass converted into product in granule form', 12) }, P);

  // Properties: only what the study itself supports, with honest statuses.
  await store.create('chem_properties', { projectId: pid, chemicalId: stearic.id, group: 'physical', key: 'meltingPoint', value: null, unit: 'degC', status: 'MISSING' }, P);
  await store.create('chem_properties', { projectId: pid, chemicalId: stearic.id, group: 'fire', key: 'flashPoint', value: null, unit: 'degC', status: 'MISSING' }, P);
  await store.create('chem_properties', { projectId: pid, chemicalId: stearic.id, group: 'dust', key: 'combustibleDust', value: true, status: 'AI_INFERRED', sourceClass: 'OTHER_TECHNICAL', sourceRefs: [{ sourceType: 'AI_INFERENCE', documentName: 'Inferred from the study\'s own fire and dusting findings during charging', extractedAt: nowIso() }] }, P);
  await store.create('chem_properties', { projectId: pid, chemicalId: product.id, group: 'dust', key: 'combustibleDust', value: null, status: 'MISSING' }, P);
  await store.create('chem_properties', { projectId: pid, chemicalId: lime.id, group: 'tox', key: 'acuteToxicity', value: 'Causes serious eye damage and skin irritation (per the study\'s health-impact findings; confirm against the supplier SDS)', status: 'AI_INFERRED', sourceClass: 'OTHER_TECHNICAL' }, P);
  await store.create('chem_properties', { projectId: pid, chemicalId: lime.id, group: 'reactivity', key: 'waterReactive', value: null, status: 'MISSING' }, P);

  await store.create('data_gaps', { projectId: pid, entityKind: 'chemical', entityId: catalyst.id, field: 'identity', label: 'Catalyst identity', blocks: ['LEGAL_THRESHOLD', 'CHEMICAL_ALERTS', 'SDS_COMPLETENESS'], resolveWith: ['SDS', 'PROJECT_DOCUMENT'], detail: 'The source study charges 10 kg of "catalyst" without naming it. Until the material is identified no property can be attached, no compatibility check can run, and no threshold comparison is possible.', status: 'OPEN' }, P);

  // ------------------------------------------------------------ process steps
  const steps = [
    ['1', 'Charging of stearic acid', 'Charge 450 kg stearic acid flakes to the plough shear mixer.', '', '', ''],
    ['2', 'Heating and melting', 'Heat with thermic fluid to 90 °C to melt the charge.', '90 °C', 'Atmospheric', ''],
    ['3', 'Charging of calcium hydroxide', 'Charge 72 kg calcium hydroxide to the melt.', '90 °C', '', ''],
    ['4', 'Charging of catalyst', 'Charge 10 kg catalyst.', '90 °C', '', ''],
    ['5', 'Reaction / stirring', 'Stir for 10 minutes; the mass converts to product in granule form.', '90 °C', '', '10 min'],
    ['6', 'Sampling of reaction mass', 'Sample from the top for quality confirmation.', '90 °C', '', ''],
    ['7', 'Transfer to blender', 'Transfer to the blender by the automatic system.', '', '', ''],
    ['8', 'Cooling in blender', 'Cool the mass to 50–55 °C in the blender.', '50–55 °C', '', ''],
    ['9', 'Grinding', 'Grind the cooled mass in grinder SEM-30 at 250 kg/h.', '', '', ''],
    ['10', 'Screening and packing', 'Screen through the vibro shifter and pack.', '', '', ''],
  ];
  let order = 0;
  for (const [n, title, description, temperature, pressure, duration] of steps) {
    await store.create('process_steps', { projectId: pid, stepNumber: n, title, description, temperature, pressure, duration, sortOrder: order, status: 'DOCUMENT_EXTRACTED', sourceRefs: ref('NODE DESCRIPTION & DESIGN INTENSION', 12) }, P);
    order += 1;
  }

  // ------------------------------------------------------------------ nodes
  const node1 = await store.create('nodes', {
    projectId: pid,
    nodeNumber: '01',
    worksheetName: 'Charging, melting and reaction',
    description: 'Plough shear mixer: charging of stearic acid, melting, charging of calcium hydroxide and catalyst, reaction, sampling and transfer out.',
    designIntent:
      'Charge 450 kg stearic acid to the plough shear mixer and heat to 90 °C to melt it; charge 72 kg calcium hydroxide followed by 10 kg catalyst; stir for 10 minutes so the mass converts to the product in granule form; transfer to the blender by the automatic system.',
    boundaries: 'From the raw-material store to the blender inlet.',
    equipmentIds: [psm.id],
    chemicalIds: [stearic.id, lime.id, catalyst.id, product.id],
    utilities: ['power', 'thermicFluid', 'instrumentAir'],
    operatingTemperature: 90,
    operatingTemperatureMax: 90,
    operatingTemperatureUnit: 'C',
    hasCharging: true,
    hasTransfer: true,
    hasDischarge: true,
    hasSampling: true,
    hasTimedStep: true,
    isReactionStep: true,
    exothermic: null,
    manualOperation: true,
    instruments: ['TG-01'],
    alarms: [],
    trips: [],
    reliefs: [],
    reviewStatus: 'WORKSHEETED',
    sortOrder: 0,
    approvedBy: 'seed',
    approvedAt: nowIso(),
    sourceRefs: ref('HAZOP WORK SHEET — NODE DESCRIPTION & DESIGN INTENSION', 12),
  }, P);

  const node2 = await store.create('nodes', {
    projectId: pid,
    nodeNumber: '02',
    worksheetName: 'Cooling, grinding, screening and packing',
    description: 'Blender, grinder SEM-30 and vibro shifter: cooling of the reaction mass, size reduction, screening and packing.',
    designIntent: 'Cool the reaction mass in the blender to 50–55 °C, grind it in grinder SEM-30 at 250 kg/h, screen it through the vibro shifter and pack the product.',
    boundaries: 'From the blender inlet to the packing station.',
    equipmentIds: [blender.id, grinder.id, shifter.id, ct.id],
    chemicalIds: [product.id],
    utilities: ['power', 'brine', 'coolingWater'],
    operatingTemperature: 55,
    operatingTemperatureMax: 55,
    operatingTemperatureUnit: 'C',
    hasCharging: false,
    hasTransfer: true,
    hasDischarge: true,
    hasTimedStep: false,
    isReactionStep: false,
    manualOperation: true,
    instruments: ['TG-02', 'PG-02'],
    reviewStatus: 'WORKSHEETED',
    sortOrder: 1,
    approvedBy: 'seed',
    approvedAt: nowIso(),
    sourceRefs: ref('Cooling of Mass into Blender up to 500C to 550C then grinding of mass and material pass through vibro shifter and packing.', 15),
  }, P);

  // -------------------------------------------------------------- safeguards
  const safeguards = [
    [node1.id, 'Quality and quantity verification system of doer and checker', 'ADMINISTRATIVE'],
    [node1.id, 'BMR control', 'ADMINISTRATIVE'],
    [node1.id, 'Trained operator', 'ADMINISTRATIVE'],
    [node1.id, 'Fire extinguishers provided', 'MITIGATION'],
    [node1.id, 'Static grounding rod and clamp; earthing and bonding provided to the plough shear mixer', 'MITIGATION'],
    [node1.id, 'Fire-proof fittings', 'PREVENTION'],
    [node1.id, 'Temperature controller', 'CONTROL'],
    [node1.id, 'Digital clock provided for the stirring time', 'DETECTION'],
    [node1.id, 'SOP for sampling; sampling from the top', 'ADMINISTRATIVE'],
    [node2.id, 'Temperature and pressure gauges provided', 'DETECTION'],
    [node2.id, 'Preventive maintenance and calibration of TG / PG', 'ADMINISTRATIVE'],
    [node2.id, 'Supervision and BMR instruction', 'ADMINISTRATIVE'],
    [node2.id, 'Earthing and bonding at the vibro shifter', 'MITIGATION'],
  ];
  for (const [nodeId, text, cls] of safeguards) {
    await store.create('safeguards', { projectId: pid, nodeId, text, class: cls, isExisting: true, status: 'DOCUMENT_EXTRACTED', sourceRefs: ref('SAFE GUARDS / PROTECTIONS column of the source worksheet', 12) }, P);
  }

  // --------------------------------------------------------------- scenarios
  // Causes, consequences, safeguards and recommendations are the study's own.
  const rows1 = [
    {
      parameter: 'quantity', parameterLabel: 'Quantity', guideword: 'NO', guidewordLabel: 'NO / NOT', deviation: 'NO quantity',
      detail: 'No charging of stearic acid',
      causes: [['Human error', 'HUMAN_ERROR'], ['No stock of raw material', 'HUMAN_ERROR']],
      consequences: [['Process delayed', 'PROCESS_DELAY'], ['No reaction; batch carried forward', 'OFF_SPEC']],
      safeguards: [['Quality and quantity verification system of doer and checker', 'ADMINISTRATIVE'], ['BMR control', 'ADMINISTRATIVE']],
      recs: [],
    },
    {
      parameter: 'quantity', parameterLabel: 'Quantity', guideword: 'MORE', guidewordLabel: 'MORE', deviation: 'MORE quantity',
      detail: 'Excess charging of stearic acid',
      causes: [['Human error', 'HUMAN_ERROR'], ['Weighing balance malfunction', 'CHARGE_ERROR'], ['Spillage during charging', 'HUMAN_ERROR']],
      consequences: [['Process delayed', 'PROCESS_DELAY'], ['Quality impact', 'OFF_SPEC'], ['Dust exposure to the operator', 'EXPOSURE'], ['Fire', 'FLASH_FIRE']],
      safeguards: [['Quality and quantity verification system of doer and checker', 'ADMINISTRATIVE'], ['BMR control', 'ADMINISTRATIVE'], ['Trained operator', 'ADMINISTRATIVE'], ['Fire extinguishers', 'MITIGATION'], ['Earthing', 'MITIGATION']],
      recs: [
        ['Ensure preventive maintenance and calibration of the weighing balance at the defined frequency.', 'ADMINISTRATIVE', 'MEDIUM', 'Maintenance'],
        ['Ensure adequate PPE is available and used for the charging operation.', 'PPE', 'MEDIUM', 'EHS'],
      ],
    },
    {
      parameter: 'quantity', parameterLabel: 'Quantity', guideword: 'LESS', guidewordLabel: 'LESS', deviation: 'LESS quantity',
      detail: 'Short charging of stearic acid',
      causes: [['Human error', 'HUMAN_ERROR'], ['Weighing balance malfunction', 'CHARGE_ERROR']],
      consequences: [['Quality impact', 'OFF_SPEC'], ['Dust exposure', 'EXPOSURE']],
      safeguards: [['Quality and quantity verification system of doer and checker', 'ADMINISTRATIVE'], ['BMR control', 'ADMINISTRATIVE'], ['Earthing', 'MITIGATION'], ['Trained operator', 'ADMINISTRATIVE']],
      recs: [],
    },
    {
      parameter: 'staticCharge', parameterLabel: 'Static charge', guideword: 'AS_WELL_AS', guidewordLabel: 'AS WELL AS', deviation: 'AS WELL AS static charge',
      detail: 'Static charge build-up during charging into the plough shear mixer',
      causes: [['Possibility of static charge build-up during charging in the plough shear mixer', 'STATIC']],
      consequences: [['Fire hazard', 'FLASH_FIRE'], ['Dusting', 'EXPOSURE']],
      safeguards: [['Static grounding, rod and clamp', 'MITIGATION'], ['Fire extinguisher provided', 'MITIGATION'], ['Fire-proof fittings', 'PREVENTION'], ['Earthing and bonding provided to the plough shear mixer', 'MITIGATION']],
      recs: [
        ['Ensure monitoring of grounding resistance at every six months, covering the mixer, the charging drums, the hoses and the operator.', 'ENGINEERING', 'HIGH', 'Electrical'],
        ['Ensure adequate PPE for the charging operation.', 'PPE', 'MEDIUM', 'EHS'],
        ['Provide a dust collector system at the charging point.', 'ENGINEERING', 'HIGH', 'Project'],
      ],
      rate: { l: 3, s: 4 },
    },
    {
      parameter: 'heating', parameterLabel: 'Heating', guideword: 'NO', guidewordLabel: 'NO / NOT', deviation: 'NO heating',
      detail: 'No heating of the charge',
      causes: [['Power failure', 'UTILITY_FAILURE'], ['TFH valve malfunction', 'VALVE_FAILURE'], ['TG malfunction', 'INSTRUMENT_FAILURE'], ['Human error', 'HUMAN_ERROR']],
      consequences: [['No melting; process delayed', 'PROCESS_DELAY'], ['No reaction', 'OFF_SPEC']],
      safeguards: [['Trained operator', 'ADMINISTRATIVE'], ['BMR control', 'ADMINISTRATIVE']],
      recs: [['Ensure preventive maintenance of the thermic-fluid valve and calibration of the temperature gauge.', 'ADMINISTRATIVE', 'MEDIUM', 'Maintenance']],
    },
    {
      parameter: 'temperature', parameterLabel: 'Temperature', guideword: 'MORE', guidewordLabel: 'MORE', deviation: 'MORE temperature',
      detail: 'Temperature above the intended 90 °C',
      causes: [['TFH valve malfunction', 'VALVE_FAILURE'], ['TFH line leakage', 'LEAKAGE'], ['TG malfunction', 'INSTRUMENT_FAILURE'], ['Human error', 'HUMAN_ERROR']],
      consequences: [['Process delay', 'PROCESS_DELAY'], ['Flash fire', 'FLASH_FIRE']],
      safeguards: [['Trained operator', 'ADMINISTRATIVE'], ['Supervision', 'ADMINISTRATIVE'], ['BMR control', 'ADMINISTRATIVE'], ['Fire extinguishers', 'MITIGATION'], ['Temperature controller', 'CONTROL']],
      recs: [['Ensure preventive maintenance of the valve and calibration of the temperature gauge and the temperature controller.', 'ADMINISTRATIVE', 'HIGH', 'Instrumentation']],
      rate: { l: 3, s: 4 },
    },
    {
      parameter: 'agitation', parameterLabel: 'Agitation', guideword: 'NO', guidewordLabel: 'NO / NOT', deviation: 'NO agitation',
      detail: 'Loss of agitation during the reaction',
      causes: [['Human error', 'HUMAN_ERROR'], ['Power failure', 'UTILITY_FAILURE'], ['Gear box problem', 'AGITATION_FAILURE'], ['Stirrer decoupled', 'AGITATION_FAILURE']],
      consequences: [['Improper or no reaction', 'OFF_SPEC']],
      safeguards: [['Supervision', 'ADMINISTRATIVE'], ['BMR control', 'ADMINISTRATIVE'], ['DG set', 'MITIGATION']],
      recs: [
        ['Strict adherence to the BMR for the agitation step.', 'ADMINISTRATIVE', 'MEDIUM', 'Production'],
        ['Ensure preventive maintenance of the stirrer assembly, including the gearbox and the coupling.', 'ADMINISTRATIVE', 'MEDIUM', 'Maintenance'],
        ['Provide a stirrer failure alarm on the plough shear mixer.', 'ENGINEERING', 'HIGH', 'Instrumentation'],
      ],
    },
    {
      parameter: 'time', parameterLabel: 'Time', guideword: 'LESS', guidewordLabel: 'LESS', deviation: 'LESS time',
      detail: 'Stirring time shorter than the 10 minutes intended',
      causes: [['Human error', 'HUMAN_ERROR'], ['Malfunctioning of the digital clock', 'INSTRUMENT_FAILURE']],
      consequences: [['No safety consequence', 'NO_CONSEQUENCE'], ['Improper or no reaction', 'OFF_SPEC']],
      safeguards: [['Digital clock provided', 'DETECTION']],
      recs: [],
    },
    {
      parameter: 'sampling', parameterLabel: 'Sampling', guideword: 'OTHER_THAN', guidewordLabel: 'OTHER THAN', deviation: 'OTHER THAN sampling',
      detail: 'Sampling of the reaction mass carried out other than as intended',
      causes: [['No specific instruction available for the sampling', 'HUMAN_ERROR'], ['Human error', 'HUMAN_ERROR']],
      consequences: [['Operator exposure to hot mass and dust', 'EXPOSURE'], ['Spillage', 'WATER_SOIL']],
      safeguards: [['Supervision', 'ADMINISTRATIVE'], ['Sampling from the top', 'PREVENTION'], ['SOP for sampling', 'ADMINISTRATIVE']],
      recs: [
        ['Ensure proper ventilation at the sampling point.', 'ENGINEERING', 'MEDIUM', 'Project'],
        ['Ensure a spill kit is provided in the nearby area.', 'ADMINISTRATIVE', 'MEDIUM', 'EHS'],
        ['Include safety precautions for sampling in the sampling guideline.', 'ADMINISTRATIVE', 'MEDIUM', 'EHS'],
      ],
    },
    {
      parameter: 'transfer', parameterLabel: 'Transfer', guideword: 'NO', guidewordLabel: 'NO / NOT', deviation: 'NO transfer',
      detail: 'No transfer of the reaction mass to the blender',
      causes: [['Human error', 'HUMAN_ERROR'], ['Auto valve malfunction', 'VALVE_FAILURE'], ['Choking of the transfer line', 'BLOCKAGE']],
      consequences: [['Process delay', 'PROCESS_DELAY'], ['Mass solidifying in the line', 'BLOCKAGE']],
      safeguards: [['Training to the operator', 'ADMINISTRATIVE']],
      recs: [['Ensure preventive maintenance of the auto valve system at a regular interval.', 'ADMINISTRATIVE', 'MEDIUM', 'Maintenance']],
    },
  ];

  const rows2 = [
    {
      parameter: 'cooling', parameterLabel: 'Cooling', guideword: 'NO', guidewordLabel: 'NO / NOT', deviation: 'NO cooling',
      detail: 'No cooling of the mass in the blender',
      causes: [['Human error', 'HUMAN_ERROR'], ['Temperature of the brine utility may be high', 'UTILITY_FAILURE'], ['Valve or line failure / choking', 'BLOCKAGE'], ['Power failure', 'UTILITY_FAILURE'], ['Circulation pump failure', 'PUMP_FAILURE'], ['Temperature gauge failure', 'INSTRUMENT_FAILURE']],
      consequences: [['Batch delay and production loss', 'PRODUCTION_LOSS'], ['Utility and energy loss', 'PRODUCTION_LOSS']],
      safeguards: [['Pressure gauge is provided', 'DETECTION'], ['Preventive maintenance', 'ADMINISTRATIVE'], ['Calibration of TG / PG', 'ADMINISTRATIVE']],
      recs: [['Regular descaling of the blender jacket is to be carried out.', 'ADMINISTRATIVE', 'MEDIUM', 'Maintenance']],
    },
    {
      parameter: 'cooling', parameterLabel: 'Cooling', guideword: 'LESS', guidewordLabel: 'LESS', deviation: 'LESS cooling',
      detail: 'Insufficient cooling',
      causes: [['Human error', 'HUMAN_ERROR'], ['Valve passing or malfunction', 'VALVE_FAILURE'], ['Jacket scaling', 'BLOCKAGE']],
      consequences: [['Quality impact on the product', 'OFF_SPEC'], ['Batch delay', 'PROCESS_DELAY']],
      safeguards: [['Supervision', 'ADMINISTRATIVE'], ['BMR control', 'ADMINISTRATIVE']],
      recs: [],
    },
    {
      parameter: 'cooling', parameterLabel: 'Cooling', guideword: 'MORE', guidewordLabel: 'MORE', deviation: 'MORE cooling',
      detail: 'Over-cooling of the mass',
      causes: [['Human error', 'HUMAN_ERROR'], ['Low temperature of the cooling media', 'UTILITY_FAILURE'], ['Valve passing', 'VALVE_FAILURE'], ['Temperature gauge faulty', 'INSTRUMENT_FAILURE']],
      consequences: [['Reaction may get affected', 'OFF_SPEC'], ['Impact on the quality and quantity of the product', 'OFF_SPEC'], ['Utility and energy loss', 'PRODUCTION_LOSS']],
      safeguards: [['Temperature and pressure gauges are provided', 'DETECTION'], ['Preventive maintenance', 'ADMINISTRATIVE'], ['Calibration of TG / PG', 'ADMINISTRATIVE'], ['Supervision', 'ADMINISTRATIVE'], ['BMR instruction', 'ADMINISTRATIVE']],
      recs: [],
    },
    {
      parameter: 'utility:brine', parameterLabel: 'Brine', guideword: 'NO', guidewordLabel: 'NO / NOT', deviation: 'Failure of brine',
      detail: 'Loss of the brine utility to the blender jacket',
      causes: [['Circulation pump failure', 'PUMP_FAILURE'], ['Chiller trip', 'UTILITY_FAILURE'], ['Power failure', 'UTILITY_FAILURE']],
      consequences: [['Cooling not achieved; batch delay', 'PRODUCTION_LOSS']],
      safeguards: [['Temperature gauge on the blender', 'DETECTION'], ['Supervision', 'ADMINISTRATIVE']],
      recs: [],
    },
    {
      parameter: 'transfer', parameterLabel: 'Transfer', guideword: 'NO', guidewordLabel: 'NO / NOT', deviation: 'NO transfer',
      detail: 'Blender not discharging to the grinder',
      causes: [['Blender malfunction', 'AGITATION_FAILURE'], ['Power failure', 'UTILITY_FAILURE'], ['Blender choking', 'BLOCKAGE'], ['Human error', 'HUMAN_ERROR']],
      consequences: [['Process delay', 'PROCESS_DELAY'], ['Quality impact', 'OFF_SPEC']],
      safeguards: [['Preventive maintenance', 'ADMINISTRATIVE'], ['Trained operator', 'ADMINISTRATIVE'], ['Supervisor', 'ADMINISTRATIVE']],
      recs: [],
    },
    {
      parameter: 'discharge', parameterLabel: 'Discharge', guideword: 'NO', guidewordLabel: 'NO / NOT', deviation: 'NO discharge',
      detail: 'Grinding not achieved',
      causes: [['Power failure', 'UTILITY_FAILURE'], ['Machine malfunction', 'BLOCKAGE']],
      consequences: [['Process delay', 'PROCESS_DELAY']],
      safeguards: [['Trained operator', 'ADMINISTRATIVE'], ['Supervisor', 'ADMINISTRATIVE']],
      recs: [],
    },
    {
      parameter: 'discharge', parameterLabel: 'Discharge', guideword: 'PART_OF', guidewordLabel: 'PART OF', deviation: 'PART OF discharge',
      detail: 'Partial screening in the vibro shifter',
      causes: [['Sieve partially choked', 'BLOCKAGE'], ['Sieve damage', 'BLOCKAGE'], ['Human error', 'HUMAN_ERROR']],
      consequences: [['Process delay', 'PROCESS_DELAY'], ['Quality impact', 'OFF_SPEC'], ['Static charge generation in the powder', 'EXPOSURE']],
      safeguards: [['Trained operator', 'ADMINISTRATIVE'], ['Supervisor', 'ADMINISTRATIVE'], ['Earthing and bonding', 'MITIGATION']],
      recs: [],
    },
    {
      parameter: 'staticCharge', parameterLabel: 'Static charge', guideword: 'AS_WELL_AS', guidewordLabel: 'AS WELL AS', deviation: 'AS WELL AS static charge',
      detail: 'Static charge in the powder during grinding, screening and packing',
      causes: [['Powder handling and free fall at the packing station', 'STATIC'], ['Loss of earthing continuity', 'STATIC']],
      consequences: [['Dust fire', 'DUST_FIRE'], ['Operator exposure to dust', 'EXPOSURE']],
      safeguards: [['Earthing and bonding at the vibro shifter', 'MITIGATION']],
      recs: [],
    },
  ];

  let recNo = 0;
  const makeRows = async (node, rows) => {
    let rowNo = 0;
    for (const r of rows) {
      rowNo += 1;
      const scenario = await store.create('scenarios', {
        projectId: pid,
        nodeId: node.id,
        rowNumber: rowNo,
        parameter: r.parameter,
        parameterLabel: r.parameterLabel,
        guideword: r.guideword,
        guidewordLabel: r.guidewordLabel,
        deviation: r.deviation + (r.detail ? ' — ' + r.detail : ''),
        deviationKind: r.parameter.indexOf('utility:') === 0 ? 'UTILITY' : 'GUIDEWORD',
        causes: r.causes.map(([text, family]) => ({ text, family })),
        consequences: r.consequences.map(([text, family]) => ({ text, family })),
        existingSafeguards: r.safeguards.map(([text, cls]) => ({ text, class: cls })),
        initialLikelihood: r.rate ? r.rate.l : null,
        initialSeverity: r.rate ? r.rate.s : null,
        initialRisk: null,
        riskBasis: r.rate ? 'Illustrative rating seeded with the worked example; not the source study\'s rating.' : null,
        residualLikelihood: null,
        residualSeverity: null,
        reviewerStatus: 'TEAM_REVIEWED',
        evidenceRefs: ref('Source worksheet row: ' + (r.detail || r.deviation), 12),
      }, P);

      for (const [text, controlLevel, priority, dept] of r.recs || []) {
        recNo += 1;
        await store.create('recommendations', {
          projectId: pid,
          scenarioId: scenario.id,
          nodeId: node.id,
          recId: 'R-' + String(recNo).padStart(3, '0'),
          text,
          technicalBasis: 'Raised by the HAZOP team against ' + r.deviation.toLowerCase() + (r.detail ? ' (' + r.detail + ')' : '') + '.',
          controlLevel,
          priority,
          responsibleDepartment: dept,
          responsiblePerson: '',
          targetDate: null,
          status: 'OPEN',
          closureEvidenceRequired: true,
          equipmentTags: (node.equipmentIds || []).map((id) => (id === psm.id ? 'PSM-01' : id === blender.id ? 'BL-01' : id === grinder.id ? 'GR-01' : id === shifter.id ? 'VS-01' : 'CT-01')),
          sourceRefs: ref('RECOMMENDATIONS / ACTIONS column of the source worksheet', 12),
        }, P);
      }
    }
  };
  await makeRows(node1, rows1);
  await makeRows(node2, rows2);

  // -------------------------------------------------------------------- team
  await store.create('team_members', { projectId: pid, serialNumber: 1, name: 'Mr. Panduranga Satote', designation: 'Not recorded in the source study', department: '', organization: 'Technodraft Technical Service Pvt. Ltd.', role: 'facilitator', discipline: 'Process safety', sortOrder: 0, status: 'DOCUMENT_EXTRACTED', comments: 'The only team member legible in the uploaded report.', sourceRefs: ref('Mr. Panduranga Satote', 11) }, P);
  await store.create('data_gaps', { projectId: pid, entityKind: 'project', field: 'team_members', label: 'HAZOP team attendance record', blocks: ['REPORT_QUALITY_GATE'], resolveWith: ['PROJECT_DOCUMENT'], detail: 'Only one team member could be read from the uploaded report. A HAZOP is a multidisciplinary team process and the report has to name who took part in what discipline — add the rest from the original attendance sheet.', status: 'OPEN' }, P);

  // --------------------------------------------------------------- permits
  // Recorded as UNKNOWN rather than invented: the study does not carry them.
  await store.create('permits', { projectId: pid, permitType: 'GPCB CTO', label: 'Consent to operate — not yet recorded', issuingAuthority: 'Gujarat Pollution Control Board', number: '', issueDate: null, expiryDate: null, renewalDate: null, noticeDays: 90, approvedCapacity: '', keyConditions: '', nextAction: 'Upload the consent document so its conditions can be extracted verbatim and its expiry tracked.' }, P);
  await store.create('permits', { projectId: pid, permitType: 'Fire NOC', label: 'Fire approval — not yet recorded', issuingAuthority: 'Fire authority having jurisdiction', number: '', expiryDate: null, noticeDays: 90, nextAction: 'Upload the NOC.' }, P);

  return pid;
}
