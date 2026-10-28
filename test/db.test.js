import test from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import {
  closeDb,
  dbReadConfig,
  dbReadProgress,
  dbState,
  dbWriteConfig,
  dbWriteProgress,
  initDb,
} from '../server/db.js';
import { sanitizeConfig } from '../server/store.js';

async function withDb(fn) {
  const pg = new PGlite();
  await pg.waitReady;
  try {
    assert.equal(await initDb(pg), true);
    assert.equal(dbState.kind, 'postgres');
    await fn(pg);
  } finally {
    await closeDb();
    await pg.close();
  }
}

test('config round-trips through the database', async () => {
  await withDb(async () => {
    assert.equal(await dbReadConfig(), null);
    const config = sanitizeConfig({ app: { title: 'Family Writing' } });
    await dbWriteConfig(config);
    const back = await dbReadConfig();
    assert.equal(back.app.title, 'Family Writing');
    assert.equal(Object.keys(back.strokes).length, Object.keys(config.strokes).length);
  });
});

test('saving the config twice updates the single row', async () => {
  await withDb(async (pg) => {
    await dbWriteConfig(sanitizeConfig({ app: { title: 'One' } }));
    await dbWriteConfig(sanitizeConfig({ app: { title: 'Two' } }));
    const { rows } = await pg.query('select count(*)::int as n from wf_config');
    assert.equal(rows[0].n, 1);
    assert.equal((await dbReadConfig()).app.title, 'Two');
  });
});

test('progress rows are upserted and read oldest first', async () => {
  await withDb(async () => {
    const one = { ts: 1000, text: 'a', stars: 2 };
    const two = { ts: 2000, text: 'b', stars: 1 };
    await dbWriteProgress('family', [
      { key: '1000|a', ts: 1000, data: one },
      { key: '2000|b', ts: 2000, data: two },
    ]);
    assert.deepEqual(await dbReadProgress('family'), [one, two]);

    await dbWriteProgress('family', [{ key: '1000|a', ts: 1000, data: { ...one, stars: 3 } }]);
    assert.equal((await dbReadProgress('family')).length, 2);
    assert.equal((await dbReadProgress('family'))[0].stars, 3);
  });
});

test('progress is kept per profile', async () => {
  await withDb(async () => {
    await dbWriteProgress('family', [{ key: '1|a', ts: 1, data: { ts: 1, text: 'a' } }]);
    assert.equal((await dbReadProgress('family')).length, 1);
    assert.equal((await dbReadProgress('guest')).length, 0);
  });
});
