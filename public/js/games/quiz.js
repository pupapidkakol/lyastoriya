(function () {
    const ROUND = 10;
    const DATA_URL = 'data/questions(1).json';
    let questions = [];
    let topic = '';

    function el(tag, cls, text) {
      var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e;
    }

    function btn(label, cls, fn) {
      var b = el('button', 'btn ' + cls, label); b.type = 'button'; b.addEventListener('click', fn); return b;
    }

    function pick() {
      var a = questions.slice(), r = new Uint32Array(1), i, j, t;
      for (i = a.length - 1; i > 0; i--) { crypto.getRandomValues(r); j = r[0] % (i + 1); t = a[i]; a[i] = a[j]; a[j] = t; }
      return a.slice(0, ROUND);
    }
    window.Games['quiz'] = {
      mount: function (root) {
        let panel = el('div', 'panel');
        root.appendChild(panel);
        panel.appendChild(el('p', 'hint', 'Завантажуємо запитання…'));

        function intro() {
          panel.textContent = '';
          panel.append(
            el('p', 'q-text', 'Десять запитань з історії України. Обери правильну відповідь.'),
            el('p', 'hint', 'Тема: ' + topic + '. У базі ' + questions.length + ' запитань; у кожному раунді — десять випадкових.'),
            btn('Почати', 'btn--accent', play)
          );
        }
        function play() {
          const qs = pick();
          let i = 0;
          let score = 0;

          function ask() {
            const q = qs[i];
            panel.textContent = '';
            let bar = el('div', 'bar'), fill = el('i'); fill.style.width = (i / ROUND * 100) + '%'; bar.appendChild(fill);
            let meta = el('div', 'q-meta'); meta.append(el('span', null, (i + 1) + ' / ' + ROUND));
            let answers = el('div', 'quiz-answers');
            q.options.forEach((answer) => {
              answers.append(btn(answer.text, 'btn--ghost', () => { reply(q, answer, answers); }));
            });
            panel.append(bar, meta, el('p', 'q-text', q.text), answers);

          }

          function reply(q, selectedAnswer, answers) {
            const isCorrect = selectedAnswer.id === q.correct;
            answers.querySelectorAll('button').forEach((answerButton) => {
              answerButton.disabled = true;
            });

            if (isCorrect) {
              score++;
            }

            const verdict = el('div', 'verdict');
            verdict.append(
              el('b', isCorrect ? 'ok' : 'no', isCorrect ? 'Правильно.' : 'Не зовсім.'),
              el('p', 'hint', q.explanation || ('Правильна відповідь: ' + q.options.find((answer) => answer.id === q.correct).text))
            );

            const sources = el('p', 'matching-review__source');
            if (Array.isArray(q.sources) && q.sources.length) {
              sources.append(el('span', null, 'Джерела: '));
              q.sources.forEach((source, index) => {
                if (index) sources.append(el('span', null, ' · '));
                const title = source.title || 'Джерело';
                let url;
                try {
                  url = new URL(source.url);
                } catch (error) {
                  url = null;
                }
                if (url && (url.protocol === 'http:' || url.protocol === 'https:')) {
                  const link = el('a', 'link', title);
                  link.href = url.href;
                  link.target = '_blank';
                  link.rel = 'noopener noreferrer';
                  sources.append(link);
                } else {
                  sources.append(el('span', null, title));
                }
              });
            } else {
              sources.textContent = 'Джерела не вказані.';
            }
            verdict.appendChild(sources);

            const last = i === ROUND - 1;
            verdict.append(btn(last ? 'Результат' : 'Далі', 'btn--accent', () => {
              i++;
              last ? finish() : ask();
            }));
            panel.appendChild(verdict);
          }

          function finish() {
            panel.textContent = '';
            const status = el('p', 'hint', 'Зберігаємо результат…');
            panel.append(
              el('p', 'big', score + ' / ' + ROUND),
              el('p', 'q-text', score >= 9 ? 'Відмінно!' : score >= 6 ? 'Непогано!' : 'Спробуй ще раз.'),
              status,
              btn('Грати ще', 'btn--accent', play)
            );
            api.saveResult({ game: 'quiz', score: score, total: ROUND }).then(() => {
              status.textContent = 'Результат збережено у твоєму профілі.';
            }).catch((e) => {
              if (e.status === 401) {
                status.textContent = 'Увійди в акаунт, щоб зберігати результати. ';
                let a = el('a', 'link', 'Увійти'); a.href = 'auth.html#login'; status.appendChild(a);
              } else status.textContent = 'Результат не збережено — сервер недоступний.';
            });
          }

          ask();
        }

        fetch(DATA_URL, { credentials: 'same-origin' })
          .then((response) => {
            if (!response.ok) throw new Error('http ' + response.status);
            return response.json();
          })
          .then((data) => {
            if (!data || typeof data.topic !== 'string' || !Array.isArray(data.questions) ||
              data.questions.length < ROUND || !data.questions.every((question) =>
                question && typeof question.text === 'string' &&
                Array.isArray(question.options) && question.options.length >= 2 &&
                question.options.every((option) => option && typeof option.id === 'string' && typeof option.text === 'string') &&
                question.options.some((option) => option.id === question.correct))) {
              throw new Error('bad data');
            }
            topic = data.topic;
            questions = data.questions;
            intro();
          })
          .catch((error) => {
            console.error('Unable to load quiz questions', error);
            panel.textContent = '';
            panel.appendChild(el('p', 'q-text', 'Не вдалося завантажити запитання. Оновіть сторінку.'));
          });
      }
    };


})();