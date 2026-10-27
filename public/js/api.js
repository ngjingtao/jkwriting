const HANZI_API_VERSION = 2;
const hanziCache = new Map();

export async function fetchConfig() {
  const res = await fetch('/api/config', { cache: 'no-cache' });
  if (!res.ok) throw new Error('config');
  return res.json();
}

export async function fetchHanzi(char) {
  if (hanziCache.has(char)) return hanziCache.get(char);
  const promise = (async () => {
    const res = await fetch(
      `/api/hanzi/${encodeURIComponent(char)}?v=${HANZI_API_VERSION}`,
      { signal: AbortSignal.timeout(15000) },
    );
    if (!res.ok) throw new Error(res.status === 404 ? 'no_data' : 'network');
    return res.json();
  })();
  hanziCache.set(char, promise);
  try {
    return await promise;
  } catch (err) {
    hanziCache.delete(char);
    throw err;
  }
}
