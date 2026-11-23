// Сторінка гри (game-page.js): білий список ігор, заповнення сторінки, захист від підстановки id.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { PUBLIC, installBrowser, waitFor, extractLiteral } from './helpers/browser-env.js';

const REGISTRY = extractLiteral('public/js/game-page.js', 'REGISTRY');
const SERVER_GAMES = extractLiteral('server/server.js', 'GAMES');
const IDS = ['gamePage', 'gameRoot', 'gameTitle', 'gameLabel', 'asideTitle', 'asideText', 'asideFoot'];
const PAGE_URL = pathToFileURL(path.join(PUBLIC, 'js', 'game-page.js')).href;
let run = 0;

// game-page.js — модуль, що виконується одразу при імпорті. Щоб запустити його знову,
// імпортуємо з іншим ?run=N (так Node вважає його новим модулем).
async function openPage(search) {
  const env = installBrowser({ search });
  for (const id of IDS) {
    const e = env.document.createElement('div');
    e.id = id;
    env.document.body.appendChild(e);
  }
  await import(PAGE_URL + '?run=' + (++run));
  const $ = (id) => env.document.getElementById(id);
  return Object.assign(env, { $ });
}

test('список ігор на сайті збігається зі списком, який приймає сервер (GAMES у server.js)', () => {
  assert.deepEqual(Object.keys(REGISTRY).sort(), SERVER_GAMES.slice().sort());
});

test('для кожної гри існує файл public/js/games/<id>.js', () => {
  for (const id of Object.keys(REGISTRY)) {
    assert.ok(fs.existsSync(path.join(PUBLIC, 'js', 'games', id + '.js')), 'немає js/games/' + id + '.js');
  }
});

test('у кожної гри заповнені всі тексти, номери ігор унікальні', () => {
  for (const [id, g] of Object.entries(REGISTRY)) {
    for (const key of ['title', 'n', 'label', 'color', 'aside', 'text', 'foot']) {
      assert.ok(typeof g[key] === 'string' && g[key].trim(), `${id}: порожнє поле ${key}`);
    }
    assert.match(g.color, /^var\(--color-[\w-]+\)$/, `${id}: колір має бути CSS-змінною з tokens.css`);
  }
  const numbers = Object.values(REGISTRY).map((g) => g.n);
  assert.equal(new Set(numbers).size, numbers.length);
});

test('кольори ігор існують у public/tokens.css', () => {
  const css = fs.readFileSync(path.join(PUBLIC, 'tokens.css'), 'utf8');
  for (const [id, g] of Object.entries(REGISTRY)) {
    const name = /var\((--[\w-]+)\)/.exec(g.color)[1];
    assert.ok(css.includes(name + ':'), `${id}: у tokens.css немає ${name}`);
  }
});

for (const id of Object.keys(REGISTRY)) {
  test(`?g=${id} — сторінка заповнюється, модуль гри завантажується і гра запускається`, async () => {
    const env = await openPage('?g=' + id);
    const g = REGISTRY[id];
    assert.equal(env.document.title, g.title + ' — ЛяСторія');
    assert.equal(env.$('gameTitle').textContent, g.title);
    assert.equal(env.$('gameLabel').textContent, g.n + ' / ' + g.label);
    assert.equal(env.$('asideTitle').textContent, g.aside);
    assert.equal(env.$('asideText').textContent, g.text);
    assert.equal(env.$('asideFoot').textContent, g.n + ' / ' + g.foot);
    assert.equal(env.$('gamePage').style['--game'], g.color);
    const root = env.$('gameRoot');
    await waitFor(() => root.querySelector('.panel') || root.textContent);
    assert.notEqual(root.textContent, 'Не вдалося завантажити гру.', 'модуль гри не завантажився: ' + env.consoleErrors.join('; '));
    assert.ok(root.querySelector('.panel'), 'гра змонтувалась у #gameRoot');
  });
}

for (const search of ['', '?g=', '?g=unknown', '?g=../../server/server', '?g=quiz.js', '?g=QUIZ', '?g=constructor', '?g=__proto__', '?g=toString']) {
  test(`«${search || '(без параметра)'}» → «Таку гру не знайдено.», заголовок не змінюється`, async () => {
    const env = await openPage(search);
    assert.equal(env.$('gameRoot').textContent, 'Таку гру не знайдено.');
    assert.equal(env.document.title, '');
    assert.equal(env.$('gameTitle').textContent, '');
  });
}
