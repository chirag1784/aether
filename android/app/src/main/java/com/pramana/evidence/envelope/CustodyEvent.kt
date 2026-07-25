package com.pramana.evidence.envelope

import kotlinx.serialization.Serializable

enum class CustodyEventType {
    CAPTURED, SEALED, TIMESTAMPED, UPLOADED, WORM_LOCKED, EXPORTED, CERTIFIED, DELETED
}

/**
 * §9 CHAIN OF CUSTODY (Section 3.2).
 *
 * Legal basis: master brief, Section 14 rule 8 — "Log every deletion with
 * a reason. A gap in a sequence is a question in cross-examination; make
 * the answer available." Every state transition an asset goes through,
 * including deletion, is appended here and is never removed or reordered.
 * In v0.1 (client-only release) only [CustodyEventType.CAPTURED],
 * `SEALED`, `EXPORTED`, and `DELETED` are actually emitted; `TIMESTAMPED`,
 * `UPLOADED`, `WORM_LOCKED`, and `CERTIFIED`(server-signed) require the
 * backend described in Phase P3 and are not reachable in this release.
 */
@Serializable
data class CustodyEvent(
    val seq: Int,
    val event: CustodyEventType,
    val actor: String,
    val at: String,
    val hashAfter: String? = null,
    val recipient: String? = null,
    val certificateId: String? = null,
    /** Required and non-blank for [CustodyEventType.DELETED] — see rule 8 above. */
    val reason: String? = null,
)
