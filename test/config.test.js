import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeConfig } from '../server/store.js';
import { CONFIG_VERSION } from '../server/defaults.js';
import { STROKE_OVERRIDES } from '../server/stroke-seed.js';

const OLD_VERSION = CONFIG_VERSION - 1;

test('the shipped stroke seed is served to new installs', () => {
  const config = sanitizeConfig({});
  assert.deepEqual(config.strokes, STROKE_OVERRIDES);
});

test('an older store picks up the stroke seed once', () => {
  const config = sanitizeConfig({ version: OLD_VERSION, strokes: {} });
  assert.equal(Object.keys(config.strokes).length, Object.keys(STROKE_OVERRIDES).length);
  assert.equal(config.version, CONFIG_VERSION);
});

test('dot strokes survive validation', () => {
  const config = sanitizeConfig({ version: CONFIG_VERSION, strokes: { i: [[[0.5, 0.24]]] } });
  assert.deepEqual(config.strokes.i, [[[0.5, 0.24]]]);
});

test('an old store gets the new i and j dot strokes once', () => {
  const config = sanitizeConfig({
    version: CONFIG_VERSION - 1,
    strokes: {
      i: [[[0.4969, 0.3938], [0.4969, 0.7344]], [[0.48, 0.23], [0.52, 0.25]]],
      j: [[[0.5, 0.3906], [0.5, 0.9]], [[0.48, 0.23], [0.52, 0.25]]],
      a: [[[0.3, 0.4], [0.6, 0.7]]],
    },
  });
  assert.equal(config.strokes.i[1].length, 1, 'i dot is a single point');
  assert.equal(config.strokes.j[1].length, 1, 'j dot is a single point');
  assert.deepEqual(config.strokes.a, [[[0.3, 0.4], [0.6, 0.7]]]);
});

test('a current store keeps exactly the overrides it saved', () => {
  const strokes = { r: [[[0, 0], [1, 1]]] };
  const config = sanitizeConfig({ version: CONFIG_VERSION, strokes });
  assert.deepEqual(config.strokes, strokes);
});

test('removing an override is preserved for current stores', () => {
  const config = sanitizeConfig({ version: CONFIG_VERSION, strokes: {} });
  assert.deepEqual(config.strokes, {});
});
