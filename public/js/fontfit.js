// Fits the Hershey stroke skeletons onto the actual Didact Gothic glyphs.
//
// 1. An affine fit aligns the skeleton's box with the font's ink box.
// 2. Each point is then snapped to the real 1-pixel skeleton of the rendered
//    Didact glyph, so curves, junctions and descenders follow the font the
//    child sees (y, g, j, 1, 2, 3, 4, 5, ...).
//
// The result is what both the canvas and the scorer use, so tracing the
// visible letter scores correctly.

import { latinStrokes } from './glyphs.js';
import { glyphField } from './skeleton.js';
import { resample } from './scoring.js';

export const LATIN_SIZE_RATIO = 0.86;
export const LATIN_BASELINE = 0.765;
export const LATIN_FAMILY = "'Didact Gothic', 'Nunito', sans-serif";

const cache = new Map();
let ctx = null;
let fontReady = null;
let metricsCache = null;

function context() {
  if (!ctx) {
    const canvas = document.createElement('canvas');
    canvas.width = 8;
    canvas.height = 8;
    ctx = canvas.getContext('2d');
  }
  return ctx;
}

/** Resolve once the Didact face is ready (measureText would otherwise use a fallback). */
export function ensureLatinFont() {
  if (!fontReady) {
    fontReady = (document.fonts?.load
      ? document.fonts.load(`400 100px ${LATIN_FAMILY}`)
      : Promise.resolve()
    )
      .then(() => {
        metricsCache = null;
        cache.clear();
      })
      .catch(() => {});
  }
  return fontReady;
}

function computeMetrics() {
  const measure = context();
  measure.font = `400 100px ${LATIN_FAMILY}`;
  measure.textAlign = 'center';
  const cap = (measure.measureText('H').actualBoundingBoxAscent / 100) * LATIN_SIZE_RATIO;
  const xHeight = (measure.measureText('x').actualBoundingBoxAscent / 100) * LATIN_SIZE_RATIO;
  const descender = (measure.measureText('g').actualBoundingBoxDescent / 100) * LATIN_SIZE_RATIO;
  return {
    baseline: LATIN_BASELINE,
    capTop: LATIN_BASELINE - cap,
    xTop: LATIN_BASELINE - xHeight,
    descBottom: LATIN_BASELINE + descender,
  };
}

/** The four-line guide positions, taken from the Didact metrics. */
export function latinMetrics() {
  if (metricsCache) return metricsCache;
  const measured = computeMetrics();
  if (document.fonts?.check?.(`400 100px ${LATIN_FAMILY}`)) metricsCache = measured;
  return measured;
}

function affineFit(ch, raw) {
  const measure = context();
  measure.font = `400 100px ${LATIN_FAMILY}`;
  measure.textAlign = 'center';
  const metrics = measure.measureText(ch);

  const left = 0.5 - (metrics.actualBoundingBoxLeft / 100) * LATIN_SIZE_RATIO;
  const right = 0.5 + (metrics.actualBoundingBoxRight / 100) * LATIN_SIZE_RATIO;
  const top = LATIN_BASELINE - (metrics.actualBoundingBoxAscent / 100) * LATIN_SIZE_RATIO;
  const bottom = LATIN_BASELINE + (metrics.actualBoundingBoxDescent / 100) * LATIN_SIZE_RATIO;

  const points = raw.flat();
  const minX = Math.min(...points.map((p) => p[0]));
  const maxX = Math.max(...points.map((p) => p[0]));
  const minY = Math.min(...points.map((p) => p[1]));
  const maxY = Math.max(...points.map((p) => p[1]));

  const scaleX = (right - left) / (maxX - minX || 1);
  const upScale = (LATIN_BASELINE - top) / (LATIN_BASELINE - minY || 1);
  const downScale =
    maxY - LATIN_BASELINE > 1e-4 ? (bottom - LATIN_BASELINE) / (maxY - LATIN_BASELINE) : 1;

  return raw.map((stroke) =>
    stroke.map(([x, y]) => [
      left + (x - minX) * scaleX,
      y <= LATIN_BASELINE
        ? LATIN_BASELINE + (y - LATIN_BASELINE) * upScale
        : LATIN_BASELINE + (y - LATIN_BASELINE) * downScale,
    ]),
  );
}

