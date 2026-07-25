package com.pramana.evidence.data

import android.content.Context
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map

private val Context.dataStore by preferencesDataStore(name = "pramana_prefs")

/**
 * DPDP-relevant app-level preferences (Section 10, screen 13 "Settings";
 * Section 1.4). [consentWithdrawnFlow] and the withdraw/erase functions
 * back the local, client-side consent-withdrawal and erasure-request UI —
 * a backend-enforced retention/erasure job is a P7 deliverable not built
 * in v0.1 (`docs/compliance-matrix.md`).
 */
class AppPreferences(private val context: Context) {

    private object Keys {
        val ONBOARDED = booleanPreferencesKey("onboarded")
        val ROLE = stringPreferencesKey("role")
        val OPERATOR_NAME = stringPreferencesKey("operator_name")
        val LANGUAGE = stringPreferencesKey("language")
        val CONSENT_GIVEN_AT = stringPreferencesKey("consent_given_at")
        val CONSENT_WITHDRAWN = booleanPreferencesKey("consent_withdrawn")

        const val NOTICE_VERSION = "2026-07-01"
    }

    val noticeVersion: String get() = Keys.NOTICE_VERSION

    val onboardedFlow: Flow<Boolean> = context.dataStore.data.map { it[Keys.ONBOARDED] ?: false }
    val roleFlow: Flow<String?> = context.dataStore.data.map { it[Keys.ROLE] }
    val operatorNameFlow: Flow<String?> = context.dataStore.data.map { it[Keys.OPERATOR_NAME] }
    val languageFlow: Flow<String> = context.dataStore.data.map { it[Keys.LANGUAGE] ?: "en" }
    val consentWithdrawnFlow: Flow<Boolean> = context.dataStore.data.map { it[Keys.CONSENT_WITHDRAWN] ?: false }

    suspend fun completeOnboarding(role: String, operatorName: String, consentGivenAtIso: String) {
        context.dataStore.edit {
            it[Keys.ONBOARDED] = true
            it[Keys.ROLE] = role
            it[Keys.OPERATOR_NAME] = operatorName
            it[Keys.CONSENT_GIVEN_AT] = consentGivenAtIso
            it[Keys.CONSENT_WITHDRAWN] = false
        }
    }

    suspend fun setLanguage(languageTag: String) {
        context.dataStore.edit { it[Keys.LANGUAGE] = languageTag }
    }

    suspend fun withdrawConsent() {
        context.dataStore.edit { it[Keys.CONSENT_WITHDRAWN] = true }
    }
}
