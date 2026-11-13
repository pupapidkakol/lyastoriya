// Обгортка над серверним API. Усі запити — на той самий домен, cookie сесії httpOnly (JS її не бачить).
window.api = (function () {
  function call(path, method, body) {
    return fetch('/api/' + path, {
      method: method || 'GET',
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
      credentials: 'same-origin'
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (d) {
        if (!r.ok) {
          var e = new Error(d.error || 'Помилка сервера');
          e.status = r.status;
          throw e;
        }
        return d;
      });
    });
  }
  return {
    me: function () { return call('me'); },
    login: function (b) { return call('login', 'POST', b); },
    register: function (b) { return call('register', 'POST', b); },
    logout: function () { return call('logout', 'POST', {}); },
    saveResult: function (b) { return call('results', 'POST', b); }
  };
})();
