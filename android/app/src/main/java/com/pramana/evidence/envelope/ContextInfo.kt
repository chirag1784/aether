package com.pramana.evidence.envelope

import kotlinx.serialization.Serializable

enum class OperatorRole { SURVEYOR, POLICYHOLDER, INVESTIGATOR, ADVOCATE, EHS_OFFICER }

enum class KycLevel { AADHAAR_ESIGN, DIGILOCKER, PAN, NONE }

/**
 * §7 HUMAN CONTEXT (Section 3.2).
 *
 * Legal basis: BSA §63(4) Schedule Part A requires "name, address and
 * designation of the person producing the record" — [OperatorContext] is
 * that field group. [AssignmentContext] ties the capture to a specific
 * IRDAI claim so the evidence bundle can be attached to (not substitute
 * for) the statutory surveyor report, per Section 1.3 of the master brief.
 *
 * v0.1 scope note: [OperatorContext.licenceVerified] and
 * [OperatorContext.kycLevel] record what the operator *asserts*; live
 * verification against the IRDAI licence registry or DigiLocker requires a
 * backend integration not built in this release (compliance-matrix.md §3).
 */
@Serializable
data class ContextInfo(
    val operator: OperatorContext,
    val assignment: AssignmentContext? = null,
    val operatorNote: String? = null,
    val voiceNoteRef: String? = null,
    val voiceNoteSha256: String? = null,
    val voiceTranscript: VoiceTranscript? = null,
)

@Serializable
data class OperatorContext(
    val userId: String,
    val displayName: String,
    val role: OperatorRole,
    val irdaiSurveyorLicenceNo: String? = null,
    val licenceVerified: Boolean = false,
    val kycLevel: KycLevel = KycLevel.NONE,
    /** BiometricPrompt confirmation immediately before the shutter fired (Section 5 step 1). */
    val biometricConfirmedAtCapture: Boolean = false,
)

@Serializable
data class AssignmentContext(
    val claimNumber: String? = null,
    val policyNumber: String? = null,
    val insurer: String? = null,
    val tpa: String? = null,
    val vehicleRegNo: String? = null,
    val chassisNoMasked: String? = null,
    val lossDate: String? = null,
    val intimationDate: String? = null,
    val checklistTemplateId: String? = null,
    val checklistItemId: String? = null,
    val mandatory: Boolean = false,
)

@Serializable
data class VoiceTranscript(
    val text: String,
    val language: String,
    val engine: String = "on-device",
)
