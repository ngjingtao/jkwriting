// Postgres storage for the config (word lists, settings, stroke overrides)
// and for the practice history, so the data follows the family across
// machines and survives redeploys on hosts with an ephemeral disk.
//
// Set DATABASE_URL (Render/Neon/Supabase/Railway all work) to enable it.
// Without it the app keeps using data/store.json and localStorage only.

import dns from 'node:dns/promises';

const CONFIG_ID = 1;
const PROGRESS_LIMIT = 800;
const WORK_LIMIT = 600;

export const dbState = {
  enabled: false,
  kind: 'file', // file | postgres
  lastError: '',
  ready: false,
};

let client = null;
let pool = null;
let initPromise = null;

function sslFor(connectionString) {
  const mode = String(process.env.PGSSL || '').toLowerCase();
  if (mode === 'off' || mode === 'false' || mode === 'disable') return false;
  if (mode === 'require' || mode === 'strict') return { rejectUnauthorized: true };
  let host = '';
  try {
    host = new URL(connectionString).hostname;
  } catch {
    return undefined;
  }
  if (host === 'localhost' || host === '127.0.0.1' || host === '::1') return undefined;
  if (host.endsWith('.internal') || host.endsWith('.local')) return undefined;
  return { rejectUnauthorized: false };
}

async function createClient() {
  const { default: pg } = await import('pg');
  const connectionString = process.env.DATABASE_URL;
  const url = new URL(connectionString);
  const hostname = url.hostname;
  const mode = (url.searchParams.get('sslmode') || '').toLowerCase();
  let ssl = sslFor(connectionString);
  if (mode === 'disable') ssl = false;

  // Some home/office networks advertise IPv6 but cannot route it, and then
  // node-postgres hangs until the timeout. Resolve the IPv4 address up front
  // and keep the hostname as the TLS server name (managed poolers route by
  // SNI, so this keeps the certificate/proxy happy).
  let host = hostname;
  if (ssl) {
    const address = await dns
      .lookup(hostname, { family: 4 })
      .then((found) => found.address)
      .catch(() => null);
    if (address) {
      host = address;
      ssl = { ...(typeof ssl === 'object' ? ssl : {}), servername: hostname };
    }
  }

  pool = new pg.Pool({
    host,
    port: Number(url.port) || 5432,
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: decodeURIComponent(url.pathname.replace(/^\//, '')) || undefined,
    ssl,
    max: Number(process.env.PGPOOL_MAX) || 4,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 15000,
  });
  pool.on('error', (err) => {
    dbState.lastError = err.message;
    console.warn('[db] idle client error:', err.message);
  });
  return { query: (sql, params) => pool.query(sql, params) };
}

const SCHEMA = [
  `create table if not exists wf_config (
     id integer primary key,
     data jsonb not null,
     updated_at timestamptz not null default now()
   )`,
  `create table if not exists wf_progress (
     profile text not null,
     entry_key text not null,
     ts bigint not null,
     data jsonb not null,
     created_at timestamptz not null default now(),
     primary key (profile, entry_key)
   )`,
  `create index if not exists wf_progress_ts_idx on wf_progress (profile, ts desc)`,
  `create table if not exists wf_students (
     id text primary key,
     name text not null,
     created_at timestamptz not null default now()
   )`,
  `insert into wf_students (id, name) values ('family', 'Student 1')
     on conflict (id) do nothing`,
  `create table if not exists wf_work (
     id bigserial primary key,
     student text not null,
     ts bigint not null,
     token text not null,
     unit text not null,
     set_name text not null default '',
     lang text not null default 'en',
     kind text not null default 'latin',
     pct integer not null default 0,
     stars integer not null default 0,
     strokes jsonb not null,
     guide jsonb,
     created_at timestamptz not null default now()
   )`,
  `create index if not exists wf_work_student_ts_idx on wf_work (student, ts desc)`,
];

/** Connect and create the tables. Safe to call repeatedly. */
export async function initDb(injected = null) {
  if (dbState.ready && !injected) return dbState.enabled;
  if (initPromise && !injected) return initPromise;
  if (!injected && !process.env.DATABASE_URL) {
    dbState.enabled = false;
    dbState.kind = 'file';
    return false;
  }
  initPromise = (async () => {
    try {
      client = injected?.query ? injected : await createClient();
      for (const sql of SCHEMA) await client.query(sql);
      dbState.enabled = true;
      dbState.kind = 'postgres';
      dbState.ready = true;
      dbState.lastError = '';
      return true;
    } catch (err) {
      dbState.enabled = false;
      dbState.kind = 'file';
      dbState.lastError = err.message;
      console.warn('[db] connection failed, falling back to the file store:', err.message);
      return false;
    }
  })();
  return initPromise;
}

async function q(sql, params) {
  if (!dbState.enabled) await initDb();
  if (!dbState.enabled || !client) throw new Error('database not available');
  return client.query(sql, params);
}

/* --------------------------------- config -------------------------------- */

export async function dbReadConfig() {
  const { rows } = await q('select data from wf_config where id = $1', [CONFIG_ID]);
  return rows[0]?.data || null;
}

export async function dbWriteConfig(config) {
  await q(
    `insert into wf_config (id, data, updated_at) values ($1, $2::jsonb, now())
     on conflict (id) do update set data = excluded.data, updated_at = now()`,
    [CONFIG_ID, JSON.stringify(config)],
  );
  return config;
}

/* -------------------------------- progress ------------------------------- */

export async function dbReadProgress(profile, limit = PROGRESS_LIMIT) {
  const { rows } = await q(
    'select data from wf_progress where profile = $1 order by ts desc limit $2',
    [profile, limit],
  );
  return rows.map((row) => row.data).reverse();
}

export async function dbWriteProgress(profile, entries) {
  if (!entries.length) return;
  const values = [];
  const params = [profile];
  for (const [i, entry] of entries.entries()) {
    params.push(entry.key, entry.ts, JSON.stringify(entry.data));
    const base = i * 3;
    values.push(`($1, $${base + 2}, $${base + 3}, $${base + 4}::jsonb)`);
  }
  await q(
    `insert into wf_progress (profile, entry_key, ts, data) values ${values.join(', ')}
     on conflict (profile, entry_key) do update set data = excluded.data, ts = excluded.ts`,
    params,
  );
  await q(
    `delete from wf_progress
      where profile = $1
        and entry_key not in (
          select entry_key from wf_progress where profile = $1 order by ts desc limit $2
        )`,
    [profile, PROGRESS_LIMIT],
  );
}

export async function dbProgressCount(profile) {
  const { rows } = await q('select count(*)::int as n from wf_progress where profile = $1', [profile]);
  return rows[0]?.n || 0;
}

/* -------------------------------- students ------------------------------- */

export async function dbListStudents() {
  const { rows } = await q(
    `select s.id, s.name, s.created_at,
            (select count(*)::int from wf_work w where w.student = s.id) as work,
            (select coalesce(sum(w.stars), 0)::int from wf_work w where w.student = s.id) as stars,
            (select max(w.ts) from wf_work w where w.student = s.id) as last_ts
       from wf_students s
      order by s.created_at asc, s.name asc`,
  );
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    createdAt: row.created_at?.toISOString?.() || null,
    work: row.work,
    stars: row.stars,
    lastTs: row.last_ts === null ? null : Number(row.last_ts),
  }));
}

