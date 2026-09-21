# HAZOP MASTER AI — MASTER SYSTEM STRUCTURE v3

**Purpose:** Production-grade AI-assisted industrial HAZOP, process-safety, chemical-intelligence, legal-compliance and recommendation-management platform.

**Primary deployment target:** Local PC / private server using Docker Compose, with optional remote access through a secure tunnel/reverse proxy.  
**Primary database:** PostgreSQL / Supabase PostgreSQL + pgvector.  
**Primary UI:** Next.js + TypeScript + Tailwind + shadcn/ui.  
**AI:** Provider-agnostic (Anthropic, OpenAI, Google, OpenRouter, local OpenAI-compatible models).  
**Design principle:** Deterministic calculations + source-grounded AI reasoning + mandatory human verification for engineering and legal conclusions.

---

# 0. NON-NEGOTIABLE SYSTEM PRINCIPLES

1. **Never invent engineering or legal facts.** Unknown data stays unknown.
2. **Separate source facts from AI inference.** Every inferred value must be labelled and traceable.
3. **Never silently resolve conflicts.** Contradictory values trigger a conflict card.
4. **Deterministic code performs calculations.** LLMs explain calculations but do not replace the calculation engine.
5. **Legal applicability is not guessed.** The system may classify a law/rule as `potentially_applicable`; final `applicable` status requires evidence or authorized human confirmation.
6. **Official sources outrank secondary sources.** Regulatory retrieval should prefer official Gazette, India Code, Ministry, regulator, state-government and standards-body sources.
7. **Standards are distinguished from law.** A standard may be mandatory only when incorporated by law, licence, consent, contract, company standard or competent-authority condition.
8. **HAZOP remains a multidisciplinary team process.** AI assists preparation, completeness, reasoning, traceability and close-out; it does not certify a HAZOP study by itself.
9. **All final reports carry revision history, assumptions, missing-data register and source register.**
10. **Every AI/web/retrieval action is auditable.**

---

# 1. PRODUCT SCOPE

The application shall support five working modes:

## 1.1 Document-First Mode
Upload PFDs, P&IDs, BMRs, SOPs, SDS/MSDS, equipment lists, datasheets, interlock narratives, existing HAZOPs, risk assessments, legal licences/consents and other documents. The system extracts and maps information into the project model.

## 1.2 Manual Mode
Step-by-step forms for users who have no documents.

## 1.3 Hybrid Mode
Uploaded documents + manual corrections + AI chat.

## 1.4 Existing-Report Completion Mode
Upload a partial/old HAZOP; extract its nodes, worksheets, team list, safeguards and recommendations; identify missing/weak sections; regenerate into the selected template without destroying the original evidence.

## 1.5 AI Chat Control Mode
The assistant can read project state, explain findings and perform authorized structured actions such as adding a node, changing a parameter, adding a recommendation or regenerating a report section.

---

# 2. PRIMARY USER WORKFLOW

1. Create project
2. Select country/state/site jurisdiction
3. Enter minimum project profile
4. Upload documents
5. Extract project data
6. Review extracted data / conflicts
7. Resolve critical missing data
8. Detect chemicals and fetch SDS/chemical evidence
9. Detect legal/regulatory obligations
10. Build process/equipment knowledge graph
11. Propose HAZOP nodes
12. Human approves/edits nodes
13. Apply meaningful guideword/parameter combinations
14. Generate causes
15. Generate consequences without safeguard credit
16. Map existing safeguards
17. Calculate initial risk
18. Generate recommendations
19. Link legal / standard relevance
20. Calculate justified residual risk
21. Add HAZOP team members
22. Generate node-wise recommendation register
23. Track actions / evidence / closure
24. Run report quality gate
25. Export DOCX/PDF/XLSX/JSON

---

# 3. DASHBOARD

Display:

- Project name / client / site / product / stage
- Data completeness %
- Critical-data completeness %
- Documents processed / failed / pending
- Chemicals detected
- SDS profiles complete / incomplete
- Nodes proposed / approved / completed
- HAZOP scenarios generated / reviewed
- Initial high-risk scenarios
- Open recommendations
- Overdue recommendations
- Compliance obligations: applicable / potentially applicable / not applicable / unresolved
- Evidence gaps
- Licences/consents nearing expiry
- Legal updates requiring review
- Report readiness %
- Last AI run / last legal sync / last report revision

Do **not** present a misleading single “legal compliance score.” Prefer transparent counts and status categories.

---

# 4. PROJECT DATA MODEL

## 4.1 Project Identity
- project_id
- project_name
- client_name
- site_name
- site_address
- country
- state
- district
- industrial_estate
- latitude/longitude optional
- department
- product
- process
- process_stage
- project_type: greenfield/brownfield/existing/revalidation
- revision
- study_start_date
- study_end_date

## 4.2 Jurisdiction Profile
- country
- state/UT
- local authority
- appropriate_government
- factory/establishment category
- hazardous_process flag
- MAH candidate flag
- environmental category
- PESO-relevant installation flags
- boiler flags
- fire-authority jurisdiction
- electrical inspector jurisdiction
- industrial estate authority
- consent authority

