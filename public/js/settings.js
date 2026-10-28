const OVERRIDES_KEY = 'wf.overrides.v1';
const LANG_KEY = 'wf.lang.v1';
const ALLOWED = new Set(['mode', 'sound', 'penOnly', 'showNumbers', 'uiLang', 'speakOnComplete']);

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* private mode */
  }
}

export function loadOverrides() {
  const raw = read(OVERRIDES_KEY, {});
  const out = {};
  for (const [k, v] of Object.entries(raw || {})) if (ALLOWED.has(k)) out[k] = v;
  return out;
}

export function setOverride(key, value) {
  if (!ALLOWED.has(key)) return;
  const next = { ...loadOverrides(), [key]: value };
  write(OVERRIDES_KEY, next);
}

export function clearOverrides() {
  try {
    localStorage.removeItem(OVERRIDES_KEY);
  } catch {
    /* ignore */
  }
}

/** Merge server config with this device's preferences. */
export function getSettings(config) {
  const o = loadOverrides();
  return {
    mode: config.practice.mode,
    allowedModes: config.practice.allowedModes,
    gridHanzi: config.practice.gridHanzi,
    gridLatin: config.practice.gridLatin,
    guideOpacity: config.practice.guideOpacity,
    inkWidth: config.practice.inkWidth,
    inkColor: config.practice.inkColor,
    boxScale: config.practice.boxScale,
    showPinyin: config.practice.showPinyin,
    showWadeGiles: config.practice.showWadeGiles,
    showMeaning: config.practice.showMeaning,
    showNumbers: config.practice.showNumbers,
    autoNext: config.practice.autoNext,
    sound: config.practice.sound,
    speakOnComplete: config.practice.speakOnComplete,
    penOnly: config.practice.penOnly,
    uiLang: config.app.uiLang,
    tolerance: config.scoring.tolerance,
    threshold: config.scoring.threshold,
    showTips: config.scoring.showTips,
    ...o,
  };
}

export function getHomeLang() {
  const stored = read(LANG_KEY, 'zh');
  return ['zh', 'en', 'bm', 'passage', 'progress'].includes(stored) ? stored : 'zh';
}

export function setHomeLang(lang) {
  write(LANG_KEY, lang);
}
