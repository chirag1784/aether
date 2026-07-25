package com.pramana.evidence.crypto

import java.security.SecureRandom
import java.util.UUID

/**
 * UUIDv7 (draft RFC 9562): a time-ordered UUID used for `envelope_id` and
 * `session_id` (Section 3.2) so that lexicographic/timestamp ordering of
 * envelope IDs alone is enough to reconstruct capture order without
 * opening every file — useful when reviewing a session's custody sequence.
 */
object Uuid7 {

    private val random = SecureRandom()

    fun generate(): String {
        val bytes = ByteArray(16)
        val unixMillis = System.currentTimeMillis()

        // Bytes 0-5: 48-bit big-endian Unix timestamp in milliseconds.
        for (i in 0 until 6) {
            bytes[i] = (unixMillis shr (8 * (5 - i))).toByte()
        }

        val rand = ByteArray(10)
        random.nextBytes(rand)

        // Byte 6: version nibble (0111) + top 4 random bits.
        bytes[6] = ((0x7 shl 4) or (rand[0].toInt() and 0x0F)).toByte()
        // Byte 7: next 8 random bits.
        bytes[7] = rand[1]
        // Byte 8: variant bits (10) + top 6 random bits.
        bytes[8] = ((0x2 shl 6) or (rand[2].toInt() and 0x3F)).toByte()
        // Bytes 9-15: remaining random bits.
        for (i in 9 until 16) {
            bytes[i] = rand[i - 6]
        }

        var msb = 0L
        var lsb = 0L
        for (i in 0 until 8) msb = (msb shl 8) or (bytes[i].toLong() and 0xFF)
        for (i in 8 until 16) lsb = (lsb shl 8) or (bytes[i].toLong() and 0xFF)

        return UUID(msb, lsb).toString()
    }
}
