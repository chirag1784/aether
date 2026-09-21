# LEGAL & REGULATORY COMPLIANCE

## 0. The one rule

The system identifies what **may** apply and says why. It does not declare a
facility legally compliant, and it does not invent a statutory threshold, a
licence condition or an obligation. Where the evidence is thin the answer is
`NOT_ENOUGH_DATA` or `REQUIRES_LEGAL_REVIEW`.

## 1. Pipeline

```
project facts + jurisdiction profile
        |
        v
jurisdiction resolver ------> resolved profile (tri-state, nulls preserved)
        |
        v
candidate selection --------> instruments whose domain triggers are touched
        |
        v
obligation evaluation ------> per obligation: applicability logic over facts
        |                     (deterministic predicates, no LLM)
        v
threshold evaluation -------> only where a VERIFIED threshold figure exists
        |                     (deterministic arithmetic + conversion evidence)
        v
evidence comparison --------> evidenceExpected[] vs compliance_evidence
        |
        v
ProjectComplianceRecord ----> applicability status + compliance status + gaps
```

## 2. Applicability statuses

| status | set by | meaning |
| --- | --- | --- |
| `APPLICABLE_CONFIRMED` | authorized human, or a verified threshold crossing with all facts verified | the obligation applies |
| `POTENTIALLY_APPLICABLE` | engine | the triggers are touched but a fact or threshold is unverified |
| `NOT_APPLICABLE_CONFIRMED` | authorized human, or a deterministic exclusion on verified facts | does not apply, with the reason recorded |
| `NOT_ENOUGH_DATA` | engine | a trigger fact is `null`/`MISSING` |
| `REQUIRES_LEGAL_REVIEW` | engine or human | the logic is not reducible to project facts |

The engine may never write `APPLICABLE_CONFIRMED` or
`NOT_APPLICABLE_CONFIRMED` on `AI_INFERRED` or `WEB_SOURCED` facts alone.
`legalStatusTransition()` enforces the allowed moves and records who moved it.

## 3. Compliance statuses

`COMPLIANT_EVIDENCE_VERIFIED`, `PARTIALLY_EVIDENCED`, `EVIDENCE_MISSING`,
`POTENTIAL_GAP`, `NOT_APPLICABLE`, `UNDER_REVIEW`, `EXPIRED`, `RENEWAL_DUE`.

`COMPLIANT_EVIDENCE_VERIFIED` requires (a) at least one evidence record for
every `evidenceExpected` item, (b) each evidence record `VERIFIED` by a user
with the reviewer or admin role, and (c) no linked permit past expiry. The AI
action layer has no path to this status at all.

## 4. Threshold engine

`packages/legal/thresholds.js`, deterministic:

```js
evaluateThreshold({ inventoryQty, inventoryUnit, density, threshold })
 -> { status, comparison, normalized: {qty, unit}, conversion: [...], evidence }
```

* Converts through `packages/calculations/units.js`, recording every conversion
  step (factor, from, to) as evidence. A volume-to-mass conversion **requires** a
  density with a usable status; without it the result is
  `NOT_ENOUGH_DATA`, never an assumed 1 kg/L.
* Returns `THRESHOLD_NOT_VERIFIED` when the schedule figure has not been entered
  and cited. This is the shipped state of the whole seed library.
* Returns `EXCEEDS`, `AT_OR_ABOVE`, `APPROACHING` (>= 80 % of the figure) or
  `BELOW`, each with the arithmetic shown.
* `identityUncertain` (ambiguous chemical or invalid CAS) forces
  `REQUIRES_HUMAN_CONFIRMATION` regardless of the arithmetic.

No LLM arithmetic touches this path. `assertNoLlmArithmetic` in the test suite
asserts that the applicability and threshold modules import nothing from the AI
layer.

## 5. Seed legal library

`packages/legal/library.js`. Every entry is **metadata**: title, instrument
type, jurisdiction, authority, official source root, the schedule/section
locator where the obligation lives, and `sourceStatus`.

`sourceStatus` values:

* `METADATA_SEEDED_UNVERIFIED` — shipped state. The instrument exists and the
  locator is where to look; the text has not been retrieved in this deployment.
