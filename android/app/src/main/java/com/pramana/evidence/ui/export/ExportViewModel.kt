package com.pramana.evidence.ui.export

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.pramana.evidence.PramanaApplication
import com.pramana.evidence.data.SessionStatus
import com.pramana.evidence.export.ExportService
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import java.io.File
import java.time.Instant

data class ExportUiState(val busy: Boolean = false, val bundleFile: File? = null, val error: String? = null)

class ExportViewModel(application: Application) : AndroidViewModel(application) {
    private val db = (application as PramanaApplication).database
    private val exportService = ExportService(application)

    private val _state = MutableStateFlow(ExportUiState())
    val state: StateFlow<ExportUiState> = _state.asStateFlow()

    fun generate(sessionId: String) {
        _state.value = ExportUiState(busy = true)
        viewModelScope.launch {
            try {
                val session = db.sessionDao().get(sessionId) ?: error("Session not found")
                val assets = db.assetDao().allForSession(sessionId).filter { !it.deleted }
                val bundle = exportService.buildBundle(session, assets)
                db.sessionDao().update(session.copy(status = SessionStatus.CERTIFIED, updatedAtUtc = Instant.now().toString()))
                _state.value = ExportUiState(busy = false, bundleFile = bundle)
            } catch (e: Exception) {
                _state.value = ExportUiState(busy = false, error = e.message ?: "Export failed")
            }
        }
    }
}
