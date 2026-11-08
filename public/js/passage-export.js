import { drawWork } from './inkrender.js';
import { zip } from './docx.js';
import { buildPdf, dataUrlToBytes } from './pdf.js';

/* ------------------------------ Word export ------------------------------ */

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

const PAGE_W = 1240;
const PAGE_H = 1754;
const PAGE_MARGIN = 60;
const GAP = 10;

/** Export presets: characters per row, caption size, PNG resolution. */
export const EXPORT_SIZES = {
  sm: { cols: 10, label: 14, tile: 256, name: 'Small' },
  md: { cols: 8, label: 17, tile: 512, name: 'Medium' },
  lg: { cols: 6, label: 22, tile: 768, name: 'Large' },
  xl: { cols: 4, label: 28, tile: 1024, name: 'Extra large' },
};

export function exportSize(key) {
  return EXPORT_SIZES[key] || EXPORT_SIZES.md;
}

export function buildPages(student, work, sizeKey = 'md') {
  const preset = exportSize(sizeKey);
  const cols = preset.cols;
  const cell = Math.floor((PAGE_W - PAGE_MARGIN * 2 - GAP * (cols - 1)) / cols);
  const labelH = preset.label + 5;
  const rowH = cell + labelH + GAP;
  const headFirst = 150;
  const headNext = 74;
  const rowsFirst = Math.max(1, Math.floor((PAGE_H - PAGE_MARGIN * 2 - headFirst - 30) / rowH));
  const rowsNext = Math.max(1, Math.floor((PAGE_H - PAGE_MARGIN * 2 - headNext - 30) / rowH));

  const pages = [];
  let index = 0;
  let pageNo = 0;
  while (index < work.length || pages.length === 0) {
    pageNo += 1;
    const first = pageNo === 1;
    const rows = first ? rowsFirst : rowsNext;
    const perPage = rows * cols;
    const slice = work.slice(index, index + perPage);
    index += slice.length;

    const canvas = document.createElement('canvas');
    canvas.width = PAGE_W;
    canvas.height = PAGE_H;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, PAGE_W, PAGE_H);
    ctx.textAlign = 'center';

    if (first) {
      ctx.fillStyle = '#111827';
      ctx.font = '700 34px sans-serif';
      ctx.fillText(`${student.name} — passage`, PAGE_W / 2, PAGE_MARGIN + 46);
      ctx.fillStyle = '#6b7280';
      ctx.font = '400 20px sans-serif';
      const avg = work.length
        ? Math.round(work.reduce((sum, item) => sum + (item.pct || 0), 0) / work.length)
        : 0;
      ctx.fillText(
        [work[0]?.setName, `${work.length} characters`, `${avg}% average`, fmtDate(work[0]?.ts)]
          .filter(Boolean)
          .join(' · '),
        PAGE_W / 2,
        PAGE_MARGIN + 82,
      );
    } else {
      ctx.fillStyle = '#6b7280';
      ctx.font = '600 18px sans-serif';
      ctx.fillText(`${student.name} — passage`, PAGE_W / 2, PAGE_MARGIN + 30);
    }

    const top = PAGE_MARGIN + (first ? headFirst : headNext);
    slice.forEach((item, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = PAGE_MARGIN + col * (cell + GAP);
      const y = top + row * rowH;

      const tile = document.createElement('canvas');
      drawWork(tile, item, { size: cell * 2, guide: false, grid: false });
      ctx.drawImage(tile, x, y, cell, cell);

      ctx.fillStyle = '#6b7280';
      ctx.font = `600 ${preset.label}px sans-serif`;
      ctx.fillText(item.unit || '', x + cell / 2, y + cell + preset.label + 2);
    });

    ctx.fillStyle = '#9ca3af';
    ctx.font = '400 14px sans-serif';
    ctx.fillText(`Page ${pageNo}`, PAGE_W / 2, PAGE_H - 24);

    pages.push(canvas);
    if (!slice.length || index >= work.length) break;
  }
  return pages;
}

let docxLib = null;

/** Load the bundled Word library on demand (only needed for .docx export). */
async function loadDocxLib() {
  if (docxLib) return docxLib;
  if (!globalThis.docx) {
    await new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = '/vendor/docx.umd.js';
      script.onload = resolve;
      script.onerror = () => reject(new Error('docx'));
      document.head.append(script);
    });
  }
  docxLib = globalThis.docx;
  return docxLib;
}

export async function downloadDocx(student, work, sizeKey = 'md') {
  if (!work.length) return;
  const pages = buildPages(student, work, sizeKey);
  const lib = await loadDocxLib();
  const { Document, Packer, Paragraph, ImageRun, PageBreak } = lib;

  const children = [];
  for (let i = 0; i < pages.length; i += 1) {
    const canvas = pages[i];
    // JPEG pages are the most Word-friendly thing to embed.
    const bytes = dataUrlToBytes(canvas.toDataURL('image/jpeg', 0.92));
    const width = 700; // 18.5 cm at 96 dpi
    children.push(
      new Paragraph({
        spacing: { before: 0, after: 0 },
        children: [
          new ImageRun({
            type: 'jpg',
            data: bytes,
            transformation: { width, height: Math.round((width * canvas.height) / canvas.width) },
          }),
        ],
      }),
    );
    if (i < pages.length - 1) children.push(new Paragraph({ children: [new PageBreak()] }));
  }

  const doc = new Document({
    creator: 'Writing Fun',
    title: `${student.name || 'Student'} — passage`,
    sections: [
      {
        properties: {
          page: {
            size: { width: 11906, height: 16838 },
            margin: { top: 567, right: 567, bottom: 567, left: 567 },
          },
        },
        children,
      },
    ],
  });

  const out = await Packer.toBlob(doc);
  const name = `passage-${student.name || 'student'}-${new Date().toISOString().slice(0, 10)}.docx`
    .replace(/[^a-z0-9.\-]+/gi, '-')
    .replace(/-+/g, '-');
  saveBlob(out, name);
}



