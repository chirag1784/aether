package com.pramana.evidence.ui.review

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.pramana.evidence.PramanaApplication
import com.pramana.evidence.data.AssetEntity
import com.pramana.evidence.vault.SealedVault
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

class ReviewViewModel(application: Application) : AndroidViewModel(application) {
    private val db = (application as PramanaApplication).database
    private val vault = SealedVault(application)

    fun assetsForSession(sessionId: String): StateFlow<List<AssetEntity>> =
        db.assetDao().observeForSession(sessionId)
            .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    /** Deletes an asset with a mandatory, logged reason (master brief rule 8). */
    fun deleteAsset(asset: AssetEntity, reason: String) {
        viewModelScope.launch {
            vault.delete(asset.sessionId, "${asset.envelopeId}.jpg")
            // The envelope JSON itself is retained (never deleted) so the
            // custody gap this deletion creates remains explainable —
            // only the asset bytes are removed.
            db.assetDao().update(asset.copy(deleted = true, deleteReason = reason))
        }
    }
}
