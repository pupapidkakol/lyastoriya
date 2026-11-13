(function () {
  var ROUNDS = 3, PER = 5, MAX = ROUNDS * PER;
  // [YYYYMMDD для сортування, подія, дата]
  var EV = [
    [19170317, 'Створення Центральної Ради', '17 березня 1917'],
    [19170623, 'І Універсал Центральної Ради', '23 червня 1917'],
    [19170716, 'ІІ Універсал Центральної Ради', '16 липня 1917'],
    [19171120, 'ІІІ Універсал: проголошення УНР', '20 листопада 1917'],
    [19180122, 'IV Універсал: незалежність УНР', '22 січня 1918'],
    [19180129, 'Бій під Крутами', '29 січня 1918'],
    [19180209, 'Мирний договір УНР у Брест-Литовську', '9 лютого 1918'],
    [19180429, 'Гетьманський переворот Скоропадського', '29 квітня 1918'],
    [19181101, 'Проголошення ЗУНР у Львові', '1 листопада 1918'],
    [19181214, 'Зречення Скоропадського, Директорія в Києві', '14 грудня 1918'],
    [19190122, 'Акт Злуки УНР і ЗУНР', '22 січня 1919'],
    [19200421, 'Договір Петлюри з Пілсудським', '21 квітня 1920'],
    [19210318, 'Ризький мирний договір', '18 березня 1921']
  ];
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function btn(label, cls, fn) {
    var b = el('button', 'btn ' + cls, label);
    b.type = 'button';
    b.addEventListener('click', fn);
    return b;
  }
  function sample(n) {
    var a = EV.slice(), r = new Uint32Array(1), i, j, t;
    for (i = a.length - 1; i > 0; i--) {
      crypto.getRandomValues(r);
      j = r[0] % (i + 1);
      t = a[i];
      a[i] = a[j];
      a[j] = t;
    }
    return a.slice(0, n);
  }

  window.Games['chronology'] = {
    mount: function (root) {
      var panel = el('div', 'panel');
      root.appendChild(panel);

      function intro() {
        panel.textContent = '';
        panel.append(
          el('p', 'q-text', 'Натискай події від найранішої до найпізнішої.'),
          el('p', 'hint', ROUNDS + ' раунди по ' + PER + ' подій Української революції 1917–1921 років. Кожна помилка забирає один бал.'),
          btn('Почати', 'btn--accent', play)
        );
      }

      function play() {
        var round = 0, mistakes = 0;

        function nextRound() {
          var evs = sample(PER), order = evs.slice().sort((a, b) => { return a[0] - b[0]; }), next = 0;
          panel.textContent = '';
          var bar = el('div', 'bar'), fill = el('i'); fill.style.width = (round / ROUNDS * 100) + '%'; bar.appendChild(fill);
          var meta = el('div', 'q-meta'), mLabel = el('span', null, 'Помилки: ' + mistakes);
          meta.append(el('span', null, 'Раунд ' + (round + 1) + ' / ' + ROUNDS), mLabel);
          var list = el('div', 'events');
          evs.forEach((ev) => {
            var b = el('button', 'event'); b.type = 'button'; b.appendChild(el('span', null, ev[1]));
            b.addEventListener('click', () => {
              if (ev === order[next]) {
                b.classList.add('done'); b.disabled = true; b.appendChild(el('span', 'ev-date', ev[2])); next++;
                if (next === PER) done();
              } else {
                mistakes++; mLabel.textContent = 'Помилки: ' + mistakes;
                b.classList.add('wrong');
                setTimeout(() => { b.classList.remove('wrong'); }, 500);
              }
            });
            list.appendChild(b);
          });
          panel.append(bar, meta, list);
        }

        function done() {
          var last = round === ROUNDS - 1;
          var nb = btn(last ? 'Результат' : 'Наступний раунд', 'btn--accent', () => { round++; last ? finish() : nextRound(); });
          nb.style.marginTop = '16px'; panel.appendChild(nb); nb.focus();
        }

        function finish() {
          var score = Math.max(0, MAX - mistakes);
          panel.textContent = '';
          var status = el('p', 'hint', 'Зберігаємо результат…');
          panel.append(
            el('p', 'big', score + ' / ' + MAX),
            el('p', 'q-text', mistakes === 0 ? 'Бездоганно: жодної помилки.' : mistakes <= 5 ? 'Добре знаєш хронологію.' : 'Варто повторити дати. Спробуй ще раз.'),
            status, btn('Грати ще', 'btn--accent', play)
          );
          api.saveResult({ game: 'chronology', score: score, total: MAX }).then(() => {
            status.textContent = 'Результат збережено у твоєму профілі.';
          }).catch((e) => {
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
  };
})();
