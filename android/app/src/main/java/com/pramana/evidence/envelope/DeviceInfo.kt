package com.pramana.evidence.envelope

import kotlinx.serialization.Serializable

enum class KeystoreBacking { STRONGBOX, TEE, SOFTWARE }

/**
 * §4 DEVICE & ENVIRONMENT (Section 3.2).
 *
 * Legal basis: BSA §63(2) requires the certifying party to attest the
 * device "was in regular use," "operating properly," and that information
 * was "fed into the computer in the ordinary course of [its] activities."
 * This block is the evidentiary basis for that attestation on the §63(4)
 * Schedule Part A certificate ("particulars of the device").
 *
 * DPDP data-minimisation note: [hardwareSerialHash] is a **salted SHA-256
 * hash**, never the raw IMEI/serial — see `docs/compliance-matrix.md` §4.
 */
@Serializable
data class DeviceInfo(
    val manufacturer: String,
    val model: String,
    val device: String,
    val androidRelease: String,
    val sdkInt: Int,
    val securityPatch: String,
    val buildFingerprint: String,
    val hardwareSerialHash: String,
    val installId: String,
    val appVersionName: String,
    val appVersionCode: Long,
    val appSigningCertSha256: String,
    val isDebuggable: Boolean,
    val keystoreBacking: KeystoreBacking,
    val rootIndicators: RootIndicators,
    val developerMode: Boolean,
    val adbEnabled: Boolean,
    val vpnActive: Boolean,
    val emulatorIndicators: List<String> = emptyList(),
)

/**
 * Root/tamper heuristics feeding the `assurance_level` score (Section 7.1).
 * These are best-effort userspace checks, not a hardware attestation —
 * see `docs/threat-model.md` §1 for the honest residual-risk statement.
 */
@Serializable
data class RootIndicators(
    val suBinary: Boolean,
    val magisk: Boolean,
    val testKeys: Boolean,
    val selinuxEnforcing: Boolean,
    val bootloaderLocked: Boolean?,
)
