import { fetchConfig } from './api.js';
import { Practice } from './practice.js';
import { isMixed } from './units.js';
import { h, icon, openSheet, switchRow, segmented, clear } from './ui.js';
import { getSettings, getHomeLang, setHomeLang, setOverride, clearOverrides } from './settings.js';
import { makeT } from './i18n.js';
import { stats } from './history.js';
import { setSound } from './sound.js';
import { setSpeechEnabled } from './speech.js';

const app = document.getElementById('app');
const state = { config: null, lang: getHomeLang(), practice: null };

const CJK = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/;

async function boot() {
  try {
    state.config = await fetchConfig();
  } catch {
    app.append(
      h(
        'div',
        { class: 'error-screen' },
        h('div', { class: 'err-emoji' }, '📡'),
        h('h2', {}, 'Cannot reach the server'),
        h('button', { class: 'btn primary', onclick: () => location.reload() }, 'Retry'),
      ),
    );
    return;
  }
  const settings = getSettings(state.config);
  setSound(settings.sound);
  setSpeechEnabled(settings.speakOnComplete !== false);
  renderHome();
  registerServiceWorker();
}

function homeTabs(t) {
  return [
    { id: 'zh', label: '中文', glyph: '字' },
    { id: 'en', label: 'English', glyph: 'Aa' },
    { id: 'bm', label: 'Bahasa Melayu', glyph: 'BM' },
    { id: 'passage', label: t('lang.passage'), glyph: '¶' },
  ];
}

function setsForTab(config) {
  return config.sets.filter((set) => {
    if (!set.enabled) return false;
    if (state.lang === 'passage') return set.kind === 'passage';
    if (state.lang === 'zh') return set.kind === 'chinese';
    return set.kind === 'latin' && set.lang === state.lang;
  });
}

function renderHome() {
  if (state.practice) {
    state.practice.destroy();
    state.practice = null;
  }
  const cfg = state.config;
  const settings = getSettings(cfg);
  const t = makeT(settings.uiLang);
  const st = stats();
  const sets = setsForTab(cfg);
  document.title = cfg.app.title;

  clear(app);
  const langTabs = h('div', { class: 'langs', role: 'tablist' });
  for (const tab of homeTabs(t)) {
    langTabs.append(
      h(
        'button',
        {
          class: 'lang-btn',
          role: 'tab',
          'aria-selected': String(tab.id === state.lang),
          title: tab.id === 'bm' ? 'Bahasa Melayu' : tab.label,
          onclick: () => {
            state.lang = tab.id;
            setHomeLang(tab.id);
            renderHome();
          },
        },
        h('span', { class: 'glyph' }, tab.glyph),
        tab.label,
      ),
    );
  }

  const grid = h('div', { class: 'set-grid' });
  if (!sets.length) {
    grid.append(h('div', { class: 'empty', style: { gridColumn: '1 / -1' } }, t('home.empty')));
  }
  for (const set of sets) {
    const isPassage = set.kind === 'passage';
    const sample = isPassage
      ? `${set.items[0].text.slice(0, 56)}${set.items[0].text.length > 56 ? '…' : ''}`
      : set.items.slice(0, 8).map((i) => i.text).join(' ');
    const meta = [t('home.words', { n: set.items.length })];
    if (set.repeat > 1) meta.push(`×${set.repeat}`);
    grid.append(
      h(
        'button',
        { class: `set-card${isPassage ? ' passage' : ''}`, onclick: () => openSet(set) },
        h('span', { class: 's-go' }, icon('chevron')),
        h(
          'span',
          { class: 's-name' },
          set.name,
          isPassage ? h('span', { class: 's-kind' }, t('lang.passage')) : null,
        ),
        h('span', { class: 's-sample' }, sample),
        h('span', { class: 's-meta' }, meta.join(' · ')),
      ),
    );
  }

  const input = h('input', {
    type: 'text',
    placeholder: t('home.placeholder'),
    'aria-label': t('home.free'),
    autocapitalize: 'off',
    autocomplete: 'off',
    spellcheck: 'false',
  });
  const startFree = () => {
    const text = input.value.trim();
    if (!text) {
      input.focus();
      return;
    }
    const kind = isMixed(text) ? 'passage' : CJK.test(text) ? 'chinese' : 'latin';
    const lang =
      kind === 'chinese'
        ? 'zh'
        : kind === 'passage'
          ? state.lang === 'bm'
            ? 'bm'
            : 'en'
          : state.lang === 'bm'
            ? 'bm'
            : 'en';
    startPractice({ text }, null, 0, lang, kind);
  };
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') startFree();
  });

  const home = h(
    'div',
    { class: 'home' },
    h(
      'header',
      { class: 'home-head' },
      h(
        'div',
        { class: 'brand' },
        h('div', { class: 'brand-mark' }, '写'),
        h('div', {}, h('h1', {}, cfg.app.title), h('p', {}, t('app.tagline'))),
      ),
      h(
        'div',
        { style: { display: 'flex', gap: '8px', alignItems: 'center' } },
        h(
          'button',
          { class: 'icon-btn', 'aria-label': t('settings.title'), onclick: () => openSettings(settings) },
          icon('settings'),
        ),
        h('a', { class: 'ghost-link', href: '/admin' }, icon('lock'), t('home.parent')),
      ),
    ),
    h('section', {}, h('div', { class: 'section-label' }, t('home.choose')), langTabs),
    h('section', {}, h('div', { class: 'section-label' }, t('home.sets')), grid),
    h(
      'section',
      {},
      h('div', { class: 'section-label' }, t('home.free')),
      h('div', { class: 'free-row' }, input, h('button', { class: 'btn primary', onclick: startFree }, t('home.start'))),
    ),
    h(
      'div',
      { class: 'stats' },
      h('div', { class: 'stat' }, h('b', {}, String(st.todayStars)), h('span', {}, t('home.today'))),
      h('div', { class: 'stat' }, h('b', {}, String(st.total)), h('span', {}, t('home.total'))),
    ),
  );

  app.append(home);
}

