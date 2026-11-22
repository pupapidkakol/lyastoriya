'use strict';
// Логіка ігор: проходимо гру «як користувач» і перевіряємо рахунок, тексти та збереження результату.
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { mountGame, flush, findByText, extractLiteral, readJson } = require('./helpers/browser-env');

const fail = (status) => () => Promise.reject(Object.assign(new Error('fail'), { status }));

// Спільні перевірки екрана результату для всіх ігор
async function checkSaveErrors(play) {
  const g401 = await play({ saveResult: fail(401) });
  await flush();
  assert.match(g401.panel().textContent, /Увійди в акаунт, щоб зберігати результати/);
  assert.equal(g401.panel().querySelector('a.link').href, 'auth.html#login');

  const g500 = await play({ saveResult: fail(500) });
  await flush();
  assert.match(g500.panel().textContent, /Результат не збережено — сервер недоступний/);
}

// ===========================================================================
describe('Квіз (quiz.js)', () => {
  const QUIZ = readJson('data/questions(1).json');

  // answerCorrect(n) → чи відповідати правильно на n-те запитання (1..10)
  async function playQuiz(answerCorrect, options) {
    const g = mountGame('quiz', options);
    await flush();
    findByText(g.panel(), 'button', 'Почати').click();
    const seen = [];
    for (let n = 1; n <= 10; n++) {
      const panel = g.panel();
      assert.ok(panel.textContent.includes(n + ' / 10'), 'лічильник запитань ' + n);
      const text = panel.querySelector('.q-text').textContent;
      const q = QUIZ.questions.find((x) => x.text === text);
      assert.ok(q, 'запитання на екрані є в JSON: ' + text);
      seen.push(q);
      const ok = answerCorrect(n);
      const option = q.options.find((o) => (ok ? o.id === q.correct : o.id !== q.correct));
      findByText(panel, '.quiz-answers button', option.text).click();
      panel.querySelector('.verdict button').click();
    }
    return Object.assign(g, { seen });
  }

  test('спочатку «Завантажуємо…», після завантаження — тема і кількість запитань', async () => {
    const g = mountGame('quiz');
    assert.match(g.panel().textContent, /Завантажуємо запитання/);
    await flush();
    assert.deepEqual(g.fetchCalls, ['data/questions(1).json']);
    const text = g.panel().textContent;
    assert.ok(text.includes('Тема: ' + QUIZ.topic), 'показано тему');
    assert.ok(text.includes('У базі ' + QUIZ.questions.length + ' запитань'), 'показано кількість');
  });

  test('усі відповіді правильні → 10 / 10, «Відмінно!», результат збережено', async () => {
    const g = await playQuiz(() => true);
    assert.equal(g.panel().querySelector('.big').textContent, '10 / 10');
    assert.match(g.panel().textContent, /Відмінно!/);
    assert.deepEqual(g.saved, [{ game: 'quiz', score: 10, total: 10 }]);
    await flush();
    assert.match(g.panel().textContent, /Результат збережено у твоєму профілі/);
  });

  test('6 правильних → 6 / 10, «Непогано!»', async () => {
    const g = await playQuiz((n) => n <= 6);
    assert.equal(g.panel().querySelector('.big').textContent, '6 / 10');
    assert.match(g.panel().textContent, /Непогано!/);
    assert.deepEqual(g.saved, [{ game: 'quiz', score: 6, total: 10 }]);
  });

  test('усі відповіді неправильні → 0 / 10, «Спробуй ще раз.»', async () => {
    const g = await playQuiz(() => false);
    assert.equal(g.panel().querySelector('.big').textContent, '0 / 10');
    assert.match(g.panel().textContent, /Спробуй ще раз\./);
    assert.deepEqual(g.saved, [{ game: 'quiz', score: 0, total: 10 }]);
  });

  test('у раунді 10 різних запитань (без повторів)', async () => {
    const g = await playQuiz(() => true);
    assert.equal(new Set(g.seen.map((q) => q.id)).size, 10);
  });

  test('після відповіді всі кнопки вимикаються, показується вердикт і пояснення', async () => {
    const g = mountGame('quiz');
    await flush();
    findByText(g.panel(), 'button', 'Почати').click();
    const panel = g.panel();
    const q = QUIZ.questions.find((x) => x.text === panel.querySelector('.q-text').textContent);
    const wrong = q.options.find((o) => o.id !== q.correct);
    findByText(panel, '.quiz-answers button', wrong.text).click();

    assert.ok(panel.querySelectorAll('.quiz-answers button').every((b) => b.disabled), 'кнопки вимкнені');
    assert.equal(panel.querySelector('.verdict b').textContent, 'Не зовсім.');
    const correctText = q.options.find((o) => o.id === q.correct).text;
    assert.equal(panel.querySelector('.verdict .hint').textContent, q.explanation || ('Правильна відповідь: ' + correctText));
  });

  test('картинка й джерела: правильний шлях, посилання лише http(s) з rel="noopener noreferrer"', async () => {
    const g = mountGame('quiz');
    await flush();
    findByText(g.panel(), 'button', 'Почати').click();
    for (let n = 1; n <= 10; n++) {
      const panel = g.panel();
      const q = QUIZ.questions.find((x) => x.text === panel.querySelector('.q-text').textContent);
      const img = panel.querySelector('.quiz-image img');
      if (q.image && q.image.file) assert.equal(img && img.src, 'images/' + encodeURIComponent(q.image.file));
      findByText(panel, '.quiz-answers button', q.options[0].text).click();

      const links = panel.querySelectorAll('.verdict a');
      const httpSources = (q.sources || []).filter((s) => /^https?:/i.test(s.url || ''));
      assert.equal(links.length, httpSources.length, `запитання ${q.id}: кількість посилань на джерела`);
      for (const a of links) {
        assert.equal(a.rel, 'noopener noreferrer');
        assert.equal(a.target, '_blank');
      }
      panel.querySelector('.verdict button').click();
    }
  });

  test('«Грати ще» запускає новий раунд з першого запитання', async () => {
    const g = await playQuiz(() => true);
    findByText(g.panel(), 'button', 'Грати ще').click();
    assert.ok(g.panel().textContent.includes('1 / 10'));
  });

  test('помилка завантаження (HTTP 500) → повідомлення для користувача', async () => {
    const g = mountGame('quiz', { fetch: () => ({ ok: false, status: 500, json: () => Promise.resolve({}) }) });
    await flush();
    assert.match(g.panel().textContent, /Не вдалося завантажити запитання/);
  });

  test('зіпсовані дані (менше 10 запитань / немає правильної відповіді) → повідомлення', async () => {
    const few = { topic: 'Т', questions: QUIZ.questions.slice(0, 9) };
    const g1 = mountGame('quiz', { fetch: () => ({ ok: true, status: 200, json: () => Promise.resolve(few) }) });
    await flush();
    assert.match(g1.panel().textContent, /Не вдалося завантажити запитання/);

    const broken = JSON.parse(JSON.stringify(QUIZ));
    broken.questions[0].correct = 'немає-такого';
    const g2 = mountGame('quiz', { fetch: () => ({ ok: true, status: 200, json: () => Promise.resolve(broken) }) });
    await flush();
    assert.match(g2.panel().textContent, /Не вдалося завантажити запитання/);
  });

  test('не вдалося зберегти результат: 401 → посилання «Увійти», інша помилка → «сервер недоступний»', async () => {
    await checkSaveErrors((options) => playQuiz(() => true, options));
  });
});

