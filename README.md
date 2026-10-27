# Writing Fun · 写字乐园

A handwriting practice web app for the iPad. The child writes with an Apple Pencil (or a finger) on a canvas that shows **stroke order, direction arrows and a start dot**, then gets an instant **score, stars and coaching tips**.

Built for a bilingual household: **Chinese (with real stroke order)** plus **English / Bahasa Melayu** (Latin letters). Everything is editable from a parent page — word lists, character size, guide strength and how strict the scoring is.

- **iPad first**: full screen, Apple Pencil pressure, palm rejection, works offline after the first visit, installs to the home screen.
- **Stroke-by-stroke teaching**: numbered start dots, direction arrows, demo animation, hints after a wrong stroke.
- **Real scoring**: compares each stroke's shape, position, length and direction — starting from the wrong end is penalised.
- **Three modes**: Trace (描红), Copy (临摹), Memory (默写).
- **Parent admin**: PIN-protected page for word lists, size, grid, ink and scoring.
- **Tiny stack**: Node + Express + vanilla JS. No build step, no framework.

---

## Quick start (local)

```bash
npm install
npm start
```

Open <http://localhost:3000>. The parent page is at <http://localhost:3000/admin>.

The default admin PIN is **2468** — set `ADMIN_PIN` before using it anywhere public.

```bash
ADMIN_PIN=1234 npm start
```

---

## Using it on the iPad

1. Deploy (see below) and open the URL in **Safari**.
2. Tap **Share → Add to Home Screen**. It opens full screen like an app.
3. In the parent page, turn on **Practice → Pencil only** so finger and palm touches are ignored.
4. Practise. The first time a Chinese character is used it downloads its stroke data and caches it on the device, so it works offline afterwards.

> Tip: lock the iPad in landscape or portrait — the practice box adapts to both. Disable the iPad's "Scribble" if it interferes with writing.

---

## Deploy to GitHub + Render

### 1. Push to GitHub

```bash
git init
git add .
git commit -m "Writing Fun"
git branch -M main
git remote add origin https://github.com/YOUR_USER/writing-fun.git
git push -u origin main
```

### 2. Create the Render service

**Option A — Blueprint (recommended)**

1. Push this repo (it contains `render.yaml`).
2. In Render: **New → Blueprint**, pick the repo, apply.
3. Set `ADMIN_PIN` when prompted (it is marked `sync: false`, so it is never stored in git).

**Option B — Manual web service**

- Type: **Web Service**, Runtime: **Node**
- Build command: `npm ci --omit=dev`
- Start command: `npm start`
- Health check path: `/api/health`
- Environment variables:
  - `ADMIN_PIN` — your parent PIN (required in practice)
  - `NODE_VERSION` = `22`
  - optional: `GIST_ID`, `GITHUB_TOKEN` (see below)

Every push to `main` redeploys automatically.

### 3. Keep settings across redeploys (free plan)

Render's free plan has an **ephemeral disk**: `data/store.json` is lost when the service redeploys. Two options:

**A. Export / Import** — the **Backup** tab downloads your config as JSON; import it after a redeploy.

**B. GitHub gist sync (set and forget)**

1. Create a **secret gist** at <https://gist.github.com> with a file named `writing-fun-config.json`.
2. Create a fine-grained token with **Gists → Read and write**.
3. Add to Render:
   - `GIST_ID` = the gist id (the long hash in its URL)
   - `GITHUB_TOKEN` = the token
4. Restart. The admin page shows "GitHub gist sync: on"; every save is written to the gist, and a fresh deploy restores from it.

---

## The parent page (`/admin`)

| Tab | What it does |
| --- | --- |
| **Word lists** | Add / rename / duplicate / delete lists. One word per line; add a meaning after `\|`: `cat \| 猫 · kucing`. |
| **Practice** | App title and UI language, default mode, grids, **practice box size**, guide visibility, ink thickness/colour, pinyin/meaning/stroke numbers, sound, pencil-only. |
| **Scoring** | Tolerance (gentle / normal / strict), pass mark per stroke, coaching tips. |
| **Backup** | Export / import JSON, reset to defaults, storage + gist status. |

