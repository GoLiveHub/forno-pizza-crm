/* Модуль: Склад */
(function () {
  'use strict';

  var el = null;
  var state = { ings: [], items: [], recipes: {}, mode: 'cards' };

  function load() {
    return API.get('api/stock.php').then(function (d) {
      state.ings = d.ingredients;
      state.items = d.items;
      state.recipes = d.recipes || {};
      render();
    });
  }

  function render(root) {
    if (root) el = root;
    if (!el) return;
    el.innerHTML =
      '<div class="page-head"><div><h1>Склад</h1><p class="hint">Залишки інгредієнтів та рецепти позицій</p></div>' +
        '<div style="display:flex;gap:8px">' +
          '<button class="btn btn--ghost" data-open="recipe" type="button">Рецепти</button>' +
          '<button class="btn" data-open="ing" type="button">+ Інгредієнт</button>' +
        '</div></div>' +
      '<div class="stock-grid" id="stockGrid"></div>';
    el.addEventListener('click', onClick);
    renderGrid();
  }

  function renderGrid() {
    var grid = el.querySelector('#stockGrid');
    if (!state.ings.length) { grid.innerHTML = '<div class="empty">Немає інгредієнтів</div>'; return; }
    grid.innerHTML = state.ings.map(function (i) {
      var low = i.stock <= i.min_stock;
      var pct = i.min_stock > 0 ? Math.min(100, Math.round(i.stock / (i.min_stock * 2) * 100)) : 100;
      return '<div class="stock-card">' +
        '<div style="display:flex;justify-content:space-between;align-items:center">' +
          '<b>' + UI.esc(i.name) + '</b>' +
          '<button class="mini-btn" data-stockin="' + i.id + '" type="button">+ закупівля</button>' +
        '</div>' +
        '<span class="qty' + (low ? ' is-low' : '') + '">' + UI.esc(UI.qty(i.stock)) + ' ' + UI.esc(i.unit) + '</span>' +
        '<div class="stock-bar' + (low ? ' is-low' : '') + '"><i style="width:' + pct + '%"></i></div>' +
        '<small style="color:var(--ink-3)">Мін.: ' + UI.esc(UI.qty(i.min_stock)) + ' ' + UI.esc(i.unit) + (low ? ' · НЕ ВИСТАЧАЄ' : '') + '</small>' +
        '<div class="row-actions">' +
          '<button class="mini-btn" data-edit="' + i.id + '" type="button">Змінити</button>' +
          '<button class="mini-btn mini-btn--danger" data-del="' + i.id + '" type="button">Видалити</button>' +
        '</div>' +
      '</div>';
    }).join('');
  }

  function ingForm(id) {
    var i = id ? state.ings.filter(function (x) { return x.id === id; })[0] : null;
    var body =
      '<div class="grid grid--2">' +
        '<div class="field"><label>Назва</label><input id="ingName" maxlength="60" value="' + UI.esc(i ? i.name : '') + '"></div>' +
        '<div class="field"><label>Одиниця</label><input id="ingUnit" maxlength="10" value="' + UI.esc(i ? i.unit : 'шт') + '"></div>' +
      '</div>' +
      '<div class="grid grid--2">' +
        '<div class="field"><label>Залишок</label><input id="ingStock" type="number" step="0.01" min="0" value="' + (i ? i.stock : 0) + '"></div>' +
        '<div class="field"><label>Мінімум</label><input id="ingMin" type="number" step="0.01" min="0" value="' + (i ? i.min_stock : 0) + '"></div>' +
      '</div>' +
      '<label style="display:flex;gap:8px;align-items:center"><input type="checkbox" id="ingActive" style="width:auto"' + (!i || i.active ? ' checked' : '') + '> Активний</label>';
    var m = UI.modal(id ? 'Змінити інгредієнт' : 'Новий інгредієнт', body, {
      footer: '<button class="btn btn--ghost" data-act="no">Скасувати</button><button class="btn btn--accent" data-act="yes">Зберегти</button>',
    });
    m.el.querySelector('[data-act="no"]').addEventListener('click', m.close);
    m.el.querySelector('[data-act="yes"]').addEventListener('click', function () {
      API.post('api/stock.php', {
        action: 'save_ingredient', id: id || 0,
        name: m.el.querySelector('#ingName').value,
        unit: m.el.querySelector('#ingUnit').value,
        stock: m.el.querySelector('#ingStock').value,
        min_stock: m.el.querySelector('#ingMin').value,
        active: m.el.querySelector('#ingActive').checked,
      }).then(function () { m.close(); UI.toast('Збережено', 'ok'); return load(); }).catch(function (e) { UI.toast(e.message, 'err'); });
    });
  }

  function stockIn(id) {
    var i = state.ings.filter(function (x) { return x.id === id; })[0];
    if (!i) return;
    var body =
      '<div class="field"><label>Інгредієнт</label><input value="' + UI.esc(i.name) + '" disabled></div>' +
      '<div class="grid grid--2">' +
        '<div class="field"><label>Кількість (' + UI.esc(i.unit) + ')</label><input id="siQty" type="number" step="0.01" min="0.01" value="1"></div>' +
        '<div class="field"><label>Примітка</label><input id="siNote" maxlength="200" placeholder="Закупівля"></div>' +
      '</div>';
    var m = UI.modal('Закупівля: ' + UI.esc(i.name), body, {
      footer: '<button class="btn btn--ghost" data-act="no">Скасувати</button><button class="btn btn--accent" data-act="yes">Додати</button>',
    });
    m.el.querySelector('[data-act="no"]').addEventListener('click', m.close);
    m.el.querySelector('[data-act="yes"]').addEventListener('click', function () {
      API.post('api/stock.php', { action: 'stock_in', ingredient_id: id, qty: m.el.querySelector('#siQty').value, note: m.el.querySelector('#siNote').value })
        .then(function () { m.close(); UI.toast('Залишок оновлено', 'ok'); return load(); })
        .catch(function (e) { UI.toast(e.message, 'err'); });
    });
  }

  function recipeForm() {
    var rows = state.items.map(function (it) {
      var rec = state.recipes[it.id] || [];
      var ingOpts = state.ings.map(function (i) {
        return '<option value="' + i.id + '"' + (rec.length === 1 && rec[0].ingredient_id === i.id ? ' selected' : '') + '>' + UI.esc(i.name) + '</option>';
      }).join('');
      return '<div class="recipe-row" data-item="' + it.id + '" style="display:grid;grid-template-columns:1fr 1fr 90px 30px;gap:8px;align-items:center;padding:6px 0;border-bottom:1px dashed var(--line)">' +
        '<b style="font-size:var(--fs-sm)">' + UI.esc(it.name) + '</b>' +
        '<select>' + ingOpts + '</select>' +
        '<input type="number" step="0.01" min="0.01" value="' + (rec.length === 1 ? rec[0].qty : 1) + '">' +
        '<span style="color:var(--ink-3);font-size:var(--fs-sm)">' + UI.esc(it.unit || 'шт') + '</span>' +
      '</div>';
    }).join('');
    var body = '<p class="hint" style="margin-bottom:8px">Для позицій без рецепта витрати складу не відстежуються.</p><div id="recRows">' + rows + '</div>';
    var m = UI.modal('Рецепти позицій', body, {
      lg: true,
      footer: '<button class="btn btn--ghost" data-act="no">Скасувати</button><button class="btn btn--accent" data-act="yes">Зберегти всі</button>',
    });
    m.el.querySelector('[data-act="no"]').addEventListener('click', m.close);
    m.el.querySelector('[data-act="yes"]').addEventListener('click', function () {
      var tasks = [];
      m.el.querySelectorAll('.recipe-row').forEach(function (row) {
        var item_id = Number(row.dataset.item);
        var ing = Number(row.querySelector('select').value);
        var qty = parseFloat(row.querySelector('input').value) || 0;
        tasks.push(API.post('api/stock.php', { action: 'save_recipe', item_id: item_id, recipe: ing && qty > 0 ? [{ ingredient_id: ing, qty: qty }] : [] }));
      });
      Promise.all(tasks).then(function () { m.close(); UI.toast('Рецепти збережено', 'ok'); return load(); }).catch(function (e) { UI.toast(e.message, 'err'); });
    });
  }

  function onClick(e) {
    var t = e.target.closest('[data-open], [data-edit], [data-del], [data-stockin]');
    if (!t || !el.contains(t)) return;
    if (t.dataset.open === 'recipe') { recipeForm(); return; }
    if (t.dataset.open === 'ing') { ingForm(0); return; }
    if (t.dataset.edit !== undefined) { ingForm(Number(t.dataset.edit)); return; }
    if (t.dataset.stockin !== undefined) { stockIn(Number(t.dataset.stockin)); return; }
    if (t.dataset.del !== undefined) {
      var id = Number(t.dataset.del);
      UI.confirmBox('Видалити інгредієнт?', 'Інгредієнт буде видалено безповоротно.', function () {
        API.post('api/stock.php', { action: 'delete_ingredient', id: id }).then(function () { return load(); }).catch(function (err) { UI.toast(err.message, 'err'); });
      });
    }
  }

  window.CRMModules = window.CRMModules || [];
  window.CRMModules.push({
    id: 'stock',
    title: 'Склад',
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
