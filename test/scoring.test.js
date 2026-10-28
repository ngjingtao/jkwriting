import test from 'node:test';
import assert from 'node:assert/strict';
import {
  compareStroke,
  isDotStroke,
  scoreUnit,
  resample,
  pathLength,
  starsFor,
  strokeIssues,
} from '../public/js/scoring.js';

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

test('a dot stroke is a single point', () => {
  assert.equal(isDotStroke([[0.5, 0.24]]), true);
  assert.equal(isDotStroke(line([0.5, 0.24], [0.51, 0.24], 3)), true);
  assert.equal(isDotStroke(line([0.3, 0.2], [0.7, 0.2])), false);
});

test('a tap on the dot scores full marks', () => {
  const dot = [[0.5, 0.24]];
  assert.ok(compareStroke([[0.5, 0.24]], dot).score > 0.97);
  assert.ok(compareStroke([[0.505, 0.245]], dot).score > 0.95);
});

test('a tap away from the dot loses points and gets a position tip', () => {
  const dot = [[0.5, 0.24]];
  const cmp = compareStroke([[0.62, 0.32]], dot);
  assert.ok(cmp.score < 0.4, `score ${cmp.score}`);
  assert.deepEqual(strokeIssues(cmp), ['position']);
});

test('a small scribble still counts, a long line does not', () => {
  const dot = [[0.5, 0.24]];
  const scribble = line([0.49, 0.235], [0.51, 0.245], 6);
  const longLine = line([0.5, 0.2], [0.5, 0.7], 12);
  const a = compareStroke(scribble, dot);
  const b = compareStroke(longLine, dot);
  assert.ok(a.score > b.score, `${a.score} vs ${b.score}`);
  assert.ok(b.score < 0.75);
});

test('a dot reference inside a whole unit keeps the stars high', () => {
  const refs = [line([0.5, 0.45], [0.5, 0.9]), [[0.5, 0.24]]];
  const attempt = [line([0.5, 0.45], [0.5, 0.9]), [[0.5, 0.24]]];
  const result = scoreUnit(refs, attempt, 1);
  assert.ok(result.pct >= 95, `pct ${result.pct}`);
  assert.equal(result.stars, 5);
});
