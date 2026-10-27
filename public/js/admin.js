import { h, icon, toast, clear } from './ui.js';

const root = document.getElementById('admin');
const state = {
  config: null,
  admin: false,
  tab: 'sets',
  selectedId: null,
  dirty: false,
  gist: false,
  defaultPin: false,
};
let saveBar = null;

const LANGS = [
  { id: 'zh', label: '中文 Chinese' },
  { id: 'en', label: 'English' },
  { id: 'bm', label: 'Bahasa Melayu' },
];

const TOLERANCES = [
  { id: 'lenient', label: 'Gentle' },
  { id: 'normal', label: 'Normal' },
  { id: 'strict', label: 'Strict' },
];

const MODES = [
  { id: 'trace', label: 'Trace' },
  { id: 'copy', label: 'Copy' },
  { id: 'memory', label: 'Memory' },
];

/* --------------------------------- helpers -------------------------------- */

function markDirty() {
  state.dirty = true;
  if (!saveBar) return;
  saveBar.classList.add('show');
  saveBar.querySelector('.status').textContent = 'Unsaved changes';
}

let fieldSeq = 0;

function field(labelText, control, hint) {
  const id = control.id || `field-${(fieldSeq += 1)}`;
  control.id = id;
  return h(
    'div',
    { class: 'field' },
    h('label', { for: id }, labelText),
    control,
    hint ? h('div', { class: 'hint' }, hint) : null,
  );
}

function switchRow(label, desc, checked, onChange) {
  const sw = h('button', {
    class: 'switch',
    role: 'switch',
    'aria-checked': String(Boolean(checked)),
    onclick: () => {
      const next = sw.getAttribute('aria-checked') !== 'true';
      sw.setAttribute('aria-checked', String(next));
      onChange(next);
    },
  });
  return h(
    'div',
    { class: 'row-inline' },
    h('div', {}, h('div', { class: 'rlabel' }, label), desc ? h('div', { class: 'rdesc' }, desc) : null),
    sw,
  );
}

function segmented(options, value, onChange) {
  const seg = h('div', { class: 'seg' });
  options.forEach((opt, idx) => {
    seg.append(
      h(
        'button',
        {
          'aria-pressed': String(opt.id === value),
          onclick: () => {
            [...seg.children].forEach((b, i) => b.setAttribute('aria-pressed', String(i === idx)));
            onChange(opt.id);
          },
        },
        opt.label,
      ),
    );
  });
  return seg;
}

function sliderField(labelText, desc, value, min, max, step, format, onChange) {
  const out = h('output', {}, format(value));
  const range = h('input', {
    type: 'range',
    min,
    max,
    step,
    value,
    oninput: (e) => {
      const v = Number(e.target.value);
      out.textContent = format(v);
      onChange(v);
    },
  });
  return h(
    'div',
    { class: 'field' },
    h('div', { class: 'flabel' }, labelText),
    h('div', { class: 'slider' }, range, out),
    desc ? h('div', { class: 'hint' }, desc) : null,
  );
}

function langBadge(lang) {
  return h('span', { class: `lang-badge ${lang}` }, lang === 'zh' ? '中文' : lang === 'bm' ? 'BM' : 'EN');
}

/* ---------------------------------- init ---------------------------------- */

async function init() {
  try {
    const [cfg, session] = await Promise.all([
      fetch('/api/config', { cache: 'no-cache' }).then((r) => r.json()),
      fetch('/api/admin/session')
        .then((r) => r.json())
        .catch(() => ({ admin: false })),
    ]);
    state.config = cfg;
    state.admin = Boolean(session.admin);
    state.gist = Boolean(session.gist);
    state.selectedId = cfg.sets?.[0]?.id || null;
    if (state.admin) await loadStatus();
  } catch {
    root.append(h('div', { class: 'empty' }, 'Cannot reach the server. Is it running?'));
    return;
  }
  render();
}

async function loadStatus() {
  try {
    const res = await fetch('/api/admin/status');
    if (!res.ok) return;
    const data = await res.json();
    state.gist = data.gist;
    state.defaultPin = data.defaultPin;
  } catch {
    /* ignore */
  }
}

/* --------------------------------- render --------------------------------- */

function render() {
  clear(root);
  saveBar?.remove();
  saveBar = null;
  if (!state.admin) {
    root.classList.remove('admin');
    root.classList.add('login-wrap');
    root.append(loginView());
    return;
  }
  root.classList.add('admin');
  root.classList.remove('login-wrap');
  root.append(header(), tabsView(), contentView());
  saveBar = h(
    'div',
    { class: `save-bar${state.dirty ? ' show' : ''}` },
    h('span', { class: 'status' }, state.dirty ? 'Unsaved changes' : 'Saved'),
    h('button', { class: 'btn', onclick: save }, 'Save changes'),
  );
  document.body.append(saveBar);
}