// ===========================================================================
describe('Фейк чи факт (fake-or-fact.js)', () => {
  const DATA = readJson('data/fake-or-fact.json');
  const ERA = extractLiteral('public/js/games/fake-or-fact.js', 'ERA');

  async function playFof(answerCorrect, options) {
    const g = mountGame('fake-or-fact', options);
    await flush();
    findByText(g.panel(), 'button', 'Почати').click();
    for (let n = 1; n <= 10; n++) {
      const panel = g.panel();
      const q = DATA.find((x) => x[1] === panel.querySelector('.q-text').textContent);
      assert.ok(q, 'твердження є в JSON');
      assert.ok(panel.querySelector('.q-meta').textContent.startsWith(ERA[q[0]]), 'показано епоху');
      const isFact = q[2] === 1;
      const choice = answerCorrect(n) === isFact ? 'Факт' : 'Фейк';
      findByText(panel, '.fact-answers button', choice).click();
      const verdict = panel.querySelector('.verdict b').textContent;
      assert.equal(verdict, (answerCorrect(n) ? 'Правильно. ' : 'Не зовсім. ') + (isFact ? 'Це факт.' : 'Це фейк.'));
      assert.equal(panel.querySelector('.verdict .hint').textContent, q[3], 'показано пояснення');
      panel.querySelector('.verdict button').click();
    }
    return g;
  }

  test('усі правильно → 10 / 10, результат збережено', async () => {
    const g = await playFof(() => true);
    assert.equal(g.panel().querySelector('.big').textContent, '10 / 10');
    assert.match(g.panel().textContent, /Відмінно, ти добре знаєш історію\./);
    assert.deepEqual(g.saved, [{ game: 'fake-or-fact', score: 10, total: 10 }]);
  });

  test('7 правильних → 7 / 10, «Непогано»', async () => {
    const g = await playFof((n) => n <= 7);
    assert.equal(g.panel().querySelector('.big').textContent, '7 / 10');
    assert.match(g.panel().textContent, /Непогано, є що повторити\./);
  });

  test('усі неправильно → 0 / 10', async () => {
    const g = await playFof(() => false);
    assert.equal(g.panel().querySelector('.big').textContent, '0 / 10');
    assert.match(g.panel().textContent, /Гарний початок\. Спробуй ще раз\./);
  });

  test('після відповіді обидві кнопки вимкнені', async () => {
    const g = mountGame('fake-or-fact');
    await flush();
    findByText(g.panel(), 'button', 'Почати').click();
    findByText(g.panel(), '.fact-answers button', 'Факт').click();
    assert.ok(g.panel().querySelectorAll('.fact-answers button').every((b) => b.disabled));
  });

  test('зіпсовані дані (невідома епоха) → повідомлення', async () => {
    const bad = DATA.map((q) => q.slice());
    bad[0][0] = 'mars';
    const g = mountGame('fake-or-fact', { fetch: () => ({ ok: true, status: 200, json: () => Promise.resolve(bad) }) });
    await flush();
    assert.match(g.panel().textContent, /Не вдалося завантажити твердження/);
  });

  test('не вдалося зберегти результат: 401 / інша помилка', async () => {
    await checkSaveErrors((options) => playFof(() => true, options));
  });
});

