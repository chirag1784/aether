# How to verify a PRAMĀṆA evidence bundle — without our software

If a check can only be verified by trusting Pramāṇa's own app or servers, it
is worthless in court. Every claim this app makes about a captured asset must
be reproducible by an independent person — an opposing expert, a
court-appointed examiner, an insurer's own forensic team — using nothing but
standard, publicly available tools.

This document describes the v0.1 bundle format (client-only release: no TSA
timestamp, no server countersignature, no C2PA manifest yet — see
`docs/compliance-matrix.md` for what is and isn't wired up).

## 1. Bundle contents

An exported bundle (`.zip`) contains:

```
session_manifest.json         # session-level metadata + Merkle root
assets/
  PRM_20260725_141233_0007.jpg
  PRM_20260725_141233_0007.envelope.json
  ...
certificate/
  part_a_draft.pdf            # BSA S63(4) Part A — UNSIGNED DRAFT in v0.1
merkle_proof.json             # inclusion proofs for every asset leaf
```

## 2. Verify a single asset's hash

The envelope for each asset (`*.envelope.json`) contains an `asset.hashes`
object with `sha256`, `sha512`, and `md5` values computed over the exact
final bytes of the sealed asset file.

```bash
sha256sum assets/PRM_20260725_141233_0007.jpg
sha512sum assets/PRM_20260725_141233_0007.jpg
md5sum    assets/PRM_20260725_141233_0007.jpg
```

Compare each output against the corresponding value in
`asset.hashes.sha256` / `.sha512` / `.md5` in that asset's envelope JSON.
**Any mismatch means the file you have is not the file that was sealed —
full stop, regardless of what any other field claims.**

## 3. Verify the envelope was not altered after signing

The envelope is signed over its **canonical form**: the JSON is
re-serialised per [RFC 8785 (JCS)](https://datatracker.ietf.org/doc/html/rfc8785)
— keys sorted lexicographically at every object level, no insignificant
whitespace, UTF-8 — and the following top-level fields are **excluded**
from the signed payload (they are appended after signing and are allowed to
change without invalidating the device signature):

- `integrity.device_signature`
- `integrity.server_countersignature` (unused in v0.1 — no backend)
- `integrity.trusted_timestamp` (unused in v0.1 — no TSA integration yet)
- `custody[]` entries with `event` after `"SEALED"`

A reference canonicalizer implementation is at
`android/app/src/main/java/com/pramana/evidence/envelope/JcsCanonicalizer.kt`
— it is a plain, dependency-free Kotlin file you can read line-by-line and
re-implement in any language; the algorithm is standard JCS.

## 4. Verify the device signature

`integrity.device_signature` holds an ECDSA P-256 signature (algorithm
`ECDSA_P256_SHA256`) over the SHA-256 digest of the canonical JSON bytes
from step 3, base64-encoded in `integrity.device_signature.signature_b64`.

The device's public key is exported alongside the bundle as
`assets/<envelope_id>.device_pubkey.pem` (SubjectPublicKeyInfo, PEM). To
verify with OpenSSL:

```bash
# 1. Reproduce the canonical JSON bytes for the envelope (see step 3),
#    save them to canonical.json, then hash:
openssl dgst -sha256 -binary canonical.json > canonical.sha256

# 2. Decode the signature
base64 -d signature_b64.txt > sig.der

# 3. Verify
openssl dgst -sha256 -verify <envelope_id>.device_pubkey.pem \
  -signature sig.der canonical.sha256
```

**What this proves:** the canonical envelope bytes were signed by whatever
private key produced that public key, and that private key was generated
inside this specific Android device's Keystore (StrongBox or TEE, see
`integrity.key_attestation.security_level`).

**What this does NOT prove in v0.1:** that the public key genuinely
originates from real Android hardware and not a software-only emulated
Keystore — that requires validating the hardware key-attestation
certificate chain (`integrity.key_attestation.attestation_chain_sha256`)
up to a Google hardware root, which needs Google's published root
certificates and is a documented gap (see `compliance-matrix.md` — no
backend attestation-verification service ships in v0.1). The chain is
still recorded in the envelope so this check can be performed later or by
a third party with the Google root bundle.

## 5. Verify the session Merkle tree

`session_manifest.json` contains `merkle_root`. `merkle_proof.json` contains,
for every asset, its `leaf_index`, `leaf_hash` (SHA-256 of the asset's
canonical envelope bytes from step 3), and `inclusion_proof` (sibling hashes
up to the root).

To verify inclusion of a leaf: repeatedly concatenate the running hash with
each sibling in the proof array (lexicographically ordered: `sha256(min(a,b) || max(a,b))`
at each level — see `MerkleTree.kt` for the exact concatenation rule used)
and confirm the final value equals `merkle_root`. This proves the asset was
part of the session set at the time the root was computed and was not added
or removed afterward without changing the root.

## 6. What v0.1 cannot yet prove independently

- **Trusted time.** No RFC 3161 timestamp is attached in v0.1 (no TSA
  vendor integrated — see compliance matrix). `time.device_utc` and
  `time.gnss_utc` are recorded and cross-checked against each other, but
  neither is independently, cryptographically anchored to a third-party
  clock yet. Do not represent this as a trusted timestamp in any filing.
- **Server-side re-hash on ingest.** There is no backend in v0.1, so no
  independent party has re-hashed the bytes at upload time. Chain of
  custody after the file leaves the capturing device is a manual/process
  control until Phase P3 ships.
- **C2PA manifest validation** via `c2patool` — not embedded in v0.1.

Anyone reproducing the above and getting a different answer than the
bundle claims should treat the bundle as unverified, not as proof of guilt
by the capturing party — check tool versions, encoding, and line endings
before concluding tampering.
