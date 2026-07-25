package com.pramana.evidence.ui.preflight

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.pramana.evidence.R
import com.pramana.evidence.ui.theme.PramanaAmberSuspect
import com.pramana.evidence.ui.theme.PramanaGreenClean

@Composable
fun PreflightScreen(sessionId: String, onReady: () -> Unit, viewModel: PreflightViewModel = viewModel()) {
    val state by viewModel.state.collectAsState()

    LaunchedEffect(sessionId) { viewModel.run() }

    Column(
        Modifier
            .fillMaxSize()
            .padding(24.dp),
        verticalArrangement = Arrangement.Center,
    ) {
        Text(stringResource(R.string.preflight_title), style = MaterialTheme.typography.headlineSmall)
        Spacer(Modifier.height(24.dp))

        StepRow(stringResource(R.string.preflight_signing_key), done = state.signingKeyReady)
        Spacer(Modifier.height(12.dp))
        StepRow(
            stringResource(R.string.preflight_root_check) + if (state.rootChecked && state.rootSuspicious) "  ⚠" else "",
            done = state.rootChecked,
        )
        Spacer(Modifier.height(12.dp))
        StepRow(
            if (state.gnssAccuracyKnown) {
                "${state.gnssSatellites ?: 0} satellites used"
            } else {
                stringResource(R.string.preflight_gnss)
            },
            done = state.gnssAccuracyKnown,
        )

        Spacer(Modifier.height(32.dp))

        if (state.done) {
            Text(
                if (state.reducedAssurance) stringResource(R.string.preflight_reduced) else stringResource(R.string.preflight_ready),
                color = if (state.reducedAssurance) PramanaAmberSuspect else PramanaGreenClean,
                style = MaterialTheme.typography.titleMedium,
            )
            Spacer(Modifier.height(16.dp))
            Button(onClick = onReady, modifier = Modifier.fillMaxWidth()) {
                Text(stringResource(R.string.preflight_continue))
            }
        }
    }
}

@Composable
private fun StepRow(label: String, done: Boolean) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        if (done) {
            Icon(Icons.Filled.Check, contentDescription = null, tint = PramanaGreenClean)
        } else {
            CircularProgressIndicator(modifier = Modifier.height(20.dp).width(20.dp), strokeWidth = 2.dp)
        }
        Spacer(Modifier.width(8.dp))
        Text(label)
    }
}
