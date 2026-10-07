# LU Image Gen (Android)

A small Android app for generating images from your phone with
[Locally Uncensored](https://github.com/PurpleDoubleD/locally-uncensored).

The phone only sends requests. The images are made on your PC by the desktop
app's ComfyUI, using whatever image models you installed there. The project's own
phone page (`/mobile`) only does chat. This app talks to the same remote-access
server and adds image generation.

## Install

1. Download [`LU-Image-Gen.apk`](LU-Image-Gen.apk) on your phone (GitHub → file → *Download raw*).
2. Open it. Android will ask you to allow installs from your browser or file manager. Allow it once.

## Set up the PC (one time)

1. Install Locally Uncensored on a Windows or Linux PC with a GPU.
2. Go to **Model Manager → Image** and download a checkpoint, for example an SDXL / Pony model,
   or SD 1.5 for weaker GPUs. Open the **Create** tab once so ComfyUI starts.
3. Open **Remote Access** and turn it on.
   - Enable the **Process Control** permission. Image generation is blocked without it.
   - Same Wi-Fi: use the LAN address it shows (e.g. `http://192.168.1.20:PORT`).
   - Away from home: turn on the Cloudflare tunnel and use the `https://….trycloudflare.com` address.

## Use

1. In the app, enter the desktop address and the 6-digit code from the Remote Access panel, then tap **Connect**.
2. Pick a model, write a prompt, and tap **Generate**.
3. Tap **Save to gallery** to save an image to `Pictures/LU Image Gen`.

Suggested settings: SD 1.5 512×768 CFG 7 · SDXL/Pony 832×1216 CFG 5–7 ·
Flux all-in-one checkpoints CFG 1, euler/simple, 20 steps.
Only single-file checkpoints are listed. Flux models split into separate UNet, CLIP and VAE files won't show up.

## Build from source

```bash
export ANDROID_HOME=/path/to/android-sdk   # needs platforms;android-34 + build-tools;35.0.0
./build.sh
```

`release.keystore` (password `luimagegen`) is committed on purpose so rebuilt
APKs install over the old one. It is not a secret.
