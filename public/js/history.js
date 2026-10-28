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
