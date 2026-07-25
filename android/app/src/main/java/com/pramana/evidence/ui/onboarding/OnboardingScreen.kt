package com.pramana.evidence.ui.onboarding

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import com.pramana.evidence.R
import com.pramana.evidence.data.AppPreferences
import kotlinx.coroutines.launch
import java.time.Instant

private val roles = listOf(
    "SURVEYOR" to R.string.role_surveyor,
    "POLICYHOLDER" to R.string.role_policyholder,
    "INVESTIGATOR" to R.string.role_investigator,
    "ADVOCATE" to R.string.role_advocate,
    "EHS_OFFICER" to R.string.role_ehs,
)

@Composable
fun OnboardingScreen(onDone: () -> Unit) {
    val context = LocalContext.current
    val appPreferences = remember { AppPreferences(context) }
    val scope = rememberCoroutineScope()

    var selectedRole by remember { mutableStateOf("SURVEYOR") }
    var operatorName by remember { mutableStateOf("") }

    Column(
        Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(24.dp),
    ) {
        Text(stringRes(R.string.onboarding_title), style = MaterialTheme.typography.headlineSmall)
        Spacer(Modifier.height(12.dp))
        Text(stringRes(R.string.onboarding_body), style = MaterialTheme.typography.bodyMedium)
        Spacer(Modifier.height(20.dp))

        Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.errorContainer.copy(alpha = 0.15f))) {
            Column(Modifier.padding(16.dp)) {
                Text(stringRes(R.string.consent_disclaimer_title), style = MaterialTheme.typography.titleSmall)
                Spacer(Modifier.height(6.dp))
                Text(stringRes(R.string.consent_disclaimer_body), style = MaterialTheme.typography.bodySmall)
            }
        }
        Spacer(Modifier.height(20.dp))

        Text(stringRes(R.string.onboarding_role_prompt), style = MaterialTheme.typography.titleMedium)
        Spacer(Modifier.height(8.dp))
        Column {
            roles.forEach { (key, labelRes) ->
                FilterChip(
                    modifier = Modifier.padding(bottom = 8.dp),
                    selected = selectedRole == key,
                    onClick = { selectedRole = key },
                    label = { Text(stringRes(labelRes)) },
                )
            }
        }

        Spacer(Modifier.height(20.dp))
        androidx.compose.material3.OutlinedTextField(
            value = operatorName,
            onValueChange = { operatorName = it },
            label = { Text(stringRes(com.pramana.evidence.R.string.field_operator_name)) },
            modifier = Modifier.fillMaxWidth(),
        )

        Spacer(Modifier.height(28.dp))
        Button(
            onClick = {
                scope.launch {
                    appPreferences.completeOnboarding(
                        role = selectedRole,
                        operatorName = operatorName.ifBlank { "Operator" },
                        consentGivenAtIso = Instant.now().toString(),
                    )
                    onDone()
                }
            },
            enabled = operatorName.isNotBlank(),
            modifier = Modifier.fillMaxWidth(),
        ) {
            Text(stringRes(R.string.consent_accept))
        }
    }
}

@Composable
private fun stringRes(id: Int): String = androidx.compose.ui.res.stringResource(id)