* `OFFICIAL_TEXT_RETRIEVED` — the official document was fetched and hashed.
* `USER_SUPPLIED_OFFICIAL` — the user uploaded the official document.
* `SUPERSEDED` — a newer official version is known.

Domains seeded (India, with Gujarat state layer), each with
`triggers` that must be true of the project before the instrument becomes a
candidate — nothing is marked applicable by default:

* Occupational safety / factory / hazardous process — OSHWC Code 2020 and the
  Central/State rules question, which the resolver must answer per establishment.
* Hazardous chemicals / MAH — Environment (Protection) Act 1986; MSIHC Rules
  1989 as amended; Chemical Accidents (EPPR) Rules 1996.
* Environment / waste — Water Act 1974; Air Act 1981; Hazardous and Other Wastes
  Rules 2016 as amended; EIA Notification 2006 as amended where the activity is
  scheduled.
* Public liability — Public Liability Insurance Act 1991.
* PESO / flammables / compressed gas / pressure vessels — Petroleum Rules 2002;
  Gas Cylinders Rules 2016; SMPV(U) Rules 2016; Explosives Rules 2008;
  Ammonium Nitrate Rules 2012; Calcium Carbide Rules — each behind a project
  trigger.
* Fire / building / local authority — state fire legislation, fire NOC,
  NBC provisions **as guidance unless adopted**, industrial-estate requirements.
* Electrical — Electricity Act / CEA safety regulations, hazardous-area
  requirements, electrical inspector approval.
* Boiler / pressure equipment — boiler legislation / IBR where in scope.
* Conditional — dangerous-goods transport, waste manifests, chemical import,
  groundwater permission, tank-farm approvals, district emergency conditions.

Each entry distinguishes `law | rule | notification | licence_condition |
consent_condition | ec_condition | standard | guideline | company_requirement`.
A standard is mandatory only when incorporated by law, licence, consent,
contract or a competent-authority condition — recorded as
`mandatoryVia: [...]`, empty by default.

Official source hierarchy used for retrieval and for resolving disagreement:

`Gazette / India Code -> Ministry or regulator -> State official source ->
user-uploaded licence/consent -> official guidance -> standard -> secondary`

A secondary source can never overwrite an official one; the test suite asserts
this.

## 6. Permits, conditions, tasks

`permits` tracks type, authority, number, issue/effective/expiry dates, status,
approved capacity, chemicals and equipment covered, key conditions and the
uploaded source. `expiryStatus()` is deterministic date arithmetic with a
configurable notice window (default 90 days) and returns
`VALID | RENEWAL_DUE | EXPIRING_SOON | EXPIRED | NO_EXPIRY | UNKNOWN`.

An `EXPIRED` permit forces every compliance record that depends on it to
`EXPIRED`, whatever its evidence says. Covered by a negative test.

`permit_conditions` are extracted from an uploaded licence/consent/EC with the
condition text preserved verbatim plus a clearly separated, labelled analysis.
Recurring conditions (monitoring, returns, inspections) generate
`compliance_tasks` with due dates computed from the condition's frequency.

## 7. Per-node legal panel

Every node has a `LEGAL / STATUTORY RELEVANCE` tab showing the obligations
linked to that node, the statutory safeguard/inspection/approval conditions, the
uploaded licence or consent conditions that name that equipment or chemical,
missing evidence, linked recommendations and source links.

Links are created by: a threshold crossing on a chemical in the node; an
equipment class trigger (pressure vessel, boiler, storage tank); a condition
extracted from a permit that names the node's equipment tag or chemical; or a
manual link. The system does not force a citation onto every worksheet row.

## 8. Update monitor

`legal_updates` records `{ instrumentId, oldVersion, newVersion, detectedAt,
changeDate, affectedProjects[], sectionsToReview[], status }`. Detection creates
a `REVIEW_REQUIRED` event and nothing else — no project conclusion changes
automatically, and the prior conclusion keeps the legal source version it was
made against. Automated crawling stays disabled
(`LEGAL_UPDATE_CHECK_ENABLED=false`) until the register and applicability model
are in production use.
