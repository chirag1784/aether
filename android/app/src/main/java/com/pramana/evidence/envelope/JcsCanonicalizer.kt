package com.pramana.evidence.envelope

import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.longOrNull
import java.math.BigDecimal

/**
 * A minimal, dependency-free implementation of RFC 8785 (JSON
 * Canonicalization Scheme), used to produce the exact byte sequence that
 * [com.pramana.evidence.crypto.StrongBoxSigner] signs (Section 3.3 of the
 * master brief). This file is deliberately readable end-to-end without any
 * Android or third-party dependency so an independent expert can
 * re-implement it in another language and reproduce a signature — see
 * `docs/HOW_TO_VERIFY.md` §3.
 *
 * Two JCS rules are implemented exactly:
 *  1. Object members are sorted by comparing member names as sequences of
 *     UTF-16 code units (Kotlin/Java's default `String.compareTo`).
 *  2. Strings are escaped with the minimum required set (quote, backslash,
 *     and C0 control characters); everything else is emitted as literal
 *     UTF-8, never over-escaped.
 *
 * One rule is **not** fully to spec, and this is disclosed rather than
 * silently approximated: RFC 8785 requires numbers to be formatted per the
 * ECMAScript `Number::toString` algorithm. This implementation instead
 * prints integral values as plain integers and non-integral values as a
 * trimmed decimal (via [BigDecimal]), without scientific notation. Every
 * numeric field in the Evidence Envelope schema (coordinates, sensor
 * readings, counts, millisecond timestamps) is well within the range
 * where this produces output identical to ECMAScript's algorithm; it is
 * not guaranteed identical for magnitudes beyond roughly 1e15 or below
 * 1e-6, which never occur in this schema.
 */
object JcsCanonicalizer {

    private const val BACKSPACE = '\b'
    private const val FORM_FEED = '\u000C'
    private const val NEWLINE = '\n'
    private const val CARRIAGE_RETURN = '\r'
    private const val TAB = '\t'

    fun canonicalize(element: JsonElement): String {
        val sb = StringBuilder()
        write(element, sb)
        return sb.toString()
    }

    private fun write(element: JsonElement, sb: StringBuilder) {
        when (element) {
            is JsonNull -> sb.append("null")
            is JsonArray -> {
                sb.append('[')
                element.forEachIndexed { index, item ->
                    if (index > 0) sb.append(',')
                    write(item, sb)
                }
                sb.append(']')
            }
            is JsonObject -> {
                sb.append('{')
                val sortedKeys = element.keys.sorted()
                sortedKeys.forEachIndexed { index, key ->
                    if (index > 0) sb.append(',')
                    writeString(key, sb)
                    sb.append(':')
                    write(element.getValue(key), sb)
                }
                sb.append('}')
            }
            is JsonPrimitive -> writePrimitive(element, sb)
        }
    }

    private fun writePrimitive(primitive: JsonPrimitive, sb: StringBuilder) {
        if (primitive.isString) {
            writeString(primitive.content, sb)
            return
        }
        primitive.booleanOrNull?.let {
            sb.append(if (it) "true" else "false")
            return
        }
        primitive.longOrNull?.let {
            sb.append(it.toString())
            return
        }
        val d = primitive.doubleOrNull
            ?: error("Non-string, non-boolean, non-numeric JSON primitive: $primitive")
        sb.append(formatNumber(d))
    }

    private fun formatNumber(value: Double): String {
        if (value.isNaN() || value.isInfinite()) {
            error("JCS cannot represent NaN/Infinity: $value")
        }
        if (value == Math.floor(value) && Math.abs(value) < 1e15) {
            return value.toLong().toString()
        }
        // Trim trailing zeros, never emit scientific notation for the
        // magnitudes this schema uses (see class KDoc caveat above).
        return BigDecimal(value).stripTrailingZeros().toPlainString()
    }

    private fun writeString(s: String, sb: StringBuilder) {
        sb.append('"')
        for (c in s) {
            when (c) {
                '"' -> sb.append("\\\"")
                '\\' -> sb.append("\\\\")
                BACKSPACE -> sb.append("\\b")
                FORM_FEED -> sb.append("\\f")
                NEWLINE -> sb.append("\\n")
                CARRIAGE_RETURN -> sb.append("\\r")
                TAB -> sb.append("\\t")
                else -> if (c.code < 0x20) {
                    sb.append("\\u").append(c.code.toString(16).padStart(4, '0'))
                } else {
                    sb.append(c)
                }
            }
        }
        sb.append('"')
    }
}