function loginView() {
  const input = h('input', {
    class: 'input pin-input',
    type: 'password',
    inputmode: 'numeric',
    autocomplete: 'current-password',
    placeholder: '••••',
    'aria-label': 'PIN',
  });
  const error = h('div', { class: 'login-error' });
  const submit = async (e) => {
    e.preventDefault();
    error.textContent = '';
    const res = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin: input.value }),
    });
    if (!res.ok) {
      error.textContent =
        res.status === 429 ? 'Too many tries — wait a minute.' : 'Wrong PIN. Try again.';
      input.select();
      return;
    }
    const data = await res.json();
    state.admin = true;
    state.gist = Boolean(data.gist);
    await loadStatus();
    render();
  };
  const form = h(
    'form',
    { onsubmit: submit },
    h('div', { class: 'lock' }, icon('lock')),
    h('h1', {}, 'Parent settings'),
    h('p', {}, 'Enter the PIN to edit word lists and practice settings.'),
    input,
    h('div', { class: 'login-error' }, ''),
    h('button', { class: 'btn primary block', type: 'submit', style: { marginTop: '12px' } }, 'Unlock'),
    h(
      'a',
      { class: 'btn ghost block', href: '/', style: { marginTop: '10px', textDecoration: 'none' } },
      'Back to the app',
    ),
  );
  form.querySelector('.login-error').replaceWith(error);
  const card = h('div', { class: 'login-card' }, form);
  return card;
}

function header() {
  return h(
    'header',
    { class: 'admin-head' },
    h(
      'div',
      { class: 'brand' },
      h('div', { class: 'brand-mark' }, '写'),
      h(
        'div',
        {},
        h('h1', {}, 'Writing Fun · Parent'),
        h('p', {}, 'Edit word lists, guide size and how strict the scoring is.'),
      ),
    ),
    h(
      'div',
      { style: { display: 'flex', gap: '8px', flexWrap: 'wrap' } },
      h('a', { class: 'btn ghost sm', href: '/', style: { textDecoration: 'none' } }, 'Open app'),
      h(
        'button',
        {
          class: 'btn ghost sm',
          onclick: async () => {
            await fetch('/api/admin/logout', { method: 'POST' });
            state.admin = false;
            render();
          },
        },
        'Lock',
      ),
    ),
  );
}

const TABS = [
  { id: 'sets', label: 'Word lists' },
  { id: 'practice', label: 'Practice' },
  { id: 'scoring', label: 'Scoring' },
  { id: 'data', label: 'Backup' },
];

function tabsView() {
  const tabs = h('div', { class: 'tabs', role: 'tablist' });
  for (const tab of TABS) {
    tabs.append(
      h(
        'button',
        {
          class: `tab${tab.id === state.tab ? ' active' : ''}`,
          role: 'tab',
          'aria-selected': String(tab.id === state.tab),
          onclick: () => {
            state.tab = tab.id;
            render();
          },
        },
        tab.label,
      ),
    );
  }
  return tabs;
}

function contentView() {
  if (state.tab === 'practice') return practiceTab();
  if (state.tab === 'scoring') return scoringTab();
  if (state.tab === 'data') return dataTab();
  return setsTab();
}

/* ------------------------------- word lists ------------------------------- */

function parseItems(text) {
  const seen = new Set();
  const items = [];
  for (const rawLine of String(text).split('\n')) {
    const line = rawLine.trim();
    if (!line) continue;
    const [text0, meaning] = line.split('|').map((p) => p.trim());
    if (!text0 || seen.has(text0)) continue;
    seen.add(text0);
    items.push(meaning ? { text: text0, meaning } : { text: text0 });
  }
  return items;
}

function itemsToText(set) {
  return set.items.map((i) => (i.meaning ? `${i.text} | ${i.meaning}` : i.text)).join('\n');
}

