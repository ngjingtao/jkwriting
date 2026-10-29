import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const DATA_DIR = path.join(os.tmpdir(), `wf-students-test-${process.pid}`);
process.env.DATA_DIR = DATA_DIR;

const { initDb, closeDb, dbProgressCount, dbWriteProgress } = await import('../server/db.js');
const students = await import('../server/students.js');
const work = await import('../server/work.js');

async function withDb(fn) {
  const pg = new PGlite();
  await pg.waitReady;
  try {
    assert.equal(await initDb(pg), true);
    await fn(pg);
  } finally {
    await closeDb();
    await pg.close();
    await fs.rm(DATA_DIR, { recursive: true, force: true });
  }
}

const stroke = [
  [0.4, 0.2],
  [0.45, 0.5],
  [0.5, 0.7],
];

test('a default student exists and new ones can be added', async () => {
  await withDb(async () => {
    const initial = await students.listStudents();
    assert.equal(initial.length, 1);
    assert.equal(initial[0].id, 'family');

    const added = await students.addStudent('  Mei   Ling ');
    assert.equal(added.name, 'Mei Ling');
    assert.match(added.id, /^s-[a-f0-9]{8}$/);

    const list = await students.listStudents();
    assert.equal(list.length, 2);
    assert.ok(list.some((s) => s.name === 'Mei Ling'));

    await assert.rejects(() => students.addStudent('mei ling'), /name_taken/);
    await assert.rejects(() => students.addStudent('   '), /name_required/);
  });
});

test('students can be renamed and removed', async () => {
  await withDb(async () => {
    const added = await students.addStudent('Ali');
    const renamed = await students.renameStudent(added.id, 'Ahmad');
    assert.equal(renamed.name, 'Ahmad');
    await assert.rejects(() => students.renameStudent('nope!', 'X'), /bad_student/);

    await students.removeStudent(added.id);
    const list = await students.listStudents();
    assert.ok(!list.some((s) => s.id === added.id));
  });
});

test('removing a student deletes their history and handwriting', async () => {
  await withDb(async () => {
    const added = await students.addStudent('Sara');
    await dbWriteProgress(added.id, [
      { key: '1000|cat', ts: 1000, data: { ts: 1000, text: 'cat', stars: 2 } },
    ]);
    await work.saveWork({
      student: added.id,
      token: 'cat',
      unit: 'c',
      pct: 80,
      stars: 4,
      strokes: [stroke],
    });
    assert.equal(await dbProgressCount(added.id), 1);

    await students.removeStudent(added.id);
    assert.equal(await dbProgressCount(added.id), 0);
    const listed = await work.listWork(added.id);
    assert.equal(listed.work.length, 0);
  });
});

test('handwriting round-trips with the guide', async () => {
  await withDb(async () => {
    const added = await students.addStudent('Ben');
    const saved = await work.saveWork({
      student: added.id,
      ts: 1700000000000,
      token: 'cat',
      unit: 'c',
      setName: 'First words',
      lang: 'en',
      kind: 'latin',
      pct: 91,
      stars: 5,
      strokes: [stroke],
      guide: [stroke],
    });
    assert.equal(saved.stored, true);

    const listed = await work.listWork(added.id);
    assert.equal(listed.work.length, 1);
    const item = listed.work[0];
    assert.equal(item.unit, 'c');
    assert.equal(item.pct, 91);
    assert.deepEqual(item.strokes, [stroke]);
    assert.deepEqual(item.guide, [stroke]);
  });
});

test('work is validated and clamped', () => {
  const cleaned = work.cleanWork({
    student: 'family',
    token: 'x'.repeat(200),
    unit: 'x',
    pct: 140,
    stars: 99,
    strokes: [
      [
        [-1, 2],
        [0.5, 0.5],
      ],
    ],
    guide: [],
  });
  assert.equal(cleaned.pct, 100);
  assert.equal(cleaned.stars, 5);
  assert.equal(cleaned.token.length, 80);
  assert.deepEqual(cleaned.strokes, [
    [
      [0, 1],
      [0.5, 0.5],
    ],
  ]);
  assert.equal(cleaned.guide, null);

  assert.equal(work.cleanWork({ student: 'bad id', strokes: [stroke] }), null);
  assert.equal(work.cleanWork({ student: 'family', strokes: [] }), null);
});

test('work is kept per student', async () => {
  await withDb(async () => {
    const a = await students.addStudent('A');
    const b = await students.addStudent('B');
    await work.saveWork({ student: a.id, token: 'a', unit: 'a', strokes: [stroke] });
    await work.saveWork({ student: b.id, token: 'b', unit: 'b', strokes: [stroke] });
    assert.equal((await work.listWork(a.id)).work.length, 1);
    assert.equal((await work.listWork(b.id)).work[0].unit, 'b');
    assert.equal((await work.listWork(a.id)).work[0].unit, 'a');
  });
});
