import test from 'node:test';
import assert from 'node:assert/strict';
import { parsePassage, isMixed, splitUnits } from '../public/js/units.js';

test('passage splits Chinese characters and Latin words', () => {
  const tokens = parsePassage('Good morning! 早上好！I brush my teeth. 我刷牙。', 'en');
  const values = tokens.map((t) => t.text);
  assert.deepEqual(values.slice(0, 6), ['Good', 'morning', '早', '上', '好', 'I']);
  assert.equal(tokens.find((t) => t.text === '早').lang, 'zh');
  assert.equal(tokens.find((t) => t.text === 'Good').lang, 'en');
});

test('tokens carry their sentence for the context bar', () => {
  const tokens = parsePassage('Hello 你好。Bye 再见。', 'en');
  assert.equal(tokens[0].sentence, 'Hello 你好。');
  assert.equal(tokens[2].sentence, 'Hello 你好。');
  assert.equal(tokens[3].sentence, 'Bye 再见。');
});

test('punctuation and whitespace are not practiced', () => {
  const tokens = parsePassage('Cat, dog! 猫，狗！', 'en');
  assert.deepEqual(
    tokens.map((t) => t.text),
    ['Cat', 'dog', '猫', '狗'],
  );
});

test('apostrophes stay inside a Latin word', () => {
  const tokens = parsePassage("I don't know. 我不知道。", 'en');
  assert.deepEqual(tokens.slice(0, 3).map((t) => t.text), ['I', "don't", 'know']);
});

test('mixed detection', () => {
  assert.equal(isMixed('Hello 你好'), true);
  assert.equal(isMixed('你好'), false);
  assert.equal(isMixed('hello'), false);
});

test('splitUnits drops spaces', () => {
  assert.deepEqual(splitUnits('a b'), ['a', 'b']);
});

test('a line break does not start a new sentence or practice', () => {
  const tokens = parsePassage('Good morning\nI brush my teeth\nThen I go to school.', 'en');
  assert.deepEqual(
    tokens.map((t) => t.text),
    ['Good', 'morning', 'I', 'brush', 'my', 'teeth', 'Then', 'I', 'go', 'to', 'school'],
  );
  assert.equal(tokens[1].sentence, 'Good morning I brush my teeth Then I go to school.');
});

test('punctuation still separates sentences for the context bar', () => {
  const tokens = parsePassage('I brush my teeth. I eat breakfast.', 'en');
  assert.equal(tokens[0].sentence, 'I brush my teeth.');
  assert.equal(tokens.at(-1).sentence, 'I eat breakfast.');
});

test('a wrapped mixed passage keeps every unit', () => {
  const tokens = parsePassage('Good morning!\n早上好！\nI brush my teeth.', 'en');
  assert.deepEqual(
    tokens.map((t) => t.text),
    ['Good', 'morning', '早', '上', '好', 'I', 'brush', 'my', 'teeth'],
  );
});

test('pinyin annotations in a passage are attached per character', () => {
  const tokens = parsePassage('星期天 (xing1 qi1 tian1)，炯恪 (jiong3 ke4) 去玩。', 'zh');
  const map = Object.fromEntries(tokens.map((t) => [t.text, t.pinyin]));
  assert.equal(map['星'], 'xīng');
  assert.equal(map['期'], 'qī');
  assert.equal(map['天'], 'tiān');
  assert.equal(map['炯'], 'jiǒng');
  assert.equal(map['恪'], 'kè');
  assert.equal(map['去'], '');
});

test('the context sentence hides the pinyin annotations', () => {
  const [first] = parsePassage('星期天 (xing1 qi1 tian1) 去玩。', 'zh');
  assert.equal(first.sentence, '星期天 去玩。');
});

test('a mismatched annotation is dropped, not shown', () => {
  const tokens = parsePassage('早上 (zao) 好。', 'zh');
  assert.equal(tokens[0].sentence, '早上 好。');
  assert.equal(tokens[0].pinyin, '');
});
