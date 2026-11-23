// Перевірка JSON-даних у public/data: структура, посилання між файлами, наявність картинок.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { PUBLIC, readJson, extractLiteral } from './helpers/browser-env.js';

const QUIZ_ROUND = 10;
const FOF_ROUND = 10;
const TIMELINE_ROUNDS = 5;

function isHttpUrl(s) {
  try { const u = new URL(s); return u.protocol === 'http:' || u.protocol === 'https:'; } catch { return false; }
}
function isSafeFileName(f) {
  return typeof f === 'string' && f !== '' && !/[\\/]/.test(f) && f !== '.' && f !== '..';
}
function imageExists(f) { return fs.existsSync(path.join(PUBLIC, 'images', f)); }
function nonEmpty(s) { return typeof s === 'string' && s.trim() !== ''; }
function duplicates(list) { return list.filter((x, i) => list.indexOf(x) !== i); }

// ---------------------------------------------------------------------------
describe('questions(1).json — запитання квізу', () => {
  const data = readJson('data/questions(1).json');
  const theory = readJson('data/theory(1).json');

  test('є тема і масив запитань, вистачає щонайменше на один раунд (10)', () => {
    assert.ok(nonEmpty(data.topic), 'topic має бути непорожнім рядком');
    assert.ok(Array.isArray(data.questions), 'questions має бути масивом');
    assert.ok(data.questions.length >= QUIZ_ROUND, `запитань ${data.questions.length}, потрібно ≥ ${QUIZ_ROUND}`);
  });

  test('кожне запитання проходить ту саму перевірку, що й quiz.js', () => {
    for (const q of data.questions) {
      assert.ok(q && typeof q.text === 'string', `запитання ${q && q.id}: немає text`);
      assert.ok(Array.isArray(q.options) && q.options.length >= 2, `запитання ${q.id}: потрібно ≥ 2 варіантів`);
      for (const o of q.options) {
        assert.ok(o && typeof o.id === 'string' && typeof o.text === 'string', `запитання ${q.id}: варіант без id/text`);
      }
      assert.ok(q.options.some((o) => o.id === q.correct), `запитання ${q.id}: correct="${q.correct}" не збігається з жодним варіантом`);
    }
  });

  test('id і тексти запитань унікальні', () => {
    assert.deepEqual(duplicates(data.questions.map((q) => q.id)), [], 'повторювані id');
    assert.deepEqual(duplicates(data.questions.map((q) => q.text.trim())), [], 'повторювані тексти запитань');
  });

  test('у межах запитання id і тексти варіантів унікальні та непорожні', () => {
    for (const q of data.questions) {
      assert.deepEqual(duplicates(q.options.map((o) => o.id)), [], `запитання ${q.id}: повторювані id варіантів`);
      assert.deepEqual(duplicates(q.options.map((o) => o.text.trim())), [], `запитання ${q.id}: повторювані тексти варіантів`);
      for (const o of q.options) assert.ok(nonEmpty(o.text), `запитання ${q.id}: порожній варіант ${o.id}`);
    }
  });

  test('у кожного запитання є пояснення (explanation)', () => {
    const missing = data.questions.filter((q) => !nonEmpty(q.explanation)).map((q) => q.id);
    assert.deepEqual(missing, [], 'запитання без пояснення');
  });

  test('джерела: є назва, а посилання або порожнє, або http(s)', () => {
    for (const q of data.questions) {
      if (q.sources === undefined) continue;
      assert.ok(Array.isArray(q.sources), `запитання ${q.id}: sources має бути масивом`);
      for (const s of q.sources) {
        assert.ok(nonEmpty(s.title), `запитання ${q.id}: джерело без назви`);
        assert.ok(!s.url || isHttpUrl(s.url), `запитання ${q.id}: некоректне посилання ${s.url}`);
      }
    }
  });

  test('картинки: безпечне ім’я файлу і файл існує в public/images', () => {
    for (const q of data.questions) {
      if (!q.image) continue;
      assert.ok(isSafeFileName(q.image.file), `запитання ${q.id}: небезпечне ім’я файлу «${q.image.file}»`);
      assert.ok(imageExists(q.image.file), `запитання ${q.id}: немає файлу public/images/${q.image.file}`);
      if (q.image.url) assert.ok(isHttpUrl(q.image.url), `запитання ${q.id}: некоректне посилання на зображення`);
    }
  });

  test('theoryId посилається на існуючий розділ теорії', () => {
    const ids = new Set(theory.sections.map((s) => s.id));
    for (const q of data.questions) {
      if (q.theoryId === undefined) continue;
      assert.ok(ids.has(q.theoryId), `запитання ${q.id}: розділу «${q.theoryId}» немає в theory(1).json`);
    }
  });
});

