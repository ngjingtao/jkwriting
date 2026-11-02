import { drawWork } from './inkrender.js';

const root = document.getElementById('results');
const params = new URLSearchParams(location.search);
const limit = Math.min(400, Math.max(1, Number(params.get('limit')) || 120));
const SIZES = [100, 50, 25];
const DRAW = { 100: 660, 50: 460, 25: 330 };
let currentSize = Number(params.get('size')) || 50;
if (!SIZES.includes(currentSize)) currentSize = 50;
let rendered = null;

const fmtDate = (ts) =>
  ts
    ? new Date(ts).toLocaleString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '';

const fmtDay = (ts) =>
  ts ? new Date(ts).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '';

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === null || value === undefined || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key.startsWith('on') && typeof value === 'function') node[key] = value;
    else node.setAttribute(key, value);
  }
  for (const child of children.flat()) {
    if (child === null || child === undefined) continue;
    node.append(child.nodeType ? child : document.createTextNode(String(child)));
  }
  return node;
}

async function fetchJson(url) {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(String(res.status));
  return res.json();
}

function card(item, size = currentSize) {
  const canvas = el('canvas', { class: 'r-canvas' });
  const figure = el(
    'figure',
    { class: 'r-card' },
    canvas,
    el(
      'figcaption',
      {},
      el('span', { class: 'r-unit' }, item.unit || '?'),
      el('span', { class: 'r-token' }, item.token && item.token !== item.unit ? item.token : ''),
      el(
        'span',
        { class: 'r-meta' },
        `${item.pct}%${item.stars ? ` · ${'★'.repeat(item.stars)}` : ''} · ${fmtDate(item.ts)}`,
      ),
      el('span', { class: 'r-set' }, item.setName || ''),
    ),
  );
  drawWork(canvas, item, { size: DRAW[size] });
  return figure;
}

function renderPicker(students) {
  root.replaceChildren(
    el(
      'div',
      { class: 'r-shell' },
      el('h1', { text: 'Handwriting review' }),
      el('p', { class: 'r-sub' }, 'Choose a student to see their writing.'),
      el(
        'div',
        { class: 'r-picker' },
        ...students.map((student) =>
          el(
            'a',
            { class: 'r-pick', href: `/results?student=${encodeURIComponent(student.id)}` },
            student.name,
            el('span', { class: 'r-pick-meta' }, `${student.work || 0} exercises`),
          ),
        ),
      ),
    ),
  );
}

function setSize(size) {
  if (!SIZES.includes(size) || !rendered) return;
  currentSize = size;
  params.set('size', String(size));
  history.replaceState(null, '', `${location.pathname}?${params.toString()}`);
  renderStudent(rendered.student, rendered.work);
}

function renderStudent(student, work) {
  rendered = { student, work };
  const dates = work.map((w) => w.ts).filter(Boolean);
  const from = dates.length ? fmtDay(Math.min(...dates)) : '';
  const to = dates.length ? fmtDay(Math.max(...dates)) : '';
  const range = from && to ? (from === to ? from : `${from} – ${to}`) : '';

  const bySession = new Map();
  for (const item of work) {
    if (!item.session) continue;
    if (!bySession.has(item.session)) bySession.set(item.session, []);
    bySession.get(item.session).push(item);
  }
  const whole = [...bySession.entries()]
    .filter(([, items]) => items.length > 1 && items.some((i) => i.kind === 'passage'))
    .map(([id, items]) => ({ id, items: items.slice().sort((a, b) => a.ts - b.ts) }));
  const wholeIds = new Set(whole.map((w) => w.id));

  const wholeSection = whole.length
    ? el(
        'section',
        { class: 'r-whole' },
        el('h2', {}, 'Whole passages'),
        el(
          'div',
          { class: 'r-whole-list' },
          ...whole.map((group) => {
            const strip = el('div', { class: 'r-whole-strip' });
            for (const item of group.items.slice(0, 5)) {
              const canvas = el('canvas');
              drawWork(canvas, item, { size: 90, guide: false });
              strip.append(canvas);
            }
            const avg = Math.round(
              group.items.reduce((sum, i) => sum + (i.pct || 0), 0) / group.items.length,
            );
            return el(
              'a',
              {
                class: 'r-whole-card',
                href: `/passage?student=${encodeURIComponent(student.id)}&session=${encodeURIComponent(group.id)}`,
              },
              strip,
              el(
                'span',
                { class: 'r-whole-info' },
                el('span', { class: 'r-whole-title' }, group.items[0].setName || 'Passage'),
                el(
                  'span',
                  { class: 'r-whole-meta' },
                  `${group.items.length} characters · ${avg}% · ${fmtDate(group.items[group.items.length - 1].ts)}`,
                ),
                el('span', { class: 'r-whole-open' }, 'Open the whole passage →'),
              ),
            );
          }),
        ),
      )
    : null;

  const singles = work.filter((item) => !item.session || !wholeIds.has(item.session));

  const grid = el('div', { class: `r-grid r-size-${currentSize}` });
  for (const item of singles) grid.append(card(item, currentSize));

  const sizes = el(
    'div',
    { class: 'r-sizes', role: 'group', 'aria-label': 'Writing size' },
    el('span', { class: 'r-sizes-label' }, 'Size'),
    ...SIZES.map((size) =>
      el(
        'button',
        {
          class: `r-size-btn${size === currentSize ? ' active' : ''}`,
          'aria-pressed': String(size === currentSize),
          onclick: () => setSize(size),
        },
        `${size}%`,
      ),
    ),
  );

  const head = el(
    'header',
    { class: 'r-head' },
    el(
      'div',
      {},
      el('h1', { text: `${student.name} — handwriting` }),
      el(
        'p',
        { class: 'r-sub' },
        `${work.length} exercise${work.length === 1 ? '' : 's'}` +
          (range ? ` · ${range}` : '') +
          ` · printed ${new Date().toLocaleDateString()}`,
      ),
    ),
    el(
      'div',
      { class: 'r-actions' },
      sizes,
      el('button', { class: 'r-btn', onclick: () => window.print(), text: 'Print' }),
      el('a', { class: 'r-btn ghost', href: '/results', text: 'All students' }),
      el('a', { class: 'r-btn ghost', href: '/admin#students', text: 'Parent page' }),
    ),
  );

  const body = work.length
    ? el('div', {}, wholeSection, grid)
    : el('div', { class: 'r-empty' }, 'No handwriting saved for this student yet.');

  root.replaceChildren(
    el('div', { class: 'r-shell' }, head, body, el('p', { class: 'r-foot' }, 'Blue lines show the guide that was traced.')),
  );
}

async function main() {
  let students = [];
  try {
    const data = await fetchJson('/api/students');
    students = Array.isArray(data.students) ? data.students : [];
  } catch {
    root.replaceChildren(el('div', { class: 'r-empty' }, 'Cannot reach the server.'));
    return;
  }

  const id = params.get('student');
  if (!id) {
    renderPicker(students);
    return;
  }
  const student = students.find((s) => s.id === id) || { id, name: 'Student' };
  try {
    const data = await fetchJson(`/api/work?student=${encodeURIComponent(id)}&limit=${limit}`);
    renderStudent(student, Array.isArray(data.work) ? data.work : []);
  } catch {
    renderStudent(student, []);
  }
}

main();
