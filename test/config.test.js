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

test('a current store keeps exactly the overrides it saved', () => {
  const strokes = { r: [[[0, 0], [1, 1]]] };
  const config = sanitizeConfig({ version: CONFIG_VERSION, strokes });
  assert.deepEqual(config.strokes, strokes);
});

test('removing an override is preserved for current stores', () => {
  const config = sanitizeConfig({ version: CONFIG_VERSION, strokes: {} });
  assert.deepEqual(config.strokes, {});
});