function smooth(points, passes = 2) {
  let result = points;
  for (let pass = 0; pass < passes; pass += 1) {
    result = result.map((point, i) => {
      if (i === 0 || i === result.length - 1) return point;
      return [
        (result[i - 1][0] + point[0] * 2 + result[i + 1][0]) / 4,
        (result[i - 1][1] + point[1] * 2 + result[i + 1][1]) / 4,
      ];
    });
  }
  return result;
}

function snapPoint(point, skeleton) {
  let best = null;
  let bestDistance = 0.07 * 0.07;
  for (const [sx, sy] of skeleton) {
    const dx = sx - point[0];
    const dy = sy - point[1];
    const distance = dx * dx + dy * dy;
    if (distance < bestDistance) {
      bestDistance = distance;
      best = [sx, sy];
    }
  }
  return best || point;
}

function snapStroke(stroke, skeleton) {
  // Straight strokes stay perfectly straight: snap only the endpoints.
  if (stroke.length === 2) {
    return [snapPoint(stroke[0], skeleton), snapPoint(stroke[1], skeleton)];
  }

  const snapped = stroke.map((point) => snapPoint(point, skeleton));

  const unique = [];
  for (const point of snapped) {
    const last = unique[unique.length - 1];
    if (!last || Math.hypot(point[0] - last[0], point[1] - last[1]) > 0.003) unique.push(point);
  }
  if (!unique.length) return snapped;
  if (unique.length === 1) return [unique[0], unique[0]];
  return smooth(resample(unique, 20));
}

/** Give strokes that meet at a corner the same fitted point. */
function reconcileEndpoints(raw, fitted) {
  const endpoints = [];
  raw.forEach((stroke, si) => {
    endpoints.push({ si, at: 0, raw: stroke[0], fit: fitted[si][0] });
    endpoints.push({
      si,
      at: fitted[si].length - 1,
      raw: stroke[stroke.length - 1],
      fit: fitted[si][fitted[si].length - 1],
    });
  });

  const used = new Set();
  for (let i = 0; i < endpoints.length; i += 1) {
    if (used.has(i)) continue;
    const group = [i];
    for (let j = i + 1; j < endpoints.length; j += 1) {
      if (used.has(j)) continue;
      const dx = endpoints[i].raw[0] - endpoints[j].raw[0];
      const dy = endpoints[i].raw[1] - endpoints[j].raw[1];
      if (Math.hypot(dx, dy) < 0.004) group.push(j);
    }
    if (group.length < 2) continue;
    let x = 0;
    let y = 0;
    for (const index of group) {
      x += endpoints[index].fit[0];
      y += endpoints[index].fit[1];
      used.add(index);
    }
    const point = [x / group.length, y / group.length];
    for (const index of group) {
      const endpoint = endpoints[index];
      fitted[endpoint.si][endpoint.at] = point;
    }
  }
}

/** Keep horizontal bars horizontal and vertical stems vertical. */
function enforceAxes(raw, fitted) {
  raw.forEach((stroke, index) => {
    if (stroke.length !== 2 || fitted[index].length !== 2) return;
    const dx = Math.abs(stroke[1][0] - stroke[0][0]);
    const dy = Math.abs(stroke[1][1] - stroke[0][1]);
    const [a, b] = fitted[index];
    if (dy < 0.012 && dx > 0.03) {
      const y = (a[1] + b[1]) / 2;
      fitted[index] = [
        [a[0], y],
        [b[0], y],
      ];
    } else if (dx < 0.012 && dy > 0.03) {
      const x = (a[0] + b[0]) / 2;
      fitted[index] = [
        [x, a[1]],
        [x, b[1]],
      ];
    }
  });
}

/** Join the split corners of 4 and 7 exactly. */
function joinCorners(ch, fitted) {
  if (ch === '4' && fitted.length === 3 && fitted[1].length === 2) {
    const [diagonal, bar] = fitted;
    const y = bar[1][1];
    bar[0] = [bar[0][0], y];
    bar[1] = [bar[1][0], y];
    diagonal[diagonal.length - 1] = [bar[0][0], y];
  }
  if (ch === '7' && fitted.length === 2 && fitted[0].length === 2) {
    const [bar, diagonal] = fitted;
    diagonal[0] = [bar[1][0], bar[1][1]];
  }
}

