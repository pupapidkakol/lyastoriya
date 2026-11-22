'use strict';
// API сервера (server/server.js): реєстрація, вхід, сесії, результати, захист.
// Сервер запускається на випадковому порту з ТИМЧАСОВОЮ базою в папці temp —
// справжня server/data/app.db не змінюється.
const { describe, test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const Module = require('module');
const { ROOT } = require('./helpers/browser-env');

const SERVER_DIR = path.join(ROOT, 'server');

function skipReason() {
  if (!fs.existsSync(path.join(SERVER_DIR, 'node_modules', 'express'))) {
    return 'немає server/node_modules — один раз виконай: cd server; npm install';
  }
  try { require('node:sqlite'); } catch { return 'потрібен Node.js 22.13 або новіший (вбудований node:sqlite)'; }
  return false;
}

const USER = { username: 'tester_1', email: 'Tester1@Example.com', password: 'correct-horse-42' };
const SECRET = 'SECRET-FILE-MUST-NOT-BE-SERVED';

let server, base, tmp, dbFile;

async function call(method, p, { body, raw, cookie, headers = {} } = {}) {
  const h = Object.assign({}, headers);
  if (body !== undefined && !('content-type' in h)) h['content-type'] = 'application/json';
  if (cookie) h.cookie = cookie;
  const res = await fetch(base + p, {
    method,
    headers: h,
    body: raw !== undefined ? raw : body !== undefined ? JSON.stringify(body) : undefined
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* не JSON */ }
  return { status: res.status, json, text, headers: res.headers, cookies: res.headers.getSetCookie() };
}
const sidOf = (r) => { const c = r.cookies.find((x) => x.startsWith('sid=')); return c ? c.split(';')[0] : null; };

describe('API сервера', { skip: skipReason() }, () => {
  let cookie; // сесія USER

  before(async () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lyastoriya-test-'));
    const fakeServerDir = path.join(tmp, 'server');
    fs.mkdirSync(fakeServerDir);
    // Сервер віддає статику з ../public — кладемо туди тестову сторінку і «секретний» файл поруч
    fs.mkdirSync(path.join(tmp, 'public'));
    fs.writeFileSync(path.join(tmp, 'public', 'index.html'), '<!doctype html><title>test-page</title>');
    fs.writeFileSync(path.join(fakeServerDir, 'secret.txt'), SECRET);

    process.env.PORT = '0';           // випадковий вільний порт
    process.env.NODE_ENV = 'test';
    const origCreate = http.createServer;
    http.createServer = function (...args) { server = origCreate.apply(this, args); return server; };
    try {
      // Запускаємо справжній server.js, але так, ніби він лежить у тимчасовій папці
      const file = path.join(fakeServerDir, 'server.js');
      const m = new Module(file, module);
      m.filename = file;
      m.paths = Module._nodeModulePaths(SERVER_DIR); // express та ін. — з server/node_modules
      m._compile(fs.readFileSync(path.join(SERVER_DIR, 'server.js'), 'utf8'), file);
    } finally {
      http.createServer = origCreate;
    }
    if (!server.listening) await new Promise((r) => server.once('listening', r));
    base = 'http://127.0.0.1:' + server.address().port;
    dbFile = path.join(fakeServerDir, 'data', 'app.db');
  });

  after(async () => {
    if (server) {
      if (server.closeAllConnections) server.closeAllConnections();
      await new Promise((r) => server.close(r));
    }
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* файл БД може бути ще відкритий — це тимчасова папка */ }
  });

  // ---- Реєстрація ---- (увага: на /register і /login разом діє ліміт 10 запитів за 15 хв)
  test('GET /api/me без входу → { user: null }', async () => {
    const r = await call('GET', '/api/me');
    assert.equal(r.status, 200);
    assert.deepEqual(r.json, { user: null });
  });

  test('реєстрація з коректними даними → 201 і cookie сесії HttpOnly + SameSite=Strict', async () => {
    const r = await call('POST', '/api/register', { body: USER });
    assert.equal(r.status, 201);
    assert.deepEqual(r.json, { user: { username: USER.username } });
    const c = r.cookies.find((x) => x.startsWith('sid='));
    assert.ok(c, 'є cookie sid');
    assert.match(c, /HttpOnly/i);
    assert.match(c, /SameSite=Strict/i);
    assert.match(c, /Path=\//);
    cookie = sidOf(r);
  });

  test('повторна реєстрація: те саме ім’я в іншому регістрі → 409', async () => {
    const r = await call('POST', '/api/register', { body: { username: 'TESTER_1', email: 'other@example.com', password: USER.password } });
    assert.equal(r.status, 409);
    assert.equal(r.json.error, 'Таке ім’я або email уже зайняті.');
  });

  test('повторна реєстрація: той самий email в іншому регістрі → 409', async () => {
    const r = await call('POST', '/api/register', { body: { username: 'tester_2', email: 'TESTER1@example.COM', password: USER.password } });
    assert.equal(r.status, 409);
  });

  test('некоректні дані реєстрації → 400 з поясненням', async () => {
    const cases = [
      [{ username: 'ab', email: 'a@b.ua', password: USER.password }, /Ім’я: 3–20 символів/],
      [{ username: 'good_name', email: 'not-an-email', password: USER.password }, /Некоректний email/],
      [{ username: 'good_name', email: 'a@b.ua', password: 'short' }, /Пароль: від 10 символів/]
    ];
    for (const [body, msg] of cases) {
      const r = await call('POST', '/api/register', { body });
      assert.equal(r.status, 400, JSON.stringify(body));
      assert.match(r.json.error, msg);
    }
  });

  test('у базі — bcrypt-хеш пароля і SHA-256 хеш токена, а не відкриті значення', () => {
    const { DatabaseSync } = require('node:sqlite');
    const db = new DatabaseSync(dbFile);
    try {
      const u = db.prepare('SELECT password_hash, email FROM users WHERE username = ?').get(USER.username);
      assert.match(u.password_hash, /^\$2[aby]\$12\$/);
      assert.ok(!u.password_hash.includes(USER.password));
      assert.equal(u.email, USER.email.toLowerCase(), 'email зберігається в нижньому регістрі');
      const token = cookie.slice('sid='.length);
      const hashes = db.prepare('SELECT token_hash FROM sessions').all().map((s) => s.token_hash);
      assert.ok(hashes.includes(crypto.createHash('sha256').update(token).digest('hex')));
      assert.ok(!hashes.includes(token));
    } finally {
      db.close();
    }
  });

  // ---- Вхід ----
  test('вхід з неправильним паролем і з неіснуючим email → однакова відповідь 401', async () => {
    const wrong = await call('POST', '/api/login', { body: { email: USER.email, password: 'wrong-password-1' } });
    const unknown = await call('POST', '/api/login', { body: { email: 'nobody@example.com', password: 'whatever-123' } });
    assert.equal(wrong.status, 401);
    assert.equal(unknown.status, 401);
    assert.deepEqual(wrong.json, unknown.json);
    assert.equal(wrong.cookies.length, 0, 'cookie не видається');
  });

  test('вхід з правильними даними (email у будь-якому регістрі) → 200 і нова сесія', async () => {
    const r = await call('POST', '/api/login', { body: { email: USER.email.toUpperCase(), password: USER.password } });
    assert.equal(r.status, 200);
    assert.deepEqual(r.json, { user: { username: USER.username } });
    assert.ok(sidOf(r));
    assert.notEqual(sidOf(r), cookie, 'кожен вхід — новий токен');
  });

  // ---- Профіль і результати ----
  test('GET /api/me з cookie → ім’я і нульова статистика', async () => {
    const r = await call('GET', '/api/me', { cookie });
    assert.deepEqual(r.json, { user: { username: USER.username }, stats: { games: 0, kinds: 0, correctPct: 0 } });
  });

  test('POST /api/results без входу → 401', async () => {
    const r = await call('POST', '/api/results', { body: { game: 'quiz', score: 5, total: 10 } });
    assert.equal(r.status, 401);
    assert.equal(r.json.error, 'Потрібен вхід');
  });

  test('збереження результатів і підрахунок статистики', async () => {
    assert.equal((await call('POST', '/api/results', { cookie, body: { game: 'quiz', score: 7, total: 10 } })).status, 201);
    assert.equal((await call('POST', '/api/results', { cookie, body: { game: 'chronology', score: 3, total: 5 } })).status, 201);
    assert.equal((await call('POST', '/api/results', { cookie, body: { game: 'quiz', score: 0, total: 10 } })).status, 201);
    const r = await call('GET', '/api/me', { cookie });
    // (7 + 3 + 0) / (10 + 5 + 10) = 40 %
    assert.deepEqual(r.json.stats, { games: 3, kinds: 2, correctPct: 40 });
  });

  test('межові значення результату приймаються: 0 з 1 і 100 зі 100', async () => {
    assert.equal((await call('POST', '/api/results', { cookie, body: { game: 'timeline', score: 0, total: 1 } })).status, 201);
    assert.equal((await call('POST', '/api/results', { cookie, body: { game: 'timeline', score: 100, total: 100 } })).status, 201);
  });

  test('некоректний результат → 400', async () => {
    const bad = [
      { game: 'snake', score: 1, total: 10 },
      { game: 'quiz', score: 11, total: 10 },
      { game: 'quiz', score: -1, total: 10 },
      { game: 'quiz', score: 0, total: 0 },
      { game: 'quiz', score: 5, total: 101 },
      { game: 'quiz', score: 7.5, total: 10 },
      { game: 'quiz', score: '7', total: 10 },
      { game: 'quiz', score: 7 },
      {}
    ];
    for (const body of bad) {
      const r = await call('POST', '/api/results', { cookie, body });
      assert.equal(r.status, 400, JSON.stringify(body));
      assert.equal(r.json.error, 'Некоректний результат.');
    }
  });

  // ---- Захист ----
  test('POST не у форматі JSON → 415', async () => {
    const r = await call('POST', '/api/results', { cookie, raw: 'game=quiz', headers: { 'content-type': 'text/plain' } });
    assert.equal(r.status, 415);
  });

  test('POST з чужого сайту (інший Origin) → 403; зі свого — дозволено', async () => {
    const foreign = await call('POST', '/api/results', { cookie, body: { game: 'quiz', score: 1, total: 10 }, headers: { origin: 'https://evil.example' } });
    assert.equal(foreign.status, 403);
    const own = await call('POST', '/api/results', { cookie, body: { game: 'quiz', score: 1, total: 10 }, headers: { origin: base } });
    assert.equal(own.status, 201);
  });

  test('зламаний JSON і завеликий запит (> 10 КБ) → 400', async () => {
    const broken = await call('POST', '/api/results', { cookie, raw: '{"game":', headers: { 'content-type': 'application/json' } });
    assert.equal(broken.status, 400);
    assert.equal(broken.json.error, 'Некоректний запит');
    const big = await call('POST', '/api/results', { cookie, body: { game: 'quiz', score: 1, total: 10, pad: 'x'.repeat(20000) } });
    assert.equal(big.status, 400);
  });

  test('невідомий маршрут API → 404 JSON', async () => {
    const r = await call('GET', '/api/nothing-here');
    assert.equal(r.status, 404);
    assert.deepEqual(r.json, { error: 'Не знайдено' });
  });

  test('захисні заголовки: немає X-Powered-By, є CSP і nosniff', async () => {
    const r = await call('GET', '/api/me');
    assert.equal(r.headers.get('x-powered-by'), null);
    assert.match(r.headers.get('content-security-policy') || '', /script-src 'self'/);
    assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
  });

  test('статика: сторінки з public віддаються, файли поза public — ні', async () => {
    const page = await call('GET', '/index.html');
    assert.equal(page.status, 200);
    assert.match(page.text, /test-page/);
    for (const p of ['/..%2fserver%2fsecret.txt', '/%2e%2e%2fserver%2fsecret.txt', '/server/secret.txt']) {
      const r = await call('GET', p);
      assert.notEqual(r.status, 200, p);
      assert.ok(!r.text.includes(SECRET), 'секретний файл не віддається: ' + p);
    }
  });

  // ---- Вихід ----
  test('вихід → cookie видаляється, стара сесія більше не діє', async () => {
    const r = await call('POST', '/api/logout', { cookie, body: {} });
    assert.equal(r.status, 200);
    assert.deepEqual(r.json, { ok: true });
    assert.ok(r.cookies.some((c) => /^sid=;/.test(c)), 'cookie sid очищено');
    const me = await call('GET', '/api/me', { cookie });
    assert.deepEqual(me.json, { user: null });
  });

  // ---- Ліміт спроб (має бути останнім: «з’їдає» ліміт на вхід/реєстрацію) ----
  test('забагато спроб входу/реєстрації → 429', async () => {
    let limited = null;
    for (let i = 0; i < 12 && !limited; i++) {
      const r = await call('POST', '/api/login', { body: { email: 'nobody@example.com', password: 'whatever-123' } });
      if (r.status === 429) limited = r;
    }
    assert.ok(limited, 'після 10 спроб має бути 429');
    assert.equal(limited.json.error, 'Забагато спроб. Спробуй за 15 хвилин.');
  });
});
