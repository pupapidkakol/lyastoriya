// Чисті функції з public/js/games/quiz-logic.js — справжні модульні тести без DOM.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { shuffle, isCorrect, calculateScore, calcResult, isValidQuestionBank } from '../public/js/games/quiz-logic.js';

describe('shuffle', () => {
  test('повертає ті самі елементи в тій самій кількості', () => {
    const src = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const out = shuffle(src);
    assert.equal(out.length, src.length);
    assert.deepEqual(out.slice().sort((a, b) => a - b), src);
  });

  test('не змінює вхідний масив і повертає новий', () => {
    const src = ['a', 'b', 'c', 'd'];
    const copy = src.slice();
    const out = shuffle(src);
    assert.deepEqual(src, copy);
    assert.notEqual(out, src);
  });

  test('порожній і одноелементний масиви', () => {
    assert.deepEqual(shuffle([]), []);
    assert.deepEqual(shuffle(['x']), ['x']);
  });

  test('справді перемішує: за 200 запусків перший елемент буває різним', () => {
    const firsts = new Set();
    for (let i = 0; i < 200; i++) firsts.add(shuffle([1, 2, 3, 4, 5])[0]);
    assert.equal(firsts.size, 5);
  });
});

describe('isCorrect', () => {
  test('формат «Знайди відповідність»: correctAnswerId ↔ Answerid', () => {
    const q = { correctAnswerId: 3 };
    assert.equal(isCorrect(q, { Answerid: 3 }), true);
    assert.equal(isCorrect(q, { Answerid: 4 }), false);
  });

  test('формат квізу: correct (рядок) ↔ id варіанта', () => {
    const q = { correct: 'b' };
    assert.equal(isCorrect(q, { id: 'b' }), true);
    assert.equal(isCorrect(q, { id: 'a' }), false);
  });

  test('формат з позначкою correct: true у варіанті', () => {
    assert.equal(isCorrect({}, { correct: true }), true);
    assert.equal(isCorrect({}, { correct: false }), false);
    assert.equal(isCorrect({}, {}), false);
  });

  test('correctAnswerId = 0 теж працює (перевірка через hasOwnProperty, а не truthy)', () => {
    assert.equal(isCorrect({ correctAnswerId: 0 }, { Answerid: 0 }), true);
  });
});

describe('calculateScore', () => {
  test('рахує кількість правильних відповідей', () => {
    assert.equal(calculateScore([true, false, true, true]), 3);
    assert.equal(calculateScore([false, false]), 0);
    assert.equal(calculateScore([]), 0);
  });
});

describe('calcResult', () => {
  test('рахує відсоток з округленням', () => {
    assert.deepEqual(calcResult(7, 10), { score: 7, total: 10, percent: 70 });
    assert.deepEqual(calcResult(2, 3), { score: 2, total: 3, percent: 67 });
    assert.deepEqual(calcResult(1, 3), { score: 1, total: 3, percent: 33 });
    assert.deepEqual(calcResult(10, 10), { score: 10, total: 10, percent: 100 });
  });

  test('total = 0 → 0 %, без ділення на нуль', () => {
    assert.deepEqual(calcResult(0, 0), { score: 0, total: 0, percent: 0 });
  });
});

describe('isValidQuestionBank', () => {
  const good = () => ({
    text: 'Коли?',
    options: [{ id: 'a', text: '882' }, { id: 'b', text: '988' }],
    correct: 'b'
  });

  test('коректний банк запитань', () => {
    assert.equal(isValidQuestionBank([good(), good()]), true);
    assert.equal(isValidQuestionBank([]), true);
  });

  test('не масив → false', () => {
    assert.equal(isValidQuestionBank(null), false);
    assert.equal(isValidQuestionBank({}), false);
    assert.equal(isValidQuestionBank('[]'), false);
  });

  test('порожній текст запитання → false', () => {
    assert.equal(isValidQuestionBank([{ ...good(), text: '   ' }]), false);
    assert.equal(isValidQuestionBank([{ ...good(), text: 5 }]), false);
  });

  test('менше двох варіантів або порожній варіант → false', () => {
    assert.equal(isValidQuestionBank([{ ...good(), options: [{ id: 'b', text: '988' }] }]), false);
    assert.equal(isValidQuestionBank([{ ...good(), options: [{ id: 'a', text: '' }, { id: 'b', text: '988' }] }]), false);
  });

  test('correct не збігається з жодним варіантом → false', () => {
    assert.equal(isValidQuestionBank([{ ...good(), correct: 'z' }]), false);
  });

  test('варіант без id при correct-рядку → false', () => {
    assert.equal(isValidQuestionBank([{ ...good(), options: [{ text: '882' }, { id: 'b', text: '988' }] }]), false);
  });

  test('формат з correctAnswerId', () => {
    const q = { text: 'Хто?', options: [{ Answerid: 1, text: 'Олег' }, { Answerid: 2, text: 'Ігор' }], correctAnswerId: 2 };
    assert.equal(isValidQuestionBank([q]), true);
    assert.equal(isValidQuestionBank([{ ...q, correctAnswerId: 9 }]), false);
  });

  test('формат з correct: true у варіанті', () => {
    const q = { text: 'Хто?', options: [{ text: 'Олег' }, { text: 'Ігор', correct: true }] };
    assert.equal(isValidQuestionBank([q]), true);
    assert.equal(isValidQuestionBank([{ ...q, options: [{ text: 'Олег' }, { text: 'Ігор' }] }]), false);
  });

  test('один зіпсований елемент робить увесь банк некоректним', () => {
    assert.equal(isValidQuestionBank([good(), null]), false);
  });
});