function setsTab() {
  const sets = state.config.sets || [];
  let current = sets.find((s) => s.id === state.selectedId);
  if (!current) {
    current = sets[0];
    state.selectedId = current?.id || null;
  }

  const list = h('div', { class: 'set-list' });
  for (const set of sets) {
    list.append(
      h(
        'button',
        {
          class: `set-item${set.id === state.selectedId ? ' active' : ''}`,
          onclick: () => {
            state.selectedId = set.id;
            render();
          },
        },
        h('div', { class: 'si-name' }, langBadge(set.lang), set.name, set.enabled ? null : h('span', { class: 'pill' }, 'off')),
        h('div', { class: 'si-meta' }, `${set.items.length} items`),
      ),
    );
  }

  const left = h(
    'div',
    {},
    h(
      'button',
      {
        class: 'btn soft block',
        onclick: () => {
          const set = {
            id: `set-${Date.now().toString(36)}`,
            lang: 'en',
            name: 'New word list',
            enabled: true,
            items: [{ text: 'cat' }],
          };
          state.config.sets.push(set);
          state.selectedId = set.id;
          markDirty();
          render();
          requestAnimationFrame(() => document.querySelector('.field .input')?.focus());
        },
      },
      icon('plus'),
      'Add word list',
    ),
    sets.length ? list : h('div', { class: 'hint', style: { marginTop: '12px' } }, 'No lists yet.'),
  );

  let right;
  if (current) {
    const nameInput = h('input', {
      class: 'input',
      value: current.name,
      maxlength: '40',
      oninput: (e) => {
        current.name = e.target.value;
        markDirty();
      },
    });

    const langSelect = h(
      'select',
      {
        class: 'select',
        onchange: (e) => {
          current.lang = e.target.value;
          markDirty();
          render();
        },
      },
      ...LANGS.map((l) =>
        h('option', { value: l.id, selected: l.id === current.lang }, l.label),
      ),
    );

    const countTag = h('span', { class: 'pill' }, `${current.items.length} items`);
    const textarea = h('textarea', {
      class: 'textarea',
      spellcheck: 'false',
      value: itemsToText(current),
      oninput: (e) => {
        current.items = parseItems(e.target.value);
        countTag.textContent = `${current.items.length} items`;
        markDirty();
      },
    });

    right = h(
      'div',
      {},
      h('div', { class: 'row2' }, field('List name', nameInput), field('Language', langSelect)),
      field(
        'Words',
        h('div', {}, textarea, h('div', { class: 'hint', style: { marginTop: '8px' } }, h('span', {}, 'One word per line. Add a meaning after a pipe: ', h('code', {}, 'cat | 猫 · kucing')), h('div', { style: { marginTop: '6px' } }, countTag))),
        'Chinese: each line is practised character by character. English / BM: each line is practised letter by letter.',
      ),
      switchRow(
        'Show this list in the app',
        'Turn off to hide it without deleting the words.',
        current.enabled,
        (on) => {
          current.enabled = on;
          markDirty();
        },
      ),
      h(
        'div',
        { class: 'actions-row' },
        h(
          'button',
          {
            class: 'btn sm',
            onclick: () => {
              const copy = {
                ...structuredClone(current),
                id: `set-${Date.now().toString(36)}`,
                name: `${current.name} copy`,
              };
              state.config.sets.push(copy);
              state.selectedId = copy.id;
              markDirty();
              render();
            },
          },
          'Duplicate',
        ),
        h(
          'button',
          {
            class: 'btn danger sm',
            onclick: () => {
              if (!confirm(`Delete “${current.name}”?`)) return;
              state.config.sets = state.config.sets.filter((s) => s.id !== current.id);
              state.selectedId = state.config.sets[0]?.id || null;
              markDirty();
              render();
            },
          },
          'Delete list',
        ),
      ),
    );
  } else {
    right = h('div', { class: 'empty' }, 'Create a word list to start.');
  }

  return h('div', { class: 'panel' }, h('div', { class: 'split' }, left, right));
}

/* -------------------------------- practice -------------------------------- */

