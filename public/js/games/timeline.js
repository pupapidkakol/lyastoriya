// Гра «Коли це сталося?»: показуємо подію — користувач повзунком вгадує рік.
// Підключення: game.html?g=timeline (id треба додати в REGISTRY у js/game-page.js і в GAMES у server/server.js).
// Дані подій і джерела: data/timeline-events.json. Стилі: css/games/timeline.css (підвантажуються тут же).
(function () {
  var ROUNDS = 5, PTS = 20, MAX = ROUNDS * PTS;   // MAX = 100 — сервер приймає total ≤ 100
  var FULL_TOL = 2;     // помилка ≤ 2 роки — повні бали
  var ZERO_AT = 100;    // помилка ≥ 100 років — 0 балів, між ними — лінійно
  var THUMB = 24;       // ширина «бігунка» в px (для вирівнювання підписів зі шкалою)
  var DATA_URL = 'data/timeline-events.json', CSS_URL = 'css/games/timeline.css';

  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function btn(label, cls, fn) { var b = el('button', 'btn ' + cls, label); b.type = 'button'; b.addEventListener('click', fn); return b; }
  function sample(arr, n) {
    var a = arr.slice(), r = new Uint32Array(1), i, j, t;
    for (i = a.length - 1; i > 0; i--) { crypto.getRandomValues(r); j = r[0] % (i + 1); t = a[i]; a[i] = a[j]; a[j] = t; }
    return a.slice(0, n);
  }
  function plural(n) { var m10 = n % 10, m100 = n % 100; return (m10 === 1 && m100 !== 11) ? 'рік' : (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) ? 'роки' : 'років'; }
  function yearsText(n) { return n + ' ' + plural(n); }
  function distance(ev, year) { return year < ev.from ? ev.from - year : year > ev.to ? year - ev.to : 0; }
  function points(err) { return err <= FULL_TOL ? PTS : Math.max(0, Math.round(PTS * (ZERO_AT - err) / (ZERO_AT - FULL_TOL))); }
  function addCss() {
    if (document.querySelector('link[data-game-css="timeline"]')) return;
    var l = el('link'); l.rel = 'stylesheet'; l.href = CSS_URL; l.setAttribute('data-game-css', 'timeline'); document.head.appendChild(l);
  }

  window.Games['timeline'] = {
    mount: function (root) {
      addCss();
      var panel = el('div', 'panel');
      root.appendChild(panel);
      panel.appendChild(el('p', 'hint', 'Завантажуємо події…'));

      fetch(DATA_URL, { credentials: 'same-origin' })
        .then(function (r) {
          if (!r.ok) throw new Error('http ' + r.status); return r.json();
        })
        .then(function (d) {
          if (!d || !d.meta || !Array.isArray(d.events) || d.events.length < ROUNDS) throw new Error('bad data');
          start(d.meta, d.events);
        })
        .catch(function () { panel.textContent = ''; panel.appendChild(el('p', 'q-text', 'Не вдалося завантажити події. Оновіть сторінку.')); });

      function start(meta, events) {
        var MIN = meta.min, TOP = meta.max, SPAN = TOP - MIN;
        var TICKS = [900, 1000, 1200, 1400, 1600, 1800, 2000].filter(function (y) { return y >= MIN && y <= TOP; });

        function pct(year) { return (year - MIN) / SPAN; }
        // позиція підпису; compensate=true — враховує, що центр бігунка не доходить до країв доріжки
        function left(year, compensate) {
          var p = pct(year);
          return compensate ? 'calc(' + (p * 100) + '% + ' + ((0.5 - p) * THUMB) + 'px)' : (p * 100) + '%';
        }
        function ticks(compensate) {
          var t = el('div', 'tl-ticks'); t.setAttribute('aria-hidden', 'true');
          TICKS.forEach(function (y) { var s = el('span', null, String(y)); s.style.left = left(y, compensate); t.appendChild(s); });
          return t;
        }

        function intro() {
          panel.textContent = '';
          panel.append(
            el('p', 'q-text', 'Прочитай подію й постав повзунок на рік, коли вона сталася.'),
            el('p', 'hint', ROUNDS + ' подій з історії України. Чим ближче до правильного року — тим більше балів: помилка до ' + FULL_TOL + ' років дає повні ' + PTS + ', а від ' + ZERO_AT + ' років — нуль. Максимум — ' + MAX + '.'),
            btn('Почати', 'btn--accent', play)
          );
        }

        function play() {
          var round = 0, total = 0, log = [], evs = sample(events, ROUNDS);

          function nextRound() {
            var ev = evs[round], value = Math.round((MIN + TOP) / 2);
            panel.textContent = '';

            var bar = el('div', 'bar'), fill = el('i'); fill.style.width = (round / ROUNDS * 100) + '%'; bar.appendChild(fill);
            var meta1 = el('div', 'q-meta');
            meta1.append(el('span', null, 'Подія ' + (round + 1) + ' / ' + ROUNDS), el('span', null, 'Бали: ' + total));

            var card = el('div', 'tl-event');
            card.append(el('h2', null, ev.title), el('p', null, ev.text));

            var yearBox = el('div', 'tl-year'), yearNum = el('span', null, String(value));
            yearBox.append(yearNum, el('small', null, 'обраний рік'));

            var range = el('input', 'tl-range');
            range.type = 'range'; range.min = MIN; range.max = TOP; range.step = 1; range.value = value;
            range.setAttribute('aria-label', 'Рік події');
            var slider = el('div', 'tl-slider');
            slider.append(range, ticks(true));

            function setValue(v) {
              value = Math.max(MIN, Math.min(TOP, v));
              range.value = value; yearNum.textContent = String(value);
            }
            range.addEventListener('input', function () { setValue(parseInt(range.value, 10)); });

            var nudge = el('div', 'tl-nudge'), nudgeBtns = [];
            [-10, -1, 1, 10].forEach(function (d) {
              var b = btn((d > 0 ? '+' : '−') + Math.abs(d), 'btn--ghost', function () { setValue(value + d); });
              b.setAttribute('aria-label', (d > 0 ? 'Збільшити' : 'Зменшити') + ' рік на ' + yearsText(Math.abs(d)));
              nudgeBtns.push(b); nudge.appendChild(b);
            });

            var resultBox = el('div'); resultBox.setAttribute('aria-live', 'polite');
            var ok = btn('Підтвердити', 'btn--accent', function () {
              var err = distance(ev, value), pts = points(err);
              total += pts; log.push({ ev: ev, guess: value, err: err, pts: pts });
              range.disabled = true; nudgeBtns.forEach(function (b) { b.disabled = true; }); ok.remove();
              meta1.lastChild.textContent = 'Бали: ' + total;
              reveal(resultBox, ev, value, err, pts);
            });

            panel.append(bar, meta1, card, yearBox, slider, nudge, ok, resultBox);
            range.focus({ preventScroll: true });
          }

          function reveal(box, ev, guess, err, pts) {
            var res = el('div', 'tl-result');
            var verdict = el('div', 'tl-verdict');
            var title = err === 0 ? (ev.from === ev.to ? 'Точно в ціль!' : 'Влучно!') : err <= FULL_TOL ? 'Майже ідеально — ' + yearsText(err) + ' різниці' : 'Помилка: ' + yearsText(err);
            var ptsEl = el('span', 'tl-pts' + (pts === 0 ? ' is-zero' : ''), '+' + pts + ' / ' + PTS);
            verdict.append(el('b', null, title), ptsEl);

            // шкала порівняння: правильна відповідь і вибір гравця
            var cmp = el('div', 'tl-compare'), p1 = pct(ev.from) * 100, p2 = pct(ev.to) * 100, pg = pct(guess) * 100;
            var band = el('span', 'tl-band'); band.style.left = p1 + '%'; band.style.width = (p2 - p1) + '%';
            cmp.appendChild(band);
            if (err > 0) {
              var near = guess < ev.from ? ev.from : ev.to, gap = el('span', 'tl-gap');
              gap.style.left = Math.min(pg, pct(near) * 100) + '%'; gap.style.width = Math.abs(pg - pct(near) * 100) + '%';
              cmp.appendChild(gap);
            }
            var right = el('span', 'tl-mark tl-mark--right'), rl = ev.from === ev.to ? String(ev.from) : ev.from + '–' + ev.to;
            right.style.left = ((p1 + p2) / 2) + '%'; right.appendChild(el('i', null, rl));
            var g = el('span', 'tl-mark tl-mark--guess' + (err === 0 ? ' is-ok' : '')); g.style.left = pg + '%'; g.appendChild(el('i', null, String(guess)));
            cmp.append(right, g);

            var last = round === ROUNDS - 1;
            var next = btn(last ? 'Результат' : 'Наступна подія', 'btn--accent', function () { round++; last ? finish() : nextRound(); });
            res.append(verdict, cmp, ev.dateLabel ? el('p', 'tl-date', ev.dateLabel) : document.createDocumentFragment(), el('p', 'tl-fact', ev.fact), next);
            box.appendChild(res);
            next.focus();
          }

          function finish() {
            var status = el('p', 'hint', 'Зберігаємо результат…');
            panel.textContent = '';
            var recap = el('div', 'tl-recap');
            log.forEach(function (r) {
              var row = el('div');
              row.append(
                el('b', null, r.ev.title),
                el('span', 'tl-pts' + (r.pts === 0 ? ' is-zero' : ''), '+' + r.pts),
                el('small', null, 'Твоя відповідь: ' + r.guess + ' · Правильно: ' + (r.ev.from === r.ev.to ? r.ev.from : r.ev.from + '–' + r.ev.to))
              );
              recap.appendChild(row);
            });
            panel.append(
              el('p', 'big', total + ' / ' + MAX),
              el('p', 'q-text', total >= 90 ? 'Блискуче відчуття часу.' : total >= 60 ? 'Добре орієнтуєшся в епохах.' : 'Варто більше потренуватися. Спробуй ще раз.'),
              recap,
              status,
              btn('Грати ще', 'btn--accent', play),
              el('p', 'tl-rules', 'Помилка до ' + FULL_TOL + ' років — повні бали, від ' + ZERO_AT + ' років — нуль, між ними пропорційно.')
            );
            api.saveResult({ game: 'timeline', score: total, total: MAX }).then(function () {
              status.textContent = 'Результат збережено у твоєму профілі.';
            }).catch(function (e) {
              if (e.status === 401) {
                status.textContent = 'Увійди в акаунт, щоб зберігати результати. ';
                var a = el('a', 'link', 'Увійти'); a.href = 'auth.html#login'; status.appendChild(a);
              } else status.textContent = 'Результат не збережено — сервер недоступний.';
            });
          }

          nextRound();
        }
        intro();
      }
    }
  };
})();
