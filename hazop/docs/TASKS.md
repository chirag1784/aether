# TASKS — persistent build state

Updated: 2026-09-21

## Phase status

| phase | state | notes |
| --- | --- | --- |
| 0 repo inspection | COMPLETE | existing repo was an unrelated Vite landing site; HAZOP platform added under `hazop/` so neither stack is disturbed |
| 1 foundation | COMPLETE | store abstraction, RBAC mapping, SQL migrations, project CRUD + jurisdiction profile |
| 2 documents | COMPLETE (client-side) | upload + hash + register + text extraction (txt/csv/md/pdf) + AI field extraction with locators + review/conflict UI. Scanned-image OCR needs the server deployment. |
| 3 HAZOP core | COMPLETE | nodes, guideword engine, worksheet grid, risk engine, review states |
| 4 AI | COMPLETE (viewer-account adapter) | structured-output contract, validators, action layer, chat panel, ai_runs log. Server-side provider adapters are stubbed behind `HttpAdapter`. |
| 5 chemical intelligence | COMPLETE | identity resolver, property store with per-field provenance, conflict cards, process-vs-property alerts |
| 6 legal compliance | COMPLETE | seed library, jurisdiction resolver, obligation registry, threshold engine, applicability service, register UI, permit tracker, per-node legal panel, update events |
| 7 recommendations | COMPLETE | node-wise aggregator, dedup with backlinks, ownership, target dates, close-out workflow |
| 8 reporting | COMPLETE | quality gate, DOCX/PDF/XLSX/JSON exports, revision control |
| 9 hardening | PARTIAL | 95 engine unit + negative tests pass; 37 headless browser checks pass against the built bundle; the build asserts three bundle invariants. No CI, and no automated test of the runtime capability paths (db / sample / user / downloads / assets), which only exist in the published page. |

## Verification

```
node --test tests/*.test.mjs   95 pass / 0 fail
node build.mjs                 invariants: no duplicate identifiers,
                               no unresolved imports, bundle compiles
```

A headless Playwright pass over the built bundle (55 checks) covers: every view
renders; the worked example seeds; the seeded source contradictions appear as
conflicts; a residual reduction without a basis is refused; an administrative
basis cannot reduce severity through the UI; the deviation set shows both what
it emitted and what it suppressed; a cited threshold produces the crossing
arithmetic; an uncited figure is refused; the quality gate names its blockers;
approving a blocked report is refused; the report preview renders every
mandated section; the audit trail records the edits; no horizontal overflow at
390px; dark mode paints an explicit background.

Phase 2 added to that pass: the before-and-after matrix draws 25 cells, marks
for both phases and a migration arrow; a row with no residual rating is listed
as not moving with the reason given; an administrative action cannot claim a
reduction recorded against an instrumented function; changing the
practicability cut changes what is credited; a mark opens the row behind it;
the register sequences by practicability and names the actions whose effort is
undeclared; the effort questions default to "not declared"; the research view
ranks the gaps and names the authority, the query and the routes; an uncited
value is refused with a reason; a cited value reads as sourced and never as
verified; the seeded researched values carry their citations on the chemical;
the assistant panel states its authority and says why it is unavailable in a
view without sampling. That script is a development tool and is not committed.

## Phase 2 — research, diagrams, assistant authority, reasoning

| Area | Where | State |
| --- | --- | --- |
| Research source registry, query builders, credibility ranking | `packages/research/sources.js` | done |
| Finding assessment, reconciliation, provenance records | `packages/research/resolve.js` | done |
| Practicability scoring, benefit, ranking, selection, migration plan | `packages/calculations/doability.js` | done |
| Diagram geometry (matrix, slope, bow-tie, node flow, band strip) | `packages/diagrams/geometry.js` | done |
| SVG renderers | `app/diagrams.js` | done |
| Research runtime: four routes, connector bridge, extraction, apply | `app/research.js` | done |
| Research view: gaps, company profile, findings register, routes | `app/views/research.js` | done |
| Before-and-after risk picture | `app/views/risk.js` | done |
| Effort declaration and the practicability strip | `app/views/recommendations.js` | done |
| Assistant tools, autonomy, ledger, undo | `app/ai-tools.js` | done |
| Reasoning passes | `app/reason.js` | done |
| Assistant panel rewrite | `app/views/chat.js` | done |
| Schema for the above | `supabase/migrations/0003_research_doability.sql` | done |
| Tests | `tests/research.test.mjs` (58 of the 158) | done |
| Docs | `docs/RESEARCH.md`, `docs/DIAGRAMS.md`, `docs/ASSISTANT.md` | done |

Two bugs the tests caught before anything shipped, both of which would have
been invisible on screen:

* the migration plan read `result.band` where the risk engine returns
  `bandKey`, so every band count was zero and the "needing action after"
  figure could never fall;
* "why did this row not move" conflated "nobody is acting on it" with
  "somebody is acting on it and nobody has rated the result", which are
  different findings and only the second is a gap in the worksheet.

## Known limitations (carried forward)

1. Scanned-PDF and image OCR, and P&ID graphical parsing, need the server
   deployment — the browser bundle extracts text layers only.
2. Legal-source retrieval and the update crawler need the server deployment;
   the register works from seeded metadata plus user-supplied official text.
3. Seed `legal_thresholds.value` ships `null` with
   `status: REQUIRES_VERIFICATION` by design. Threshold conclusions are blocked
   until a user enters the schedule figure and cites it.
4. pgvector RAG is defined in the migrations but retrieval in the single-page
   deployment is keyword + structured-context, not embedding-based.
5. No SSO; identity comes from the platform's signed-in viewer, mapped onto
   the role matrix in `SECURITY.md` via the page's sharing level.
6. The structured-output path uses `sample.json`, which does not report which
   model tier answered, so a tier fallback is recorded as unknown rather than
   inferred. The chat path does report it.
7. No CI. `npm run check` is the gate, run by hand.
8. The deployed page cannot make a web request: the runtime's content policy
   blocks everything but a few script CDNs. Research therefore runs through a
   viewer's own MCP connector, a paste-back path, or the server deployment —
   see `docs/RESEARCH.md`. A connector must be named in the page manifest at
   publish time, and a manifest may only name connectors that exist on the
   publishing account. The account this was published from has none of the
   web-search kind, so `DECLARED_SERVERS` is empty, the `mcp` capability is not
   declared, and the connector route reports itself unavailable with the reason
   and the remedy. Adding a connector is one line plus a republish.
9. `sample()` with tools is unavailable in some views; the assistant panel says
   so and every deterministic engine is unaffected.
10. A saved practicability cut (`doability_selections`) exists in the schema
   but the single-page deployment recomputes the cut on each visit rather than
   storing it; the mode is held in session state.

## Next 3 tasks

1. Stand up the Docker Compose deployment against the migrations and point
   `store.js` at the PostgreSQL backend. That also turns on the `SERVER`
   research route and the server-side search provider.
2. Server-side legal retrieval: official-source fetcher + hash + version diff,
   feeding `legal_instrument_versions` and `legal_updates`.
3. OCR + P&ID extraction service behind the existing parser abstraction. The
   node-flow diagram already has the geometry it would need.
