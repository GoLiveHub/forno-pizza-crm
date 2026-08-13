/* Общий слой запросов к API. Хранит CSRF и текущего пользователя. */
(function () {
  'use strict';

  var state = {
    csrf: '',
    user: null,
    authed: false,
  };

  function parseError(r, data) {
    var msg = (data && data.error) ? data.error : ('Помилка сервера (' + r.status + ')');
    var e = new Error(msg);
    e.status = r.status;
    return e;
  }

  function request(method, url, body) {
    var opts = {
      method: method,
      headers: { 'Accept': 'application/json' },
      credentials: 'same-origin',
    };
    if (body !== undefined) {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(body);
    }
    return fetch(url, opts).then(function (r) {
      return r.json().then(function (data) {
        if (!r.ok) throw parseError(r, data);
        return data;
      });
    }).catch(function (err) {
      if (err && err.status === 401) {
        window.location.href = 'login.html';
      }
      throw err;
    });
  }

  window.API = {
    state: state,

    get: function (url) { return request('GET', url); },

    post: function (url, data) {
      var body = data || {};
      if (state.csrf) body.csrf = state.csrf;
      return request('POST', url, body).then(function (d) {
        if (d.csrf) state.csrf = d.csrf;
        return d;
      });
    },

    loadSession: function () {
      return this.get('api/auth.php').then(function (d) {
        state.csrf = d.csrf || '';
        state.user = d.user || null;
        state.authed = !!d.authed;
        return d;
      });
    },
  };
})();
