# PRAMĀṆA — Threat Model

Per Section 7.5 of the master brief: an honest threat model is a sales asset
with insurers and a shield in court. Overclaiming here is a legal liability.

For each threat: the attack, the mitigation implemented in v0.1 (client-only
release), and the **residual risk that remains** even with the mitigation.

---

### 1. Rooted / Magisk device
**Attack:** attacker roots the capture device to gain filesystem access to the
app-private vault or to hook the camera pipeline.
**Mitigation:** `AntiSpoofEngine` (via `DeviceInfoProvider.rootIndicators()`)
checks `su` binaries, Magisk artefacts, `ro.debuggable`, `ro.secure`,
test-keys build tags, and SELinux enforcing state at every pre-flight and
capture. A positive finding downgrades `assurance_level` to `LOW` and is
printed on the certificate — it does not silently block capture, because a
false positive on a legitimate device must never destroy real evidence
before an operator has had a chance to override with documented reason.
**Residual risk:** heuristic root detection is defeatable by a
sufficiently motivated attacker (Magisk Hide/Zygisk-style concealment,
kernel-level tampering). Server-side Play Integrity + hardware key
attestation (Section 7.1) would close most of this gap but require a
backend, which v0.1 does not have.

### 2. Virtual / injected camera
**Attack:** a virtual-camera app or camera-hooking framework feeds
fabricated frames to the CameraX pipeline instead of the real sensor.
**Mitigation:** `CameraController` pins camera IDs at session start,
rejects `LENS_FACING_EXTERNAL` and `INFO_SUPPORTED_HARDWARE_LEVEL_LEGACY`,
and measures capture→callback latency; anomalous latency distributions are
flagged in the envelope's `camera.capture_to_write_latency_ms`.
**Residual risk:** latency-signature detection is advisory only in v0.1 —
there is no trained classifier or backend fleet-wide baseline to compare
against, so it cannot be a hard gate yet. A well-resourced attacker with a
kernel-level camera HAL hook is not detectable by userspace checks alone.

### 3. Mock / spoofed GNSS location
**Attack:** attacker uses a mock-location app or a hardware GNSS simulator
to fake the capture location.
**Mitigation:** `AntiSpoofEngine` checks `Location.isMock()` /
`isFromMockProvider()` on **every** fix (not sampled), enumerates apps
holding the mock-location permission, and scores GNSS plausibility using
satellite count, constellation mix, C/N0 mean and standard deviation, and
GNSS-vs-network-fix delta, producing `spoof_verdict`.
**Residual risk:** a hardware GNSS simulator feeding a genuine (non-mock)
GPS antenna input on the device is very difficult to distinguish from a
real fix using phone-only sensors. Raw `GnssMeasurementsEvent` / AGC-level
analysis (Section 7.2) is implemented as best-effort but is not a
peer-reviewed spoofing classifier — treat `spoof_verdict: SPOOFED` as
strong signal and `CLEAN` as "no red flags found," not as proof.

### 4. Re-photographing a screen / staged scene
**Attack:** attacker photographs a photograph, or genuinely stages damage.
**Mitigation:** none, by design — this app **cannot and does not claim** to
verify the scene is real. See Section 0 of the master brief. The burned-in
rotating nonce (30 s TTL, server-issued in the full design) makes replaying
a *pre-recorded video* of the capture screen detectable, but does not
detect photographing a printed or displayed photo of real damage.
**Residual risk:** total. This is a fundamental limitation of any capture
app and must never be marketed away.

### 5. Device clock manipulation
**Attack:** attacker sets the system clock backward/forward to misdate a
capture.
**Mitigation:** `MetadataHarvester` cross-checks `device_utc` against GNSS
clock time, NTP offset (where network is available), and
`SystemClock.elapsedRealtime()` (monotonic since boot, unaffected by clock
changes). Large deltas are recorded in `time.gnss_system_delta_ms` and
flagged.
**Residual risk:** with no network and GNSS unavailable (e.g. deep indoors,
airplane mode), the only anchor is the monotonic boot clock, which proves
*elapsed time between captures* but not *absolute time*. The certificate
must disclose this degraded case rather than silently trusting system time
— implemented via `assurance_level` downgrade.

### 6. Screen recording of the capture UI
**Attack:** attacker screen-records the live capture flow to later replay
or extract the nonce overlay.
**Mitigation:** `FLAG_SECURE` set on `CaptureScreen`'s window.
**Residual risk:** does not prevent a second physical camera filming the
screen from outside the device (an "over-the-shoulder" analog capture).

### 7. Gallery import posing as live capture
**Attack:** attacker imports a pre-existing image/video and passes it off
as an evidentiary capture.
**Mitigation:** the evidentiary capture flow (`CaptureScreen`) has **no**
gallery/file picker code path — the only way an asset enters the sealed
vault is via the CameraX capture callback in `EvidencePipeline`. A future
"unverified import" flow (Section 7.4) is explicitly out of scope for v0.1
and must ship with a visually distinct, differently-labelled certificate if
ever added.
**Residual risk:** none for this specific vector in v0.1, by construction
(no import code exists).

### 8. Sealed asset tampering after capture
**Attack:** attacker with filesystem access modifies a sealed asset's bytes.
**Mitigation:** `vault/SealedVault.kt` writes assets via `EncryptedFile`
(AES-256-GCM, Jetpack Security) and marks the underlying file read-only
after `seal()`; no class outside the `vault` package has a write path to a
sealed file (enforced by code review / package-private constructors — see
`docs/HOW_TO_VERIFY.md` for the architecture rule). Any modification
changes the AEAD tag and fails decryption/verification outright, which is
itself detectable, and the recomputed hash will not match the envelope's
recorded hash.
**Residual risk:** a root-level attacker with the device's Keystore-backed
key material could, in principle, re-derive and re-seal a forged file —
this is why the *device signature* (StrongBox-backed where hardware
supports it) matters: forging a new signature requires the private key,
which StrongBox/TEE is designed to make non-exportable even to a rooted
OS. Full protection requires the server-side re-hash-on-ingest check
(Section 5 step 11), which v0.1's client-only scope does not include.

### 9. Collusion between operator and claimant
**Attack:** the person capturing evidence is incentivised to help fabricate
a favourable record.
**Mitigation:** out of scope for software to solve. `context.operator` and
biometric-confirmation-at-capture fields exist to bind identity, which
supports *accountability* (a named, licensed individual is on the record)
but does not prevent collusion.
**Residual risk:** total; this is a human/process control (licensing,
audit sampling, fraud-ring detection via perceptual-hash cross-claim
matching — the latter requires a backend and is out of scope for v0.1).

### 10. Backend insider / TSA compromise / MITM on upload
**Not applicable to v0.1** — there is no backend, no TSA integration, and
no upload path in this release. These threats apply once Phase P3
(Section 11) is built and must be re-assessed at that time.

### 11. Certificate revocation
**Not applicable to v0.1** — no PAdES-LTV signing is wired up yet, so there
is no signing certificate to revoke. Applies once DSC/eSign vendor
integration ships.
