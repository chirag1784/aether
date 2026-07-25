package com.pramana.evidence.exif

import androidx.exifinterface.media.ExifInterface
import com.pramana.evidence.envelope.DeviceInfo
import com.pramana.evidence.envelope.EvidenceEnvelope
import java.io.File
import java.time.Instant
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import java.util.Locale

/**
 * Section 5 step 4 ("METADATA WRITE") and Section 6.3 (GPano). Writes the
 * belt-and-braces EXIF copy of the location/time/device fields that are
 * also carried in the signed envelope JSON — so a viewer that only reads
 * EXIF (e.g. a photo gallery, a basic forensic tool) still sees the
 * capture's provenance, even though the EXIF block itself is **not** part
 * of what [com.pramana.evidence.crypto.StrongBoxSigner] signs (only the
 * envelope JSON is signed — EXIF is convenience metadata, not evidence of
 * integrity by itself; verifiers must check the envelope hash, not trust
 * EXIF, per `docs/HOW_TO_VERIFY.md`).
 *
 * Operates on a plain temp file (JPEG must be a real file for
 * [ExifInterface] to rewrite its segments), returns the final bytes to be
 * handed to [com.pramana.evidence.vault.SealedVault.write] — EXIF writing
 * happens strictly before sealing, never after.
 */
object ExifWriter {

    fun writeAndReturnBytes(jpegBytes: ByteArray, tempDir: File, envelope: EvidenceEnvelope): ByteArray {
        val temp = File.createTempFile("pramana_exif_", ".jpg", tempDir)
        try {
            temp.writeBytes(jpegBytes)
            val exif = ExifInterface(temp.absolutePath)
            apply(exif, envelope, envelope.device)
            exif.saveAttributes()
            return temp.readBytes()
        } finally {
            temp.delete()
        }
    }

    private fun apply(exif: ExifInterface, envelope: EvidenceEnvelope, device: DeviceInfo) {
        envelope.location.let { loc ->
            exif.setAttribute(ExifInterface.TAG_GPS_LATITUDE, toDms(loc.latitude))
            exif.setAttribute(ExifInterface.TAG_GPS_LATITUDE_REF, if (loc.latitude >= 0) "N" else "S")
            exif.setAttribute(ExifInterface.TAG_GPS_LONGITUDE, toDms(loc.longitude))
            exif.setAttribute(ExifInterface.TAG_GPS_LONGITUDE_REF, if (loc.longitude >= 0) "E" else "W")
            loc.altitudeM?.let {
                exif.setAttribute(ExifInterface.TAG_GPS_ALTITUDE, "${(it * 1000).toLong()}/1000")
                exif.setAttribute(ExifInterface.TAG_GPS_ALTITUDE_REF, if (it >= 0) "0" else "1")
            }
            loc.bearingDeg?.let {
                exif.setAttribute(ExifInterface.TAG_GPS_IMG_DIRECTION, "${(it * 100).toLong()}/100")
                exif.setAttribute(ExifInterface.TAG_GPS_IMG_DIRECTION_REF, "T")
            }
            exif.setAttribute(ExifInterface.TAG_GPS_H_POSITIONING_ERROR, "${(loc.horizontalAccuracyM * 1000).toLong()}/1000")
        }

        val instant = runCatching { Instant.parse(envelope.time.deviceUtc) }.getOrDefault(Instant.now())
        val gpsDateFormatter = DateTimeFormatter.ofPattern("yyyy:MM:dd", Locale.US).withZone(ZoneOffset.UTC)
        val gpsTimeFormatter = DateTimeFormatter.ofPattern("HH:mm:ss", Locale.US).withZone(ZoneOffset.UTC)
        exif.setAttribute(ExifInterface.TAG_GPS_DATESTAMP, gpsDateFormatter.format(instant))
        exif.setAttribute(ExifInterface.TAG_GPS_TIMESTAMP, gpsTimeFormatter.format(instant))

        val originalFormatter = DateTimeFormatter.ofPattern("yyyy:MM:dd HH:mm:ss", Locale.US)
        exif.setAttribute(ExifInterface.TAG_DATETIME_ORIGINAL, originalFormatter.format(instant.atZone(java.time.ZoneId.systemDefault())))
        val millis = instant.toEpochMilli() % 1000
        exif.setAttribute(ExifInterface.TAG_SUBSEC_TIME_ORIGINAL, millis.toString().padStart(3, '0'))

        exif.setAttribute(ExifInterface.TAG_MAKE, device.manufacturer)
        exif.setAttribute(ExifInterface.TAG_MODEL, device.model)
        exif.setAttribute(ExifInterface.TAG_SOFTWARE, "Pramana/${device.appVersionName}")
        exif.setAttribute(ExifInterface.TAG_IMAGE_UNIQUE_ID, envelope.envelopeId)
    }

    private fun toDms(decimal: Double): String {
        val abs = Math.abs(decimal)
        val degrees = abs.toInt()
        val minutesFull = (abs - degrees) * 60
        val minutes = minutesFull.toInt()
        val seconds = (minutesFull - minutes) * 60
        val secondsRational = (seconds * 1000).toLong()
        return "$degrees/1,$minutes/1,$secondsRational/1000"
    }
}