## 4.3 Process Data
- process_description
- chemistry
- stoichiometry
- batch_size
- production_rate
- charging_sequence
- reaction_sequence
- reaction_time
- normal operating range
- design range
- utilities
- start-up
- shutdown
- emergency shutdown
- abnormal operating cases

## 4.4 Equipment
- tag
- service
- type
- capacity
- material of construction
- operating temperature/pressure
- design temperature/pressure
- MAWP where available
- heating/cooling system
- agitator
- vent/relief arrangement
- nozzle/service list
- connected equipment
- instruments
- alarms
- trips
- interlocks
- inspection / test data

## 4.5 Chemicals
- canonical chemical name
- synonyms
- CAS
- EC number
- formula
- molecular weight
- quantity
- concentration
- physical state
- process temperature/pressure
- storage quantity
- storage type
- charging method
- SDS status
- hazardous-chemical classification
- regulatory-threshold matches

---

# 5. DOCUMENT INTELLIGENCE

Supported inputs:

- PDF / scanned PDF
- DOC / DOCX
- XLS / XLSX / CSV
- images
- TXT / Markdown
- PFD / P&ID images
- BMR / BPR
- SOP / SMP
- equipment datasheets
- line list
- instrument index
- cause-and-effect / interlock matrix
- relief-device datasheets
- SDS/MSDS
- chemical inventory
- legal consents / licences / approvals
- EC / CTE / CTO / CCA
- PESO licences
- factory registration/licence documents
- fire approvals
- boiler documents
- electrical inspection documents
- emergency plans
- past HAZOP / QRA / ALOHA reports

Pipeline:

`upload -> hash -> classify -> parse -> OCR only if needed -> table extraction -> entity extraction -> unit normalization -> source anchoring -> confidence -> canonical mapping -> user review`

Every extracted value stores:

- document_id
- document_version
- page
- section/table/cell
- original text
- normalized value
- original unit
- normalized unit
- extraction method
- confidence
- verification status
- extracted_at

---

# 6. DATA COMPLETENESS + CONFLICT ENGINE

Status vocabulary:

- VERIFIED
- USER_CONFIRMED
- DOCUMENT_EXTRACTED
- WEB_SOURCED
- AI_INFERRED
- CONFLICT
- MISSING
- NOT_APPLICABLE

Example conflict:

- PFD reactor capacity: 5 KL
- datasheet capacity: 6 KL
- BMR capacity: 5 KL

System response:

`CONFLICT — engineering review required`

Never auto-select a value unless an explicit project rule authorizes source precedence.

---

# 7. CHEMICAL / SDS INTELLIGENCE

## 7.1 Source Priority
1. Official manufacturer/supplier SDS
2. Government/regulator databases
3. Recognized occupational-health databases
4. Recognized scientific chemical databases
5. Peer-reviewed literature
6. Other technical sources

## 7.2 Chemical Property Schema
Identity:
- name
- CAS
- EC
- synonyms
- formula
- MW

Physical:
- state
- melting/freezing point
- boiling point
- density
- vapour pressure
- vapour density
- solubility
- pH
- viscosity

Fire/explosion:
- flash point
- autoignition temperature
- LEL
- UEL
- flammability class
- oxidizing property
- decomposition temperature

Dust:
- combustible dust evidence
- Kst
- Pmax
- MIE
- MIT cloud/layer
- particle-size relevance

Toxicology/exposure:
- acute toxicity
- inhalation
- dermal
- eye/skin
- sensitization
- carcinogenicity
- reproductive toxicity
- STOT
- TWA/STEL/ceiling
- IDLH when authoritative source exists

Reactivity:
- incompatible materials
- hazardous reactions
- decomposition products
- water reactivity
- polymerization

Environment:
- aquatic toxicity
- persistence
- bioaccumulation

Transport/GHS:
- UN number
- transport class
- packing group
- signal word
- pictograms
- H/P statements

## 7.3 Process-vs-Property Reasoning
Examples:

- operating temperature vs flash point
- operating temperature vs boiling point
- operating temperature vs decomposition temperature
- pressure vs vapour pressure
- chemical incompatibility vs co-storage/co-charging
- flammable range vs expected vapour concentration
- powder operation vs combustible-dust evidence
- transfer/charging vs static susceptibility
- reaction heat vs cooling availability
- materials of construction vs chemical compatibility

Each alert must show:

`FACT -> SOURCE -> PROCESS CONTEXT -> HAZARD MECHANISM -> AFFECTED NODE -> REVIEW/RECOMMENDATION`

---

# 8. PROCESS KNOWLEDGE GRAPH

Graph entities:

`PROJECT -> PROCESS STEP -> NODE -> EQUIPMENT -> LINE -> INSTRUMENT -> CHEMICAL -> UTILITY -> SAFEGUARD -> DEVIATION -> CAUSE -> CONSEQUENCE -> RISK -> RECOMMENDATION -> LEGAL OBLIGATION -> EVIDENCE`

Graph relations allow cross-document reasoning and traceability.

---