function practiceTab() {
  const p = state.config.practice;
  const app = state.config.app;
  const panel = h('div', { class: 'panel' });

  panel.append(
    field(
      'App title',
      h('input', {
        class: 'input',
        value: app.title,
        maxlength: '40',
        oninput: (e) => {
          app.title = e.target.value;
          markDirty();
        },
      }),
    ),
    h(
      'div',
      { class: 'row-inline' },
      h(
        'div',
        {},
        h('div', { class: 'rlabel' }, 'App language'),
        h('div', { class: 'rdesc' }, 'Buttons and feedback. The words themselves stay as typed.'),
      ),
      h(
        'select',
        {
          class: 'select',
          style: { width: '190px' },
          onchange: (e) => {
            app.uiLang = e.target.value;
            markDirty();
          },
        },
        ...LANGS.map((l) => h('option', { value: l.id, selected: l.id === app.uiLang }, l.label)),
      ),
    ),
    h(
      'div',
      { class: 'row-inline' },
      h(
        'div',
        {},
        h('div', { class: 'rlabel' }, 'Starting guidance mode'),
        h('div', { class: 'rdesc' }, 'Trace = follow the guide. Copy = guide visible, check at the end. Memory = no guide.'),
      ),
      segmented(MODES, p.mode, (mode) => {
        p.mode = mode;
        markDirty();
      }),
    ),
    h(
      'div',
      { class: 'row2' },
      field(
        'Chinese grid',
        h(
          'select',
          {
            class: 'select',
            onchange: (e) => {
              p.gridHanzi = e.target.value;
              markDirty();
            },
          },
          ...[
            { id: 'tian', label: '田字格 (cross)' },
            { id: 'mi', label: '米字格 (cross + diagonals)' },
            { id: 'none', label: 'Blank' },
          ].map((o) => h('option', { value: o.id, selected: p.gridHanzi === o.id }, o.label)),
        ),
      ),
      field(
        'Latin grid',
        h(
          'select',
          {
            class: 'select',
            onchange: (e) => {
              p.gridLatin = e.target.value;
              markDirty();
            },
          },
          ...[
            { id: 'lines', label: 'Four lines' },
            { id: 'none', label: 'Blank' },
          ].map((o) => h('option', { value: o.id, selected: p.gridLatin === o.id }, o.label)),
        ),
      ),
    ),
    sliderField(
      'Guide visibility',
      'How strongly the ghost character shows through.',
      p.guideOpacity,
      0.04,
      0.75,
      0.01,
      (v) => `${Math.round(v * 100)}%`,
      (v) => {
        p.guideOpacity = v;
        markDirty();
      },
    ),
    sliderField(
      'Ink thickness',
      'Thickness of the child’s writing, relative to the practice box.',
      p.inkWidth,
      0.02,
      0.12,
      0.005,
      (v) => `${Math.round(v * 100)}%`,
      (v) => {
        p.inkWidth = v;
        markDirty();
      },
    ),
    sliderField(
      'Practice box size',
      'Shrink the writing area for smaller hands, or keep it full size.',
      p.boxScale,
      0.45,
      1,
      0.01,
      (v) => `${Math.round(v * 100)}%`,
      (v) => {
        p.boxScale = v;
        markDirty();
      },
    ),
    field(
      'Ink colour',
      h('input', {
        type: 'color',
        class: 'input',
        style: { width: '90px', padding: '4px', height: '48px' },
        value: p.inkColor,
        oninput: (e) => {
          p.inkColor = e.target.value;
          markDirty();
        },
      }),
    ),
    switchRow('Show pinyin', 'Pinyin appears above Chinese characters.', p.showPinyin, (v) => {
      p.showPinyin = v;
      markDirty();
    }),
    switchRow('Show meaning', 'The translation you typed after the pipe.', p.showMeaning, (v) => {
      p.showMeaning = v;
      markDirty();
    }),
    switchRow('Show stroke numbers', 'Numbered dots on each stroke (Trace mode).', p.showNumbers, (v) => {
      p.showNumbers = v;
      markDirty();
    }),
    switchRow('Auto-advance', 'Move to the next character automatically after a good stroke.', p.autoNext, (v) => {
      p.autoNext = v;
      markDirty();
    }),
    switchRow('Sound effects', 'Short chimes for correct / incorrect strokes.', p.sound, (v) => {
      p.sound = v;
      markDirty();
    }),
    switchRow('Pencil only', 'Ignore finger and palm touches (best with an Apple Pencil).', p.penOnly, (v) => {
      p.penOnly = v;
      markDirty();
    }),
  );
  return panel;
}

/* --------------------------------- scoring -------------------------------- */

