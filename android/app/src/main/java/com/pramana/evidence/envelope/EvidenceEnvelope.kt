package com.pramana.evidence.envelope

import kotlinx.serialization.Serializable

/**
 * The Evidence Envelope: the signed sidecar record describing exactly one
 * captured [Asset]. This is the core data model of the entire application —
 * see Section 3 of the master brief ("The Evidence Envelope (Core Data
 * Model)").
 *
 * Every field group on this class exists because of a specific legal
 * requirement; see the KDoc on each nested type and
 * `docs/compliance-matrix.md` for the full traceability table. Nothing here
 * should be added "because it might be useful" — if a field cannot be
 * pointed at a line in the master brief or a named statute, it does not
 * belong on this class.
 *
 * This class and everything it references is pure Kotlin with no Android
 * framework dependency, by design (master brief, Section 14, rule 2): it
 * must be constructible and unit-testable without an Android device or
 * emulator.
 *
 * ### Canonicalisation and signing (Section 3.3)
 * Before signing, the envelope is serialised to JSON and re-canonicalised
 * per RFC 8785 (JCS) by [com.pramana.evidence.envelope.JcsCanonicalizer].
 * The following fields are excluded from the signed payload because they
 * are legitimately appended or amended *after* the device signature is
 * produced: [integrity]'s `deviceSignature` and `serverCountersignature`
 * sub-fields, `trustedTimestamp`, and any [custody] entry recorded after
 * the `"SEALED"` event. See `docs/HOW_TO_VERIFY.md` for the exact
 * reproduction procedure.
 */
@Serializable
data class EvidenceEnvelope(
    val envelopeVersion: String = "1.0",
    /** UUIDv7 (time-ordered) — see [com.pramana.evidence.crypto.Uuid7]. */
    val envelopeId: String,
    val sessionId: String,

    val asset: AssetInfo,
    val time: TimeInfo,
    val location: LocationInfo,
    val device: DeviceInfo,
    val sensors: SensorInfo,
    val network: NetworkInfo,
    val camera: CameraInfo,
    /** Null for non-panoramic capture kinds. See Section 6. */
    val panorama: PanoramaInfo? = null,
    val context: ContextInfo,
    val integrity: IntegrityInfo,
    val custody: List<CustodyEvent> = emptyList(),
    val consent: ConsentArtefact,
)

enum class CaptureKind { PHOTO, VIDEO, PANO_360, VIDEO_360, DOCUMENT }

/**
 * §1 ASSET IDENTITY (Section 3.2).
 *
 * Legal basis: BSA §63(1) — an electronic record is deemed a document only
 * if it is a self-describing, identifiable artefact. [hashes] is the field
 * BSA §63(4) Schedule Part A requires to be stated on the certificate
 * ("hash value and the algorithm used"); SHA-256 is primary, SHA-512 and
 * MD5 are carried for legacy court/counsel familiarity per the master
 * brief's explicit instruction that some judges and opposing counsel still
 * ask for MD5 despite its cryptographic weakness — it is disclosed, never
 * relied upon alone.
 */
@Serializable
data class AssetInfo(
    val filename: String,
    val mimeType: String,
    val byteLength: Long,
    val captureKind: CaptureKind,
    val hashes: AssetHashes,
    val perceptualHash: PerceptualHash? = null,
    /** VIDEO only — localises tampering to a time window (Section 3.2). */
    val videoSegmentHashes: List<VideoSegmentHash> = emptyList(),
    /** Server-issued anti-replay nonce burned into the frame (Section 5 step 3). Null until wired to a backend. */
    val contentPrngNonce: String? = null,
)

@Serializable
data class AssetHashes(
    val sha256: String,
    val sha512: String,
    val md5: String,
    /** Reserved for a future native BLAKE3 binding; not computed in v0.1 — see compliance-matrix.md. */
    val blake3: String? = null,
)

@Serializable
data class PerceptualHash(
    val phashDct64: String,
    val algorithm: String = "pHash-DCT-64",
)

@Serializable
data class VideoSegmentHash(
    val segmentIndex: Int,
    val startMs: Long,
    val endMs: Long,
    val sha256: String,
)
