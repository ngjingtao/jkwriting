import { drawWork } from './inkrender.js';
import { buildDocx, zip } from './docx.js';
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

export async function downloadDocx(student, work, sizeKey = 'md') {
  if (!work.length) return;
  const pages = buildPages(student, work, sizeKey);
  const pngs = [];
  for (const canvas of pages) {
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
    pngs.push(new Uint8Array(await blob.arrayBuffer()));
  }
  const bytes = buildDocx({ pages: pngs, widthPx: PAGE_W, heightPx: PAGE_H });
  const name = `passage-${student.name || 'student'}-${new Date().toISOString().slice(0, 10)}.docx`
    .replace(/[^a-z0-9.\-]+/gi, '-')
    .replace(/-+/g, '-');
  const blob = new Blob([bytes], {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
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