# 9. HAZOP NODE ENGINE

Propose nodes from PFD/P&ID/BMR/process sequence.

Node operations:

- approve
- edit
- split
- merge
- reorder
- delete
- add manually

Each node stores:

- node_number
- worksheet_name
- node description
- design intent
- boundaries
- documents referred
- equipment covered
- lines covered
- chemicals
- utilities
- operating parameters
- design parameters
- instruments
- alarms
- trips/interlocks
- relief systems
- safeguards
- assumptions
- missing data
- legal/standards relevance

---

# 10. GUIDEWORD / PARAMETER ENGINE

Core guidewords:

- NO / NOT
- MORE
- LESS
- REVERSE
- AS WELL AS
- PART OF
- OTHER THAN
- EARLY
- LATE
- BEFORE
- AFTER

Core parameters:

- flow
- quantity
- pressure
- vacuum
- temperature
- level
- time
- agitation
- composition
- concentration
- pH
- reaction
- heating
- cooling
- transfer
- charging
- discharge
- inerting
- ventilation
- sampling
- static charge
- utility

Utilities:

- power
- steam
- thermic fluid
- cooling water
- chilled water
- brine
- nitrogen
- instrument air
- compressed air
- vacuum

Generate only meaningful combinations.

---

# 11. HAZOP SCENARIO SCHEMA

Each scenario/row:

- scenario_id
- node_id
- parameter
- guideword
- deviation
- causes[]
- consequences[]
- existing_safeguards[]
- initial_probability
- initial_severity
- initial_risk
- risk_basis
- recommendations[]
- residual_probability
- residual_severity
- residual_risk
- residual_risk_basis
- legal_relevance[]
- standards_relevance[]
- assumptions[]
- evidence_refs[]
- reviewer_status

---

# 12. CAUSE / CONSEQUENCE / SAFEGUARD REASONING

## 12.1 Cause Families
- human error
- wrong material / wrong sequence
- excess/insufficient charge
- valve failure / wrong lineup
- pump failure
- control-loop failure
- instrument failure
- PLC/DCS failure
- trip bypass
- utility failure
- blockage/choking/fouling/scaling
- line rupture/leakage
- over/under heating
- cooling failure
- agitation failure
- vent blockage
- relief isolation/failure assumptions
- static electricity
- incompatible chemicals
- runaway/decomposition
- reverse flow
- contamination
- maintenance error
- common-cause failure where justified

## 12.2 Consequence Families
People:
- exposure
- injury
- burn
- poisoning
- fatality

Fire/explosion:
- pool fire
- flash fire
- jet fire if mechanism supports it
- dust fire
- dust explosion
- vapour-cloud explosion
- vessel overpressure/rupture
- runaway/decomposition

Environment:
- air release
- water/soil contamination
- hazardous-waste generation

Business/process:
- equipment damage
- production loss
- off-spec product
- process delay

Consequences are evaluated **before** credit for safeguards.

## 12.3 Safeguard Classification
- prevention
- detection
- control
- mitigation
- emergency response
- administrative

Keep `existing safeguard` separate from `recommendation`.

---

# 13. RISK ENGINE

Risk matrix is project-configurable.

Default example:

- Likelihood 1–5
- Severity 1–5
- Risk = L x S

Example categories:
- 1–2 Trivial
- 3–4 Tolerable
- 5–9 Moderate
- 10–16 Substantial
- 20–25 Intolerable

Store matrix version used.

The engine must support:

- initial risk
- post-existing-safeguard risk if project methodology requires it
- proposed residual risk
- ALARP/tolerability narrative only where methodology and evidence support it

Residual risk cannot be reduced merely because a recommendation exists; a reduction requires an explicit technical basis.

---

# 14. RECOMMENDATION ENGINE

Hierarchy of control:

1. Eliminate
2. Substitute
3. Engineering control
4. Administrative control
5. PPE

Recommendation fields:

- recommendation_id
- scenario_id
- node_id
- recommendation text
- technical basis
- legal basis optional
- standard basis optional
- initial risk
- expected residual risk
- priority
- responsible department
- responsible person
- target date
- status
- closure evidence required
- closure comments
- verifier
- verification date

Avoid vague actions such as `Take care`, `Be careful`, or `Use PPE` where engineering controls are reasonably relevant.

---

# 15. HAZOP TEAM MEMBERS MODULE

Fields:

- serial number
- name
- designation
- department
- organization
- HAZOP role
- discipline
- experience
- email
- attendance
- signature / signature placeholder
- comments

Roles:

- chairman
- facilitator
- process engineer
- production/operations
- maintenance
- instrumentation
- electrical
- EHS/process safety
- quality
- project
- R&D
- consultant
- recorder
- other

Report metadata:

- revision
- date started
- date completed
- workshop sessions
- attendance record

---

# 16. FINAL NODE-WISE RECOMMENDATION REGISTER

Mandatory report section.

Group:

`NODE 01 -> NODE 02 -> NODE 03 -> ...`

Columns:

