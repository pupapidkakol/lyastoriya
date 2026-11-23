// «Коли це сталося?» (timeline.js): нарахування балів, тексти, повзунок і кнопки ±.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { mountGame, flush, findByText, readJson } from './helpers/browser-env.js';

const REAL = readJson('data/timeline-events.json');

// Контрольовані дані: 4 події з точним роком 1500 і одна з діапазоном 1600–1610.
const ev = (id, from, to) => ({ id, title: 'Подія ' + id, text: 'Опис ' + id, from, to, fact: 'Факт ' + id, sources: [] });
const CONTROLLED = {
  meta: { min: 900, max: 2000 },
  events: [ev('a', 1500, 1500), ev('b', 1500, 1500), ev('c', 1500, 1500), ev('d', 1500, 1500), ev('r', 1600, 1610)]
};
const serve = (data) => ({ fetch: () => ({ ok: true, status: 200, json: () => Promise.resolve(data) }) });

async function startGame(data) {
  const g = await mountGame('timeline', data ? serve(data) : undefined);
  await flush();
  findByText(g.panel(), 'button', 'Почати').click();
  return g;
}
function eventOnScreen(g, data) {
  const title = g.panel().querySelector('.tl-event h2').textContent;
  return data.events.find((e) => e.title === title);
}
function setYear(g, year) {
  const r = g.panel().querySelector('.tl-range');
  r.value = String(year);
  r.dispatchEvent('input');
}
function shownYear(g) { return g.panel().querySelector('.tl-year span').textContent; }
function confirm(g) { findByText(g.panel(), 'button', 'Підтвердити').click(); }
function byAria(g, label) {
  const b = g.panel().querySelectorAll('button').find((x) => x.getAttribute('aria-label') === label);
  assert.ok(b, 'немає кнопки з aria-label «' + label + '»');
  return b;
}
// Перший раунд, де показана подія з точним роком 1500 (або з діапазоном — якщо range=true)
async function startOn(range) {
  for (let i = 0; i < 200; i++) {
    const g = await startGame(CONTROLLED);
    const e = eventOnScreen(g, CONTROLLED);
    if ((e.from !== e.to) === range) return { g, e };
  }
  throw new Error('не вдалося отримати потрібну подію');
}