// ===========================================================================
describe('Хронологічний виклик (chronology.js)', () => {
  const EV = extractLiteral('public/js/games/chronology.js', 'EV');
  const MONTHS = ['січня', 'лютого', 'березня', 'квітня', 'травня', 'червня', 'липня', 'серпня', 'вересня', 'жовтня', 'листопада', 'грудня'];

  test('дані: ключ сортування YYYYMMDD збігається з підписом дати', () => {
    for (const [key, name, label] of EV) {
      const m = /^(\d{1,2}) (\S+) (\d{4})$/.exec(label);
      assert.ok(m, `«${name}»: незрозумілий формат дати «${label}»`);
      const month = MONTHS.indexOf(m[2]) + 1;
      assert.ok(month > 0, `«${name}»: невідомий місяць «${m[2]}»`);
      assert.equal(key, Number(m[3]) * 10000 + month * 100 + Number(m[1]), `«${name}»: ключ ${key} ≠ «${label}»`);
    }
  });

  test('дані: немає подій з однаковою датою чи назвою (інакше порядок неоднозначний)', () => {
    assert.equal(new Set(EV.map((e) => e[0])).size, EV.length);
    assert.equal(new Set(EV.map((e) => e[1])).size, EV.length);
  });

  // mistakesPerRound — скільки разів у кожному раунді натиснути не ту подію
  function playChronology(mistakesPerRound, options) {
    const g = mountGame('chronology', options);
    findByText(g.panel(), 'button', 'Почати').click();
    for (let round = 1; round <= 3; round++) {
      const panel = g.panel();
      assert.ok(panel.textContent.includes('Раунд ' + round + ' / 3'));
      const buttons = panel.querySelectorAll('.events button');
      assert.equal(buttons.length, 5, 'у раунді 5 подій');
      const events = buttons.map((b) => ({ b, ev: EV.find((e) => e[1] === b.textContent) }));
      assert.equal(new Set(events.map((x) => x.ev[1])).size, 5, 'події в раунді не повторюються');
      events.sort((a, b) => a.ev[0] - b.ev[0]);
      for (let k = 0; k < mistakesPerRound; k++) events[4].b.click(); // найпізніша — завжди не перша
      events.forEach(({ b, ev }) => {
        b.click();
        assert.ok(b.classList.contains('done') && b.disabled, 'правильна подія позначена');
        assert.ok(b.textContent.endsWith(ev[2]), 'після кліку показано дату');
      });
      findByText(panel, 'button', round < 3 ? 'Наступний раунд' : 'Результат').click();
    }
    return g;
  }

  test('без помилок → 15 / 15, «Бездоганно», результат збережено', () => {
    const g = playChronology(0);
    assert.equal(g.panel().querySelector('.big').textContent, '15 / 15');
    assert.match(g.panel().textContent, /Бездоганно: жодної помилки\./);
    assert.deepEqual(g.saved, [{ game: 'chronology', score: 15, total: 15 }]);
  });

  test('по одній помилці в раунді → 12 / 15, «Добре знаєш хронологію»', () => {
    const g = playChronology(1);
    assert.equal(g.panel().querySelector('.big').textContent, '12 / 15');
    assert.match(g.panel().textContent, /Добре знаєш хронологію\./);
    assert.deepEqual(g.saved, [{ game: 'chronology', score: 12, total: 15 }]);
  });

  test('багато помилок → рахунок не падає нижче 0', () => {
    const g = playChronology(6);
    assert.equal(g.panel().querySelector('.big').textContent, '0 / 15');
    assert.match(g.panel().textContent, /Варто повторити дати/);
  });

  test('неправильний клік: лічильник помилок зростає, подія не позначається як вгадана', () => {
    const g = mountGame('chronology');
    findByText(g.panel(), 'button', 'Почати').click();
    const buttons = g.panel().querySelectorAll('.events button');
    const latest = buttons.map((b) => ({ b, ev: EV.find((e) => e[1] === b.textContent) })).sort((a, b) => b.ev[0] - a.ev[0])[0];
    latest.b.click();
    assert.match(g.panel().textContent, /Помилки: 1/);
    assert.ok(latest.b.classList.contains('wrong'));
    assert.ok(!latest.b.classList.contains('done') && !latest.b.disabled);
  });

  test('не вдалося зберегти результат: 401 / інша помилка', async () => {
    await checkSaveErrors(async (options) => playChronology(0, options));
  });
});

