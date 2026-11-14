window.Games = {};
(function () {
  // Білий список: у src підставляємо лише ці id.
  // color — колір гри (див. data/readme.md), решта — тексти на сторінці гри.
  var REGISTRY = {
    'quiz': { title: 'Історичний квіз', n: '01', label: 'Історичний квіз', color: 'var(--color-red)', aside: 'Історія у відповідях.', text: 'Перевіряй знання й відкривай минуле.', foot: 'Квіз' },
    'matching-task': { title: 'Знайди відповідність', n: '02', label: 'Знайди відповідність', color: 'var(--color-blue)', aside: 'Знайди зв’язки. Побач більше.', text: 'Поєднуй запитання з правильними відповідями.', foot: 'Відповідність' },
    'chronology': { title: 'На шляху до свободи', n: '03', label: 'Хронологічний виклик', color: 'var(--color-green)', aside: 'Віднови хід подій.', text: 'Розташуй події Української революції 1917–1921 років у правильному порядку.', foot: 'Хронологія' },
    'timeline': { title: 'Коли це сталося?', n: '04', label: 'Історична хронологія', color: 'var(--color-lime)', aside: 'Кожна дата — частина історії.', text: 'Розташовуй події в часі та тренуй історичну пам’ять.', foot: 'Хронологія' },
    'fake-or-fact': { title: 'Фейк чи факт', n: '05', label: 'Фейк чи факт', color: 'var(--color-yellow)', aside: 'Відділи правду від міфів.', text: 'Визнач, чи це факт, чи фейк.', foot: 'Фейк чи факт' }
  };
  var id = new URLSearchParams(location.search).get('g') || '';
  var root = document.getElementById('gameRoot');
  if (!Object.prototype.hasOwnProperty.call(REGISTRY, id)) {
    root.textContent = 'Таку гру не знайдено.';
    return;
  }
  var g = REGISTRY[id];
  document.title = g.title + ' — ЛяСторія';
  document.getElementById('gameTitle').textContent = g.title;
  document.getElementById('gameLabel').textContent = g.n + ' / ' + g.label;
  document.getElementById('asideTitle').textContent = g.aside;
  document.getElementById('asideText').textContent = g.text;
  document.getElementById('asideFoot').textContent = g.n + ' / ' + g.foot;
  document.getElementById('gamePage').style.setProperty('--game', g.color);
  var s = document.createElement('script');
  s.src = 'js/games/' + id + '.js';
  s.onload = () => { window.Games[id].mount(root); };
  document.body.appendChild(s);
})();
