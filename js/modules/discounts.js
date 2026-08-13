/* Модуль: Акції та промокоди */
(function () {
  'use strict';

  var el = null;
  var state = { promos: [], cats: [] };

  var KIND = { percent: 'Відсоток %', fixed: 'Фіксована сума', bogo: '2 по ціні 1' };

  function load() {
    return API.get('api/discounts.php').then(function (d) {
      state.promos = d.promocodes;
      state.cats = d.categories;
      render();
    });
  }

  function fmtDate(ts) {
    return ts ? String(ts).slice(0, 10) : '';
  }

  function render(root) {
    if (root) el = root;
    if (!el) return;
    el.innerHTML =
      '<div class="page-head"><div><h1>Акції та промокоди</h1><p class="hint">Знижки для клієнтів при замовленні</p></div>' +
        '<button class="btn" data-new type="button">+ Новий промокод</button></div>' +
      '<div class="card" style="overflow-x:auto"><table class="table"><thead><tr>' +
        '<th>Код</th><th>Тип</th><th>Знижка</th><th>Категорія</th><th>Мін. сума</th><th>Використано</th><th>Термін</th><th>Статус</th><th></th>' +
      '</tr></thead><tbody id="promoBody"></tbody></table></div>';
    el.addEventListener('click', onClick);
    renderRows();
  }

  function renderRows() {
    var body = el.querySelector('#promoBody');
    if (!body) return;
    if (!state.promos.length) { body.innerHTML = '<tr><td colspan="9" style="text-align:center;color:var(--ink-3)">Промокодів немає</td></tr>'; return; }
    body.innerHTML = state.promos.map(function (p) {
      var catName = p.category_id ? (state.cats.filter(function (c) { return c.id === p.category_id; })[0] || { name: '' }).name : 'Усі';
      var active = p.active === 1;
      return '<tr>' +
        '<td><b class="num">' + UI.esc(p.code) + '</b></td>' +
        '<td>' + (KIND[p.kind] || p.kind) + '</td>' +
        '<td class="num">' + (p.kind === 'percent' ? p.value + '%' : (p.kind === 'bogo' ? '1 шт' : UI.money(p.value))) + '</td>' +
        '<td>' + UI.esc(catName) + '</td>' +
        '<td class="num">' + UI.money(p.min_total) + '</td>' +
        '<td class="num">' + p.used + (p.max_uses ? '/' + p.max_uses : '') + '</td>' +
        '<td style="color:var(--ink-3)">' + (p.starts ? fmtDate(p.starts) : '—') + ' → ' + (p.ends ? fmtDate(p.ends) : '∞') + '</td>' +
        '<td>' + (active ? '<span class="badge badge--green">Активний</span>' : '<span class="badge badge--gray">Вимкнено</span>') + '</td>' +
        '<td class="row-actions">' +
          '<button class="mini-btn" data-edit="' + p.id + '" type="button">Змінити</button>' +
          '<button class="mini-btn mini-btn--danger" data-del="' + p.id + '" type="button">Видалити</button>' +
        '</td>' +
      '</tr>';
    }).join('');
  }

  function form(id) {
    var p = id ? state.promos.filter(function (x) { return x.id === id; })[0] : null;
    var catOpts = '<option value="0">Усі категорії</option>' + state.cats.map(function (c) {
      return '<option value="' + c.id + '"' + (p && p.category_id === c.id ? ' selected' : '') + '>' + UI.esc(c.name) + '</option>';
    }).join('');
    var body =
      '<div class="grid grid--2">' +
        '<div class="field"><label>Код</label><input id="pCode" maxlength="20" value="' + UI.esc(p ? p.code : '') + '" placeholder="SUMMER20" style="text-transform:uppercase"></div>' +
        '<div class="field"><label>Тип</label><select id="pKind">' +
          '<option value="percent"' + (p && p.kind === 'percent' ? ' selected' : '') + '>Відсоток %</option>' +
          '<option value="fixed"' + (p && p.kind === 'fixed' ? ' selected' : '') + '>Фіксована сума</option>' +
          '<option value="bogo"' + (p && p.kind === 'bogo' ? ' selected' : '') + '>2 по ціні 1</option>' +
        '</select></div>' +
      '</div>' +
      '<div class="grid grid--2">' +
        '<div class="field"><label>Знижка</label><input id="pValue" type="number" step="0.01" min="0" value="' + (p ? p.value : 10) + '"></div>' +
        '<div class="field"><label>Категорія</label><select id="pCat">' + catOpts + '</select></div>' +
      '</div>' +
      '<div class="grid grid--2">' +
        '<div class="field"><label>Мінімальна сума</label><input id="pMin" type="number" step="0.01" min="0" value="' + (p ? p.min_total : 0) + '"></div>' +
        '<div class="field"><label>Ліміт використань (0 = безлім)</label><input id="pMax" type="number" min="0" value="' + (p ? p.max_uses : 0) + '"></div>' +
      '</div>' +
      '<div class="grid grid--2">' +
        '<div class="field"><label>Початок</label><input id="pStart" type="date" value="' + fmtDate(p ? p.starts : '') + '"></div>' +
        '<div class="field"><label>Закінчення</label><input id="pEnd" type="date" value="' + fmtDate(p ? p.ends : '') + '"></div>' +
      '</div>' +
      '<label style="display:flex;gap:8px;align-items:center"><input type="checkbox" id="pActive" style="width:auto"' + (!p || p.active ? ' checked' : '') + '> Активний</label>' +
      '<div class="field__err" id="pErr"></div>';
    var m = UI.modal(id ? 'Промокод: ' + UI.esc(p.code) : 'Новий промокод', body, {
      footer: '<button class="btn btn--ghost" data-act="no">Скасувати</button><button class="btn btn--accent" data-act="yes">Зберегти</button>',
    });
    m.el.querySelector('[data-act="no"]').addEventListener('click', m.close);
    m.el.querySelector('[data-act="yes"]').addEventListener('click', function () {
      var start = m.el.querySelector('#pStart').value;
      var end = m.el.querySelector('#pEnd').value;
      if (start && end && start > end) { m.el.querySelector('#pErr').textContent = 'Дата початку пізніше закінчення'; return; }
      API.post('api/discounts.php', {
        action: 'save_promo', id: id || 0,
        code: m.el.querySelector('#pCode').value,
        kind: m.el.querySelector('#pKind').value,
        value: m.el.querySelector('#pValue').value,
        category_id: m.el.querySelector('#pCat').value,
        min_total: m.el.querySelector('#pMin').value,
        max_uses: m.el.querySelector('#pMax').value,
        starts: start, ends: end,
        active: m.el.querySelector('#pActive').checked,
      }).then(function () { m.close(); UI.toast('Збережено', 'ok'); return load(); })
        .catch(function (e) { m.el.querySelector('#pErr').textContent = e.message; });
    });
  }

  function onClick(e) {
    var t = e.target.closest('[data-new], [data-edit], [data-del]');
    if (!t || !el.contains(t)) return;
    if (t.hasAttribute('data-new')) { form(0); return; }
    if (t.dataset.edit !== undefined) { form(Number(t.dataset.edit)); return; }
    if (t.dataset.del !== undefined) {
      var id = Number(t.dataset.del);
      UI.confirmBox('Видалити промокод?', 'Промокод буде видалено безповоротно.', function () {
        API.post('api/discounts.php', { action: 'delete_promo', id: id }).then(function () { return load(); }).catch(function (err) { UI.toast(err.message, 'err'); });
      });
    }
  }

  window.CRMModules = window.CRMModules || [];
  window.CRMModules.push({
    id: 'discounts',
    title: 'Акції',
    group: 'manage',
    roles: ['admin', 'cashier', 'manager', 'owner'],
    render: function (root) {
      root.innerHTML = '<div class="center-box"><div class="spinner"></div></div>';
      load().then(function () { render(root); }).catch(function (e) {
        root.innerHTML = '<div class="empty">' + UI.esc(e.message) + '</div>';
      });
    },
  });
})();
