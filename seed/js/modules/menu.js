/* Модуль: Меню и прайс */
(function () {
  'use strict';

  var state = { cats: [], items: [], selCat: 0, canEdit: false, ingredients: [], recipes: [], mt: [] };

  function load() {
    return API.get('api/menu.php').then(function (d) {
      state.cats = d.categories;
      state.items = d.items;
      state.ingredients = d.ingredients || [];
      state.recipes = d.recipes || [];
      state.mt = d.menu_toppings || [];
      return d;
    });
  }

  function catEmoji(id) {
    var n = '';
    for (var i = 0; i < state.cats.length; i++) if (state.cats[i].id === id) n = state.cats[i].name || '';
    n = n.toLowerCase();
    if (n.indexOf('напо') !== -1 || n.indexOf('напит') !== -1 || n.indexOf('drink') !== -1) return '&#129380;';
    if (n.indexOf('десер') !== -1 || n.indexOf('dessert') !== -1) return '&#127856;';
    return '&#127829;';
  }

  function render(el) {
    state.canEdit = ['admin', 'cashier'].indexOf(API.state.user.role) !== -1;
    el.innerHTML = '';
    var head = document.createElement('div');
    head.className = 'page-head';
    head.innerHTML = '<div><h1>Меню і прайс</h1><p class="hint">Позиції, ціни та категорії. Ціни з цього списку використовуються в замовленнях.</p></div>' +
      (state.canEdit
        ? '<div style="display:flex;gap:10px"><button class="btn btn--ghost" style="flex:1;white-space:nowrap" data-act="new-cat">Нова категорія</button>' +
          '<button class="btn" style="flex:1;white-space:nowrap" data-act="new-item">Нова позиція</button></div>'
        : '');
    el.appendChild(head);

    var cats = document.createElement('div');
    cats.className = 'pos__cats';
    cats.innerHTML = '<button class="pos__cat is-active" data-cat="0">Усі</button>';
    el.appendChild(cats);

    var grid = document.createElement('div');
    grid.className = 'menu-grid';
    el.appendChild(grid);

    el.addEventListener('click', onClick);
    refresh();
  }

  function refresh() {
    var catsEl = el.querySelector('.pos__cats');
    catsEl.innerHTML = '<button class="pos__cat' + (state.selCat === 0 ? ' is-active' : '') + '" data-cat="0">Усі</button>' +
      state.cats.map(function (c) {
        return '<button class="pos__cat' + (state.selCat === c.id ? ' is-active' : '') + '" data-cat="' + c.id + '">' +
          UI.esc(c.name) + ' <span style="opacity:.6">(' + c.items_cnt + ')</span></button>';
      }).join('');

    var list = state.items.filter(function (i) { return state.selCat === 0 || i.category_id === state.selCat; });
    var grid = el.querySelector('.menu-grid');
    if (!list.length) {
      grid.innerHTML = '<div class="empty" style="grid-column:1/-1">Немає позицій у цій категорії</div>';
      return;
    }
    grid.innerHTML = list.map(function (i) {
      return '<div class="menu-card' + (i.active ? '' : ' is-off') + '">' +
        '<div class="menu-card__img">' + (i.img ? '<img src="' + UI.esc(i.img) + '" alt="">' : catEmoji(i.category_id)) + '</div>' +
        '<div style="display:flex;justify-content:space-between;gap:8px"><b>' + UI.esc(i.name) + '</b>' +
          (i.active ? '' : '<span class="badge badge--gray">вимкнено</span>') + '</div>' +
        (i.descr ? '<p>' + UI.esc(i.descr) + '</p>' : '<p style="color:transparent">.</p>') +
        '<div class="menu-card__foot">' +
          '<span class="menu-card__price">' + UI.money(i.price) + '</span>' +
          (state.canEdit
            ? '<div class="row-actions"><button class="mini-btn" data-act="edit-item" data-id="' + i.id + '">Змінити</button>' +
              '<button class="mini-btn mini-btn--danger" data-act="del-item" data-id="' + i.id + '">Видалити</button></div>'
            : '<span class="badge badge--gray">' + UI.esc(i.category || '') + '</span>') +
        '</div></div>';
    }).join('');
  }

  function catModal(cat) {
    cat = cat || {};
    var body = '<div class="field"><label for="catName">Назва категорії</label><input id="catName" value="' + UI.esc(cat.name || '') + '" maxlength="40"></div>' +
      '<div class="field"><label for="catSort">Порядок (менше = раніше)</label><input id="catSort" type="number" value="' + (cat.sort || 0) + '"></div>' +
      '<label style="display:flex;gap:8px;align-items:center"><input id="catActive" type="checkbox" style="width:auto"' + (cat.active === 0 ? '' : ' checked') + '> Категорія активна</label>';
    var m = UI.modal(cat.id ? 'Змінити категорію' : 'Нова категорія', body, {
      footer: '<button class="btn btn--ghost" data-act="no">Скасувати</button><button class="btn" data-act="yes">Зберегти</button>',
    });
    m.el.querySelector('[data-act="no"]').addEventListener('click', m.close);
    m.el.querySelector('[data-act="yes"]').addEventListener('click', function () {
      API.post('api/menu.php', {
        action: 'save_category',
        id: cat.id || 0,
        name: m.el.querySelector('#catName').value,
        sort: m.el.querySelector('#catSort').value,
        active: m.el.querySelector('#catActive').checked,
      }).then(function () {
        m.close();
        UI.toast('Категорію збережено', 'ok');
        return load();
      }).then(refresh).catch(function (e) { UI.toast(e.message, 'err'); });
    });
  }

  function itemModal(item) {
    item = item || {};
    var catOpts = state.cats.map(function (c) {
      return '<option value="' + c.id + '"' + (c.id === item.category_id ? ' selected' : '') + '>' + UI.esc(c.name) + '</option>';
    }).join('');

    // Текущий состав позиции (для новой позиции — пусто)
    var curRecipe = {};
    var curMT = {};
    if (item.id) {
      state.recipes.forEach(function (r) { if (r.item_id === item.id) curRecipe[r.ingredient_id] = true; });
      state.mt.forEach(function (m) { if (m.item_id === item.id) curMT[m.ingredient_id] = true; });
    }

    var ingCheckboxes = state.ingredients.map(function (ing) {
      var inRecipe = curRecipe[ing.id];
      var base = !!ing.is_base;
      return '<label class="cust-check" style="flex:1 1 45%;min-width:0"><input type="checkbox" data-ing="' + ing.id + '"' + (inRecipe ? ' checked' : '') + (base && inRecipe ? ' disabled' : '') + '> ' +
        '<span>' + UI.esc(ing.name) + (ing.is_dough ? ' <small class="cust-extra--free">(тісто)</small>' : '') + (base ? ' <small class="cust-extra--free">(база)</small>' : '') + '</span></label>';
    }).join('') || '<div class="empty">Немає інгредієнтів. Додайте їх у «Склад».</div>';

    var tops = state.ingredients.filter(function (ing) { return Number(ing.topping_price) > 0 || curMT[ing.id]; });
    var topCheckboxes = tops.map(function (ing) {
      var checked = curMT[ing.id] ? ' checked' : '';
      var price = Number(ing.topping_price) || 0;
      return '<div class="cust-check" style="flex:1 1 45%;min-width:0;border:none;padding:2px">' +
        '<input type="checkbox" data-top="' + ing.id + '"' + checked + '>' +
        '<span class="ing-name">' + UI.esc(ing.name) + '</span>' +
        '<input type="number" class="mini-num" data-top-price="' + ing.id + '" min="0" step="0.5" value="' + price + '"' + (checked ? '' : ' disabled') + '>' +
      '</div>';
    }).join('') || '<div class="empty">Добавок немає. Вкажіть ціну добавки у «Склад».</div>';

    var body = '<div class="field"><label for="itName">Назва позиції</label><input id="itName" value="' + UI.esc(item.name || '') + '" maxlength="80"></div>' +
      '<div class="grid grid--2">' +
        '<div class="field"><label for="itCat">Категорія</label><select id="itCat">' + catOpts + '</select></div>' +
        '<div class="field"><label for="itPrice">Ціна, грн</label><input id="itPrice" type="number" step="0.01" min="0" value="' + (item.price || 0) + '"></div>' +
      '</div>' +
      '<div class="field"><label for="itUnit">Одиниця</label><input id="itUnit" value="' + UI.esc(item.unit || 'шт') + '" maxlength="10"></div>' +
      '<div class="field"><label for="itDescr">Опис</label><textarea id="itDescr" rows="2" maxlength="300">' + UI.esc(item.descr || '') + '</textarea></div>' +
      '<div class="field"><label>Фото (показується на вітрині)</label>' +
        '<div style="display:flex;gap:12px;align-items:center">' +
          '<div id="imgPrev" style="width:76px;height:76px;flex:0 0 76px;border-radius:10px;overflow:hidden;background:var(--bg-soft);border:1px dashed var(--line-strong);display:flex;align-items:center;justify-content:center;font-size:30px">' +
            (item.img ? '<img src="' + UI.esc(item.img) + '" alt="" style="width:100%;height:100%;object-fit:cover;display:block">' : '&#127829;') +
          '</div>' +
          '<div style="display:flex;flex-direction:column;gap:6px">' +
            '<button class="btn btn--ghost" type="button" data-act="upload-img" style="padding:6px 12px;font-size:var(--fs-sm)">Завантажити фото</button>' +
            '<button class="btn btn--ghost" type="button" data-act="clear-img" style="padding:6px 12px;font-size:var(--fs-sm)">Прибрати</button>' +
            '<input type="file" id="imgFile" accept="image/png,image/jpeg,image/webp,image/gif" hidden>' +
          '</div>' +
        '</div></div>' +
      '<label style="display:flex;gap:8px;align-items:center"><input id="itActive" type="checkbox" style="width:auto"' + (item.active === 0 ? '' : ' checked') + '> Позиція активна</label>' +
      '<div class="compose">' +
        '<h3 style="margin-bottom:8px">Інгредієнти <small style="color:var(--ink-3);font-weight:400">можна прибрати з позиції (безкоштовно)</small></h3>' +
        '<div class="compose__grid">' + ingCheckboxes + '</div>' +
        '<h3 style="margin:14px 0 8px">Добавки <small style="color:var(--ink-3);font-weight:400">доступні за доплату</small></h3>' +
        '<div class="compose__grid">' + topCheckboxes + '</div>' +
      '</div>';
    var m = UI.modal(item.id ? 'Змінити позицію' : 'Нова позиція', body, {
      lg: true,
      footer: '<button class="btn btn--ghost" data-act="no">Скасувати</button><button class="btn" data-act="yes">Зберегти</button>',
    });
    // Фото
    var imgVal = item.img || '';
    var imgPrev = m.el.querySelector('#imgPrev');
    var imgFile = m.el.querySelector('#imgFile');
    m.el.querySelector('[data-act="upload-img"]').addEventListener('click', function () { imgFile.click(); });
    m.el.querySelector('[data-act="clear-img"]').addEventListener('click', function () {
      imgVal = '';
      imgPrev.innerHTML = '&#127829;';
    });
    imgFile.addEventListener('change', function () {
      var f = imgFile.files && imgFile.files[0];
      if (!f) return;
      if (f.size > 4 * 1024 * 1024) { UI.toast('Фото більше 4 МБ', 'err'); imgFile.value = ''; return; }
      var fr = new FileReader();
      fr.onload = function () {
        API.post('api/menu.php', { action: 'upload_image', data: fr.result }).then(function (d) {
          imgVal = d.img || '';
          imgPrev.innerHTML = '<img src="' + UI.esc(imgVal) + '" alt="" style="width:100%;height:100%;object-fit:cover;display:block">';
          UI.toast('Фото завантажено', 'ok');
        }).catch(function (e) { UI.toast(e.message, 'err'); });
      };
      fr.readAsDataURL(f);
    });
    // Привязка цены добавки к чекбоксу
    m.el.querySelectorAll('[data-top]').forEach(function (cb) {
      cb.addEventListener('change', function () {
        var num = m.el.querySelector('[data-top-price="' + cb.dataset.top + '"]');
        if (num) num.disabled = !cb.checked;
      });
    });
    m.el.querySelector('[data-act="no"]').addEventListener('click', m.close);
    m.el.querySelector('[data-act="yes"]').addEventListener('click', function () {
      var recipe = [];
      m.el.querySelectorAll('[data-ing]').forEach(function (cb) { if (cb.checked) recipe.push(Number(cb.dataset.ing)); });
      var added = [];
      var prices = {};
      m.el.querySelectorAll('[data-top]').forEach(function (cb) {
        if (!cb.checked) return;
        var id = Number(cb.dataset.top);
        added.push(id);
        var num = m.el.querySelector('[data-top-price="' + id + '"]');
        prices[id] = num ? Number(num.value) : 0;
      });
      API.post('api/menu.php', {
        action: 'save_item',
        id: item.id || 0,
        name: m.el.querySelector('#itName').value,
        category_id: m.el.querySelector('#itCat').value,
        price: m.el.querySelector('#itPrice').value,
        unit: m.el.querySelector('#itUnit').value,
        descr: m.el.querySelector('#itDescr').value,
        img: imgVal,
        active: m.el.querySelector('#itActive').checked,
      }).then(function (d) {
        if (!d.id) throw new Error('Не вдалося зберегти позицію');
        return API.post('api/menu.php', { action: 'save_compose', item_id: d.id, recipe: recipe, added: added, prices: prices });
      }).then(function () {
        m.close();
        UI.toast('Позицію збережено', 'ok');
        return load();
      }).then(refresh).catch(function (e) { UI.toast(e.message, 'err'); });
    });
  }

  function onClick(e) {
    var t = e.target.closest('[data-act], [data-cat]');
    if (!t || !el.contains(t)) return;
    if (t.dataset.cat) {
      state.selCat = Number(t.dataset.cat);
      refresh();
      return;
    }
    var act = t.dataset.act;
    var id = Number(t.dataset.id || 0);
    if (act === 'new-cat') catModal();
    else if (act === 'new-item') itemModal();
    else if (act === 'edit-item') {
      var it = state.items.filter(function (x) { return x.id === id; })[0];
      if (it) itemModal(it);
    } else if (act === 'del-item') {
      UI.confirmBox('Видалити позицію?', 'Позицію буде видалено з меню, рецепти очищено. Замовлення в історії збережуться.', function () {
        API.post('api/menu.php', { action: 'delete_item', id: id }).then(function () {
          UI.toast('Позицію видалено', 'ok');
          return load();
        }).then(refresh).catch(function (e) { UI.toast(e.message, 'err'); });
      });
    }
  }

  var el = null;
  window.CRMModules = window.CRMModules || [];
  window.CRMModules.push({
    id: 'menu',
    title: 'Меню і прайс',
    group: 'manage',
    roles: ['admin', 'cashier', 'cook', 'manager', 'owner'],
    render: function (root) {
      el = root;
      root.innerHTML = '<div class="center-box"><div class="spinner"></div></div>';
      load().then(function () { render(el); }).catch(function (e) {
        root.innerHTML = '<div class="empty">' + UI.esc(e.message) + '</div>';
      });
    },
    _load: load,
  });
})();
