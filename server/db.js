// Postgres storage for the config (word lists, settings, stroke overrides)
// and for the practice history, so the data follows the family across
// machines and survives redeploys on hosts with an ephemeral disk.
//
// Set DATABASE_URL (Render/Neon/Supabase/Railway all work) to enable it.
// Without it the app keeps using data/store.json and localStorage only.

const CONFIG_ID = 1;
const PROGRESS_LIMIT = 800;

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
  pool = new pg.Pool({
    connectionString,
    ssl: sslFor(connectionString),
    max: Number(process.env.PGPOOL_MAX) || 4,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 12000,
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

export { PROGRESS_LIMIT };
