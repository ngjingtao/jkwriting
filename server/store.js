import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { DEFAULT_CONFIG, CONFIG_VERSION } from './defaults.js';
import { dbState, initDb, dbReadConfig, dbWriteConfig } from './db.js';

export const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data');
const STORE_FILE = path.join(DATA_DIR, 'store.json');
const GIST_FILE = 'writing-fun-config.json';

const GIST_ID = process.env.GIST_ID || '';
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || '';

let cache = null;
export const syncState = {
  gist: Boolean(GIST_ID && GITHUB_TOKEN),
  lastSyncAt: 0,
  lastError: '',
  get db() {
    return dbState.enabled;
  },
  get storage() {
    return dbState.kind;
  },
};

/* ------------------------------------------------------------------ */
/* Validation                                                          */
/* ------------------------------------------------------------------ */

const clampNum = (v, def, min, max) =>
  Number.isFinite(Number(v)) ? Math.min(max, Math.max(min, Number(v))) : def;

const oneOf = (v, list, def) => (list.includes(v) ? v : def);

const bool = (v, def) => (typeof v === 'boolean' ? v : def);

const int = (v, def, min, max) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def;
};

const cleanText = (v, max) =>
  String(v ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .trim()
    .slice(0, max);

function cleanStrokes(raw) {
  const out = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [ch, value] of Object.entries(raw).slice(0, 200)) {
    if (!/^[A-Za-z0-9]$/.test(ch) || !Array.isArray(value)) continue;
    const strokes = [];
    for (const stroke of value.slice(0, 8)) {
      // A one-point stroke is a dot (used for the dots on i and j).
      if (!Array.isArray(stroke) || stroke.length < 1 || stroke.length > 80) continue;
      const points = [];
      for (const point of stroke) {
        if (!Array.isArray(point) || point.length < 2) continue;
        const x = Number(point[0]);
        const y = Number(point[1]);
        if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
        points.push([Math.min(1, Math.max(0, x)), Math.min(1, Math.max(0, y))]);
      }
      if (points.length >= 1) strokes.push(points);
    }
    if (strokes.length) out[ch] = strokes;
  }
  return out;
}

function cleanItem(raw, maxText = 24) {
  if (!raw) return null;
  const text = cleanText(typeof raw === 'string' ? raw : raw.text, maxText);
  if (!text) return null;
  const item = { text };
  const meaning = cleanText(raw.meaning, 120);
  if (meaning) item.meaning = meaning;
  const pinyin = cleanText(raw.pinyin, 60);
  if (pinyin) item.pinyin = pinyin;
  return item;
}

function cleanSet(raw, index) {
  if (!raw) return null;
  const name = cleanText(raw.name, 40) || `Set ${index + 1}`;
  const langRaw = oneOf(raw.lang, ['zh', 'en', 'bm'], 'en');
  const kind = oneOf(raw.kind, ['latin', 'chinese', 'passage'], langRaw === 'zh' ? 'chinese' : 'latin');
  const lang = kind === 'chinese' ? 'zh' : langRaw === 'zh' ? 'en' : langRaw;
  const repeat = kind === 'passage' ? 1 : int(raw.repeat, 1, 1, 10);
  const maxText = kind === 'passage' ? 900 : 24;
  const items = [];
  const seen = new Set();
  for (const entry of Array.isArray(raw.items) ? raw.items.slice(0, 300) : []) {
    const item = cleanItem(entry, maxText);
    if (!item || seen.has(item.text)) continue;
    seen.add(item.text);
    items.push(item);
  }
  if (!items.length) return null;
  const id =
    cleanText(raw.id, 48).replace(/[^a-zA-Z0-9_-]/g, '') ||
    `set-${crypto.randomBytes(4).toString('hex')}`;
  return { id, kind, lang, name, enabled: raw.enabled !== false, repeat, items };
}

