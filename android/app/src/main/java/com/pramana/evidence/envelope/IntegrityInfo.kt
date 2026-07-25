package com.pramana.evidence.envelope

import kotlinx.serialization.Serializable

/**
 * §8 INTEGRITY & ATTESTATION (Section 3.2) — the field group a court-
 * appointed expert (BSA §63(4) Schedule Part B) will scrutinise most
 * closely. Every sub-object below is independently reproducible per
 * `docs/HOW_TO_VERIFY.md` — an integrity claim this app cannot show its
 * work for is not included here (master brief, Section 14, rule 3).
 *
 * v0.1 is a client-only release (`docs/compliance-matrix.md`): [playIntegrity],
 * [trustedTimestamp], and [serverCountersignature] are present in the
 * schema so downstream tooling and the certificate layout are ready, but
 * are **not populated** until the corresponding vendor/backend integration
 * ships (Phase P2 server-side verify, P3 TSA + backend). [keyAttestation]
 * and [deviceSignature] ARE real in v0.1 — they need no backend, only the
 * Android Keystore on-device.
 */
@Serializable
data class IntegrityInfo(
    val playIntegrity: PlayIntegrityInfo? = null,
    val keyAttestation: KeyAttestationInfo,
    val deviceSignature: DeviceSignatureInfo,
    val c2pa: C2paInfo? = null,
    val trustedTimestamp: TrustedTimestampInfo? = null,
    val merkle: MerkleInfo? = null,
    val serverCountersignature: ServerCountersignatureInfo? = null,
)

/**
 * Section 7.1. Not populated in v0.1 — Play Integrity verdicts are only
 * trustworthy when verified **server-side** against Google's servers
 * (client-side parsing of the token is "decorative," master brief rule 5);
 * v0.1 ships no backend to do that verification.
 */
@Serializable
data class PlayIntegrityInfo(
    val requestHash: String,
    val deviceVerdict: List<String>,
    val appVerdict: String,
    val appAccessRisk: String,
    val playProtectVerdict: String,
    val tokenJws: String,
    val verifiedServerSideAt: String? = null,
)

/**
 * Real in v0.1: extracted from the Android Keystore hardware attestation
 * certificate chain generated for [DeviceSignatureInfo]'s signing key
 * (`crypto/StrongBoxSigner.kt`). [securityLevel] tells you whether the
 * private key is non-exportable in a discrete secure element (StrongBox),
 * a TEE, or software-only (a StrongBox-less device) — see
 * `docs/threat-model.md` §8. Full chain-of-trust validation up to Google's
 * hardware root is documented as a v0.1 gap in `docs/HOW_TO_VERIFY.md` §4.
 */
@Serializable
data class KeyAttestationInfo(
    val keyAlias: String,
    val algorithm: String = "ECDSA_P256_SHA256",
    val securityLevel: KeystoreBacking,
    val attestationChallenge: String,
    val attestationChainSha256: List<String>,
    val verifiedBootState: String?,
    val deviceLocked: Boolean?,
    val attestationRoot: String = "GOOGLE_HARDWARE",
)

/**
 * Real in v0.1. An ECDSA P-256 signature produced inside the Android
 * Keystore (StrongBox where the device supports it, TEE otherwise) over
 * the SHA-256 digest of the envelope's canonical JCS bytes. See
 * `crypto/StrongBoxSigner.kt` and `docs/HOW_TO_VERIFY.md` §4 for the exact
 * OpenSSL reproduction command.
 */
@Serializable
data class DeviceSignatureInfo(
    val algorithm: String = "ECDSA_P256_SHA256",
    val signedFieldsCanonical: String = "RFC8785-JCS",
    val signatureB64: String,
)

/** Section 6, C2PA embedding — not implemented in v0.1 (Phase P6). */
@Serializable
data class C2paInfo(
    val manifestEmbedded: Boolean = false,
    val claimGenerator: String,
    val assertions: List<String> = emptyList(),
    val signerCertThumbprint: String? = null,
    val trustListConformant: Boolean = false,
    val assuranceLevelClaimed: Int = 1,
)

/**
 * RFC 3161 trusted timestamp from a CCA-licensed Indian TSA (Section 1.2,
 * Section 9.3). Not implemented in v0.1 — requires a commercial TSA
 * vendor account, which is a business decision, not an engineering one
 * (master brief, Section 14, point 9).
 */
@Serializable
data class TrustedTimestampInfo(
    val tsaName: String,
    val tsaPolicyOid: String,
    val hashSubmitted: String,
    val tstDerB64: String,
    val tsaTimeUtc: String,
    val rfc3161Verified: Boolean,
    val fallbackUsed: Boolean = false,
)

/**
 * Real in v0.1, computed entirely on-device across a session's assets —
 * see `crypto/MerkleTree.kt`. Anchoring the root off-device (Section 4,
 * "Merkle Anchor Service") is a backend feature not built in this release.
 */
@Serializable
data class MerkleInfo(
    val leafIndex: Int,
    val leafHash: String,
    val inclusionProof: List<String>,
    val sessionRoot: String,
)

/** Section 4, HSM-backed backend countersignature — not implemented in v0.1 (no backend ships). */
@Serializable
data class ServerCountersignatureInfo(
    val signer: String,
    val algorithm: String = "ECDSA_P384_SHA384",
    val hsmBacked: Boolean,
    val signatureB64: String,
    val signedAt: String,
)
