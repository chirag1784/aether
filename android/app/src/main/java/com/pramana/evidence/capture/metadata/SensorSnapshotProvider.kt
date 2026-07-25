package com.pramana.evidence.capture.metadata

import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.os.BatteryManager
import android.provider.Settings
import com.pramana.evidence.envelope.SensorInfo
import kotlin.coroutines.resume
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withTimeoutOrNull

/**
 * Section 3.2 §5 SENSORS — physical-plausibility cross-check evidence
 * (see KDoc on [SensorInfo] for the legal/evidentiary rationale). Takes a
 * short-lived listener registration (a few hundred ms) rather than a
 * continuous stream, since this is a point-in-time snapshot taken at
 * capture, not a monitoring feature.
 */
class SensorSnapshotProvider(private val context: Context) {

    private val sensorManager = context.getSystemService(Context.SENSOR_SERVICE) as? SensorManager

    suspend fun snapshot(): SensorInfo {
        val accel = readVector(Sensor.TYPE_ACCELEROMETER)
        val gyro = readVector(Sensor.TYPE_GYROSCOPE)
        val mag = readVector(Sensor.TYPE_MAGNETIC_FIELD)
        val pressure = readScalar(Sensor.TYPE_PRESSURE)
        val light = readScalar(Sensor.TYPE_LIGHT)

        val orientation = if (accel != null && mag != null) computeOrientation(accel, mag) else null
        val derivedAltitude = pressure?.let { SensorManager.getAltitude(SensorManager.PRESSURE_STANDARD_ATMOSPHERE, it) }

        val batteryStatus = context.registerReceiver(null, IntentFilter(Intent.ACTION_BATTERY_CHANGED))
        val level = batteryStatus?.getIntExtra(BatteryManager.EXTRA_LEVEL, -1) ?: -1
        val scale = batteryStatus?.getIntExtra(BatteryManager.EXTRA_SCALE, -1) ?: -1
        val batteryPct = if (level >= 0 && scale > 0) (level * 100 / scale) else -1
        val tempTenthsC = batteryStatus?.getIntExtra(BatteryManager.EXTRA_TEMPERATURE, -1) ?: -1
        val charging = (batteryStatus?.getIntExtra(BatteryManager.EXTRA_STATUS, -1) ?: -1) == BatteryManager.BATTERY_STATUS_CHARGING

        val brightness = try {
            Settings.System.getInt(context.contentResolver, Settings.System.SCREEN_BRIGHTNESS) / 255f
        } catch (e: Exception) {
            -1f
        }

        return SensorInfo(
            accelerometer = accel,
            gyroscope = gyro,
            magnetometerUt = mag,
            devicePitchDeg = orientation?.get(1),
            deviceRollDeg = orientation?.get(2),
            deviceAzimuthDeg = orientation?.get(0),
            barometricPressureHpa = pressure,
            derivedAltitudeM = derivedAltitude,
            ambientLightLux = light,
            stepCounterSinceBoot = null, // requires ACTIVITY_RECOGNITION on API 29+; not requested in v0.1 to minimise permission footprint
            batteryPct = batteryPct,
            batteryTempC = if (tempTenthsC >= 0) tempTenthsC / 10f else null,
            charging = charging,
            screenBrightness = brightness,
        )
    }

    private fun computeOrientation(accel: List<Float>, mag: List<Float>): FloatArray? {
        val rotationMatrix = FloatArray(9)
        val ok = SensorManager.getRotationMatrix(rotationMatrix, null, accel.toFloatArray(), mag.toFloatArray())
        if (!ok) return null
        val orientation = FloatArray(3)
        SensorManager.getOrientation(rotationMatrix, orientation)
        return floatArrayOf(
            Math.toDegrees(orientation[0].toDouble()).toFloat().let { if (it < 0) it + 360 else it }, // azimuth
            Math.toDegrees(orientation[1].toDouble()).toFloat(), // pitch
            Math.toDegrees(orientation[2].toDouble()).toFloat(), // roll
        )
    }

    private suspend fun readVector(type: Int, timeoutMs: Long = 300): List<Float>? {
        val sensor = sensorManager?.getDefaultSensor(type) ?: return null
        return withTimeoutOrNull(timeoutMs) {
            suspendCancellableCoroutine { cont ->
                val listener = object : SensorEventListener {
                    override fun onSensorChanged(event: SensorEvent) {
                        if (cont.isActive) {
                            cont.resume(event.values.toList())
                            sensorManager.unregisterListener(this)
                        }
                    }
                    override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) {}
                }
                sensorManager.registerListener(listener, sensor, SensorManager.SENSOR_DELAY_UI)
                cont.invokeOnCancellation { sensorManager.unregisterListener(listener) }
            }
        }
    }

    private suspend fun readScalar(type: Int, timeoutMs: Long = 300): Float? =
        readVector(type, timeoutMs)?.firstOrNull()
}
