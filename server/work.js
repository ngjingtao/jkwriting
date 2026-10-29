// Validation for the handwriting each child produces. A unit is one letter or
// Chinese character; the strokes are normalised polylines (0..1) exactly as
// the practice canvas records them, so the review page can redraw them.

import { dbState, dbSaveWork, dbListWork, dbDeleteWork, WORK_LIMIT } from './db.js';
import { isStudentId } from './students.js';

const MAX_STROKES = 16;
const MAX_POINTS = 160;

const clamp01 = (v) => Math.min(1, Math.max(0, v));

function cleanStrokes(raw) {
  if (!Array.isArray(raw)) return [];
  const strokes = [];
  for (const stroke of raw.slice(0, MAX_STROKES)) {
    if (!Array.isArray(stroke) || !stroke.length) continue;
    const points = [];
    for (const point of stroke.slice(0, MAX_POINTS)) {
      if (!Array.isArray(point) || point.length < 2) continue;
      const x = Number(point[0]);
      const y = Number(point[1]);
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      points.push([Math.round(clamp01(x) * 10000) / 10000, Math.round(clamp01(y) * 10000) / 10000]);
    }
    if (points.length) strokes.push(points);
  }
  return strokes;
}

const cleanText = (value, max) =>
  String(value ?? '')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .trim()
    .slice(0, max);

export function cleanWork(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const student = String(raw.student || '');
  if (!isStudentId(student)) return null;
  const strokes = cleanStrokes(raw.strokes);
  if (!strokes.length) return null;

  const ts = Math.round(Number(raw.ts)) || Date.now();
  const guide = cleanStrokes(raw.guide);

  return {
    student,
    ts: Math.min(Date.now() + 86400000, Math.max(0, ts)),
    token: cleanText(raw.token, 80) || '—',
    unit: cleanText(raw.unit, 16) || '?',
    setName: cleanText(raw.setName, 40),
    lang: ['zh', 'en', 'bm'].includes(raw.lang) ? raw.lang : 'en',
    kind: ['latin', 'chinese', 'passage'].includes(raw.kind) ? raw.kind : 'latin',
    pct: Math.min(100, Math.max(0, Math.round(Number(raw.pct)) || 0)),
    stars: Math.min(5, Math.max(0, Math.round(Number(raw.stars)) || 0)),
    strokes,
    guide: guide.length ? guide : null,
  };
}

export async function saveWork(raw) {
  const work = cleanWork(raw);
  if (!work) throw Object.assign(new Error('invalid_work'), { status: 400 });
  if (!dbState.enabled) {
    return { stored: false, db: false, id: null };
  }
  const id = await dbSaveWork(work, WORK_LIMIT);
  return { stored: true, db: true, id };
}

export async function listWork(student, limit = 60, before = null) {
  if (!isStudentId(student)) throw Object.assign(new Error('bad_student'), { status: 400 });
  if (!dbState.enabled) return { stored: false, db: false, work: [] };
  const rows = await dbListWork(student, Math.min(200, Math.max(1, Number(limit) || 60)), before);
  return { stored: true, db: true, work: rows };
}

export async function clearWork(student, id = null) {
  if (!isStudentId(student)) throw Object.assign(new Error('bad_student'), { status: 400 });
  if (!dbState.enabled) return { stored: false, db: false };
  await dbDeleteWork(student, id === null ? null : Number(id));
  return { stored: true, db: true };
}
