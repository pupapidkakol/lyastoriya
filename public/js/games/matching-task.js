(function () {
    const ROUND = 4;
    const Q = [
        {
            Questionid: 1,
            question: "Placeholder question 1?",
            correctAnswerId: 4,
            source: null
        }, {
            Questionid: 2,
            question: "Placeholder question 2?",
            correctAnswerId: 2,
            source: null
        }, {
            Questionid: 3,
            question: "Placeholder question 3?",
            correctAnswerId: 1,
            source: null
        }, {
            Questionid: 4,
            question: "Placeholder question 4?",
            correctAnswerId: 3,
            source: null
        }, {
            Questionid: 5,
            question: "Placeholder question 5?",
            correctAnswerId: 6,
            source: null
        }, {
            Questionid: 6,
            question: "Placeholder question 6?",
            correctAnswerId: 5,
            source: null
        }]
    const A = [
        {
            Answerid: 1,
            answer: "Option 1"
        }, {
            Answerid: 2,
            answer: "Option 2"
        }, {
            Answerid: 3,
            answer: "Option 3"
        }, {
            Answerid: 4,
            answer: "Option 4"
        }, {
            Answerid: 5,
            answer: "Option 5"
        }, {
            Answerid: 6,
            answer: "Option 6"
        }
    ]
    const answersById = new Map(A.map(answer => [answer.Answerid, answer]));

    function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
    function btn(label, cls, fn) { var b = el('button', 'btn ' + cls, label); b.type = 'button'; b.addEventListener('click', fn); return b; }
    function pick() {
        var a = Q.slice(), r = new Uint32Array(1), i, j, t;
        for (i = a.length - 1; i > 0; i--) { crypto.getRandomValues(r); j = r[0] % (i + 1); t = a[i]; a[i] = a[j]; a[j] = t; }
        return a.slice(0, ROUND);
    }


    window.Games['matching-task'] = {
        mount: function (root) {
            let panel = el('div', 'panel');
            root.appendChild(panel);

            function intro() {
                panel.textContent = '';
                panel.append(
                    el('p', 'q-text', 'Поєднуй імена, події та дати. Розгадай, як творилася Гетьманщина.'),
                    el('p', 'hint', 'У базі ' + ROUND + ' раунди.'),
                    btn('Start', 'btn--accent', play)
                );
            }
            function play() {
                panel.textContent = '';
                let questions = pick();
                let currentAnswers = questions.map(question => answersById.get(question.correctAnswerId));
                let answers = currentAnswers.slice();
                let score = 0;
                let mistakes = 0;
                let answersCount = 0;
                let selectedQuestionId = null;
                let matchedQuestionIds = new Set();
                let matchedAnswerIds = new Set();

                for (let index = answers.length - 1; index > 0; index--) {
                    let random = new Uint32Array(1);
                    crypto.getRandomValues(random);
                    let swapIndex = random[0] % (index + 1);
                    [answers[index], answers[swapIndex]] = [answers[swapIndex], answers[index]];
                }

                function selectQuestion(question, questionEl) {
                    if (matchedQuestionIds.has(question.Questionid)) return;
                    selectedQuestionId = question.Questionid;
                    panel.querySelectorAll('.matching-question').forEach(el => el.classList.remove('matching-is-selected'));
                    questionEl.classList.add('matching-is-selected');
                }

                function selectAnswer(answer, answerEl) {
                    if (!selectedQuestionId || matchedAnswerIds.has(answer.Answerid)) return;

                    let question = questions.find(item => item.Questionid === selectedQuestionId);
                    answersCount++;
                    let answersCountLabel = panel.querySelector('.matching-answers-count');
                    if (answersCountLabel) answersCountLabel.textContent = 'Відповідей: ' + answersCount;

                    if (answer.Answerid === question.correctAnswerId) {
                        score++;
                        matchedQuestionIds.add(question.Questionid);
                        matchedAnswerIds.add(answer.Answerid);
                        let questionEl = panel.querySelector(`[data-question-id="${question.Questionid}"]`);
                        questionEl.classList.add('matching-is-matched');
                        questionEl.disabled = true;
                        answerEl.classList.add('matching-is-matched');
                        answerEl.disabled = true;
                        selectedQuestionId = null;
                        let progressFill = panel.querySelector('.bar i');
                        if (progressFill) progressFill.style.width = (matchedQuestionIds.size / ROUND * 100) + '%';
                        let progressLabel = panel.querySelector('.matching-progress-count');
                        if (progressLabel) progressLabel.textContent = 'Прогрес ' + matchedQuestionIds.size + ' / ' + ROUND;

                        if (matchedQuestionIds.size === ROUND) {
                            finish();
                        }
                    } else {
                        mistakes++
                        answerEl.classList.add('matching-is-wrong');
                        setTimeout(() => { answerEl.classList.remove('matching-is-wrong'); }, 500)
                        let mistakesLabel = panel.querySelector('.matching-mistakes-count');
                        if (mistakesLabel) mistakesLabel.textContent = 'Помилки: ' + mistakes;
                    }
                }

                function finish() {
                    panel.textContent = '';
                    const status = el('p', 'hint', 'Зберігаємо результат…');
                    panel.append(
                        el('p', 'big', score + ' / ' + ROUND),
                        el('p', 'q-text', score >= 4 ? 'Відмінно!' : 'Спробуй ще раз.'),
                        el('p', 'matching-review__result', mistakes === 0 ? 'Ідеальний результат' : 'Були помилки: ' + mistakes),
                        status
                    );

                    let review = el('div', 'matching-review');
                    review.append(el('h3', null, 'Правильні відповіді та джерела'));

                    questions.forEach(question => {
                        let answer = answersById.get(question.correctAnswerId);
                        let item = el('div', 'matching-review__item');
                        item.append(
                            el('p', 'matching-review__pair', question.question + ' — ' + answer.answer),
                            el('p', 'matching-review__source', question.source || 'Джерело не вказано')
                        );
                        review.appendChild(item);
                    });

                    panel.append(review, btn('Грати ще', 'btn--accent', play));

                    api.saveResult({ game: 'matching-task', score: score, total: ROUND }).then(() => {
                        status.textContent = 'Результат збережено у твоєму профілі.';
                    }).catch((e) => {
                        if (e.status === 401) {
                            status.textContent = 'Увійди в акаунт, щоб зберігати результати. ';
                            let login = el('a', 'link', 'Увійти');
                            login.href = 'auth.html#login';
                            status.appendChild(login);
                        } else {
                            status.textContent = 'Результат не збережено — сервер недоступний.';
                        }
                    });
                }

                function ask() {
                    panel.textContent = '';
                    let bar = el('div', 'bar'), fill = el('i'); fill.style.width = (matchedQuestionIds.size / ROUND * 100) + '%'; bar.appendChild(fill);
                    let meta = el('div', 'q-meta');
                    let mistakesLabel = el('span', 'matching-mistakes-count', 'Помилки: ' + mistakes);
                    let progressLabel = el('span', 'matching-progress-count', 'Прогрес ' + matchedQuestionIds.size + ' / ' + ROUND);
                    meta.append(
                        progressLabel,
                        mistakesLabel
                    );
                    let answersGrid = el('div', 'answers matching-answers');
                    questions.forEach((question) => {
                        let questionEl = btn(question.question, 'matching-question');
                        questionEl.dataset.questionId = question.Questionid;
                        questionEl.addEventListener('click', () => selectQuestion(question, questionEl));
                        answersGrid.appendChild(questionEl);
                    });
                    answers.forEach((answer) => {
                        let answerEl = btn(answer.answer, 'matching-answer');
                        answerEl.dataset.answerId = answer.Answerid;
                        answerEl.addEventListener('click', () => selectAnswer(answer, answerEl));
                        answersGrid.appendChild(answerEl);
                    });
                    panel.append(bar, meta, el('p', 'q-text'), answersGrid);

                }
                ask();
            }
            intro();
        }
    }
})()