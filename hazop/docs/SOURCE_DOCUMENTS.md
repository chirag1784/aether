# Source documents

The worked example in `app/seed.js` was built from a client HAZOP study report
supplied with the build request:

* **HAZOP Study Report — Calcium Stearate**, Arti Chemical Industries,
  Plot E-21, Vilayat GIDC Estate, Ta. Vagra, Dist. Bharuch, Gujarat.
  Prepared by Technodraft Technical Service Pvt. Ltd., Ankleshwar.
  Document reference 0201-SOP-ES-00052-05, 19 pages.

**The document itself is not in this repository, and neither is a full text
extract of it.** It is a client's confidential process-safety document, and
`docs/SECURITY.md` says uploaded documents are treated as confidential by
default — committing a dump of one would contradict that on the first page of
the project's own history.

What `app/seed.js` does carry is short verbatim quotations, each attached to the
value it supports as a `sourceRefs` entry with its page number. That is the
provenance the product is built to preserve, and it is the minimum needed for
the example to demonstrate the source chain end to end.

To work with the full document, register it on the Documents page of a project.
Its text then lives in that project's store, under that project's
confidentiality setting, and not in version control.

## What the example reproduces

* Node 1 — charging of stearic acid (450 kg), melting at 90 °C, charging of
  calcium hydroxide (72 kg) and catalyst (10 kg), 10-minute reaction, sampling,
  transfer to the blender. Equipment: plough shear mixer.
* Node 2 — cooling in the blender to 50–55 °C, grinding in grinder SEM-30,
  screening through the vibro shifter, packing. Equipment: cooling tower
  (80 TR), blender (2.5 kL), grinder (250 kg/h), vibro shifter.
* The causes, consequences, existing safeguards and recommendations recorded
  against each deviation, in the study's own words.
* The study exclusions, verbatim, as assumption records.
* The methodology reference the study cites: IS 16957:2018 / IEC 61882:2016.
* The team member legible in the report, with a data gap recorded for the rest
  of the attendance sheet.

## The contradictions the example preserves

The source report is internally inconsistent, and the example keeps that rather
than tidying it away, because resolving it is what the conflict engine is for:

| Field | The report says | And also says |
| --- | --- | --- |
| Product / subject | Calcium stearate (cover) | Amidoxime Core (scope of work); Adenine, Stage 1 to 3 (study scope) |
| Site | Plot E-21, Vilayat GIDC Estate, Bharuch (cover) | "at its plant located at Dahej" (introduction) |

Both are seeded as open `field_conflicts` on critical fields, which is why the
example opens with the report quality gate blocked.

The degree symbol is lost in the source text ("heating up to 900C", "500C to
550C"). The example reads these as 90 °C and 50–55 °C and records an assumption
saying so, with the original string kept as the extracted value's raw text.
