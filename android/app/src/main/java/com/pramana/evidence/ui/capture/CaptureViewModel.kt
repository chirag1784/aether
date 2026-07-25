package com.pramana.evidence.ui.capture

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.pramana.evidence.PramanaApplication
import com.pramana.evidence.capture.CameraController
import com.pramana.evidence.capture.EvidencePipeline
import com.pramana.evidence.crypto.Uuid7
import com.pramana.evidence.data.AppPreferences
import com.pramana.evidence.data.SessionStatus
import com.pramana.evidence.envelope.AssignmentContext
import com.pramana.evidence.envelope.ConsentArtefact
import com.pramana.evidence.envelope.ContextInfo
import com.pramana.evidence.envelope.OperatorContext
import com.pramana.evidence.envelope.OperatorRole
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import java.time.Instant

data class CaptureUiState(
    val shotsTaken: Int = 0,
    val busy: Boolean = false,
    val lastError: String? = null,
)

class CaptureViewModel(application: Application) : AndroidViewModel(application) {
    private val db = (application as PramanaApplication).database
    private val appPreferences = AppPreferences(application)

    val cameraController = CameraController(application)
    private val pipeline = EvidencePipeline(application, cameraController)

    private val _state = MutableStateFlow(CaptureUiState())
    val state: StateFlow<CaptureUiState> = _state.asStateFlow()

    fun capture(sessionId: String) {
        if (_state.value.busy) return
        _state.value = _state.value.copy(busy = true, lastError = null)
        viewModelScope.launch {
            try {
                val session = db.sessionDao().get(sessionId)
                val role = runCatching { OperatorRole.valueOf(session?.operatorRole ?: "POLICYHOLDER") }.getOrDefault(OperatorRole.POLICYHOLDER)

                val contextInfo = ContextInfo(
                    operator = OperatorContext(
                        userId = appPreferences.operatorNameFlow.first() ?: "unknown",
                        displayName = session?.operatorName ?: "Operator",
                        role = role,
                    ),
                    assignment = AssignmentContext(
                        claimNumber = session?.claimNumber,
                        policyNumber = session?.policyNumber,
                        vehicleRegNo = session?.vehicleRegNo,
                        checklistTemplateId = session?.checklistTemplateId,
                    ),
                )

                val consent = ConsentArtefact(
                    artefactId = Uuid7.generate(),
                    purposes = listOf("INSURANCE_CLAIM_ASSESSMENT"),
                    noticeVersion = appPreferences.noticeVersion,
                    givenAt = Instant.now().toString(),
                    givenBy = "operator:${session?.operatorName ?: "unknown"}",
                )

                val nextSeq = _state.value.shotsTaken + 1
                val (asset, _) = pipeline.capturePhoto(sessionId, nextSeq, contextInfo, consent)
                db.assetDao().upsert(asset)

                session?.let {
                    db.sessionDao().update(it.copy(status = SessionStatus.SEALED, updatedAtUtc = Instant.now().toString()))
                }

                _state.value = _state.value.copy(shotsTaken = nextSeq, busy = false)
            } catch (e: Exception) {
                _state.value = _state.value.copy(busy = false, lastError = e.message ?: "Capture failed")
            }
        }
    }

    override fun onCleared() {
        super.onCleared()
        cameraController.unbind()
    }
}
