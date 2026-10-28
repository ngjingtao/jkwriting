import { pathLength } from './scoring.js';
import { LATIN_SIZE_RATIO, LATIN_BASELINE, LATIN_FAMILY, latinMetrics } from './fontfit.js';

const ACCENT = '#4f46e5';
const RED = '#ef4444';
const GREEN = '#16a34a';
const AMBER = '#d97706';
const GHOST = '#475569';
const GRID = 'rgba(99, 116, 139, 0.32)';
const GRID_STRONG = 'rgba(99, 116, 139, 0.48)';

function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function pointAt(points, t) {
  if (points.length === 1) return points[0];
  const total = pathLength(points);
  if (total < 1e-9) return points[0];
  let target = Math.min(1, Math.max(0, t)) * total;
  for (let i = 1; i < points.length; i += 1) {
    const seg = Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
    if (target <= seg) {
      const f = seg < 1e-9 ? 0 : target / seg;
      return [
        points[i - 1][0] + (points[i][0] - points[i - 1][0]) * f,
        points[i - 1][1] + (points[i][1] - points[i - 1][1]) * f,
      ];
    }
    target -= seg;
  }
  return points[points.length - 1];
}

export class WritingSurface {
  constructor(canvas, options = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.opts = {
      guideOpacity: 0.16,
      inkWidth: 0.055,
      inkColor: '#1f2937',
      showNumbers: true,
      gridHanzi: 'tian',
      gridLatin: 'lines',
      penOnly: false,
      ...options,
    };
    this.unit = null;
    this.mode = 'trace';
    this.ink = [];
    this.result = null;
    this.hintIndex = -1;
    this.anim = null;
    this.done = false;
    this.flashAt = 0;
    this.onStrokeEnd = null;
    this.onStrokeStart = null;
    this.dpr = Math.min(3, window.devicePixelRatio || 1);
    this.box = { x: 0, y: 0, size: 1 };
    this.cssW = 1;
    this.cssH = 1;
    this._drawing = null;
    this._hasPen = false;
    this._lastPen = 0;
    this._raf = 0;
    this._hintTimer = 0;
    this._font = getComputedStyle(document.body).fontFamily;
    this._latinFamily = LATIN_FAMILY;
    if (document.fonts?.load) {
      document.fonts
        .load(`400 100px ${LATIN_FAMILY}`)
        .then(() => this.redraw())
        .catch(() => {});
    }

    this._resize = this._resize.bind(this);
    this._loop = this._loop.bind(this);
    this._ro = new ResizeObserver(this._resize);
    this._ro.observe(canvas.parentElement || canvas);
    this._bind();
    this._resize();
  }

  destroy() {
    this._ro.disconnect();
    cancelAnimationFrame(this._raf);
    clearInterval(this._hintTimer);
    this._raf = 0;
    this._hintTimer = 0;
  }

  configure(opts = {}) {
    this.opts = { ...this.opts, ...opts };
    this.redraw();
  }

  /* ------------------------------- geometry ------------------------------ */

  _resize() {
    const host = this.canvas.parentElement;
    if (!host) return;
    const rect = host.getBoundingClientRect();
    const w = Math.max(1, Math.round(rect.width));
    const h = Math.max(1, Math.round(rect.height));
    if (w === this.cssW && h === this.cssH && this.canvas.width) return;

    this.dpr = Math.min(3, window.devicePixelRatio || 1);
    this.cssW = w;
    this.cssH = h;
    this.canvas.width = Math.round(w * this.dpr);
    this.canvas.height = Math.round(h * this.dpr);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;

    const size = Math.min(w, h) * 0.965;
    this.box = { x: (w - size) / 2, y: (h - size) / 2, size };
    this.redraw();
  }

  get px() {
    return this.box.size;
  }

  _toPx(point) {
    return [
      this.box.x + point[0] * this.box.size,
      this.box.y + point[1] * this.box.size,
    ];
  }

  _toNorm(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    return [
      (clientX - rect.left - this.box.x) / this.box.size,
      (clientY - rect.top - this.box.y) / this.box.size,
    ];
  }

  /* -------------------------------- public ------------------------------- */

  setUnit(unit, { mode = 'trace' } = {}) {
    this.unit = unit;
    this.mode = mode;
    this.ink = [];
    this.result = null;
    this.done = false;
    this.flashAt = 0;
    this.hintIndex = mode === 'trace' ? 0 : -1;
    this.anim = null;
    this.redraw();
    this._syncLoop();
  }

