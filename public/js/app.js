import { fetchConfig } from './api.js';
import { Practice } from './practice.js';
import { setStrokeOverrides } from './fontfit.js';
import { h, icon, openSheet, switchRow, segmented, clear } from './ui.js';
import { getSettings, getHomeLang, setHomeLang, setOverride, clearOverrides } from './settings.js';
import { makeT } from './i18n.js';
import { progressStats } from './history.js';
import { setSound } from './sound.js';
import { setSpeechEnabled } from './speech.js';

const app = document.getElementById('app');
const state = { config: null, lang: getHomeLang(), practice: null };

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
  setStrokeOverrides(state.config.strokes || {});
  setSound(settings.sound);
  setSpeechEnabled(settings.speakOnComplete !== false);
  renderHome();
  registerServiceWorker();
}

function homeTabs(t) {
  return [
    { id: 'zh', label: '中文', glyph: '字' },
    { id: 'en', label: 'English', glyph: 'Aa' },
    { id: 'bm', label: 'BM', glyph: '' },
    { id: 'passage', label: t('lang.passage'), glyph: '¶' },
    { id: 'progress', label: t('progress.title'), glyph: '★' },
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
  const isProgress = state.lang === 'progress';
  const sets = isProgress ? [] : setsForTab(cfg);
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
        h('span', { class: 'glyph' }, tab.glyph || ''),
        tab.label,
      ),
    );
  }

  let content;
  if (isProgress) {
    content = progressView(t);
  } else {
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
    content = h('section', {}, h('div', { class: 'section-label' }, t('home.sets')), grid);
  }

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
    h(
      'section',
      {},
      h('div', { class: 'section-label' }, isProgress ? t('progress.title') : t('home.choose')),
      langTabs,
    ),
    content,
  );

  app.append(home);
}

function statCard(iconName, value, label, tone) {
  return h(
    'div',
    { class: `stat-card ${tone}` },
    h('div', { class: 'stat-glyph' }, icon(iconName)),
    h('div', { class: 'stat-value' }, String(value)),
    h('div', { class: 'stat-label' }, label),
  );
}

function progressView(t) {
  const p = progressStats(7);
  const wrap = h('div', { class: 'progress' });

  wrap.append(
    h(
      'div',
      { class: 'stat-hero' },
      statCard('star', p.todayStars, t('progress.starsToday'), 'amber'),
      statCard('pencil', p.total, t('progress.words'), 'indigo'),
      statCard('sparkle', p.streak, t('progress.streak'), 'green'),
    ),
  );

  const max = Math.max(1, ...p.days.map((d) => d.stars));
  const chart = h('div', { class: 'chart', role: 'img', 'aria-label': t('progress.week') });
  for (const day of p.days) {
    chart.append(
      h(
        'div',
        { class: `chart-col${day.today ? ' today' : ''}` },
        h('div', { class: 'chart-value' }, day.stars ? String(day.stars) : ''),
        h(
          'div',
          { class: 'chart-track' },
          h('div', {
            class: 'chart-bar',
            style: { height: day.stars ? `${Math.max(10, Math.round((day.stars / max) * 100))}%` : '0%' },
          }),
        ),
        h('div', { class: 'chart-label' }, day.today ? t('progress.today') : day.label),
      ),
    );
  }
  wrap.append(
    h('div', { class: 'panel-card' }, h('h3', {}, t('progress.week')), chart),
  );

  if (p.recent.length) {
    const list = h('div', { class: 'recent' });
    for (const entry of p.recent) {
      list.append(
        h(
          'div',
          { class: 'recent-row' },
          h('span', { class: 'recent-word' }, entry.text),
          h('span', { class: 'recent-stars' }, '★'.repeat(entry.stars || 0)),
          h(
            'span',
            { class: 'recent-date' },
            new Date(entry.ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
          ),
        ),
      );
    }
    wrap.append(h('div', { class: 'panel-card' }, h('h3', {}, t('progress.recent')), list));
  } else {
    wrap.append(h('div', { class: 'empty' }, t('progress.empty')));
  }

  return wrap;
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
