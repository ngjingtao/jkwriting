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

function pickVoice(lang) {
  if (!supported) return null;
  if (!voices.length) refresh();
  const norm = (s) => String(s || '').replace('_', '-').toLowerCase();
  for (const code of FALLBACKS[lang] || [lang]) {
    const wanted = norm(code);
    const exact = voices.find((v) => norm(v.lang) === wanted);
    if (exact) return exact;
    const base = wanted.split('-')[0];
    const loose = voices.find((v) => norm(v.lang).split('-')[0] === base);
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

/** Speak a word or a mixed sentence. Chinese runs use a Mandarin voice. */
export function speak(text, lang = 'en-US') {
  if (!supported) return;
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  if (!clean) return;
  stopSpeech();
  const latinVoice = FALLBACKS[lang] ? lang : VOICE_LANG[lang] || 'en-US';
  for (const run of splitByScript(clean)) {
    const runLang = run.zh ? 'zh-CN' : latinVoice;
    const utter = new SpeechSynthesisUtterance(run.text.trim());
    utter.lang = runLang;
    const voice = pickVoice(runLang);
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
