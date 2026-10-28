// Practice history backed by the database, with the local file/browser as a
// cache. Without DATABASE_URL these helpers report `stored: false` and the
// app keeps working from localStorage only.

import { dbState, initDb, dbReadProgress, dbWriteProgress, PROGRESS_LIMIT } from './db.js';
import { cleanEntries, mergeProgress, progressKey, MAX_ENTRIES } from './progress.js';

const PROFILE_RE = /^[a-z0-9_-]{1,24}$/i;

export function cleanProfile(raw) {
  const value = String(raw ?? '').trim();
  return PROFILE_RE.test(value) ? value.toLowerCase() : 'family';
}

export async function loadProgress(profile) {
  const name = cleanProfile(profile);
  await initDb();
  if (!dbState.enabled) return { stored: false, entries: [], db: false };
  try {
    const rows = await dbReadProgress(name, PROGRESS_LIMIT);
    return { stored: true, db: true, entries: cleanEntries(rows, PROGRESS_LIMIT) };
  } catch (err) {
    dbState.lastError = err.message;
    console.warn('[progress] load failed:', err.message);
    return { stored: false, db: false, entries: [], error: 'database' };
  }
}

/** Merge the incoming entries with what is already stored, newest wins. */
export async function saveProgress(profile, incoming) {
  const name = cleanProfile(profile);
  const entries = cleanEntries(incoming, MAX_ENTRIES);
  await initDb();
  if (!dbState.enabled) {
    return { stored: false, db: false, entries, merged: 0 };
  }
  try {
    const existing = cleanEntries(await dbReadProgress(name, PROGRESS_LIMIT), PROGRESS_LIMIT);
    const merged = mergeProgress(existing, entries);
    const known = new Set(existing.map(progressKey));
    const fresh = merged.filter((entry) => !known.has(progressKey(entry)));
    if (fresh.length) {
      await dbWriteProgress(
        name,
        fresh.map((entry) => ({ key: progressKey(entry), ts: entry.ts, data: entry })),
      );
    }
    return { stored: true, db: true, entries: merged, merged: fresh.length };
  } catch (err) {
    dbState.lastError = err.message;
    console.warn('[progress] save failed:', err.message);
    return { stored: false, db: false, entries, merged: 0, error: 'database' };
  }
}
