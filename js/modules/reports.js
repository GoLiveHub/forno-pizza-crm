/* Модуль: Звіти */
(function () {
  'use strict';

  var el = null;
  var state = { from: '', to: '', group: 'day', data: null };

  function iso(daysBack) {
    var d = new Date();
    d.setDate(d.getDate() - daysBack);
    return d.toISOString().slice(0, 10);
  }

  function load() {
    var p = 'from=' + state.from + '&to=' + state.to + '&group=' + state.group;
    return API.get('api/reports.php?' + p).then(function (d) {
      state.data = d;
      render();
    });
  }

  function render(root) {
    if (root) el = root;
    if (!el) return;
    var d = state.data;
    var t = d.total;

    var cards =
      '<div class="stat-card"><div class="k">Виручка</div><div class="v" style="color:var(--accent)">' + UI.money(t.revenue) + '</div></div>' +
      '<div class="stat-card"><div class="k">Замовлень (виконано)</div><div class="v">' + t.orders_cnt + '</div></div>' +
      '<div class="stat-card"><div class="k">Середній чек</div><div class="v">' + UI.money(t.avg_check) + '</div></div>' +
      '<div class="stat-card"><div class="k">Клієнтів</div><div class="v">' + t.clients + '</div></div>' +
      '<div class="stat-card"><div class="k">Знижки</div><div class="v">' + UI.money(t.discounts) + '</div></div>';

    var statuses = { new: 'Нові', cooking: 'В роботі', delivering: 'У доставці', done: 'Виконані', cancelled: 'Скасовані' };
    var statusHtml = d.by_status.map(function (s) {
      return '<div class="bar-row"><span class="lbl">' + (statuses[s.status] || s.status) + '</span><span class="bar"><i style="width:' + Math.max(3, Math.round(s.cnt / Math.max(1, d.by_status.reduce(function (a, x) { return a + x.cnt; }, 0)) * 100)) + '%"></i></span><span class="val">' + s.cnt + '</span></div>';
    }).join('');

    var maxHour = 1;
    d.by_hour.forEach(function (h) { maxHour = Math.max(maxHour, h.cnt); });
    var hourHtml = '<div style="display:flex;align-items:flex-end;gap:6px;height:120px;padding:10px 0">' +
      d.by_hour.map(function (h) {
        return '<div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;gap:4px" title="' + h.h + ':00 — ' + h.cnt + '">' +
          '<small style="color:var(--ink-3);font-size:10px">' + h.cnt + '</small>' +
          '<div style="width:100%;background:var(--gold);height:' + Math.round(h.cnt / maxHour * 80) + 'px"></div>' +
          '<small style="color:var(--ink-3);font-size:10px">' + h.h + '</small>' +
        '</div>';
      }).join('') + '</div>';

    var maxQty = 1;
    d.top_items.forEach(function (i) { maxQty = Math.max(maxQty, i.qty); });
    var topHtml = d.top_items.map(function (i) {
      return '<div class="bar-row"><span class="lbl">' + UI.esc(i.name) + '</span>' +
        '<span class="bar"><i style="width:' + Math.round(i.qty / maxQty * 100) + '%"></i></span>' +
        '<span class="val">' + i.qty + ' шт · ' + UI.money(i.revenue) + '</span></div>';
    }).join('');

    el.innerHTML =
      '<div class="page-head"><div><h1>Звіти</h1><p class="hint">Виручка та аналітика за період</p></div></div>' +
      '<div class="toolbar">' +
        '<input type="date" id="rFrom" value="' + state.from + '">' +
        '<input type="date" id="rTo" value="' + state.to + '">' +
        '<select id="rGroup"><option value="day"' + (state.group === 'day' ? ' selected' : '') + '>По днях</option>' +
          '<option value="week"' + (state.group === 'week' ? ' selected' : '') + '>По тижнях</option>' +
          '<option value="month"' + (state.group === 'month' ? ' selected' : '') + '>По місяцях</option></select>' +
        '<button class="btn" id="rGo" type="button">Показати</button>' +
        '<button class="btn btn--ghost" id="r7" type="button">7 днів</button>' +
        '<button class="btn btn--ghost" id="r30" type="button">30 днів</button>' +
      '</div>' +
      '<div class="report-cards">' + cards + '</div>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">' +
        '<div class="card" style="padding:16px"><h3 style="margin-bottom:12px">Топ позицій</h3>' + (topHtml || '<div class="empty">Немає даних</div>') + '</div>' +
        '<div class="card" style="padding:16px"><h3 style="margin-bottom:12px">По статусах</h3>' + statusHtml + '</div>' +
        '<div class="card" style="padding:16px"><h3 style="margin-bottom:12px">Години пік</h3>' + hourHtml + '</div>' +
        '<div class="card" style="padding:16px"><h3 style="margin-bottom:12px">Динаміка (' + (state.group === 'month' ? 'місяці' : state.group === 'week' ? 'тижні' : 'дні') + ')</h3>' +
          d.series.map(function (s) {
            var max = Math.max.apply(null, d.series.map(function (x) { return x.revenue; })) || 1;
            return '<div class="bar-row"><span class="lbl">' + UI.esc(s.date) + '</span><span class="bar"><i style="width:' + Math.round(s.revenue / max * 100) + '%"></i></span><span class="val">' + s.orders + ' · ' + UI.money(s.revenue) + '</span></div>';
          }).join('') +
        '</div>' +
      '</div>';

    el.querySelector('#rGo').addEventListener('click', function () {
      state.from = el.querySelector('#rFrom').value;
      state.to = el.querySelector('#rTo').value;
      load();
    });
    el.querySelector('#r7').addEventListener('click', function () {
      state.from = iso(6); state.to = iso(0);
      el.querySelector('#rFrom').value = state.from;
      el.querySelector('#rTo').value = state.to;
      load();
    });
    el.querySelector('#r30').addEventListener('click', function () {
      state.from = iso(29); state.to = iso(0);
      el.querySelector('#rFrom').value = state.from;
      el.querySelector('#rTo').value = state.to;
      load();
    });
    el.querySelector('#rGroup').addEventListener('change', function () {
      state.group = el.querySelector('#rGroup').value;
      load();
    });
  }

  window.CRMModules = window.CRMModules || [];
  window.CRMModules.push({
    id: 'reports',
    title: 'Звіти',
    group: 'analytics',
    roles: ['admin', 'cashier', 'manager', 'owner'],
    render: function (root) {
      el = root;
      state.from = iso(29);
      state.to = iso(0);
      root.innerHTML = '<div class="center-box"><div class="spinner"></div></div>';
      load().then(function () { render(root); }).catch(function (e) {
        root.innerHTML = '<div class="empty">' + UI.esc(e.message) + '</div>';
      });
    },
  });
})();