// ===========================================================================
describe('Знайди відповідність (matching-task.js)', () => {
  const Q = extractLiteral('public/js/games/matching-task.js', 'Q');
  const A = extractLiteral('public/js/games/matching-task.js', 'A');
  const answerText = (q) => A.find((a) => a.Answerid === q.correctAnswerId).answer;

  test('дані: кожна правильна відповідь існує і належить лише одному запитанню', () => {
    for (const q of Q) assert.ok(A.some((a) => a.Answerid === q.correctAnswerId), `запитання ${q.Questionid}: немає відповіді ${q.correctAnswerId}`);
    assert.equal(new Set(Q.map((q) => q.correctAnswerId)).size, Q.length, 'дві різні пари не можуть мати одну відповідь');
  });

  function start(options) {
    const g = mountGame('matching-task', options);
    findByText(g.panel(), 'button', 'Start').click();
    return g;
  }
  function matchAll(g) {
    const panel = g.panel();
    for (const qb of panel.querySelectorAll('.matching-question')) {
      const q = Q.find((x) => x.question === qb.textContent);
      qb.click();
      findByText(panel, '.matching-answer', answerText(q)).click();
    }
  }

  test('у раунді 4 запитання і 4 відповіді, кожна відповідь пасує до одного з запитань', () => {
    const panel = start().panel();
    const qs = panel.querySelectorAll('.matching-question').map((b) => Q.find((q) => q.question === b.textContent));
    const as = panel.querySelectorAll('.matching-answer').map((b) => b.textContent).sort();
    assert.equal(qs.length, 4);
    assert.deepEqual(qs.map(answerText).sort(), as);
  });

  test('усі пари без помилок → 4 / 4, «Ідеальний результат», результат збережено', () => {
    const g = start();
    matchAll(g);
    assert.equal(g.panel().querySelector('.big').textContent, '4 / 4');
    assert.match(g.panel().textContent, /Ідеальний результат/);
    assert.deepEqual(g.saved, [{ game: 'matching-task', score: 4, total: 4 }]);
  });

  test('неправильна пара: +1 помилка, нічого не позначається як вгадане', () => {
    const g = start();
    const panel = g.panel();
    const qb = panel.querySelector('.matching-question');
    const q = Q.find((x) => x.question === qb.textContent);
    const wrong = panel.querySelectorAll('.matching-answer').find((b) => b.textContent !== answerText(q));
    qb.click();
    wrong.click();
    assert.match(panel.textContent, /Помилки: 1/);
    assert.ok(!wrong.disabled && !qb.disabled);
    assert.match(panel.textContent, /Прогрес 0 \/ 4/);
  });

  test('клік по відповіді без вибраного запитання нічого не робить', () => {
    const g = start();
    g.panel().querySelector('.matching-answer').click();
    assert.match(g.panel().textContent, /Помилки: 0/);
    assert.match(g.panel().textContent, /Прогрес 0 \/ 4/);
  });

  test('з помилками: у підсумку «Були помилки: N»', () => {
    const g = start();
    const panel = g.panel();
    const qb = panel.querySelector('.matching-question');
    const q = Q.find((x) => x.question === qb.textContent);
    qb.click();
    panel.querySelectorAll('.matching-answer').find((b) => b.textContent !== answerText(q)).click();
    matchAll(g);
    assert.match(g.panel().textContent, /Були помилки: 1/);
  });

  test('не вдалося зберегти результат: 401 / інша помилка', async () => {
    await checkSaveErrors(async (options) => { const g = start(options); matchAll(g); return g; });
  });
});
