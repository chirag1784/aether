# HAZOP MASTER AI

An industrial HAZOP, chemical-hazard and regulatory-compliance platform.

The controlling specification is [`docs/MASTER_STRUCTURE.md`](docs/MASTER_STRUCTURE.md).
[`docs/TASKS.md`](docs/TASKS.md) is the persistent build state.

## What this is

A working application, in two deployment shapes that share one domain core:

* **Single-page deployment** — `dist/index.html`, published as a private page.
  It carries the whole product: project profile and jurisdiction resolver,
  document register with provenance, data review and conflict engine, process
  and equipment model, chemical property store with process-vs-property alerts,
  node engine, the HAZOP worksheet, the risk engine, the legal compliance
  register with a deterministic threshold engine, permit tracker, node-wise
  recommendation register, team register, the report quality gate and
  DOCX / PDF / XLSX / JSON exports. It needs no server.
* **Server deployment** — `supabase/migrations/` holds the full PostgreSQL
  schema (core + legal, with RLS policies), and `docker-compose.yml` brings up
  Postgres with pgvector. The domain packages are framework-free ES modules, so
  the same `riskFromLS()` the browser calls is the one a route handler calls.

## Layout

```
packages/               the domain core — framework-free, covered by tests
  domain/               status vocabularies, guideword engine, cause families
  calculations/         risk, units, thresholds, dates, dedup, completeness
  chemical/             identity resolution, property schema, hazard alerts
  legal/                seed legal library, threshold engine, applicability
  reports/              report schema and quality gate
app/                    the single-page client
build.mjs               bundles packages + app into dist/index.html
tests/                  node --test over packages/*  (no browser, no DB)
supabase/migrations/    PostgreSQL schema for the server deployment
docs/                   the specification set
```

## Commands

```sh
node build.mjs                 # bundle into dist/index.html
node --test tests/*.test.mjs   # 95 deterministic + negative tests
docker compose up -d           # Postgres + pgvector for the server deployment
psql "$DATABASE_URL" -f supabase/migrations/0001_core.sql
psql "$DATABASE_URL" -f supabase/migrations/0002_legal.sql
```

`build.mjs` asserts two invariants before it emits anything: no two modules
declare the same top-level identifier, and every imported identifier is
declared somewhere in the bundle. A collision fails the build rather than
shadowing a function at runtime.

## The rules the code enforces

These are enforced in code and covered by tests, not stated in prompt text:

1. **Unknown data stays unknown.** A missing rating is never defaulted. A
   missing flash point is a data gap, never a finding of "not flammable".
2. **Deterministic code calculates.** Risk scores, unit conversions, threshold
   comparisons, renewal dates and completeness figures are arithmetic. The
   test suite asserts that no module on that path imports the AI layer.
3. **Conflicts are preserved.** Two sources that disagree after normalization
   produce a conflict card, not an average and not a majority vote. The value
   not chosen is retained.
4. **No invented legal facts.** The seed library ships instrument metadata and
   the locator where the official text lives. It ships **no numeric statutory
   threshold at all**. A threshold figure exists only once a user has read it
   from the official schedule and cited it; until then every obligation that
   turns on quantity sits at `POTENTIALLY_APPLICABLE`.
5. **A standard is not a law.** A standard becomes an obligation only where an
   adoption route is recorded against it.
6. **Residual risk needs a basis.** A reduction requires an explicit technical
   basis, and an administrative or PPE measure can never reduce severity.
7. **The AI layer cannot conclude.** It may draft and explain. It cannot
   confirm applicability, mark compliance verified, close a recommendation,
   approve a report, resolve a conflict, or add a deviation the guideword
   engine did not emit for that node.

## Known limitations

Carried in `docs/TASKS.md` and stated in the app itself:

* Scanned-PDF OCR and P&ID graphical parsing need the server deployment; the
  browser reads text layers only.
* Legal-source retrieval and the update crawler need the server deployment.
  The register works from seeded metadata plus user-supplied official text.
* pgvector RAG is defined in the migrations; retrieval in the single-page
  deployment is structured-context, not embedding-based.

## The worked example

The app ships a worked example seeded from a real calcium-stearate HAZOP study
(Arti Chemical Industries, Vilayat GIDC, Bharuch). Its causes, consequences,
safeguards and recommendations are the study's own. Three things about it are
deliberate and labelled in the app: the source report contradicts itself on the
product and the site, and those contradictions are seeded as real conflicts to
resolve; two rows carry illustrative ratings so the dashboards have something
to show, and every other row is left unrated; and no threshold figure is
seeded, so the legal register demonstrates its own refusal to conclude.