describe('Коли це сталося? (timeline.js)', () => {
  // Таблиця: помилка в роках → бали (до 2 років — 20, від 100 — 0, між ними пропорційно, з округленням)
  const TABLE = [
    [0, 20], [1, 20], [2, 20], [3, 20], [10, 18], [51, 10], [75, 5], [99, 0], [100, 0], [450, 0]
  ];
  for (const [err, pts] of TABLE) {
    test(`помилка ${err} р. → ${pts} балів`, async () => {
      const { g, e } = await startOn(false);
      setYear(g, e.from - err);
      confirm(g);
      assert.equal(g.panel().querySelector('.tl-result .tl-pts').textContent, '+' + pts + ' / 20');
    });
  }

  test('бали не зростають зі збільшенням помилки', () => {
    for (let i = 1; i < TABLE.length; i++) assert.ok(TABLE[i][1] <= TABLE[i - 1][1]);
  });

  test('будь-який рік усередині діапазону from–to — повні бали і «Влучно!»', async () => {
    for (const year of [1600, 1605, 1610]) {
      const { g } = await startOn(true);
      setYear(g, year);
      confirm(g);
      assert.equal(g.panel().querySelector('.tl-verdict b').textContent, 'Влучно!');
      assert.equal(g.panel().querySelector('.tl-result .tl-pts').textContent, '+20 / 20');
    }
  });

  test('помилка рахується від найближчого краю діапазону', async () => {
    const { g } = await startOn(true);
    setYear(g, 1620); // до 1610 — 10 років
    confirm(g);
    assert.equal(g.panel().querySelector('.tl-verdict b').textContent, 'Помилка: 10 років');
  });

  test('точний рік для однозначної події → «Точно в ціль!»', async () => {
    const { g } = await startOn(false);
    setYear(g, 1500);
    confirm(g);
    assert.equal(g.panel().querySelector('.tl-verdict b').textContent, 'Точно в ціль!');
  });

  // Правильні відмінки: 1 рік, 2 роки, 5 років, 11 років, 21 рік, 22 роки, 51 рік
  const TITLES = [
    [1, 'Майже ідеально — 1 рік різниці'],
    [2, 'Майже ідеально — 2 роки різниці'],
    [5, 'Помилка: 5 років'],
    [11, 'Помилка: 11 років'],
    [12, 'Помилка: 12 років'],
    [21, 'Помилка: 21 рік'],
    [22, 'Помилка: 22 роки'],
    [51, 'Помилка: 51 рік'],
    [111, 'Помилка: 111 років']
  ];
  for (const [err, title] of TITLES) {
    test(`текст вердикту: «${title}»`, async () => {
      const { g, e } = await startOn(false);
      setYear(g, e.from + err);
      confirm(g);
      assert.equal(g.panel().querySelector('.tl-verdict b').textContent, title);
    });
  }

  test('повзунок стартує з середини шкали, кнопки ±1/±10 змінюють рік', async () => {
    const g = await startGame(CONTROLLED);
    assert.equal(shownYear(g), '1450'); // (900 + 2000) / 2
    byAria(g, 'Збільшити рік на 10 років').click();
    assert.equal(shownYear(g), '1460');
    byAria(g, 'Зменшити рік на 1 рік').click();
    assert.equal(shownYear(g), '1459');
    byAria(g, 'Збільшити рік на 1 рік').click();
    byAria(g, 'Зменшити рік на 10 років').click();
    assert.equal(shownYear(g), '1450');
  });

  test('рік не виходить за межі шкали', async () => {
    const g = await startGame(CONTROLLED);
    setYear(g, 3000);
    assert.equal(shownYear(g), '2000');
    byAria(g, 'Збільшити рік на 10 років').click();
    assert.equal(shownYear(g), '2000');
    setYear(g, 100);
    assert.equal(shownYear(g), '900');
    byAria(g, 'Зменшити рік на 10 років').click();
    assert.equal(shownYear(g), '900');
  });

  test('після «Підтвердити» повзунок і кнопки ± вимкнені, кнопка «Підтвердити» зникає', async () => {
    const g = await startGame(CONTROLLED);
    confirm(g);
    const panel = g.panel();
    assert.ok(panel.querySelector('.tl-range').disabled);
    assert.ok(panel.querySelectorAll('.tl-nudge button').every((b) => b.disabled));
    assert.ok(!panel.querySelectorAll('button').some((b) => b.textContent === 'Підтвердити'));
  });

  test('повна гра на справжніх даних з точними відповідями → 100 / 100, підсумок з 5 подій, результат збережено', async () => {
    const g = await startGame();
    const titles = [];
    for (let round = 1; round <= 5; round++) {
      const e = eventOnScreen(g, REAL);
      assert.ok(e, 'подія на екрані є в JSON');
      titles.push(e.title);
      setYear(g, e.from);
      confirm(g);
      findByText(g.panel(), 'button', round < 5 ? 'Наступна подія' : 'Результат').click();
    }
    assert.equal(new Set(titles).size, 5, 'події в грі не повторюються');
    assert.equal(g.panel().querySelector('.big').textContent, '100 / 100');
    assert.match(g.panel().textContent, /Блискуче відчуття часу\./);
    assert.equal(g.panel().querySelector('.tl-recap').children.length, 5);
    assert.deepEqual(g.saved, [{ game: 'timeline', score: 100, total: 100 }]);
  });

  test('помилка завантаження або замало подій → повідомлення', async () => {
    const g1 = await mountGame('timeline', { fetch: () => ({ ok: false, status: 404, json: () => Promise.resolve({}) }) });
    await flush();
    assert.match(g1.panel().textContent, /Не вдалося завантажити події/);

    const g2 = await mountGame('timeline', serve({ meta: CONTROLLED.meta, events: CONTROLLED.events.slice(0, 4) }));
    await flush();
    assert.match(g2.panel().textContent, /Не вдалося завантажити події/);
  });

  test('стилі гри підключаються один раз', async () => {
    const g = await mountGame('timeline', serve(CONTROLLED));
    g.mod.mount(g.document.createElement('div'));
    assert.equal(g.document.querySelectorAll('link[data-game-css="timeline"]').length, 1);
  });
});
