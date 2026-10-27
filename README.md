# Writing Fun · 写字乐园

A handwriting practice web app for the iPad. The child writes with an Apple Pencil (or a finger) on a canvas that shows **stroke order, direction arrows and a start dot**, then gets an instant **score, stars and coaching tips**.

Built for a bilingual household: **Chinese (with real stroke order)** plus **English / Bahasa Melayu** (Latin letters). Everything is editable from a parent page — word lists, character size, guide strength and how strict the scoring is.

- **iPad first**: full screen, Apple Pencil pressure, palm rejection, works offline after the first visit, installs to the home screen.
- **Three content types**, all controlled from the parent page:
  - **A · Latin words / phrases** — write them letter by letter.
  - **B · Chinese words / phrases** — write them character by character with real stroke order.
  - **C · Mixed passages** — Chinese and Latin in one text, practised word by word with the sentence kept in view.
- **Repeat count** for A and B (write each word 2×, 3× … up to 10×).
- **Read aloud**: the word is spoken automatically when it is finished, with a speaker button to hear it again.
- **Hanyu Pinyin + Wade-Giles (威氏拼音)** shown together for every Chinese character.
- **Stroke-by-stroke teaching**: numbered start dots, direction arrows, demo animation, hints after a wrong stroke.
- **Real scoring**: compares each stroke's shape, position, length and direction — starting from the wrong end is penalised.
- **Choose which modes are allowed** in the parent page: Trace (描红), Copy (临摹), Memory (默写).
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
| **Word lists** | Add / rename / duplicate / delete lists. Choose **A Latin**, **B Chinese** or **C Mixed passage**, set the **repeat count**, and type one item per line. |
| **Practice** | App title and UI language, **which modes are allowed** (checkboxes), grids, **practice box size**, guide visibility, ink thickness/colour, pinyin / Wade-Giles / meaning / stroke numbers, sound, **read aloud**, pencil-only. |
| **Scoring** | Tolerance (gentle / normal / strict), pass mark per stroke, coaching tips. |
| **Backup** | Export / import JSON, reset to defaults, storage + gist status. |

### Word list rules

- **A · Latin words / phrases** practise **one letter at a time**; spaces and punctuation are skipped (`good morning` → g,o,o,d,m,o,r,n,i,n,g). Repeat runs the whole word again.
- **B · Chinese words / phrases** practise **one character at a time** (`早上好` → 早, 上, 好). Pinyin, Wade-Giles and stroke data are added automatically.
- **C · Mixed passages** are split into Chinese characters and Latin words; the current sentence stays visible above the practice box. Each word/character is scored and read aloud as it is finished, then the whole passage gets a summary. Repeat does not apply to passages.
- **Meaning** is optional: `cat | 猫 · kucing`.
- Letters and digits are supported: `a–z`, `A–Z`, `0–9`.
- Duplicate lines in a list are dropped on save.

### Reading aloud

- Uses the iPad's built-in `speechSynthesis` voices: Mandarin for Chinese, English or Malay for Latin text.
- If the iPad has no Malay voice, the app falls back to Indonesian, then English.
- The first speech happens after a tap, which satisfies iOS's audio rules. There is a speaker button in the practice header to repeat it.
- Turn it off globally in **Practice → Read aloud**, or per device in the settings sheet.

### Wade-Giles

The parent page shows **Hanyu Pinyin** and **Wade-Giles (威氏拼音)** together, e.g. `zǎo shàng hǎo` / `WG tsao³ shang⁴ hao³`. Tones are superscript numbers 1–4; neutral tone has no number. Conversions use the standard Wade-Giles syllabary (`ch`, `ch'`, `hs`, `tzŭ`, `ssŭ`, `jih`, `erh`, …) and can be toggled in the admin page.

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
  wadegiles.js    Hanyu Pinyin → Wade-Giles conversion (tested)
  auth.js         PIN + signed cookie
  defaults.js     Starter word lists and default settings
public/
  index.html      Practice app
  admin.html      Parent page
  js/
    app.js        Home screen, tabs (Chinese / English / BM / Passages)
    practice.js   Tokens, rounds, guided strokes, speech, results
    surface.js    Canvas: paper, grids, ghost strokes, arrows, ink, demo
    scoring.js    Geometry + scoring (tested)
    glyphs.js     Hand-authored Latin alphabet + digits (stroke order)
    units.js      Words / passages → practice tokens and units
    speech.js     Read-aloud with per-script voices
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

- **Fonts**: the UI uses **Nunito** and handwriting models use **Didact Gothic** — a clean, Arial-like face with the single-storey handwritten `a` children write. Both are self-hosted in `public/fonts/` (Latin + Latin-ext subsets) under the SIL Open Font License — see `public/fonts/OFL-*.txt`. `npm run fonts` re-downloads them.
- **Chinese stroke data** comes from [`hanzi-writer-data`](https://github.com/chanind/hanzi-writer-data) via jsDelivr/unpkg. It is cached in `data/hanzi/` on the server and in the browser, so the app works offline after first use. Rare characters may not exist in the dataset — the app shows a friendly message instead of breaking.
- **Latin letters** are hand-authored in `public/js/glyphs.js`, one stroke list per glyph, in a 0–1 square (cap height 0.14, x-height 0.52, baseline 0.80). Edit them to change the handwriting style.
- **BM** uses the same Latin engine; only the word lists differ.
- **Speech** uses the voices already on the iPad. If no Mandarin voice is installed, go to iPad **Settings → Accessibility → Spoken Content → Voices → Chinese** and download one.
- **Wade-Giles** is generated from Hanyu Pinyin with the standard syllabary; rare characters or polyphonic characters use `pinyin-pro`'s default reading.
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