  setMode(mode) {
    this.mode = mode;
    this.result = null;
    this.done = false;
    this.clearInk();
    this.hintIndex = mode === 'trace' ? 0 : -1;
    this._syncLoop();
  }

  setHint(index) {
    this.hintIndex = index;
    this.done = index < 0;
    if (this.unit && index >= this.unit.strokes.length) {
      this.hintIndex = -1;
      this.done = true;
    }
    this._syncLoop();
    this.redraw();
  }

  setNumbers(on) {
    this.opts.showNumbers = on;
    this.redraw();
  }

  clearInk() {
    this.ink = [];
    this.result = null;
    this.done = false;
    this.redraw();
  }

  undo() {
    if (this.result) {
      this.result = null;
      this.ink.forEach((rec) => delete rec.color);
    }
    this.ink.pop();
    this.done = false;
    this.redraw();
    return this.ink.length;
  }

  getInkStrokes() {
    return this.ink.map((rec) => rec.points.map((p) => [p.x, p.y]));
  }

  hasInk() {
    return this.ink.length > 0;
  }

  applyResult(result) {
    this.result = result;
    this.done = true;
    for (const rec of this.ink) rec.color = null;
    for (const m of result.strokes) {
      const rec = this.ink[m.userIndex];
      if (!rec) continue;
      rec.color = m.score >= 0.78 ? GREEN : m.score >= 0.55 ? AMBER : RED;
    }
    for (const idx of result.extra) {
      const rec = this.ink[idx];
      if (rec) rec.color = '#64748b';
    }
    this.hintIndex = -1;
    this._syncLoop();
    this.redraw();
  }

  clearResult() {
    this.result = null;
    for (const rec of this.ink) delete rec.color;
    this.redraw();
  }

  rejectStroke(rec) {
    rec.color = RED;
    rec.rejecting = true;
    this.flashAt = performance.now();
    this.redraw();
    setTimeout(() => {
      this.ink = this.ink.filter((r) => r !== rec);
      this.redraw();
    }, 420);
  }

  playStrokeHint(index = this.hintIndex, ms = 1000) {
    if (!this.unit || index < 0 || index >= this.unit.strokes.length) return Promise.resolve();
    this.hintIndex = index;
    this.anim = {
      type: 'one',
      index,
      start: performance.now(),
      duration: ms,
      resolve: null,
    };
    const done = new Promise((resolve) => {
      this.anim.resolve = resolve;
    });
    this._syncLoop();
    return done;
  }

  playDemo() {
    if (!this.unit) return Promise.resolve();
    const now = performance.now();
    let cursor = 0;
    const windows = this.unit.strokes.map((s) => {
      const len = pathLength(s.median);
      const dur = Math.min(950, Math.max(240, 240 + len * 800));
      const win = { start: cursor, end: cursor + dur };
      cursor += dur + 110;
      return win;
    });
    this.hintIndex = -1;
    this.anim = {
      type: 'demo',
      start: now,
      windows,
      total: cursor,
      resolve: null,
    };
    const done = new Promise((resolve) => {
      this.anim.resolve = resolve;
    });
    this._syncLoop();
    return done;
  }

  stopAnimation() {
    if (this.anim?.resolve) this.anim.resolve();
    this.anim = null;
    this._syncLoop();
    this.redraw();
  }

  /* -------------------------------- events -------------------------------- */

