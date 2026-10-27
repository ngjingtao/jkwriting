import { latinStrokes } from './glyphs.js';
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
      pinyin: (item.pinyin || pinyinParts.join(' ')).trim(),
      wg: wgParts.join(' ').trim(),
      meaning: item.meaning || '',
    };
  }

  for (const ch of chars) {
    const strokes = latinStrokes(ch);
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

/** Break a mixed passage into practice tokens: Chinese characters and Latin words. */
export function parsePassage(text, latinLang = 'en') {
  const tokens = [];
  for (const sentence of splitSentences(text)) {
    const re = /[\u3400-\u9fff]|[A-Za-z0-9]+(?:['’][A-Za-z0-9]+)*/g;
    let match;
    while ((match = re.exec(sentence))) {
      const value = match[0];
      tokens.push({
        text: value,
        lang: CJK_CHAR.test(value) ? 'zh' : latinLang,
        sentence,
      });
    }
  }
  return tokens;
}

function splitSentences(text) {
  const out = [];
  let buffer = '';
  for (const ch of String(text)) {
    buffer += ch;
    if (/[.!?。！？;；\n]/.test(ch)) {
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