- Rec ID
- Node
- Equipment
- Deviation
- Cause
- Consequence
- Initial Risk
- Recommendation
- Legal/Standard Basis
- Expected Residual Risk
- Priority
- Responsible Department
- Responsible Person
- Target Date
- Status
- Close-out Evidence

Deduplicate only when technically equivalent; preserve backlinks to every original scenario.

---

# 17. LEGAL & REGULATORY COMPLIANCE ENGINE

This is a first-class module, not a static reference page.

## 17.1 Compliance Objectives

The system shall:

1. Identify potentially applicable legal instruments.
2. Explain **why** each may apply.
3. Link obligation to project facts, chemical quantities, equipment and HAZOP nodes.
4. Compare available evidence against the obligation.
5. Show missing evidence and unresolved applicability.
6. Track licences, consents, approvals, returns, inspections and renewal dates.
7. Surface relevant legal obligations directly inside the HAZOP worksheet.
8. Cite the exact official source / rule / section / schedule used.
9. Detect legal-source amendments and mark affected projects for review.
10. Never make an unsupported declaration that a facility is legally compliant.

## 17.2 Jurisdiction Resolver

Before applying a rule, determine:

- country
- state/UT
- district/local authority
- appropriate government under the relevant law
- establishment/factory category
- process category
- hazardous-process status
- chemical names and quantities
- storage form / vessel type
- petroleum class where relevant
- compressed-gas / pressure-vessel status
- explosives/ammonium-nitrate relevance
- worker count where legally relevant
- environmental project category
- consent / EC applicability
- industrial estate / notified area

Applicability values:

- APPLICABLE_CONFIRMED
- POTENTIALLY_APPLICABLE
- NOT_APPLICABLE_CONFIRMED
- NOT_ENOUGH_DATA
- REQUIRES_LEGAL_REVIEW

## 17.3 Legal Source Hierarchy

Prefer:

1. Gazette of India / State Gazette
2. India Code
3. Ministry / regulator official website
4. State government / regulator official website
5. official licence/consent/EC document uploaded by user
6. official circular/office memorandum/guideline
7. recognized standards body
8. secondary source only for discovery, never as controlling authority when official text is available

## 17.4 Seed Legal Library — India / Gujarat Industrial Chemical Sites

The seed library shall be **versioned and updateable**. Do not hard-code applicability. At minimum include metadata entries for:

### A. Occupational Safety / Factory / Hazardous Process
- Occupational Safety, Health and Working Conditions Code, 2020
- applicable Central/State rules under the OSHWC Code
- hazardous-process provisions, where applicable
- site appraisal / safety policy / hazard disclosure / emergency-plan obligations where applicable
- state-specific registrations/licences/notifications

**Current implementation note for seed metadata:** the four Labour Codes, including the OSHWC Code, were brought into force from 21-Nov-2025. The system must still resolve whether Central or State rules/authority apply to the particular establishment.

### B. Hazardous Chemicals / Major Accident Hazard
- Environment (Protection) Act, 1986
- Manufacture, Storage and Import of Hazardous Chemicals Rules, 1989, as amended
- Chemical Accidents (Emergency Planning, Preparedness and Response) Rules, 1996
- relevant schedules and threshold quantities
- MAH classification logic
- major-accident notification requirements
- safety report / safety audit / on-site emergency plan / off-site interfaces where applicable

### C. Environmental Pollution / Waste
- Water (Prevention and Control of Pollution) Act, 1974
- Air (Prevention and Control of Pollution) Act, 1981
- Environment (Protection) Act, 1986 and applicable rules/notifications
- Hazardous and Other Wastes (Management and Transboundary Movement) Rules, 2016 and amendments
- consent / authorization conditions from the relevant SPCB/PCC
- project-specific CTE / CTO / CCA / authorization
- Environmental Clearance / EIA Notification, 2006 and amendments where the scheduled project/activity is applicable

### D. Public Liability / Accident Consequence
- Public Liability Insurance Act, 1991 and applicable rules/notifications for hazardous substances

### E. PESO / Flammable / Compressed Gas / Pressure Vessel / Explosive Materials
Where project facts trigger relevance, include:

- Petroleum Act and Petroleum Rules, 2002, as amended
- Gas Cylinders Rules, 2016, as amended
- Static and Mobile Pressure Vessels (Unfired) Rules, 2016, as amended
- Explosives Act / Explosives Rules, 2008 where relevant
- Ammonium Nitrate Rules, 2012 where relevant
- Calcium Carbide Rules where relevant
- any applicable licence conditions and approved drawings

### F. Fire / Building / Local Authority
- applicable state fire-safety legislation/rules
- local fire NOC / fire approval conditions
- National Building Code provisions only where legally/contractually adopted or selected as engineering guidance
- industrial-estate / notified-area requirements where applicable

### G. Electrical Safety
- applicable Electricity Act / CEA safety regulations
- electrical inspector approvals / hazardous-area requirements
- project-specific approval conditions

### H. Boiler / Pressure Equipment
- applicable boiler legislation/rules/IBR requirements where equipment falls within scope
- inspection/certification status