export function sanitizeConfig(raw) {
  const base = structuredClone(DEFAULT_CONFIG);
  const src = raw && typeof raw === 'object' ? raw : {};
  const practice = src.practice && typeof src.practice === 'object' ? src.practice : {};
  const scoring = src.scoring && typeof src.scoring === 'object' ? src.scoring : {};
  const app = src.app && typeof src.app === 'object' ? src.app : {};

  const sets = [];
  const ids = new Set();
  for (const [i, rawSet] of (Array.isArray(src.sets) ? src.sets.slice(0, 60) : []).entries()) {
    const set = cleanSet(rawSet, i);
    if (!set) continue;
    if (ids.has(set.id)) set.id = `${set.id}-${crypto.randomBytes(2).toString('hex')}`;
    ids.add(set.id);
    sets.push(set);
  }

  const inkColor = /^#[0-9a-fA-F]{6}$/.test(String(practice.inkColor || ''))
    ? String(practice.inkColor)
    : base.practice.inkColor;

  const allowedModes = Array.isArray(practice.allowedModes)
    ? ['trace', 'copy', 'memory'].filter((m) => practice.allowedModes.includes(m))
    : [...base.practice.allowedModes];
  if (!allowedModes.length) allowedModes.push('trace');
  let mode = oneOf(practice.mode, ['trace', 'copy', 'memory'], base.practice.mode);
  if (!allowedModes.includes(mode)) mode = allowedModes[0];

  const strokes = cleanStrokes(src.strokes);
  const seeded =
    Number(src.version) >= CONFIG_VERSION ? strokes : { ...base.strokes, ...strokes };

  // v4: the dots on i and j became single-point dot strokes. Older stores
  // kept them as tiny loops, so take the shipped shape once.
  if (Number(src.version) < 4) {
    for (const ch of ['i', 'j']) {
      if (base.strokes[ch]) seeded[ch] = base.strokes[ch];
    }
  }

  return {
    version: CONFIG_VERSION,
    app: {
      title: cleanText(app.title, 40) || base.app.title,
      uiLang: oneOf(app.uiLang, ['en', 'zh', 'ms'], base.app.uiLang),
    },
    practice: {
      mode,
      allowedModes,
      gridHanzi: oneOf(practice.gridHanzi, ['tian', 'mi', 'none'], base.practice.gridHanzi),
      gridLatin: oneOf(practice.gridLatin, ['lines', 'none'], base.practice.gridLatin),
      guideOpacity: clampNum(practice.guideOpacity, base.practice.guideOpacity, 0.04, 0.75),
      inkWidth: clampNum(practice.inkWidth, base.practice.inkWidth, 0.02, 0.12),
      inkColor,
      boxScale: clampNum(practice.boxScale, base.practice.boxScale, 0.45, 1),
      showPinyin: bool(practice.showPinyin, base.practice.showPinyin),
      showWadeGiles: bool(practice.showWadeGiles, base.practice.showWadeGiles),
      showMeaning: bool(practice.showMeaning, base.practice.showMeaning),
      showNumbers: bool(practice.showNumbers, base.practice.showNumbers),
      autoNext: bool(practice.autoNext, base.practice.autoNext),
      sound: bool(practice.sound, base.practice.sound),
      speakOnComplete: bool(practice.speakOnComplete, base.practice.speakOnComplete),
      penOnly: bool(practice.penOnly, base.practice.penOnly),
    },
    scoring: {
      tolerance: oneOf(scoring.tolerance, ['lenient', 'normal', 'strict'], base.scoring.tolerance),
      threshold: clampNum(scoring.threshold, base.scoring.threshold, 0.2, 0.95),
      showTips: bool(scoring.showTips, base.scoring.showTips),
    },
    strokes: seeded,
    sets: sets.length ? sets : base.sets,
  };
}

/* ------------------------------------------------------------------ */
/* Gist sync (optional, for Render free plan)                          */
/* ------------------------------------------------------------------ */

async function gistRequest(method, body) {
  const res = await fetch(`https://api.github.com/gists/${GIST_ID}`, {
    method,
    headers: {
      Authorization: `Bearer ${GITHUB_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'User-Agent': 'writing-fun',
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(12000),
  });
  if (!res.ok) throw new Error(`GitHub ${res.status}`);
  return res.json();
}

async function gistLoad() {
  if (!syncState.gist) return null;
  try {
    const data = await gistRequest('GET');
    const file = data.files?.[GIST_FILE];
    if (!file) return null;
    const text = file.truncated ? await (await fetch(file.raw_url)).text() : file.content;
    syncState.lastSyncAt = Date.now();
    syncState.lastError = '';
    return JSON.parse(text);
  } catch (err) {
    syncState.lastError = err.message;
    console.warn('[store] gist load failed:', err.message);
    return null;
  }
}

async function gistSave(config) {
  if (!syncState.gist) return;
  try {
    await gistRequest('PATCH', {
      files: { [GIST_FILE]: { content: JSON.stringify(config, null, 2) } },
    });
    syncState.lastSyncAt = Date.now();
    syncState.lastError = '';
  } catch (err) {
    syncState.lastError = err.message;
    console.warn('[store] gist save failed:', err.message);
  }
}

/* ------------------------------------------------------------------ */
/* Public API                                                          */
/* ------------------------------------------------------------------ */

async function readDisk() {
  try {
    return JSON.parse(await fs.readFile(STORE_FILE, 'utf8'));
  } catch {
    return null;
  }
}

export async function loadConfig() {
  if (cache) return cache;
  await initDb();
  let raw = null;
  let fromDb = false;
  if (dbState.enabled) {
    try {
      raw = await dbReadConfig();
      fromDb = Boolean(raw);
    } catch (err) {
      dbState.lastError = err.message;
      console.warn('[store] database read failed:', err.message);
    }
  }
  if (!raw) raw = await readDisk();
  if (!raw) raw = await gistLoad();
  cache = sanitizeConfig(raw || DEFAULT_CONFIG);
  if (!raw) {
    // Persist the defaults so the admin page has a stable file to edit.
    await writeDisk(cache).catch(() => {});
  }
  if (dbState.enabled && !fromDb) {
    // First run with a database (or a store migrated from the file/gist).
    await dbWriteConfig(cache).catch((err) => {
      dbState.lastError = err.message;
      console.warn('[store] database seed failed:', err.message);
    });
  }
  return cache;
}

async function writeDisk(config) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const tmp = `${STORE_FILE}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(config, null, 2));
  await fs.rename(tmp, STORE_FILE);
}

export async function saveConfig(raw) {
  const config = sanitizeConfig(raw);
  cache = config;
  if (dbState.enabled) {
    try {
      await dbWriteConfig(config);
      syncState.lastSyncAt = Date.now();
      syncState.lastError = '';
    } catch (err) {
      dbState.lastError = err.message;
      console.warn('[store] database save failed:', err.message);
    }
  }
  // The file is a local cache and the fallback when no database is configured.
  await writeDisk(config).catch((err) => {
    console.warn('[store] disk save failed:', err.message);
  });
  await gistSave(config);
  return config;
}

export async function resetConfig() {
  return saveConfig(structuredClone(DEFAULT_CONFIG));
}
