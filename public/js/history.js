const KEY = 'wf.history.v1';

export function getHistory() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

export function addEntry(entry) {
  const list = getHistory();
  list.push({ ts: Date.now(), ...entry });
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(-500)));
  } catch {
    /* ignore quota */
  }
}

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
