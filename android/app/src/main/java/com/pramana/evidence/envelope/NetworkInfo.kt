package com.pramana.evidence.envelope

import kotlinx.serialization.Serializable

/**
 * §6 NETWORK (Section 3.2) — a secondary, independent geolocation and
 * connectivity cross-check.
 *
 * DPDP data-minimisation note: [wifiScanBssidHashes] and [publicIpHash]
 * are hashed, never stored raw, per the master brief's explicit
 * instruction (Section 3.2 comment: "hashed for DPDP").
 */
@Serializable
data class NetworkInfo(
    val cell: CellInfo? = null,
    val wifiScanBssidHashes: List<String> = emptyList(),
    val publicIpHash: String? = null,
    val ipGeoCountry: String? = null,
    val connectionType: String,
)

@Serializable
data class CellInfo(
    val mcc: String?,
    val mnc: String?,
    val lacTac: Int?,
    val cid: Long?,
    val operator: String?,
    val signalDbm: Int?,
)
