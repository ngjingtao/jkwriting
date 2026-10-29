import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig, saveConfig, resetConfig, syncState } from './store.js';
import { loadProgress, saveProgress } from './progress-store.js';
import { getHanzi } from './hanzi.js';
import {
  checkPin,
  clearAuthCookie,
  issueToken,
  requireAdmin,
  setAuthCookie,
  usingDefaultPin,
  verifyToken,
  parseCookies,
  COOKIE,
} from './auth.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const PORT = Number(process.env.PORT) || 3000;

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(express.json({ limit: '1mb' }));

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  next();
});

/* ------------------------------ public API ------------------------------ */

app.get('/api/health', (req, res) => {
  res.json({ ok: true, uptime: Math.round(process.uptime()), storage: syncState.storage });
});

app.get('/api/config', async (req, res, next) => {
  try {
    res.setHeader('Cache-Control', 'no-cache');
    res.json(await loadConfig());
  } catch (err) {
    next(err);
  }
});

app.get('/api/hanzi/:char', async (req, res, next) => {
  try {
    const data = await getHanzi(req.params.char);
    if (!data) return res.status(404).json({ error: 'no_stroke_data' });
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.json(data);
  } catch (err) {
    next(err);
  }
});

/* ---------------------------- progress (sync) --------------------------- */

app.get('/api/progress', async (req, res, next) => {
  try {
    res.setHeader('Cache-Control', 'no-store');
    res.json(await loadProgress(req.query.profile));
  } catch (err) {
    next(err);
  }
});

app.post('/api/progress', async (req, res, next) => {
  try {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    res.setHeader('Cache-Control', 'no-store');
    res.json(await saveProgress(body.profile, body.entries));
  } catch (err) {
    next(err);
  }
});

/* ------------------------------- admin API ------------------------------ */

const attempts = new Map();

app.post('/api/admin/login', (req, res) => {
  const ip = req.ip || 'unknown';
  const now = Date.now();
  const rec = attempts.get(ip) || { count: 0, ts: now };
  if (now - rec.ts > 60_000) {
    rec.count = 0;
    rec.ts = now;
  }
  if (rec.count >= 12) return res.status(429).json({ error: 'too_many_attempts' });

  if (!checkPin(req.body?.pin)) {
    rec.count += 1;
    attempts.set(ip, rec);
    return res.status(401).json({ error: 'bad_pin' });
  }

  attempts.delete(ip);
  const token = issueToken();
  setAuthCookie(res, token);
  res.json({ ok: true, token, gist: syncState.gist });
});

app.post('/api/admin/logout', (req, res) => {
  clearAuthCookie(res);
  res.json({ ok: true });
});

app.get('/api/admin/session', (req, res) => {
  const token = parseCookies(req.get('cookie') || '')[COOKIE];
  res.json({ admin: verifyToken(token), gist: syncState.gist });
});

app.put('/api/admin/config', requireAdmin, async (req, res, next) => {
  try {
    const config = await saveConfig(req.body);
    res.json({
      ok: true,
      config,
      sync: { gist: syncState.gist, at: syncState.lastSyncAt, error: syncState.lastError },
    });
  } catch (err) {
    next(err);
  }
});

app.post('/api/admin/reset', requireAdmin, async (req, res, next) => {
  try {
    res.json({ ok: true, config: await resetConfig() });
  } catch (err) {
    next(err);
  }
});

app.get('/api/admin/status', requireAdmin, (req, res) => {
  res.json({
    gist: syncState.gist,
    db: syncState.db,
    dbConfigured: Boolean(process.env.DATABASE_URL),
    storage: syncState.storage,
    lastSyncAt: syncState.lastSyncAt,
    lastError: syncState.lastError,
    defaultPin: usingDefaultPin,
  });
});

/* -------------------------------- static -------------------------------- */

app.get('/admin', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'admin.html')));
app.get('/strokes', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'strokes.html')));

app.use(
  express.static(PUBLIC_DIR, {
    etag: true,
    maxAge: 0,
    setHeaders(res, filePath) {
      if (/\.(js|css|html|webmanifest)$/.test(filePath) || filePath.endsWith('sw.js')) {
        res.setHeader('Cache-Control', 'no-cache');
      } else {
        res.setHeader('Cache-Control', 'public, max-age=86400');
      }
    },
  }),
);

app.use((req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'not_found' });
  const hasExtension = /\.[a-z0-9]+$/i.test(req.path);
  if (!hasExtension && req.accepts('html')) {
    return res.status(404).sendFile(path.join(PUBLIC_DIR, 'index.html'));
  }
  res.status(404).type('text').send('Not found');
});

app.use((err, req, res, next) => {
  console.error('[server]', err);
  if (res.headersSent) return;
  res.status(500).json({ error: 'server_error' });
});

app.listen(PORT, () => {
  console.log(`Writing Fun listening on http://localhost:${PORT}`);
  if (usingDefaultPin) {
    console.warn('[auth] ADMIN_PIN not set — using default PIN "2468". Set ADMIN_PIN on Render!');
  }
  // Warm the storage layer so /api/health reports the real backend and a
  // first run seeds the database (or the file) before anyone opens the app.
  loadConfig()
    .then(() => {
      console.log(
        syncState.db ? '[db] connected — Postgres storage active' : '[store] using data/store.json',
      );
    })
    .catch((err) => console.warn('[startup] config load failed:', err.message));
});
