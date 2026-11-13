window.Games = {};
(function () {
  var REGISTRY = { 'fake-or-fact': 'Фейк чи факт', 'chronology': 'На шляху до свободи', 'quiz': 'Історичний квіз', 'matching-task': 'Знайди відповідність', 'timeline': 'Коли це сталося?' }; // білий список: у src підставляємо лише ці id
  var id = new URLSearchParams(location.search).get('g') || '';
  var root = document.getElementById('gameRoot');
  if (!Object.prototype.hasOwnProperty.call(REGISTRY, id)) {
    root.textContent = 'Таку гру не знайдено.';
    return;
  }
  document.title = REGISTRY[id] + ' — ЛяСторія';
  document.getElementById('gameTitle').textContent = REGISTRY[id];
  var s = document.createElement('script');
  s.src = 'js/games/' + id + '.js';
  s.onload = () => { window.Games[id].mount(root); };
  document.body.appendChild(s);
})();
