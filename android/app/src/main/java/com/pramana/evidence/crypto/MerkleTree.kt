package com.pramana.evidence.crypto

import com.pramana.evidence.crypto.HashEngine.toHex
import java.security.MessageDigest

/**
 * Per-session Merkle tree over asset envelope hashes (Section 3.2,
 * `integrity.merkle`; Section 4, "MerkleTreeBuilder"). Proves an asset was
 * part of the session's set at the time the root was computed, without
 * needing a backend anchor service (that part — "Merkle Anchor Service,"
 * Section 4 — is a P3 backend feature not built in v0.1; the tree itself
 * is computed and verifiable entirely on-device).
 *
 * Leaves are combined pairwise as `sha256(min(a,b) || max(a,b))` — sorted
 * before concatenation — so proof verification does not need to track
 * left/right position, only the sibling hash at each level. This exact
 * rule is documented in `docs/HOW_TO_VERIFY.md` §5 so a third party can
 * reproduce inclusion proofs independently.
 */
object MerkleTree {

    data class Proof(val leafIndex: Int, val leafHash: String, val inclusionProof: List<String>)

    /** [leafHashesHex] must be in stable, deterministic order (e.g. capture order). */
    fun build(leafHashesHex: List<String>): Result {
        require(leafHashesHex.isNotEmpty()) { "Cannot build a Merkle tree over zero leaves" }
        var level = leafHashesHex.map { it.lowercase() }
        val levels = mutableListOf(level)
        while (level.size > 1) {
            val next = mutableListOf<String>()
            var i = 0
            while (i < level.size) {
                val left = level[i]
                val right = if (i + 1 < level.size) level[i + 1] else level[i]
                next += combine(left, right)
                i += 2
            }
            levels += next
            level = next
        }
        val root = level.first()
        val proofs = leafHashesHex.indices.map { index -> proofFor(levels, index) }
        return Result(root, proofs)
    }

    data class Result(val root: String, val proofs: List<Proof>)

    private fun proofFor(levels: List<List<String>>, leafIndex: Int): Proof {
        val siblings = mutableListOf<String>()
        var index = leafIndex
        for (levelIdx in 0 until levels.size - 1) {
            val level = levels[levelIdx]
            val siblingIndex = if (index % 2 == 0) index + 1 else index - 1
            val sibling = if (siblingIndex < level.size) level[siblingIndex] else level[index]
            siblings += sibling
            index /= 2
        }
        return Proof(leafIndex, levels[0][leafIndex], siblings)
    }

    /** Re-derives the root from a leaf + its proof; used by tests and by the verification portal logic. */
    fun verify(leafHash: String, proof: List<String>, expectedRoot: String): Boolean {
        var current = leafHash.lowercase()
        for (sibling in proof) {
            current = combine(current, sibling.lowercase())
        }
        return current == expectedRoot.lowercase()
    }

    private fun combine(a: String, b: String): String {
        val (lo, hi) = if (a <= b) a to b else b to a
        val digest = MessageDigest.getInstance("SHA-256")
        digest.update(lo.toByteArray(Charsets.US_ASCII))
        digest.update(hi.toByteArray(Charsets.US_ASCII))
        return digest.digest().toHex()
    }
}
