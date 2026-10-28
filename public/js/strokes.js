import { h, toast, clear } from './ui.js';
import {
  autoLatinStrokes,
  ensureLatinFont,
  latinMetrics,
  LATIN_SIZE_RATIO,
  LATIN_BASELINE,
  LATIN_FAMILY,
} from './fontfit.js';

const CHARS = [...'abcdefghijklmnopqrstuvwxyz', ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ', ...'0123456789'];
const COLORS = ['#e11d48', '#2563eb', '#16a34a', '#f59e0b', '#7c3aed', '#0891b2'];
const root = document.getElementById('editor');

const state = {
  config: null,
  admin: false,
  char: 'a',
  strokes: [],
  selected: 0,
  point: -1,
  dirty: false,
  showGhost: true,
  canvas: null,
  ctx: null,
  box: null,
  drag: null,
  undo: [],
  ro: null,
  gridEl: null,
  panelEl: null,
  statusEl: null,
};

const clone = (value) => JSON.parse(JSON.stringify(value));
const clamp01 = (v) => Math.min(1, Math.max(0, v));

function pushUndo() {
  state.undo.push(clone(state.strokes));
  if (state.undo.length > 60) state.undo.shift();
}

/* ---------------------------------- boot ---------------------------------- */

async function boot() {
  try {
    const [config, session] = await Promise.all([
      fetch('/api/config', { cache: 'no-cache' }).then((res) => res.json()),
      fetch('/api/admin/session')
        .then((res) => res.json())
        .catch(() => ({ admin: false })),
    ]);
    state.config = config;
    state.config.strokes = state.config.strokes || {};
    state.admin = Boolean(session.admin);
  } catch {
    root.append(h('div', { class: 'empty' }, 'Cannot reach the server.'));
    return;
  }

  if (!state.admin) {
    renderLogin();
    return;
  }

  await ensureLatinFont();
  const requested = new URLSearchParams(location.search).get('char');
  state.char = CHARS.includes(requested) ? requested : 'a';
  loadChar(state.char);
  render();
}

function loadChar(ch) {
  const auto = autoLatinStrokes(ch) || [];
  const custom = state.config.strokes[ch];
  state.char = ch;
  state.strokes = clone(custom || auto);
  state.selected = 0;
  state.point = -1;
  state.dirty = false;
  state.undo = [];
}

/* --------------------------------- render --------------------------------- */

function renderLogin() {
  clear(root);
  root.className = 'login-wrap';
  root.append(
    h(
      'div',
      { class: 'login-card' },
      h('h1', {}, 'Parent access needed'),
      h('p', {}, 'Unlock the parent page first, then come back here to edit the strokes.'),
      h(
        'a',
        { class: 'btn primary block', href: '/admin', style: { textDecoration: 'none' } },
        'Open parent page',
      ),
      h(
        'button',
        { class: 'btn ghost block', style: { marginTop: '8px' }, onclick: () => location.reload() },
        'I have unlocked it — reload',
      ),
    ),
  );
}

function render() {
  state.ro?.disconnect();
  state.ro = null;

  clear(root);
  root.className = 'editor';

  const status = h('span', { class: 'status-pill' }, 'Saved');
  state.statusEl = status;

  const header = h(
    'header',
    { class: 'editor-head' },
    h(
      'div',
      { class: 'brand' },
      h('div', { class: 'brand-mark' }, '写'),
      h(
        'div',
        {},
        h('h1', {}, 'Stroke editor'),
        h('p', {}, 'Drag points, split or add strokes, then save.'),
      ),
    ),
    h(
      'div',
      { class: 'editor-actions' },
      status,
      h('button', { class: 'btn primary sm', onclick: save }, 'Save strokes'),
      h('a', { class: 'btn ghost sm', href: '/', style: { textDecoration: 'none' } }, 'Open app'),
      h('a', { class: 'btn ghost sm', href: '/admin', style: { textDecoration: 'none' } }, 'Parent'),
    ),
  );

  state.gridEl = h('div', { class: 'char-grid' });
  const left = h(
    'div',
    { class: 'panel-box' },
    h('h2', {}, 'Character'),
    state.gridEl,
    h('div', { class: 'point-info' }, 'Orange dot = custom strokes saved for this character.'),
  );

  const canvas = h('canvas');
  const wrap = h('div', { class: 'canvas-wrap' }, canvas);
  const center = h(
    'div',
    { class: 'canvas-card' },
    wrap,
    h(
      'div',
      { class: 'editor-hint' },
      h('span', {}, 'Drag a point. Double-click a line to add a point.'),
      h(
        'label',
        { style: { display: 'flex', gap: '6px', alignItems: 'center' } },
        h('input', {
          type: 'checkbox',
          checked: state.showGhost,
          onchange: (e) => {
            state.showGhost = e.target.checked;
            draw();
          },
        }),
        'Show font ghost',
      ),
    ),
  );

  state.panelEl = h('div', { class: 'panel-box' });
  const right = state.panelEl;

  root.append(header, h('div', { class: 'editor-grid' }, left, center, right));

  state.canvas = canvas;
  state.ctx = canvas.getContext('2d');
  setupPointer(canvas);
  state.ro = new ResizeObserver(() => draw());
  state.ro.observe(wrap);
  renderPanels();
  requestAnimationFrame(() => draw());
}

function renderPanels() {
  renderCharGrid();
  renderStrokePanel();
  if (state.statusEl) {
    state.statusEl.textContent = state.dirty ? 'Unsaved changes' : 'Saved';
    state.statusEl.classList.toggle('dirty', state.dirty);
  }
}

function renderCharGrid() {
  if (!state.gridEl) return;
  clear(state.gridEl);
  for (const ch of CHARS) {
    state.gridEl.append(
      h(
        'button',
        {
          class: `char-btn${ch === state.char ? ' active' : ''}`,
          type: 'button',
          onclick: () => {
            if (state.dirty && !confirm('Discard unsaved changes?')) return;
            loadChar(ch);
            render();
          },
        },
        ch,
        state.config.strokes[ch] ? h('span', { class: 'dot' }) : null,
      ),
    );
  }
}

function renderStrokePanel() {
  if (!state.panelEl) return;
  clear(state.panelEl);
  state.panelEl.append(h('h2', {}, 'Strokes'));

  if (!state.strokes.length) {
    state.panelEl.append(h('div', { class: 'point-info' }, 'No strokes. Use “Add stroke”.'));
  }

  state.strokes.forEach((stroke, index) => {
    state.panelEl.append(
      h(
        'div',
        {
          class: `stroke-row${index === state.selected ? ' active' : ''}`,
          onclick: () => selectStroke(index),
        },
        h('span', { class: 'swatch', style: { background: COLORS[index % COLORS.length] } }),
        h(
          'span',
          { class: 's-label' },
          `Stroke ${index + 1} · ${stroke.length === 1 ? 'dot' : `${stroke.length} pts`}`,
        ),
        h(
          'button',
          {
            class: 'mini',
            type: 'button',
            title: 'Move up',
            onclick: (e) => {
              e.stopPropagation();
              moveStroke(index, -1);
            },
          },
          '↑',
        ),
        h(
          'button',
          {
            class: 'mini',
            type: 'button',
            title: 'Move down',
            onclick: (e) => {
              e.stopPropagation();
              moveStroke(index, 1);
            },
          },
          '↓',
        ),
        h(
          'button',
          {
            class: 'mini',
            type: 'button',
            title: 'Reverse direction',
            onclick: (e) => {
              e.stopPropagation();
              reverseStroke(index);
            },
          },
          '⇄',
        ),
        h(
          'button',
          {
            class: 'mini',
            type: 'button',
            title: 'Delete stroke',
            onclick: (e) => {
              e.stopPropagation();
              deleteStroke(index);
            },
          },
          '✕',
        ),
      ),
    );
  });

  const tools = h('div', { class: 'tool-grid' });
  tools.append(
    h('button', { class: 'btn sm', onclick: addStroke }, '+ Stroke'),
    h('button', { class: 'btn sm', onclick: addDot }, '● Dot'),
    h('button', { class: 'btn sm', onclick: addPoint }, '+ Point'),
    h('button', { class: 'btn sm', onclick: deletePoint }, '− Point'),
    h('button', { class: 'btn sm', onclick: splitStroke }, 'Split here'),
    h('button', { class: 'btn sm', onclick: useAuto }, 'Use auto fit'),
    h('button', { class: 'btn sm', onclick: undo }, 'Undo'),
  );
  state.panelEl.append(tools);

  const p = state.point >= 0 ? state.strokes[state.selected]?.[state.point] : null;
  state.panelEl.append(
    h(
      'div',
      { class: 'point-info' },
      p
        ? `Point ${state.point + 1}: x ${p[0].toFixed(3)}, y ${p[1].toFixed(3)} · arrow keys nudge · Delete removes`
        : state.strokes[state.selected]?.length === 1
          ? 'Dot stroke: drag its single point, or press “● Dot” to turn it back into a line.'
          : 'Select a point to edit. Double-click a line to insert one.',
    ),
  );
}

/* ---------------------------------- draw ---------------------------------- */

function setupCanvasSize() {
  const canvas = state.canvas;
  const rect = canvas.getBoundingClientRect();
  const cssW = Math.max(1, rect.width);
  const cssH = Math.max(1, rect.height);
  const dpr = Math.min(3, window.devicePixelRatio || 1);
  const width = Math.round(cssW * dpr);
  const height = Math.round(cssH * dpr);
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  state.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx: state.ctx, cssW, cssH };
}

