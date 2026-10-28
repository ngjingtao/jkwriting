import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanEntries, cleanEntry, mergeProgress, progressKey } from '../server/progress.js';

test('entries without text or timestamp are dropped', () => {
  assert.equal(cleanEntry({ ts: Date.now(), text: '   ' }), null);
  assert.equal(cleanEntry({ text: 'a' }), null);
  assert.equal(cleanEntry(null), null);
});

test('entries are trimmed to the fields the app uses', () => {
  const entry = cleanEntry({
    ts: 1700000000000,
    text: '猫',
    lang: 'zh',
    kind: 'chinese',
    setName: 'Animals',
    pct: 87.6,
    stars: 9,
    extra: 'ignored',
  });
  assert.deepEqual(entry, {
    ts: 1700000000000,
    text: '猫',
    lang: 'zh',
    kind: 'chinese',
    setName: 'Animals',
    pct: 88,
    stars: 3,
  });
});

test('merging two devices keeps both sets of words', () => {
  const ipad = cleanEntries([
    { ts: 1000, text: 'dog', stars: 2 },
    { ts: 2000, text: 'cat', stars: 3 },
  ]);
  const phone = cleanEntries([
    { ts: 1500, text: 'bird', stars: 1 },
    { ts: 2000, text: 'cat', stars: 3 },
  ]);
  const merged = mergeProgress(ipad, phone);
  assert.deepEqual(
    merged.map((entry) => entry.text),
    ['dog', 'bird', 'cat'],
  );
  assert.equal(new Set(merged.map(progressKey)).size, 3);
});

test('the newest 500 entries are kept', () => {
  const many = Array.from({ length: 620 }, (_, i) => ({ ts: 1000 + i, text: `w${i}`, stars: 1 }));
  const list = cleanEntries(many);
  assert.equal(list.length, 500);
  assert.equal(list[0].text, 'w120');
  assert.equal(list[list.length - 1].text, 'w619');
});
