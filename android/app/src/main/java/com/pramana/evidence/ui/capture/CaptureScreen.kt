package com.pramana.evidence.ui.capture

import android.view.WindowManager
import androidx.camera.view.PreviewView
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.lifecycle.viewmodel.compose.viewModel
import com.pramana.evidence.R

/**
 * Section 5 step 2-3 UI. [android.view.WindowManager.LayoutParams.FLAG_SECURE]
 * is applied for the lifetime of this screen (Section 7.3 / threat-model.md
 * §6: blocks screen recording of the live capture flow, not photographing
 * the screen from another device).
 */
@Composable
fun CaptureScreen(sessionId: String, onDone: () -> Unit, viewModel: CaptureViewModel = viewModel()) {
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current
    val state by viewModel.state.collectAsState()
    val previewView = remember { PreviewView(context) }

    LaunchedEffect(Unit) {
        viewModel.cameraController.bind(lifecycleOwner, previewView)
    }

    DisposableEffect(Unit) {
        val window = (context as? android.app.Activity)?.window
        window?.setFlags(WindowManager.LayoutParams.FLAG_SECURE, WindowManager.LayoutParams.FLAG_SECURE)
        onDispose {
            window?.clearFlags(WindowManager.LayoutParams.FLAG_SECURE)
        }
    }

    Box(Modifier.fillMaxSize()) {
        AndroidView(modifier = Modifier.fillMaxSize(), factory = { previewView })

        Column(
            Modifier
                .fillMaxSize()
                .padding(24.dp),
        ) {
            Box(Modifier.fillMaxWidth()) {
                Text(
                    "${state.shotsTaken} captured",
                    color = Color.White,
                    style = MaterialTheme.typography.labelLarge,
                )
            }

            Box(Modifier.fillMaxSize(), contentAlignment = Alignment.BottomCenter) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    state.lastError?.let {
                        Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
                    }
                    if (state.busy) {
                        CircularProgressIndicator(color = Color.White)
                    } else {
                        Button(onClick = { viewModel.capture(sessionId) }) {
                            Text(stringResource(R.string.capture_shutter_cd))
                        }
                    }
                    Button(onClick = onDone, modifier = Modifier.padding(top = 12.dp)) {
                        Text(stringResource(R.string.review_title))
                    }
                }
            }
        }
    }
}
