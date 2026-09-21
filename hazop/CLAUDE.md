# CLAUDE.md — working rules for this project

The controlling specification is `docs/MASTER_STRUCTURE.md`. `docs/TASKS.md` is
the persistent build state — read it before starting, update it at the end of a
phase, and use it instead of re-reading the repository.

## Architecture in one paragraph

`packages/**` is the domain core: framework-free ES modules with no browser or
Node API, covered by `tests/`. `app/**` is the single-page client. `build.mjs`
concatenates both into `dist/index.html`. `supabase/migrations/` is the
PostgreSQL schema for the server deployment. The same functions run in all
three places.

## Rules that are not negotiable

These are enforced in code and asserted by tests. Do not weaken one to make a
feature easier.

1. **Deterministic code calculates; the model drafts and explains.** Risk
   scores, unit conversions, threshold comparisons, renewal dates and
   completeness figures are arithmetic in `packages/calculations/` and
   `packages/legal/thresholds.js`. `tests/deterministic.test.mjs` asserts that
   no module under `packages/` imports the AI layer. If you need a number,
   write the function.
2. **Unknown stays unknown.** Never default a missing value. `riskFromLS()`
   with a missing rating returns `{ok: false, reason: 'MISSING_INPUT'}`, not 1.
   A missing property is a data gap, never an absence of hazard.
3. **Never invent a legal fact.** The seed library in
   `packages/legal/library.js` carries instrument metadata and the schedule
   locator. It carries no numeric statutory threshold, and a test asserts that.
   A figure enters the system only when a user reads it from the official text
   and cites it.
4. **Conflicts are preserved.** `sourcePrecedence()` returns `CONFLICT` rather
   than picking. The value not chosen is retained, never deleted.
5. **A standard is not a law.** `standardIsMandatory()` returns false until an
   adoption route is recorded.
6. **The AI layer has no path to a conclusion.** It cannot set a confirmed
   applicability status, mark compliance verified, close a recommendation,
   approve a report, or add a deviation the guideword engine did not emit. The
   guards are in `packages/domain/status.js` and are covered by tests.
7. **Every mutation is audited and every value carries provenance.** Use
   `store.create/update/remove`, which handle ids, timestamps, revisions and
   the audit bucket. Do not write to a backend directly from a view.

## Conventions

* **Rendering**: vanilla DOM through `h()` in `app/util.js`. Every value from
  the store or the model is rendered with `textContent`. There is no
  `innerHTML` path for data anywhere, and there must not be one.
* **State**: `app/state.js` holds `S` and the selectors. Derived values are
  pure functions recomputed on render and memoized per render, so they cannot
  drift from the store. Add a selector there rather than computing in a view.
* **New collection**: add it to `COLLECTIONS` in `app/store.js`, or it will not
  be subscribed and the view will silently show nothing.
* **New module**: add it to `MODULES` in `build.mjs` in dependency order. The
  build fails on a duplicate top-level identifier — rename the local helper, or
  hoist it into the package where it belongs.
* **Capabilities**: every runtime capability is optional. Branch on absence and
  say in the UI what is unavailable and what still works. Never let a missing
  capability break a page.
* **Copy**: write from the user's side of the screen. Name the engineering
  thing, not the system thing. An error says what went wrong and what to do.

## Before you commit

```sh
node --test tests/*.test.mjs   # must be 95/95 or better
node build.mjs                 # must pass both bundler invariants
```

Then update `docs/TASKS.md`. A phase is done only when the feature works, the
migration exists if one is needed, validation is in place, tests pass, error
states are handled, provenance is preserved, the docs are updated and there is
no TODO left on the feature path.