### I. Other Conditional Legal Domains
- transport of dangerous goods
- waste transport manifests
- hazardous chemical import
- groundwater permissions
- local storage / tank farm approvals
- explosives / oxidizers / special chemicals
- emergency response / district authority conditions

**Important:** The legal engine shall distinguish `law`, `rule`, `notification`, `licence condition`, `consent condition`, `EC condition`, `standard`, `guideline` and `company requirement`.

## 17.5 Legal Instrument Schema

```ts
LegalInstrument {
  id
  title
  instrument_type
  parent_act_id?
  jurisdiction_country
  jurisdiction_state?
  authority
  notification_number?
  gazette_date?
  effective_from?
  effective_to?
  amendment_status
  official_source_url
  official_document_hash?
  retrieved_at
  last_verified_at
  source_status
}
```

## 17.6 Legal Obligation Schema

```ts
LegalObligation {
  id
  legal_instrument_id
  section_rule_schedule
  topic
  obligation_summary
  applicability_logic
  threshold_expression?
  frequency?
  responsible_authority
  evidence_expected[]
  affected_process_types[]
  affected_chemical_classes[]
  affected_equipment_types[]
  source_quote_locator
  legal_review_required
}
```

## 17.7 Project Compliance Record

```ts
ProjectComplianceRecord {
  project_id
  obligation_id
  applicability_status
  applicability_reason
  project_facts_used[]
  evidence_ids[]
  evidence_status
  compliance_status
  owner
  due_date?
  renewal_date?
  gap_description?
  recommended_action?
  legal_source_version
  reviewed_by?
  reviewed_at?
}
```

Compliance status:

- COMPLIANT_EVIDENCE_VERIFIED
- PARTIALLY_EVIDENCED
- EVIDENCE_MISSING
- POTENTIAL_GAP
- NOT_APPLICABLE
- UNDER_REVIEW
- EXPIRED
- RENEWAL_DUE

## 17.8 Chemical Threshold Matcher

Build deterministic threshold logic.

For every chemical:

1. normalize identity
2. verify CAS when possible
3. map to hazardous-chemical schedules/classes
4. compare site inventory with threshold quantity
5. retain unit conversion evidence
6. show exact schedule/entry and source
7. flag threshold crossings
8. require human confirmation where identity/quantity is uncertain

Never let LLM arithmetic decide threshold crossing.

## 17.9 Compliance Register UI

Main table:

| Domain | Law/Rule | Section/Rule | Obligation | Applicability | Evidence | Status | Authority | Due/Renewal | Affected Nodes | Source |

Filters:

- Legal domain
- Authority
- Applicable / potential / unresolved
- Open gaps
- Expiring licences
- Node
- Chemical
- Equipment
- High-risk HAZOP scenario

Detail drawer must show:

- exact project facts used
- source reference
- applicability reasoning
- supporting evidence
- missing evidence
- related nodes/scenarios/recommendations
- change history
- reviewer decision

## 17.10 Per-Node Legal Panel

Every HAZOP node shall have a tab:

`LEGAL / STATUTORY RELEVANCE`

Show:

- applicable/potential legal duties
- statutory safeguards/inspection/approval conditions
- uploaded licence/consent conditions affecting node
- missing evidence
- linked recommendations
- source links

Example structure:

`Node 04 Reactor -> hazardous chemical -> quantity threshold -> MSIHC relevance -> emergency/major accident duties -> evidence -> status`

The system must not force a legal citation into every HAZOP row; only show genuinely relevant obligations.

## 17.11 Permit / Licence / Consent Tracker

Track:

- registration/licence type
- issuing authority
- licence/consent number
- issue date
- effective date
- expiry/renewal date
- status
- approved capacity
- chemicals / equipment covered
- key conditions
- uploaded source
- next action

Examples:

- OSH/factory registration/licence
- GPCB/SPCB CTE/CTO/CCA
- hazardous-waste authorization
- EC
- PESO approvals/licences
- fire NOC
- boiler certificate
- electrical inspector approval
- groundwater permission where applicable

## 17.12 Legal Condition Extractor

When a user uploads a licence/consent/EC:

- extract conditions
- categorize them
- identify recurring monitoring/return requirements
- map them to equipment/nodes
- identify due dates
- compare project evidence
- create compliance tasks

Never reinterpret a condition beyond its text without clearly labelled analysis.

## 17.13 Legal Update Monitor

Optional scheduled task:

`official source -> fetch index -> detect document/version change -> compare metadata/text -> create REVIEW REQUIRED event`

Do not automatically change project compliance conclusions after a legal update.

Show:

- instrument changed
- old version
- new version
- change date
- potentially affected projects
- sections requiring review

## 17.14 Legal Chat Commands

Examples:

- "Which laws may apply to this reactor node?"
- "Why did you flag MSIHC?"
- "Show threshold calculation."
- "Which licence conditions relate to storage?"
- "What compliance evidence is missing?"
- "Show upcoming renewals."
- "Find the official source for this requirement."
- "Compare our chemical inventory against hazardous-chemical thresholds."

Every legal answer in chat must show source and state whether it is:

- source fact
- system applicability analysis
- unresolved question