function scoringTab() {
  const s = state.config.scoring;
  const panel = h('div', { class: 'panel' });
  panel.append(
    h(
      'div',
      { class: 'row-inline' },
      h(
        'div',
        {},
        h('div', { class: 'rlabel' }, 'Tolerance'),
        h('div', { class: 'rdesc' }, 'How much wobble is allowed before points are lost.'),
      ),
      segmented(TOLERANCES, s.tolerance, (v) => {
        s.tolerance = v;
        markDirty();
      }),
    ),
    sliderField(
      'Pass mark for each stroke',
      'In Trace mode a stroke is accepted when it scores above this. Lower = more forgiving.',
      s.threshold,
      0.2,
      0.9,
      0.01,
      (v) => `${Math.round(v * 100)}%`,
      (v) => {
        s.threshold = v;
        markDirty();
      },
    ),
    switchRow('Show coaching tips', 'Show 1–2 short hints after checking a character.', s.showTips, (v) => {
      s.showTips = v;
      markDirty();
    }),
    h(
      'div',
      { class: 'preview-box', style: { marginTop: '18px' } },
      h('b', {}, 'How the score works'),
      h(
        'p',
        { style: { marginTop: '6px' } },
        'Each stroke is compared with the real stroke path: position, shape, length and direction all count. Starting from the wrong end (bad stroke order) is penalised heavily. The character score is the average of its strokes, weighted by stroke length, so missing a long stroke hurts more than missing a dot.',
      ),
      h(
        'p',
        { style: { marginTop: '8px' } },
        'Stars: 90%+ = 5, 76%+ = 4, 60%+ = 3, 40%+ = 2, below = 1.',
      ),
    ),
  );
  return panel;
}

/* ---------------------------------- data ---------------------------------- */

function dataTab() {
  const panel = h('div', { class: 'panel' });
  const exportBtn = h(
    'button',
    {
      class: 'btn soft',
      onclick: () => {
        const blob = new Blob([JSON.stringify(state.config, null, 2)], { type: 'application/json' });
        const a = h('a', { href: URL.createObjectURL(blob), download: 'writing-fun-config.json' });
        document.body.append(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(a.href);
      },
    },
    icon('download'),
    'Export settings',
  );

  const fileInput = h('input', {
    type: 'file',
    accept: 'application/json,.json',
    style: { display: 'none' },
    onchange: async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        const data = JSON.parse(await file.text());
        if (!Array.isArray(data.sets)) throw new Error('no sets');
        state.config = data;
        state.selectedId = data.sets[0]?.id || null;
        state.dirty = true;
        render();
        toast('Imported — remember to save');
      } catch {
        toast('That file is not a valid backup');
      }
      e.target.value = '';
    },
  });

  const importBtn = h(
    'button',
    { class: 'btn ghost', onclick: () => fileInput.click() },
    icon('upload'),
    'Import settings',
  );

  panel.append(
    h(
      'div',
      { class: 'stat-line' },
      h('span', { class: `pill ${state.gist ? 'ok' : ''}` }, state.gist ? 'GitHub gist sync: on' : 'Server disk storage'),
      state.defaultPin ? h('span', { class: 'pill warn' }, 'Default PIN in use') : null,
    ),
    h(
      'div',
      { class: 'preview-box' },
      h('b', {}, 'Where settings are saved'),
      h(
        'p',
        { style: { marginTop: '6px' } },
        state.gist
          ? 'Settings are saved to a private GitHub gist (GIST_ID + GITHUB_TOKEN), so they survive redeploys on Render’s free plan.'
          : 'Settings are saved to data/store.json on the server. On Render’s free plan the disk is ephemeral, so use Export / Import (or set GIST_ID + GITHUB_TOKEN) to keep changes across redeploys.',
      ),
    ),
    h('div', { class: 'actions-row' }, exportBtn, importBtn, fileInput),
    h(
      'div',
      { class: 'actions-row' },
      h(
        'button',
        {
          class: 'btn danger',
          onclick: async () => {
            if (!confirm('Reset all word lists and settings to the defaults? This cannot be undone.')) return;
            const res = await fetch('/api/admin/reset', { method: 'POST' });
            if (!res.ok) {
              toast('Could not reset');
              return;
            }
            const data = await res.json();
            state.config = data.config;
            state.selectedId = data.config.sets?.[0]?.id || null;
            state.dirty = false;
            render();
            toast('Reset to defaults');
          },
        },
        icon('refresh'),
        'Reset everything',
      ),
    ),
  );

  return panel;
}

/* ---------------------------------- save ---------------------------------- */

async function save() {
  const btn = saveBar?.querySelector('.btn');
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Saving…';
  }
  try {
    const res = await fetch('/api/admin/config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(state.config),
    });
    if (res.status === 401) {
      state.admin = false;
      toast('Session expired — unlock again');
      render();
      return;
    }
    if (!res.ok) throw new Error('save');
    const data = await res.json();
    state.config = data.config;
    state.dirty = false;
    if (!state.config.sets.some((s) => s.id === state.selectedId)) {
      state.selectedId = state.config.sets[0]?.id || null;
    }
    render();
    toast('Saved');
  } catch {
    toast('Could not save. Check the server.');
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Save changes';
    }
  }
}

init();
