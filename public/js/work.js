// Queue of finished units (handwriting + score) waiting to reach the server.
// Kept in localStorage so a Wi-Fi drop never loses the child's work.

import { currentStudentId } from './students.js';

const KEY = 'wf.workqueue.v1';
const MAX = 300;
let flushing = null;

function read() {
  try {
    const list = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function write(list) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(-MAX)));
  } catch {
    /* quota */
  }
}

export function queuedWorkCount() {
  return read().length;
}

export function queueWork(entry) {
  if (!entry || !entry.strokes?.length) return;
  const list = read();
  list.push({ student: entry.student || currentStudentId(), ts: Date.now(), ...entry });
  write(list);
  flushWork();
}

export async function flushWork() {
  if (flushing) return flushing;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return { ok: false, offline: true };
  flushing = (async () => {
    let sent = 0;
    let list = read();
    while (list.length) {
      const entry = list[0];
      try {
        const res = await fetch('/api/work', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(entry),
          signal: AbortSignal.timeout(9000),
        });
        if (!res.ok) break;
        list = list.slice(1);
        write(list);
        sent += 1;
      } catch {
        break;
      }
    }
    return { ok: list.length === 0, sent, left: list.length };
  })();
  try {
    return await flushing;
  } finally {
    flushing = null;
  }
}

export function initWorkSync() {
  flushWork();
  window.addEventListener('online', () => flushWork());
  setInterval(() => {
    if (read().length) flushWork();
  }, 45000);
}
