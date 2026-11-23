import { shuffle, isCorrect, calculateScore, calcResult, isValidQuestionBank } from './quiz-logic.js';

const ROUND = 10;
const INVALID_BANK_MESSAGE = 'Некоректний банк запитань: перевірте текст, варіанти та правильну відповідь кожного питання.';

function el(tag, cls, text) {
    var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e;
}

function btn(label, cls, fn) {
    var b = el('button', 'btn ' + cls, label); b.type = 'button'; b.addEventListener('click', fn); return b;
}

function externalLink(url) {
    try {
        const parsed = new URL(url);
        return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed.href : null;
    } catch (error) {
        return null;
    }
}

function questionImage(question) {
    if (!question.image || !question.image.file) return null;

    const figure = el('figure', 'quiz-question-image');
    const image = el('img');
    image.src = new URL('../../images/' + encodeURIComponent(question.image.file), import.meta.url).href;
    image.alt = question.image.title || question.text;
    image.loading = 'lazy';
    image.decoding = 'async';
    image.addEventListener('error', () => figure.remove(), { once: true });
    figure.appendChild(image);

    const caption = el('figcaption');
    if (question.image.title) caption.appendChild(el('span', null, question.image.title));
    const credit = [question.image.author, question.image.license].filter(Boolean).join(' · ');
    const imageUrl = externalLink(question.image.url);
    if (credit || imageUrl) {
        const attribution = el('span', 'quiz-image-credit', credit);
        if (imageUrl) {
            const link = el('a', 'link', credit ? 'Деталі зображення' : 'Джерело зображення');
            link.href = imageUrl;
            link.target = '_blank';
            link.rel = 'noopener noreferrer';
            attribution.append(document.createTextNode(credit ? ' · ' : ''), link);
        }
        caption.appendChild(attribution);
    }
    if (caption.childNodes.length) figure.appendChild(caption);
    return figure;
}

function questionSources(question) {
    if (!Array.isArray(question.sources) || question.sources.length === 0) return null;

    const details = el('details', 'quiz-sources');
    details.appendChild(el('summary', null, 'Джерела'));
    const list = el('ul');
    question.sources.forEach((source) => {
        if (!source || !source.title) return;
        const item = el('li');
        const url = externalLink(source.url);
        if (url) {
            const link = el('a', 'link', source.title);
            link.href = url;
            link.target = '_blank';
            link.rel = 'noopener noreferrer';
            item.appendChild(link);
        } else {
            item.textContent = source.title;
        }
        list.appendChild(item);
    });
    if (!list.childNodes.length) return null;
    details.appendChild(list);
    return details;
}

export function mount(root) {
    let panel = el('div', 'panel');
    root.appendChild(panel);
    panel.appendChild(el('p', 'hint', 'Завантажуємо запитання…'));

    fetch(new URL('../../data/questions(1).json', import.meta.url), { credentials: 'same-origin' })
        .then((response) => {
            if (!response.ok) throw new Error('HTTP ' + response.status);
            return response.json();
        })
        .then((data) => {
            if (!data || !Array.isArray(data.questions) || data.questions.length < ROUND || !isValidQuestionBank(data.questions)) {
                throw new Error(INVALID_BANK_MESSAGE);
            }
            const questions = data.questions;
            start(data.topic || 'історії України', questions);
        })
        .catch((error) => {
            console.error('Не вдалося завантажити запитання квізу:', error);
            panel.textContent = '';
            panel.appendChild(el('p', 'q-text', error.message === INVALID_BANK_MESSAGE
                ? INVALID_BANK_MESSAGE
                : 'Не вдалося завантажити запитання. Оновіть сторінку й спробуйте ще раз.'));
        });

    function start(topic, questions) {
        function pick() {
            return shuffle(questions).slice(0, ROUND);
        }

        function intro() {
            panel.textContent = '';
            panel.append(
                el('p', 'q-text', ROUND + ' запитань з теми «' + topic + '». Обери правильну відповідь.'),
                el('p', 'hint', 'У базі ' + questions.length + ' запитань. У кожному раунді — випадкові запитання та варіанти відповідей.'),
                btn('Почати', 'btn--accent', play)
            );
        }
        function play() {
            const qs = pick();
            let i = 0;
            const results = [];

            function ask() {
                const q = qs[i];
                panel.textContent = '';
                let bar = el('div', 'bar'), fill = el('i'); fill.style.width = (i / ROUND * 100) + '%'; bar.appendChild(fill);
                let meta = el('div', 'q-meta'); meta.append(el('span', null, (i + 1) + ' / ' + ROUND));
                let answers = el('div', 'quiz-answers');
                shuffle(q.options).forEach((answer) => {
                    answers.append(btn(answer.text, 'btn--ghost', () => { reply(q, answer, answers); }));
                });
                const content = [bar, meta, el('p', 'q-text', q.text)];
                const image = questionImage(q);
                if (image) content.push(image);
                content.push(answers);
                panel.append(...content);
            }
            function reply(q, selectedAnswer, answers) {
                answers.querySelectorAll('button').forEach((answerButton) => {
                    answerButton.disabled = true;
                });

                const correct = isCorrect(q, selectedAnswer);
                results.push(correct);

                const correctAnswer = q.options.find((answer) => isCorrect(q, answer));
                const verdict = el('div', 'verdict');
                verdict.append(
                    el('b', correct ? 'ok' : 'no', correct ? 'Правильно.' : 'Не зовсім.'),
                    el('p', 'hint', 'Правильна відповідь: ' + correctAnswer.text),
                    el('p', 'hint', q.explanation || correctAnswer.why || '')
                );
                const sources = questionSources(q);
                if (sources) verdict.appendChild(sources);

                const last = i === ROUND - 1;
                verdict.append(btn(last ? 'Результат' : 'Далі', 'btn--accent', () => {
                    i++;
                    last ? finish() : ask();
                }));
                panel.appendChild(verdict);
            }

            function finish() {
                const score = calculateScore(results);
                const result = calcResult(score, ROUND);
                panel.textContent = '';
                const status = el('p', 'hint', 'Зберігаємо результат…');
                panel.append(
                    el('p', 'big', result.score + ' з ' + result.total + ', ' + result.percent + '%'),
                    el('p', 'q-text', score >= 8 ? 'Відмінно!' : 'Спробуй ще раз.'),
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

            ask();
        }

        intro();
    }
}
