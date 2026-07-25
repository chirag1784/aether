package com.pramana.evidence.ui.session

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.pramana.evidence.PramanaApplication
import com.pramana.evidence.crypto.Uuid7
import com.pramana.evidence.data.AppPreferences
import com.pramana.evidence.data.SessionEntity
import com.pramana.evidence.data.SessionStatus
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import java.time.Instant

class NewSessionViewModel(application: Application) : AndroidViewModel(application) {
    private val db = (application as PramanaApplication).database
    private val appPreferences = AppPreferences(application)

    fun createSession(
        claimNumber: String,
        policyNumber: String,
        vehicleRegNo: String,
        checklistTemplateId: String,
        onCreated: (String) -> Unit,
    ) {
        viewModelScope.launch {
            val role = appPreferences.roleFlow.first() ?: "POLICYHOLDER"
            val operatorName = appPreferences.operatorNameFlow.first() ?: "Operator"
            val sessionId = Uuid7.generate()
            val now = Instant.now().toString()
            db.sessionDao().upsert(
                SessionEntity(
                    sessionId = sessionId,
                    claimNumber = claimNumber.ifBlank { null },
                    policyNumber = policyNumber.ifBlank { null },
                    vehicleRegNo = vehicleRegNo.ifBlank { null },
                    operatorName = operatorName,
                    operatorRole = role,
                    checklistTemplateId = checklistTemplateId,
                    status = SessionStatus.DRAFT,
                    createdAtUtc = now,
                    updatedAtUtc = now,
                ),
            )
            onCreated(sessionId)
        }
    }
}
