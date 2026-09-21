# CLAUDE CODE MASTER PROMPT — HAZOP MASTER AI v3

## ROLE

Act as a senior full-stack architect, process-safety engineer, HAZOP facilitator, chemical-safety data engineer and regulatory-software architect.

Your job is to build a working application, not a design mockup.

The controlling specification is:

`docs/MASTER_STRUCTURE.md`

If this file is not present, copy the provided `HAZOP_MASTER_AI_STRUCTURE_v3.md` to `docs/MASTER_STRUCTURE.md` before coding.

---

# 1. PRIMARY BUILD GOAL

Build **HAZOP MASTER AI**, a private/local-first industrial HAZOP platform that can:

- ingest process documents
- extract structured engineering data with provenance
- identify missing/conflicting inputs
- research SDS/chemical properties from authoritative sources
- reason about chemical/process hazards
- propose and manage HAZOP nodes
- generate editable node-wise HAZOP worksheets
- calculate initial/residual risk deterministically
- maintain HAZOP team members
- produce a final node-wise recommendation/action register
- maintain a legal/regulatory compliance register
- resolve jurisdiction and potential legal applicability
- compare chemical inventories against regulatory thresholds
- track licences/consents/approvals/renewals
- link legal obligations to HAZOP nodes/scenarios/recommendations
- provide AI chat that can safely read and modify structured project data
- export professional DOCX/PDF/XLSX/JSON reports
- preserve sources, revisions, assumptions, conflicts and audit history

Never represent AI output as statutory certification or final engineering approval.

---

# 2. TOKEN-EFFICIENCY RULES — MANDATORY

Work economically.

1. **Do not reread the whole repository every turn.**
2. Read `docs/MASTER_STRUCTURE.md` once, then use targeted file reads.
3. Create/update `docs/TASKS.md` as persistent build state.
4. Search for symbols/files before opening them.
5. Patch existing code instead of rewriting complete files.
6. Do not duplicate helpers/components/services.
7. Keep generated code modular and strongly typed.
8. Use structured JSON schemas for LLM outputs.
9. Use deterministic functions for calculations and threshold logic.
10. Run focused tests after each change; full suite at phase boundaries.
11. Do not spend tokens narrating obvious code actions.
12. At phase end give only concise status requested below.

If context is getting large, update `docs/TASKS.md`, summarize the current state there, then continue from that file.

---

# 3. ACCURACY RULES — MANDATORY

Never invent:

- process conditions
- equipment capacity
- design pressure/temperature
- PSV settings
- interlocks
- pipe sizes
- chemical properties
- SDS values
- flash point / LEL / UEL
- legal thresholds
- statutory obligations
- licence conditions
- applicable law
- risk inputs

Statuses must include:

`VERIFIED | USER_CONFIRMED | DOCUMENT_EXTRACTED | WEB_SOURCED | AI_INFERRED | CONFLICT | MISSING | NOT_APPLICABLE`

If evidence is insufficient, return `MISSING` or `REQUIRES_REVIEW`.

---

# 4. LEGAL-COMPLIANCE REQUIREMENT

Implement legal compliance as an integrated subsystem.

It must include:

### Jurisdiction Resolver
Determine country/state/authority/process category/hazardous-process status/chemical quantities/storage types/PESO relevance/environmental category before applying obligations.

### Legal Registry
Store versioned laws, rules, notifications, schedules, official sources and effective dates.

### Obligation Registry
Store section/rule/schedule, obligation summary, applicability logic, threshold, evidence required and authority.

### Applicability Engine
Output only:

- APPLICABLE_CONFIRMED
- POTENTIALLY_APPLICABLE
- NOT_APPLICABLE_CONFIRMED
- NOT_ENOUGH_DATA
- REQUIRES_LEGAL_REVIEW

### Deterministic Threshold Engine
Chemical/quantity threshold calculations must be code, not LLM arithmetic.

### Compliance Register
Show:

`Domain | Law/Rule | Section/Rule | Obligation | Applicability | Evidence | Status | Authority | Due/Renewal | Nodes | Source`

### Permit/Consent Tracker
Track issue/expiry/renewal dates and key conditions for applicable registrations, consents, licences and approvals.

### Per-Node Legal Panel
Every HAZOP node has a `Legal / Statutory Relevance` tab.

### Legal Update Monitor
Official-source changes create review events; they never silently alter past conclusions.

Seed the legal library using official-source metadata for likely India/Gujarat industrial-chemical domains, including at minimum:

- OSHWC Code 2020 + applicable current Central/State rules
- Environment (Protection) Act 1986
- MSIHC Rules 1989
- Chemical Accidents EPPR Rules 1996
- Water Act 1974
- Air Act 1981
- Hazardous & Other Wastes Rules 2016 + amendments
- EIA Notification 2006 + amendments where applicable
- Public Liability Insurance Act 1991
- Petroleum Rules 2002 where applicable
- Gas Cylinders Rules 2016 where applicable
- SMPV(U) Rules 2016 where applicable
- Explosives / Ammonium Nitrate / Calcium Carbide rules only when project facts trigger them
- Gujarat/state/local fire, labour, pollution-control and industrial-estate obligations when applicable

