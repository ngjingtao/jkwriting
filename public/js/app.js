import { fetchConfig } from './api.js';
import { Practice } from './practice.js';
import { h, icon, openSheet, switchRow, segmented, toast, clear } from './ui.js';
import { getSettings, getHomeLang, setHomeLang, setOverride, clearOverrides } from './settings.js';
import { makeT, LANGS } from './i18n.js';
import { stats } from './history.js';
import { setSound } from './sound.js';

const app = document.getElementById('app');
const state = { config: null, lang: getHomeLang(), practice: null };

const CJK = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/;
const detectLang = (text) => (CJK.test(text) ? 'zh' : 'en');

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
  setSound(getSettings(state.config).sound);
  renderHome();
  registerServiceWorker();
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
  const sets = cfg.sets.filter((s) => s.enabled && s.lang === state.lang);
  document.title = cfg.app.title;

  clear(app);
  const langTabs = h('div', { class: 'langs', role: 'tablist' });
  for (const lang of LANGS) {
    langTabs.append(
      h(
        'button',
        {
          class: 'lang-btn',
          role: 'tab',
          'aria-selected': String(lang.id === state.lang),
          onclick: () => {
            state.lang = lang.id;
            setHomeLang(lang.id);
            renderHome();
          },
        },
        h('span', { class: 'glyph' }, lang.glyph),
        lang.label,
      ),
    );
  }

  const grid = h('div', { class: 'set-grid' });
  if (!sets.length) {
    grid.append(h('div', { class: 'empty', style: { gridColumn: '1 / -1' } }, t('home.empty')));
  }
  for (const set of sets) {
    const sample = set.items.slice(0, 8).map((i) => i.text).join(' ');
    grid.append(
      h(
        'button',
        { class: 'set-card', onclick: () => openSet(set) },
        h('span', { class: 's-go' }, icon('chevron')),
        h('span', { class: 's-name' }, set.name),
        h('span', { class: 's-sample' }, sample),
        h('span', { class: 's-meta' }, t('home.words', { n: set.items.length })),
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
    startPractice({ text }, null, 0, detectLang(text));
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
    h(
      'section',
      {},
      h('div', { class: 'section-label' }, t('home.sets')),
      grid,
    ),
    h('section', {}, h('div', { class: 'section-label' }, t('home.free')), h('div', { class: 'free-row' }, input, h('button', { class: 'btn primary', onclick: startFree }, t('home.start')))),
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
  const grid = h('div', { class: 'word-grid' });
  const sheet = { close: () => {} };

  for (const [index, item] of set.items.entries()) {
    grid.append(
      h(
        'button',
        {
          class: 'word-chip',
          onclick: () => {
            sheet.close();
            startPractice(item, set, index, set.lang);
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
          startPractice(set.items[index], set, index, set.lang);
        },
      },
      icon('sparkle'),
      t('home.random'),
    ),
    grid,
  );

  const opened = openSheet({ title: set.name, sub: t('home.words', { n: set.items.length }), body });
  sheet.close = opened.close;
}

function startPractice(item, set, index, lang) {
  const settings = getSettings(state.config);
  if (state.practice) state.practice.destroy();
  clear(app);

  const practice = new Practice({
    config: state.config,
    settings,
    item,
    set,
    lang,
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
          startPractice(set.items[nextIndex], set, nextIndex, set.lang);
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
    LANGS.map((l) => ({ id: l.id, label: l.label })),
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