/* --------------------------- one file per character ------------------------ */


function safeName(text, fallback) {
  const cleaned = String(text || '')
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_')
    .trim();
  return cleaned || fallback;
}

function saveBlob(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

/** Download a ZIP with one transparent PNG per written character. */
export async function exportCharactersZip(student, work, sizeKey = 'md') {
  if (!work.length) return;
  const preset = exportSize(sizeKey);
  const tile = preset.tile;
  const files = [];
  const rows = [['order', 'character', 'score', 'time']];

  for (let i = 0; i < work.length; i += 1) {
    const item = work[i];
    const canvas = document.createElement('canvas');
    drawWork(canvas, item, {
      size: tile,
      guide: false,
      grid: false,
      paper: false,
    });
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const order = String(i + 1).padStart(3, '0');
    files.push({ name: `${order}-${safeName(item.unit, 'char')}.png`, data: bytes });
    rows.push([order, item.unit || '', item.pct ?? '', new Date(item.ts).toISOString()]);
  }

  const csv = rows
    .map((row) => row.map((value) => `"${String(value ?? '').replace(/"/g, '""')}"`).join(','))
    .join('\r\n');
  files.push({ name: 'index.csv', data: new TextEncoder().encode(csv) });
  files.push({
    name: 'readme.txt',
    data: new TextEncoder().encode(
      [
        `${student.name || 'Student'} — ${work[0]?.setName || 'passage'}`,
        `${work.length} characters, one transparent ${tile} x ${tile} PNG each, in reading order.`,
        'File names: 001-<character>.png, 002-<character>.png, …',
        'index.csv lists the order, character, score and time.',
        `Exported ${new Date().toLocaleString()}.`,
      ].join('\n'),
    ),
  });

  const bytes = zip(files);
  const name = `passage-${student.name || 'student'}-${new Date().toISOString().slice(0, 10)}-characters.zip`
    .replace(/[^a-z0-9.\-]+/gi, '-')
    .replace(/-+/g, '-');
  saveBlob(new Blob([bytes], { type: 'application/zip' }), name);
}

/** Download the same composed pages as a PDF (opens anywhere). */
export async function exportPdf(student, work, sizeKey = 'md') {
  if (!work.length) return;
  const pages = buildPages(student, work, sizeKey);
  const images = pages.map((canvas) => ({
    bytes: dataUrlToBytes(canvas.toDataURL('image/jpeg', 0.92)),
    width: canvas.width,
    height: canvas.height,
  }));
  const bytes = buildPdf(images);
  const name = `passage-${student.name || 'student'}-${new Date().toISOString().slice(0, 10)}.pdf`
    .replace(/[^a-z0-9.\-]+/gi, '-')
    .replace(/-+/g, '-');
  saveBlob(new Blob([bytes], { type: 'application/pdf' }), name);
}

/* ---------------------------------- RTF ----------------------------------- */

function bytesToHex(bytes) {
  const table = [];
  for (let i = 0; i < 256; i += 1) table.push(i.toString(16).padStart(2, '0'));
  const parts = [];
  const chunk = 8192;
  for (let i = 0; i < bytes.length; i += chunk) {
    const slice = bytes.subarray(i, i + chunk);
    let text = '';
    for (let k = 0; k < slice.length; k += 1) text += table[slice[k]];
    parts.push(text);
  }
  return parts.join('');
}

/**
 * Word-compatible RTF: one JPEG page per sheet. Word opens RTF natively and
 * can save it as .docx, so this works even when a .docx package is refused.
 */
export async function exportRtf(student, work, sizeKey = 'md') {
  if (!work.length) return;
  const pages = buildPages(student, work, sizeKey);
  const contentW = 10772; // 19 cm in twips

  const chunks = [
    '{\\rtf1\\ansi\\deff0',
    '{\\fonttbl{\\f0\\fswiss Calibri;}}',
    '\\paperw11906\\paperh16838\\margl567\\margr567\\margt567\\margb567',
  ];

  pages.forEach((canvas, i) => {
    const bytes = dataUrlToBytes(canvas.toDataURL('image/jpeg', 0.9));
    const height = Math.round((contentW * canvas.height) / canvas.width);
    chunks.push(
      `{\\pict\\jpegblip\\picw${canvas.width}\\pich${canvas.height}` +
        `\\picwgoal${contentW}\\pichgoal${height}`,
    );
    chunks.push(bytesToHex(bytes));
    chunks.push('}');
    if (i < pages.length - 1) chunks.push('\\page');
  });
  chunks.push('}');

  const name = `passage-${student.name || 'student'}-${new Date().toISOString().slice(0, 10)}.rtf`
    .replace(/[^a-z0-9.\-]+/gi, '-')
    .replace(/-+/g, '-');
  saveBlob(new Blob([chunks.join('\n')], { type: 'application/rtf' }), name);
}
