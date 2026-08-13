/* Логика экрана входа + демо-вход по роли. */
(function () {
  'use strict';

  var form = document.getElementById('loginForm');
  var errBox = document.getElementById('authError');
  var btn = document.getElementById('loginBtn');

  function setError(msg) {
    errBox.textContent = msg || '';
  }

  function doLogin(username, password) {
    setError('');
    btn.disabled = true;
    var oldLabel = btn.textContent;
    btn.textContent = 'Вхід...';

    API.get('api/auth.php').then(function (d) {
      API.state.csrf = d.csrf;
      return API.post('api/auth.php', {
        action: 'login',
        username: username,
        password: password,
      });
    }).then(function () {
      window.location.href = 'app.html';
    }).catch(function (err) {
      setError(err.message);
      btn.disabled = false;
      btn.textContent = oldLabel;
    });
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    doLogin(form.username.value.trim(), form.password.value);
  });

  // Демо-вхід за роллю (Етап 7). Логіни/паролі тестових користувачів.
  var DEMO_ROLES = [
    { role: 'owner', label: 'Власник', u: 'owner', p: 'owner-2026' },
    { role: 'admin', label: 'Адміністратор', u: 'admin', p: 'admin-2026' },
    { role: 'manager', label: 'Менеджер', u: 'manager', p: 'manager-2026' },
    { role: 'support', label: 'Оператор підтримки', u: 'support', p: 'support-2026' },
    { role: 'cashier', label: 'Касир', u: 'cashier', p: 'cashier-2026' },
    { role: 'cook', label: 'Кухар', u: 'cook', p: 'cook-2026' },
    { role: 'courier', label: 'Кур\'єр', u: 'courier', p: 'courier-2026' },
  ];

  function buildRoleGrid() {
    var grid = document.getElementById('roleGrid');
    if (!grid) return;
    grid.innerHTML = DEMO_ROLES.map(function (r) {
      return '<button class="auth-role" type="button" data-role="' + r.role + '" title="' + r.label + '">' +
        '<span class="auth-role__dot">' + r.label.charAt(0) + '</span>' +
        '<span class="auth-role__name">' + r.label + '</span>' +
      '</button>';
    }).join('');
    grid.addEventListener('click', function (e) {
      var b = e.target.closest('.auth-role');
      if (!b) return;
      var r = DEMO_ROLES.filter(function (x) { return x.role === b.dataset.role; })[0];
      if (!r) return;
      form.username.value = r.u;
      form.password.value = r.p;
      doLogin(r.u, r.p);
    });
  }

  buildRoleGrid();
})();
