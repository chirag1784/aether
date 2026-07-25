package com.pramana.evidence.envelope

import kotlinx.serialization.Serializable

/**
 * §5 SENSORS (Section 3.2) — physical-plausibility cross-check evidence.
 *
 * Legal basis: none directly statutory; this block exists to support the
 * anti-fraud claims a certificate makes under BSA §63(2)'s "working
 * properly" language by giving an independent expert (Schedule Part B)
 * material to cross-check the primary claim against — e.g. a "moving"
 * location fix with a flat-line accelerometer, or a "bright outdoor noon"
 * claim with an ambient-light reading of a few lux, are both physically
 * implausible and worth flagging (master brief, Section 7.2).
 */
@Serializable
data class SensorInfo(
    val accelerometer: List<Float>? = null,
    val gyroscope: List<Float>? = null,
    val magnetometerUt: List<Float>? = null,
    val devicePitchDeg: Float? = null,
    val deviceRollDeg: Float? = null,
    val deviceAzimuthDeg: Float? = null,
    val barometricPressureHpa: Float? = null,
    val derivedAltitudeM: Float? = null,
    val ambientLightLux: Float? = null,
    val stepCounterSinceBoot: Long? = null,
    val batteryPct: Int,
    val batteryTempC: Float? = null,
    val charging: Boolean,
    val screenBrightness: Float,
)
