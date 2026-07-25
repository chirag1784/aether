package com.pramana.evidence.envelope

import kotlinx.serialization.Serializable

/**
 * §2 TEMPORAL (Section 3.2).
 *
 * Legal basis: BSA §63(4) Schedule Part A requires a date/time on the
 * certificate. A single "system clock" timestamp is trivially forgeable by
 * changing device settings, so this block deliberately records *multiple
 * independent clocks* and their deltas, so tampering with any one of them
 * is visible as a cross-check failure rather than silently trusted — see
 * `docs/threat-model.md` §5 ("Device clock manipulation").
 *
 * [deviceUptimeMs] ([android.os.SystemClock.elapsedRealtime]) is the load-
 * bearing field for detecting a reboot-and-clock-reset attack: it keeps
 * ticking across a system-clock change and only resets on an actual
 * reboot, which is separately visible via [monotonicBootId].
 *
 * v0.1 scope note: [ntpSources] is populated only when the device has
 * network connectivity at capture time (no backend NTP relay is built in
 * this release); an empty list means the capture happened offline and the
 * certificate must disclose that, never silently omit it.
 */
@Serializable
data class TimeInfo(
    /** ISO-8601 UTC, e.g. `2026-07-25T08:42:33.117Z`. */
    val deviceUtc: String,
    /** ISO-8601 with the device's local offset. */
    val deviceLocal: String,
    val timezoneId: String,
    val deviceUptimeMs: Long,
    val monotonicBootId: String,
    /** Null if GNSS has no fix at capture time. */
    val gnssUtc: String? = null,
    val gnssSystemDeltaMs: Long? = null,
    val ntpSources: List<NtpSource> = emptyList(),
    val systemClockAuto: Boolean,
    val systemTzAuto: Boolean,
)

@Serializable
data class NtpSource(
    val host: String,
    val offsetMs: Long,
    val stratum: Int,
)
