(function () {
  var ERA = { rus: 'IX–XIII ст.', koz: 'XV–XVIII ст.', xix: 'XIX ст.', rev: '1917–1921', xx: 'XX ст.', nw: '1991 — сьогодні' };
  var ROUND = 10;
  var DATA_URL = 'data/fake-or-fact.json';
  var Q = [];

  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function btn(label, cls, fn) { var b = el('button', 'btn ' + cls, label); b.type = 'button'; b.addEventListener('click', fn); return b; }
  function pick() {
    var a = Q.slice(), r = new Uint32Array(1), i, j, t;
    for (i = a.length - 1; i > 0; i--) { crypto.getRandomValues(r); j = r[0] % (i + 1); t = a[i]; a[i] = a[j]; a[j] = t; }
    return a.slice(0, ROUND);
  }

  window.Games['fake-or-fact'] = {
    mount: function (root) {
      var panel = el('div', 'panel');
      root.appendChild(panel);
      panel.appendChild(el('p', 'hint', 'Завантажуємо твердження…'));

      function intro() {
        panel.textContent = '';
        panel.append(
          el('p', 'q-text', 'Десять тверджень з історії України. Визнач, чи це факт, чи фейк.'),
          el('p', 'hint', 'У базі ' + Q.length + ' тверджень, кожен раунд — нові, у випадковому порядку.'),
          btn('Почати', 'btn--accent', play)
        );
      }

      function play() {
        var qs = pick(), i = 0, score = 0;

        function ask() {
          var q = qs[i];
          panel.textContent = '';
          var bar = el('div', 'bar'), fill = el('i'); fill.style.width = (i / ROUND * 100) + '%'; bar.appendChild(fill);
          var meta = el('div', 'q-meta'); meta.append(el('span', null, ERA[q[0]]), el('span', null, (i + 1) + ' / ' + ROUND));
          var answers = el('div', 'fact-answers');
          answers.append(btn('Факт', 'btn--ghost', () => { reply(q, 1, answers); }), btn('Фейк', 'btn--ghost', () => { reply(q, 0, answers); }));
          panel.append(bar, meta, el('p', 'q-text', q[1]), answers);
        }

        function reply(q, choice, answers) {
          var ok = choice === q[2];
          if (ok) score++;
          answers.querySelectorAll('button').forEach(function (b) { b.disabled = true; });
          var v = el('div', 'verdict');
          v.append(el('b', ok ? 'ok' : 'no', (ok ? 'Правильно. ' : 'Не зовсім. ') + (q[2] ? 'Це факт.' : 'Це фейк.')), el('p', 'hint', q[3]));
          var last = i === ROUND - 1;
          var next = btn(last ? 'Результат' : 'Далі', 'btn--accent', () => { i++; last ? finish() : ask(); });
          v.appendChild(next);
          panel.appendChild(v);
          next.focus();
        }

        function finish() {
          panel.textContent = '';
          var status = el('p', 'hint', 'Зберігаємо результат…');
          panel.append(
            el('p', 'big', score + ' / ' + ROUND),
            el('p', 'q-text', score >= 9 ? 'Відмінно, ти добре знаєш історію.' : score >= 6 ? 'Непогано, є що повторити.' : 'Гарний початок. Спробуй ще раз.'),
            status,
            btn('Грати ще', 'btn--accent', play)
          );
          api.saveResult({ game: 'fake-or-fact', score: score, total: ROUND }).then(function () {
            status.textContent = 'Результат збережено у твоєму профілі.';
          }).catch(function (e) {
            if (e.status === 401) {
              status.textContent = 'Увійди в акаунт, щоб зберігати результати. ';
              var a = el('a', 'link', 'Увійти'); a.href = 'auth.html#login'; status.appendChild(a);
            } else status.textContent = 'Результат не збережено — сервер недоступний.';
          });
        }
        ask();
      }
      fetch(DATA_URL, { credentials: 'same-origin' })
        .then(function (r) { if (!r.ok) throw new Error('http ' + r.status); return r.json(); })
        .then(function (data) {
          if (!Array.isArray(data) || data.length < ROUND || !data.every(function (q) {
            return Array.isArray(q) && q.length === 4 &&
              Object.prototype.hasOwnProperty.call(ERA, q[0]) &&
              typeof q[1] === 'string' && (q[2] === 0 || q[2] === 1) &&
              typeof q[3] === 'string';
          })) throw new Error('bad data');
          Q = data;
          intro();
        })
        .catch(function (e) {
          console.error('Unable to load fake-or-fact questions', e);
          panel.textContent = '';
          panel.appendChild(el('p', 'q-text', 'Не вдалося завантажити твердження. Оновіть сторінку.'));
        });
    }
  };
})();
