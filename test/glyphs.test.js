import test from 'node:test';
import assert from 'node:assert/strict';
import { GLYPHS, latinStrokes } from '../public/js/glyphs.js';

const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

test('every letter and digit has stroke data', () => {
  for (const ch of CHARS) {
    assert.ok(latinStrokes(ch), `missing ${ch}`);
  }
});

test('all points live inside the practice box', () => {
  for (const ch of CHARS) {
    for (const stroke of GLYPHS[ch]) {
      assert.ok(stroke.length >= 1, `${ch} has an empty stroke`);
      for (const [x, y] of stroke) {
        assert.ok(x >= 0 && x <= 1, `${ch} x=${x}`);
        assert.ok(y >= 0 && y <= 1, `${ch} y=${y}`);
      }
    }
  }
});

test('single-storey a: bowl first, then the stem', () => {
  const [bowl, stem] = latinStrokes('a');
  assert.ok(bowl.length > 5, 'bowl should be a curve');
  assert.ok(stem.length === 2, 'stem should be a straight line');
  assert.ok(stem[0][0] > 0.6, 'stem is on the right');
  assert.ok(stem[1][1] > stem[0][1], 'stem goes down');
});

test('E is taught as four strokes', () => {
  assert.equal(latinStrokes('E').length, 4);
});

test('T starts with the top bar', () => {
  const [bar, stem] = latinStrokes('T');
  assert.equal(bar.length, 2);
  assert.equal(stem.length, 2);
  assert.ok(Math.abs(bar[0][1] - bar[1][1]) < 0.01, 'bar is horizontal');
});