// ---------------------------------------------------------------------------
describe('theory(1).json — теорія', () => {
  const data = readJson('data/theory(1).json');

  test('є тема і непорожній список розділів', () => {
    assert.ok(nonEmpty(data.topic));
    assert.ok(Array.isArray(data.sections) && data.sections.length > 0);
  });

  test('id і порядкові номери (order) розділів унікальні', () => {
    assert.deepEqual(duplicates(data.sections.map((s) => s.id)), []);
    assert.deepEqual(duplicates(data.sections.map((s) => s.order)), []);
  });

  test('у кожного розділу є заголовок і текст', () => {
    for (const s of data.sections) {
      assert.ok(nonEmpty(s.title), `розділ ${s.id}: немає title`);
      assert.ok(Array.isArray(s.paragraphs) && s.paragraphs.length > 0, `розділ ${s.id}: немає paragraphs`);
    }
  });

  test('картинки розділів існують у public/images', () => {
    for (const s of data.sections) {
      if (!s.image) continue;
      assert.ok(isSafeFileName(s.image.file), `розділ ${s.id}: небезпечне ім’я файлу`);
      assert.ok(imageExists(s.image.file), `розділ ${s.id}: немає файлу public/images/${s.image.file}`);
    }
  });
});

// ---------------------------------------------------------------------------
// Увага: зараз гра бере твердження з масиву Q у fake-or-fact.js, а не з цього JSON.
describe('fake-or-fact.json — «Фейк чи факт»', () => {
  const data = readJson('data/fake-or-fact.json');
  const ERA = extractLiteral('public/js/games/fake-or-fact.js', 'ERA');

  test('масив тверджень, вистачає щонайменше на один раунд (10)', () => {
    assert.ok(Array.isArray(data));
    assert.ok(data.length >= FOF_ROUND, `тверджень ${data.length}, потрібно ≥ ${FOF_ROUND}`);
  });

  test('кожне твердження має формат [епоха, текст, 0|1, пояснення], як очікує гра', () => {
    data.forEach((q, i) => {
      assert.ok(Array.isArray(q) && q.length === 4, `рядок ${i}: має бути масив з 4 елементів`);
      assert.ok(Object.prototype.hasOwnProperty.call(ERA, q[0]), `рядок ${i}: невідома епоха «${q[0]}»`);
      assert.ok(nonEmpty(q[1]), `рядок ${i}: порожній текст`);
      assert.ok(q[2] === 0 || q[2] === 1, `рядок ${i}: третій елемент має бути 0 або 1`);
      assert.ok(nonEmpty(q[3]), `рядок ${i}: порожнє пояснення`);
    });
  });

  test('тексти тверджень не повторюються', () => {
    assert.deepEqual(duplicates(data.map((q) => q[1].trim())), []);
  });

  test('є і факти, і фейки', () => {
    assert.ok(data.some((q) => q[2] === 1), 'немає жодного факту');
    assert.ok(data.some((q) => q[2] === 0), 'немає жодного фейку');
  });
});

// ---------------------------------------------------------------------------
describe('timeline-events.json — «Коли це сталося?»', () => {
  const data = readJson('data/timeline-events.json');

  test('meta.min < meta.max (цілі роки)', () => {
    assert.ok(Number.isInteger(data.meta.min) && Number.isInteger(data.meta.max));
    assert.ok(data.meta.min < data.meta.max);
  });

  test('подій вистачає на гру (5 раундів), id унікальні', () => {
    assert.ok(Array.isArray(data.events) && data.events.length >= TIMELINE_ROUNDS);
    assert.deepEqual(duplicates(data.events.map((e) => e.id)), []);
  });

  test('from ≤ to, обидва — цілі роки в межах шкали', () => {
    for (const e of data.events) {
      assert.ok(Number.isInteger(e.from) && Number.isInteger(e.to), `${e.id}: from/to мають бути цілими`);
      assert.ok(e.from <= e.to, `${e.id}: from > to`);
      assert.ok(e.from >= data.meta.min && e.to <= data.meta.max, `${e.id}: рік поза шкалою ${data.meta.min}–${data.meta.max}`);
    }
  });

  test('у кожної події є назва, опис і факт', () => {
    for (const e of data.events) {
      assert.ok(nonEmpty(e.title), `${e.id}: немає title`);
      assert.ok(nonEmpty(e.text), `${e.id}: немає text`);
      assert.ok(nonEmpty(e.fact), `${e.id}: немає fact`);
    }
  });

  test('назви подій не повторюються', () => {
    assert.deepEqual(duplicates(data.events.map((e) => e.title)), []);
  });

  test('у кожної події є хоча б одне джерело з http(s)-посиланням', () => {
    for (const e of data.events) {
      assert.ok(Array.isArray(e.sources) && e.sources.length > 0, `${e.id}: немає джерел`);
      for (const s of e.sources) assert.ok(isHttpUrl(s.url), `${e.id}: некоректне посилання ${s.url}`);
    }
  });
});

// ---------------------------------------------------------------------------
describe('images/images_map.csv', () => {
  test('кожен файл із колонки saved_file існує в public/images', () => {
    const lines = fs.readFileSync(path.join(PUBLIC, 'images', 'images_map.csv'), 'utf8')
      .replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim());
    const header = lines[0].split(',');
    const col = header.indexOf('saved_file');
    assert.ok(col >= 0, 'немає колонки saved_file');
    const missing = lines.slice(1).map((l) => l.split(',')[col]).filter((f) => f && !imageExists(f));
    assert.deepEqual(missing, []);
  });
});