function traceOnSkeleton(stroke, skeleton, tolerance = 0.055) {
  if (skeleton.length < 8) return null;
  const cumulative = [0];
  for (let i = 1; i < stroke.length; i += 1) {
    cumulative.push(
      cumulative[i - 1] + Math.hypot(stroke[i][0] - stroke[i - 1][0], stroke[i][1] - stroke[i - 1][1]),
    );
  }
  const total = cumulative[cumulative.length - 1];
  if (total < 1e-6) return null;

  const samples = [];
  for (const [sx, sy] of skeleton) {
    let bestT = 0;
    let bestDistance = Infinity;
    for (let i = 1; i < stroke.length; i += 1) {
      const ax = stroke[i - 1][0];
      const ay = stroke[i - 1][1];
      const bx = stroke[i][0];
      const by = stroke[i][1];
      const dx = bx - ax;
      const dy = by - ay;
      const lengthSq = dx * dx + dy * dy || 1;
      let t = ((sx - ax) * dx + (sy - ay) * dy) / lengthSq;
      t = Math.max(0, Math.min(1, t));
      const distance = Math.hypot(sx - (ax + dx * t), sy - (ay + dy * t));
      if (distance < bestDistance) {
        bestDistance = distance;
        bestT = (cumulative[i - 1] + Math.sqrt(lengthSq) * t) / total;
      }
    }
    if (bestDistance <= tolerance) samples.push({ t: bestT, point: [sx, sy] });
  }

  if (samples.length < 4) return null;
  samples.sort((a, b) => a.t - b.t);

  const points = [];
  for (const sample of samples) {
    const last = points[points.length - 1];
    if (!last || Math.hypot(sample.point[0] - last[0], sample.point[1] - last[1]) > 0.003) {
      points.push(sample.point);
    }
  }
  if (points.length < 3) return null;
  return resample(points, 20);
}

/** Pull a traced path onto the centre of the thick font stroke. */
function centerOnRidge(path, field) {
  if (!field?.dist) return path;
  const { dist, size } = field;
  const radius = Math.max(2, Math.round(0.04 * size));
  return path.map((point, index) => {
    if (index === 0 || index === path.length - 1) return point;
    const px = Math.round(point[0] * size);
    const py = Math.round(point[1] * size);
    let best = point;
    let bestDistance = -1;
    for (let dy = -radius; dy <= radius; dy += 1) {
      for (let dx = -radius; dx <= radius; dx += 1) {
        if (dx * dx + dy * dy > radius * radius) continue;
        const x = px + dx;
        const y = py + dy;
        if (x < 1 || y < 1 || x >= size - 1 || y >= size - 1) continue;
        const value = dist[y * size + x];
        if (value > bestDistance) {
          bestDistance = value;
          best = [x / size, y / size];
        }
      }
    }
    return best;
  });
}

function fit(ch) {
  const raw = latinStrokes(ch);
  if (!raw) return null;
  const aligned = affineFit(ch, raw);
  let field = null;
  try {
    field = glyphField(ch, {
      family: LATIN_FAMILY,
      sizeRatio: LATIN_SIZE_RATIO,
      baseline: LATIN_BASELINE,
    });
  } catch {
    field = null;
  }
  const skeleton = field?.points || [];
  if (skeleton.length < 12) return aligned;

  const fitted = aligned.map((stroke) => {
    if (stroke.length === 2) {
      return [snapPoint(stroke[0], skeleton), snapPoint(stroke[1], skeleton)];
    }
    const traced = traceOnSkeleton(stroke, skeleton);
    if (!traced) return snapStroke(stroke, skeleton);
    const centered = centerOnRidge(traced, field);
    return resample(centered, 20);
  });
  reconcileEndpoints(aligned, fitted);
  enforceAxes(aligned, fitted);
  joinCorners(ch, fitted);
  return fitted;
}

/** Stroke medians for a Latin character, matched to the Didact glyph. */
export function fittedLatinStrokes(ch) {
  if (!cache.has(ch)) cache.set(ch, fit(ch));
  return cache.get(ch);
}
