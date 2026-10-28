const supported = typeof window !== 'undefined' && 'speechSynthesis' in window;
const CJK = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/;

const FALLBACKS = {
  'zh-CN': ['zh-CN', 'zh-TW', 'zh-HK', 'zh'],
  'en-US': ['en-US', 'en-GB', 'en-AU', 'en'],
  'ms-MY': ['ms-MY', 'ms', 'id-ID', 'en-US'],
};

const VOICE_LANG = { zh: 'zh-CN', en: 'en-US', bm: 'ms-MY' };

let voices = [];
let primed = false;
let voicesReady = null;

function refresh() {
  if (!supported) return;
  try {
    voices = window.speechSynthesis.getVoices() || [];
  } catch {
    voices = [];
  }
}

if (supported) {
  refresh();
  try {
    window.speechSynthesis.addEventListener('voiceschanged', refresh);
  } catch {
    /* older Safari */
  }
}

/** Wait briefly for the voice list; Safari populates it asynchronously. */
function whenVoices(timeout = 700) {
  if (!supported) return Promise.resolve();
  if (voices.length) return Promise.resolve();
  if (voicesReady) return voicesReady;
  refresh();
  if (voices.length) return Promise.resolve();

  voicesReady = new Promise((resolve) => {
    let settled = false;
    const onChanged = () => {
      if (voices.length) finish();
    };
    const finish = () => {
      if (settled) return;
      settled = true;
      refresh();
      try {
        window.speechSynthesis.removeEventListener('voiceschanged', onChanged);
      } catch {
        /* ignore */
      }
      resolve();
    };
    try {
      window.speechSynthesis.addEventListener('voiceschanged', onChanged);
    } catch {
      /* ignore */
    }
    setTimeout(finish, timeout);
  }).finally(() => {
    voicesReady = null;
  });
  return voicesReady;
}

const normalise = (s) => String(s || '').replace('_', '-').toLowerCase();

function pickVoice(lang) {
  if (!supported) return null;
  if (!voices.length) refresh();
  for (const code of FALLBACKS[lang] || [lang]) {
    const wanted = normalise(code);
    const exact = voices.find((v) => normalise(v.lang) === wanted);
    if (exact) return exact;
    const base = wanted.split('-')[0];
    const loose = voices.find((v) => normalise(v.lang).split('-')[0] === base);
    if (loose) return loose;
  }
  return null;
}

export function voiceLang(lang) {
  return VOICE_LANG[lang] || 'en-US';
}

export function speechSupported() {
  return supported;
}

/** True when the device actually has a Chinese voice installed. */
export function chineseVoiceAvailable() {
  if (!supported) return false;
  refresh();
  return voices.some((voice) => /^zh/i.test(normalise(voice.lang)));
}

export function setSpeechEnabled(on) {
  if (!on) stopSpeech();
}

export function stopSpeech() {
  if (!supported) return;
  try {
    window.speechSynthesis.cancel();
  } catch {
    /* ignore */
  }
}

/**
 * iOS only allows speech after a user gesture, so call this once from the
 * first pointerdown. A silent utterance unlocks the engine.
 */
export function primeSpeech() {
  if (!supported || primed) return;
  primed = true;
  try {
    const utter = new SpeechSynthesisUtterance(' ');
    utter.volume = 0;
    utter.rate = 2;
    window.speechSynthesis.speak(utter);
  } catch {
    /* ignore */
  }
}

function splitByScript(text) {
  const runs = [];
  let buffer = '';
  let current = null;
  for (const ch of String(text)) {
    const kind = CJK.test(ch) ? 'zh' : /[A-Za-z0-9]/.test(ch) ? 'latin' : current || 'latin';
    if (current && kind !== current) {
      runs.push({ text: buffer, zh: current === 'zh' });
      buffer = '';
    }
    current = kind;
    buffer += ch;
  }
  if (buffer) runs.push({ text: buffer, zh: current === 'zh' });
  return runs;
}

const withoutTones = (text) =>
  String(text || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ü/g, 'u')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * Speak a word or a mixed sentence.
 * `fallback` is the Hanyu Pinyin used when the device has no Chinese voice —
 * iOS otherwise reads a CJK character as "Chinese letter".
 */
export async function speak(text, lang = 'en-US', fallback = '') {
  if (!supported) return;
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  if (!clean) return;

  await whenVoices();

  const latinLang = FALLBACKS[lang] ? lang : VOICE_LANG[lang] || 'en-US';
  const chineseVoice = pickVoice('zh-CN');
  const allChinese = !/[A-Za-z]/.test(clean);
  const pinyin = withoutTones(fallback);

  stopSpeech();
  for (const run of splitByScript(clean)) {
    let runLang = run.zh ? 'zh-CN' : latinLang;
    let spoken = run.text.trim();
    let voice = run.zh ? chineseVoice : pickVoice(runLang);

    if (run.zh && !voice) {
      if (!allChinese || !pinyin) continue; // never say "Chinese letter"
      spoken = pinyin;
      runLang = 'en-US';
      voice = pickVoice('en-US');
    }
    if (!spoken) continue;

    const utter = new SpeechSynthesisUtterance(spoken);
    utter.lang = runLang;
    if (voice) utter.voice = voice;
    utter.rate = 0.82;
    utter.pitch = 1.02;
    utter.volume = 1;
    try {
      window.speechSynthesis.speak(utter);
    } catch {
      /* ignore */
    }
  }
}
