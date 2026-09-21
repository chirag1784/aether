# DATA MODEL

Authoritative relational definition: `../supabase/migrations/`.
This document explains the parts that carry engineering meaning.

## 1. Status vocabulary

Applies to every extracted, researched or inferred field.

| status | meaning | may be used in a conclusion? |
| --- | --- | --- |
| `VERIFIED` | checked against a controlling source by an authorized user | yes |
| `USER_CONFIRMED` | a user asserted it; no document backing | yes, recorded as assumption |
| `DOCUMENT_EXTRACTED` | pulled from an uploaded document with a locator | yes, pending review |
| `WEB_SOURCED` | retrieved from an external source with URL + retrieval date | yes, pending review |
| `AI_INFERRED` | model inference from other project facts | never alone |
| `CONFLICT` | two or more sources disagree after normalization | blocks conclusions |
| `MISSING` | no value | blocks conclusions |
| `NOT_APPLICABLE` | explicitly not relevant, with a reason | n/a |

Precedence used by `sourcePrecedence()` when a project enables automatic
resolution (off by default):

`VERIFIED > USER_CONFIRMED > DOCUMENT_EXTRACTED > WEB_SOURCED > AI_INFERRED`

Equal-rank disagreement never resolves automatically.

## 2. Projects and jurisdiction

`projects` holds identity (§4.1 of MASTER_STRUCTURE) plus embedded
`jurisdiction` (§4.2) because the jurisdiction profile is 1:1 with a project and
is read on nearly every legal evaluation. It is versioned with the project's
`rev` and every change is audited, because changing `hazardousProcess` or
`mahCandidate` changes legal applicability.

Jurisdiction fields that drive the applicability engine:

```
country state district localAuthority industrialEstate
appropriateGovernment establishmentCategory processCategory
hazardousProcess mahCandidate workerCount
environmentalCategory consentAuthority
pesoRelevant boilerInScope electricalInspectorate fireAuthority
petroleumClassPresent compressedGasPresent pressureVesselPresent
explosivesRelevant ammoniumNitrateRelevant calciumCarbideRelevant
groundwaterAbstraction hazardousWasteGenerated
```

Every one of these is a tri-state: `true | false | null`. `null` means *not
resolved*, and the applicability engine returns `NOT_ENOUGH_DATA` rather than
guessing. This is the single most important modelling decision in the schema.

## 3. Documents and provenance

```
documents        one logical document (hash, class, uploader, asset id)
  document_versions   each upload of that document (hash, supersedes)
extracted_fields one (entity, field) value with locator + status + confidence
field_conflicts  a set of extracted_fields for one target that disagree
sources          the citation register: every source the project relies on
```

`sources.sourceType` is the label set from §19 of MASTER_STRUCTURE
(`STATUTE`, `RULE`, `NOTIFICATION`, `GAZETTE`, `REGULATOR_GUIDANCE`,
`LICENCE_CONDITION`, `CONSENT_CONDITION`, `EC_CONDITION`, `STANDARD`,
`COMPANY_STANDARD`, `SDS`, `MANUFACTURER_DATA`, `SCIENTIFIC_SOURCE`,
`PROJECT_DOCUMENT`, `AI_INFERENCE`). The report generator groups the source
register by this label so a guidance note can never be read as a statutory duty.

## 4. Chemicals

`chemicals` is the project inventory row (quantity, concentration, state,
process and storage conditions). `chem_properties` is one row per
(chemical, property), each with its own status and source — so a chemical can
have a `VERIFIED` flash point and a `CONFLICT` autoignition temperature at the
same time. Property keys are fixed in `packages/chemical/properties.js`
(§7.2 of MASTER_STRUCTURE) so that alerts can rely on them.

## 5. HAZOP core

```
nodes         node_number, worksheetName, description, designIntent, boundaries,
              documentRefs[], equipmentIds[], lineIds[], chemicalIds[], utilities[],
              operatingParams, designParams, instruments, alarms, trips, reliefs,
              assumptions[], missingData[], reviewStatus
scenarios     one worksheet row: parameter, guideword, deviation, causes[],
              consequences[], existingSafeguards[], initial L/S, initialRisk,
              riskBasis, recommendationIds[], residual L/S, residualRisk,
              residualRiskBasis, legalRelevance[], standardsRelevance[],
              assumptions[], evidenceRefs[], reviewerStatus
```

`initialRisk` and `residualRisk` are **derived columns**. They are written only
by `riskFromLS()` and carry the `matrixId` and `matrixVersion` that produced
them. A stored risk whose `matrixVersion` differs from the project's current
matrix is displayed as stale and must be recomputed, never silently reinterpreted.

`residualRisk < initialRisk` requires `residualRiskBasis.kind` to be one of
`ENGINEERING_CONTROL | ELIMINATION | SUBSTITUTION | ADMINISTRATIVE | INSTRUMENTED_FUNCTION`
plus free text. `validateResidual()` rejects a reduction without it. A
recommendation merely existing is not a basis.

## 6. Recommendations

One recommendation belongs to one scenario but may be linked to many
(`recommendation_links`) after deduplication. Deduplication never deletes: the
surviving recommendation accumulates `mergedFrom[]` and every original scenario
keeps a backlink, so the node-wise register can still show which deviations
produced the action.

## 7. Legal / compliance

Reference side (shipped in the bundle, versioned in git):

```
legal_instruments          title, type, jurisdiction, authority, official source URL,
                           effective_from, amendmentStatus, sourceStatus, lastVerifiedAt
legal_instrument_versions  a retrieved snapshot: hash, retrievedAt, url
legal_obligations          section/rule/schedule, topic, summary, applicabilityLogic,
                           thresholdRef, frequency, authority, evidenceExpected[],
                           affected process/chemical/equipment classes, legalReviewRequired
legal_thresholds           schedule entry: chemical identity, quantity, unit, basis,
                           value (null until verified), sourceLocator, status
```

Project side (in the store):

```
compliance          one ProjectComplianceRecord per (project, obligation)
permits             licence/consent/approval with issue/expiry/renewal + capacity
permit_conditions   extracted conditions, categorized, with due dates
compliance_tasks    recurring returns, monitoring, inspections
compliance_evidence uploaded proof, linked to obligation and/or permit
legal_updates       a detected source change -> REVIEW_REQUIRED event
legal_node_links    obligation <-> node / scenario / recommendation
```

`legal_thresholds.value` ships as `null` with
`status: "REQUIRES_VERIFICATION"`. The seed library carries the *instrument*,
the *schedule locator* and the *official source URL* — never a numeric legal
threshold invented by the model. A threshold becomes usable only when a user
enters the figure and cites the schedule; the engine then computes the crossing
deterministically and records the conversion evidence.

## 8. Derived vs stored

Stored: everything a human entered or a source supplied, plus derived values
that must be auditable (risk scores, threshold evaluations, applicability
decisions) together with the engine version that produced them.

Derived at read time: dashboard counts, completeness percentages, the node-wise
recommendation register, the compliance register view, the quality gate result.
These are pure functions of stored data, so they cannot drift.