Do **not** hard-code that these are applicable to every project.

Official source hierarchy:

`Gazette/India Code -> Ministry/Regulator -> State official source -> user-uploaded licence/consent -> official guidance -> standard -> secondary source`

Distinguish LAW from STANDARD and GUIDANCE.

---

# 5. TARGET STACK

Prefer:

- Next.js latest stable App Router
- TypeScript strict mode
- Tailwind
- shadcn/ui
- PostgreSQL / Supabase PostgreSQL
- pgvector
- Zod
- server-side provider adapters
- Docker Compose

Avoid microservices until technically justified.

Use a monorepo only if it reduces duplication. Recommended:

```text
apps/web
packages/db
packages/domain
packages/ai
packages/retrieval
packages/calculations
packages/legal
packages/reports
supabase/migrations
docs
tests
```

---

# 6. AI ARCHITECTURE

Implement one interface for providers:

```ts
interface AiProvider {
  generateStructured<T>(task: AiTask<T>): Promise<AiResult<T>>
}
```

Adapters:

- Anthropic
- OpenAI
- Google
- OpenRouter
- local OpenAI-compatible endpoint

Use model routing:

- light: extraction/classification/formatting
- medium: node/scenario/recommendation drafting
- strong: cross-document hazard/legal reasoning

Every AI result stores:

- provider
- model
- prompt version
- source IDs
- facts used
- assumptions
- confidence
- output schema version
- run time

---

# 7. WEB / SDS / LEGAL RESEARCH

Build a provider-neutral research layer.

Environment variables:

```env
AI_PROVIDER=
ANTHROPIC_API_KEY=
OPENAI_API_KEY=
GOOGLE_API_KEY=
OPENROUTER_API_KEY=
LOCAL_AI_URL=

WEB_SEARCH_PROVIDER=
WEB_SEARCH_API_KEY=
WEB_FETCH_ENABLED=true
CHEMICAL_RESEARCH_ENABLED=true
LEGAL_RESEARCH_ENABLED=true
LEGAL_OFFICIAL_ONLY_DEFAULT=true
```

Research flow:

`query -> candidate sources -> credibility filter -> fetch -> extract -> compare -> version/source metadata -> temporary evidence -> human/logic review -> project knowledge`

Never let arbitrary web text overwrite verified project data.

---

# 8. HAZOP CORE

Implement:

1. node proposal + approval
2. design-intent editor
3. equipment/chemical/utility linking
4. meaningful parameter-guideword generation
5. causes
6. consequences before safeguard credit
7. existing safeguards
8. initial risk
9. recommendations
10. residual risk with explicit basis
11. row-level evidence/source links
12. human review status

Default matrix may support 5x5, but matrices are configurable.

---

# 9. TEAM MEMBERS + FINAL RECOMMENDATIONS

Mandatory modules:

### Team Members
Name, designation, department, organization, HAZOP role, discipline, experience, attendance, signature placeholder.

### Final Node-Wise Recommendation Register
Automatically aggregate recommendations by node with:

`Rec ID | Node | Equipment | Deviation | Cause | Consequence | Initial Risk | Recommendation | Legal/Standard Basis | Residual Risk | Owner | Target Date | Status | Evidence`

Deduplicate only with technical equivalence and preserve source backlinks.

---

# 10. DATABASE

Implement migrations for at minimum:

- projects
- project_jurisdictions
- project_documents
- document_versions
- document_chunks
- extracted_fields
- field_conflicts
- process_steps
- equipment
- chemicals
- chemical_inventory
- chemical_properties
- chemical_sources
- nodes
- hazop_scenarios
- safeguards
- risk_matrices
- risk_assessments
- recommendations
- recommendation_evidence
- team_members
- assumptions
- data_gaps
- ai_runs
- audit_logs
- report_versions

Legal:

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

Use foreign keys, indexes, timestamps and revision/version fields.

---

# 11. REPORTS

Support:

- DOCX
- PDF
- XLSX HAZOP
- XLSX recommendation register
- XLSX compliance register
- JSON backup

Report must include:

- cover/revision
- scope/methodology
- document register
- legal/regulatory applicability summary
- team members
- risk matrix
- chemical hazard summary
- node worksheets
- node-wise legal relevance where selected
- node-wise recommendation register
- compliance gap register
- assumptions/missing-data register
- source register

Final output must be editable where appropriate.

---

# 12. BUILD EXECUTION — DO THIS IN ORDER

## PHASE 0 — REPO INSPECTION

- inspect current repository
- identify existing stack
- do not replace working architecture unnecessarily
- create `docs/TASKS.md`
- copy master structure into docs if missing

