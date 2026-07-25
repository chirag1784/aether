package com.pramana.evidence.envelope

import kotlinx.serialization.Serializable

/**
 * §5 CAMERA PROVENANCE (Section 3.2).
 *
 * Legal basis: defends against the virtual-camera / frame-injection threat
 * (`docs/threat-model.md` §2). [physicalCameraVerified] and
 * [virtualCameraSuspected] are populated by `CameraController` pinning
 * camera IDs at session start and rejecting `LENS_FACING_EXTERNAL` /
 * `LEGACY` hardware levels for evidentiary capture (Section 7.3).
 * [captureToWriteLatencyMs] is recorded because virtual cameras and
 * frame-injection frameworks have characteristic latency signatures —
 * this is advisory in v0.1 (no fleet-wide baseline to compare against
 * without a backend), not a hard gate.
 */
@Serializable
data class CameraInfo(
    val cameraId: String,
    val lensFacing: String,
    val hardwareLevel: String,
    val physicalCameraVerified: Boolean,
    val virtualCameraSuspected: Boolean,
    val focalLengthMm: Float? = null,
    val apertureF: Float? = null,
    val iso: Int? = null,
    val exposureTimeNs: Long? = null,
    val whiteBalance: String? = null,
    val flashFired: Boolean = false,
    val sensorTimestampNs: Long? = null,
    val framesDropped: Int = 0,
    val captureToWriteLatencyMs: Long,
)
