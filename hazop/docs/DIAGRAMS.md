# Diagrams — the before-and-after risk picture

## Why the split

`packages/diagrams/geometry.js` computes coordinates and returns plain data.
`app/diagrams.js` turns coordinates into SVG elements and attaches the
interaction. Nothing else draws.

The reason is testability. A risk matrix plot that is wrong by one row is not
visible in a screenshot review but is caught by
`assert.ok(cellAt(layout, 1, 5).y < cellAt(layout, 1, 1).y)`. The same layout
then serves the screen and the printed report, so the picture in the PDF cannot
drift from the picture on the page.

## Colour

Diagrams carry no palette of their own. A band is filled with
`var(--risk-<band>)`, the same token that colours its badge and its table cell.
A diagram with its own colours would be a second, contradictory answer to "how
bad is this".

## The honesty rules in the picture

Two rules hold the before-and-after matrix together, and both are enforced in
`packages/calculations/doability.js` rather than in the drawing:

1. **A scenario moves only where a residual rating has been recorded.** The app
   never assumes a recommendation works. A row with a selected action and no
   residual rating is drawn where it started, and listed underneath with the
   reason. That absence is a gap in the worksheet, and the picture says so.
2. **Only a measure of the recorded basis kind may claim the reduction.**
   `basisCredit()` checks the recommendation's hierarchy-of-control level
   against the scenario's `residualBasisKind`. A reduction justified by an
   instrumented function is not delivered by writing a procedure, so an
   administrative action cannot be credited with it — even though both address
   the same row. A recommendation with no control level recorded satisfies
   nothing but an administrative basis: unclassified is not a synonym for
   adequate.

A third rule governs which work is in the picture at all: a recommendation
whose effort is undeclared is left out of the ranking rather than assumed
cheap, because a priority order built on a guess is worse than none.

## The diagrams

| Function | What it answers |
| --- | --- |
| `matrixLayout` + `plotMigration` | Where every rated scenario sits, where it would sit, and which moved |
| `bandSlopeLayout` | How many scenarios leave each band, with the delta |
| `stackedBandBar` | The distribution strip for cards and headers |
| `bowTieLayout` | Causes → preventive barriers → top event → mitigating barriers → consequences, for one row |
| `nodeFlowLayout` | The node's process steps in order, with their scenario load |

Marks are spread on a deterministic ring within their cell (`jitter()`, seeded
from the cell key), so a stack of eight scenarios reads as eight marks and
lands in the same place on every render — which matters when the picture is in
a report. A rating off the matrix scale is reported in `skipped`, never
clamped. An empty barrier column in a bow-tie is drawn as an empty column and
labelled, because that absence is the finding.

Each diagram caps its own width: a risk matrix blown up to fill a wide card is
harder to read, not easier.
