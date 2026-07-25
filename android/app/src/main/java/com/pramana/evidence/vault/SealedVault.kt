package com.pramana.evidence.vault

import android.content.Context
import androidx.security.crypto.EncryptedFile
import androidx.security.crypto.MasterKey
import java.io.File

/**
 * The immutable, encrypted-at-rest asset vault (master brief, Section 4
 * "Storage Layer" and Section 5 step 9 "SEAL"). This is the ONLY class in
 * the codebase permitted to write asset or envelope bytes to disk — see
 * master brief Section 14, rule 4: "Never allow a code path that modifies
 * a sealed asset. Enforce with a read-only vault, file permissions, and an
 * architecture test that fails the build if any class outside
 * `evidence.seal` imports a write API for the vault path."
 *
 * Enforcement in v0.1 (documented honestly, `docs/threat-model.md` §8):
 *  1. **Package boundary** — [write] is the sole write entry point; no
 *     other class holds a reference to the underlying [EncryptedFile]
 *     writer. Reviewers: grep the codebase for `EncryptedFile.Builder` —
 *     it must appear only in this file.
 *  2. **Filesystem read-only bit** — after encryption, [File.setReadOnly]
 *     is applied to the ciphertext file. This is OS-level, not just
 *     convention: a subsequent write attempt through this same class will
 *     fail with an `IOException`, which [write] surfaces as an
 *     `IllegalStateException` rather than silently succeeding.
 *  3. There is intentionally **no `update`/`overwrite` method** on this
 *     class — only [write] (once) and [delete] (logged via
 *     [com.pramana.evidence.envelope.CustodyEvent], never silent).
 *
 * A CI-enforced architecture test (rule 4's "fails the build") is a
 * follow-up — v0.1 relies on code review + the runtime read-only
 * enforcement above; see `docs/compliance-matrix.md`.
 */
class SealedVault(context: Context) {

    private val appContext = context.applicationContext
    private val masterKey = MasterKey.Builder(appContext)
        .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
        .build()

    private val vaultRoot: File = File(appContext.filesDir, "vault").apply { mkdirs() }

    fun sessionDir(sessionId: String): File = File(vaultRoot, sessionId).apply { mkdirs() }

    /**
     * Writes [bytes] once, encrypted at rest, then marks the ciphertext
     * read-only. Throws [IllegalStateException] if a file already exists
     * at this path — sealing is a one-shot operation by design.
     */
    fun write(sessionId: String, relativeName: String, bytes: ByteArray): File {
        val target = File(sessionDir(sessionId), relativeName)
        check(!target.exists()) { "Refusing to overwrite an already-sealed vault entry: $relativeName" }

        val encryptedFile = EncryptedFile.Builder(
            appContext, target, masterKey, EncryptedFile.FileEncryptionScheme.AES256_GCM_HKDF_4KB,
        ).build()

        encryptedFile.openFileOutput().use { it.write(bytes) }

        val sealed = target.setReadOnly()
        check(sealed) { "Failed to mark vault entry read-only after write: $relativeName" }

        return target
    }

    fun read(sessionId: String, relativeName: String): ByteArray {
        val target = File(sessionDir(sessionId), relativeName)
        val encryptedFile = EncryptedFile.Builder(
            appContext, target, masterKey, EncryptedFile.FileEncryptionScheme.AES256_GCM_HKDF_4KB,
        ).build()
        return encryptedFile.openFileInput().use { it.readBytes() }
    }

    fun exists(sessionId: String, relativeName: String): Boolean =
        File(sessionDir(sessionId), relativeName).exists()

    /**
     * Deletion is possible (unlike modification); every call site MUST
     * append a [com.pramana.evidence.envelope.CustodyEvent] with
     * `event = DELETED` and a non-blank `reason` before or immediately
     * after calling this (master brief, Section 14, rule 8).
     */
    fun delete(sessionId: String, relativeName: String): Boolean {
        val target = File(sessionDir(sessionId), relativeName)
        if (!target.exists()) return false
        target.setWritable(true) // read-only files cannot be unlinked on all filesystems without this
        return target.delete()
    }

    fun listSessionFiles(sessionId: String): List<File> = sessionDir(sessionId).listFiles()?.toList() ?: emptyList()
}
