package com.pramana.evidence.export

import android.content.Context
import com.pramana.evidence.certificate.CertificateService
import com.pramana.evidence.crypto.MerkleTree
import com.pramana.evidence.data.AssetDao
import com.pramana.evidence.data.SessionEntity
import com.pramana.evidence.envelope.EvidenceEnvelope
import com.pramana.evidence.vault.SealedVault
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import java.io.File
import java.util.zip.ZipEntry
import java.util.zip.ZipOutputStream

/**
 * Section 3.2 ("Bundle — the exportable ZIP") and Section 5 steps 12-14's
 * client-only equivalent. Assembles a self-contained bundle from the
 * sealed vault: assets, envelopes, a session manifest carrying the
 * client-computed Merkle root, per-asset inclusion proofs, a copy of
 * `HOW_TO_VERIFY.md`, and the draft BSA §63(4) Part A certificate.
 *
 * The Merkle tree is computed here, at export time, not at capture time —
 * see the ordering note in `envelope/IntegrityInfo.kt` and
 * `docs/HOW_TO_VERIFY.md` §5: computing it earlier would require mutating
 * already-sealed envelope files, which [SealedVault] does not allow by
 * design.
 */
class ExportService(private val context: Context) {

    private val vault = SealedVault(context)
    private val certificateService = CertificateService()
    private val json = Json { ignoreUnknownKeys = true }

    fun buildBundle(session: SessionEntity, assets: List<com.pramana.evidence.data.AssetEntity>): File {
        val envelopes = assets.mapNotNull { asset ->
            runCatching {
                val bytes = vault.read(session.sessionId, "${asset.envelopeId}.envelope.json")
                json.decodeFromString(EvidenceEnvelope.serializer(), String(bytes, Charsets.UTF_8))
            }.getOrNull()
        }

        val merkle = if (envelopes.isNotEmpty()) {
            MerkleTree.build(envelopes.map { it.asset.hashes.sha256 })
        } else null

        val certificateBytes = if (envelopes.isNotEmpty()) {
            certificateService.generatePartADraft(session, envelopes)
        } else null

        val exportsDir = File(context.filesDir, "exports").apply { mkdirs() }
        val bundleFile = File(exportsDir, "pramana_${session.sessionId}.zip")
        if (bundleFile.exists()) bundleFile.delete()

        ZipOutputStream(bundleFile.outputStream()).use { zip ->
            assets.forEach { asset ->
                runCatching {
                    val bytes = vault.read(session.sessionId, "${asset.envelopeId}.jpg")
                    zip.putNextEntry(ZipEntry("assets/${asset.filename}"))
                    zip.write(bytes)
                    zip.closeEntry()
                }
                runCatching {
                    val bytes = vault.read(session.sessionId, "${asset.envelopeId}.envelope.json")
                    zip.putNextEntry(ZipEntry("assets/${asset.filename}.envelope.json"))
                    zip.write(bytes)
                    zip.closeEntry()
                }
                runCatching {
                    val bytes = vault.read(session.sessionId, "${asset.envelopeId}.device_pubkey.pem")
                    zip.putNextEntry(ZipEntry("assets/${asset.filename}.device_pubkey.pem"))
                    zip.write(bytes)
                    zip.closeEntry()
                }
            }

            zip.putNextEntry(ZipEntry("session_manifest.json"))
            zip.write(buildSessionManifest(session, envelopes, merkle?.root).toByteArray(Charsets.UTF_8))
            zip.closeEntry()

            if (merkle != null) {
                zip.putNextEntry(ZipEntry("merkle_proof.json"))
                zip.write(buildMerkleProofJson(envelopes, merkle).toByteArray(Charsets.UTF_8))
                zip.closeEntry()
            }

            certificateBytes?.let {
                zip.putNextEntry(ZipEntry("certificate/part_a_draft.pdf"))
                zip.write(it)
                zip.closeEntry()
            }

            howToVerifyText()?.let {
                zip.putNextEntry(ZipEntry("HOW_TO_VERIFY.md"))
                zip.write(it.toByteArray(Charsets.UTF_8))
                zip.closeEntry()
            }
        }

        return bundleFile
    }

    private fun buildSessionManifest(session: SessionEntity, envelopes: List<EvidenceEnvelope>, merkleRoot: String?): String {
        val obj = buildJsonObject {
            put("session_id", session.sessionId)
            put("claim_number", session.claimNumber)
            put("policy_number", session.policyNumber)
            put("asset_count", envelopes.size)
            put("merkle_root", merkleRoot)
            put("bundle_format_version", "0.1")
            put("generated_at", java.time.Instant.now().toString())
        }
        return Json { prettyPrint = true }.encodeToString(kotlinx.serialization.json.JsonObject.serializer(), obj)
    }

    private fun buildMerkleProofJson(envelopes: List<EvidenceEnvelope>, merkle: MerkleTree.Result): String {
        val proofsArray = JsonArray(
            merkle.proofs.mapIndexed { index, proof ->
                buildJsonObject {
                    put("filename", envelopes[index].asset.filename)
                    put("envelope_id", envelopes[index].envelopeId)
                    put("leaf_index", proof.leafIndex)
                    put("leaf_hash", proof.leafHash)
                    put("inclusion_proof", JsonArray(proof.inclusionProof.map { kotlinx.serialization.json.JsonPrimitive(it) }))
                }
            },
        )
        val obj = buildJsonObject {
            put("merkle_root", merkle.root)
            put("proofs", proofsArray)
        }
        return Json { prettyPrint = true }.encodeToString(kotlinx.serialization.json.JsonObject.serializer(), obj)
    }

    private fun howToVerifyText(): String? = runCatching {
        context.assets.open("HOW_TO_VERIFY.md").bufferedReader().readText()
    }.getOrNull()
}
