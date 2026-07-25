package com.pramana.evidence.certificate

import android.graphics.Paint
import android.graphics.Typeface
import android.graphics.pdf.PdfDocument
import com.pramana.evidence.data.SessionEntity
import com.pramana.evidence.envelope.EvidenceEnvelope
import com.pramana.evidence.envelope.computeAssuranceLevel
import java.io.ByteArrayOutputStream
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter

/**
 * Section 8 (BSA §63(4) certificate generation) and Section 8.3 (page
 * layout). Generates **Part A only** — auto-filled from real device and
 * hash data — and generates it as a **DRAFT, unsigned** document. Per the
 * master brief (Section 1, "What this app CANNOT do"): "It cannot
 * self-certify Part B... that requires an independent expert's
 * signature," and per rule in Section 8, "the app must never auto-sign
 * Part B." This service does not sign anything — v0.1 has no DSC/Aadhaar
 * eSign integration (`docs/compliance-matrix.md`), so even Part A ships
 * as an explicitly labelled draft pending that integration.
 *
 * Generated fresh per export (never cached), hashing the exact bytes of
 * the assets being exported — per Section 1.1's design rule: "the
 * certificate is generated at export time, not at capture time."
 */
class CertificateService {

    fun generatePartADraft(session: SessionEntity, envelopes: List<EvidenceEnvelope>): ByteArray {
        val document = PdfDocument()
        val pageWidth = 595 // A4 at 72dpi
        val pageHeight = 842

        drawPartAPage(document, pageWidth, pageHeight, session, envelopes)
        drawHashAnnexurePage(document, pageWidth, pageHeight, envelopes)
        drawCustodyChainPage(document, pageWidth, pageHeight, envelopes)
        drawVerificationPage(document, pageWidth, pageHeight)

        val out = ByteArrayOutputStream()
        document.writeTo(out)
        document.close()
        return out.toByteArray()
    }

    private fun drawPartAPage(doc: PdfDocument, w: Int, h: Int, session: SessionEntity, envelopes: List<EvidenceEnvelope>) {
        val page = doc.startPage(PdfDocument.PageInfo.Builder(w, h, 1).create())
        val canvas = page.canvas
        val writer = LineWriter(canvas, marginLeft = 40f, top = 50f)

        writer.title("PRAMĀṆA — Certificate under Section 63(4)")
        writer.title("Bharatiya Sakshya Adhiniyam, 2023 — Schedule, Part A")
        writer.gap(10f)
        writer.watermark("DRAFT — UNSIGNED — NOT FOR SUBMISSION")
        writer.gap(16f)

        writer.body("This certificate accompanies the electronic record(s) identified below, produced by the person named, in accordance with Section 63(4) of the Bharatiya Sakshya Adhiniyam, 2023.")
        writer.gap(12f)

        writer.heading("1. Particulars of the person producing the record")
        val operator = envelopes.firstOrNull()?.context?.operator
        writer.field("Name", operator?.displayName ?: "—")
        writer.field("Role", operator?.role?.name ?: "—")
        writer.field("IRDAI Surveyor Licence No.", operator?.irdaiSurveyorLicenceNo ?: "—")
        writer.field("KYC level asserted", operator?.kycLevel?.name ?: "NONE")
        writer.gap(10f)

        writer.heading("2. Identification of the electronic record(s)")
        writer.field("Session ID", session.sessionId)
        writer.field("Claim number", session.claimNumber ?: "—")
        writer.field("Policy number", session.policyNumber ?: "—")
        writer.field("Vehicle registration", session.vehicleRegNo ?: "—")
        writer.field("Number of assets in this certificate", envelopes.size.toString())
        writer.gap(10f)

        writer.heading("3. Manner of production")
        writer.body("Each record was captured by the Pramāṇa Android application directly from the device camera into an app-private encrypted vault, hashed, and cryptographically signed inside the device's hardware-backed keystore before being written to persistent storage. No gallery import or MediaStore write occurred at any point (see docs/HOW_TO_VERIFY.md).")
        writer.gap(10f)

        writer.heading("4. Particulars of the device")
        val device = envelopes.firstOrNull()?.device
        writer.field("Manufacturer / model", "${device?.manufacturer ?: "—"} ${device?.model ?: ""}")
        writer.field("Android version", "${device?.androidRelease ?: "—"} (SDK ${device?.sdkInt ?: "—"})")
        writer.field("Security patch level", device?.securityPatch ?: "—")
        writer.field("App version", device?.appVersionName ?: "—")
        writer.field("Keystore backing", device?.keystoreBacking?.name ?: "—")
        writer.gap(10f)

        writer.heading("5. Declaration")
        writer.body("The device was, to the best of the producing party's knowledge, in regular use and operating properly at the time of capture. Device-health and anti-spoof telemetry supporting this declaration is included in the technical annexure and the expert pack (docs/HOW_TO_VERIFY.md).")
        writer.gap(6f)
        writer.body("Hash algorithm used: SHA-256 (primary), also SHA-512 and MD5 (see annexure, page 2).")
        writer.gap(16f)

        writer.body("Generated: ${nowFormatted()}", italic = true)
        writer.body("This is an unsigned draft. A licensed digital signature / Aadhaar eSign integration is required before submission — see docs/compliance-matrix.md.", italic = true)

        doc.finishPage(page)
    }

