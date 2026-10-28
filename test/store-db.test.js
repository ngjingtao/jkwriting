import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';

// Point the file cache at a scratch directory before the store module loads.
const DATA_DIR = path.join(os.tmpdir(), `wf-store-test-${process.pid}`);
process.env.DATA_DIR = DATA_DIR;
await fs.rm(DATA_DIR, { recursive: true, force: true });

const { initDb, closeDb, dbReadConfig } = await import('../server/db.js');
const store = await import('../server/store.js');
const progress = await import('../server/progress-store.js');

async function freshDb() {
  const pg = new PGlite();
  await pg.waitReady;
  await initDb(pg);
  return pg;
}

test('config is written to the database and reloaded from it', async () => {
  const pg = await freshDb();
  try {
    const seeded = await store.loadConfig();
    assert.equal(Object.keys(seeded.strokes).length, 45);
    assert.ok(await dbReadConfig());

    const saved = await store.saveConfig({ ...seeded, app: { title: 'Shared Family Writing' } });
    assert.equal(saved.app.title, 'Shared Family Writing');

    // A second boot (fresh module instance, same database) reads the saved value.
    const restarted = await import('../server/store.js?restart');
    const booted = await restarted.loadConfig();
    assert.equal(booted.app.title, 'Shared Family Writing');
  } finally {
    await closeDb();
    await pg.close();
    await fs.rm(DATA_DIR, { recursive: true, force: true });
  }
});

test('practice history merges across two devices', async () => {
  const pg = await freshDb();
  try {
    const ipad = await progress.saveProgress('family', [
      { ts: 1000, text: 'dog', stars: 2, lang: 'en' },
      { ts: 2000, text: 'cat', stars: 3, lang: 'en' },
    ]);
    assert.equal(ipad.stored, true);
    assert.equal(ipad.merged, 2);

    const phone = await progress.saveProgress('family', [
      { ts: 1500, text: 'bird', stars: 1, lang: 'en' },
      { ts: 2000, text: 'cat', stars: 3, lang: 'en' },
    ]);
    assert.equal(phone.merged, 1);
    assert.equal(phone.entries.length, 3);

    const pulled = await progress.loadProgress('family');
    assert.deepEqual(
      pulled.entries.map((entry) => entry.text),
      ['dog', 'bird', 'cat'],
    );
    assert.equal(pulled.stored, true);
  } finally {
    await closeDb();
    await pg.close();
    await fs.rm(DATA_DIR, { recursive: true, force: true });
  }
});

test('without a database the progress API reports that nothing was stored', async () => {
  await closeDb();
  const result = await progress.saveProgress('family', [{ ts: 5000, text: 'sun', stars: 1 }]);
  assert.equal(result.stored, false);
  assert.equal(result.db, false);
  assert.equal(result.entries.length, 1);
});
