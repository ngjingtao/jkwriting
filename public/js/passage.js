import { drawWork } from './inkrender.js';
import { downloadDocx, exportCharactersZip, exportPdf, EXPORT_SIZES } from './passage-export.js';

const root = document.getElementById('passage');
const params = new URLSearchParams(location.search);
const studentId = params.get('student');
const session = params.get('session');

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

function render(student, work) {
  if (!work.length) {
    root.replaceChildren(
      el('div', { class: 'r-shell' }, el('div', { class: 'r-empty' }, 'Nothing saved for this passage.')),
    );
    return;
  }
  const text = work.map((item) => item.unit || '').join('');
  const avg = Math.round(work.reduce((sum, item) => sum + (item.pct || 0), 0) / work.length);

  const cells = el('div', { class: 'p-sheet' });
  for (const item of work) {
    const canvas = el('canvas', { class: 'p-cell' });
    drawWork(canvas, item, { size: 150, guide: false, grid: false });
    cells.append(
      el(
        'figure',
        { class: 'p-figure' },
        canvas,
        el('figcaption', { class: 'p-char' }, item.unit || ''),
      ),
    );
  }

  const savedSize = localStorage.getItem('wf.exportSize') || 'md';
  const sizeSelect = el(
    'select',
    {
      class: 'r-select',
      'aria-label': 'Export size',
      onchange: (event) => localStorage.setItem('wf.exportSize', event.target.value),
    },
    ...Object.entries(EXPORT_SIZES).map(([key, preset]) =>
      el(
        'option',
        {
          value: key,
          selected: key === savedSize,
        },
        `${preset.name} · ${preset.cols}/row · ${preset.tile}px`,
      ),
    ),
  );

  const head = el(
    'header',
    { class: 'r-head' },
    el(
      'div',
      {},
      el('h1', { text: `${student.name} — passage` }),
      el(
        'p',
        { class: 'r-sub' },
        [work[0].setName || 'Passage', `${work.length} characters`, `${avg}% average`, fmtDate(work[0].ts)]
          .filter(Boolean)
          .join(' · '),
      ),
    ),
    el(
      'div',
      { class: 'r-actions' },
      el('button', { class: 'r-btn', onclick: () => window.print(), text: 'Print' }),
      sizeSelect,
      el('button', {
        class: 'r-btn ghost',
        onclick: () => downloadDocx(student, work, sizeSelect.value),
        text: 'Word (.docx)',
      }),
      el('button', {
        class: 'r-btn ghost',
        onclick: () => exportPdf(student, work, sizeSelect.value),
        text: 'PDF',
      }),
      el('button', {
        class: 'r-btn ghost',
        onclick: () => exportCharactersZip(student, work, sizeSelect.value),
        text: 'Characters (.zip)',
      }),
      el(
        'a',
        { class: 'r-btn ghost', href: `/results?student=${encodeURIComponent(student.id)}`, text: 'All writing' },
      ),
      el('a', { class: 'r-btn ghost', href: '/admin#students', text: 'Parent page' }),
    ),
  );

  root.replaceChildren(
    el(
      'div',
      { class: 'r-shell' },
      head,
      el('p', { class: 'p-text' }, text),
      cells,
      el('p', { class: 'r-foot' }, 'Each box is one character the child wrote, in order.'),
    ),
  );
}

async function main() {
  if (!studentId || !session) {
    root.replaceChildren(el('div', { class: 'r-empty' }, 'Open this page from a student’s review.'));
    return;
  }
  try {
    const [students, data] = await Promise.all([
      fetch('/api/students', { cache: 'no-store' }).then((r) => r.json()),
      fetch(
        `/api/work?student=${encodeURIComponent(studentId)}&session=${encodeURIComponent(session)}&limit=2000`,
        { cache: 'no-store' },
      ).then((r) => r.json()),
    ]);
    const student = (students.students || []).find((s) => s.id === studentId) || {
      id: studentId,
      name: 'Student',
    };
    const work = (Array.isArray(data.work) ? data.work : []).slice().sort((a, b) => a.ts - b.ts);
    render(student, work);
  } catch {
    root.replaceChildren(el('div', { class: 'r-empty' }, 'Cannot reach the server.'));
  }
}

main();
