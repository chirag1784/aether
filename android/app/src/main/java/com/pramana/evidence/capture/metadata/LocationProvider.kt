package com.pramana.evidence.capture.metadata

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.location.GnssStatus
import android.location.Location
import android.location.LocationManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import androidx.core.content.ContextCompat
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import com.google.android.gms.tasks.CancellationTokenSource
import kotlin.coroutines.resume
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlin.math.sqrt

/**
 * Fetches a single fresh, high-accuracy location fix and the concurrent
 * GNSS constellation status (Section 3.2 §3; Section 5 step 0's "warm up
 * GNSS, require ≥8 satellites used and accuracy ≤ 20 m before arming").
 *
 * v0.1 note: [gnssRawSummary] uses `GnssStatus` (satellite count,
 * constellation mix, mean/stddev C/N0) which is available on-device with
 * no backend. Raw `GnssMeasurementsEvent` (carrier-phase / AGC-level
 * analysis) is a deeper API this release does not consume — the schema
 * field `agc_level_db` is therefore always null in v0.1; see
 * `docs/threat-model.md` §3.
 */
class LocationProvider(private val context: Context) {

    private val fusedClient = LocationServices.getFusedLocationProviderClient(context)
    private val mainHandler = Handler(Looper.getMainLooper())

    fun hasLocationPermission(): Boolean =
        ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED

    suspend fun getCurrentFix(): Location? {
        if (!hasLocationPermission()) return null
        return suspendCancellableCoroutine { cont ->
            val cancellationSource = CancellationTokenSource()
            cont.invokeOnCancellation { cancellationSource.cancel() }
            fusedClient.getCurrentLocation(Priority.PRIORITY_HIGH_ACCURACY, cancellationSource.token)
                .addOnSuccessListener { location -> if (cont.isActive) cont.resume(location) }
                .addOnFailureListener { if (cont.isActive) cont.resume(null) }
        }
    }

    /** Collects one GNSS status snapshot within [timeoutMs], or null if no callback fires in time (e.g. no sky view). */
    suspend fun gnssRawSummary(timeoutMs: Long = 4000): GnssSummary? {
        if (!hasLocationPermission()) return null
        val lm = context.getSystemService(Context.LOCATION_SERVICE) as? LocationManager ?: return null
        return kotlinx.coroutines.withTimeoutOrNull(timeoutMs) {
            suspendCancellableCoroutine { cont ->
                val callback = object : GnssStatus.Callback() {
                    override fun onSatelliteStatusChanged(status: GnssStatus) {
                        var satellitesUsed = 0
                        val cn0Values = mutableListOf<Float>()
                        val constellations = mutableSetOf<String>()
                        for (i in 0 until status.satelliteCount) {
                            if (status.usedInFix(i)) satellitesUsed++
                            cn0Values += status.getCn0DbHz(i)
                            constellations += constellationName(status.getConstellationType(i))
                        }
                        if (cont.isActive) {
                            cont.resume(
                                GnssSummary(
                                    satellitesVisible = status.satelliteCount,
                                    satellitesUsed = satellitesUsed,
                                    constellations = constellations.toList(),
                                    cn0Mean = if (cn0Values.isEmpty()) 0f else cn0Values.average().toFloat(),
                                    cn0Stddev = stddev(cn0Values),
                                ),
                            )
                            try { lm.unregisterGnssStatusCallback(this) } catch (e: Exception) { /* already unregistered */ }
                        }
                    }
                }

                try {
                    lm.registerGnssStatusCallback(callback, mainHandler)
                } catch (e: SecurityException) {
                    cont.resume(null)
                    return@suspendCancellableCoroutine
                }

                cont.invokeOnCancellation {
                    try { lm.unregisterGnssStatusCallback(callback) } catch (e: Exception) { /* already unregistered */ }
                }
            }
        }
    }

    /** [Location.isMock] (API 31+) / [Location.isFromMockProvider] fallback, checked per-fix per Section 7.2. */
    fun isMockLocation(location: Location): Boolean {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            location.isMock
        } else {
            @Suppress("DEPRECATION")
            location.isFromMockProvider
        }
    }

    private fun stddev(values: List<Float>): Float {
        if (values.size < 2) return 0f
        val mean = values.average()
        val variance = values.sumOf { (it - mean) * (it - mean) } / values.size
        return sqrt(variance).toFloat()
    }

    private fun constellationName(type: Int): String = when (type) {
        GnssStatus.CONSTELLATION_GPS -> "GPS"
        GnssStatus.CONSTELLATION_GLONASS -> "GLONASS"
        GnssStatus.CONSTELLATION_GALILEO -> "GALILEO"
        GnssStatus.CONSTELLATION_BEIDOU -> "BEIDOU"
        GnssStatus.CONSTELLATION_QZSS -> "QZSS"
        GnssStatus.CONSTELLATION_IRNSS -> "NAVIC"
        GnssStatus.CONSTELLATION_SBAS -> "SBAS"
        else -> "UNKNOWN"
    }

    data class GnssSummary(
        val satellitesVisible: Int,
        val satellitesUsed: Int,
        val constellations: List<String>,
        val cn0Mean: Float,
        val cn0Stddev: Float,
    )
}
