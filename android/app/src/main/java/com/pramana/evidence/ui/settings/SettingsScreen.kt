package com.pramana.evidence.ui.settings

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.pramana.evidence.R
import com.pramana.evidence.data.AppPreferences
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsScreen(onBack: () -> Unit) {
    val context = LocalContext.current
    val appPreferences = remember { AppPreferences(context) }
    val scope = rememberCoroutineScope()
    val withdrawn by appPreferences.consentWithdrawnFlow.collectAsState(initial = false)

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(stringResource(R.string.settings_title)) },
                navigationIcon = { IconButton(onClick = onBack) { Icon(Icons.Filled.ArrowBack, contentDescription = null) } },
            )
        },
    ) { padding ->
        Column(
            Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(24.dp),
        ) {
            Text(stringResource(R.string.settings_retention), style = MaterialTheme.typography.titleSmall)
            Text(
                "Sealed evidence is retained on this device until you export or delete it. Exported bundles and their draft certificates are retained under your organisation's claim-file retention policy.",
                style = MaterialTheme.typography.bodySmall,
            )
            Spacer(Modifier.height(24.dp))

            Text(if (withdrawn) "Consent withdrawn" else "Consent active", style = MaterialTheme.typography.bodyMedium)
            Spacer(Modifier.height(8.dp))
            OutlinedButton(
                onClick = { scope.launch { appPreferences.withdrawConsent() } },
                enabled = !withdrawn,
                modifier = Modifier.fillMaxWidth(),
            ) {
                Text(stringResource(R.string.settings_withdraw_consent))
            }

            Spacer(Modifier.height(12.dp))
            Text(
                "Data erasure: this v0.1 release is client-only — there is no backend copy of your data to erase remotely. To erase local data, uninstall the app or delete individual sessions from Home.",
                style = MaterialTheme.typography.bodySmall,
            )
        }
    }
}
