package com.pramana.evidence.envelope

import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put

private val envelopeJson = Json {
    encodeDefaults = true
    explicitNulls = false
}

/** Full, unredacted JSON representation of the envelope (for storage/export). */
fun EvidenceEnvelope.toJsonString(pretty: Boolean = false): String {
    val json = if (pretty) Json(envelopeJson) { prettyPrint = true } else envelopeJson
    return json.encodeToString(this)
}

/**
 * Produces the canonical (RFC 8785 JCS) byte sequence that
 * [com.pramana.evidence.crypto.StrongBoxSigner] signs — i.e. the full
 * envelope JSON with the fields excluded from the signed payload stripped
 * out first, per Section 3.3 of the master brief and
 * `docs/HOW_TO_VERIFY.md` §3:
 *  - `integrity.deviceSignature`
 *  - `integrity.serverCountersignature`
 *  - `integrity.trustedTimestamp`
 *  - any `custody[]` entry whose `event` comes after `"SEALED"`
 *    (i.e. everything except `CAPTURED` and `SEALED`)
 */
fun EvidenceEnvelope.canonicalSignableBytes(): ByteArray {
    val full = envelopeJson.encodeToJsonElement(EvidenceEnvelope.serializer(), this).jsonObject

    val redactedIntegrity = buildJsonObject {
        full["integrity"]!!.jsonObject.forEach { (key, value) ->
            if (key != "deviceSignature" && key != "serverCountersignature" && key != "trustedTimestamp") {
                put(key, value)
            }
        }
    }

    val presealEvents = full["custody"]!!.jsonArray.filter { event ->
        val name = event.jsonObject["event"]?.jsonPrimitive?.content
        name == "CAPTURED" || name == "SEALED"
    }

    val signable = buildJsonObject {
        full.forEach { (key, value) ->
            when (key) {
                "integrity" -> put(key, redactedIntegrity)
                "custody" -> put(key, JsonArray(presealEvents))
                else -> put(key, value)
            }
        }
    }

    return JcsCanonicalizer.canonicalize(signable).toByteArray(Charsets.UTF_8)
}
