// Логіка ігор: проходимо гру «як користувач» і перевіряємо рахунок, тексти та збереження результату.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { mountGame, flush, findByText, extractLiteral, readJson } from './helpers/browser-env.js';

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
  const serve = (data) => ({ fetch: () => ({ ok: true, status: 200, json: () => Promise.resolve(data) }) });

  // answerCorrect(n) → чи відповідати правильно на n-те запитання (1..10)
  async function playQuiz(answerCorrect, options) {
    const g = await mountGame('quiz', options);
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
      findByText(panel, '.verdict button', n < 10 ? 'Далі' : 'Результат').click();
    }
    return Object.assign(g, { seen });
  }

  test('модуль завантажується і має функцію mount', async () => {
    const mod = await import('../public/js/games/quiz.js');
    assert.equal(typeof mod.mount, 'function');
  });

  test('спочатку «Завантажуємо…», після завантаження — тема і кількість запитань', async () => {
    const g = await mountGame('quiz');
    assert.match(g.panel().textContent, /Завантажуємо запитання/);
    await flush();
    assert.equal(g.fetchCalls.length, 1);
    assert.match(decodeURI(g.fetchCalls[0]), /\/data\/questions\(1\)\.json$/);
    const text = g.panel().textContent;
    assert.ok(text.includes('10 запитань з теми «' + QUIZ.topic + '»'), 'показано тему');
    assert.ok(text.includes('У базі ' + QUIZ.questions.length + ' запитань'), 'показано кількість');
  });

  test('усі відповіді правильні → «10 з 10, 100%», «Відмінно!», результат збережено', async () => {
    const g = await playQuiz(() => true);
    assert.equal(g.panel().querySelector('.big').textContent, '10 з 10, 100%');
    assert.match(g.panel().textContent, /Відмінно!/);
    assert.deepEqual(g.saved, [{ game: 'quiz', score: 10, total: 10 }]);
    await flush();
    assert.match(g.panel().textContent, /Результат збережено у твоєму профілі/);
  });

  test('8 правильних → «8 з 10, 80%», ще «Відмінно!» (межа)', async () => {
    const g = await playQuiz((n) => n <= 8);
    assert.equal(g.panel().querySelector('.big').textContent, '8 з 10, 80%');
    assert.match(g.panel().textContent, /Відмінно!/);
    assert.deepEqual(g.saved, [{ game: 'quiz', score: 8, total: 10 }]);
  });

  test('7 правильних → «7 з 10, 70%», «Спробуй ще раз.»', async () => {
    const g = await playQuiz((n) => n <= 7);
    assert.equal(g.panel().querySelector('.big').textContent, '7 з 10, 70%');
    assert.match(g.panel().textContent, /Спробуй ще раз\./);
  });

  test('усі відповіді неправильні → «0 з 10, 0%»', async () => {
    const g = await playQuiz(() => false);
    assert.equal(g.panel().querySelector('.big').textContent, '0 з 10, 0%');
    assert.deepEqual(g.saved, [{ game: 'quiz', score: 0, total: 10 }]);
  });

  test('у раунді 10 різних запитань (без повторів)', async () => {
    const g = await playQuiz(() => true);
    assert.equal(new Set(g.seen.map((q) => q.id)).size, 10);
  });

  test('показуються всі варіанти відповіді запитання', async () => {
    const g = await mountGame('quiz');
    await flush();
    findByText(g.panel(), 'button', 'Почати').click();
    const panel = g.panel();
    const q = QUIZ.questions.find((x) => x.text === panel.querySelector('.q-text').textContent);
    const shown = panel.querySelectorAll('.quiz-answers button').map((b) => b.textContent).sort();
    assert.deepEqual(shown, q.options.map((o) => o.text).sort());
  });

  test('після відповіді кнопки вимикаються, показуються вердикт, правильна відповідь і пояснення', async () => {
    const g = await mountGame('quiz');
    await flush();
    findByText(g.panel(), 'button', 'Почати').click();
    const panel = g.panel();
    const q = QUIZ.questions.find((x) => x.text === panel.querySelector('.q-text').textContent);
    const correct = q.options.find((o) => o.id === q.correct);
    findByText(panel, '.quiz-answers button', q.options.find((o) => o.id !== q.correct).text).click();

    assert.ok(panel.querySelectorAll('.quiz-answers button').every((b) => b.disabled), 'кнопки вимкнені');
    assert.equal(panel.querySelector('.verdict b').textContent, 'Не зовсім.');
    const hints = panel.querySelectorAll('.verdict .hint').map((h) => h.textContent);
    assert.equal(hints[0], 'Правильна відповідь: ' + correct.text);
    assert.equal(hints[1], q.explanation || correct.why || '');
  });

  test('картинки й джерела: правильний файл, посилання лише http(s) з rel="noopener noreferrer"', async () => {
    const g = await mountGame('quiz');
    await flush();
    findByText(g.panel(), 'button', 'Почати').click();
    for (let n = 1; n <= 10; n++) {
      const panel = g.panel();
      const q = QUIZ.questions.find((x) => x.text === panel.querySelector('.q-text').textContent);
      const img = panel.querySelector('.quiz-question-image img');
      if (q.image && q.image.file) {
        assert.ok(img, `запитання ${q.id}: є картинка`);
        assert.ok(img.src.endsWith('/images/' + encodeURIComponent(q.image.file)), `запитання ${q.id}: шлях ${img.src}`);
      }
      findByText(panel, '.quiz-answers button', q.options[0].text).click();

      const links = panel.querySelectorAll('.quiz-sources a');
      const httpSources = (q.sources || []).filter((s) => s && s.title && /^https?:\/\//i.test(s.url || ''));
      assert.equal(links.length, httpSources.length, `запитання ${q.id}: кількість посилань на джерела`);
      for (const a of links) {
        assert.equal(a.rel, 'noopener noreferrer');
        assert.equal(a.target, '_blank');
      }
      findByText(panel, '.verdict button', n < 10 ? 'Далі' : 'Результат').click();
    }
  });

  test('«Грати ще» запускає новий раунд з першого запитання', async () => {
    const g = await playQuiz(() => true);
    findByText(g.panel(), 'button', 'Грати ще').click();
    assert.ok(g.panel().textContent.includes('1 / 10'));
  });

  test('помилка завантаження (HTTP 500) → «Не вдалося завантажити запитання»', async () => {
    const g = await mountGame('quiz', { fetch: () => ({ ok: false, status: 500, json: () => Promise.resolve({}) }) });
    await flush();
    assert.match(g.panel().textContent, /Не вдалося завантажити запитання/);
  });

  test('зіпсований банк запитань → повідомлення «Некоректний банк запитань»', async () => {
    const broken = JSON.parse(JSON.stringify(QUIZ));
    broken.questions[0].correct = 'немає-такого';
    const g = await mountGame('quiz', serve(broken));
    await flush();
    assert.match(g.panel().textContent, /Некоректний банк запитань/);
  });

  test('менше 10 запитань → гра не стартує', async () => {
    const g = await mountGame('quiz', serve({ topic: 'Т', questions: QUIZ.questions.slice(0, 9) }));
    await flush();
    assert.ok(!g.panel().querySelectorAll('button').some((b) => b.textContent === 'Почати'));
    assert.match(g.panel().textContent, /Некоректний банк запитань/);
  });

  test('не вдалося зберегти результат: 401 → посилання «Увійти», інша помилка → «сервер недоступний»', async () => {
    await checkSaveErrors((options) => playQuiz(() => true, options));
  });
});

