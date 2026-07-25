package com.pramana.evidence.capture.metadata

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.telephony.CellInfoLte
import android.telephony.CellInfoNr
import android.telephony.TelephonyManager
import androidx.core.content.ContextCompat
import com.pramana.evidence.envelope.CellInfo
import com.pramana.evidence.envelope.NetworkInfo

/**
 * Section 3.2 §6 NETWORK — a secondary, independent connectivity and
 * (coarse) geolocation cross-check. v0.1 does not enumerate nearby Wi-Fi
 * BSSIDs (would require `ACCESS_WIFI_STATE`, a permission not otherwise
 * needed by this app — kept off the manifest per data-minimisation) or
 * compute a public-IP hash (would require a network call to an external
 * "what's my IP" service, which this offline-capable client-only release
 * does not make). Both fields are therefore always empty/null in v0.1;
 * see `docs/compliance-matrix.md`.
 */
class NetworkInfoProvider(private val context: Context) {

    fun snapshot(): NetworkInfo {
        val cm = context.getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager
        val network = cm?.activeNetwork
        val caps = network?.let { cm.getNetworkCapabilities(it) }

        val connectionType = when {
            caps == null -> "OFFLINE"
            caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) -> "WIFI"
            caps.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) -> cellularGeneration()
            else -> "OTHER"
        }

        return NetworkInfo(
            cell = readCellInfo(),
            wifiScanBssidHashes = emptyList(),
            publicIpHash = null,
            ipGeoCountry = null,
            connectionType = connectionType,
        )
    }

    private fun cellularGeneration(): String {
        val tm = context.getSystemService(Context.TELEPHONY_SERVICE) as? TelephonyManager ?: return "CELLULAR"
        return try {
            when (tm.dataNetworkType) {
                TelephonyManager.NETWORK_TYPE_LTE -> "LTE"
                TelephonyManager.NETWORK_TYPE_NR -> "5G"
                else -> "CELLULAR"
            }
        } catch (e: SecurityException) {
            "CELLULAR"
        }
    }

    private fun readCellInfo(): CellInfo? {
        if (ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            return null
        }
        val tm = context.getSystemService(Context.TELEPHONY_SERVICE) as? TelephonyManager ?: return null
        return try {
            val cells = tm.allCellInfo ?: return null
            val cell = cells.firstOrNull { it.isRegistered } ?: cells.firstOrNull() ?: return null
            when (cell) {
                is CellInfoLte -> CellInfo(
                    mcc = cell.cellIdentity.mccString,
                    mnc = cell.cellIdentity.mncString,
                    lacTac = cell.cellIdentity.tac.takeIf { it != Int.MAX_VALUE },
                    cid = cell.cellIdentity.ci.toLong().takeIf { it != Int.MAX_VALUE.toLong() },
                    operator = tm.networkOperatorName,
                    signalDbm = cell.cellSignalStrength.dbm,
                )
                is CellInfoNr -> CellInfo(
                    mcc = null,
                    mnc = null,
                    lacTac = null,
                    cid = null,
                    operator = tm.networkOperatorName,
                    signalDbm = cell.cellSignalStrength.dbm,
                )
                else -> CellInfo(
                    mcc = null, mnc = null, lacTac = null, cid = null,
                    operator = tm.networkOperatorName, signalDbm = null,
                )
            }
        } catch (e: SecurityException) {
            null
        }
    }
}
