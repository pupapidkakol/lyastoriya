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
if (box && window.api) {
  api.me().then(function (d) {
    if (!d || !d.user) return;
    box.textContent = '';
    var s = document.createElement('span'); s.className = 'user'; s.textContent = d.user.username;
    var b = document.createElement('button'); b.type = 'button'; b.className = 'btn btn--ghost'; b.textContent = 'Вийти';
    b.onclick = function () { api.logout().then(function () { location.reload(); }); };
    box.append(s, b);
    showStats(d.stats);
  }).catch(function () {});
}

// Реальна статистика в блоці «Результати» (лише для користувача, що увійшов)
function showStats(st) {
  if (!st || !document.getElementById('statGames')) return;
  document.getElementById('statGames').textContent = st.games;
  document.getElementById('statPct').textContent = st.correctPct + '%';
  document.getElementById('statKinds').textContent = st.kinds;
  document.getElementById('statKindsLabel').textContent = 'різних ігор';
  document.getElementById('progLabel').textContent = 'Твій профіль';
  document.querySelectorAll('[data-example]').forEach(function (e) { e.hidden = true; });
  document.getElementById('resultsCta').hidden = true;
}
