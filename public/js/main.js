document.getElementById('year') && (document.getElementById('year').textContent = new Date().getFullYear());

document.querySelectorAll('img').forEach(function (img) {
  img.addEventListener('error', function () { img.classList.add('is-missing'); });
  if (img.complete && img.naturalWidth === 0) img.classList.add('is-missing');
});

document.querySelectorAll('.epochs__list li').forEach(function (li) {
  li.querySelector('button').addEventListener('click', function () {
    document.querySelectorAll('.epochs__list li').forEach(function (x) { x.classList.remove('is-active'); });
    li.classList.add('is-active');
  });
});

// Якщо користувач увійшов — замінюємо кнопки в хедері на ім’я та «Вийти»
var box = document.getElementById('authActions');
window.currentUserPromise = window.api ? api.me() : Promise.resolve({ user: null });

if (box && window.api) {
  window.currentUserPromise.then(function (d) {
    if (!d || !d.user) return;
    box.textContent = '';
    var s = document.createElement('a'); s.className = 'user'; s.textContent = d.user.username;
    s.href = '/profile.html';
    var b = document.createElement('button'); b.type = 'button'; b.className = 'btn btn--ghost'; b.textContent = 'Вийти';
    b.onclick = function () { api.logout().then(function () { location.reload(); }); };
    box.append(s, b);
    showStats(d.stats);
  }).catch(function () { });
}

// Реальна статистика в блоці «Результати» (лише для користувача, що увійшов)
function showStats(st) {
  if (!st) return;

  var games = document.getElementById('statGames');
  var pct = document.getElementById('statPct');
  var kinds = document.getElementById('statKinds');
  var kindsLabel = document.getElementById('statKindsLabel');
  var progressLabel = document.getElementById('progLabel');
  var resultsCta = document.getElementById('resultsCta');

  if (games) games.textContent = st.games;
  if (pct) pct.textContent = st.correctPct + '%';
  if (kinds) kinds.textContent = st.kinds;
  if (kindsLabel) kindsLabel.textContent = 'різних ігор';
  if (progressLabel) progressLabel.textContent = 'Твій профіль';
  if (resultsCta) resultsCta.hidden = true;

  document.querySelectorAll('[data-example]').forEach(function (element) {
    element.hidden = true;
  });
}
