package com.pramana.evidence.crypto

import android.content.pm.PackageManager
import android.os.Build
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.security.keystore.StrongBoxUnavailableException
import com.pramana.evidence.envelope.DeviceSignatureInfo
import com.pramana.evidence.envelope.KeyAttestationInfo
import com.pramana.evidence.envelope.KeystoreBacking
import java.security.KeyPairGenerator
import java.security.KeyStore
import java.security.PublicKey
import java.security.SecureRandom
import java.security.Signature
import java.security.cert.Certificate
import java.util.Base64
import android.content.Context

/**
 * Device-level signing over the canonical Evidence Envelope bytes (Section
 * 4, "StrongBoxSigner"; Section 7.1; Section 9.2 build note on the
 * February 2026 Android root rotation is a *server-side* verification
 * concern and does not affect signing, only remote chain validation).
 *
 * Uses ECDSA P-256 keys generated inside the Android Keystore
 * ("AndroidKeyStore" provider), preferring StrongBox (a discrete secure
 * element with non-exportable key material) and falling back to the TEE
 * when the device has no StrongBox, per master brief Section 7.1. Which
 * backing was actually used is recorded truthfully in
 * [KeyAttestationInfo.securityLevel] — never claimed as StrongBox if the
 * fallback occurred (master brief Section 14, rule 6: "never round, never
 * hide, never silently upgrade an assurance level").
 *
 * This class needs no network access and no backend: everything it
 * produces is real cryptography performed entirely on-device. What it
 * does *not* do — because it requires a backend the v0.1 release does not
 * ship — is validate [KeyAttestationInfo.attestationChainSha256] up to a
 * Google hardware root; that chain is recorded so the validation can be
 * performed independently later (`docs/HOW_TO_VERIFY.md` §4).
 */
class StrongBoxSigner(private val context: Context) {

    private val keyStore: KeyStore = KeyStore.getInstance(ANDROID_KEY_STORE).apply { load(null) }

    /**
     * Ensures a signing key exists for [alias], generating one on first
     * use. [attestationChallenge] should be a fresh, high-entropy value
     * per session (the master brief specifies a server-issued challenge in
     * the full design, Section 5 step 0; v0.1 generates it locally with
     * [SecureRandom] since there is no backend to issue one).
     */
    fun ensureKey(alias: String, attestationChallenge: ByteArray): KeyAttestationInfo {
        if (!keyStore.containsAlias(alias)) {
            generateKey(alias, attestationChallenge, preferStrongBox = true)
        }
        val chain = keyStore.getCertificateChain(alias) ?: emptyArray()
        val backing = detectBacking(alias)
        return KeyAttestationInfo(
            keyAlias = alias,
            securityLevel = backing,
            attestationChallenge = Base64.getEncoder().encodeToString(attestationChallenge),
            attestationChainSha256 = chain.map { cert -> HashEngine.sha256Hex(cert.encoded) },
            verifiedBootState = extractVerifiedBootState(chain.firstOrNull()),
            deviceLocked = extractDeviceLocked(chain.firstOrNull()),
        )
    }

    private fun generateKey(alias: String, challenge: ByteArray, preferStrongBox: Boolean) {
        val builder = KeyGenParameterSpec.Builder(alias, KeyProperties.PURPOSE_SIGN)
            .setDigests(KeyProperties.DIGEST_SHA256)
            .setAlgorithmParameterSpec(java.security.spec.ECGenParameterSpec("secp256r1"))
            .setAttestationChallenge(challenge)
            .setUserAuthenticationRequired(false) // biometric confirmation is a separate, app-level gate (context.operator.biometricConfirmedAtCapture)

        if (preferStrongBox && Build.VERSION.SDK_INT >= Build.VERSION_CODES.P &&
            context.packageManager.hasSystemFeature(PackageManager.FEATURE_STRONGBOX_KEYSTORE)
        ) {
            builder.setIsStrongBoxBacked(true)
        }

        val spec = builder.build()
        try {
            val generator = KeyPairGenerator.getInstance(KeyProperties.KEY_ALGORITHM_EC, ANDROID_KEY_STORE)
            generator.initialize(spec)
            generator.generateKeyPair()
        } catch (e: StrongBoxUnavailableException) {
            generateKey(alias, challenge, preferStrongBox = false)
        }
    }

    private fun detectBacking(alias: String): KeystoreBacking {
        val entry = keyStore.getEntry(alias, null) as? KeyStore.PrivateKeyEntry ?: return KeystoreBacking.SOFTWARE
        return try {
            val factory = java.security.KeyFactory.getInstance(entry.privateKey.algorithm, ANDROID_KEY_STORE)
            val info = factory.getKeySpec(entry.privateKey, android.security.keystore.KeyInfo::class.java)
            when {
                Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && info.securityLevel == android.security.keystore.KeyProperties.SECURITY_LEVEL_STRONGBOX ->
                    KeystoreBacking.STRONGBOX
                info.isInsideSecureHardware -> KeystoreBacking.TEE
                else -> KeystoreBacking.SOFTWARE
            }
        } catch (e: Exception) {
            KeystoreBacking.SOFTWARE
        }
    }

    /**
     * Best-effort extraction from the leaf attestation certificate's
     * Android Key Attestation extension (OID 1.3.6.1.4.1.11129.2.1.17).
     * Full ASN.1 parsing of the extension is intentionally out of scope
     * for v0.1 (no backend consumes it yet); this returns null rather than
     * guess when the extension cannot be located, per rule 6 above.
     */
    private fun extractVerifiedBootState(cert: Certificate?): String? = null

    private fun extractDeviceLocked(cert: Certificate?): Boolean? = null

    /** Signs [canonicalJsonBytes] (the JCS output) with [alias]'s private key. */
    fun sign(alias: String, canonicalJsonBytes: ByteArray): DeviceSignatureInfo {
        val entry = keyStore.getEntry(alias, null) as KeyStore.PrivateKeyEntry
        val signature = Signature.getInstance("SHA256withECDSA").apply {
            initSign(entry.privateKey)
            update(canonicalJsonBytes)
        }
        val sig = signature.sign()
        return DeviceSignatureInfo(signatureB64 = Base64.getEncoder().encodeToString(sig))
    }

    fun verify(publicKey: PublicKey, canonicalJsonBytes: ByteArray, signatureB64: String): Boolean {
        val signature = Signature.getInstance("SHA256withECDSA").apply {
            initVerify(publicKey)
            update(canonicalJsonBytes)
        }
        return signature.verify(Base64.getDecoder().decode(signatureB64))
    }

    fun exportPublicKeyPem(alias: String): String {
        val cert = keyStore.getCertificate(alias) ?: error("No certificate for alias $alias")
        val encoded = Base64.getEncoder().encodeToString(cert.publicKey.encoded)
        val wrapped = encoded.chunked(64).joinToString("\n")
        return "-----BEGIN PUBLIC KEY-----\n$wrapped\n-----END PUBLIC KEY-----\n"
    }

    fun certificateChain(alias: String): List<Certificate> =
        keyStore.getCertificateChain(alias)?.toList() ?: emptyList()

    companion object {
        private const val ANDROID_KEY_STORE = "AndroidKeyStore"

        fun freshChallenge(): ByteArray {
            val bytes = ByteArray(32)
            SecureRandom().nextBytes(bytes)
            return bytes
        }
    }
}
