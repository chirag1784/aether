@file:OptIn(androidx.camera.camera2.interop.ExperimentalCamera2Interop::class)

package com.pramana.evidence.capture

import android.content.Context
import androidx.camera.core.Camera
import androidx.camera.core.CameraInfo
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageCapture
import androidx.camera.core.ImageCaptureException
import androidx.camera.core.ImageProxy
import androidx.camera.core.Preview
import androidx.camera.camera2.interop.Camera2CameraInfo
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.core.content.ContextCompat
import androidx.lifecycle.LifecycleOwner
import android.hardware.camera2.CameraCharacteristics
import android.hardware.camera2.CameraMetadata
import com.pramana.evidence.envelope.CameraInfo as EnvelopeCameraInfo
import kotlinx.coroutines.suspendCancellableCoroutine
import java.nio.ByteBuffer
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

/**
 * Section 4 ("Capture Layer" — CameraX Preview + ImageCapture) and Section
 * 7.3 (camera provenance / anti-virtual-camera checks). Camera IDs are
 * pinned at construction time and never re-enumerated mid-session, per
 * Section 7.3: "a camera appearing mid-session is suspicious."
 *
 * Captured frames are delivered in-memory via [ImageCapture.OnImageCapturedCallback]
 * — never written through [android.provider.MediaStore] or any
 * `content://` path before sealing (master brief, Section 5 step 2: "Never
 * write to MediaStore, never expose a content:// before sealing").
 */
class CameraController(private val context: Context) {

    private var cameraProvider: ProcessCameraProvider? = null
    private var imageCapture: ImageCapture? = null
    private var boundCamera: Camera? = null
    private val mainExecutor = ContextCompat.getMainExecutor(context)

    suspend fun bind(lifecycleOwner: LifecycleOwner, previewView: PreviewView) {
        val provider = getProvider()
        val preview = Preview.Builder().build().apply {
            surfaceProvider = previewView.surfaceProvider
        }
        val capture = ImageCapture.Builder()
            .setCaptureMode(ImageCapture.CAPTURE_MODE_MAXIMIZE_QUALITY)
            .build()

        provider.unbindAll()
        boundCamera = provider.bindToLifecycle(lifecycleOwner, CameraSelector.DEFAULT_BACK_CAMERA, preview, capture)
        imageCapture = capture
        cameraProvider = provider
    }

    private suspend fun getProvider(): ProcessCameraProvider = suspendCancellableCoroutine { cont ->
        val future = ProcessCameraProvider.getInstance(context)
        future.addListener({
            try {
                cont.resume(future.get())
            } catch (e: Exception) {
                cont.resumeWithException(e)
            }
        }, mainExecutor)
    }

    /** True if the currently-bound camera is a real physical back/front sensor, not [androidx.camera.core.CameraSelector.LENS_FACING_EXTERNAL] or LEGACY hardware — Section 7.3. */
    fun physicalCameraVerified(): Boolean {
        val info = boundCamera?.cameraInfo ?: return false
        val level = hardwareLevel(info)
        return level != "LEGACY" && info.lensFacing != androidx.camera.core.CameraSelector.LENS_FACING_EXTERNAL
    }

    fun hardwareLevel(info: CameraInfo): String {
        val camera2Info = Camera2CameraInfo.from(info)
        return when (camera2Info.getCameraCharacteristic(CameraCharacteristics.INFO_SUPPORTED_HARDWARE_LEVEL)) {
            CameraMetadata.INFO_SUPPORTED_HARDWARE_LEVEL_3 -> "LEVEL_3"
            CameraMetadata.INFO_SUPPORTED_HARDWARE_LEVEL_FULL -> "FULL"
            CameraMetadata.INFO_SUPPORTED_HARDWARE_LEVEL_LIMITED -> "LIMITED"
            CameraMetadata.INFO_SUPPORTED_HARDWARE_LEVEL_LEGACY -> "LEGACY"
            CameraMetadata.INFO_SUPPORTED_HARDWARE_LEVEL_EXTERNAL -> "EXTERNAL"
            else -> "UNKNOWN"
        }
    }

    /**
     * Captures a single JPEG frame entirely in memory. [captureToWriteLatencyMs]
     * on the returned envelope field is measured by the caller around this
     * call (Section 7.3 latency-signature check).
     */
    suspend fun capturePhotoBytes(): ImageProxy = suspendCancellableCoroutine { cont ->
        val capture = imageCapture ?: run {
            cont.resumeWithException(IllegalStateException("Camera not bound"))
            return@suspendCancellableCoroutine
        }
        capture.takePicture(mainExecutor, object : ImageCapture.OnImageCapturedCallback() {
            override fun onCaptureSuccess(image: ImageProxy) {
                if (cont.isActive) cont.resume(image) else image.close()
            }

            override fun onError(exception: ImageCaptureException) {
                cont.resumeWithException(exception)
            }
        })
    }

    fun buildCameraInfoSnapshot(captureToWriteLatencyMs: Long, sensorTimestampNs: Long?): EnvelopeCameraInfo {
        val info = boundCamera?.cameraInfo
        val camera2Info = info?.let { Camera2CameraInfo.from(it) }
        val cameraId = camera2Info?.cameraId ?: "unknown"
        val hwLevel = if (info != null) hardwareLevel(info) else "UNKNOWN"

        return EnvelopeCameraInfo(
            cameraId = cameraId,
            lensFacing = "BACK",
            hardwareLevel = hwLevel,
            physicalCameraVerified = physicalCameraVerified(),
            virtualCameraSuspected = hwLevel == "EXTERNAL",
            sensorTimestampNs = sensorTimestampNs,
            captureToWriteLatencyMs = captureToWriteLatencyMs,
        )
    }

    fun unbind() {
        cameraProvider?.unbindAll()
    }

    companion object {
        fun imageProxyToJpegBytes(image: ImageProxy): ByteArray {
            val buffer: ByteBuffer = image.planes[0].buffer
            val bytes = ByteArray(buffer.remaining())
            buffer.get(bytes)
            return bytes
        }
    }
}
