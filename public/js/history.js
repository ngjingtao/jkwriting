// Practice history. localStorage is the instant/offline copy; when the server
// has a database configured, /api/progress merges it so the same stars and
// words show up on every device.

const KEY = 'wf.history.v1';
const MAX = 500;
const PROFILE = 'family';
const SYNC_INTERVAL = 60000;

const keyOf = (entry) => `${entry.ts}|${entry.text}`;

export function getHistory() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

function saveHistory(list) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(-MAX)));
  } catch {
    /* ignore quota */
  }
}

function mergeLists(...lists) {
  const byKey = new Map();
  for (const entry of lists.flat()) {
    if (!entry || !entry.ts || !entry.text) continue;
    byKey.set(keyOf(entry), entry);
  }
  return [...byKey.values()].sort((a, b) => a.ts - b.ts).slice(-MAX);
}

function announce(changed) {
  window.dispatchEvent(new CustomEvent('wf:progress', { detail: { changed } }));
}

/* ---------------------------------- sync ---------------------------------- */

let inFlight = null;
let pushTimer = null;

export async function syncProgress() {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return { ok: false, offline: true };
  if (inFlight) return inFlight;
  inFlight = (async () => {
    try {
      const local = getHistory();
      const res = await fetch(`/api/progress?profile=${PROFILE}`, {
        cache: 'no-store',
        signal: AbortSignal.timeout(9000),
      });
      if (!res.ok) return { ok: false };
      const data = await res.json();
      const remote = Array.isArray(data.entries) ? data.entries : [];
      const merged = mergeLists(local, remote);
      const changed = JSON.stringify(merged) !== JSON.stringify(local);
      if (changed) saveHistory(merged);
      if (data.stored) {
        const known = new Set(remote.map(keyOf));
        const missing = merged.filter((entry) => !known.has(keyOf(entry)));
        if (missing.length) {
          await fetch('/api/progress', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ profile: PROFILE, entries: missing }),
            signal: AbortSignal.timeout(9000),
          });
        }
      }
      if (changed) announce(true);
      return { ok: true, stored: Boolean(data.stored), merged: merged.length };
    } catch {
      return { ok: false };
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}

function scheduleSync(delay = 1500) {
  clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    syncProgress();
  }, delay);
}

export function initHistorySync() {
  syncProgress();
  setInterval(() => syncProgress(), SYNC_INTERVAL);
  window.addEventListener('online', () => syncProgress());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') syncProgress();
  });
}

/* ---------------------------------- write --------------------------------- */

export function addEntry(entry) {
  const list = mergeLists(getHistory(), [{ ts: Date.now(), ...entry }]);
  saveHistory(list);
  announce(false);
  scheduleSync();
}

/* ---------------------------------- stats --------------------------------- */

export function stats() {
  const list = getHistory();
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const today = list.filter((e) => e.ts >= start.getTime());
  return {
    todayStars: today.reduce((sum, e) => sum + (e.stars || 0), 0),
    total: list.length,
    todayCount: today.length,
  };
}

/** Daily stars/counts for the progress tab, plus streak and recent words. */
export function progressStats(days = 7) {
  const list = getHistory();
  const DAY = 86400000;
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const today = start.getTime();

  const daily = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    const from = today - i * DAY;
    const to = from + DAY;
    const entries = list.filter((e) => e.ts >= from && e.ts < to);
    daily.push({
      from,
      label: new Date(from).toLocaleDateString(undefined, { weekday: 'short' }),
      stars: entries.reduce((sum, e) => sum + (e.stars || 0), 0),
      count: entries.length,
      today: i === 0,
    });
  }

  const hasDay = (from) => list.some((e) => e.ts >= from && e.ts < from + DAY);
  let cursor = today;
  if (!hasDay(cursor)) cursor -= DAY;
  let streak = 0;
  while (hasDay(cursor) && streak < 400) {
    streak += 1;
    cursor -= DAY;
  }

  return {
    todayStars: daily[daily.length - 1].stars,
    todayCount: daily[daily.length - 1].count,
    total: list.length,
    totalStars: list.reduce((sum, e) => sum + (e.stars || 0), 0),
    days: daily,
    streak,
    recent: list.slice(-8).reverse(),
  };
}
