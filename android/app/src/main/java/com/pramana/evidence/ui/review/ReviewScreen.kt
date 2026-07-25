package com.pramana.evidence.ui.review

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.pramana.evidence.R
import com.pramana.evidence.data.AssetEntity

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ReviewScreen(
    sessionId: String,
    onAddMore: () -> Unit,
    onExport: () -> Unit,
    onBack: () -> Unit,
    viewModel: ReviewViewModel = viewModel(),
) {
    val assets by viewModel.assetsForSession(sessionId).collectAsState()
    var pendingDelete by remember { mutableStateOf<AssetEntity?>(null) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(stringResource(R.string.review_title)) },
                navigationIcon = { IconButton(onClick = onBack) { Icon(Icons.Filled.ArrowBack, contentDescription = null) } },
            )
        },
        floatingActionButton = {
            FloatingActionButton(onClick = onAddMore) { Text("+") }
        },
    ) { padding ->
        Column(Modifier.padding(padding)) {
            LazyColumn(
                modifier = Modifier.weight(1f, fill = true),
                contentPadding = PaddingValues(16.dp),
            ) {
                items(assets, key = { it.envelopeId }) { asset ->
                    AssetRow(asset, onDelete = { pendingDelete = asset })
                }
            }
            Button(
                onClick = onExport,
                enabled = assets.isNotEmpty(),
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(16.dp),
            ) {
                Text(stringResource(R.string.export_title))
            }
        }
    }

    pendingDelete?.let { asset ->
        DeleteReasonDialog(
            onConfirm = { reason ->
                viewModel.deleteAsset(asset, reason)
                pendingDelete = null
            },
            onDismiss = { pendingDelete = null },
        )
    }
}

@Composable
private fun AssetRow(asset: AssetEntity, onDelete: () -> Unit) {
    Card(modifier = Modifier.fillMaxWidth().padding(vertical = 6.dp)) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(12.dp),
            horizontalArrangement = androidx.compose.foundation.layout.Arrangement.SpaceBetween,
        ) {
            Column {
                Text(asset.filename, style = MaterialTheme.typography.titleSmall)
                Text(assuranceLabel(asset.assuranceLevel), style = MaterialTheme.typography.bodySmall)
                Text(asset.sha256.take(16) + "…", style = MaterialTheme.typography.bodySmall)
            }
            IconButton(onClick = onDelete) {
                Icon(Icons.Filled.Delete, contentDescription = stringResource(R.string.review_delete))
            }
        }
    }
}

@Composable
private fun assuranceLabel(level: String): String = when (level) {
    "HIGH" -> stringResource(R.string.assurance_high)
    "MEDIUM" -> stringResource(R.string.assurance_medium)
    else -> stringResource(R.string.assurance_low)
}

@Composable
private fun DeleteReasonDialog(onConfirm: (String) -> Unit, onDismiss: () -> Unit) {
    var reason by remember { mutableStateOf("") }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(stringResource(R.string.review_delete)) },
        text = {
            OutlinedTextField(
                value = reason,
                onValueChange = { reason = it },
                label = { Text(stringResource(R.string.review_delete_reason_prompt)) },
            )
        },
        confirmButton = {
            TextButton(onClick = { onConfirm(reason.ifBlank { "No reason given" }) }) { Text(stringResource(R.string.review_delete)) }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } },
    )
}
