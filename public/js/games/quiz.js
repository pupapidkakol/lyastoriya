(function () {
    const ROUND = 4;
    const Q = [
        {
            question: "Placeholder question 1?",
            answers: [
                { text: "Option 1", correct: false },
                { text: "Option 2", correct: false },
                { text: "Option 3", correct: false },
                { text: "Option 4", correct: true }
            ]
        }, {
            question: "Placeholder question 2?",
            answers: [
                { text: "Option 1", correct: false },
                { text: "Option 2", correct: true },
                { text: "Option 3", correct: false },
                { text: "Option 4", correct: false }
            ]
        }, {
            question: "Placeholder question 3",
            answers: [
                { text: "Option 1", correct: false },
                { text: "Option 2", correct: false },
                { text: "Option 3", correct: true },
                { text: "Option 4", correct: false }
            ]
        }, {
            question: "Placeholder question 4",
            answers: [
                { text: "Option 1", correct: true },
                { text: "Option 2", correct: false },
                { text: "Option 3", correct: false },
                { text: "Option 4", correct: false }
            ]
        }
    ];


    function el(tag, cls, text) {
        var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e;
    }

    function btn(label, cls, fn) {
        var b = el('button', 'btn ' + cls, label); b.type = 'button'; b.addEventListener('click', fn); return b;
    }

    function pick() {
        var a = Q.slice(), r = new Uint32Array(1), i, j, t;
        for (i = a.length - 1; i > 0; i--) { crypto.getRandomValues(r); j = r[0] % (i + 1); t = a[i]; a[i] = a[j]; a[j] = t; }
        a.slice(0, ROUND);
        return a.slice(0, ROUND);
    }
    window.Games['quiz'] = {
        mount: function (root) {
            let panel = el('div', 'panel');
            root.appendChild(panel);

            function intro() {
                panel.textContent = '';
                panel.append(
                    el('p', 'q-text', 'Десять тверджень з історії України. Визнач, чи це факт, чи фейк.'),
                    el('p', 'hint', 'У базі ' + Q.length + ' тверджень, кожен раунд — нові, у випадковому порядку.'),
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
                    q.answers.forEach((answer) => {
                        answers.append(btn(answer.text, 'btn--ghost', () => { reply(q, answer, answers); }));
                    });
                    panel.append(bar, meta, el('p', 'q-text', q.question), answers);

                }

                function reply(q, selectedAnswer, answers) {
                    answers.querySelectorAll('button').forEach((answerButton) => {
                        answerButton.disabled = true;
                    });

                    if (selectedAnswer.correct) {
                        score++;
                    }

                    const verdict = el('div', 'verdict');
                    verdict.append(
                        el('b', selectedAnswer.correct ? 'ok' : 'no', selectedAnswer.correct ? 'Правильно.' : 'Не зовсім.'),
                        el('p', 'hint', 'Правильна відповідь: ' + q.answers.find((answer) => answer.correct).text)
                    );

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
                        el('p', 'q-text', score >= 4 ? 'Відмінно!' : 'Спробуй ще раз.'),
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

            intro();
        }
    };


})();