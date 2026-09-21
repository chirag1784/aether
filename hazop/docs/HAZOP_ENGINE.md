# HAZOP ENGINE

## 1. Node proposal

Nodes are proposed from whatever process structure exists: process steps
extracted from a BMR/SOP, equipment with connections from a PFD/P&ID, or manual
entry. The proposer is a *draft generator* — every proposed node arrives with
`reviewStatus: "PROPOSED"` and cannot be worksheeted until a human approves it.

Node operations: approve, edit, split, merge, reorder, delete, add manually.
Split and merge preserve scenario backlinks; a merged node inherits both
document reference sets and both assumption lists, and the merge is audited.

## 2. Guideword / parameter engine

`packages/domain/guidewords.js` produces **only meaningful combinations**. It is
a deterministic rule table, not a cross-product: a 11 x 22 cross-product would
generate 242 rows per node, most of them nonsense, which is how HAZOP
worksheets become unreviewable.

A combination is emitted when:

1. the parameter is *present in the node* — derived from the node's equipment,
   utilities, chemicals and operating parameters, not assumed; and
2. the guideword has a defined semantic for that parameter
   (`REVERSE level` has none; `REVERSE flow` does); and
3. the node's facts do not make it vacuous (`agitation` only where the node has
   an agitator; `inerting` only where a node declares an inert utility;
   `static charge` only where a powder or a low-conductivity liquid transfer
   exists).

Each emitted combination carries `rationale` — the node facts that justified it
— so a reviewer can see why the row is on the sheet, and `deviation`, the
phrase the worksheet shows (`MORE temperature`, `NO agitation`).

Parameters that exist in the source study but are not guideword-driven
(start-up, shutdown, emergency shutdown, quality, exposure, leakage) are emitted
as *operational deviations* with guideword `OTHER THAN`, matching the practice in
the reference study.

## 3. Cause and consequence families

`packages/domain/causes.js` holds the cause families (§12.1) and consequence
families (§12.2) as a picklist with free text. The families exist so that:

* a node cannot quietly omit utility failure or human error;
* the completeness check can report which families a node has not considered;
* consequence categories map to severity dimensions (people / fire-explosion /
  environment / business) and the risk engine records **which dimension** drove
  the severity rating.

Consequences are recorded **before** safeguard credit. The data model keeps
`consequences[]` and `existingSafeguards[]` in separate fields and the UI
records them in that order; the worksheet will not accept a consequence whose
text is a safeguard statement pattern (`"...prevented by..."`) without a warning.

## 4. Risk engine

`packages/calculations/risk.js`.

```js
riskFromLS(matrix, likelihood, severity)
  -> { score, band, bandLabel, matrixId, matrixVersion, cells }
```

* A matrix is `{ id, version, likelihoodScale[], severityScale[], combine, bands[] }`.
* `combine` is `"product"` or `"lookup"`. `"lookup"` uses an explicit cell table,
  for companies whose matrix is not multiplicative.
* Default matrix `IEC-5x5-v1`: L 1..5, S 1..5, product, bands
  1-2 Trivial, 3-4 Tolerable, 5-9 Moderate, 10-16 Substantial, 20-25 Intolerable.
* Out-of-scale inputs throw. A missing input returns
  `{ band: null, reason: "MISSING_INPUT" }` — it never defaults to 1.

`validateResidual(initial, residual, basis)` returns `{ ok, reason }`. It rejects:

* a residual score below the initial score with no basis;
* a basis whose `kind` is not in the allowed set;
* a residual severity below initial severity where the basis kind is
  `ADMINISTRATIVE` or PPE-only — administrative controls do not change the
  consequence of a release, only its likelihood. This is a hard rule and is
  covered by a test.

`tolerability(matrix, band)` returns the project's action requirement for a band
(`ACTION_MANDATORY`, `ACTION_REQUIRED`, `ALARP_REVIEW`, `MONITOR`, `ACCEPT`).
The ALARP narrative is only offered where the project methodology enables it.

## 5. Review states

```
scenario.reviewerStatus: DRAFT -> TEAM_REVIEWED -> FACILITATOR_ACCEPTED -> CLOSED_OUT
node.reviewStatus:       PROPOSED -> APPROVED -> WORKSHEETED -> COMPLETE
```

Transitions are one-way except an explicit reopen, which is audited and resets
downstream states. An AI action may move a scenario to `DRAFT` only.

## 6. Completeness

`packages/calculations/completeness.js` computes two separate figures, never one
blended score:

* `dataCompleteness` — proportion of the project profile fields that have any
  non-`MISSING` status;
* `criticalCompleteness` — the same over the critical subset only (chemicals
  with quantity and state, design pressure/temperature for pressure equipment,
  relief arrangement, jurisdiction resolution fields, matrix selected).

Both return the list of what is missing, because the percentage alone is not
actionable.