function draw() {
  if (!state.canvas) return;
  const { ctx, cssW, cssH } = setupCanvasSize();
  ctx.clearRect(0, 0, cssW, cssH);

  const pad = 22;
  const size = Math.min(cssW, cssH) - pad * 2;
  const ox = (cssW - size) / 2;
  const oy = (cssH - size) / 2;
  state.box = { x: ox, y: oy, size };

  ctx.save();
  ctx.beginPath();
  const r = size * 0.04;
  ctx.moveTo(ox + r, oy);
  ctx.arcTo(ox + size, oy, ox + size, oy + size, r);
  ctx.arcTo(ox + size, oy + size, ox, oy + size, r);
  ctx.arcTo(ox, oy + size, ox, oy, r);
  ctx.arcTo(ox, oy, ox + size, oy, r);
  ctx.closePath();
  ctx.fillStyle = '#fffdf8';
  ctx.fill();
  ctx.strokeStyle = 'rgba(31,42,55,0.08)';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();

  drawGrid(ctx, ox, oy, size);

  if (state.showGhost) drawGhost(ctx, ox, oy, size);
  state.strokes.forEach((stroke, index) => drawStroke(ctx, stroke, index, ox, oy, size));
}

function drawGrid(ctx, ox, oy, size) {
  const m = latinMetrics();
  ctx.save();
  ctx.lineWidth = 1;
  for (const at of [m.capTop, m.xTop, m.descBottom]) {
    ctx.strokeStyle = 'rgba(99,116,139,0.25)';
    ctx.setLineDash([size * 0.012, size * 0.014]);
    ctx.beginPath();
    ctx.moveTo(ox + size * 0.04, oy + at * size);
    ctx.lineTo(ox + size * 0.96, oy + at * size);
    ctx.stroke();
  }
  ctx.setLineDash([]);
  ctx.strokeStyle = 'rgba(99,116,139,0.4)';
  ctx.beginPath();
  ctx.moveTo(ox + size * 0.04, oy + m.baseline * size);
  ctx.lineTo(ox + size * 0.96, oy + m.baseline * size);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(99,116,139,0.2)';
  ctx.setLineDash([size * 0.012, size * 0.014]);
  ctx.beginPath();
  ctx.moveTo(ox + size / 2, oy + size * 0.04);
  ctx.lineTo(ox + size / 2, oy + size * 0.96);
  ctx.stroke();
  ctx.restore();
}

