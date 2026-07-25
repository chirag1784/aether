package com.pramana.evidence.capture

import android.content.Context
import android.os.SystemClock
import com.pramana.evidence.capture.metadata.AppSigningCertProvider
import com.pramana.evidence.capture.metadata.DeviceInfoProvider
import com.pramana.evidence.capture.metadata.MetadataHarvester
import com.pramana.evidence.crypto.HashEngine
import com.pramana.evidence.crypto.StrongBoxSigner
import com.pramana.evidence.crypto.Uuid7
import com.pramana.evidence.data.AssetEntity
import com.pramana.evidence.envelope.AntiSpoofInfo
import com.pramana.evidence.envelope.AssetHashes
import com.pramana.evidence.envelope.AssetInfo
import com.pramana.evidence.envelope.CaptureKind
import com.pramana.evidence.envelope.ConsentArtefact
import com.pramana.evidence.envelope.ContextInfo
import com.pramana.evidence.envelope.CustodyEvent
import com.pramana.evidence.envelope.CustodyEventType
import com.pramana.evidence.envelope.DeviceSignatureInfo
import com.pramana.evidence.envelope.EvidenceEnvelope
import com.pramana.evidence.envelope.IntegrityInfo
import com.pramana.evidence.envelope.LocationInfo
import com.pramana.evidence.envelope.SpoofVerdict
import com.pramana.evidence.envelope.canonicalSignableBytes
import com.pramana.evidence.envelope.computeAssuranceLevel
import com.pramana.evidence.envelope.toJsonString
import com.pramana.evidence.exif.ExifWriter
import com.pramana.evidence.exif.XmpWriter
import com.pramana.evidence.vault.SealedVault
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

/**
 * Orchestrates Section 5's capture pipeline end to end, in the exact order
 * the master brief specifies (steps 2 through 9 — steps 0/1 "PRE-FLIGHT"
 * and "ARM" happen in the UI layer before this is invoked; steps 10-14,
 * which need a backend, are not implemented — see [SIGNING_KEY_ALIAS]
 * KDoc and `docs/compliance-matrix.md`).
 *
 * The ordering below is load-bearing, not incidental: EXIF/XMP (step 4)
 * is written *before* hashing (step 5) because the hash must cover the
 * final bytes actually sealed; canonicalisation + signing (steps 6-7)
 * happen only after the asset's real hash is known and folded into the
 * envelope; sealing (step 9) is the last step, after which
 * [SealedVault] refuses further writes to that path.
 */