    private fun drawHashAnnexurePage(doc: PdfDocument, w: Int, h: Int, envelopes: List<EvidenceEnvelope>) {
        val page = doc.startPage(PdfDocument.PageInfo.Builder(w, h, 2).create())
        val writer = LineWriter(page.canvas, marginLeft = 40f, top = 50f)
        writer.title("Annexure A — Hash values")
        writer.gap(10f)
        envelopes.forEach { env ->
            writer.heading(env.asset.filename)
            writer.field("SHA-256", env.asset.hashes.sha256)
            writer.field("SHA-512", env.asset.hashes.sha512)
            writer.field("MD5", env.asset.hashes.md5)
            writer.field("Byte length", env.asset.byteLength.toString())
            writer.field("Assurance level", env.computeAssuranceLevel().name)
            writer.gap(8f)
        }
        doc.finishPage(page)
    }

    private fun drawCustodyChainPage(doc: PdfDocument, w: Int, h: Int, envelopes: List<EvidenceEnvelope>) {
        val page = doc.startPage(PdfDocument.PageInfo.Builder(w, h, 3).create())
        val writer = LineWriter(page.canvas, marginLeft = 40f, top = 50f)
        writer.title("Annexure B — Chain of custody")
        writer.gap(10f)
        envelopes.forEach { env ->
            writer.heading(env.asset.filename)
            env.custody.forEach { event ->
                writer.body("  #${event.seq}  ${event.event}  at ${event.at}  actor=${event.actor}${event.reason?.let { "  reason=$it" } ?: ""}")
            }
            writer.gap(8f)
        }
        doc.finishPage(page)
    }

    private fun drawVerificationPage(doc: PdfDocument, w: Int, h: Int) {
        val page = doc.startPage(PdfDocument.PageInfo.Builder(w, h, 4).create())
        val writer = LineWriter(page.canvas, marginLeft = 40f, top = 50f)
        writer.title("How to verify this bundle independently")
        writer.gap(10f)
        writer.body("This certificate does not need to be trusted on its own. Every hash and signature above can be reproduced with standard, publicly available tools (OpenSSL, sha256sum) against the asset files and envelope JSON included in the exported bundle.")
        writer.gap(8f)
        writer.body("Full step-by-step reproduction instructions are included in the bundle as HOW_TO_VERIFY.md, and are also maintained at:")
        writer.body("  docs/HOW_TO_VERIFY.md in the Pramāṇa source repository.")
        writer.gap(10f)
        writer.body("No RFC 3161 trusted timestamp and no server countersignature are present in this v0.1 bundle — see the compliance matrix for scope.", italic = true)
        doc.finishPage(page)
    }

    private fun nowFormatted(): String =
        DateTimeFormatter.ofPattern("dd MMMM yyyy, HH:mm 'IST'").withZone(ZoneId.of("Asia/Kolkata")).format(Instant.now())

    /** Minimal line-based text layout helper — no external PDF library, per master brief rule 3 (independently readable, nothing hidden in a third-party binary). */
    private class LineWriter(private val canvas: android.graphics.Canvas, private val marginLeft: Float, top: Float) {
        private var y = top
        private val titlePaint = Paint().apply { textSize = 14f; typeface = Typeface.DEFAULT_BOLD; color = 0xFF1B1F3B.toInt() }
        private val headingPaint = Paint().apply { textSize = 11f; typeface = Typeface.DEFAULT_BOLD; color = 0xFF1B1F3B.toInt() }
        private val bodyPaint = Paint().apply { textSize = 9.5f; typeface = Typeface.DEFAULT; color = 0xFF222222.toInt() }
        private val italicPaint = Paint().apply { textSize = 9f; typeface = Typeface.create(Typeface.DEFAULT, Typeface.ITALIC); color = 0xFF666666.toInt() }
        private val watermarkPaint = Paint().apply { textSize = 12f; typeface = Typeface.DEFAULT_BOLD; color = 0xFFB3261E.toInt() }
        private val maxWidth = 515f

        fun title(text: String) { drawWrapped(text, titlePaint, 18f) }
        fun heading(text: String) { drawWrapped(text, headingPaint, 15f) }
        fun body(text: String, italic: Boolean = false) { drawWrapped(text, if (italic) italicPaint else bodyPaint, 13f) }
        fun watermark(text: String) { drawWrapped(text, watermarkPaint, 16f) }
        fun field(label: String, value: String) { drawWrapped("$label: $value", bodyPaint, 13f) }
        fun gap(amount: Float) { y += amount }

        private fun drawWrapped(text: String, paint: Paint, lineHeight: Float) {
            val words = text.split(" ")
            var line = StringBuilder()
            for (word in words) {
                val candidate = if (line.isEmpty()) word else "$line $word"
                if (paint.measureText(candidate) > maxWidth && line.isNotEmpty()) {
                    canvas.drawText(line.toString(), marginLeft, y, paint)
                    y += lineHeight
                    line = StringBuilder(word)
                } else {
                    line = StringBuilder(candidate)
                }
            }
            if (line.isNotEmpty()) {
                canvas.drawText(line.toString(), marginLeft, y, paint)
                y += lineHeight
            }
        }
    }
}
