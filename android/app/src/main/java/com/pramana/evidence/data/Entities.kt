package com.pramana.evidence.data

import androidx.room.Entity
import androidx.room.PrimaryKey

enum class SessionStatus { DRAFT, SEALED, UPLOADED, CERTIFIED }

/**
 * Session index row (master brief Section 10, screen 2 "Home"). Holds
 * only non-sensitive index metadata for fast listing — the actual
 * envelopes and asset bytes live in [com.pramana.evidence.vault.SealedVault],
 * encrypted at rest. Losing/corrupting this Room database must never lose
 * evidence: it is a rebuildable index over the vault, not the source of
 * truth (source of truth = sealed envelope JSON, which duplicates every
 * field stored here).
 *
 * v0.1 note: this table is a plain (unencrypted) Room database, not
 * SQLCipher — see `docs/compliance-matrix.md` §4. Nothing evidentiary is
 * stored here that isn't already in plaintext-adjacent form elsewhere
 * (claim numbers, counts, timestamps); asset bytes and full envelopes are
 * always in the encrypted vault.
 */
@Entity(tableName = "sessions")
data class SessionEntity(
    @PrimaryKey val sessionId: String,
    val claimNumber: String?,
    val policyNumber: String?,
    val vehicleRegNo: String?,
    val operatorName: String,
    val operatorRole: String,
    val checklistTemplateId: String?,
    val status: SessionStatus,
    val createdAtUtc: String,
    val updatedAtUtc: String,
    val merkleRoot: String? = null,
)

@Entity(tableName = "assets")
data class AssetEntity(
    @PrimaryKey val envelopeId: String,
    val sessionId: String,
    val filename: String,
    val captureKind: String,
    val sha256: String,
    val assuranceLevel: String,
    val byteLength: Long,
    val capturedAtUtc: String,
    val deleted: Boolean = false,
    val deleteReason: String? = null,
)
