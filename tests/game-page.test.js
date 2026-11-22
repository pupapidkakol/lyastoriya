'use strict';
// Сторінка гри (game-page.js): білий список ігор, заповнення сторінки, захист від підстановки id.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { PUBLIC, createEnv, flush, extractLiteral } = require('./helpers/browser-env');

const REGISTRY = extractLiteral('public/js/game-page.js', 'REGISTRY');
const SERVER_GAMES = extractLiteral('server/server.js', 'GAMES');
const IDS = ['gamePage', 'gameRoot', 'gameTitle', 'gameLabel', 'asideTitle', 'asideText', 'asideFoot'];

function openPage(search) {
  const env = createEnv({ search });
  for (const id of IDS) {
    const e = env.document.createElement('div');
    e.id = id;
    env.document.body.appendChild(e);
  }
  env.run('js/game-page.js');
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
  test(`?g=${id} — сторінка заповнюється, гра підвантажується і запускається`, async () => {
    const env = openPage('?g=' + id);
    const g = REGISTRY[id];
    assert.equal(env.document.title, g.title + ' — ЛяСторія');
    assert.equal(env.$('gameTitle').textContent, g.title);
    assert.equal(env.$('gameLabel').textContent, g.n + ' / ' + g.label);
    assert.equal(env.$('asideTitle').textContent, g.aside);
    assert.equal(env.$('asideText').textContent, g.text);
    assert.equal(env.$('asideFoot').textContent, g.n + ' / ' + g.foot);
    assert.equal(env.$('gamePage').style['--game'], g.color);
    const scripts = env.document.querySelectorAll('script');
    assert.deepEqual(scripts.map((s) => s.src), ['js/games/' + id + '.js']);
    await flush();
    assert.ok(env.$('gameRoot').querySelector('.panel'), 'гра змонтувалась у #gameRoot');
  });
}

for (const search of ['', '?g=', '?g=unknown', '?g=../../server/server', '?g=quiz.js', '?g=QUIZ', '?g=constructor', '?g=__proto__', '?g=toString']) {
  test(`«${search || '(без параметра)'}» → «Таку гру не знайдено.», жоден скрипт не підключається`, () => {
    const env = openPage(search);
    assert.equal(env.$('gameRoot').textContent, 'Таку гру не знайдено.');
    assert.equal(env.document.querySelectorAll('script').length, 0);
  });
}