  _bind() {
    const c = this.canvas;
    c.addEventListener('pointerdown', (e) => this._down(e));
    c.addEventListener('pointermove', (e) => this._move(e));
    c.addEventListener('pointerup', (e) => this._up(e));
    c.addEventListener('pointercancel', (e) => this._up(e));
    c.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  _acceptPointer(e) {
    if (e.pointerType === 'pen') {
      this._hasPen = true;
      this._lastPen = performance.now();
      return true;
    }
    if (this.opts.penOnly) return false;
    if (e.pointerType === 'mouse') return true;
    if (this._hasPen && performance.now() - this._lastPen < 2500) return false;
    if (e.pointerType === 'touch' && (e.width || 0) > 42) return false;
    return true;
  }

  _down(e) {
    if (!this.unit || this.done || this.anim?.type === 'demo') return;
    if (!this._acceptPointer(e)) return;
    if (this._drawing) return;
    e.preventDefault();
    if (this.anim) this.stopAnimation();

    const [x, y] = this._toNorm(e.clientX, e.clientY);
    const rec = {
      points: [{ x, y, p: e.pressure || 0.5 }],
      color: null,
      id: e.pointerId,
    };
    this._drawing = rec;
    this.ink.push(rec);
    this.result = null;
    try {
      this.canvas.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    this.onStrokeStart?.(rec);
    this.redraw();
  }

  _move(e) {
    if (!this._drawing || e.pointerId !== this._drawing.id) return;
    e.preventDefault();
    const events = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
    let changed = false;
    for (const ev of events.length ? events : [e]) {
      const [x, y] = this._toNorm(ev.clientX, ev.clientY);
      const pts = this._drawing.points;
      const last = pts[pts.length - 1];
      const dx = (x - last.x) * this.box.size;
      const dy = (y - last.y) * this.box.size;
      if (dx * dx + dy * dy < 1.4) continue;
      pts.push({ x, y, p: ev.pressure || 0.5 });
      changed = true;
    }
    if (changed) this.redraw();
  }

  _up(e) {
    if (!this._drawing || e.pointerId !== this._drawing.id) return;
    const rec = this._drawing;
    this._drawing = null;
    try {
      this.canvas.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    if (rec.points.length === 1) {
      rec.points.push({ ...rec.points[0] });
    }
    this.redraw();
    this.onStrokeEnd?.(rec);
  }

  /* -------------------------------- drawing ------------------------------- */

  redraw() {
    const { ctx } = this;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.cssW, this.cssH);
    this._drawPaper(ctx);
    if (!this.unit) return;
    const grid = this.unit.script === 'hanzi' ? this.opts.gridHanzi : this.opts.gridLatin;
    this._drawGrid(ctx, grid);
    if (this.mode !== 'memory') this._drawGhost(ctx);
    const t = performance.now();
    if (this.hintIndex >= 0 && this.mode === 'trace' && !this.anim) this._drawHint(ctx, t);
    this._drawInk(ctx);
    if (this.result) this._drawMissing(ctx);
    if (this.anim) this._drawAnim(ctx, t);
    if (this.mode === 'trace' && this.hintIndex >= 0) this._drawNumbers(ctx);
  }

  _drawPaper(ctx) {
    const { x, y, size } = this.box;
    ctx.save();
    ctx.shadowColor = 'rgba(31,42,55,0.10)';
    ctx.shadowBlur = 22;
    ctx.shadowOffsetY = 8;
    roundRect(ctx, x, y, size, size, size * 0.045);
    ctx.fillStyle = '#fffdf8';
    ctx.fill();
    ctx.restore();
    ctx.save();
    roundRect(ctx, x + 0.5, y + 0.5, size - 1, size - 1, size * 0.045);
    ctx.strokeStyle = 'rgba(31,42,55,0.07)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
  }

  _drawGrid(ctx, style) {
    if (!style || style === 'none') return;
    const { x, y, size } = this.box;
    ctx.save();
    ctx.lineWidth = 1;

    if (this.unit?.script === 'hanzi') {
      ctx.strokeStyle = GRID;
      ctx.setLineDash([size * 0.016, size * 0.016]);
      ctx.beginPath();
      ctx.moveTo(x + size / 2, y + size * 0.04);
      ctx.lineTo(x + size / 2, y + size * 0.96);
      ctx.moveTo(x + size * 0.04, y + size / 2);
      ctx.lineTo(x + size * 0.96, y + size / 2);
      if (style === 'mi') {
        ctx.moveTo(x + size * 0.08, y + size * 0.08);
        ctx.lineTo(x + size * 0.92, y + size * 0.92);
        ctx.moveTo(x + size * 0.92, y + size * 0.08);
        ctx.lineTo(x + size * 0.08, y + size * 0.92);
      }
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.strokeStyle = 'rgba(99,116,139,0.22)';
      ctx.strokeRect(x + size * 0.035, y + size * 0.035, size * 0.93, size * 0.93);
    } else {
      const lines = [
        { at: latinMetrics().capTop, solid: false },
        { at: latinMetrics().xTop, solid: false },
        { at: LATIN_BASELINE, solid: true },
        { at: latinMetrics().descBottom, solid: false },
      ];
      for (const line of lines) {
        ctx.strokeStyle = line.solid ? GRID_STRONG : GRID;
        ctx.setLineDash(line.solid ? [] : [size * 0.02, size * 0.02]);
        ctx.beginPath();
        ctx.moveTo(x + size * 0.04, y + size * line.at);
        ctx.lineTo(x + size * 0.96, y + size * line.at);
        ctx.stroke();
      }
      ctx.setLineDash([]);
    }
    ctx.restore();
  }

  _path2d(stroke) {
    if (stroke._p2d !== undefined) return stroke._p2d;
    let path = null;
    if (stroke.svgPath) {
      try {
        path = new Path2D(stroke.svgPath);
      } catch {
        path = null;
      }
    }
    stroke._p2d = path;
    return path;
  }

  _fillHanzi(ctx, stroke, color, alpha = 1) {
    const path = this._path2d(stroke);
    if (!path) return false;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    ctx.translate(this.box.x, this.box.y + (900 / 1024) * this.box.size);
    ctx.scale(this.box.size / 1024, -this.box.size / 1024);
    ctx.fill(path);
    ctx.restore();
    return true;
  }

  _polyPath(ctx, points) {
    const pts = points.map((p) => this._toPx(p));
    ctx.beginPath();
    if (pts.length === 1) {
      ctx.arc(pts[0][0], pts[0][1], 0.5, 0, Math.PI * 2);
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
  }

  _strokePolyline(ctx, points, width, color, alpha = 1) {
    if (!points.length) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = Math.max(1, width);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    if (points.length === 1) {
      const [px, py] = this._toPx(points[0]);
      ctx.beginPath();
      ctx.arc(px, py, width / 2, 0, Math.PI * 2);
      ctx.fill();
    } else {
      this._polyPath(ctx, points);
      ctx.stroke();
    }
    ctx.restore();
  }

  _drawGhost(ctx) {
    if (!this.unit) return;
    const alpha = this.opts.guideOpacity;
    if (this.unit.script === 'latin') {
      this._drawLatinText(ctx, this.unit.char, GHOST, Math.min(0.65, alpha * 2.4));
      return;
    }
    for (const s of this.unit.strokes) {
      const filled = this._fillHanzi(ctx, s, GHOST, alpha);
      if (!filled) {
        this._strokePolyline(ctx, s.median, this.box.size * this.opts.inkWidth * 0.9, GHOST, alpha);
      }
    }
  }

  _drawLatinText(ctx, text, color, alpha) {
    const size = this.box.size;
    const fontSize = size * LATIN_SIZE_RATIO;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    ctx.font = `400 ${fontSize}px ${this._latinFamily}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(text || '', this.box.x + size / 2, this.box.y + size * LATIN_BASELINE);
    ctx.restore();
  }

  get _isLatin() {
    return this.unit?.script === 'latin';
  }

  _drawHint(ctx, t) {
    const stroke = this.unit?.strokes[this.hintIndex];
    if (!stroke) return;
    const size = this.box.size;
    const pulse = (Math.sin(t / 360) + 1) / 2;
    const flashing = t - this.flashAt < 700;

    ctx.save();
    if (flashing) {
      const filled = this._fillHanzi(ctx, stroke, RED, 0.3 + 0.2 * pulse);
      if (!filled) {
        this._strokePolyline(
          ctx,
          stroke.median,
          size * this.opts.inkWidth * (this._isLatin ? 0.3 : 1),
          RED,
          0.35,
        );
      }
    } else {
      const filled = this._fillHanzi(ctx, stroke, ACCENT, 0.2 + 0.16 * pulse);
      if (!filled) {
        this._strokePolyline(
          ctx,
          stroke.median,
          size * this.opts.inkWidth * (this._isLatin ? 0.34 : 1.02),
          ACCENT,
          0.3 + 0.18 * pulse,
        );
      }
    }
    ctx.restore();

    const pts = stroke.median;
    const color = flashing ? RED : ACCENT;

    ctx.save();
    ctx.setLineDash([size * 0.018, size * 0.022]);
    ctx.strokeStyle = flashing ? 'rgba(239,68,68,0.75)' : 'rgba(79,70,229,0.65)';
    ctx.lineWidth = Math.max(2, size * 0.008);
    this._polyPath(ctx, pts);
    ctx.stroke();
    ctx.restore();

    // moving dot showing direction
    const prog = ((t - this.flashAt) / 1500) % 1;
    const [mx, my] = this._toPx(pointAt(pts, prog));
    ctx.save();
    ctx.beginPath();
    ctx.arc(mx, my, size * 0.014, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.9;
    ctx.fill();
    ctx.restore();

    // arrowhead
    this._drawArrow(ctx, pts, 0.62, color, size);
    this._drawArrow(ctx, pts, 0.35, color, size);

    // start dot with number
    const [sx, sy] = this._toPx(pts[0]);
    const r = size * 0.027 * (0.93 + 0.12 * pulse);
    ctx.save();
    ctx.beginPath();
    ctx.arc(sx, sy, r, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.lineWidth = Math.max(2, size * 0.007);
    ctx.strokeStyle = '#fff';
    ctx.stroke();
    if (this.opts.showNumbers) {
      ctx.fillStyle = '#fff';
      ctx.font = `700 ${Math.round(size * 0.028)}px ${this._font}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(this.hintIndex + 1), sx, sy + size * 0.001);
    }
    ctx.restore();
  }

  _drawArrow(ctx, points, at, color, size) {
    const p = pointAt(points, at);
    const p2 = pointAt(points, Math.min(1, at + 0.03));
    let dx = p2[0] - p[0];
    let dy = p2[1] - p[1];
    const len = Math.hypot(dx, dy);
    if (len < 1e-6) return;
    dx /= len;
    dy /= len;
    const [x, y] = this._toPx(p);
    const s = size * 0.024;
    const nx = -dy;
    const ny = dx;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(x + dx * s, y + dy * s);
    ctx.lineTo(x - dx * s * 0.7 + nx * s * 0.75, y - dy * s * 0.7 + ny * s * 0.75);
    ctx.lineTo(x - dx * s * 0.7 - nx * s * 0.75, y - dy * s * 0.7 - ny * s * 0.75);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
    ctx.restore();
  }

  _drawNumbers(ctx) {
    if (!this.opts.showNumbers || !this.unit) return;
    const size = this.box.size;
    ctx.save();
    ctx.font = `700 ${Math.round(size * 0.022)}px ${this._font}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let i = this.hintIndex + 1; i < this.unit.strokes.length; i += 1) {
      const [x, y] = this._toPx(this.unit.strokes[i].median[0]);
      ctx.beginPath();
      ctx.arc(x, y, size * 0.019, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(79,70,229,0.25)';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = 'rgba(79,70,229,0.55)';
      ctx.fillText(String(i + 1), x, y + size * 0.001);
    }
    ctx.restore();
  }

  _drawInk(ctx) {
    if (!this.ink.length) return;
    const base = this.box.size * this.opts.inkWidth;
    for (const rec of this.ink) {
      const pts = rec.points;
      if (!pts.length) continue;
      ctx.save();
      ctx.strokeStyle = rec.color || this.opts.inkColor;
      ctx.fillStyle = rec.color || this.opts.inkColor;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.globalAlpha = rec.rejecting ? 0.75 : 1;
      if (pts.length === 1) {
        const [x, y] = this._toPx([pts[0].x, pts[0].y]);
        ctx.beginPath();
        ctx.arc(x, y, base / 2, 0, Math.PI * 2);
        ctx.fill();
        continue;
      }
      for (let i = 1; i < pts.length; i += 1) {
        const a = this._toPx([pts[i - 1].x, pts[i - 1].y]);
        const b = this._toPx([pts[i].x, pts[i].y]);
        const pressure = Math.min(1.15, Math.max(0.35, (pts[i].p + pts[i - 1].p) / 2));
        ctx.lineWidth = Math.max(1, base * (0.62 + 0.72 * pressure));
        ctx.beginPath();
        ctx.moveTo(a[0], a[1]);
        ctx.lineTo(b[0], b[1]);
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  _drawMissing(ctx) {
    if (!this.result?.missing?.length) return;
    for (const idx of this.result.missing) {
      const s = this.unit.strokes[idx];
      const filled = this._fillHanzi(ctx, s, RED, 0.12);
      if (!filled) {
        this._strokePolyline(
          ctx,
          s.median,
          this.box.size * this.opts.inkWidth * (this._isLatin ? 0.55 : 0.9),
          RED,
          0.16,
        );
      }
      ctx.save();
      ctx.setLineDash([this.box.size * 0.014, this.box.size * 0.016]);
      ctx.strokeStyle = 'rgba(239,68,68,0.7)';
      ctx.lineWidth = Math.max(2, this.box.size * 0.006);
      this._polyPath(ctx, s.median);
      ctx.stroke();
      ctx.restore();
    }
  }

  _drawAnim(ctx, t) {
    const anim = this.anim;
    if (!anim) return;
    const size = this.box.size;
    const elapsed = t - anim.start;

    if (anim.type === 'one') {
      const stroke = this.unit.strokes[anim.index];
      const p = Math.min(1, elapsed / anim.duration);
      const partial = partialPoints(stroke.median, p);
      const mul = this._isLatin ? 0.4 : 1;
      const filled = this._fillHanzi(ctx, stroke, ACCENT, 0.16);
      if (!filled) this._strokePolyline(ctx, stroke.median, size * this.opts.inkWidth * 1.05 * mul, ACCENT, 0.16);
      this._strokePolyline(ctx, partial, size * this.opts.inkWidth * 0.95 * mul, ACCENT, 0.95);
      this._drawBrush(ctx, partial);
      if (p >= 1) this._finishAnim();
      return;
    }

    if (anim.type === 'demo') {
      const mul = this._isLatin ? 0.4 : 1;
      for (let i = 0; i < this.unit.strokes.length; i += 1) {
        const win = anim.windows[i];
        const stroke = this.unit.strokes[i];
        if (elapsed >= win.end) {
          const filled = this._fillHanzi(ctx, stroke, ACCENT, 0.2);
          if (!filled) this._strokePolyline(ctx, stroke.median, size * this.opts.inkWidth * mul, ACCENT, 0.2);
          this._strokePolyline(ctx, stroke.median, size * this.opts.inkWidth * 0.9 * mul, ACCENT, 0.95);
        } else if (elapsed >= win.start) {
          const p = (elapsed - win.start) / (win.end - win.start);
          const partial = partialPoints(stroke.median, p);
          const filled = this._fillHanzi(ctx, stroke, ACCENT, 0.05);
          if (!filled) {
            this._strokePolyline(ctx, stroke.median, size * this.opts.inkWidth * 1.05 * mul, ACCENT, 0.08);
          }
          this._strokePolyline(ctx, partial, size * this.opts.inkWidth * 0.95 * mul, ACCENT, 0.95);
          this._drawBrush(ctx, partial);
          // number badge
          const [bx, by] = this._toPx(stroke.median[0]);
          ctx.save();
          ctx.beginPath();
          ctx.arc(bx, by, size * 0.024, 0, Math.PI * 2);
          ctx.fillStyle = ACCENT;
          ctx.fill();
          ctx.fillStyle = '#fff';
          ctx.font = `700 ${Math.round(size * 0.025)}px ${this._font}`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(String(i + 1), bx, by + size * 0.001);
          ctx.restore();
        }
      }
      if (elapsed >= anim.total) this._finishAnim();
    }
  }

  _drawBrush(ctx, partial) {
    if (!partial.length) return;
    const [x, y] = this._toPx(partial[partial.length - 1]);
    const r = this.box.size * 0.02;
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = ACCENT;
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = Math.max(1.5, r * 0.28);
    ctx.stroke();
    ctx.restore();
  }

  _finishAnim() {
    const anim = this.anim;
    this.anim = null;
    if (anim?.resolve) anim.resolve();
    this._syncLoop();
    this.redraw();
  }

  _syncLoop() {
    const wants = Boolean(this.anim) || (this.mode === 'trace' && this.hintIndex >= 0 && !this.done);
    if (wants && !this._raf) {
      this._raf = requestAnimationFrame(this._loop);
    } else if (!wants && this._raf) {
      cancelAnimationFrame(this._raf);
      this._raf = 0;
    }
  }

  _loop(t) {
    this._raf = 0;
    if (!this._lastDraw || t - this._lastDraw > 40) {
      this._lastDraw = t;
      if (this.anim?.type === 'demo' && t - this.anim.start >= this.anim.total) {
        this._finishAnim();
        return;
      }
      if (this.anim?.type === 'one' && t - this.anim.start >= this.anim.duration) {
        this._finishAnim();
        return;
      }
      this.redraw();
    }
    this._syncLoop();
  }
}

function partialPoints(points, t) {
  if (t >= 1) return points;
  const out = [];
  const total = pathLength(points);
  if (total < 1e-9) return points.slice(0, 1);
  let target = Math.max(0, t) * total;
  out.push(points[0]);
  for (let i = 1; i < points.length; i += 1) {
    const seg = Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
    if (target <= seg) {
      const f = seg < 1e-9 ? 0 : target / seg;
      out.push([
        points[i - 1][0] + (points[i][0] - points[i - 1][0]) * f,
        points[i - 1][1] + (points[i][1] - points[i - 1][1]) * f,
      ]);
      return out;
    }
    target -= seg;
    out.push(points[i]);
  }
  return out;
}
