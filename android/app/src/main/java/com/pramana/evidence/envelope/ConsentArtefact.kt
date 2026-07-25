package com.pramana.evidence.envelope

import kotlinx.serialization.Serializable

/**
 * §10 CONSENT (Section 3.2).
 *
 * Legal basis: Digital Personal Data Protection Act, 2023 and the DPDP
 * Rules, 2025 (Section 1.4 of the master brief). Location, imagery of
 * faces/vehicles/property, and voice notes are personal data; this is the
 * consent artefact required before that data may be captured or disclosed
 * to a third party (insurer/TPA). [retentionUntil] and [withdrawalChannel]
 * exist because DPDP Rule 8 requires an erasure path and a 48-hour
 * pre-erasure notice — see `ui/settings/SettingsScreen.kt` for the
 * user-facing withdrawal/erasure flow (client-side only in v0.1; a
 * backend-enforced retention job is a P7 deliverable, not yet built).
 */
@Serializable
data class ConsentArtefact(
    val artefactId: String,
    val purposes: List<String>,
    val noticeVersion: String,
    val noticeLanguages: List<String> = listOf("en", "hi", "gu"),
    val givenAt: String,
    val givenBy: String,
    val thirdPartiesDisclosed: List<String> = emptyList(),
    val retentionUntil: String? = null,
    val withdrawalChannel: String = "app",
    val facesPresent: Boolean = false,
    val faceBlurApplied: Boolean = false,
)
