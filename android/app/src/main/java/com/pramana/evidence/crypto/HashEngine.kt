package com.pramana.evidence.crypto

import com.pramana.evidence.envelope.AssetHashes
import java.io.InputStream
import java.security.MessageDigest

/**
 * Computes the hash values BSA §63(4) Schedule Part A requires the
 * certificate to disclose ("hash value and the algorithm used"). SHA-256
 * is primary; SHA-512 and MD5 are included for legacy court/counsel
 * familiarity per the master brief (Section 3.2) — MD5 is disclosed, never
 * relied on for integrity by itself.
 *
 * No Android dependency — `java.security.MessageDigest` is pure JDK, so
 * this class is unit-testable on a desktop JVM without an emulator
 * (master brief, Section 14, rule 2).
 *
 * BLAKE3 is listed in the schema for fast internal integrity checks but is
 * not computed in v0.1 — it requires a native binding with no pure-JDK
 * implementation in the standard library, and is not load-bearing for any
 * legal claim this app makes (see `docs/compliance-matrix.md`).
 */
object HashEngine {

    private const val BUFFER_SIZE = 1 shl 16 // 64 KiB

    fun hashBytes(bytes: ByteArray): AssetHashes {
        return AssetHashes(
            sha256 = digestHex("SHA-256", bytes),
            sha512 = digestHex("SHA-512", bytes),
            md5 = digestHex("MD5", bytes),
        )
    }

    /** Streams the input once through all three digests without buffering the whole file. */
    fun hashStream(input: InputStream, expectedLength: Long? = null): AssetHashes {
        val sha256 = MessageDigest.getInstance("SHA-256")
        val sha512 = MessageDigest.getInstance("SHA-512")
        val md5 = MessageDigest.getInstance("MD5")
        val buffer = ByteArray(BUFFER_SIZE)
        var total = 0L
        while (true) {
            val read = input.read(buffer)
            if (read < 0) break
            sha256.update(buffer, 0, read)
            sha512.update(buffer, 0, read)
            md5.update(buffer, 0, read)
            total += read
        }
        if (expectedLength != null) {
            check(total == expectedLength) {
                "Stream length $total did not match expected $expectedLength"
            }
        }
        return AssetHashes(
            sha256 = sha256.digest().toHex(),
            sha512 = sha512.digest().toHex(),
            md5 = md5.digest().toHex(),
        )
    }

    fun sha256Hex(bytes: ByteArray): String = digestHex("SHA-256", bytes)

    private fun digestHex(algorithm: String, bytes: ByteArray): String =
        MessageDigest.getInstance(algorithm).digest(bytes).toHex()

    fun ByteArray.toHex(): String {
        val chars = CharArray(size * 2)
        for (i in indices) {
            val v = this[i].toInt() and 0xFF
            chars[i * 2] = HEX_CHARS[v ushr 4]
            chars[i * 2 + 1] = HEX_CHARS[v and 0x0F]
        }
        return String(chars)
    }

    private val HEX_CHARS = "0123456789abcdef".toCharArray()
}
