import { drawWork } from './inkrender.js';
import { buildDocx } from './docx.js';

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
const COLS = 8;
const GAP = 10;

export function buildPages(student, work) {
  const cell = Math.floor((PAGE_W - PAGE_MARGIN * 2 - GAP * (COLS - 1)) / COLS);
  const labelH = 22;
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
    const perPage = rows * COLS;
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
      const col = i % COLS;
      const row = Math.floor(i / COLS);
      const x = PAGE_MARGIN + col * (cell + GAP);
      const y = top + row * rowH;

      const tile = document.createElement('canvas');
      drawWork(tile, item, { size: cell * 2, guide: false, grid: false });
      ctx.drawImage(tile, x, y, cell, cell);

      ctx.fillStyle = '#6b7280';
      ctx.font = '600 17px sans-serif';
      ctx.fillText(item.unit || '', x + cell / 2, y + cell + 18);
    });

    ctx.fillStyle = '#9ca3af';
    ctx.font = '400 14px sans-serif';
    ctx.fillText(`Page ${pageNo}`, PAGE_W / 2, PAGE_H - 24);

    pages.push(canvas);
    if (!slice.length || index >= work.length) break;
  }
  return pages;
}

export async function downloadDocx(student, work) {
  if (!work.length) return;
  const pages = buildPages(student, work);
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