export async function dbAddStudent(id, name) {
  const { rows } = await q(
    'insert into wf_students (id, name) values ($1, $2) returning id, name, created_at',
    [id, name],
  );
  return rows[0] ? { id: rows[0].id, name: rows[0].name, createdAt: rows[0].created_at } : null;
}

export async function dbRenameStudent(id, name) {
  const { rows } = await q(
    'update wf_students set name = $2 where id = $1 returning id, name, created_at',
    [id, name],
  );
  return rows[0] ? { id: rows[0].id, name: rows[0].name, createdAt: rows[0].created_at } : null;
}

/** Remove a student together with their history and handwriting. */
export async function dbDeleteStudent(id) {
  await q('delete from wf_progress where profile = $1', [id]);
  await q('delete from wf_work where student = $1', [id]);
  const { rows } = await q('delete from wf_students where id = $1 returning id', [id]);
  return rows[0] || null;
}

/* --------------------------------- work ---------------------------------- */

export async function dbSaveWork(work, limit = WORK_LIMIT) {
  const { rows } = await q(
    `insert into wf_work (student, ts, token, unit, set_name, lang, kind, pct, stars, strokes, guide)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11::jsonb)
     returning id`,
    [
      work.student,
      work.ts,
      work.token,
      work.unit,
      work.setName,
      work.lang,
      work.kind,
      work.pct,
      work.stars,
      JSON.stringify(work.strokes),
      work.guide ? JSON.stringify(work.guide) : null,
    ],
  );
  await q(
    `delete from wf_work
      where student = $1
        and id not in (
          select id from wf_work where student = $1 order by ts desc limit $2
        )`,
    [work.student, limit],
  );
  return rows[0]?.id || null;
}

export async function dbListWork(student, limit = 60, before = null) {
  const params = [student, limit];
  let where = 'student = $1';
  if (Number.isFinite(before)) {
    params.push(before);
    where += ' and ts < $3';
  }
  const { rows } = await q(
    `select id, ts, token, unit, set_name, lang, kind, pct, stars, strokes, guide
       from wf_work
      where ${where}
      order by ts desc
      limit $2`,
    params,
  );
  return rows.map((row) => ({
    id: Number(row.id),
    ts: Number(row.ts),
    token: row.token,
    unit: row.unit,
    setName: row.set_name,
    lang: row.lang,
    kind: row.kind,
    pct: row.pct,
    stars: row.stars,
    strokes: row.strokes,
    guide: row.guide,
  }));
}

export async function dbDeleteWork(student, id = null) {
  if (id === null) {
    await q('delete from wf_work where student = $1', [student]);
    return;
  }
  await q('delete from wf_work where student = $1 and id = $2', [student, id]);
}

/** Close the pool (used by tests and by graceful shutdown). */
export async function closeDb() {
  if (pool) await pool.end().catch(() => {});
  pool = null;
  client = null;
  initPromise = null;
  dbState.ready = false;
  dbState.enabled = false;
  dbState.kind = 'file';
}

export { PROGRESS_LIMIT, WORK_LIMIT };
