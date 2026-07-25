package com.pramana.evidence.capture.metadata

import android.content.Context
import android.content.pm.PackageManager
import android.content.pm.Signature
import android.os.Build
import com.pramana.evidence.crypto.HashEngine

/**
 * Reads this APK's own signing certificate and hashes it — the
 * `device.app_signing_cert_sha256` field (Section 3.2 §4). Lets a verifier
 * confirm the exact build that produced a capture, independent of the
 * `versionName`/`versionCode` strings alone (which are self-reported and
 * unattested; the signing cert hash is not, because forging it requires
 * the signing key).
 */
object AppSigningCertProvider {

    fun signingCertSha256(context: Context): String {
        val signature = signingCertificate(context) ?: return "unknown"
        return HashEngine.sha256Hex(signature.toByteArray())
    }

    private fun signingCertificate(context: Context): Signature? {
        return try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                val info = context.packageManager.getPackageInfo(
                    context.packageName, PackageManager.GET_SIGNING_CERTIFICATES,
                )
                val signingInfo = info.signingInfo ?: return null
                (if (signingInfo.hasMultipleSigners()) signingInfo.apkContentsSigners else signingInfo.signingCertificateHistory)
                    .firstOrNull()
            } else {
                @Suppress("DEPRECATION")
                val info = context.packageManager.getPackageInfo(context.packageName, PackageManager.GET_SIGNATURES)
                @Suppress("DEPRECATION")
                info.signatures?.firstOrNull()
            }
        } catch (e: Exception) {
            null
        }
    }
}
