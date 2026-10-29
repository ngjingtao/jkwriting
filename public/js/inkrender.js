// Renders saved handwriting (and the guide it was traced from) into a canvas.
// Used by the parent page previews and the printable review page.

const INK = '#1f2937';
const GUIDE = 'rgba(79, 70, 229, 0.28)';
const PAPER = '#fffdf8';

function path(ctx, points, toPx) {
  if (!points.length) return;
  const pts = points.map(toPx);
  ctx.beginPath();
  if (pts.length === 1) {
    ctx.arc(pts[0][0], pts[0][1], ctx.lineWidth / 2, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length - 1; i += 1) {
    const mx = (pts[i][0] + pts[i + 1][0]) / 2;
    const my = (pts[i][1] + pts[i + 1][1]) / 2;
    ctx.quadraticCurveTo(pts[i][0], pts[i][1], mx, my);
  }
  const last = pts[pts.length - 1];
  const prev = pts[pts.length - 2];
  ctx.quadraticCurveTo(prev[0], prev[1], last[0], last[1]);
  ctx.stroke();
}

/**
 * Draw one saved unit into a canvas.
 * `item` is { strokes, guide } in normalised 0..1 coordinates.
 */
export function drawWork(canvas, item, options = {}) {
  const css = Math.max(48, options.size || canvas.clientWidth || canvas.width || 140);
  const dpr = Math.min(2.5, window.devicePixelRatio || 1);
  canvas.width = Math.round(css * dpr);
  canvas.height = Math.round(css * dpr);
  canvas.style.width = `${css}px`;
  canvas.style.height = `${css}px`;

  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, css, css);

  // paper
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, css, css);
  ctx.strokeStyle = 'rgba(31, 42, 55, 0.08)';
  ctx.lineWidth = 1;
  ctx.strokeRect(0.5, 0.5, css - 1, css - 1);

  const pad = css * 0.06;
  const size = css - pad * 2;
  const toPx = ([u, v]) => [pad + u * size, pad + v * size];

  if (options.grid !== false) {
    ctx.save();
    ctx.strokeStyle = 'rgba(99, 116, 139, 0.22)';
    ctx.setLineDash([css * 0.02, css * 0.02]);
    ctx.beginPath();
    ctx.moveTo(pad, pad + size * 0.765);
    ctx.lineTo(pad + size, pad + size * 0.765);
    ctx.stroke();
    ctx.restore();
  }

  if (options.guide !== false && Array.isArray(item.guide)) {
    ctx.save();
    ctx.strokeStyle = GUIDE;
    ctx.fillStyle = GUIDE;
    ctx.lineWidth = Math.max(1.2, css * 0.008);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const stroke of item.guide) path(ctx, stroke, toPx);
    ctx.restore();
  }

  ctx.save();
  ctx.strokeStyle = options.ink || INK;
  ctx.fillStyle = options.ink || INK;
  ctx.lineWidth = Math.max(2, css * 0.032);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const stroke of item.strokes || []) path(ctx, stroke, toPx);
  ctx.restore();

  return canvas;
}

export function workLabel(item) {
  const token = item.token && item.token !== item.unit ? item.token : '';
  return token || item.unit || '';
}
