// Who is practising. The content (word lists, settings, stroke guides) is
// shared; the selected student decides which history and handwriting we save.

const KEY = 'wf.student.v1';
const CACHE_KEY = 'wf.students.cache.v1';
const FALLBACK = [{ id: 'family', name: 'Student 1' }];

function readCache() {
  try {
    const raw = JSON.parse(localStorage.getItem(CACHE_KEY) || '[]');
    return Array.isArray(raw) && raw.length ? raw : null;
  } catch {
    return null;
  }
}

let cache = readCache();
let loading = null;

export function currentStudentId() {
  try {
    return localStorage.getItem(KEY) || 'family';
  } catch {
    return 'family';
  }
}

export function setCurrentStudent(id) {
  if (!id) return;
  try {
    localStorage.setItem(KEY, id);
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new CustomEvent('wf:student', { detail: { id } }));
}

export async function loadStudents(force = false) {
  if (cache && !force) return cache;
  if (loading) return loading;
  loading = (async () => {
    try {
      const res = await fetch('/api/students', {
        cache: 'no-store',
        signal: AbortSignal.timeout(9000),
      });
      if (!res.ok) throw new Error('students');
      const data = await res.json();
      const list = Array.isArray(data.students) ? data.students : [];
      cache = list.length ? list : FALLBACK;
      try {
        localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
      } catch {
        /* quota */
      }
    } catch {
      cache = cache || FALLBACK;
    } finally {
      loading = null;
    }
    return cache;
  })();
  return loading;
}

export function cachedStudents() {
  return cache || FALLBACK;
}

export function studentName(id = currentStudentId()) {
  return cachedStudents().find((s) => s.id === id)?.name || 'Student';
}

/** Keep the stored selection valid (e.g. after a student was deleted). */
export async function ensureStudent() {
  // Refresh once per boot so a student added on another device shows up; on a
  // failed fetch the cached list is kept and the current selection survives.
  const list = await loadStudents(true);
  const id = currentStudentId();
  if (!list.some((s) => s.id === id)) setCurrentStudent(list[0].id);
  return list;
}

export function forgetStudentCache() {
  cache = null;
}
