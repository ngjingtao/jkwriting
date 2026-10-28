// Practice-history entries: validation and merging.
// Entries are merged by `ts|text`, so two devices can push their own lists
// without overwriting each other.

export const MAX_ENTRIES = 500;
const MAX_TEXT = 60;
const MAX_NAME = 40;

const oneOf = (v, list, def) => (list.includes(v) ? v : def);

const clampInt = (v, def, min, max) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def;
};

export function progressKey(entry) {
  return `${entry.ts}|${entry.text}`;
}

export function cleanEntry(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const text = String(raw.text ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .trim()
    .slice(0, MAX_TEXT);
  if (!text) return null;
  const ts = clampInt(raw.ts, 0, 0, Date.now() + 86400000);
  if (!ts) return null;
  return {
    ts,
    text,
    lang: oneOf(raw.lang, ['zh', 'en', 'bm'], 'en'),
    setName: String(raw.setName ?? '')
      .replace(/[\u0000-\u001f\u007f]/g, '')
      .trim()
      .slice(0, MAX_NAME),
    kind: oneOf(raw.kind, ['latin', 'chinese', 'passage'], 'latin'),
    pct: clampInt(raw.pct, 0, 0, 100),
    stars: clampInt(raw.stars, 0, 0, 3),
  };
}

/** Clean, dedupe and keep the newest `limit` entries. */
export function cleanEntries(raw, limit = MAX_ENTRIES) {
  const byKey = new Map();
  for (const entry of Array.isArray(raw) ? raw.slice(0, 2000) : []) {
    const clean = cleanEntry(entry);
    if (!clean) continue;
    byKey.set(progressKey(clean), clean);
  }
  return [...byKey.values()].sort((a, b) => a.ts - b.ts).slice(-limit);
}

/** Union of several entry lists, oldest first. */
export function mergeProgress(...lists) {
  return cleanEntries(lists.flat(), MAX_ENTRIES);
}
