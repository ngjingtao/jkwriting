import { drawWork } from './inkrender.js';

const root = document.getElementById('results');
const params = new URLSearchParams(location.search);
const limit = Math.min(400, Math.max(1, Number(params.get('limit')) || 120));

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

function card(item) {
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
  drawWork(canvas, item, { size: 190 });
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

function renderStudent(student, work) {
  const dates = work.map((w) => w.ts).filter(Boolean);
  const from = dates.length ? fmtDay(Math.min(...dates)) : '';
  const to = dates.length ? fmtDay(Math.max(...dates)) : '';
  const range = from && to ? (from === to ? from : `${from} – ${to}`) : '';

  const grid = el('div', { class: 'r-grid' });
  for (const item of work) grid.append(card(item));

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
      el('button', { class: 'r-btn', onclick: () => window.print(), text: 'Print' }),
      el('a', { class: 'r-btn ghost', href: '/results', text: 'All students' }),
      el('a', { class: 'r-btn ghost', href: '/admin#students', text: 'Parent page' }),
    ),
  );

  const body = work.length
    ? grid
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
