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

A headless Playwright pass over the built bundle (37 checks) covers: every view
renders; the worked example seeds; the seeded source contradictions appear as
conflicts; a residual reduction without a basis is refused; an administrative
basis cannot reduce severity through the UI; the deviation set shows both what
it emitted and what it suppressed; a cited threshold produces the crossing
arithmetic; an uncited figure is refused; the quality gate names its blockers;
approving a blocked report is refused; the report preview renders every
mandated section; the audit trail records the edits; no horizontal overflow at
390px; dark mode paints an explicit background. That script is a development
tool and is not committed.

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

## Next 3 tasks

1. Stand up the Docker Compose deployment against the migrations and point
   `store.js` at the PostgreSQL backend.
2. Server-side legal retrieval: official-source fetcher + hash + version diff,
   feeding `legal_instrument_versions` and `legal_updates`.
3. OCR + P&ID extraction service behind the existing parser abstraction.
