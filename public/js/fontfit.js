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
import { glyphSkeleton } from './skeleton.js';
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

function snapStroke(stroke, skeleton) {
  const snapped = [];
  for (const [x, y] of stroke) {
    let best = null;
    let bestDistance = 0.07 * 0.07;
    for (const [sx, sy] of skeleton) {
      const dx = sx - x;
      const dy = sy - y;
      const distance = dx * dx + dy * dy;
      if (distance < bestDistance) {
        bestDistance = distance;
        best = [sx, sy];
      }
    }
    snapped.push(best || [x, y]);
  }

  const unique = [];
  for (const point of snapped) {
    const last = unique[unique.length - 1];
    if (!last || Math.hypot(point[0] - last[0], point[1] - last[1]) > 0.003) unique.push(point);
  }
  if (!unique.length) return snapped;
  if (unique.length === 1) return [unique[0], unique[0]];
  return smooth(resample(unique, 20));
}

function fit(ch) {
  const raw = latinStrokes(ch);
  if (!raw) return null;
  const aligned = affineFit(ch, raw);
  let skeleton = [];
  try {
    skeleton = glyphSkeleton(ch, {
      family: LATIN_FAMILY,
      sizeRatio: LATIN_SIZE_RATIO,
      baseline: LATIN_BASELINE,
    });
  } catch {
    skeleton = [];
  }
  if (skeleton.length < 12) return aligned;
  return aligned.map((stroke) => snapStroke(stroke, skeleton));
}

/** Stroke medians for a Latin character, matched to the Didact glyph. */
export function fittedLatinStrokes(ch) {
  if (!cache.has(ch)) cache.set(ch, fit(ch));
  return cache.get(ch);
}
