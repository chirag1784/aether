package com.pramana.evidence.capture.metadata

import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.provider.Settings
import com.pramana.evidence.BuildConfig
import com.pramana.evidence.crypto.HashEngine
import com.pramana.evidence.envelope.DeviceInfo
import com.pramana.evidence.envelope.KeystoreBacking
import com.pramana.evidence.envelope.RootIndicators
import java.io.File
import java.util.UUID

/**
 * Populates [DeviceInfo] (Section 3.2 §4) — the evidentiary basis for the
 * BSA §63(2) "device in regular use, working properly" attestation
 * (`docs/compliance-matrix.md` §1).
 *
 * [rootIndicators] implements the heuristic checks from Section 7.1; see
 * `docs/threat-model.md` §1 for the honest residual-risk statement — these
 * checks raise the bar, they do not guarantee detection.
 */
class DeviceInfoProvider(private val context: Context) {

    private val installIdPrefs by lazy {
        context.getSharedPreferences("pramana_device", Context.MODE_PRIVATE)
    }

    /** Stable per-install identifier — regenerated only if the app is reinstalled. Never the hardware serial. */
    fun installId(): String {
        val existing = installIdPrefs.getString(KEY_INSTALL_ID, null)
        if (existing != null) return existing
        val fresh = UUID.randomUUID().toString()
        installIdPrefs.edit().putString(KEY_INSTALL_ID, fresh).apply()
        return fresh
    }

    fun snapshot(keystoreBacking: KeystoreBacking, appSigningCertSha256: String): DeviceInfo {
        return DeviceInfo(
            manufacturer = Build.MANUFACTURER,
            model = Build.MODEL,
            device = Build.DEVICE,
            androidRelease = Build.VERSION.RELEASE,
            sdkInt = Build.VERSION.SDK_INT,
            securityPatch = Build.VERSION.SECURITY_PATCH ?: "unknown",
            buildFingerprint = Build.FINGERPRINT,
            hardwareSerialHash = hashedPseudoSerial(),
            installId = installId(),
            appVersionName = BuildConfig.VERSION_NAME,
            appVersionCode = BuildConfig.VERSION_CODE.toLong(),
            appSigningCertSha256 = appSigningCertSha256,
            isDebuggable = (context.applicationInfo.flags and android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE) != 0,
            keystoreBacking = keystoreBacking,
            rootIndicators = rootIndicators(),
            developerMode = isDeveloperModeEnabled(),
            adbEnabled = isAdbEnabled(),
            vpnActive = isVpnActive(),
            emulatorIndicators = emulatorIndicators(),
        )
    }

    /**
     * Android 10+ (this app's minSdk) does not expose a true hardware
     * serial to third-party apps without a privileged permission Pramāṇa
     * does not (and should not) request. [installId] is the stable,
     * privacy-preserving substitute; this hash exists only so the schema
     * field is never left silently empty and is clearly derived from a
     * per-install value, not a real IMEI/serial.
     */
    private fun hashedPseudoSerial(): String = HashEngine.sha256Hex(installId().toByteArray())

    private fun rootIndicators(): RootIndicators {
        val suPaths = listOf(
            "/system/bin/su", "/system/xbin/su", "/sbin/su",
            "/system/app/Superuser.apk", "/data/local/xbin/su", "/data/local/bin/su",
        )
        val suBinary = suPaths.any { File(it).exists() }
        val magiskPaths = listOf("/sbin/.magisk", "/data/adb/magisk", "/data/adb/modules")
        val magisk = magiskPaths.any { File(it).exists() }
        val testKeys = Build.TAGS?.contains("test-keys") == true
        val selinuxEnforcing = readSelinuxEnforcing()
        return RootIndicators(
            suBinary = suBinary,
            magisk = magisk,
            testKeys = testKeys,
            selinuxEnforcing = selinuxEnforcing,
            bootloaderLocked = null, // not reliably queryable without a privileged API; disclosed as unknown, never guessed
        )
    }

    private fun readSelinuxEnforcing(): Boolean {
        return try {
            File("/sys/fs/selinux/enforce").readText().trim() == "1"
        } catch (e: Exception) {
            true // fail closed: assume enforcing (the safe default) if unreadable, per "never silently upgrade assurance"
        }
    }

    private fun isDeveloperModeEnabled(): Boolean = try {
        Settings.Global.getInt(context.contentResolver, Settings.Global.DEVELOPMENT_SETTINGS_ENABLED, 0) != 0
    } catch (e: Exception) {
        false
    }

    private fun isAdbEnabled(): Boolean = try {
        Settings.Global.getInt(context.contentResolver, Settings.Global.ADB_ENABLED, 0) != 0
    } catch (e: Exception) {
        false
    }

    private fun isVpnActive(): Boolean {
        val cm = context.getSystemService(Context.CONNECTIVITY_SERVICE) as? android.net.ConnectivityManager ?: return false
        val network = cm.activeNetwork ?: return false
        val caps = cm.getNetworkCapabilities(network) ?: return false
        return caps.hasTransport(android.net.NetworkCapabilities.TRANSPORT_VPN)
    }

    private fun emulatorIndicators(): List<String> {
        val hits = mutableListOf<String>()
        if (Build.FINGERPRINT.startsWith("generic") || Build.FINGERPRINT.startsWith("unknown")) hits += "fingerprint"
        if (Build.MODEL.contains("google_sdk") || Build.MODEL.contains("Emulator") || Build.MODEL.contains("Android SDK built for x86")) hits += "model"
        if (Build.MANUFACTURER.contains("Genymotion")) hits += "manufacturer"
        if (Build.BRAND.startsWith("generic") && Build.DEVICE.startsWith("generic")) hits += "brand_device"
        if (Build.PRODUCT.equals("sdk", ignoreCase = true) || Build.PRODUCT.contains("sdk_gphone")) hits += "product"
        return hits
    }

    companion object {
        private const val KEY_INSTALL_ID = "install_id"
    }
}
