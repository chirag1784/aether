# Research — filling a gap from outside the app

The controlling constraint is stated once and designed around, not worked
around: **the deployed page cannot make a web request.** The artifact runtime
allows scripts from a handful of CDNs and blocks every other fetch, XHR and
WebSocket before it leaves the frame. That is a good security property for a
page that holds a client's process-safety data, and it is not going to change.

So the app does the part it can do well, and is explicit about the rest.

## What the app does on its own

| Step | Where |
| --- | --- |
| Work out precisely what is missing, per chemical and per company field | `app/research.js` `openGaps()` |
| Rank the gaps by what each one blocks | `packages/research/sources.js` `rankGaps()` |
| Name the authorities that publish that class of fact, in order | `CHEMICAL_AUTHORITIES`, `COMPANY_AUTHORITIES` |
| Build the query and the alternate phrasings | `chemicalQueryPlan()`, `companyQueryPlan()` |
| Judge a returned value: unit, dimension, range, condition, grade | `packages/research/resolve.js` `assessFinding()` |
| Decide between two disagreeing sources, or refuse to | `reconcile()` |
| Write the value with its provenance | `toPropertyRecord()`, `toCompanyFieldRecord()` |

None of that needs the network, and all of it is tested.

## The four routes in

Every route is labelled on the record it produces. `routeAvailability()`
reports which are open in the current view and why the others are not.

1. **CONNECTOR** — a web-search or fetch MCP connector on the viewer's own
   claude.ai account, called through the `mcp` capability with the viewer's
   credentials. The page never sees a token. Produces `WEB_SOURCED` with a
   real URL.

   `DECLARED_SERVERS` in `app/research.js` is the manifest, and it is
   **currently empty**. That is a fact about the deployment, not an oversight:
   a page may only name a connector that exists on the account it was
   published from, a speculative name is refused at publish time, and the
   publishing account has no web-search or fetch connector. So the route
   reports itself unavailable, says why, and points at the paste route.

   Opening it is a one-line change. Add
   `{ server: '<display name exactly as claude.ai shows it>', tools: ['<the tool names it exposes>'] }`
   to `DECLARED_SERVERS`, declare `mcp: { servers: DECLARED_SERVERS }` in the
   artifact's capabilities at publish, and republish. The research drawer and
   Settings read the list from there with no other edit; `listTools()` then
   reports the intersection with what the viewer actually has, so nobody types
   a guess. The page looks for a search-shaped tool on the named connector and
   says plainly when it finds none, rather than calling something at random.
2. **PASTE** — always available, and the route an auditor likes best. The app
   gives the query and the link; the user opens the authority, pastes the
   passage, and the assistant extracts the figure while the citation is the
   URL they pasted from. Produces `WEB_SOURCED`.
3. **SERVER** — the Docker deployment's own configured search provider.
   Produces `WEB_SOURCED`.
4. **RECALL** — the assistant states what it remembers, with no document.
   Produces `AI_INFERRED`, which the alert and threshold engines refuse to use.
   It is offered because a remembered order of magnitude tells an engineer what
   to expect while they find the primary source; it is never a citation.

`attestedStatus()` is the single point that decides which status a class of
evidence may carry, and `MODEL_RECALL` maps to `AI_INFERRED` there. A test
asserts it, so a remembered figure cannot acquire a citation by any path.

## Evidence classes

Eight classes, ranked (`EVIDENCE_CLASSES`). A regulator or statutory register
outranks a supplier SDS for a legal fact; a supplier SDS outranks every
database for a grade-dependent property. Where two sources of equal field
status disagree, `reconcile()` resolves by evidence class if one is clearly
better and returns `CONFLICT` if they tie — and the value not chosen is always
retained, as everywhere else in the app.

## Sourced is not verified

A researched value is `WEB_SOURCED` at best. `VERIFIED` means a named engineer
opened the primary document and signed for the figure, and no amount of
agreement between web sources substitutes for that. `toPropertyRecord()` sets
`verifiedBy: null` and `verifiedAt: null` unconditionally; `researchSummary()`
reports `verifiedCount: 0`; both are asserted by tests.

## Grade dependence

`GRADE_DEPENDENT` lists the properties that are a function of what was actually
purchased rather than of the chemistry: particle size, the dust constants,
density, melting point. For these, a database figure is indicative and the
supplier SDS is the answer, and `assessFinding()` says so in a warning on every
such value. The worked example carries this as a live gap: public sources
confirm calcium stearate is a combustible dust and give an autoignition
temperature, but none of them carries Kst, Pmax or MIE — because those depend
on the particle size this plant produces after grinding.

## Company profile

`COMPANY_FIELDS` is what the platform tracks; `COMPANY_AUTHORITIES` is where
each field is verified, with what each register proves and what it does not.
`COMPANY_FIELD_GATES` marks the fields that gate a legal applicability
question — the worker count, the consented quantity, the named occupier and
manager — and the research queue ranks those above the rest, because filling
one of them resolves something in the compliance register.

The profile is not marketing copy. A stated capacity on a company website is a
marketing figure until the consent confirms it, and the app records which of
the two it is holding.
