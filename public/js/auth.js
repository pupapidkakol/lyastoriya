(function () {
  var forms = { login: document.getElementById('loginForm'), register: document.getElementById('registerForm') };
  function show() {
    var m = location.hash === '#register' ? 'register' : 'login';
    forms.login.hidden = m !== 'login'; forms.register.hidden = m !== 'register';
    document.getElementById('authTitle').textContent = m === 'login' ? 'Вхід' : 'Реєстрація';
  }
  window.addEventListener('hashchange', show); show();

  function bind(form, send) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var err = form.querySelector('.form__error'), b = form.querySelector('button[type=submit]');
      err.textContent = ''; b.disabled = true;
      var data = {}; new FormData(form).forEach(function (v, k) { data[k] = v; });
      send(data).then(function () { location.href = 'index.html'; })
        .catch(function (x) { err.textContent = x.status ? x.message : 'Сервер недоступний. Запусти його командою npm start.'; b.disabled = false; });
    });
  }
  bind(forms.login, api.login); bind(forms.register, api.register);
})();
