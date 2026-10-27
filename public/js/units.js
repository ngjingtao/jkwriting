import { latinStrokes } from './glyphs.js';
import { fetchHanzi } from './api.js';

const CJK = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/;
const isCJK = (ch) => CJK.test(ch);

/** Split text into the individual characters/letters the child will write. */
export function splitUnits(text) {
  return Array.from(String(text || '')).filter((ch) => ch.trim().length > 0);
}

/**
 * Build practice units for a word.
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
        strokes: data.strokes.map((path, i) => ({
          svgPath: path,
          median: data.medians[i].map(([x, y]) => [x / 1024, (900 - y) / 1024]),
        })),
      });
      pinyinParts.push(item.pinyin || data.pinyin || '');
    }

    if (missing) throw Object.assign(new Error('no_data'), { char: missing });
    if (!units.length) throw new Error('empty');

    return {
      units,
      header,
      pinyin: (item.pinyin || pinyinParts.join(' ')).trim(),
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
      strokes: strokes.map((median) => ({ median, svgPath: null })),
    });
  }
  if (!units.length) throw new Error('empty');
  return { units, header, pinyin: '', meaning: item.meaning || '' };
}
