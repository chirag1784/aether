# PRAMĀṆA — Compliance Traceability Matrix

Every feature in this codebase traces to a specific legal or regulatory driver.
This document is the source of truth for that mapping. If a feature exists in
code but is not listed here, that is a bug in this document — file an issue.

**Status legend:** ✅ Implemented in v0.1 · 🟡 Partial / stubbed · ⬜ Not started (documented, requires a vendor decision or backend not yet built)

---

## 1. Bharatiya Sakshya Adhiniyam, 2023 — Section 63

| # | Requirement | App implementation | Code location | Status |
|---|---|---|---|---|
| 63(1) | Electronic record deemed a document if conditions met | Every capture produces a self-describing Evidence Envelope | `envelope/EvidenceEnvelope.kt` | ✅ |
| 63(2) | Device in regular use, working properly, information fed in ordinary course | Device-health telemetry snapshot at capture time; continuous integrity checks during a session | `capture/metadata/DeviceInfoProvider.kt`, `capture/metadata/MetadataHarvester.kt` | ✅ |
| 63(4) | Certificate accompanies the record at each instance of submission | Fresh Part A certificate generated per export, hashing the exact bytes being submitted | `certificate/CertificateService.kt` | 🟡 PDF layout + real hashes implemented; PAdES-LTV digital signing of the PDF itself requires a licensed DSC/eSign ASP — not wired up |
| Schedule Part A | Filled by the party producing the record: device particulars, hash value, algorithm | Auto-populated from `DeviceInfoProvider` + `HashEngine` | `certificate/CertificateService.kt` | ✅ content, 🟡 signature |
| Schedule Part B | Filled by an independent expert — app must never auto-sign | `certificate/ExpertPackBuilder.kt` emits a machine-readable pack with a blank signature block | `certificate/ExpertPackBuilder.kt` | 🟡 pack structure implemented; empanelled-expert workflow (Section 8.2) is a business process, not a code deliverable, and is out of scope for v0.1 |
| Hash algorithm disclosure | SHA-256 primary; also SHA-512 and MD5 for legacy familiarity | `crypto/HashEngine.kt` computes all three (+ BLAKE3 placeholder) over final sealed bytes | `crypto/HashEngine.kt` | ✅ SHA-256/512/MD5 · ⬜ BLAKE3 (needs native lib, deferred) |
| Certificate generated at export time, not capture time | `CertificateService.generatePartA()` is only invocable from the Export screen, hashes the bundle bytes at call time | `ui/export/ExportScreen.kt` | ✅ |

## 2. Information Technology Act, 2000

| # | Requirement | App implementation | Status |
|---|---|---|---|
| §3/§3A | Digital/electronic signature validity | Device-level signing uses Android Keystore ECDSA P-256 (StrongBox where available) — this is a *device* signature, not a legally-recognised digital signature under CCA rules. A Class-3 DSC / Aadhaar eSign integration is required before Part A PDF signing is legally complete. | 🟡 device signature ✅, statutory e-signature ⬜ (vendor decision needed) |
| §65B legacy | Some pending matters still cite the old section | `certificate/CertificateService.kt` includes a `legacySection65BAnnexure` flag/section for backward compatibility | 🟡 |
| §85B | Presumption as to electronic records with a secure digital signature | Downstream of the DSC integration above | ⬜ |
| CCA TSA guidelines v2.0 | RFC 3161 timestamp from a CCA-licensed Indian TSA | `sync/TsaClient.kt` defines the interface; no vendor is wired up. **Requires a commercial account decision** — see Section 14 point 9 of the master brief ((n)Code Solutions, eMudhra, Capricorn, SafeScrypt). | ⬜ |

## 3. IRDAI framework

| # | Requirement | App implementation | Status |
|---|---|---|---|
| PPOAM Regulations 2024 — timely, document-supported claims | Session/checklist model (`assignment.claim_number`, `checklist_template_id`) structures capture around a claim | `envelope/EvidenceEnvelope.kt` (`AssignmentContext`), `ui/session/NewSessionScreen.kt` | ✅ |
| App-based assessment for small losses (<₹50,000, no physical survey required) | Core use case of this app | Whole app | ✅ |
| Surveyor licence binding | `OperatorContext.irdaiSurveyorLicenceNo` + `licenceVerified` fields captured per session | `envelope/EvidenceEnvelope.kt` | 🟡 field exists; live IRDAI licence-registry verification is a backend integration, not built |
| Output feeds the surveyor report, does not replace it | Export bundle format is designed to attach to, not substitute, the statutory survey report | `certificate/CertificateService.kt` | ✅ |

