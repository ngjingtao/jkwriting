import { fittedLatinStrokes, ensureLatinFont } from './fontfit.js';
import { pinyinFromNumbered } from './pinyin.js';
import { fetchHanzi } from './api.js';

const CJK = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/;
const CJK_CHAR = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/;
const isCJK = (ch) => CJK.test(ch);

/** Split text into the individual characters/letters the child will write. */
export function splitUnits(text) {
  return Array.from(String(text || '')).filter((ch) => ch.trim().length > 0);
}

/**
 * Build practice units for one token (a Chinese word, Latin word or phrase).
 * Chinese: one unit per character, with real stroke data from hanzi-writer-data.
 * Latin: one unit per letter, using the built-in single-stroke alphabet.
 */
export async function buildUnits(item, lang) {
  const chars = Array.from(String(item.text || ''));
  if (!chars.length) throw new Error('empty');

  const units = [];
  const header = [];

  if (item.kind === 'cizu') return buildCizu(item, chars);

  if (lang === 'zh') {
    const pinyinParts = [];
    const wgParts = [];
    let missing = null;

    for (const ch of chars) {
      if (!isCJK(ch)) {
        header.push({ ch, unitIndex: -1 });
        continue;
      }
      let data;
      try {
        data = await fetchHanzi(ch);
      } catch (err) {
        if (err.message === 'no_data') {
          missing = ch;
          continue;
        }
        throw err;
      }
      if (!data) {
        missing = ch;
        continue;
      }
      header.push({ ch, unitIndex: units.length });
      units.push({
        char: ch,
        script: 'hanzi',
        pinyin: data.pinyin || '',
        wg: data.wg || '',
        strokes: data.strokes.map((path, i) => ({
          svgPath: path,
          median: data.medians[i].map(([x, y]) => [x / 1024, (900 - y) / 1024]),
        })),
      });
      pinyinParts.push(item.pinyin || data.pinyin || '');
      wgParts.push(data.wg || '');
    }

    if (missing) throw Object.assign(new Error('no_data'), { char: missing });
    if (!units.length) throw new Error('empty');

    return {
      units,
      header,
      pinyin: pinyinFromNumbered(item.pinyin || '').trim() || pinyinParts.join(' ').trim(),
      wg: wgParts.join(' ').trim(),
      meaning: item.meaning || '',
    };
  }

  await ensureLatinFont();
  for (const ch of chars) {
    const strokes = fittedLatinStrokes(ch);
    if (!strokes) {
      header.push({ ch, unitIndex: -1 });
      continue;
    }
    header.push({ ch, unitIndex: units.length });
    units.push({
      char: ch,
      script: 'latin',
      pinyin: '',
      wg: '',
      strokes: strokes.map((median) => ({ median, svgPath: null })),
    });
  }
  if (!units.length) throw new Error('empty');
  return { units, header, pinyin: '', wg: '', meaning: item.meaning || '' };
}

/**
 * 词组 (ci zu): 2–3 characters written together on one screen.
 * Each character gets its own square cell; the strokes of all cells become one
 * flat list, so the child writes them in order and every stroke is scored.
 */
async function buildCizu(item, chars) {
  const cellsChars = chars.slice(0, 3);
  if (!cellsChars.length) throw new Error('empty');
  const n = cellsChars.length;
  const cell = 1 / n;
  const y0 = (1 - cell) / 2;
  const strokes = [];
  const header = [];
  const pinyinParts = [];
  const wgParts = [];
  let missing = null;

  for (let i = 0; i < n; i += 1) {
    const ch = cellsChars[i];
    if (!isCJK(ch)) {
      missing = ch;
      continue;
    }
    let data;
    try {
      data = await fetchHanzi(ch);
    } catch (err) {
      if (err.message === 'no_data') {
        missing = ch;
        continue;
      }
      throw err;
    }
    if (!data) {
      missing = ch;
      continue;
    }
    header.push({ ch, unitIndex: 0 });
    pinyinParts.push(data.pinyin || '');
    wgParts.push(data.wg || '');
    const box = { x: i * cell, y: y0, w: cell };
    data.medians.forEach((median, si) => {
      strokes.push({
        median: median.map(([x, y]) => [box.x + (x / 1024) * cell, box.y + ((900 - y) / 1024) * cell]),
        svgPath: data.strokes[si],
        cell: box,
      });
    });
  }

  if (missing) throw Object.assign(new Error('no_data'), { char: missing });
  if (!strokes.length) throw new Error('empty');

  return {
    units: [{ char: cellsChars.join(''), script: 'hanzi', composite: n, strokes }],
    header,
    pinyin: pinyinFromNumbered(item.pinyin || '').trim() || pinyinParts.join(' ').trim(),
    wg: wgParts.join(' ').trim(),
    meaning: item.meaning || '',
  };
}

/** Break a mixed passage into practice tokens: Chinese characters and Latin words. */
/**
 * Pull `星期天 (xing1 qi1 tian1)` annotations out of a passage.
 * One syllable per character; annotations that do not match are dropped.
 */
export function extractPassagePinyin(text) {
  const pinyin = new Map();
  const clean = String(text).replace(
    /([\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]+)\s*\(([^()]+)\)/g,
    (whole, chars, raw) => {
      const syllables = pinyinFromNumbered(raw.trim()).split(/\s+/).filter(Boolean);
      const list = Array.from(chars);
      if (syllables.length === list.length) {
        list.forEach((ch, i) => {
          if (!pinyin.has(ch)) pinyin.set(ch, syllables[i]);
        });
      }
      return chars;
    },
  );
  return { text: clean, pinyin };
}

export function parsePassage(text, latinLang = 'en') {
  const { text: clean, pinyin } = extractPassagePinyin(text);
  const tokens = [];
  for (const sentence of splitSentences(clean)) {
    const re = /[\u3400-\u9fff]|[A-Za-z0-9]+(?:['’][A-Za-z0-9]+)*/g;
    let match;
    while ((match = re.exec(sentence))) {
      const value = match[0];
      const isHan = CJK_CHAR.test(value);
      tokens.push({
        text: value,
        lang: isHan ? 'zh' : latinLang,
        sentence,
        pinyin: isHan ? pinyin.get(value) || '' : '',
      });
    }
  }
  return tokens;
}

function splitSentences(text) {
  const out = [];
  let buffer = '';
  // Line breaks are ordinary whitespace: a passage keeps its context across
  // wrapped lines and only punctuation starts a new sentence.
  for (const ch of String(text).replace(/\s+/g, ' ')) {
    buffer += ch;
    if (/[.!?。！？;；]/.test(ch)) {
      if (buffer.trim()) out.push(buffer.trim());
      buffer = '';
    }
  }
  if (buffer.trim()) out.push(buffer.trim());
  return out;
}

/** True when a phrase contains both Chinese characters and Latin letters. */
export function isMixed(text) {
  const s = String(text || '');
  return CJK.test(s) && /[A-Za-z]/.test(s);
}
