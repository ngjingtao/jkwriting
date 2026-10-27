// Fits the Hershey stroke skeletons onto the actual Didact Gothic glyph
// outlines. The Hershey data gives stroke order and topology; this module
// scales each skeleton to the ink box the browser draws, so the arrows sit in
// the middle of the ghost letter (including the descender of y, g, j, p, q).

import { latinStrokes } from './glyphs.js';

export const LATIN_SIZE_RATIO = 0.86;
export const LATIN_BASELINE = 0.765;
export const LATIN_FAMILY = "'Didact Gothic', 'Nunito', sans-serif";

const cache = new Map();
let ctx = null;
let fontReady = null;

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

let metricsCache = null;

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

function fit(ch) {
  const raw = latinStrokes(ch);
  if (!raw) return null;
  const measure = context();
  measure.font = `400 100px ${LATIN_FAMILY}`;
  measure.textAlign = 'center';
  const metrics = measure.measureText(ch);

  // The ghost is centred at x = 0.5 and sits on LATIN_BASELINE.
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

/** Stroke medians for a Latin character, matched to the Didact glyph box. */
export function fittedLatinStrokes(ch) {
  if (!cache.has(ch)) cache.set(ch, fit(ch));
  return cache.get(ch);
}
