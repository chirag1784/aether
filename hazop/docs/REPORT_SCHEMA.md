# REPORT SCHEMA

## 1. Section order

Fixed order (§23 of MASTER_STRUCTURE). Sections marked *conditional* are
omitted when empty rather than printed as "None".

1. Cover — project, client, site, product, process, revision, dates, preparer
2. Revision history
3. Caution and limitations — always printed, never editable away
4. Introduction
5. Scope of work
6. Process description
7. Documents reviewed (document register with hashes and versions)
8. HAZOP methodology
9. Reference standards and guidance (labelled as guidance, not law)
10. Legal / regulatory applicability summary
11. Study exclusions and assumptions
12. HAZOP team members and attendance
13. Risk matrix used (with id and version)
14. Chemical hazard summary
15. Process / PFD / P&ID reference
16. Node list
17. Node worksheets
18. Node-wise legal relevance *(conditional annexure)*
19. Final node-wise recommendation register
20. Master recommendation / action register
21. Compliance-gap register
22. Missing-data register
23. Final conclusions
24. Source register (grouped by source label)
25. Annexures

## 2. Caution block

Every export carries, verbatim and non-removable:

> This report records the findings of a HAZOP team workshop supported by
> automated analysis. It is not a statutory certification, a design approval or
> a legal opinion. Applicability statuses marked POTENTIALLY_APPLICABLE,
> NOT_ENOUGH_DATA or REQUIRES_LEGAL_REVIEW are unresolved questions, not
> findings of compliance or non-compliance. Values labelled AI_INFERRED are
> model inferences that a competent person must verify. Residual risk ratings
> assume the recommendations are implemented as described.

## 3. Quality gate

`packages/reports/quality-gate.js` returns
`{ status, checks: [{ id, label, severity, pass, detail, fixHint }] }`.

`severity` is `BLOCKING` or `ADVISORY`. A `DRAFT` export is always permitted,
whatever the gate says, and is watermarked. `REVIEWED` and `APPROVED` require
every `BLOCKING` check to pass **and** an authorized human action — the gate
never approves anything by itself.

Blocking checks: project identity present; jurisdiction resolved (no `null` in
the resolver's required set); risk matrix selected; every node approved; every
worksheeted node has at least one scenario; every scenario has causes,
consequences and initial risk; every scenario in the top two risk bands has
either a recommendation or a recorded acceptance rationale; every residual
reduction has a valid basis; recommendations numbered and owned; team members
recorded with roles; no `CONFLICT` field left unresolved on a critical field;
compliance records have no `UNDER_REVIEW` with a past due date; source register
non-empty.

Advisory checks: SDS status complete for every chemical; every cause family
considered per node; threshold figures verified where an instrument is
`POTENTIALLY_APPLICABLE` on quantity grounds; permits within notice window
acknowledged; assumptions register non-empty.

## 4. Export formats

| format | contents | mechanism |
| --- | --- | --- |
| DOCX | full report, editable | OOXML written directly (JSZip); real Word styles, tables and headings |
| PDF | full report, fixed | print stylesheet over the report view; page breaks per node |
| XLSX HAZOP | one sheet per node plus a combined sheet | SheetJS |
| XLSX recommendation register | node-wise register, one row per recommendation | SheetJS |
| XLSX compliance register | the §17.9 columns | SheetJS |
| JSON | complete project backup incl. provenance, audit and engine versions | native |

The JSON backup is the restore path and carries `schemaVersion` plus every
engine version used, so a restored project recomputes identically.

## 5. Node worksheet layout

Landscape, one table per node, header repeated on each page:

`# | Parameter | Guideword | Deviation | Causes | Consequences | Existing safeguards | L | S | Risk | Recommendations | L | S | Residual | Basis | Status`

Risk cells print the band label and the score, never colour alone, so the
document is readable in monochrome and by colour-blind reviewers.

## 6. Recommendation register layout

Grouped `NODE 01 -> NODE 02 -> ...` with columns:

`Rec ID | Node | Equipment | Deviation | Cause | Consequence | Initial Risk |
Recommendation | Legal/Standard Basis | Expected Residual Risk | Priority |
Responsible Dept | Responsible Person | Target Date | Status | Close-out Evidence`

Deduplicated recommendations print once and list every originating scenario in a
`Raised from` line beneath the row.
