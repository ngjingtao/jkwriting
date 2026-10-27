import test from 'node:test';
import assert from 'node:assert/strict';
import { toWadeGiles } from '../server/wadegiles.js';

const cases = [
  ['nǐ', 'ni³'],
  ['hǎo', 'hao³'],
  ['zhōng', 'chung¹'],
  ['guó', 'kuo²'],
  ['běi', 'pei³'],
  ['jīng', 'ching¹'],
  ['xué', 'hsüeh²'],
  ['xiào', 'hsiao⁴'],
  ['wǒ', 'wo³'],
  ['xiè', 'hsieh⁴'],
  ['rén', 'jen²'],
  ['shuǐ', 'shui³'],
  ['sì', 'ssŭ⁴'],
  ['zǐ', 'tzŭ³'],
  ['cì', "tz'ŭ⁴"],
  ['zhī', 'chih¹'],
  ['rì', 'jih⁴'],
  ['nǚ', 'nü³'],
  ['jūn', 'chün¹'],
  ['jiàn', 'chien⁴'],
  ['dōng', 'tung¹'],
  ['jiǎng', 'chiang³'],
  ['shí', 'shih²'],
  ['xiāng', 'hsiang¹'],
  ['guǎng', 'kuang³'],
  ['zhōu', 'chou¹'],
  ['qìng', "ch'ing⁴"],
  ['tiān', "t'ien¹"],
  ['jīn', 'chin¹'],
  ['ān', 'an¹'],
  ['huī', 'hui¹'],
  ['er', 'erh'],
  ['yī', 'i¹'],
  ['yǒu', 'yu³'],
  ['wǔ', 'wu³'],
  ['yuè', 'yüeh⁴'],
];

test('Hanyu Pinyin → Wade-Giles', () => {
  for (const [pinyin, wade] of cases) {
    assert.equal(toWadeGiles(pinyin), wade, `${pinyin} → ${wade}`);
  }
});

test('neutral tone has no number', () => {
  assert.equal(toWadeGiles('de'), 'te');
  assert.equal(toWadeGiles('xiè xie'), 'hsieh⁴ hsieh');
});

test('phrases keep spaces', () => {
  assert.equal(toWadeGiles('nǐ hǎo'), 'ni³ hao³');
  assert.equal(toWadeGiles('zhōng guó'), 'chung¹ kuo²');
});