---

# 18. LEGAL SOURCE / REGULATORY RETRIEVAL PROVIDERS

Provider abstraction:

- official direct URL fetcher
- India Code adapter
- Ministry/regulator index crawler
- state-regulator index crawler
- generic web search only for discovery
- manual admin upload

Configuration:

```env
LEGAL_RESEARCH_ENABLED=true
LEGAL_OFFICIAL_ONLY_DEFAULT=true
WEB_SEARCH_PROVIDER=
WEB_SEARCH_API_KEY=
WEB_FETCH_ENABLED=true
LEGAL_UPDATE_CHECK_ENABLED=false
```

Cache official documents and metadata. Retain document hash and retrieval date.

---

# 19. LEGAL / ENGINEERING SOURCE LABELS

Every source should carry a type:

- STATUTE
- RULE
- NOTIFICATION
- GAZETTE
- REGULATOR_GUIDANCE
- LICENCE_CONDITION
- CONSENT_CONDITION
- EC_CONDITION
- STANDARD
- COMPANY_STANDARD
- SDS
- MANUFACTURER_DATA
- SCIENTIFIC_SOURCE
- PROJECT_DOCUMENT
- AI_INFERENCE

This prevents the application from treating a recommendation in a guidance document as a statutory obligation.

---

# 20. AI CHATBOT ACTION SYSTEM

Chat should not directly mutate tables through free text. Use tool/action schemas.

Actions:

- add/update/delete node
- add/update scenario
- add/update safeguard
- add/update recommendation
- add team member
- resolve data conflict
- accept extracted field
- create compliance task
- mark legal applicability decision
- attach evidence
- generate report

Destructive changes require confirmation.

Every action logs:

- user
- time
- old value
- new value
- AI model
- evidence/source

---

# 21. AI PROVIDER ROUTER

Adapters:

- Anthropic
- OpenAI
- Google
- OpenRouter
- Local OpenAI-compatible endpoint

Task classes:

### LIGHT
- extraction cleanup
- classification
- formatting
- simple summaries

### MEDIUM
- node proposals
- scenario drafting
- recommendation drafting
- document mapping

### STRONG
- cross-document contradictions
- chemical-process hazard reasoning
- difficult legal-applicability explanation
- final technical review

Provider fallback chain configurable.

Never silently switch to a lower-capability model for high-risk technical review without recording the fallback.

---

# 22. RAG / KNOWLEDGE BASE

Collections:

- PROJECT_DOCUMENTS
- HAZOP_METHOD
- CHEMICAL_SOURCES
- SDS_LIBRARY
- LEGAL_OFFICIAL
- LEGAL_PROJECT_CONDITIONS
- STANDARDS
- COMPANY_STANDARDS
- PAST_HAZOPS

Metadata:

- project
- document
- revision
- page/section
- source type
- jurisdiction
- authority
- legal instrument
- chemical
- equipment
- node
- effective date
- verification date

Retrieval rules:

1. project facts first
2. verified legal/project conditions second
3. authoritative chemical data third
4. methodology/standards
5. external general knowledge last

---

# 23. REPORT GENERATOR

Outputs:

- DOCX editable
- PDF fixed
- XLSX HAZOP worksheets
- XLSX recommendation tracker
- XLSX compliance register
- JSON full project backup

Recommended report order:

1. Cover
2. Revision history
3. Caution / limitations
4. Introduction
5. Scope
6. Process description
7. Documents reviewed
8. HAZOP methodology
9. Reference standards
10. Legal / regulatory applicability summary
11. Study exclusions/assumptions
12. HAZOP team members
13. Risk matrix
14. Chemical hazard summary
15. Process/PFD/P&ID reference
16. Node list
17. Node worksheets
18. Node-wise legal relevance/gaps (optional detailed annexure)
19. Final node-wise recommendation register
20. Master recommendation/action register
21. Compliance-gap register
22. Missing-data register
23. Final conclusions
24. Source register
25. Annexures

---

# 24. REPORT QUALITY GATE

Checklist:

- project identity verified
- jurisdiction selected
- applicable legal-source set verified
- document list complete
- process basis available
- chemical inventory reviewed
- SDS data status visible
- legal threshold calculations checked
- nodes approved
- guidewords addressed
- causes/consequences/safeguards reviewed
- initial risk calculated
- high-risk scenarios have action/acceptance rationale
- recommendations numbered
- residual-risk basis present
- team members recorded
- node-wise recommendation register generated
- compliance-gap register generated
- source register generated
- assumptions/missing-data annexure generated

Report can always be exported as `DRAFT`.

Only authorized human users may mark `REVIEWED` / `APPROVED`.

---

# 25. DATABASE TABLES

Core:

- users
- organizations
- projects
- project_jurisdictions
- project_documents
- document_versions
- document_chunks
- extracted_fields
- field_conflicts
- process_steps
- equipment
- equipment_connections
- chemicals
- chemical_inventory
- chemical_properties
- chemical_sources
- nodes
- node_equipment
- node_lines
- node_chemicals
- hazop_scenarios
- scenario_causes
- scenario_consequences
- safeguards
- scenario_safeguards
- risk_matrices
- risk_assessments
- recommendations
- recommendation_links
- recommendation_evidence
- team_members
- assumptions
- data_gaps
- report_versions
- ai_runs
- audit_logs