class EvidencePipeline(
    private val context: Context,
    private val cameraController: CameraController,
) {
    private val metadataHarvester = MetadataHarvester(context)
    private val deviceInfoProvider = DeviceInfoProvider(context)
    private val strongBoxSigner = StrongBoxSigner(context)
    private val vault = SealedVault(context)

    suspend fun capturePhoto(
        sessionId: String,
        sessionSeq: Int,
        contextInfo: ContextInfo,
        consent: ConsentArtefact,
    ): Pair<AssetEntity, List<CustodyEvent>> {
        val t0 = SystemClock.elapsedRealtime()
        val envelopeId = Uuid7.generate()

        // --- Step 2: CAPTURE — grab the frame and the metadata snapshot as close together as possible ---
        val imageProxy = cameraController.capturePhotoBytes()
        val rawJpeg = CameraController.imageProxyToJpegBytes(imageProxy)
        val sensorTimestampNs = imageProxy.imageInfo.timestamp
        imageProxy.close()
        val metadata = metadataHarvester.capture()
        val captureLatencyMs = SystemClock.elapsedRealtime() - t0

        val cameraInfo = cameraController.buildCameraInfoSnapshot(captureLatencyMs, sensorTimestampNs)

        val attestation = strongBoxSigner.ensureKey(SIGNING_KEY_ALIAS, StrongBoxSigner.freshChallenge())
        val deviceInfo = deviceInfoProvider.snapshot(
            keystoreBacking = attestation.securityLevel,
            appSigningCertSha256 = AppSigningCertProvider.signingCertSha256(context),
        )

        val locationInfo = metadata.location ?: noFixLocation()
        val filename = "PRM_${fileTimestamp()}_%04d.jpg".format(sessionSeq)

        val custody = mutableListOf(
            CustodyEvent(
                seq = 1,
                event = CustodyEventType.CAPTURED,
                actor = "device:${deviceInfo.installId}",
                at = metadata.time.deviceUtc,
            ),
        )

        // Provisional envelope: everything except the final byte-length,
        // hashes, and device signature, which depend on the final sealed
        // bytes (EXIF/XMP embedding changes the byte stream).
        var envelope = EvidenceEnvelope(
            envelopeId = envelopeId,
            sessionId = sessionId,
            asset = AssetInfo(
                filename = filename,
                mimeType = "image/jpeg",
                byteLength = 0,
                captureKind = CaptureKind.PHOTO,
                hashes = AssetHashes(sha256 = "", sha512 = "", md5 = ""),
            ),
            time = metadata.time,
            location = locationInfo,
            device = deviceInfo,
            sensors = metadata.sensors,
            network = metadata.network,
            camera = cameraInfo,
            context = contextInfo,
            integrity = IntegrityInfo(
                keyAttestation = attestation,
                deviceSignature = DeviceSignatureInfo(signatureB64 = ""),
            ),
            custody = custody,
            consent = consent,
        )

        // --- Step 4: METADATA WRITE (EXIF + XMP), strictly before hashing ---
        val withExif = ExifWriter.writeAndReturnBytes(rawJpeg, context.cacheDir, envelope)
        val finalBytes = XmpWriter.injectXmp(withExif, XmpWriter.buildXmpPacket(envelope))

        // --- Step 5: HASH the final sealed bytes ---
        val hashes = HashEngine.hashBytes(finalBytes)
        envelope = envelope.copy(asset = envelope.asset.copy(byteLength = finalBytes.size.toLong(), hashes = hashes))

        // --- Steps 6-7: CANONICALISE + DEVICE SIGN ---
        val signature = strongBoxSigner.sign(SIGNING_KEY_ALIAS, envelope.canonicalSignableBytes())
        envelope = envelope.copy(integrity = envelope.integrity.copy(deviceSignature = signature))

        val sealedAt = java.time.Instant.now().toString()
        custody += CustodyEvent(
            seq = 2, event = CustodyEventType.SEALED,
            actor = "device:${deviceInfo.installId}", at = sealedAt, hashAfter = hashes.sha256,
        )
        envelope = envelope.copy(custody = custody)

        // --- Step 9: SEAL — write once, read-only, into the encrypted vault ---
        vault.write(sessionId, "$envelopeId.jpg", finalBytes)
        vault.write(sessionId, "$envelopeId.envelope.json", envelope.toJsonString(pretty = true).toByteArray(Charsets.UTF_8))
        vault.write(sessionId, "$envelopeId.device_pubkey.pem", strongBoxSigner.exportPublicKeyPem(SIGNING_KEY_ALIAS).toByteArray())

        val assetEntity = AssetEntity(
            envelopeId = envelopeId,
            sessionId = sessionId,
            filename = filename,
            captureKind = CaptureKind.PHOTO.name,
            sha256 = hashes.sha256,
            assuranceLevel = envelope.computeAssuranceLevel().name,
            byteLength = finalBytes.size.toLong(),
            capturedAtUtc = metadata.time.deviceUtc,
        )

        return assetEntity to envelope.custody
    }

    private fun noFixLocation(): LocationInfo = LocationInfo(
        latitude = 0.0,
        longitude = 0.0,
        altitudeM = null,
        horizontalAccuracyM = Float.MAX_VALUE,
        verticalAccuracyM = null,
        speedMps = null,
        bearingDeg = null,
        provider = "none",
        fixAgeMs = -1,
        geohash = "",
        antiSpoof = AntiSpoofInfo(
            isMock = false,
            devOptionsEnabled = false,
            spoofRiskScore = 1f,
            spoofVerdict = SpoofVerdict.SUSPECT,
        ),
    )

    private fun fileTimestamp(): String {
        val sdf = SimpleDateFormat("yyyyMMdd_HHmmss", Locale.US)
        sdf.timeZone = TimeZone.getTimeZone("Asia/Kolkata")
        return sdf.format(Date())
    }

    companion object {
        /**
         * v0.1 uses a single, session-independent key alias. The full
         * design's server-issued per-session attestation challenge
         * (Section 5 step 0) is replaced with a locally-generated
         * challenge ([StrongBoxSigner.freshChallenge]) since there is no
         * backend to issue one — see `docs/compliance-matrix.md`.
         */
        const val SIGNING_KEY_ALIAS = "pramana_signing_v1"
    }
}