function openSet(set) {
  const settings = getSettings(state.config);
  const t = makeT(settings.uiLang);
  const grid = h('div', { class: `word-grid${set.kind === 'passage' ? ' passages' : ''}` });
  const sheet = { close: () => {} };

  for (const [index, item] of set.items.entries()) {
    grid.append(
      h(
        'button',
        {
          class: `word-chip${set.kind === 'passage' ? ' passage' : ''}`,
          onclick: () => {
            sheet.close();
            startPractice(item, set, index, set.lang, set.kind);
          },
        },
        h('span', { class: 'wc-text' }, item.text),
        item.meaning ? h('span', { class: 'wc-mean' }, item.meaning) : null,
      ),
    );
  }

  const body = h(
    'div',
    {},
    h(
      'button',
      {
        class: 'btn soft block',
        style: { marginBottom: '14px' },
        onclick: () => {
          const index = Math.floor(Math.random() * set.items.length);
          sheet.close();
          startPractice(set.items[index], set, index, set.lang, set.kind);
        },
      },
      icon('sparkle'),
      t('home.random'),
    ),
    grid,
  );

  const opened = openSheet({
    title: set.name,
    sub: `${t('home.words', { n: set.items.length })}${set.repeat > 1 ? ` · ×${set.repeat}` : ''}`,
    body,
  });
  sheet.close = opened.close;
}

function startPractice(item, set, index, lang, kind) {
  const settings = getSettings(state.config);
  if (state.practice) state.practice.destroy();
  clear(app);

  const resolvedKind = kind || set?.kind || (lang === 'zh' ? 'chinese' : 'latin');
  const practice = new Practice({
    config: state.config,
    settings,
    item,
    set,
    lang,
    kind: resolvedKind,
    setName: set?.name || '',
    onExit: () => {
      practice.destroy();
      state.practice = null;
      renderHome();
    },
    onNext: set
      ? () => {
          const nextIndex = (index + 1) % set.items.length;
          practice.destroy();
          state.practice = null;
          startPractice(set.items[nextIndex], set, nextIndex, set.lang, set.kind);
        }
      : null,
  });
  state.practice = practice;
  practice.mount();
}

function openSettings(settings) {
  const t = makeT(settings.uiLang);
  const body = h('div', {});
  let sheet = null;
  const langSeg = segmented(
    [
      { id: 'en', label: 'English' },
      { id: 'zh', label: '中文' },
      { id: 'ms', label: 'BM' },
    ],
    settings.uiLang,
    (lang) => {
      setOverride('uiLang', lang);
      sheet?.close();
      renderHome();
    },
  );
  body.append(
    h('div', { class: 'row' }, h('div', { class: 'label' }, t('settings.lang')), langSeg),
    switchRow(t('settings.sound'), t('settings.soundDesc'), settings.sound, (on) => {
      setOverride('sound', on);
      setSound(on);
    }),
    switchRow(t('settings.speak'), t('settings.speakDesc'), settings.speakOnComplete !== false, (on) => {
      setOverride('speakOnComplete', on);
      setSpeechEnabled(on);
    }),
    switchRow(t('settings.penOnly'), t('settings.penOnlyDesc'), settings.penOnly, (on) => {
      setOverride('penOnly', on);
    }),
    h(
      'div',
      { style: { display: 'flex', gap: '10px', marginTop: '16px' } },
      h(
        'button',
        {
          class: 'btn ghost',
          style: { flex: '1' },
          onclick: () => {
            clearOverrides();
            location.reload();
          },
        },
        t('settings.reset'),
      ),
      h(
        'button',
        {
          class: 'btn primary',
          style: { flex: '1' },
          onclick: () => sheet?.close(),
        },
        t('settings.done'),
      ),
    ),
  );
  sheet = openSheet({ title: t('settings.title'), sub: t('settings.sub'), body });
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') return;
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}

boot();
