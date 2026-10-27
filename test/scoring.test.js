import test from 'node:test';
import assert from 'node:assert/strict';
import { compareStroke, scoreUnit, resample, pathLength, starsFor } from '../public/js/scoring.js';

function line(a, b, n = 20) {
  return Array.from({ length: n }, (_, i) => [
    a[0] + ((b[0] - a[0]) * i) / (n - 1),
    a[1] + ((b[1] - a[1]) * i) / (n - 1),
  ]);
}

function jitter(points, amount = 0.004, seed = 1) {
  let s = seed;
  const rnd = () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280 - 0.5;
  };
  return points.map(([x, y]) => [x + rnd() * amount * 2, y + rnd() * amount * 2]);
}

test('resample keeps endpoints and count', () => {
  const pts = line([0, 0], [1, 0]);
  const out = resample(pts, 32);
  assert.equal(out.length, 32);
  assert.deepEqual(out[0], [0, 0]);
  assert.ok(Math.abs(out[31][0] - 1) < 1e-9);
  assert.ok(Math.abs(pathLength(pts) - 1) < 1e-9);
});

test('identical stroke scores very high', () => {
  const ref = line([0.2, 0.8], [0.8, 0.2]);
  const cmp = compareStroke(ref, ref);
  assert.ok(cmp.score > 0.95, `score ${cmp.score}`);
});

test('hand wobble still scores well', () => {
  const ref = line([0.2, 0.8], [0.8, 0.2]);
  const cmp = compareStroke(jitter(ref, 0.006), ref);
  assert.ok(cmp.score > 0.75, `score ${cmp.score}`);
  assert.ok(cmp.score < 0.99);
});

test('reversed stroke is penalised', () => {
  const ref = line([0.2, 0.8], [0.8, 0.2]);
  const cmp = compareStroke([...ref].reverse(), ref);
  assert.ok(cmp.reversed, 'should detect reversal');
  assert.ok(cmp.score < 0.4, `score ${cmp.score}`);
});

test('shifted stroke is still accepted but loses points', () => {
  const ref = line([0.3, 0.7], [0.7, 0.7]);
  const user = line([0.3, 0.78], [0.7, 0.78]);
  const cmp = compareStroke(user, ref);
  assert.ok(cmp.score > 0.4 && cmp.score < 0.85, `score ${cmp.score}`);
});

test('wrong shape scores low', () => {
  const ref = line([0.3, 0.7], [0.7, 0.7]);
  const user = line([0.3, 0.2], [0.7, 0.2]);
  const cmp = compareStroke(user, ref);
  assert.ok(cmp.score < 0.45, `score ${cmp.score}`);
});

test('partial drawing is not full marks', () => {
  const refs = [
    line([0.2, 0.2], [0.2, 0.8]),
    line([0.2, 0.2], [0.8, 0.2]),
    line([0.2, 0.8], [0.8, 0.8]),
  ];
  const result = scoreUnit(refs, [refs[0], refs[1]], 1);
  assert.ok(result.pct > 45 && result.pct < 85, `pct ${result.pct}`);
  assert.equal(result.missing.length, 1);
  assert.equal(result.extra.length, 0);
});

test('perfect unit is 100 with 5 stars', () => {
  const refs = [line([0.2, 0.2], [0.8, 0.2]), line([0.5, 0.2], [0.5, 0.8])];
  const result = scoreUnit(refs, refs, 1);
  assert.ok(result.pct >= 95, `pct ${result.pct}`);
  assert.equal(result.stars, 5);
});

test('empty attempt scores zero', () => {
  const refs = [line([0.2, 0.2], [0.8, 0.2])];
  const result = scoreUnit(refs, [], 1);
  assert.equal(result.pct, 0);
  assert.equal(result.stars, 1);
});

test('star thresholds', () => {
  assert.equal(starsFor(95), 5);
  assert.equal(starsFor(80), 4);
  assert.equal(starsFor(61), 3);
  assert.equal(starsFor(45), 2);
  assert.equal(starsFor(10), 1);
});
