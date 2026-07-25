package com.pramana.evidence.envelope

import kotlinx.serialization.Serializable

/**
 * §6 360° SPECIFIC (Section 3.2, Section 6). Populated only when
 * [AssetInfo.captureKind] is `PANO_360` or `VIDEO_360`.
 *
 * v0.1 scope note: the guided phone-only photosphere stitcher (Section 6.1,
 * OpenCV `Stitcher`) and the tethered external-camera bridge (Section 6.2,
 * Insta360/Theta SDKs) are **not implemented in v0.1** — see
 * `docs/compliance-matrix.md`. This data class exists so the schema and
 * the GPano/XMP writer (`exif/XmpWriter.kt`, Section 6.3) are ready for
 * that work; `stitchEngine` will read `"NOT_IMPLEMENTED_V0.1"` until then.
 */
@Serializable
data class PanoramaInfo(
    val projection: String = "equirectangular",
    val fullPanoWidthPx: Int,
    val fullPanoHeightPx: Int,
    val croppedAreaImageWidthPx: Int,
    val croppedAreaImageHeightPx: Int,
    val croppedAreaLeftPx: Int,
    val croppedAreaTopPx: Int,
    val poseHeadingDeg: Float,
    val posePitchDeg: Float,
    val poseRollDeg: Float,
    val initialViewHeadingDeg: Float = 0f,
    val sourcePhotosCount: Int,
    val firstPhotoDate: String,
    val lastPhotoDate: String,
    val stitchEngine: String,
    val externalCamera: ExternalCameraInfo? = null,
    val perSourceFrameHashes: List<String> = emptyList(),
)

/**
 * Section 6.2: capture trust is deliberately lower for tethered external
 * cameras than for native phone capture, because the file leaves a device
 * this app does not control before it can be hashed and sealed. The
 * envelope-level flag for this is `capture_trust: "TETHERED_EXTERNAL"`,
 * surfaced wherever [PanoramaInfo.externalCamera] is non-null.
 */
@Serializable
data class ExternalCameraInfo(
    val vendor: String,
    val model: String,
    val serialHash: String,
    val firmware: String?,
    val pairingMethod: String,
    val transferHashVerified: Boolean,
)
