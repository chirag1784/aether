package com.pramana.evidence.envelope

enum class AssuranceLevel { HIGH, MEDIUM, LOW }

/**
 * Section 7 ("Implement as a scored risk engine... Output
 * `assurance_level: HIGH | MEDIUM | LOW` on every asset and print it on
 * the certificate"). This is derived, not stored on the envelope itself —
 * computed fresh from the envelope's own fields whenever it's displayed,
 * so it can never drift out of sync with the underlying data (master
 * brief rule 6: "never silently upgrade an assurance level").
 *
 * v0.1's ceiling is deliberately [AssuranceLevel.MEDIUM], never
 * [AssuranceLevel.HIGH]: HIGH would require a server-verified Play
 * Integrity verdict (Section 7.1), and this client-only release has no
 * backend to produce one (`docs/compliance-matrix.md`). This is not a
 * scoring bug — it is the honest consequence of the v0.1 scope boundary,
 * and it is expected to change the moment Phase P2/P3 ship a backend.
 */
fun EvidenceEnvelope.computeAssuranceLevel(): AssuranceLevel {
    val spoof = location.antiSpoof
    if (spoof.spoofVerdict == SpoofVerdict.SPOOFED) return AssuranceLevel.LOW
    if (device.rootIndicators.suBinary || device.rootIndicators.magisk) return AssuranceLevel.LOW
    if (device.isDebuggable) return AssuranceLevel.LOW

    val reasons = mutableListOf<String>()
    if (spoof.spoofVerdict == SpoofVerdict.SUSPECT) reasons += "spoof_suspect"
    if (location.horizontalAccuracyM > 20f) reasons += "low_gps_accuracy"
    if (integrity.keyAttestation.securityLevel == KeystoreBacking.SOFTWARE) reasons += "software_keystore"
    if (!device.rootIndicators.selinuxEnforcing) reasons += "selinux_permissive"
    if (time.ntpSources.isEmpty() && time.gnssUtc == null) reasons += "no_independent_time_anchor"

    val onDeviceLevel = when {
        reasons.isEmpty() -> AssuranceLevel.HIGH
        reasons.size <= 2 -> AssuranceLevel.MEDIUM
        else -> AssuranceLevel.LOW
    }

    return if (onDeviceLevel == AssuranceLevel.HIGH && integrity.playIntegrity == null) {
        AssuranceLevel.MEDIUM
    } else {
        onDeviceLevel
    }
}
