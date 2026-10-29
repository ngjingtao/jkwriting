// Students share the same word lists, settings and stroke guides, but each
// one keeps their own practice history and handwriting.

import crypto from 'node:crypto';
import {
  dbState,
  dbListStudents,
  dbAddStudent,
  dbRenameStudent,
  dbDeleteStudent,
} from './db.js';

const DEFAULT_STUDENT = { id: 'family', name: 'Student 1', work: 0, stars: 0, lastTs: null };

export function cleanName(raw) {
  return String(raw ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 24);
}

export function isStudentId(value) {
  return typeof value === 'string' && /^[a-z0-9_-]{1,32}$/.test(value);
}

export async function listStudents() {
  if (!dbState.enabled) return [DEFAULT_STUDENT];
  return dbListStudents();
}

async function nameTaken(name, exceptId = null) {
  const students = await listStudents();
  const needle = name.toLowerCase();
  return students.some((s) => s.id !== exceptId && s.name.toLowerCase() === needle);
}

export async function addStudent(rawName) {
  const name = cleanName(rawName);
  if (!name) throw Object.assign(new Error('name_required'), { status: 400 });
  if (!dbState.enabled) {
    throw Object.assign(new Error('database_required'), { status: 503 });
  }
  if (await nameTaken(name)) throw Object.assign(new Error('name_taken'), { status: 409 });
  const id = `s-${crypto.randomBytes(4).toString('hex')}`;
  return dbAddStudent(id, name);
}

export async function renameStudent(id, rawName) {
  const name = cleanName(rawName);
  if (!isStudentId(id)) throw Object.assign(new Error('bad_student'), { status: 400 });
  if (!name) throw Object.assign(new Error('name_required'), { status: 400 });
  if (!dbState.enabled) {
    throw Object.assign(new Error('database_required'), { status: 503 });
  }
  if (await nameTaken(name, id)) throw Object.assign(new Error('name_taken'), { status: 409 });
  const updated = await dbRenameStudent(id, name);
  if (!updated) throw Object.assign(new Error('not_found'), { status: 404 });
  return updated;
}

export async function removeStudent(id) {
  if (!isStudentId(id)) throw Object.assign(new Error('bad_student'), { status: 400 });
  if (!dbState.enabled) {
    throw Object.assign(new Error('database_required'), { status: 503 });
  }
  const removed = await dbDeleteStudent(id);
  if (!removed) throw Object.assign(new Error('not_found'), { status: 404 });
  return removed;
}

export { DEFAULT_STUDENT };
