// Hanyu Pinyin → Wade-Giles (威氏拼音) conversion.
// Tones are written as superscript numbers 1–4; neutral tone has no number.

const TONE_MARKS = {
  ā: ['a', 1], á: ['a', 2], ǎ: ['a', 3], à: ['a', 4],
  ē: ['e', 1], é: ['e', 2], ě: ['e', 3], è: ['e', 4],
  ī: ['i', 1], í: ['i', 2], ǐ: ['i', 3], ì: ['i', 4],
  ō: ['o', 1], ó: ['o', 2], ǒ: ['o', 3], ò: ['o', 4],
  ū: ['u', 1], ú: ['u', 2], ǔ: ['u', 3], ù: ['u', 4],
  ǖ: ['ü', 1], ǘ: ['ü', 2], ǚ: ['ü', 3], ǜ: ['ü', 4],
  ń: ['n', 2], ň: ['n', 3], ǹ: ['n', 4],
  ḿ: ['m', 2], m̀: ['m', 4],
  ế: ['ê', 2], ề: ['ê', 4], ê̄: ['ê', 1], ễ: ['ê', 3],
};

const INITIALS = [
  'zh', 'ch', 'sh',
  'b', 'p', 'm', 'f', 'd', 't', 'n', 'l',
  'g', 'k', 'h', 'j', 'q', 'x', 'r', 'z', 'c', 's',
];

const INITIAL_MAP = {
  b: 'p', p: "p'", m: 'm', f: 'f',
  d: 't', t: "t'", n: 'n', l: 'l',
  g: 'k', k: "k'", h: 'h',
  j: 'ch', q: "ch'", x: 'hs',
  zh: 'ch', ch: "ch'", sh: 'sh', r: 'j',
  z: 'ts', c: "ts'", s: 's',
};

// Syllables whose pinyin spelling does not follow initial + final.
const WHOLE = {
  er: 'erh',
  yi: 'i', ya: 'ya', ye: 'yeh', yao: 'yao', you: 'yu', yan: 'yen', yin: 'yin',
  yang: 'yang', ying: 'ying', yong: 'yung', yo: 'yo',
  yu: 'yü', yue: 'yüeh', yuan: 'yüan', yun: 'yün',
  wu: 'wu', wa: 'wa', wo: 'wo', wai: 'wai', wei: 'wei', wan: 'wan',
  wen: 'wen', wang: 'wang', weng: 'weng',
  n: 'n', ng: 'ng', hm: 'hm', hng: 'hng',
};

const FINALS = {
  a: 'a', o: 'o', e: 'e', ê: 'ê',
  ai: 'ai', ei: 'ei', ao: 'ao', ou: 'ou',
  an: 'an', en: 'en', ang: 'ang', eng: 'eng',
  i: 'i', ia: 'ia', ie: 'ieh', iao: 'iao', iu: 'iu',
  ian: 'ien', in: 'in', iang: 'iang', ing: 'ing', iong: 'iung',
  u: 'u', ua: 'ua', uo: 'uo', uai: 'uai', ui: 'ui',
  uan: 'uan', un: 'un', uang: 'uang', ong: 'ung',
  ü: 'ü', üe: 'üeh', üan: 'üan', ün: 'ün',
};

const SUPERSCRIPT = ['', '¹', '²', '³', '⁴'];

function stripTones(input) {
  let base = '';
  let tone = 0;
  for (const ch of String(input || '').trim()) {
    if (TONE_MARKS[ch]) {
      base += TONE_MARKS[ch][0];
      tone = TONE_MARKS[ch][1];
    } else {
      base += ch;
    }
  }
  return { base: base.replace(/v/g, 'ü'), tone };
}

function toWadeSyllable(base) {
  if (!base) return '';
  if (WHOLE[base]) return WHOLE[base];

  const initial = INITIALS.find((i) => base.startsWith(i) && base.length > i.length) || '';
  let final = base.slice(initial.length);

  if (final === 'i') {
    if (initial === 'zh' || initial === 'ch' || initial === 'sh' || initial === 'r') return `${INITIAL_MAP[initial]}ih`;
    if (initial === 'z') return 'tzŭ';
    if (initial === 'c') return "tz'ŭ";
    if (initial === 's') return 'ssŭ';
  }

  if ((initial === 'j' || initial === 'q' || initial === 'x') && final.startsWith('u')) {
    final = `ü${final.slice(1)}`;
  }

  const mapped = FINALS[final];
  if (!mapped) return base;
  return `${INITIAL_MAP[initial] || ''}${mapped}`;
}

/** Convert one pinyin syllable (e.g. "nǐ") to Wade-Giles ("ni³"). */
export function toWadeGiles(pinyin) {
  if (!pinyin) return '';
  return String(pinyin)
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((syllable) => {
      const { base, tone } = stripTones(syllable);
      const wade = toWadeSyllable(base.toLowerCase());
      return `${wade}${SUPERSCRIPT[tone] || ''}`;
    })
    .join(' ');
}

/** Convert a whole phrase made of space-separated pinyin syllables. */
export function phraseToWadeGiles(pinyin) {
  return toWadeGiles(pinyin);
}