## 4. Digital Personal Data Protection Act, 2023 + DPDP Rules, 2025

| # | Requirement | App implementation | Status |
|---|---|---|---|
| Consent artefact, purpose limitation | `ConsentArtefact` captured before any session involving a third party's personal data; purposes enumerated, versioned notice | `envelope/EvidenceEnvelope.kt` (`ConsentArtefact`), `ui/onboarding/OnboardingScreen.kt` | ✅ capture, ⬜ backend-enforced retention jobs |
| Rule 6 — security safeguards, 1-year audit log retention | All custody events appended to `custody[]`; local audit trail retained; **server-side 1-year WORM retention requires the backend, which is not built in v0.1 (client-only release)** | `vault/SealedVault.kt`, `envelope/EvidenceEnvelope.kt` (`CustodyEvent`) | 🟡 local ✅, server retention ⬜ |
| Rule 7 — 72-hour breach notification | Process/runbook, not a code feature for a client-only app; documented in `docs/threat-model.md` | — | ⬜ (organisational process) |
| Rule 8 — erasure obligations, 48-hour pre-erasure notice | `ui/settings/SettingsScreen.kt` exposes a local delete-with-reason flow that is logged to `custody[]`; a full DPDP erasure-request workflow against a backend is not built | `ui/settings/SettingsScreen.kt` | 🟡 |
| Consent withdrawal | Withdrawal toggle in Settings, recorded as a custody event | `ui/settings/SettingsScreen.kt` | ✅ local |
| PII minimisation — hash device serials, BSSIDs | `DeviceInfoProvider` never stores raw IMEI/serial; only a salted SHA-256 hash | `capture/metadata/DeviceInfoProvider.kt` | ✅ |

## 5. Other

| # | Requirement | App implementation | Status |
|---|---|---|---|
| Motor Vehicles Act §146/§158 | Vehicle registration / chassis fields in `AssignmentContext` | `envelope/EvidenceEnvelope.kt` | ✅ fields only |
| Consumer Protection Act, 2019 | Evidence bundle format is court/commission-agnostic (self-contained ZIP + `HOW_TO_VERIFY.md`) | `docs/HOW_TO_VERIFY.md` | ✅ |

---

## Naming convention note

Section 3.2 of the master brief illustrates the envelope schema with
`snake_case` JSON keys. The Kotlin implementation (`envelope/*.kt`) uses
idiomatic Kotlin `camelCase` property names, and `kotlinx.serialization`
emits `camelCase` JSON on the wire by default — e.g. `envelope_version` in
the brief is `envelopeVersion` in code and on the wire. This is a
cosmetic serialization convention, not a substantive change to the
schema's field set, nesting, or semantics; every field group, type, and
KDoc-cited legal basis matches Section 3.2 one-to-one. If a consumer
requires literal `snake_case` on the wire (e.g. to match the brief
byte-for-byte for an external verifier), add `@SerialName("...")` to each
property — deliberately deferred in v0.1 to keep the ~120-field schema
reviewable; tracked as a documented follow-up, not a silent gap.

## v0.1 scope decision (read this before assuming a gap is a bug)

v0.1 is a **client-only, offline-capable Android application**. There is
intentionally **no backend service** in this delivery. That means everything
in Section 4 (Backend), Section 8.1's PAdES-LTV signing, RFC 3161 TSA,
Play Integrity **server-side** verification, WORM/Object-Lock storage, and
the public verification portal (`verify.pramana.in`) are **not implemented**
— they require either a paid vendor account (TSA, DSC/eSign, C2PA signing
cert) or infrastructure decisions (cloud region, HSM/KMS vendor) that only
the product owner can make. See Section 14, point 9 of the master brief.

What v0.1 *does* deliver, fully on-device and independently verifiable:
capture → metadata harvest → anti-spoof scoring → SHA-256/512/MD5 hashing →
StrongBox/TEE device signing → EXIF/XMP embedding → sealed immutable vault →
per-session Merkle tree → exportable evidence bundle → draft (unsigned)
BSA §63(4) Part A certificate.

This is deliberately the same scope boundary the master brief itself draws
at the end of Phase P1/early P2 (Section 11) — a working, demoable, honest
build, not a claim of full production readiness.
