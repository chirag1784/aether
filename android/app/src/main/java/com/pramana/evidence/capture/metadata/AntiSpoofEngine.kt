package com.pramana.evidence.capture.metadata

import android.content.Context
import android.content.pm.PackageManager
import android.location.Location
import android.provider.Settings
import com.pramana.evidence.envelope.AntiSpoofInfo
import com.pramana.evidence.envelope.SpoofVerdict

/**
 * Section 7.2 anti-spoof scoring engine. Produces [AntiSpoofInfo] for the
 * envelope's `location.anti_spoof` block. This is advisory risk-scoring,
 * not a certainty oracle — see `docs/threat-model.md` §3 for the honest
 * residual-risk statement, and note the master brief's explicit rule
 * (Section 7.2): mock-location status is checked on **every** fix, never
 * sampled, because spoofers alternate real and mock fixes specifically to
 * defeat spot checks.
 */
class AntiSpoofEngine(private val context: Context) {

    fun evaluate(
        location: Location,
        isMock: Boolean,
        gnss: LocationProvider.GnssSummary?,
        networkFixDistanceM: Float?,
    ): AntiSpoofInfo {
        val mockApps = mockLocationCapablePackages()
        val devOptions = isDeveloperOptionsEnabled()

        var risk = 0f
        if (isMock) risk += 0.9f
        if (mockApps.isNotEmpty()) risk += 0.15f
        if (devOptions) risk += 0.05f

        gnss?.let {
            // Suspiciously uniform C/N0 across all satellites is a classic
            // spoofing signature (master brief, Section 7.2).
            if (it.cn0Stddev < 1.0f && it.satellitesVisible >= 4) risk += 0.3f
            if (it.satellitesUsed < 4) risk += 0.15f
            if (it.constellations.size <= 1) risk += 0.05f
        }
        if (gnss == null) risk += 0.1f // no sky view / indoors — not proof of spoofing, but reduces confidence

        networkFixDistanceM?.let { distance ->
            if (distance > 500f) risk += 0.25f
        }

        risk = risk.coerceIn(0f, 1f)

        val verdict = when {
            isMock -> SpoofVerdict.SPOOFED
            risk >= 0.5f -> SpoofVerdict.SUSPECT
            else -> SpoofVerdict.CLEAN
        }

        return AntiSpoofInfo(
            isMock = isMock,
            mockAppsInstalled = mockApps,
            devOptionsEnabled = devOptions,
            gnssSatellitesVisible = gnss?.satellitesVisible,
            gnssSatellitesUsed = gnss?.satellitesUsed,
            constellations = gnss?.constellations ?: emptyList(),
            cn0MeanDbhz = gnss?.cn0Mean,
            cn0StddevDbhz = gnss?.cn0Stddev,
            agcLevelDb = null, // requires GnssMeasurementsEvent raw analysis — not implemented in v0.1, see threat-model.md
            rawMeasurementsAvailable = false,
            gnssVsNetworkDeltaM = networkFixDistanceM,
            spoofRiskScore = risk,
            spoofVerdict = verdict,
        )
    }

    /**
     * Best-effort enumeration of installed apps that declare the legacy
     * `ACCESS_MOCK_LOCATION` permission. Modern Android's "select mock
     * location app" developer setting does not expose *which* app is
     * currently selected via a public API without a privileged
     * permission, so this is necessarily a superset (apps *capable* of
     * mocking location), not a precise "is currently mocking" signal —
     * disclosed here rather than left unstated.
     */
    private fun mockLocationCapablePackages(): List<String> {
        return try {
            val pm = context.packageManager
            @Suppress("DEPRECATION")
            val packages = pm.getInstalledPackages(PackageManager.GET_PERMISSIONS)
            packages.filter { pkg ->
                pkg.requestedPermissions?.contains("android.permission.ACCESS_MOCK_LOCATION") == true
            }.map { it.packageName }
        } catch (e: Exception) {
            emptyList()
        }
    }

    private fun isDeveloperOptionsEnabled(): Boolean = try {
        Settings.Global.getInt(context.contentResolver, Settings.Global.DEVELOPMENT_SETTINGS_ENABLED, 0) != 0
    } catch (e: Exception) {
        false
    }

    companion object {
        fun distanceMeters(a: Location, b: Location): Float = a.distanceTo(b)
    }
}
