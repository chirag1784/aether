package com.pramana.evidence.ui.preflight

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.pramana.evidence.capture.EvidencePipeline
import com.pramana.evidence.capture.metadata.DeviceInfoProvider
import com.pramana.evidence.capture.metadata.LocationProvider
import com.pramana.evidence.crypto.StrongBoxSigner
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

data class PreflightState(
    val signingKeyReady: Boolean = false,
    val keystoreBacking: String? = null,
    val rootChecked: Boolean = false,
    val rootSuspicious: Boolean = false,
    val gnssSatellites: Int? = null,
    val gnssAccuracyKnown: Boolean = false,
    val done: Boolean = false,
    val reducedAssurance: Boolean = false,
)

class PreflightViewModel(application: Application) : AndroidViewModel(application) {
    private val strongBoxSigner = StrongBoxSigner(application)
    private val deviceInfoProvider = DeviceInfoProvider(application)
    private val locationProvider = LocationProvider(application)

    private val _state = MutableStateFlow(PreflightState())
    val state: StateFlow<PreflightState> = _state.asStateFlow()

    fun run() {
        viewModelScope.launch {
            val attestation = runCatching {
                strongBoxSigner.ensureKey(EvidencePipeline.SIGNING_KEY_ALIAS, StrongBoxSigner.freshChallenge())
            }.getOrNull()
            _state.value = _state.value.copy(
                signingKeyReady = attestation != null,
                keystoreBacking = attestation?.securityLevel?.name,
            )

            val root = deviceInfoProvider.let { it.snapshot(attestation?.securityLevel ?: com.pramana.evidence.envelope.KeystoreBacking.SOFTWARE, "pending").rootIndicators }
            val suspicious = root.suBinary || root.magisk || !root.selinuxEnforcing
            _state.value = _state.value.copy(rootChecked = true, rootSuspicious = suspicious)

            val gnss = runCatching { locationProvider.gnssRawSummary(timeoutMs = 6000) }.getOrNull()
            _state.value = _state.value.copy(gnssSatellites = gnss?.satellitesUsed, gnssAccuracyKnown = gnss != null)

            val reduced = attestation == null || suspicious || gnss == null || (gnss.satellitesUsed < 4)
            _state.value = _state.value.copy(done = true, reducedAssurance = reduced)
        }
    }
}