### Word list rules

- **Chinese lists** practise **one character at a time**; multi-character words are split automatically (`你好` → 你, then 好). Pinyin is added automatically from `pinyin-pro`.
- **English / BM lists** practise **one letter at a time**; spaces and punctuation are skipped (`terima kasih` → 11 letters).
- Letters and digits are supported: `a–z`, `A–Z`, `0–9`.
- Duplicate words in a list are dropped on save.

---

## How the score works

For every reference stroke the app keeps a **median polyline** (the path a pen would follow):

- **Shape** — user stroke resampled to 32 points, compared after centring/scaling.
- **Position** — absolute distance to the reference, so writing outside the box loses points.
- **Start / end** — starting at the wrong end (bad stroke order) is heavily penalised.
- **Direction** — the chord angle must match the arrow.
- **Length** — too short / too long.

The character score is the weighted average of its strokes (long strokes weigh more), so missing a long stroke costs more than missing a dot. Stars: **90 %+ = 5, 76 %+ = 4, 60 %+ = 3, 40 %+ = 2**, otherwise 1.

In **Trace** mode a stroke must pass the *pass mark* (default 50 %) before the next one unlocks, with an automatic demo after two misses — so the child cannot practise a stroke the wrong way unnoticed. **Copy** and **Memory** score everything at the end.

The pure scoring code lives in `public/js/scoring.js` and has unit tests (`npm test`).

---

## Project layout

```
server/
  index.js        Express app, API, admin auth
  store.js        Config load/save, validation, optional gist sync
  hanzi.js        Stroke data fetch + disk/memory cache (hanzi-writer-data)
  auth.js         PIN + signed cookie
  defaults.js     Starter word lists and default settings
public/
  index.html      Practice app
  admin.html      Parent page
  js/
    app.js        Home screen, navigation, settings
    practice.js   Lesson flow, guided strokes, results
    surface.js    Canvas: paper, grids, ghost strokes, arrows, ink, demo
    scoring.js    Geometry + scoring (tested)
    glyphs.js     Hand-authored Latin alphabet + digits (stroke order)
    units.js      Word → practice units (Chinese / Latin)
    i18n.js       English / 中文 / Bahasa Melayu UI strings
    ui.js         DOM helpers, icons, sheet, stars, confetti
    api.js        Fetch helpers
    settings.js   Per-device overrides
    history.js    Local star history
    sound.js      WebAudio feedback
  css/
  icons/          Generated app icons
  sw.js           Offline shell + hanzi cache
scripts/make-icons.mjs
test/scoring.test.js
render.yaml
```

---

## Notes & limitations

- **Chinese stroke data** comes from [`hanzi-writer-data`](https://github.com/chanind/hanzi-writer-data) via jsDelivr/unpkg. It is cached in `data/hanzi/` on the server and in the browser, so the app works offline after first use. Rare characters may not exist in the dataset — the app shows a friendly message instead of breaking.
- **Latin letters** are hand-authored in `public/js/glyphs.js`, one stroke list per glyph, in a 0–1 square (cap height 0.14, x-height 0.52, baseline 0.80). Edit them to change the handwriting style.
- **BM** uses the same Latin engine; only the word lists differ.
- Scores are intentionally a bit generous for young children. Use **Scoring → Strict** when they are ready.
- The admin cookie is `HttpOnly`, signed, and lasts 30 days. Set a long, private `ADMIN_PIN`.
- No personal data leaves the device: the score history is in `localStorage`; only word lists/settings live on the server.

## Scripts

```bash
npm start        # production server
npm run dev      # auto-restart on file changes
npm test         # scoring unit tests
npm run icons    # regenerate the PNG/SVG icons
```
