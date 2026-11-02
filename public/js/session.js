// Remembers where a child stopped in a passage, so pressing back is safe and
// the next visit can continue. Stored per student on this device.

import { currentStudentId } from './students.js';

const KEY = 'wf.session.v1';

const storageKey = () => `${KEY}.${currentStudentId()}`;

export function saveSession(session) {
  try {
    const payload = { ...session, student: currentStudentId(), savedAt: Date.now() };
    localStorage.setItem(storageKey(), JSON.stringify(payload));
    window.dispatchEvent(new CustomEvent('wf:session', { detail: { active: true } }));
    return payload;
  } catch {
    return null;
  }
}

export function loadSession() {
  try {
    return JSON.parse(localStorage.getItem(storageKey()) || 'null');
  } catch {
    return null;
  }
}

export function clearSession() {
  try {
    localStorage.removeItem(storageKey());
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new CustomEvent('wf:session', { detail: { active: false } }));
}

export function sessionFor(session, { set, item }) {
  return Boolean(
    session &&
      !session.done &&
      session.setId === (set?.id || '') &&
      session.itemText === (item?.text || ''),
  );
}