function drawGhost(ctx, ox, oy, size) {
  ctx.save();
  ctx.font = `400 ${size * LATIN_SIZE_RATIO}px ${LATIN_FAMILY}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  const x = ox + size / 2;
  const y = oy + size * LATIN_BASELINE;
  ctx.globalAlpha = 0.16;
  ctx.fillStyle = '#475569';
  ctx.fillText(state.char, x, y);
  ctx.globalAlpha = 0.3;
  ctx.strokeStyle = '#475569';
  ctx.lineWidth = Math.max(1, size * 0.002);
  ctx.strokeText(state.char, x, y);
  ctx.restore();
}

function strokePath(ctx, points, ox, oy, size) {
  const pts = points.map(([u, v]) => [ox + u * size, oy + v * size]);
  ctx.beginPath();
  if (!pts.length) return;
  ctx.moveTo(pts[0][0], pts[0][1]);
  if (pts.length === 2) {
    ctx.lineTo(pts[1][0], pts[1][1]);
    return;
  }
  for (let i = 1; i < pts.length - 1; i += 1) {
    const mx = (pts[i][0] + pts[i + 1][0]) / 2;
    const my = (pts[i][1] + pts[i + 1][1]) / 2;
    ctx.quadraticCurveTo(pts[i][0], pts[i][1], mx, my);
  }
  const last = pts[pts.length - 1];
  const prev = pts[pts.length - 2];
  ctx.quadraticCurveTo(prev[0], prev[1], last[0], last[1]);
}

function drawStroke(ctx, stroke, index, ox, oy, size) {
  const color = COLORS[index % COLORS.length];
  const active = index === state.selected;
  ctx.save();

  if (stroke.length === 1) {
    const [u, v] = stroke[0];
    const x = ox + u * size;
    const y = oy + v * size;
    const r = size * 0.026;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.lineWidth = Math.max(2, size * 0.005);
    ctx.strokeStyle = active ? '#4f46e5' : '#fff';
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.font = `700 ${Math.round(size * 0.024)}px ${getComputedStyle(document.body).fontFamily}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(index + 1), x, y + size * 0.001);
    ctx.restore();
    return;
  }

  ctx.strokeStyle = color;
  ctx.lineWidth = active ? size * 0.009 : size * 0.006;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  strokePath(ctx, stroke, ox, oy, size);
  ctx.stroke();

  // direction arrow
  if (stroke.length > 1) {
    const p = pointAt(stroke, 0.55);
    const p2 = pointAt(stroke, 0.58);
    drawArrow(ctx, ox + p[0] * size, oy + p[1] * size, ox + p2[0] * size, oy + p2[1] * size, size * 0.012, color);
  }

  // handles
  stroke.forEach(([u, v], pointIndex) => {
    const x = ox + u * size;
    const y = oy + v * size;
    const selected = active && pointIndex === state.point;
    ctx.beginPath();
    ctx.arc(x, y, selected ? size * 0.018 : size * 0.012, 0, Math.PI * 2);
    ctx.fillStyle = selected ? '#fff' : color;
    ctx.fill();
    ctx.lineWidth = selected ? size * 0.006 : size * 0.003;
    ctx.strokeStyle = selected ? '#4f46e5' : '#fff';
    ctx.stroke();
  });

  // start dot + number
  const [su, sv] = stroke[0];
  const sx = ox + su * size;
  const sy = oy + sv * size;
  ctx.beginPath();
  ctx.arc(sx, sy, size * 0.018, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.lineWidth = Math.max(1, size * 0.004);
  ctx.strokeStyle = '#fff';
  ctx.stroke();
  ctx.fillStyle = '#fff';
  ctx.font = `700 ${Math.round(size * 0.02)}px ${getComputedStyle(document.body).fontFamily}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(index + 1), sx, sy + size * 0.001);
  ctx.restore();
}

function drawArrow(ctx, x1, y1, x2, y2, size, color) {
  const angle = Math.atan2(y2 - y1, x2 - x1);
  ctx.save();
  ctx.translate(x2, y2);
  ctx.rotate(angle);
  ctx.beginPath();
  ctx.moveTo(size, 0);
  ctx.lineTo(-size, size * 0.75);
  ctx.lineTo(-size, -size * 0.75);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.restore();
}

function pointAt(points, t) {
  let total = 0;
  const lengths = [];
  for (let i = 1; i < points.length; i += 1) {
    const d = Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
    lengths.push(d);
    total += d;
  }
  if (total < 1e-9) return points[0];
  let target = t * total;
  for (let i = 1; i < points.length; i += 1) {
    const d = lengths[i - 1];
    if (target <= d) {
      const f = d ? target / d : 0;
      return [
        points[i - 1][0] + (points[i][0] - points[i - 1][0]) * f,
        points[i - 1][1] + (points[i][1] - points[i - 1][1]) * f,
      ];
    }
    target -= d;
  }
  return points[points.length - 1];
}

/* -------------------------------- pointer --------------------------------- */

function setupPointer(canvas) {
  canvas.addEventListener('pointerdown', (event) => {
    if (!state.box) return;
    event.preventDefault();
    const [u, v] = toNorm(event);
    const point = findPoint(u, v);
    if (point) {
      state.selected = point.stroke;
      state.point = point.point;
      pushUndo();
      state.drag = { id: event.pointerId, stroke: point.stroke, point: point.point };
      try {
        canvas.setPointerCapture(event.pointerId);
      } catch {
        /* ignore */
      }
      renderPanels();
      draw();
      return;
    }
    const segment = findSegment(u, v);
    if (segment) {
      state.selected = segment.stroke;
      state.point = -1;
      renderPanels();
      draw();
    }
  });

  canvas.addEventListener('pointermove', (event) => {
    if (!state.drag || event.pointerId !== state.drag.id) return;
    event.preventDefault();
    const [u, v] = toNorm(event);
    const stroke = state.strokes[state.drag.stroke];
    if (!stroke) return;
    stroke[state.drag.point] = [clamp01(u), clamp01(v)];
    state.dirty = true;
    state.statusEl.textContent = 'Unsaved changes';
    state.statusEl.classList.add('dirty');
    draw();
    updatePointInfo();
  });

  const end = (event) => {
    if (state.drag && event.pointerId === state.drag.id) {
      state.drag = null;
      renderPanels();
      draw();
    }
  };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);

  canvas.addEventListener('dblclick', (event) => {
    if (!state.box) return;
    const segment = findSegment(...toNorm(event));
    if (!segment) return;
    const [u, v] = toNorm(event);
    pushUndo();
    state.strokes[segment.stroke].splice(segment.index + 1, 0, [clamp01(u), clamp01(v)]);
    state.selected = segment.stroke;
    state.point = segment.index + 1;
    state.dirty = true;
    renderPanels();
    draw();
  });
}

function toNorm(event) {
  const rect = state.canvas.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;
  const { x: ox, y: oy, size } = state.box;
  return [(x - ox) / size, (y - oy) / size];
}

function findPoint(u, v) {
  const size = state.box.size;
  for (let i = 0; i < state.strokes.length; i += 1) {
    const stroke = state.strokes[i];
    for (let j = 0; j < stroke.length; j += 1) {
      const d = Math.hypot(u - stroke[j][0], v - stroke[j][1]) * size;
      if (d < 16) return { stroke: i, point: j };
    }
  }
  return null;
}

function findSegment(u, v) {
  const size = state.box.size;
  let best = null;
  let bestDistance = 9;
  for (let i = 0; i < state.strokes.length; i += 1) {
    const stroke = state.strokes[i];
    for (let j = 0; j < stroke.length - 1; j += 1) {
      const [ax, ay] = stroke[j];
      const [bx, by] = stroke[j + 1];
      const dx = bx - ax;
      const dy = by - ay;
      const lengthSq = dx * dx + dy * dy || 1;
      let t = ((u - ax) * dx + (v - ay) * dy) / lengthSq;
      t = Math.max(0, Math.min(1, t));
      const distance = Math.hypot(u - (ax + dx * t), v - (ay + dy * t)) * size;
      if (distance < bestDistance) {
        bestDistance = distance;
        best = { stroke: i, index: j };
      }
    }
  }
  return best;
}

/* ---------------------------------- tools --------------------------------- */

function selectStroke(index) {
  state.selected = index;
  state.point = -1;
  renderPanels();
  draw();
}

function moveStroke(index, direction) {
  const target = index + direction;
  if (target < 0 || target >= state.strokes.length) return;
  pushUndo();
  const [stroke] = state.strokes.splice(index, 1);
  state.strokes.splice(target, 0, stroke);
  state.selected = target;
  state.point = -1;
  state.dirty = true;
  renderPanels();
  draw();
}

function reverseStroke(index) {
  pushUndo();
  state.strokes[index].reverse();
  state.selected = index;
  state.point = -1;
  state.dirty = true;
  renderPanels();
  draw();
}

function deleteStroke(index) {
  if (state.strokes.length <= 1) {
    toast('Keep at least one stroke');
    return;
  }
  pushUndo();
  state.strokes.splice(index, 1);
  state.selected = Math.max(0, Math.min(state.selected, state.strokes.length - 1));
  state.point = -1;
  state.dirty = true;
  renderPanels();
  draw();
}

function addStroke() {
  pushUndo();
  state.strokes.push([
    [0.35, 0.5],
    [0.65, 0.5],
  ]);
  state.selected = state.strokes.length - 1;
  state.point = -1;
  state.dirty = true;
  renderPanels();
  draw();
}

function addDot() {
  const stroke = state.strokes[state.selected];
  if (!stroke) {
    toast('Select or add a stroke first');
    return;
  }
  pushUndo();
  if (stroke.length === 1) {
    // Turn the dot back into a short horizontal stroke.
    const [u, v] = stroke[0];
    state.strokes[state.selected] = [
      [clamp01(u - 0.05), v],
      [clamp01(u + 0.05), v],
    ];
    state.point = -1;
  } else {
    let x = 0;
    let y = 0;
    for (const [u, v] of stroke) {
      x += u;
      y += v;
    }
    state.strokes[state.selected] = [[clamp01(x / stroke.length), clamp01(y / stroke.length)]];
    state.point = 0;
  }
  state.dirty = true;
  renderPanels();
  draw();
}

function addPoint() {
  const stroke = state.strokes[state.selected];
  if (!stroke) return;
  if (stroke.length === 1) {
    toast('A dot has one point — press “● Dot” first to make it a line');
    return;
  }
  pushUndo();
  const index = state.point;
  if (index >= 0 && index < stroke.length - 1) {
    const a = stroke[index];
    const b = stroke[index + 1];
    stroke.splice(index + 1, 0, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]);
    state.point = index + 1;
  } else {
    const last = stroke[stroke.length - 1];
    const prev = stroke[stroke.length - 2] || [last[0] - 0.05, last[1]];
    const dx = last[0] - prev[0];
    const dy = last[1] - prev[1];
    stroke.push([clamp01(last[0] + dx * 0.5), clamp01(last[1] + dy * 0.5)]);
    state.point = stroke.length - 1;
  }
  state.dirty = true;
  renderPanels();
  draw();
}

function deletePoint() {
  const stroke = state.strokes[state.selected];
  if (!stroke || state.point < 0) {
    toast('Select a point first');
    return;
  }
  if (stroke.length === 1) {
    toast('A dot has one point — delete the whole stroke instead');
    return;
  }
  if (stroke.length <= 2) {
    toast('A stroke needs at least two points');
    return;
  }
  pushUndo();
  stroke.splice(state.point, 1);
  state.point = Math.min(state.point, stroke.length - 1);
  state.dirty = true;
  renderPanels();
  draw();
}

function splitStroke() {
  const stroke = state.strokes[state.selected];
  if (!stroke || stroke.length < 3 || state.point <= 0 || state.point >= stroke.length - 1) {
    toast('Select a middle point to split there');
    return;
  }
  pushUndo();
  const first = stroke.slice(0, state.point + 1);
  const second = stroke.slice(state.point);
  state.strokes.splice(state.selected, 1, first, second);
  state.selected += 1;
  state.point = 0;
  state.dirty = true;
  renderPanels();
  draw();
}

function useAuto() {
  const auto = autoLatinStrokes(state.char) || [];
  pushUndo();
  state.strokes = clone(auto);
  state.selected = 0;
  state.point = -1;
  state.dirty = true;
  renderPanels();
  draw();
}

function undo() {
  if (!state.undo.length) return;
  state.strokes = state.undo.pop();
  state.selected = Math.min(state.selected, state.strokes.length - 1);
  state.point = -1;
  state.dirty = true;
  renderPanels();
  draw();
}

function updatePointInfo() {
  const node = state.panelEl?.querySelector('.point-info:last-child');
  if (!node) return;
  const p = state.point >= 0 ? state.strokes[state.selected]?.[state.point] : null;
  node.textContent = p
    ? `Point ${state.point + 1}: x ${p[0].toFixed(3)}, y ${p[1].toFixed(3)} · arrow keys nudge · Delete removes`
    : 'Select a point to edit. Double-click a line to insert one.';
}

/* ---------------------------------- save ---------------------------------- */

async function save() {
  const auto = autoLatinStrokes(state.char);
  const same = JSON.stringify(state.strokes) === JSON.stringify(auto);
  if (same) delete state.config.strokes[state.char];
  else state.config.strokes[state.char] = clone(state.strokes);

  state.statusEl.textContent = 'Saving…';
  state.statusEl.classList.remove('dirty');
  try {
    const res = await fetch('/api/admin/config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(state.config),
    });
    if (res.status === 401) {
      state.admin = false;
      toast('Session expired — unlock the parent page again');
      renderLogin();
      return;
    }
    if (!res.ok) throw new Error('save');
    const data = await res.json();
    state.config = data.config;
    state.config.strokes = state.config.strokes || {};
    state.dirty = false;
    renderPanels();
    toast('Saved — reload the practice app to see it');
  } catch {
    state.statusEl.textContent = 'Save failed';
    state.statusEl.classList.add('dirty');
    toast('Could not save');
  }
}

/* -------------------------------- keyboard -------------------------------- */

document.addEventListener('keydown', (event) => {
  const tag = document.activeElement?.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
  if (event.metaKey || event.ctrlKey) {
    if (event.key.toLowerCase() === 'z') {
      event.preventDefault();
      undo();
    }
    return;
  }
  const point = state.strokes[state.selected]?.[state.point];
  if (!point) return;
  const step = event.shiftKey ? 0.01 : 0.002;
  const moves = {
    ArrowLeft: [-step, 0],
    ArrowRight: [step, 0],
    ArrowUp: [0, -step],
    ArrowDown: [0, step],
  };
  if (moves[event.key]) {
    event.preventDefault();
    pushUndo();
    point[0] = clamp01(point[0] + moves[event.key][0]);
    point[1] = clamp01(point[1] + moves[event.key][1]);
    state.dirty = true;
    draw();
    updatePointInfo();
  } else if (event.key === 'Delete' || event.key === 'Backspace') {
    event.preventDefault();
    deletePoint();
  }
});

boot();
