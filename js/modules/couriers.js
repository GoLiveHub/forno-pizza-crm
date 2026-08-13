/* Модуль: Кур'єри (Етап 8) — список зі статусом вільний/зайнятий */
(function () {
  'use strict';

  var el = null;
  var state = { couriers: [], timer: null };

  var STATUS_LABEL = { new: 'Нове', cooking: 'Готується', delivering: 'У дорозі' };

  function load() {
    return API.get('api/couriers.php').then(function (d) {
      state.couriers = d.couriers || [];
      renderRows();
    });
  }

  function render(root) {
    if (root) el = root;
    if (!el) return;
    el.innerHTML =
      '<div style="display:flex;justify-content:flex-end;margin-bottom:12px"><button class="btn" data-refresh type="button">Оновити</button></div>' +
      '<div id="courierStats" class="courier-stats"></div>' +
      '<div id="couriersGrid" class="couriers"></div>';
    el.addEventListener('click', onClick);
    renderRows();
  }

  function renderStats() {
    var box = el ? el.querySelector('#courierStats') : null;
    if (!box) return;
    var total = state.couriers.length;
    var busy = state.couriers.filter(function (c) { return c.status === 'busy'; }).length;
    var active = state.couriers.reduce(function (s, c) { return s + (c.orders || []).length; }, 0);
    var items = [
      ['Кур\'єрів', total],
      ['Вільні', total - busy],
      ['Зайняті', busy],
      ['Активних доставок', active],
    ].map(function (x) {
      return '<div class="stat-card" style="padding:12px 16px"><div class="k">' + x[0] + '</div><div class="v" style="font-size:var(--fs-xl)">' + x[1] + '</div></div>';
    }).join('');
    box.innerHTML = '<div class="report-cards" style="margin-bottom:var(--sp-4)">' + items + '</div>';
  }

  function renderRows() {
    renderStats();
    var grid = el ? el.querySelector('#couriersGrid') : null;
    if (!grid) return;
    if (!state.couriers.length) {
      grid.innerHTML = '<div class="empty">Немає кур\'єрів. Додайте кур\'єра в розділі «Персонал».</div>';
      return;
    }
    grid.innerHTML = state.couriers.map(function (c) {
      var busy = c.status === 'busy';
      var badge = busy
        ? '<span class="badge badge--accent">Зайнятий</span>'
        : '<span class="badge badge--green">Вільний</span>';
      var orders = (c.orders || []).map(function (o) {
        return '<div class="courier-order">' +
          '<b class="num">' + UI.esc(o.num) + '</b>' +
          '<span class="badge badge--gray">' + (STATUS_LABEL[o.status] || UI.esc(o.status)) + '</span>' +
          '<span class="num">' + UI.money(o.total) + '</span>' +
        '</div>';
      }).join('');
      return '<div class="card courier-card">' +
        '<div class="courier-card__head">' +
          '<div>' +
            '<b>' + UI.esc(c.name || c.username) + '</b>' +
            '<div class="courier-card__user">' + UI.esc(c.username) + '</div>' +
          '</div>' +
          badge +
        '</div>' +
        '<div class="courier-card__body">' +
          (busy
            ? '<div class="courier-card__label">Активні замовлення: <b class="num">' + (c.orders || []).length + '</b></div>' + orders
            : '<div style="color:var(--ink-3)">Немає активних замовлень</div>') +
        '</div>' +
      '</div>';
    }).join('');
  }

  function onClick(e) {
    var t = e.target.closest('[data-refresh]');
    if (!t || !el.contains(t)) return;
    load().catch(function (err) { UI.toast(err.message, 'err'); });
  }

  function startPolling() {
    stopPolling();
    state.timer = setInterval(function () {
      if (el && el.classList.contains('is-active')) load().catch(function () {});
    }, 15000);
  }

  function stopPolling() {
    if (state.timer) { clearInterval(state.timer); state.timer = null; }
  }

  window.CRMModules = window.CRMModules || [];
  window.CRMModules.push({
    id: 'couriers',
    title: 'Кур\'єри',
    group: 'staff',
    roles: ['admin', 'cashier', 'manager', 'owner'],
    render: function (root) {
      el = root;
      root.innerHTML = '<div class="center-box"><div class="spinner"></div></div>';
      load().then(function () { render(root); startPolling(); }).catch(function (e) {
        root.innerHTML = '<div class="empty">' + UI.esc(e.message) + '</div>';
      });
    },
  });
})();
