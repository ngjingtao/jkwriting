import fs from 'node:fs/promises';
import path from 'node:path';
import { pinyin } from 'pinyin-pro';
import { DATA_DIR } from './store.js';
import { toWadeGiles } from './wadegiles.js';

const VERSION = '2.0.1';
const CDNS = [
  (char) => `https://cdn.jsdelivr.net/npm/hanzi-writer-data@${VERSION}/${encodeURIComponent(char)}.json`,
  (char) => `https://unpkg.com/hanzi-writer-data@${VERSION}/${encodeURIComponent(char)}.json`,
];

const CACHE_DIR = path.join(DATA_DIR, 'hanzi');
const memory = new Map(); // char -> data | null

const CJK = /^[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]$/;

function pinyinFor(char) {
  try {
    return pinyin(char, { toneType: 'symbol', type: 'array' })[0] || '';
  } catch {
    return '';
  }
}

async function readDisk(char) {
  const file = path.join(CACHE_DIR, `${char.codePointAt(0).toString(16)}.json`);
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'));
  } catch {
    return undefined;
  }
}

async function writeDisk(char, data) {
  const file = path.join(CACHE_DIR, `${char.codePointAt(0).toString(16)}.json`);
  await fs.mkdir(CACHE_DIR, { recursive: true });
  await fs.writeFile(file, JSON.stringify(data));
}

/**
 * Returns { char, pinyin, wg, strokes, medians, radStrokes } or null when the
 * character has no stroke data available.
 */
export async function getHanzi(rawChar) {
  const char = Array.from(String(rawChar || ''))[0] || '';
  if (!CJK.test(char)) return null;
  if (memory.has(char)) return memory.get(char);

  const disk = await readDisk(char);
  if (disk) {
    if (!disk.wg && disk.pinyin) disk.wg = toWadeGiles(disk.pinyin);
    memory.set(char, disk);
    return disk;
  }

  for (const url of CDNS) {
    try {
      const res = await fetch(url(char), { signal: AbortSignal.timeout(9000) });
      if (!res.ok) continue;
      const json = await res.json();
      if (!Array.isArray(json.strokes) || !Array.isArray(json.medians)) continue;
      const py = pinyinFor(char);
      const data = {
        char,
        pinyin: py,
        wg: toWadeGiles(py),
        strokes: json.strokes,
        medians: json.medians,
        radStrokes: json.radStrokes || [],
      };
      memory.set(char, data);
      writeDisk(char, data).catch(() => {});
      return data;
    } catch {
      // try the next CDN
    }
  }

  memory.set(char, null);
  return null;
}