// ===========================================================================
describe('Фейк чи факт (fake-or-fact.js)', () => {
  const Q = extractLiteral('public/js/games/fake-or-fact.js', 'Q');
  const ERA = extractLiteral('public/js/games/fake-or-fact.js', 'ERA');

  test('дані: кожне твердження — [відома епоха, текст, 0|1, пояснення], тексти не повторюються', () => {
    assert.ok(Q.length >= 10, 'тверджень вистачає на раунд');
    Q.forEach((q, i) => {
      assert.ok(Array.isArray(q) && q.length === 4, `рядок ${i}: 4 елементи`);
      assert.ok(Object.prototype.hasOwnProperty.call(ERA, q[0]), `рядок ${i}: невідома епоха «${q[0]}»`);
      assert.ok(typeof q[1] === 'string' && q[1].trim(), `рядок ${i}: порожній текст`);
      assert.ok(q[2] === 0 || q[2] === 1, `рядок ${i}: 0 або 1`);
      assert.ok(typeof q[3] === 'string' && q[3].trim(), `рядок ${i}: порожнє пояснення`);
    });
    const texts = Q.map((q) => q[1].trim());
    assert.deepEqual(texts.filter((t, i) => texts.indexOf(t) !== i), []);
    assert.ok(Q.some((q) => q[2] === 1) && Q.some((q) => q[2] === 0), 'є і факти, і фейки');
  });

  async function playFof(answerCorrect, options) {
    const g = await mountGame('fake-or-fact', options);
    findByText(g.panel(), 'button', 'Почати').click();
    for (let n = 1; n <= 10; n++) {
      const panel = g.panel();
      const q = Q.find((x) => x[1] === panel.querySelector('.q-text').textContent);
      assert.ok(q, 'твердження є в даних гри');
      assert.ok(panel.querySelector('.q-meta').textContent.startsWith(ERA[q[0]]), 'показано епоху');
      const isFact = q[2] === 1;
      findByText(panel, '.fact-answers button', answerCorrect(n) === isFact ? 'Факт' : 'Фейк').click();
      assert.equal(panel.querySelector('.verdict b').textContent, (answerCorrect(n) ? 'Правильно. ' : 'Не зовсім. ') + (isFact ? 'Це факт.' : 'Це фейк.'));
      assert.equal(panel.querySelector('.verdict .hint').textContent, q[3], 'показано пояснення');
      findByText(panel, '.verdict button', n < 10 ? 'Далі' : 'Результат').click();
    }
    return g;
  }

  test('на старті показано кількість тверджень у базі', async () => {
    const g = await mountGame('fake-or-fact');
    assert.ok(g.panel().textContent.includes('У базі ' + Q.length + ' тверджень'));
  });

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
    const g = await mountGame('fake-or-fact');
    findByText(g.panel(), 'button', 'Почати').click();
    findByText(g.panel(), '.fact-answers button', 'Факт').click();
    assert.ok(g.panel().querySelectorAll('.fact-answers button').every((b) => b.disabled));
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
  async function playChronology(mistakesPerRound, options) {
    const g = await mountGame('chronology', options);
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

  test('без помилок → 15 / 15, «Бездоганно», результат збережено', async () => {
    const g = await playChronology(0);
    assert.equal(g.panel().querySelector('.big').textContent, '15 / 15');
    assert.match(g.panel().textContent, /Бездоганно: жодної помилки\./);
    assert.deepEqual(g.saved, [{ game: 'chronology', score: 15, total: 15 }]);
  });

  test('по одній помилці в раунді → 12 / 15, «Добре знаєш хронологію»', async () => {
    const g = await playChronology(1);
    assert.equal(g.panel().querySelector('.big').textContent, '12 / 15');
    assert.match(g.panel().textContent, /Добре знаєш хронологію\./);
    assert.deepEqual(g.saved, [{ game: 'chronology', score: 12, total: 15 }]);
  });

  test('багато помилок → рахунок не падає нижче 0', async () => {
    const g = await playChronology(6);
    assert.equal(g.panel().querySelector('.big').textContent, '0 / 15');
    assert.match(g.panel().textContent, /Варто повторити дати/);
  });

  test('неправильний клік: лічильник помилок зростає, подія не позначається як вгадана', async () => {
    const g = await mountGame('chronology');
    findByText(g.panel(), 'button', 'Почати').click();
    const buttons = g.panel().querySelectorAll('.events button');
    const latest = buttons.map((b) => ({ b, ev: EV.find((e) => e[1] === b.textContent) })).sort((a, b) => b.ev[0] - a.ev[0])[0];
    latest.b.click();
    assert.match(g.panel().textContent, /Помилки: 1/);
    assert.ok(latest.b.classList.contains('wrong'));
    assert.ok(!latest.b.classList.contains('done') && !latest.b.disabled);
  });

  test('не вдалося зберегти результат: 401 / інша помилка', async () => {
    await checkSaveErrors((options) => playChronology(0, options));
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

  async function start(options) {
    const g = await mountGame('matching-task', options);
    findByText(g.panel(), 'button', 'Start').click();
    return g;
  }
  // Робить mistakes неправильних спроб, потім складає всі пари правильно
  function play(g, mistakes) {
    const panel = g.panel();
    const qb = panel.querySelector('.matching-question');
    const q = Q.find((x) => x.question === qb.textContent);
    const wrong = panel.querySelectorAll('.matching-answer').find((b) => b.textContent !== answerText(q));
    for (let k = 0; k < mistakes; k++) { qb.click(); wrong.click(); }
    for (const b of panel.querySelectorAll('.matching-question')) {
      const qq = Q.find((x) => x.question === b.textContent);
      b.click();
      findByText(panel, '.matching-answer', answerText(qq)).click();
    }
    return g;
  }

  test('у раунді 4 запитання і 4 відповіді, кожна відповідь пасує до одного з запитань', async () => {
    const panel = (await start()).panel();
    const qs = panel.querySelectorAll('.matching-question').map((b) => Q.find((q) => q.question === b.textContent));
    const as = panel.querySelectorAll('.matching-answer').map((b) => b.textContent).sort();
    assert.equal(qs.length, 4);
    assert.deepEqual(qs.map(answerText).sort(), as);
  });

  test('без помилок → 10 / 10, «Бездоганно», «Ідеальний результат», збережено 10 з 10', async () => {
    const g = play(await start(), 0);
    assert.equal(g.panel().querySelector('.big').textContent, '10 / 10');
    assert.match(g.panel().textContent, /Бездоганно: жодної помилки\./);
    assert.match(g.panel().textContent, /Ідеальний результат/);
    assert.deepEqual(g.saved, [{ game: 'matching-task', score: 10, total: 10 }]);
  });

  test('1 помилка → 9 / 10, «Добре знаєш історію.», збережено 9 з 10', async () => {
    const g = play(await start(), 1);
    assert.equal(g.panel().querySelector('.big').textContent, '9 / 10');
    assert.match(g.panel().textContent, /Добре знаєш історію\./);
    assert.match(g.panel().textContent, /Були помилки: 1/);
    assert.deepEqual(g.saved, [{ game: 'matching-task', score: 9, total: 10 }]);
  });

  test('3 помилки → 7 / 10 — ще «Добре знаєш історію.» (межа)', async () => {
    const g = play(await start(), 3);
    assert.equal(g.panel().querySelector('.big').textContent, '7 / 10');
    assert.match(g.panel().textContent, /Добре знаєш історію\./);
  });

  test('4 помилки → 6 / 10, «Варто повторити матеріал»', async () => {
    const g = play(await start(), 4);
    assert.equal(g.panel().querySelector('.big').textContent, '6 / 10');
    assert.match(g.panel().textContent, /Варто повторити матеріал\. Спробуй ще раз\./);
    assert.deepEqual(g.saved, [{ game: 'matching-task', score: 6, total: 10 }]);
  });

  test('багато помилок → рахунок не падає нижче 0', async () => {
    const g = play(await start(), 15);
    assert.equal(g.panel().querySelector('.big').textContent, '0 / 10');
    assert.match(g.panel().textContent, /Були помилки: 15/);
    assert.deepEqual(g.saved, [{ game: 'matching-task', score: 0, total: 10 }]);
  });

  test('неправильна пара: +1 помилка, нічого не позначається як вгадане', async () => {
    const g = await start();
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

  test('клік по відповіді без вибраного запитання нічого не робить', async () => {
    const g = await start();
    g.panel().querySelector('.matching-answer').click();
    assert.match(g.panel().textContent, /Помилки: 0/);
    assert.match(g.panel().textContent, /Прогрес 0 \/ 4/);
  });

  test('не вдалося зберегти результат: 401 / інша помилка', async () => {
    await checkSaveErrors(async (options) => play(await start(options), 0));
  });
});
