import crypto from 'node:crypto';

const ADMIN_PIN = String(process.env.ADMIN_PIN || '2468');
const DEFAULT_PIN = !process.env.ADMIN_PIN;

const SECRET =
  process.env.SESSION_SECRET ||
  crypto.createHash('sha256').update(`writing-fun:${ADMIN_PIN}`).digest();

const TTL = 1000 * 60 * 60 * 24 * 30; // 30 days
export const COOKIE = 'wf_admin';

export const usingDefaultPin = DEFAULT_PIN;

const b64 = (buf) => Buffer.from(buf).toString('base64url');

export function issueToken() {
  const payload = b64(JSON.stringify({ exp: Date.now() + TTL }));
  const sig = crypto.createHmac('sha256', SECRET).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

export function verifyToken(token) {
  if (typeof token !== 'string' || !token.includes('.')) return false;
  const [payload, sig] = token.split('.');
  const expected = crypto.createHmac('sha256', SECRET).update(payload).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return false;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return Number(data.exp) > Date.now();
  } catch {
    return false;
  }
}

export function checkPin(pin) {
  const a = Buffer.from(String(pin));
  const b = Buffer.from(ADMIN_PIN);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function parseCookies(header = '') {
  const out = {};
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

export function requireAdmin(req, res, next) {
  const auth = req.get('authorization') || '';
  const bearer = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  const token = parseCookies(req.get('cookie') || '')[COOKIE] || bearer;
  if (!verifyToken(token)) return res.status(401).json({ error: 'unauthorized' });
  next();
}

export function setAuthCookie(res, token) {
  const secure = process.env.NODE_ENV === 'production';
  res.setHeader(
    'Set-Cookie',
    `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(TTL / 1000)}${
      secure ? '; Secure' : ''
    }`,
  );
}

export function clearAuthCookie(res) {
  res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
}
