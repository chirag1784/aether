package com.pramana.evidence.capture.metadata

/** Standard base-32 geohash encoder (Section 3.2 §3, `location.geohash`). Pure Kotlin, no dependency. */
object Geohash {
    private const val BASE32 = "0123456789bcdefghjkmnpqrstuvwxyz"

    fun encode(latitude: Double, longitude: Double, precision: Int = 9): String {
        var latMin = -90.0; var latMax = 90.0
        var lonMin = -180.0; var lonMax = 180.0
        val sb = StringBuilder()
        var isEven = true
        var bit = 0
        var ch = 0

        while (sb.length < precision) {
            if (isEven) {
                val mid = (lonMin + lonMax) / 2
                if (longitude >= mid) { ch = ch or (1 shl (4 - bit)); lonMin = mid } else { lonMax = mid }
            } else {
                val mid = (latMin + latMax) / 2
                if (latitude >= mid) { ch = ch or (1 shl (4 - bit)); latMin = mid } else { latMax = mid }
            }
            isEven = !isEven
            if (bit < 4) {
                bit++
            } else {
                sb.append(BASE32[ch])
                bit = 0
                ch = 0
            }
        }
        return sb.toString()
    }
}