Legal/compliance:

- legal_instruments
- legal_instrument_versions
- legal_obligations
- legal_thresholds
- legal_sources
- project_legal_applicability
- project_compliance_records
- permits_licenses_consents
- permit_conditions
- compliance_evidence
- compliance_tasks
- legal_update_events
- legal_node_links
- legal_scenario_links
- legal_recommendation_links

---

# 26. API / SERVICE MODULES

Suggested backend modules:

- auth
- projects
- files
- extraction
- process-model
- chemicals
- research
- legal
- nodes
- hazop
- risk
- recommendations
- actions
- reports
- audit
- admin

Important service boundaries:

- `CalculationService`: deterministic arithmetic/unit conversion/threshold matching
- `SourceService`: source storage/citations/versioning
- `LegalApplicabilityService`: rules + evidence + human decision state
- `HazopReasoningService`: grounded LLM generation
- `ReportService`: templates and exports

---

# 27. FRONTEND ROUTES

```text
/dashboard
/projects
/projects/[id]/overview
/projects/[id]/documents
/projects/[id]/data-review
/projects/[id]/process
/projects/[id]/equipment
/projects/[id]/chemicals
/projects/[id]/chemical-intelligence
/projects/[id]/legal
/projects/[id]/legal/register
/projects/[id]/legal/permits
/projects/[id]/legal/updates
/projects/[id]/nodes
/projects/[id]/hazop
/projects/[id]/risk
/projects/[id]/recommendations
/projects/[id]/team
/projects/[id]/sources
/projects/[id]/reports
/settings/ai
/settings/research
/settings/legal
/settings/templates
```

---

# 28. PROJECT FOLDER STRUCTURE

```text
/
├─ apps/
│  └─ web/
├─ packages/
│  ├─ db/
│  ├─ domain/
│  ├─ ai/
│  ├─ retrieval/
│  ├─ calculations/
│  ├─ legal/
│  ├─ reports/
│  └─ shared/
├─ supabase/
│  └─ migrations/
├─ docs/
│  ├─ MASTER_STRUCTURE.md
│  ├─ ARCHITECTURE.md
│  ├─ DATA_MODEL.md
│  ├─ HAZOP_ENGINE.md
│  ├─ CHEMICAL_INTELLIGENCE.md
│  ├─ LEGAL_COMPLIANCE.md
│  ├─ REPORT_SCHEMA.md
│  ├─ SECURITY.md
│  └─ TASKS.md
├─ docker/
├─ tests/
├─ docker-compose.yml
├─ .env.example
└─ CLAUDE.md
```

Avoid unnecessary microservices initially.

---

# 29. SECURITY / DATA GOVERNANCE

- RBAC: Admin / Facilitator / Engineer / Reviewer / Viewer
- project-level access controls
- encryption in transit
- secret keys only server-side
- never expose AI keys to browser
- signed upload/download URLs
- document hash/versioning
- audit logs append-only where practical
- backup/restore
- configurable retention
- internet research can be disabled per project
- uploaded confidential documents must not be sent to external providers unless project setting allows it

---

# 30. TOKEN-EFFICIENT / FAST BUILD STRATEGY

## 30.1 Claude Code Rules

Claude must:

1. Read `docs/MASTER_STRUCTURE.md` once.
2. Read only the relevant docs for the current task.
3. Use `docs/TASKS.md` as persistent state instead of repeatedly re-reading the full repo.
4. Search symbols/files before opening large files.
5. Patch existing files; do not rewrite large working files.
6. Keep prompts to AI providers task-specific.
7. Prefer structured JSON output from AI over verbose prose.
8. Use deterministic validators after AI output.
9. Run focused tests first; full test suite only at milestones.
10. Summarize changes in `TASKS.md` at the end of each phase.

## 30.2 Vertical Slice Order

### Slice 1 — Foundation
- Next.js shell
- auth
- PostgreSQL schema
- project CRUD
- Docker Compose

### Slice 2 — Documents
- upload
- document metadata
- extraction
- field provenance
- data-review UI

### Slice 3 — HAZOP Core
- nodes
- worksheets
- risk matrix
- deterministic risk calculation

### Slice 4 — AI
- provider adapter
- structured JSON generation
- grounded context retrieval
- AI chat actions

### Slice 5 — Chemical Intelligence
- chemical canonicalization
- SDS/web source retrieval
- property store
- process-property alerts

### Slice 6 — Legal Compliance
- jurisdiction resolver
- legal instrument registry
- obligation registry
- threshold engine
- compliance register
- per-node legal links
- permit tracker

### Slice 7 — Recommendations
- consolidated node-wise register
- action tracking
- evidence close-out

### Slice 8 — Reports
- DOCX/PDF/XLSX/JSON
- quality gate
- revision control

### Slice 9 — Hardening
- audit
- permissions
- backup
- integration tests
- legal/source update jobs

