import test from 'node:test';
import assert from 'node:assert/strict';
import { pinyinFromNumbered } from '../public/js/pinyin.js';

test('tone numbers become tone marks', () => {
  assert.equal(pinyinFromNumbered('zao3 shang4'), 'zǎo shàng');
  assert.equal(pinyinFromNumbered('ni3 hao3'), 'nǐ hǎo');
  assert.equal(pinyinFromNumbered('lü4 se4'), 'lǜ sè');
  assert.equal(pinyinFromNumbered('wo3 men5'), 'wǒ men');
});

test('the mark goes on a, e, ou or the last vowel', () => {
  assert.equal(pinyinFromNumbered('liu2'), 'liú');
  assert.equal(pinyinFromNumbered('gui4'), 'guì');
  assert.equal(pinyinFromNumbered('xue2'), 'xué');
  assert.equal(pinyinFromNumbered('shui3'), 'shuǐ');
});

test('already-marked pinyin and plain words are left alone', () => {
  assert.equal(pinyinFromNumbered('zǎo shang'), 'zǎo shang');
  assert.equal(pinyinFromNumbered('morning'), 'morning');
  assert.equal(pinyinFromNumbered(''), '');
});

test('u: and v are accepted for ü', () => {
  assert.equal(pinyinFromNumbered('nu:3'), 'nǚ');
  assert.equal(pinyinFromNumbered('nv3'), 'nǚ');
});