## PHASE 1 — FOUNDATION

- app shell
- auth/RBAC
- DB connection
- migrations
- project CRUD
- Docker Compose
- .env.example

STOP only if a blocking architectural conflict exists.

## PHASE 2 — DOCUMENTS

- upload/storage
- parser abstraction
- source provenance
- extraction jobs
- data review UI
- conflicts/missing-data UI

## PHASE 3 — HAZOP CORE

- nodes
- worksheet
- risk matrix
- deterministic calculation service
- review states

## PHASE 4 — AI

- provider adapters
- JSON schemas
- RAG context builder
- AI action layer/chat

## PHASE 5 — CHEMICAL INTELLIGENCE

- chemical entity resolver
- source registry
- property extraction
- conflicting-property UI
- process-vs-property hazard alerts

## PHASE 6 — LEGAL COMPLIANCE

Build in this exact order:

1. legal tables
2. legal-source registry
3. jurisdiction profile
4. legal instrument CRUD/admin seed
5. obligation CRUD/admin seed
6. deterministic threshold evaluator
7. applicability service
8. compliance register UI
9. permit/consent tracker
10. uploaded-condition extractor
11. per-node legal links
12. legal source citations
13. update-review event model

Do not start automated legal-update crawling until the core register/applicability model works.

## PHASE 7 — RECOMMENDATIONS

- node-wise aggregator
- task ownership
- target dates
- evidence uploads
- close-out workflow

## PHASE 8 — REPORTING

- report templates
- quality gate
- export formats
- revision control

## PHASE 9 — HARDENING

- integration tests
- error handling
- audit trail
- security review
- backups
- performance

---

# 13. TEST STRATEGY

Write tests as features are built.

Mandatory deterministic tests:

- 5x5 risk calculation
- custom matrix
- unit conversion
- chemical inventory threshold comparison
- expiry/renewal calculation
- source precedence
- conflict preservation
- legal-status transition
- recommendation deduplication

Integration tests:

- upload -> extract -> source -> project field
- chemical -> SDS evidence -> property -> hazard alert
- project facts -> legal candidate -> threshold -> applicability -> evidence gap
- node -> HAZOP -> recommendation -> report

Negative tests:

- unknown flash point remains unknown
- conflicting SDS values remain conflict
- missing quantity blocks legal threshold conclusion
- outdated legal version creates review flag
- AI cannot mark compliance verified without evidence
- AI cannot mark recommendation closed without authorized user/evidence workflow

---

# 14. REQUIRED UX

Use an industrial professional interface.

HAZOP table must support:

- spreadsheet-like editing
- sticky headers
- resizable columns
- row expansion
- source/evidence drawer
- risk badges
- legal relevance badge
- filters
- keyboard-friendly edits

Compliance page must support:

- obligations
- evidence
- permits
- legal sources
- updates
- node links
- expiring items

AI chat is right-side persistent panel on project pages.

---

# 15. DO NOT DO THESE

- Do not build only mock screens.
- Do not use LLM for arithmetic that should be deterministic.
- Do not hard-code one client/report.
- Do not assume every law applies.
- Do not label a standard as a law.
- Do not silently use old legal text when a newer official version is known.
- Do not generate unsupported compliance certificates.
- Do not remove provenance to simplify UI.
- Do not create 20 agents/microservices for simple operations.
- Do not leave core paths as TODO.

---

# 16. CLAUDE WORKING STYLE

Before coding a phase:

1. inspect only relevant files
2. state a 3–7 step implementation plan internally / in TASKS.md
3. implement
4. run formatter/lint/typecheck/focused tests
5. fix issues
6. update TASKS.md

At the end of each phase, respond only with:

```text
PHASE: <name>
STATUS: COMPLETE / PARTIAL / BLOCKED

FEATURES COMPLETED
- ...

FILES CREATED/MODIFIED
- ...

DATABASE MIGRATIONS
- ...

TESTS
- command: result

KNOWN LIMITATIONS
- ...

NEXT 3 TASKS
1. ...
2. ...
3. ...

RUN
<exact commands>
```

---

# 17. FIRST EXECUTION NOW

Start now.

1. Inspect the repository.
2. Detect whether this is greenfield or partially built.
3. Create/refresh:
   - `docs/MASTER_STRUCTURE.md`
   - `docs/ARCHITECTURE.md`
   - `docs/DATA_MODEL.md`
   - `docs/LEGAL_COMPLIANCE.md`
   - `docs/HAZOP_ENGINE.md`
   - `docs/CHEMICAL_INTELLIGENCE.md`
   - `docs/REPORT_SCHEMA.md`
   - `docs/TASKS.md`
4. Create the minimal DB schema foundation.
5. Create Docker/dev environment.
6. Build Project CRUD and jurisdiction profile first.
7. Do not attempt all modules in one context window.
8. Continue phase-by-phase until the application is runnable.

When a choice is non-blocking, choose the simplest maintainable option and continue.

