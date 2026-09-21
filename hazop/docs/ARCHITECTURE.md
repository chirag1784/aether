# ARCHITECTURE

## 1. Two deployment shapes, one domain core

The controlling specification is `MASTER_STRUCTURE.md`. It targets a Next.js +
PostgreSQL/pgvector stack running under Docker Compose on a private server. That
target is preserved: `supabase/migrations/` holds the full relational schema and
the domain packages are framework-free ES modules.

This repository additionally ships a **runnable single-page deployment** of the
same domain core, so the platform can be used from a link today without a server:

```
packages/*            framework-free ES modules — the domain core
  domain/             status vocabularies, guideword engine, cause/consequence families
  calculations/       risk, units, thresholds, dates, dedup, completeness  (DETERMINISTIC)
  chemical/           property schema, source precedence, process-vs-property alerts
  legal/              seed legal library, threshold matcher, applicability engine
  reports/            report schema assembly, quality gate

app/                  the single-page client (views + store + capability wiring)
build.mjs             concatenates packages + app into dist/index.html
dist/index.html       the published artifact
tests/                node --test suites over packages/*  (no browser, no DB)
supabase/migrations/  PostgreSQL schema for the server deployment
```

Nothing in `packages/` imports a browser or Node API. The same `riskFromLS()`
that the worksheet grid calls in the browser is the one the test suite asserts
and the one a Next.js route handler would call server-side.

## 2. Storage abstraction

`app/store.js` exposes one interface:

```js
store.list(collection, projectId)      // -> array of records
store.put(collection, id, record)      // full replace
store.patch(collection, id, partial)   // merge
store.remove(collection, id)
store.subscribe(collection, handler)   // live updates
```

Two backends implement it:

| backend | used when | persistence |
| --- | --- | --- |
| `ArtifactDbBackend` | `claude.use("db")` resolves | shared, durable, realtime, org-internal |
| `MemoryBackend` | db unavailable (preview, signed-out) | in-page only, clearly flagged in the UI |

A PostgreSQL backend is the third implementation for the server deployment; it
maps one collection to one table and is the only file that needs to change.

## 3. Collection map (single-page deployment)

Reference data (legal instruments, obligations, guideword rules, cause families)
ships **in the bundle**, versioned in git — it is not user data and must not be
editable without provenance. Project data lives in the store:

```
projects           documents          extracted_fields    field_conflicts
equipment          chemicals          chem_properties     process_steps
nodes              scenarios          safeguards          recommendations
team_members       assumptions        data_gaps           sources
compliance         permits            permit_conditions   compliance_tasks
legal_updates      legal_custom       ai_runs             audit
report_versions    risk_matrices
```

Every record carries `projectId`, `createdAt`, `updatedAt`, `rev`, and where the
domain requires it a `status` from the status vocabulary plus `sourceRefs[]`.

## 4. AI architecture

`app/ai.js` implements the provider interface from the build prompt:

```js
interface AiProvider { generateStructured(task) -> AiResult }
```

Adapters:

* `SampleAdapter` — the viewer's own Claude account via the `sample` capability.
  This is the adapter that runs in the published deployment. Task class maps to
  `modelTier`: light -> `quick`, medium -> `default`, strong -> `complex`.
* `HttpAdapter` — a server-side `/api/ai` endpoint for the Docker deployment,
  where the Anthropic / OpenAI / Google / OpenRouter / local adapters live. Keys
  never reach the browser; the browser only ever sees this endpoint.

Every call writes an `ai_runs` record: provider, model tier requested, tier
applied, prompt version, schema version, source IDs given to the model, facts
used, assumptions, missing data, confidence, human_review_required, runtime, and
whether a fallback occurred. AI output is validated against the output contract
before it can touch project data, and a rejected output is repaired once, then
surfaced as a failed run — never silently dropped.

## 5. The deterministic boundary

The LLM may **draft text** and **explain**. It may never:

* perform arithmetic that decides a risk score, a threshold crossing, a unit
  conversion, a renewal date or a completeness percentage;
* set an applicability status;
* mark compliance verified, or a recommendation closed;
* overwrite a `VERIFIED` / `USER_CONFIRMED` value;
* resolve a conflict.

These are enforced in code, not in prompt text: the AI action layer
(`app/ai-actions.js`) accepts a fixed set of action schemas, and each action
runs through the same validators as a human edit.

## 6. Provenance model

An extracted or researched value is never stored as a bare scalar. It is stored
as a `FieldValue`:

```js
{ value, unit, normalizedValue, normalizedUnit, status, confidence,
  sourceRefs: [{ sourceId, documentId, version, page, locator, quote }],
  method, extractedAt, verifiedBy, verifiedAt }
```

Two `FieldValue`s for one field with different normalized values do not merge.
They become a `field_conflicts` record and the field reads `CONFLICT` until a
human resolves it or a project source-precedence rule authorizes a choice.

## 7. Audit

Every mutation appends to `audit`, bucketed one document per project per day to
stay inside the store's document budget:

```js
{ projectId, day, entries: [{ at, actor, actorKind, action, entity, entityId,
                              before, after, aiRunId, sourceRefs }] }
```
