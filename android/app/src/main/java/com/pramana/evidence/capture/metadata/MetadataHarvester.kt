package com.pramana.evidence.capture.metadata

import android.content.Context
import android.location.Location
import android.location.LocationManager
import android.os.SystemClock
import android.provider.Settings
import com.pramana.evidence.envelope.LocationInfo
import com.pramana.evidence.envelope.SensorInfo
import com.pramana.evidence.envelope.NetworkInfo
import com.pramana.evidence.envelope.TimeInfo
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter

/**
 * Composes [LocationProvider], [AntiSpoofEngine], [SensorSnapshotProvider],
 * and [NetworkInfoProvider] into the snapshot taken at Section 5 step 2
 * ("CAPTURE") — everything captured *simultaneously* with the shutter
 * press, per the master brief's exact wording: "Simultaneously snapshot:
 * location fix, GNSS status, raw measurements, all sensors, network
 * state, camera characteristics, uptime."
 */
class MetadataHarvester(private val context: Context) {

    private val locationProvider = LocationProvider(context)
    private val antiSpoofEngine = AntiSpoofEngine(context)
    private val sensorSnapshotProvider = SensorSnapshotProvider(context)
    private val networkInfoProvider = NetworkInfoProvider(context)

    data class Snapshot(
        val time: TimeInfo,
        val location: LocationInfo?,
        val sensors: SensorInfo,
        val network: NetworkInfo,
    )

    suspend fun capture(): Snapshot {
        val time = timeInfo()
        val fix = locationProvider.getCurrentFix()
        val gnss = locationProvider.gnssRawSummary()
        val sensors = sensorSnapshotProvider.snapshot()
        val network = networkInfoProvider.snapshot()

        val location = fix?.let { loc ->
            val isMock = locationProvider.isMockLocation(loc)
            val antiSpoof = antiSpoofEngine.evaluate(loc, isMock, gnss, networkFixDistanceM = null)
            LocationInfo(
                latitude = loc.latitude,
                longitude = loc.longitude,
                altitudeM = if (loc.hasAltitude()) loc.altitude else null,
                horizontalAccuracyM = if (loc.hasAccuracy()) loc.accuracy else Float.MAX_VALUE,
                verticalAccuracyM = if (loc.hasVerticalAccuracy()) loc.verticalAccuracyMeters else null,
                speedMps = if (loc.hasSpeed()) loc.speed else null,
                bearingDeg = if (loc.hasBearing()) loc.bearing else null,
                provider = loc.provider ?: "unknown",
                fixAgeMs = SystemClock.elapsedRealtimeNanos() / 1_000_000 - (loc.elapsedRealtimeNanos / 1_000_000),
                geohash = Geohash.encode(loc.latitude, loc.longitude),
                antiSpoof = antiSpoof,
            )
        }

        return Snapshot(time = time, location = location, sensors = sensors, network = network)
    }

    private fun timeInfo(): TimeInfo {
        val now = Instant.now()
        val zone = ZoneId.systemDefault()
        val utcFormatter = DateTimeFormatter.ISO_INSTANT
        val localFormatter = DateTimeFormatter.ISO_OFFSET_DATE_TIME

        val systemClockAuto = try {
            Settings.Global.getInt(context.contentResolver, Settings.Global.AUTO_TIME, 0) != 0
        } catch (e: Exception) { false }
        val systemTzAuto = try {
            Settings.Global.getInt(context.contentResolver, Settings.Global.AUTO_TIME_ZONE, 0) != 0
        } catch (e: Exception) { false }

        val lm = context.getSystemService(Context.LOCATION_SERVICE) as? LocationManager
        val lastGnss = try { lm?.getLastKnownLocation(LocationManager.GPS_PROVIDER) } catch (e: SecurityException) { null }
        var gnssUtc: String? = null
        var gnssDeltaMs: Long? = null
        if (lastGnss != null && lastGnss.time > 0) {
            gnssUtc = Instant.ofEpochMilli(lastGnss.time).let(utcFormatter::format)
            gnssDeltaMs = now.toEpochMilli() - lastGnss.time
        }

        return TimeInfo(
            deviceUtc = utcFormatter.format(now),
            deviceLocal = now.atZone(zone).format(localFormatter),
            timezoneId = zone.id,
            deviceUptimeMs = SystemClock.elapsedRealtime(),
            monotonicBootId = bootId(),
            gnssUtc = gnssUtc,
            gnssSystemDeltaMs = gnssDeltaMs,
            ntpSources = emptyList(), // no NTP relay wired up in v0.1 (client-only release) — see compliance-matrix.md
            systemClockAuto = systemClockAuto,
            systemTzAuto = systemTzAuto,
        )
    }

    /**
     * A per-boot identifier used to detect a reboot between captures
     * (Section 3.2's `monotonic_boot_id`). `Settings.Global.BOOT_COUNT` is
     * the closest stable, permission-free proxy available on API 29+; it
     * increments on every boot, which is exactly the property this field
     * needs (unlike a random UUID, an attacker gains nothing by faking a
     * plausible-looking count, and it can be cross-checked against the
     * OS's own boot counter by an independent reviewer).
     */
    private fun bootId(): String = try {
        "boot_" + Settings.Global.getInt(context.contentResolver, Settings.Global.BOOT_COUNT, -1)
    } catch (e: Exception) {
        "boot_unknown"
    }
}
