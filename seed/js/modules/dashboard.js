/* Модуль: Дашборд (головна після входу) — виручка, активні замовлення, години пік, ТОП-5, доставка/самовивіз, час приготування, ефективність кур'єрів */
(function () {
  'use strict';

  var el = null;
  var state = { data: null };

  function iso(daysBack) {
    var d = new Date();
    d.setDate(d.getDate() - daysBack);
    return d.toISOString().slice(0, 10);
  }

  function load() {
    return API.get('api/dashboard.php').then(function (d) {
      state.data = d;
      render();
    });
  }

  function statCard(label, value, cls) {
    return '<div class="stat-card"><div class="k">' + label + '</div><div class="v" style="' + (cls ? 'color:' + cls : '') + '">' + value + '</div></div>';
  }

  function barRow(label, pct, value) {
    return '<div class="bar-row"><span class="lbl">' + label + '</span>' +
      '<span class="bar"><i style="width:' + pct + '%"></i></span>' +
      '<span class="val">' + value + '</span></div>';
  }

  function render(root) {
    if (root) el = root;
    if (!el) return;
    var d = state.data;

    var cards =
      statCard('Виручка сьогодні', UI.money(d.today.revenue), 'var(--accent)') +
      statCard('Замовлень сьогодні', d.today.orders_cnt) +
      statCard('Виручка за тиждень', UI.money(d.week.revenue), 'var(--accent)') +
      statCard('Виручка за місяць', UI.money(d.month.revenue), 'var(--accent)') +
      statCard('Активних замовлень', d.active_orders.total);

    var st = { new: 'Нові', cooking: 'В роботі', delivering: 'У доставці' };
    var activeHtml = d.active_orders.total === 0
      ? '<div class="empty">Все замовлення оброблені</div>'
      : d.active_orders.by_status.map(function (s) {
          return '<div class="dash-status"><b>' + (st[s.status] || s.status) + '</b><span>' + s.cnt + '</span></div>';
        }).join('');

    var maxHour = 1;
    d.by_hour.forEach(function (h) { maxHour = Math.max(maxHour, h.cnt); });
    var hourHtml = d.by_hour.length
      ? '<div style="display:flex;align-items:flex-end;gap:6px;height:120px;padding:10px 0">' +
        d.by_hour.map(function (h) {
          return '<div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;gap:4px" title="' + h.h + ':00 — ' + h.cnt + '">' +
            '<small style="color:var(--ink-3);font-size:10px">' + h.cnt + '</small>' +
            '<div style="width:100%;background:var(--gold);height:' + Math.round(h.cnt / maxHour * 80) + 'px"></div>' +
            '<small style="color:var(--ink-3);font-size:10px">' + h.h + '</small>' +
          '</div>';
        }).join('') + '</div>'
      : '<div class="empty">Немає даних</div>';

    var maxQty = 1;
    d.top_items.forEach(function (i) { maxQty = Math.max(maxQty, i.qty); });
    var topHtml = d.top_items.map(function (i) {
      return barRow(UI.esc(i.name), Math.round(i.qty / maxQty * 100), i.qty + ' шт · ' + UI.money(i.revenue));
    }).join('');

    var dl = { courier: 'Доставка', pickup: 'Самовивіз', dinein: 'На місці' };
    var maxDel = 1;
    d.by_delivery.forEach(function (x) { maxDel = Math.max(maxDel, x.cnt); });
    var delHtml = d.by_delivery.length
      ? d.by_delivery.map(function (x) {
          return barRow(dl[x.delivery_type] || x.delivery_type, Math.round(x.cnt / maxDel * 100), x.cnt + ' · ' + UI.money(x.revenue));
        }).join('')
      : '<div class="empty">Немає даних</div>';

    var couriersHtml = d.couriers.length
      ? d.couriers.map(function (c) {
          return '<div class="bar-row"><span class="lbl">' + UI.esc(c.name) + '</span>' +
            '<span class="bar"><i style="width:' + Math.min(100, Math.round(c.deliveries / Math.max(1, d.couriers[0].deliveries) * 100)) + '%;background:var(--green)"></i></span>' +
            '<span class="val">' + c.deliveries + ' дост. · ' + c.avg_delivery_min + ' хв</span></div>';
        }).join('')
      : '<div class="empty">Немає доставок за період</div>';

    el.innerHTML =
      '<div class="page-head"><div><h1>Дашборд</h1><p class="hint">Виручка та активність за сьогодні / тиждень / місяць</p></div>' +
        '<button class="btn btn--ghost" data-refresh type="button">Оновити</button></div>' +
      '<div class="report-cards">' + cards + '</div>' +
      '<div class="dash-cols">' +
        '<div class="card dash-card"><h3 class="dash-title">Активні замовлення</h3><div class="dash-statuses">' + activeHtml + '</div></div>' +
        '<div class="card dash-card"><h3 class="dash-title">Середня тривалість приготування</h3>' +
          '<div class="dash-big">' + d.avg_prep_min + ' <small>хв</small></div></div>' +
        '<div class="card dash-card"><h3 class="dash-title">ТОП-5 страв</h3>' + (topHtml || '<div class="empty">Немає даних</div>') + '</div>' +
        '<div class="card dash-card"><h3 class="dash-title">Доставка / самовивіз</h3>' + delHtml + '</div>' +
        '<div class="card dash-card"><h3 class="dash-title">Години пік (30 днів)</h3>' + hourHtml + '</div>' +
        '<div class="card dash-card"><h3 class="dash-title">Ефективність кур\'єрів</h3>' + couriersHtml + '</div>' +
      '</div>';

    el.querySelector('[data-refresh]').addEventListener('click', function () {
      load().catch(function (err) { UI.toast(err.message, 'err'); });
    });
  }

  window.CRMModules = window.CRMModules || [];
  window.CRMModules.push({
    id: 'dashboard',
    title: 'Дашборд',
    group: 'analytics',
    roles: ['admin', 'cashier', 'manager', 'owner'],
    render: function (root) {
      el = root;
      root.innerHTML = '<div class="center-box"><div class="spinner"></div></div>';
      load().then(function () { render(root); }).catch(function (e) {
        root.innerHTML = '<div class="empty">' + UI.esc(e.message) + '</div>';
      });
    },
  });
})();
