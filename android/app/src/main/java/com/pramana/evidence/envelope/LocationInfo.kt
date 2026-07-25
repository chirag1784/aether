package com.pramana.evidence.envelope

import kotlinx.serialization.Serializable

/**
 * §3 GEOSPATIAL (Section 3.2).
 *
 * Legal basis: geolocation is the single most valuable evidentiary fact
 * for an insurance-claim or accident-scene capture, and is "personal data"
 * under the DPDP Act, 2023 §2(t) the moment it can be linked to a person —
 * which it always can be here via [com.pramana.evidence.envelope.ContextInfo].
 * Purpose limitation and retention rules for this field live in
 * [ConsentArtefact], not here.
 *
 * [antiSpoof] is the output of `AntiSpoofEngine` (Section 7.2) and is what
 * makes this block more than "an EXIF GPS tag" — see
 * `docs/threat-model.md` §3.
 */
@Serializable
data class LocationInfo(
    val latitude: Double,
    val longitude: Double,
    val altitudeM: Double?,
    val horizontalAccuracyM: Float,
    val verticalAccuracyM: Float?,
    val speedMps: Float?,
    val bearingDeg: Float?,
    val provider: String,
    val fixAgeMs: Long,
    val datum: String = "WGS84",
    val geohash: String,
    val reverseGeocode: ReverseGeocode? = null,
    val plusCode: String? = null,
    val antiSpoof: AntiSpoofInfo,
)

/**
 * v0.1 scope note: reverse geocoding uses only on-device data (no Mappls /
 * server call wired up — see compliance-matrix.md); [source] will always
 * read `"on-device"` or be null in this release.
 */
@Serializable
data class ReverseGeocode(
    val formatted: String,
    val state: String? = null,
    val district: String? = null,
    val pincode: String? = null,
    val source: String = "on-device",
    val confidence: Float? = null,
)

enum class SpoofVerdict { CLEAN, SUSPECT, SPOOFED }

/**
 * Section 7.2 anti-spoof scoring. Every field here is checked on **every**
 * fix, not sampled — sophisticated spoofers alternate real and mock fixes
 * specifically to defeat spot checks (master brief, Section 7.2).
 */
@Serializable
data class AntiSpoofInfo(
    /** `Location.isMock()` (API 31+) / `isFromMockProvider()` on this exact fix. */
    val isMock: Boolean,
    val mockAppsInstalled: List<String> = emptyList(),
    val devOptionsEnabled: Boolean,
    val gnssSatellitesVisible: Int? = null,
    val gnssSatellitesUsed: Int? = null,
    val constellations: List<String> = emptyList(),
    val cn0MeanDbhz: Float? = null,
    val cn0StddevDbhz: Float? = null,
    val agcLevelDb: Float? = null,
    val rawMeasurementsAvailable: Boolean = false,
    val gnssVsNetworkDeltaM: Float? = null,
    val spoofRiskScore: Float,
    val spoofVerdict: SpoofVerdict,
)
