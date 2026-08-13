/* Модуль: Персонал */
(function () {
  'use strict';

  var el = null;
  var state = { users: [] };

  var ROLES = { owner: 'Власник', admin: 'Адміністратор', manager: 'Менеджер', cashier: 'Касир', support: 'Оператор підтримки', cook: 'Кухар', courier: 'Кур\'єр' };

  function load() {
    return API.get('api/users.php').then(function (d) {
      state.users = d.users;
      render();
    });
  }

  function render(root) {
    if (root) el = root;
    if (!el) return;
    el.innerHTML =
      '<div class="page-head"><div><h1>Персонал</h1><p class="hint">Користувачі CRM та їх ролі</p></div>' +
        '<button class="btn" data-new type="button">+ Користувач</button></div>' +
      '<div class="card" style="overflow-x:auto"><table class="table"><thead><tr>' +
        '<th>Логін</th><th>Ім\'я</th><th>Роль</th><th>Останній вхід</th><th>Статус</th><th></th>' +
      '</tr></thead><tbody id="userBody"></tbody></table></div>';
    el.addEventListener('click', onClick);
    renderRows();
  }

  function renderRows() {
    var body = el.querySelector('#userBody');
    if (!body) return;
    var canTouchOwner = (API.state.user.role === 'admin' || API.state.user.role === 'owner');
    body.innerHTML = state.users.map(function (u) {
      var active = u.active === 1;
      var me = API.state.user && API.state.user.id === u.id;
      var isOwner = u.role === 'owner';
      var delHidden = me || (isOwner && !canTouchOwner);
      return '<tr>' +
        '<td><b class="num">' + UI.esc(u.username) + '</b>' + (me ? ' <span class="badge badge--gold">Ви</span>' : '') + '</td>' +
        '<td>' + UI.esc(u.name || '—') + '</td>' +
        '<td>' + (ROLES[u.role] || u.role) + '</td>' +
        '<td style="color:var(--ink-3)">' + (u.last_login_at ? String(u.last_login_at).slice(0, 16) : '—') + '</td>' +
        '<td>' + (active ? '<span class="badge badge--green">Активний</span>' : '<span class="badge badge--gray">Вимкнено</span>') + '</td>' +
        '<td class="row-actions">' +
          '<button class="mini-btn" data-edit="' + u.id + '" type="button">Змінити</button>' +
          (delHidden ? '' : '<button class="mini-btn mini-btn--danger" data-del="' + u.id + '" type="button">Видалити</button>') +
        '</td>' +
      '</tr>';
    }).join('');
  }

  function form(id) {
    var u = id ? state.users.filter(function (x) { return x.id === id; })[0] : null;
    var me = API.state.user && API.state.user.id === id;
    var canOwner = (API.state.user.role === 'admin' || API.state.user.role === 'owner');
    var roleList = Object.keys(ROLES).filter(function (k) {
      return k !== 'owner' || canOwner;
    });
    var body =
      '<div class="grid grid--2">' +
        '<div class="field"><label>Логін</label><input id="uLogin" maxlength="30" value="' + UI.esc(u ? u.username : '') + '"></div>' +
        '<div class="field"><label>Ім\'я</label><input id="uName" maxlength="60" value="' + UI.esc(u ? u.name : '') + '"></div>' +
      '</div>' +
      '<div class="grid grid--2">' +
        '<div class="field"><label>Роль</label><select id="uRole">' +
          roleList.map(function (k) { return '<option value="' + k + '"' + (u && u.role === k ? ' selected' : '') + '>' + ROLES[k] + '</option>'; }).join('') +
        '</select></div>' +
        '<div class="field"><label>' + (u ? 'Новий пароль (порожньо = не змінювати)' : 'Пароль') + '</label><input id="uPass" type="password" minlength="6" ' + (u ? '' : 'required') + '></div>' +
      '</div>' +
      '<label style="display:flex;gap:8px;align-items:center"><input type="checkbox" id="uActive" style="width:auto"' + (!u || u.active ? ' checked' : '') + (me ? ' disabled' : '') + '> Активний</label>' +
      '<div class="field__err" id="uErr"></div>';
    var m = UI.modal(u ? 'Користувач: ' + UI.esc(u.username) : 'Новий користувач', body, {
      footer: '<button class="btn btn--ghost" data-act="no">Скасувати</button><button class="btn btn--accent" data-act="yes">Зберегти</button>',
    });
    m.el.querySelector('[data-act="no"]').addEventListener('click', m.close);
    m.el.querySelector('[data-act="yes"]').addEventListener('click', function () {
      API.post('api/users.php', {
        action: 'save_user', id: id || 0,
        username: m.el.querySelector('#uLogin').value,
        name: m.el.querySelector('#uName').value,
        role: m.el.querySelector('#uRole').value,
        pass: m.el.querySelector('#uPass').value,
        active: m.el.querySelector('#uActive').checked,
      }).then(function () { m.close(); UI.toast('Збережено', 'ok'); return load(); })
        .catch(function (e) { m.el.querySelector('#uErr').textContent = e.message; });
    });
  }

  function onClick(e) {
    var t = e.target.closest('[data-new], [data-edit], [data-del]');
    if (!t || !el.contains(t)) return;
    if (t.hasAttribute('data-new')) { form(0); return; }
    if (t.dataset.edit !== undefined) { form(Number(t.dataset.edit)); return; }
    if (t.dataset.del !== undefined) {
      var id = Number(t.dataset.del);
      UI.confirmBox('Видалити користувача?', 'Доступ користувача буде припинено.', function () {
        API.post('api/users.php', { action: 'delete_user', id: id }).then(function () { return load(); }).catch(function (err) { UI.toast(err.message, 'err'); });
      });
    }
  }

  window.CRMModules = window.CRMModules || [];
  window.CRMModules.push({
    id: 'users',
    title: 'Персонал',
    group: 'staff',
    roles: ['admin', 'manager', 'owner'],
    render: function (root) {
      root.innerHTML = '<div class="center-box"><div class="spinner"></div></div>';
      load().then(function () { render(root); }).catch(function (e) {
        root.innerHTML = '<div class="empty">' + UI.esc(e.message) + '</div>';
      });
    },
  });
})();
