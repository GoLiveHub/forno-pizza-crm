/* Модуль: Журнал дій */
(function () {
  'use strict';

  var el = null;
  var state = { rows: [], q: '', from: '', to: '', timer: null };

  function iso(daysBack) {
    var d = new Date();
    d.setDate(d.getDate() - daysBack);
    return d.toISOString().slice(0, 10);
  }

  function load() {
    var p = 'from=' + state.from + '&to=' + state.to + '&q=' + encodeURIComponent(state.q) + '&limit=300';
    return API.get('api/audit.php?' + p).then(function (d) {
      state.rows = d.audit;
      renderRows();
    });
  }

  function render(root) {
    el = root;
    el.innerHTML =
      '<div class="page-head"><div><h1>Журнал дій</h1><p class="hint">Аудит змін у системі</p></div></div>' +
      '<div class="toolbar">' +
        '<input type="date" id="aFrom" value="' + state.from + '">' +
        '<input type="date" id="aTo" value="' + state.to + '">' +
        '<input class="search" id="aQ" placeholder="Пошук: дія, користувач, деталі" style="max-width:300px">' +
        '<button class="btn" id="aGo" type="button">Показати</button>' +
        '<button class="btn btn--ghost" id="a7" type="button">7 днів</button>' +
        '<button class="btn btn--ghost" id="a30" type="button">30 днів</button>' +
      '</div>' +
      '<div class="card" style="overflow-x:auto"><table class="table"><thead><tr>' +
        '<th>Час</th><th>Користувач</th><th>Дія</th><th>Об\'єкт</th><th>Деталі</th>' +
      '</tr></thead><tbody id="auditBody"></tbody></table></div>';

    el.querySelector('#aGo').addEventListener('click', function () {
      state.from = el.querySelector('#aFrom').value;
      state.to = el.querySelector('#aTo').value;
      load();
    });
    el.querySelector('#a7').addEventListener('click', function () {
      state.from = iso(6); state.to = iso(0);
      el.querySelector('#aFrom').value = state.from;
      el.querySelector('#aTo').value = state.to;
      load();
    });
    el.querySelector('#a30').addEventListener('click', function () {
      state.from = iso(29); state.to = iso(0);
      el.querySelector('#aFrom').value = state.from;
      el.querySelector('#aTo').value = state.to;
      load();
    });
    el.addEventListener('input', function (e) {
      if (e.target.id !== 'aQ') return;
      state.q = e.target.value.trim();
      clearTimeout(state.timer);
      state.timer = setTimeout(load, 400);
    });

    renderRows();
  }

  function renderRows() {
    var body = el.querySelector('#auditBody');
    if (!body) return;
    if (!state.rows.length) { body.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--ink-3)">Записів немає</td></tr>'; return; }
    body.innerHTML = state.rows.map(function (a) {
      return '<tr>' +
        '<td class="num" style="white-space:nowrap;color:var(--ink-3)">' + UI.esc(String(a.created_at).slice(0, 16)) + '</td>' +
        '<td>' + UI.esc(a.username || '—') + '</td>' +
        '<td><b>' + UI.esc(a.action) + '</b></td>' +
        '<td>' + UI.esc(a.entity) + (a.entity_id ? ' #' + UI.esc(a.entity_id) : '') + '</td>' +
        '<td style="color:var(--ink-2)">' + UI.esc(a.detail || '') + '</td>' +
      '</tr>';
    }).join('');
  }

  window.CRMModules = window.CRMModules || [];
  window.CRMModules.push({
    id: 'audit',
    title: 'Журнал дій',
    group: 'system',
    roles: ['admin', 'owner'],
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
