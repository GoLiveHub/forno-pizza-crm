/* Модуль: Кухня (KDS) */
(function () {
  'use strict';

  var el = null;
  var state = { orders: [], timer: null };

  function fmtTime(ts) {
    var d = new Date(ts.replace(' ', 'T'));
    return d.toLocaleTimeString(window.I18N ? I18N.locale() : 'uk-UA', { hour: '2-digit', minute: '2-digit' });
  }

  function load() {
    return API.get('api/kds.php').then(function (d) {
      state.orders = d.orders;
      if (el && el.querySelector('#kdsList')) render();
    });
  }

  function render() {
    if (!el) return;
    if (!state.orders.length) {
      el.querySelector('#kdsList').innerHTML = '<div class="empty">Зараз немає замовлень у черзі на приготування</div>';
      return;
    }
    el.querySelector('#kdsList').innerHTML = state.orders.map(function (o) {
      var isCooking = o.status === 'cooking';
      var items = o.items.map(function (l) {
        return '<div class="l"><span>' + l.qty + 'x ' + UI.esc(l.name) + '</span></div>';
      }).join('');
      var action = isCooking
        ? '<button class="btn btn--gold" data-id="' + o.id + '" data-status="done" type="button">Готово</button>'
        : '<button class="btn btn--accent" data-id="' + o.id + '" data-status="cooking" type="button">Взяти в роботу</button>';
      return '<div class="kds__card' + (isCooking ? ' is-cooking' : '') + '">' +
        '<div style="display:flex;justify-content:space-between;align-items:center">' +
          '<b class="num">' + UI.esc(o.num) + '</b>' +
          '<span class="kds__time">' + fmtTime(o.created_at) + '</span>' +
        '</div>' +
        '<div style="display:flex;gap:8px">' + UI.statusBadge(o.status) + '</div>' +
        '<div class="kds__items">' + items + '</div>' +
        (o.comment ? '<div style="color:var(--accent);font-size:var(--fs-sm)">' + UI.esc(o.comment) + '</div>' : '') +
        '<div style="margin-top:auto">' + action + '</div>' +
      '</div>';
    }).join('');
  }

  function build() {
    el.innerHTML =
      '<div class="page-head"><div><h1>Кухня</h1><p class="hint">Нові замовлення (каса + сайт) падають у чергу на приготування автоматично. Оновлюється кожні 10 секунд.</p></div></div>' +
      '<div class="kds" id="kdsList"></div>';
    el.addEventListener('click', function (e) {
      var t = e.target.closest('[data-id]');
      if (!t || !el.contains(t)) return;
      API.post('api/kds.php', { id: Number(t.dataset.id), status: t.dataset.status }).then(function () {
        UI.toast('Статус змінено', 'ok');
        return load();
      }).catch(function (err) { UI.toast(err.message, 'err'); });
    });
  }

  function start() {
    if (state.timer) clearInterval(state.timer);
    state.timer = setInterval(function () {
      if (el && el.classList.contains('is-active')) load();
    }, 10000);
  }

  window.CRMModules = window.CRMModules || [];
  window.CRMModules.push({
    id: 'kds',
    title: 'Кухня',
    group: 'staff',
    roles: ['admin', 'cashier', 'cook', 'manager', 'owner'],
    render: function (root) {
      el = root;
      root.innerHTML = '<div class="center-box"><div class="spinner"></div></div>';
      load().then(function () { build(); render(); start(); }).catch(function (e) {
        root.innerHTML = '<div class="empty">' + UI.esc(e.message) + '</div>';
      });
    },
  });
})();
