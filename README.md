# Aether

Premium landing site built with Vite + React 19 + TypeScript + Tailwind v4 + Framer Motion.

## PRAMĀṆA Android app

This repository also contains the PRAMĀṆA tamper-evident evidence capture
app for Android, under [`android/`](android/). See
[`android/README.md`](android/README.md) to build it, and
[`docs/compliance-matrix.md`](docs/compliance-matrix.md) for what v0.1
does and does not implement.

## Local development

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
npm run preview
```

## Deploy to Vercel (recommended)

**Fastest:**
```bash
npm i -g vercel
vercel
# then for prod
vercel --prod
```

**Best practice:**
1. Push to GitHub
2. Go to https://vercel.com/new → Import repo
3. Deploy. Automatic deploys on every push.

## Customize

- All content, sections, and copy: `src/App.tsx`
- Colors & base styles: `src/index.css` (search for `--accent`)
- Add/remove sections as needed. Everything is self-contained.

Clean, fast, beautiful. Ready to ship.
