/* Модуль: Клієнти */
(function () {
  'use strict';

  var el = null;
  var state = { clients: [], q: '', timer: null };

  function load() {
    var q = state.q ? '&q=' + encodeURIComponent(state.q) : '';
    return API.get('api/clients.php?' + q).then(function (d) {
      state.clients = d.clients;
      render();
    });
  }

  function fmtDate(ts) {
    if (!ts) return '—';
    var d = new Date(ts.replace(' ', 'T'));
    return d.toLocaleDateString(window.I18N ? I18N.locale() : 'uk-UA', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  function render(root) {
    if (root) el = root;
    if (!el) return;
    el.innerHTML =
      '<div class="page-head"><div><h1>Клієнти</h1><p class="hint">База клієнтів та чорний список</p></div></div>' +
      '<div class="toolbar"><input class="search" id="clSearch" placeholder="Пошук: ім\'я, телефон"><div style="flex:1"></div><span style="color:var(--ink-3);font-size:var(--fs-sm)">Знайдено: ' + state.clients.length + '</span></div>' +
      '<div class="card" style="overflow-x:auto"><table class="table"><thead><tr>' +
        '<th>Телефон</th><th>Ім\'я</th><th>Адреса</th><th>Замовлень</th><th>Витрачено</th><th>Останнє</th><th>Статус</th><th></th>' +
      '</tr></thead><tbody id="clBody"></tbody></table></div>';
    el.addEventListener('click', onClick);
    el.addEventListener('input', function (e) {
      if (e.target.id !== 'clSearch') return;
      state.q = e.target.value.trim();
      clearTimeout(state.timer);
      state.timer = setTimeout(load, 400);
    });
    renderRows();
  }

  function renderRows() {
    var body = el.querySelector('#clBody');
    if (!body) return;
    if (!state.clients.length) { body.innerHTML = '<tr><td colspan="8" style="text-align:center;color:var(--ink-3)">Немає клієнтів</td></tr>'; return; }
    body.innerHTML = state.clients.map(function (c) {
      var black = c.blacklist === 1;
      return '<tr>' +
        '<td class="num">' + UI.esc(c.phone) + '</td>' +
        '<td>' + UI.esc(c.name || '—') + '</td>' +
        '<td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + UI.esc(c.address || '') + '</td>' +
        '<td>' + c.orders_cnt + '</td>' +
        '<td class="num">' + UI.money(c.total_spent || 0) + '</td>' +
        '<td style="color:var(--ink-3);white-space:nowrap">' + fmtDate(c.last_order_at) + '</td>' +
        '<td>' + (black ? '<span class="badge badge--red">Чорний список</span>' : '<span class="badge badge--green">Активний</span>') + '</td>' +
        '<td class="row-actions">' +
          '<button class="mini-btn" data-edit="' + c.id + '" type="button">Змінити</button>' +
          '<button class="mini-btn' + (black ? '' : ' mini-btn--danger') + '" data-black="' + c.id + '" type="button">' + (black ? 'Розблокувати' : 'У ЧС') + '</button>' +
        '</td>' +
      '</tr>';
    }).join('');
  }

  function editForm(id) {
    var c = state.clients.filter(function (x) { return x.id === id; })[0];
    if (!c) return;
    var body =
      '<div class="field"><label>Ім\'я</label><input id="clName" maxlength="60" value="' + UI.esc(c.name || '') + '"></div>' +
      '<div class="field"><label>Адреса</label><input id="clAddr" maxlength="200" value="' + UI.esc(c.address || '') + '"></div>' +
      '<div class="field"><label>Нотатки</label><textarea id="clNotes" rows="3" maxlength="500">' + UI.esc(c.notes || '') + '</textarea></div>' +
      '<div class="field__err" id="clErr"></div>';
    var m = UI.modal('Клієнт: ' + UI.esc(c.phone), body, {
      footer: '<button class="btn btn--ghost" data-act="no">Скасувати</button><button class="btn btn--accent" data-act="yes">Зберегти</button>',
    });
    m.el.querySelector('[data-act="no"]').addEventListener('click', m.close);
    m.el.querySelector('[data-act="yes"]').addEventListener('click', function () {
      API.post('api/clients.php', { action: 'update_client', id: id, name: m.el.querySelector('#clName').value, address: m.el.querySelector('#clAddr').value, notes: m.el.querySelector('#clNotes').value })
        .then(function () { m.close(); UI.toast('Збережено', 'ok'); return load(); })
        .catch(function (e) { m.el.querySelector('#clErr').textContent = e.message; });
    });
  }

  function onClick(e) {
    var t = e.target.closest('[data-edit], [data-black]');
    if (!t || !el.contains(t)) return;
    if (t.dataset.edit !== undefined) { editForm(Number(t.dataset.edit)); return; }
    if (t.dataset.black !== undefined) {
      var id = Number(t.dataset.black);
      API.post('api/clients.php', { action: 'toggle_blacklist', id: id }).then(function () { return load(); }).catch(function (err) { UI.toast(err.message, 'err'); });
    }
  }

  window.CRMModules = window.CRMModules || [];
  window.CRMModules.push({
    id: 'clients',
    title: 'Клієнти',
    group: 'manage',
    roles: ['admin', 'cashier', 'manager', 'support', 'owner'],
    render: function (root) {
      root.innerHTML = '<div class="center-box"><div class="spinner"></div></div>';
      load().then(function () { render(root); }).catch(function (e) {
        root.innerHTML = '<div class="empty">' + UI.esc(e.message) + '</div>';
      });
    },
  });
})();