---

# 31. AI OUTPUT CONTRACTS

AI responses used by the application must return schemas, not markdown prose.

Example:

```json
{
  "facts_used": [],
  "assumptions": [],
  "missing_data": [],
  "result": {},
  "sources": [],
  "confidence": 0.0,
  "human_review_required": true
}
```

Reject invalid output and retry with a repair prompt.

---

# 32. LEGAL APPLICABILITY OUTPUT CONTRACT

```json
{
  "instrument_id": "...",
  "obligation_id": "...",
  "status": "POTENTIALLY_APPLICABLE",
  "facts_used": [
    {"field":"chemical_inventory.acetone","value":12000,"unit":"kg","source_id":"..."}
  ],
  "logic": "Inventory exceeds/approaches the configured threshold entry...",
  "source_refs": ["..."],
  "missing_facts": [],
  "requires_human_review": true
}
```

LLM may explain; deterministic rules evaluate numerical thresholds.

---

# 33. CURRENT SEED-SOURCE NOTES (VERIFY AT RUNTIME)

The initial legal library should be seeded from official sources and marked with `last_verified_at`.

As of the design date (21-Sep-2026), official sources indicate:

- The Occupational Safety, Health and Working Conditions Code, 2020 was brought into force on 21-Nov-2025; final Occupational Safety, Health and Working Conditions (Central) Rules, 2026 were published later. Applicability of Central versus State rules must be resolved for each establishment.
- MoEF&CC continues to list the Manufacture, Storage and Import of Hazardous Chemicals Rules, 1989 and Chemical Accidents (Emergency Planning, Preparedness and Response) Rules, 1996 as chemical-safety instruments.
- MoEF&CC continues to maintain the Hazardous and Other Wastes (Management and Transboundary Movement) Rules, 2016 with subsequent amendments.
- PESO maintains the Petroleum Rules, 2002, Gas Cylinders Rules, 2016 and SMPV(U) Rules, 2016, with amendments/drafts that require version-aware handling.
- Gujarat ShramSetu currently provides registration/licensing workflows under the OSH&WC Code.

The application must fetch the latest official version before relying on a legal instrument for a current compliance determination.

---

# 34. REFERENCE SOURCE SEED URLS

Use these as discovery roots; store exact documents and hashes after retrieval:

- Ministry of Labour & Employment: https://labour.gov.in/
- India Code: https://www.indiacode.nic.in/
- MoEF&CC Rules & Regulations: https://moef.gov.in/
- PARIVESH: https://parivesh.nic.in/
- CPCB: https://cpcb.nic.in/
- PESO: https://peso.gov.in/
- Gujarat ShramSetu: https://shramsetu.gujarat.gov.in/
- Gujarat Pollution Control Board: https://gpcb.gujarat.gov.in/
- GIDC: https://gidc.gujarat.gov.in/
- BIS: https://www.bis.gov.in/

Do not scrape authenticated or prohibited pages. Respect source terms and rate limits.

---

# 35. TESTING

## Unit Tests
- unit conversions
- risk calculations
- threshold comparisons
- date/renewal logic
- deduplication
- legal status transitions

## Integration Tests
- upload -> extraction -> data model
- chemical -> source -> property -> alert
- project -> jurisdiction -> legal obligations
- node -> scenario -> recommendation -> report
- permit -> condition -> task -> evidence -> status

## Golden Tests
Use known sample documents and expected structured extraction results.

## Safety Tests
- AI invents no absent design values
- conflicting sources remain conflict
- secondary legal source cannot overwrite official source
- expired licence cannot display as verified compliant
- threshold match includes unit conversion evidence
- residual risk cannot silently drop

---

# 36. ACCEPTANCE CRITERIA

The build is ready for pilot testing when a user can:

1. Create a project and select jurisdiction.
2. Upload process and legal documents.
3. See extracted facts with provenance.
4. See missing/conflicting data.
5. Detect chemicals and research SDS/properties with sources.
6. Detect potentially applicable laws/rules with source citations.
7. See threshold calculations and applicability reasoning.
8. Track permits/licences/consents and expiry dates.
9. Propose/edit/approve HAZOP nodes.
10. Generate editable HAZOP worksheets.
11. Calculate risk deterministically.
12. Create and track recommendations.
13. Add HAZOP team members.
14. View legal relevance per node.
15. Produce final node-wise recommendation list.
16. Produce compliance-gap register.
17. Generate DOCX/PDF/XLSX/JSON with sources and audit trail.
18. Use AI chat to perform controlled actions.
19. Review legal/source updates without automatic silent changes.

---

# 37. DEFINITION OF DONE FOR EACH PHASE

A phase is done only when:

- feature implemented
- database migration added if required
- validation added
- tests passing
- error states handled
- audit/provenance preserved
- docs updated
- no critical TODO placeholders in the feature path

At phase end output only:

- FEATURES COMPLETED
- FILES CREATED/MODIFIED
- TESTS RUN / RESULT
- MIGRATIONS
- KNOWN LIMITATIONS
- NEXT 3 TASKS

