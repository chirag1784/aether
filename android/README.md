# PRAMĀṆA (v0.1) — Android

Tamper-evident geotagged photo/video evidence capture for Android. See
`../docs/compliance-matrix.md` for exactly what this v0.1 release does and
does not implement (short version: it's a fully offline-capable, on-device
Evidence Layer — capture, metadata harvest, anti-spoof scoring, hashing,
StrongBox/TEE device signing, EXIF/XMP embedding, an immutable encrypted
vault, and a draft BSA §63(4) certificate — with **no backend**, so
Play Integrity server verification, RFC 3161 timestamping, C2PA, and the
public verification portal are not wired up yet).

## Requirements

- JDK 17+
- Android SDK: `compileSdk 35`, `minSdk 29`, `targetSdk 35`
  (`build-tools;35.0.0`, `platforms;android-35`)
- A physical Android device or emulator with Google Play services for the
  location APIs; StrongBox-backed signing needs a device with a StrongBox
  secure element (falls back to TEE automatically if absent — see
  `crypto/StrongBoxSigner.kt`)

If you don't have the SDK installed, point `ANDROID_HOME` (and
`android/local.properties`'s `sdk.dir`) at an Android SDK install with the
above packages, e.g.:

```bash
sdkmanager --sdk_root=$ANDROID_HOME "platform-tools" "platforms;android-35" "build-tools;35.0.0"
```

## Build a debug APK

```bash
cd android
./gradlew assembleDebug
```

Output: `app/build/outputs/apk/debug/app-debug.apk`. This is signed with
the Android debug keystore (auto-generated) — fine for sideloading onto a
test device, **not** for Play Store distribution or production use.

## Install on a device

```bash
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

Or transfer the APK to the phone and open it (the device must have
"Install unknown apps" allowed for whichever app you use to open the file).

## Run unit tests

The Evidence Layer (`envelope/`, `crypto/`) is pure Kotlin with no Android
dependency and is unit-testable on a desktop JVM (master brief, Section 14,
rule 2):

```bash
./gradlew test
```

## Project layout

```
app/src/main/java/com/pramana/evidence/
  envelope/    Evidence Envelope data model + JCS canonicalisation (no Android dep)
  crypto/      Hashing, Merkle tree, StrongBox/TEE signing
  capture/     CameraX wiring + the Section 5 capture pipeline
  vault/       Immutable encrypted asset vault (the only writer of sealed bytes)
  exif/        EXIF + XMP (incl. GPano) embedding
  certificate/ BSA §63(4) Part A draft PDF generator
  export/      Session bundle (zip) assembly incl. Merkle proofs
  data/        Room index (session/asset metadata) + DataStore preferences
  ui/          Jetpack Compose screens
```
