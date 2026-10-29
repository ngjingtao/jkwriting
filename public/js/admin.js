import { h, icon, toast, clear, openSheet } from './ui.js';
import { drawWork } from './inkrender.js';

const root = document.getElementById('admin');
const state = {
  config: null,
  admin: false,
  tab: 'sets',
  selectedId: null,
  dirty: false,
  gist: false,
  db: false,
  dbConfigured: false,
  students: null,
  studentId: null,
  work: [],
  workFor: null,
  storage: 'file',
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

const KINDS = [
  { id: 'latin', label: 'A · Latin words / phrases' },
  { id: 'chinese', label: 'B · Chinese words / phrases' },
  { id: 'passage', label: 'C · Mixed passage' },
];

const KIND_LABEL = { latin: 'LATIN', chinese: '中文', passage: 'PASSAGE' };

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

function checkRow(label, desc, options, values, onChange) {
  const wrap = h('div', { class: 'checks' });
  for (const opt of options) {
    const cb = h('input', {
      type: 'checkbox',
      checked: values.includes(opt.id),
      onchange: () => onChange(opt.id, cb.checked),
    });
    wrap.append(h('label', { class: 'check' }, cb, opt.label));
  }
  return h(
    'div',
    { class: 'row-inline' },
    h('div', {}, h('div', { class: 'rlabel' }, label), desc ? h('div', { class: 'rdesc' }, desc) : null),
    wrap,
  );
}

function sliderField(labelText, desc, value, min, max, step, format, onChange) {  const out = h('output', {}, format(value));
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

function kindBadge(kind) {
  return h('span', { class: `lang-badge ${kind}` }, KIND_LABEL[kind] || kind);
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
    const hash = location.hash.replace('#', '');
    if (TABS.some((tab) => tab.id === hash)) state.tab = hash;
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
    state.db = Boolean(data.db);
    state.dbConfigured = Boolean(data.dbConfigured);
    state.storage = data.storage || (data.db ? 'postgres' : 'file');
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
        'a',
        { class: 'btn ghost sm', href: '/strokes', style: { textDecoration: 'none' } },
        'Stroke editor',
      ),
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
  { id: 'students', label: 'Students' },
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
  if (state.tab === 'students') return studentsTab();
  if (state.tab === 'practice') return practiceTab();
  if (state.tab === 'scoring') return scoringTab();
  if (state.tab === 'data') return dataTab();
  return setsTab();
}

/* -------------------------------- students -------------------------------- */

function shortDate(ts) {
  if (!ts) return '';
  return new Date(ts).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function studentsTab() {
  const panel = h('div', { class: 'panel' });

  const nameInput = h('input', {
    class: 'input',
    placeholder: 'New student name',
    maxlength: '24',
    style: { maxWidth: '240px' },
  });
  const addBtn = h(
    'button',
    { class: 'btn primary', onclick: () => addStudent() },
    icon('plus'),
    'Add student',
  );

  const listBox = h('div', { class: 'student-admin-list' }, h('div', { class: 'empty' }, 'Loading…'));
  const workHead = h('div', { class: 'work-head' });
  const grid = h('div', { class: 'work-grid' });

  async function addStudent() {
    const name = nameInput.value.trim();
    if (!name) return;
    addBtn.disabled = true;
    try {
      const res = await fetch('/api/students', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) {
        toast(res.status === 409 ? 'That name is already used' : 'Could not add the student');
        return;
      }
      const data = await res.json();
      nameInput.value = '';
      state.studentId = data.student.id;
      await reload(true);
    } catch {
      toast('Could not add the student');
    } finally {
      addBtn.disabled = false;
    }
  }

  function paintList() {
    clear(listBox);
    const students = state.students || [];
    if (!students.length) {
      listBox.append(h('div', { class: 'empty' }, 'No students yet.'));
      return;
    }
    for (const student of students) {
      const active = student.id === state.studentId;
      listBox.append(
        h(
          'div',
          { class: `student-admin-row${active ? ' active' : ''}` },
          h(
            'div',
            { class: 'sa-main', onclick: () => select(student.id) },
            h('div', { class: 'sa-name' }, student.name),
            h(
              'div',
              { class: 'sa-meta' },
              `${student.work || 0} exercises · ${student.stars || 0} stars` +
                (student.lastTs ? ` · last ${shortDate(student.lastTs)}` : ''),
            ),
          ),
          h(
            'div',
            { class: 'sa-actions' },
            h('button', { class: 'btn ghost sm', onclick: () => select(student.id) }, 'Review'),
            h('button', { class: 'btn ghost sm', onclick: () => rename(student) }, 'Rename'),
            h('button', { class: 'btn ghost sm', onclick: () => print(student.id) }, 'Print'),
            h('button', { class: 'btn ghost sm danger', onclick: () => remove(student) }, 'Delete'),
          ),
        ),
      );
    }
  }

  function select(id) {
    state.studentId = id;
    paintList();
    loadWork(id);
  }

  function print(id) {
    window.open(`/results?student=${encodeURIComponent(id)}`, '_blank', 'noopener');
  }

  async function rename(student) {
    const next = window.prompt('Student name', student.name);
    if (!next || next.trim() === student.name) return;
    const res = await fetch(`/api/students/${encodeURIComponent(student.id)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: next.trim() }),
    });
    if (!res.ok) {
      toast(res.status === 409 ? 'That name is already used' : 'Could not rename');
      return;
    }
    await reload(true);
  }

  async function remove(student) {
    const ok = window.confirm(
      `Delete ${student.name} and all of their handwriting?\n\nThis cannot be undone.`,
    );
    if (!ok) return;
    const res = await fetch(`/api/students/${encodeURIComponent(student.id)}`, { method: 'DELETE' });
    if (!res.ok) {
      toast('Could not delete the student');
      return;
    }
    state.studentId = null;
    state.work = [];
    await reload(true);
  }

  function paintWork() {
    clear(grid);
    const work = state.work || [];
    const student = (state.students || []).find((s) => s.id === state.studentId);
    clear(workHead);
    workHead.append(
      h('h3', {}, student ? `${student.name} — handwriting` : 'Handwriting'),
      h(
        'div',
        { class: 'work-head-actions' },
        h(
          'button',
          { class: 'btn soft sm', onclick: () => print(state.studentId), disabled: !state.studentId },
          icon('download'),
          'Print / review page',
        ),
        h(
          'button',
          { class: 'btn ghost sm', onclick: () => loadWork(state.studentId) },
          icon('refresh'),
          'Refresh',
        ),
      ),
    );
    if (!student) {
      grid.append(h('div', { class: 'empty' }, 'Choose a student to see their handwriting.'));
      return;
    }
    if (!work.length) {
      grid.append(h('div', { class: 'empty' }, 'No handwriting yet — finish a letter in the app.'));
      return;
    }
    for (const item of work) {
      const canvas = h('canvas', { class: 'work-canvas' });
      const card = h(
        'button',
        { class: 'work-card', onclick: () => openWork(item, student) },
        canvas,
        h('div', { class: 'wc-unit' }, item.unit),
        h('div', { class: 'wc-meta' }, `${item.pct}% · ${shortDate(item.ts)}`),
      );
      grid.append(card);
      drawWork(canvas, item, { size: 132 });
    }
  }

  function openWork(item, student) {
    const canvas = h('canvas', { class: 'work-canvas-large' });
    const sheet = openSheet({
      title: `${student.name} · ${item.unit}`,
      sub: `${item.token !== item.unit ? item.token + ' · ' : ''}${item.setName || 'Practice'} · ${item.pct}% · ${shortDate(item.ts)}`,
      body: h('div', { class: 'work-detail' }, canvas, h('p', { class: 'work-hint' }, 'Blue lines show the guide that was traced.')),
    });
    drawWork(canvas, item, { size: Math.min(360, window.innerWidth - 80) });
    return sheet;
  }

  async function loadWork(id) {
    if (!id) {
      paintWork();
      return;
    }
    try {
      const res = await fetch(`/api/work?student=${encodeURIComponent(id)}&limit=60`, {
        cache: 'no-store',
      });
      if (!res.ok) throw new Error('work');
      const data = await res.json();
      state.work = Array.isArray(data.work) ? data.work : [];
      state.workFor = id;
    } catch {
      state.work = [];
    }
    paintWork();
  }

  async function reload(force = false) {
    if (!state.students || force) {
      try {
        const res = await fetch('/api/students', { cache: 'no-store' });
        const data = await res.json();
        state.students = Array.isArray(data.students) ? data.students : [];
      } catch {
        state.students = [];
      }
    }
    if (!state.studentId && state.students?.length) state.studentId = state.students[0].id;
    if (state.studentId && !state.students?.some((s) => s.id === state.studentId)) {
      state.studentId = state.students?.[0]?.id || null;
    }
    paintList();
    await loadWork(state.studentId);
  }

  panel.append(
    h('h2', {}, 'Students'),
    h(
      'p',
      { class: 'hint' },
      'Everyone practises the same word lists and stroke guides. Stars, progress and handwriting are kept separately for each student — the database stores them, so they follow you across devices.',
    ),
    h('div', { class: 'student-add' }, nameInput, addBtn),
    listBox,
    h('div', { class: 'work-panel' }, workHead, grid),
  );

  reload();
  return panel;
}

/* ------------------------------- word lists ------------------------------- */

function parseItems(text, kind = 'latin') {
  const seen = new Set();
  const items = [];

  if (kind === 'passage') {
    // A whole passage may be typed over any number of lines, paragraphs and
    // blank lines. Only a line with --- starts another passage.
    let current = [];
    const flush = () => {
      const block = current.join(' ').replace(/\s+/g, ' ').trim();
      current = [];
      if (!block || seen.has(block)) return;
      seen.add(block);
      items.push({ text: block });
    };
    for (const line of String(text).split(/\r?\n/)) {
      if (/^\s*-{3,}\s*$/.test(line)) flush();
      else current.push(line.trim());
    }
    flush();
    return items;
  }

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
  const joiner = set.kind === 'passage' ? '\n\n---\n\n' : '\n';
  return set.items
    .map((i) => (i.meaning ? `${i.text} | ${i.meaning}` : i.text))
    .join(joiner);
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
        h(
          'div',
          { class: 'si-name' },
          kindBadge(set.kind || (set.lang === 'zh' ? 'chinese' : 'latin')),
          set.name,
          set.enabled ? null : h('span', { class: 'pill' }, 'off'),
        ),
        h(
          'div',
          { class: 'si-meta' },
          `${set.items.length} ${set.kind === 'passage' ? 'passages' : 'items'}${
            set.repeat > 1 ? ` · ×${set.repeat}` : ''
          }`,
        ),
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
            kind: 'latin',
            lang: 'en',
            name: 'New word list',
            enabled: true,
            repeat: 1,
            items: [{ text: 'cat' }],
          };
          state.config.sets.push(set);
          state.selectedId = set.id;
          markDirty();
          render();
        },
      },
      icon('plus'),
      'Add word list',
    ),
    sets.length ? list : h('div', { class: 'hint', style: { marginTop: '12px' } }, 'No lists yet.'),
  );

  let right;
  if (current) {
    if (!current.kind) current.kind = current.lang === 'zh' ? 'chinese' : 'latin';
    if (!current.repeat) current.repeat = 1;
    const isPassage = current.kind === 'passage';

    const nameInput = h('input', {
      class: 'input',
      value: current.name,
      maxlength: '40',
      oninput: (e) => {
        current.name = e.target.value;
        markDirty();
      },
    });

    const typeSelect = h(
      'select',
      {
        class: 'select',
        onchange: (e) => {
          current.kind = e.target.value;
          if (current.kind === 'chinese') current.lang = 'zh';
          else if (current.lang === 'zh') current.lang = 'en';
          if (current.kind === 'passage') current.repeat = 1;
          markDirty();
          render();
        },
      },
      ...KINDS.map((k) => h('option', { value: k.id, selected: k.id === current.kind }, k.label)),
    );

    const langSelect = h(
      'select',
      {
        class: 'select',
        disabled: current.kind === 'chinese',
        onchange: (e) => {
          current.lang = e.target.value;
          markDirty();
        },
      },
      ...LANGS.filter((l) => (current.kind === 'chinese' ? l.id === 'zh' : l.id !== 'zh')).map((l) =>
        h('option', { value: l.id, selected: l.id === current.lang }, l.label),
      ),
    );

    const repeatInput = h('input', {
      class: 'input',
      type: 'number',
      min: '1',
      max: '10',
      value: current.repeat,
      disabled: isPassage,
      oninput: (e) => {
        const n = Math.round(Number(e.target.value));
        current.repeat = Number.isFinite(n) ? Math.min(10, Math.max(1, n)) : 1;
        markDirty();
      },
    });

    const countTag = h(
      'span',
      { class: 'pill' },
      `${current.items.length} ${isPassage ? 'passages' : 'items'}`,
    );

    const textarea = h('textarea', {
      class: `textarea${isPassage ? ' tall' : ''}`,
      spellcheck: 'false',
      wrap: 'soft',
      value: itemsToText(current),
      oninput: (e) => {
        current.items = parseItems(e.target.value, current.kind);
        countTag.textContent = `${current.items.length} ${isPassage ? 'passages' : 'items'}`;
        markDirty();
      },
    });

    const help =
      current.kind === 'chinese'
        ? 'One word or phrase per line. Practised character by character. Pinyin and Wade-Giles are added automatically.'
        : current.kind === 'passage'
          ? 'The whole text is one passage — line breaks and blank lines stay inside it, so every word is practised in the same run. Chinese and Latin can be mixed. To keep several passages in one list, put a line with --- between them.'
          : 'One word or phrase per line. Practised letter by letter.';

    right = h(
      'div',
      {},
      h('div', { class: 'row2' }, field('List name', nameInput), field('Type', typeSelect)),
      h(
        'div',
        { class: 'row2' },
        field(
          'Language / voice',
          langSelect,
          current.kind === 'chinese'
            ? 'Chinese is detected automatically.'
            : 'Voice used to read the Latin words aloud.',
        ),
        field(
          'Repeat each item',
          repeatInput,
          isPassage
            ? 'Passages are written once.'
            : 'How many times the child writes each word before moving on.',
        ),
      ),
      field(
        isPassage ? 'Passages' : 'Words',
        h(
          'div',
          {},
          textarea,
          h(
            'div',
            { class: 'hint', style: { marginTop: '8px' } },
            h(
              'span',
              {},
              isPassage ? 'Example: ' : 'Add a meaning after a pipe: ',
              isPassage
                ? h('code', {}, 'Good morning! 早上好！I go to school. 我去学校。')
                : h('code', {}, 'cat | 猫 · kucing'),
            ),
            h('div', { style: { marginTop: '6px' } }, countTag),
          ),
        ),
        help,
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
  const allowed =
    Array.isArray(p.allowedModes) && p.allowedModes.length
      ? p.allowedModes
      : MODES.map((m) => m.id);
  p.allowedModes = allowed;
  if (!allowed.includes(p.mode)) p.mode = allowed[0];

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
      segmented(
        MODES.filter((m) => allowed.includes(m.id)),
        p.mode,
        (mode) => {
          p.mode = mode;
          markDirty();
        },
      ),
    ),
    checkRow(
      'Allowed modes',
      'Untick a mode to hide it from the child. At least one must stay on.',
      MODES,
      allowed,
      (id, checked) => {
        const next = new Set(allowed);
        if (checked) next.add(id);
        else next.delete(id);
        if (!next.size) {
          toast('Keep at least one mode on');
          render();
          return;
        }
        p.allowedModes = MODES.map((m) => m.id).filter((m) => next.has(m));
        if (!p.allowedModes.includes(p.mode)) p.mode = p.allowedModes[0];
        markDirty();
        render();
      },
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
    sliderField(
      'Practice text size',
      'Size of the word, pinyin and passage sentence at the top of the practice screen. The writing box is unchanged — use “Practice box size” for that.',
      p.wordSize ?? 100,
      80,
      180,
      5,
      (v) => `${v}%`,
      (v) => {
        p.wordSize = v;
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
    switchRow(
      'Show Wade-Giles',
      'Also show 威氏拼音 (Wade-Giles) with tone numbers, e.g. ni³ hao³.',
      p.showWadeGiles,
      (v) => {
        p.showWadeGiles = v;
        markDirty();
      },
    ),
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
    switchRow(
      'Read aloud',
      'Speak the word when it is finished. Chinese needs a Mandarin voice (iPad Settings → Accessibility → Spoken Content); otherwise the Hanyu Pinyin is read instead.',
      p.speakOnComplete,
      (v) => {
        p.speakOnComplete = v;
        markDirty();
      },
    ),
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
        let history = [];
        try {
          history = JSON.parse(localStorage.getItem('wf.history.v1') || '[]');
        } catch {
          history = [];
        }
        const backup = { ...state.config, history: Array.isArray(history) ? history : [] };
        const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
        const a = h('a', { href: URL.createObjectURL(blob), download: 'writing-fun-backup.json' });
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
        if (Array.isArray(data.history)) {
          try {
            localStorage.setItem('wf.history.v1', JSON.stringify(data.history.slice(-500)));
          } catch {
            /* ignore quota */
          }
        }
        const { history: _history, ...config } = data;
        state.config = config;
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
      h(
        'span',
        {
          class: `pill ${state.db || state.gist || state.dbConfigured ? 'ok' : ''} ${
            state.dbConfigured && !state.db ? 'warn' : ''
          }`,
        },
        state.db
          ? 'Postgres database: on'
          : state.dbConfigured
            ? 'Database set but unreachable — using disk'
            : state.gist
              ? 'GitHub gist sync: on'
              : 'Server disk storage',
      ),
      state.defaultPin ? h('span', { class: 'pill warn' }, 'Default PIN in use') : null,
    ),
    h(
      'div',
      { class: 'preview-box' },
      h('b', {}, 'Where settings are saved'),
      h(
        'p',
        { style: { marginTop: '6px' } },
        state.db
          ? 'Word lists, settings, stroke edits and practice history are stored in the Postgres database (DATABASE_URL), so every device and every redeploy sees the same data.'
          : state.dbConfigured
            ? 'DATABASE_URL is set but the server could not connect, so it fell back to data/store.json — which is wiped whenever Render restarts or sleeps. Check the value (host, password, sslmode) and redeploy.'
          : state.gist
            ? 'Settings are saved to a private GitHub gist (GIST_ID + GITHUB_TOKEN), so they survive redeploys on Render’s free plan. Practice history stays on each iPad.'
            : 'Settings are saved to data/store.json on the server. On Render’s free plan the disk is ephemeral, so use Export / Import (or set DATABASE_URL / GIST_ID + GITHUB_TOKEN) to keep changes across redeploys.',
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

// Settings live on the server; leaving with unsaved edits is how word lists
// and passages disappear, so ask before unloading.
window.addEventListener('beforeunload', (event) => {
  if (!state.dirty) return;
  event.preventDefault();
  event.returnValue = '';
});

init();
