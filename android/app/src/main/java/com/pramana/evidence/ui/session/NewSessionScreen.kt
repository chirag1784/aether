package com.pramana.evidence.ui.session

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.IconButton
import androidx.compose.material3.Icon
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.pramana.evidence.R

private val templates = listOf(
    "MOTOR_OD_STANDARD_v3" to R.string.checklist_template_motor,
    "PROPERTY_EHS_v1" to R.string.checklist_template_property,
    "DOCUMENT_v1" to R.string.checklist_template_document,
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun NewSessionScreen(onCreated: (String) -> Unit, onBack: () -> Unit, viewModel: NewSessionViewModel = viewModel()) {
    var claimNumber by remember { mutableStateOf("") }
    var policyNumber by remember { mutableStateOf("") }
    var vehicleRegNo by remember { mutableStateOf("") }
    var selectedTemplate by remember { mutableStateOf(templates.first().first) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(stringResource(R.string.new_session_title)) },
                navigationIcon = {
                    IconButton(onClick = onBack) { Icon(Icons.Filled.ArrowBack, contentDescription = null) }
                },
            )
        },
    ) { padding ->
        Column(
            Modifier
                .fillMaxSize()
                .padding(padding)
                .verticalScroll(rememberScrollState())
                .padding(24.dp),
        ) {
            OutlinedTextField(claimNumber, { claimNumber = it }, label = { Text(stringResource(R.string.field_claim_number)) }, modifier = Modifier.fillMaxWidth())
            Spacer(Modifier.height(12.dp))
            OutlinedTextField(policyNumber, { policyNumber = it }, label = { Text(stringResource(R.string.field_policy_number)) }, modifier = Modifier.fillMaxWidth())
            Spacer(Modifier.height(12.dp))
            OutlinedTextField(vehicleRegNo, { vehicleRegNo = it }, label = { Text(stringResource(R.string.field_vehicle_reg)) }, modifier = Modifier.fillMaxWidth())

            Spacer(Modifier.height(20.dp))
            Text("Checklist template", style = MaterialTheme.typography.titleSmall)
            Spacer(Modifier.height(8.dp))
            Column {
                templates.forEach { (id, labelRes) ->
                    FilterChip(
                        modifier = Modifier.padding(bottom = 8.dp),
                        selected = selectedTemplate == id,
                        onClick = { selectedTemplate = id },
                        label = { Text(stringResource(labelRes)) },
                    )
                }
            }

            Spacer(Modifier.height(24.dp))
            Button(
                onClick = {
                    viewModel.createSession(claimNumber, policyNumber, vehicleRegNo, selectedTemplate, onCreated)
                },
                modifier = Modifier.fillMaxWidth(),
            ) {
                Text(stringResource(R.string.action_start_preflight))
            }
        }
    }
}
