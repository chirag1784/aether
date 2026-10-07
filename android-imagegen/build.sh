#!/usr/bin/env bash
# Builds LU-Image-Gen.apk with the plain Android SDK tools (no Gradle).
# Needs: JDK 17+, ANDROID_HOME with "platforms;android-34" and "build-tools;35.0.0".
set -euo pipefail

cd "$(dirname "$0")"
SDK="${ANDROID_HOME:?set ANDROID_HOME to your Android SDK}"
BT="$SDK/build-tools/35.0.0"
JAR="$SDK/platforms/android-34/android.jar"
OUT=build
KEYSTORE=release.keystore

rm -rf "$OUT" && mkdir -p "$OUT/res" "$OUT/gen" "$OUT/classes" "$OUT/dex"

"$BT/aapt2" compile --dir res -o "$OUT/res/res.zip"
"$BT/aapt2" link -o "$OUT/unsigned.apk" -I "$JAR" \
  --manifest AndroidManifest.xml -A assets --java "$OUT/gen" "$OUT/res/res.zip"

javac --release 8 -nowarn -classpath "$JAR" \
  -d "$OUT/classes" $(find src "$OUT/gen" -name '*.java')
(cd "$OUT/classes" && jar cf ../classes.jar .)
"$BT/d8" --release --min-api 24 --lib "$JAR" --output "$OUT/dex" "$OUT/classes.jar"
(cd "$OUT/dex" && zip -q -j ../unsigned.apk classes.dex)

if [ ! -f "$KEYSTORE" ]; then
  keytool -genkeypair -keystore "$KEYSTORE" -alias lu -keyalg RSA -keysize 2048 -validity 10000 \
    -storepass luimagegen -keypass luimagegen -dname "CN=LU Image Gen" >/dev/null
fi
"$BT/zipalign" -f 4 "$OUT/unsigned.apk" "$OUT/aligned.apk"
"$BT/apksigner" sign --ks "$KEYSTORE" --ks-pass pass:luimagegen --key-pass pass:luimagegen \
  --out LU-Image-Gen.apk "$OUT/aligned.apk"
"$BT/apksigner" verify LU-Image-Gen.apk
echo "Built $(pwd)/LU-Image-Gen.apk"
