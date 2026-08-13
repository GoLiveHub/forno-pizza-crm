/* Витрина: меню, кошик, оформлення, статус замовлення + чат. */
(function () {
  'use strict';

  var API_BASE = '../api/order_in.php';
  var SITE_KEY = 'change-me-site-key';

  var DEMO = false;
  var DEMO_MENU = {
    categories: [{ id: 1, name: 'Пицца' }, { id: 2, name: 'Напитки' }, { id: 3, name: 'Десерты' }],
    items: [
      { id: 1, category_id: 1, name: 'Маргарита', descr: 'томатный соус, моцарелла, базилик', price: 650, price40: 975 },
      { id: 2, category_id: 1, name: 'Диавола', descr: 'томатный соус, моцарелла, острая салями', price: 705, price40: 1060 },
      { id: 3, category_id: 1, name: 'Прошутто', descr: 'сливки, моцарелла, прошутто, руккола', price: 735, price40: 1100 },
      { id: 4, category_id: 1, name: 'Кватро Формаджі', descr: 'моцарелла, горгонзола, пармезан, фета', price: 705, price40: 1060 },
      { id: 5, category_id: 1, name: 'Кальцоне', descr: 'томатный соус, моцарелла, ветчина, грибы', price: 650, price40: 975 },
      { id: 6, category_id: 1, name: 'Трюфель', descr: 'трюфельный крем, моцарелла, грибы', price: 760, price40: 1140 },
      { id: 7, category_id: 2, name: 'Лимонад', descr: 'домашний лимонад с мятой', price: 135, price40: 0 },
      { id: 8, category_id: 2, name: 'Апельсиновий фреш', descr: 'свежевыжатый апельсиновый сок', price: 135, price40: 0 },
      { id: 9, category_id: 3, name: 'Тирамису', descr: 'классический итальянский десерт, порция', price: 155, price40: 0 }
    ],
    stops: [],
    dough: [{ code: 'thin', name: 'Тонкое' }, { code: 'fluffy', name: 'Пышное' }],
    toppings: [
      { item_id: 1, ingredient_id: 101, ingredient_name: 'Грибы', topping_price: 40 },
      { item_id: 1, ingredient_id: 102, ingredient_name: 'Ветчина', topping_price: 50 },
      { item_id: 2, ingredient_id: 101, ingredient_name: 'Грибы', topping_price: 40 },
      { item_id: 2, ingredient_id: 103, ingredient_name: 'Пепперони', topping_price: 50 },
      { item_id: 3, ingredient_id: 102, ingredient_name: 'Ветчина', topping_price: 50 },
      { item_id: 3, ingredient_id: 104, ingredient_name: 'Оливки', topping_price: 35 },
      { item_id: 4, ingredient_id: 105, ingredient_name: 'Горгонзола', topping_price: 60 },
      { item_id: 4, ingredient_id: 104, ingredient_name: 'Оливки', topping_price: 35 },
      { item_id: 5, ingredient_id: 102, ingredient_name: 'Ветчина', topping_price: 50 },
      { item_id: 5, ingredient_id: 101, ingredient_name: 'Грибы', topping_price: 40 },
      { item_id: 6, ingredient_id: 101, ingredient_name: 'Грибы', topping_price: 40 },
      { item_id: 6, ingredient_id: 105, ingredient_name: 'Горгонзола', topping_price: 60 }
    ],
    recipe: [
      { item_id: 1, ingredient_id: 11, ingredient_name: 'Томатный соус', is_dough: 0, is_base: 1 },
      { item_id: 1, ingredient_id: 12, ingredient_name: 'Моцарелла', is_dough: 0, is_base: 0 },
      { item_id: 1, ingredient_id: 13, ingredient_name: 'Базилик', is_dough: 0, is_base: 0 },
      { item_id: 2, ingredient_id: 11, ingredient_name: 'Томатный соус', is_dough: 0, is_base: 1 },
      { item_id: 2, ingredient_id: 12, ingredient_name: 'Моцарелла', is_dough: 0, is_base: 0 },
      { item_id: 2, ingredient_id: 14, ingredient_name: 'Острая салями', is_dough: 0, is_base: 0 },
      { item_id: 3, ingredient_id: 15, ingredient_name: 'Сливочный соус', is_dough: 0, is_base: 1 },
      { item_id: 3, ingredient_id: 12, ingredient_name: 'Моцарелла', is_dough: 0, is_base: 0 },
      { item_id: 3, ingredient_id: 16, ingredient_name: 'Прошутто', is_dough: 0, is_base: 0 },
      { item_id: 3, ingredient_id: 17, ingredient_name: 'Руккола', is_dough: 0, is_base: 0 },
      { item_id: 4, ingredient_id: 18, ingredient_name: 'Моцарелла', is_dough: 0, is_base: 1 },
      { item_id: 4, ingredient_id: 105, ingredient_name: 'Горгонзола', is_dough: 0, is_base: 0 },
      { item_id: 4, ingredient_id: 19, ingredient_name: 'Пармезан', is_dough: 0, is_base: 0 },
      { item_id: 4, ingredient_id: 20, ingredient_name: 'Фета', is_dough: 0, is_base: 0 },
      { item_id: 5, ingredient_id: 11, ingredient_name: 'Томатный соус', is_dough: 0, is_base: 1 },
      { item_id: 5, ingredient_id: 12, ingredient_name: 'Моцарелла', is_dough: 0, is_base: 0 },
      { item_id: 5, ingredient_id: 102, ingredient_name: 'Ветчина', is_dough: 0, is_base: 0 },
      { item_id: 5, ingredient_id: 101, ingredient_name: 'Грибы', is_dough: 0, is_base: 0 },
      { item_id: 6, ingredient_id: 21, ingredient_name: 'Трюфельный крем', is_dough: 0, is_base: 1 },
      { item_id: 6, ingredient_id: 12, ingredient_name: 'Моцарелла', is_dough: 0, is_base: 0 },
      { item_id: 6, ingredient_id: 101, ingredient_name: 'Грибы', is_dough: 0, is_base: 0 }
    ]
  };

  var state = {
    cats: [],
    items: [],
    stops: [],
    dough: [],
    toppings: [],
    recipe: [],
    selCat: 0,
    cart: [], // {item_id, key, name, price, qty, options}
    promoApplied: null,
    order: null,
    pollTimer: null,
  };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function sell(n) {
    var v = Number(n || 0);
    if (!isFinite(v)) return 0;
    if (Math.round(v) === v) return v;
    var r = Math.ceil(v);
    var t = Math.ceil((r + 1) / 10) * 10 - 1;
    return t >= r ? t : r;
  }

  function money(n) {
    return sell(n).toLocaleString(window.I18N ? I18N.locale() : 'uk-UA') + ' грн';
  }

  var STATUS = {
    new: { label: 'Прийнято', cls: 'badge--blue' },
    cooking: { label: 'Готуємо', cls: 'badge--gold' },
    delivering: { label: 'У дорозі', cls: 'badge--amber' },
    done: { label: 'Доставлено', cls: 'badge--green' },
    cancelled: { label: 'Скасовано', cls: 'badge--red' },
  };

  function api(method, path, data) {
    var opts = { method: method, headers: { 'Accept': 'application/json', 'X-Site-Key': SITE_KEY } };
    if (data !== undefined) {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(data);
    }
    return fetch(path, opts).then(function (r) {
      return r.json().then(function (d) {
        if (!r.ok) throw new Error(d.error || 'Помилка сервера');
        return d;
      });
    });
  }

  /* --- Меню --- */
  function loadMenu() {
    return api('GET', API_BASE + '?menu=1').then(function (d) {
      if (!d || !d.items || !d.items.length) throw new Error('empty');
      return d;
    }).catch(function () {
      DEMO = true;
      return DEMO_MENU;
    });
  }

  function renderCats() {
    var el = document.getElementById('cats');
    el.innerHTML = '<button type="button" class="' + (state.selCat === 0 ? 'is-active' : '') + '" data-cat="0">Усі</button>' +
      state.cats.map(function (c) {
        return '<button type="button" class="' + (state.selCat === c.id ? 'is-active' : '') + '" data-cat="' + c.id + '">' + esc(c.name) + '</button>';
      }).join('');
    el.onclick = function (e) {
      var b = e.target.closest('[data-cat]');
      if (!b) return;
      state.selCat = Number(b.dataset.cat);
      renderCats();
      renderGrid();
    };
  }

  function catEmoji(id) {
    var n = '';
    for (var i = 0; i < state.cats.length; i++) if (state.cats[i].id === id) n = state.cats[i].name || '';
    n = n.toLowerCase();
    if (n.indexOf('напо') !== -1 || n.indexOf('напит') !== -1 || n.indexOf('drink') !== -1) return '&#129380;';
    if (n.indexOf('десер') !== -1 || n.indexOf('dessert') !== -1) return '&#127856;';
    return '&#127829;';
  }

  function renderGrid() {
    var list = state.items.filter(function (i) { return state.selCat === 0 || i.category_id === state.selCat; });
    var grid = document.getElementById('grid');
    var empty = document.getElementById('gridEmpty');
    empty.hidden = list.length > 0;
    grid.innerHTML = list.map(function (i) {
      var off = state.stops.indexOf(i.id) !== -1;
      return '<div class="card-item' + (off ? ' is-off' : '') + '">' +
        (i.img
          ? '<div class="card-item__img"><img src="../' + esc(i.img) + '" alt=""></div>'
          : '<div class="card-item__img">' + catEmoji(i.category_id) + '</div>') +
        '<b>' + esc(i.name) + '</b>' +
        (i.descr ? '<p>' + esc(i.descr) + '</p>' : '') +
        (i.price40 > 0 ? '<p style="color:var(--accent,#E63946);font-size:13px">30 см — ' + money(i.price) + ' · 40 см — ' + money(i.price40) + '</p>' : '') +
        '<div class="card-item__foot">' +
          '<span class="card-item__price">' + money(i.price) + '</span>' +
          (off
            ? '<span class="off-mark">немає в наявності</span>'
            : '<button class="card-item__add" data-add="' + i.id + '" type="button">Додати</button>') +
        '</div></div>';
    }).join('');
    grid.onclick = function (e) {
      var b = e.target.closest('[data-add]');
      if (!b) return;
      var it = state.items.filter(function (x) { return x.id === Number(b.dataset.add); })[0];
      if (it && isPizza(it)) { openCustomize(it); return; }
      addToCart(Number(b.dataset.add));
    };
  }

  /* --- Кошик --- */
  function cartSum() {
    return state.cart.reduce(function (s, l) { return s + l.price * l.qty; }, 0);
  }

  function cartQty() {
    return state.cart.reduce(function (s, l) { return s + l.qty; }, 0);
  }

  function addToCart(id, opts) {
    var it = state.items.filter(function (x) { return x.id === id; })[0];
    if (!it) return;
    var options = opts || { size: 30, dough: 'thin', removed: [], added: [] };
    var price = opts ? linePrice(it, opts) : it.price;
    var name = opts ? lineName(it, opts) : it.name;
    var key = id + ':' + JSON.stringify(options);
    var line = state.cart.filter(function (l) { return l.key === key; })[0];
    if (line) line.qty++;
    else state.cart.push({ item_id: it.id, key: key, name: name, price: price, qty: 1, options: options });
    state.promoApplied = null;
    renderDrawer();
    openDrawer();
  }

  function changeQty(key, delta) {
    var line = state.cart.filter(function (l) { return l.key === key; })[0];
    if (!line) return;
    line.qty += delta;
    if (line.qty <= 0) state.cart = state.cart.filter(function (l) { return l.key !== key; });
    state.promoApplied = null;
    renderDrawer();
  }

  /* --- Кастомизация пиццы (Этап 6) --- */
  function itemRecipe(item_id) {
    return (state.recipe || []).filter(function (r) { return r.item_id === item_id; });
  }
  function itemToppings(item_id) {
    return (state.toppings || []).filter(function (t) { return t.item_id === item_id; });
  }
  function isPizza(item) {
    return item && (item.price40 > 0 || itemRecipe(item.id).length > 0 || itemToppings(item.id).length > 0);
  }
  function linePrice(item, opts) {
    var p = opts.size === 40 && item.price40 > 0 ? item.price40 : item.price;
    (opts.added || []).forEach(function (aid) {
      var t = itemToppings(item.id).filter(function (x) { return x.ingredient_id === aid; })[0];
      if (t) p += Number(t.topping_price);
    });
    return Math.round(p * 100) / 100;
  }
  function lineName(item, opts) {
    var n = item.name;
    var parts = [];
    if (opts.size === 40) parts.push('40 см');
    if (opts.dough === 'fluffy') parts.push('пишне тісто');
    if (parts.length) n += ' (' + parts.join(', ') + ')';
    var doughIngs = itemRecipe(item.id).filter(function (r) { return r.is_dough; }).map(function (r) { return r.ingredient_id; });
    var removed = (opts.removed || []).filter(function (rid) { return doughIngs.indexOf(rid) === -1; });
    if (removed.length) {
      var rnames = removed.map(function (rid) {
        var r = itemRecipe(item.id).filter(function (x) { return x.ingredient_id === rid; })[0];
        return r ? r.ingredient_name : '';
      }).filter(Boolean);
      if (rnames.length) n += ' · без ' + rnames.join(', ');
    }
    if ((opts.added || []).length) {
      var an = opts.added.map(function (aid) {
        var t = itemToppings(item.id).filter(function (x) { return x.ingredient_id === aid; })[0];
        return t ? t.ingredient_name : '';
      }).filter(Boolean);
      if (an.length) n += ' · +' + an.join(', +');
    }
    return n;
  }

  function openCustomize(item) {
    var overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    var doughOpts = (state.dough || []).map(function (d, i) {
      return '<label class="cust-radio"><input type="radio" name="custDough" value="' + d.code + '"' + (i === 0 ? ' checked' : '') + '> ' + esc(d.name) + '</label>';
    }).join('');
    var sizeBlock = item.price40 > 0
      ? '<div class="cust-block"><b class="cust-label">Розмір</b>' +
        '<div class="cust-sizes">' +
          '<label class="cust-radio"><input type="radio" name="custSize" value="30" checked> 30 см <small>' + money(item.price) + '</small></label>' +
          '<label class="cust-radio"><input type="radio" name="custSize" value="40"> 40 см <small>' + money(item.price40) + '</small></label>' +
        '</div></div>'
      : '<input type="hidden" name="custSize" value="30">';
    var recipe = itemRecipe(item.id).filter(function (r) { return !r.is_dough; });
    var hasDough = item.price40 > 0 || itemRecipe(item.id).some(function (r) { return r.is_dough; });
    var ingBlock = recipe.length
      ? '<div class="cust-block"><b class="cust-label">Інгредієнти <small>прибрати — безкоштовно</small></b>' +
        recipe.map(function (r) {
          var base = !!r.is_base;
          return '<label class="cust-check"><input type="checkbox" value="' + r.ingredient_id + '" checked' + (base ? ' disabled' : '') + '> ' + esc(r.ingredient_name) + (base ? ' <small class="cust-extra--free">(база)</small>' : '') + '</label>';
        }).join('') + '</div>'
      : '';
    var tops = itemToppings(item.id);
    var topBlock = tops.length
      ? '<div class="cust-block"><b class="cust-label">Добавки <small>додати — доплата</small></b>' +
        tops.map(function (t) {
          return '<label class="cust-check"><input type="checkbox" value="' + t.ingredient_id + '" data-price="' + Number(t.topping_price) + '"> ' + esc(t.ingredient_name) + ' <small class="cust-extra">+' + money(t.topping_price) + '</small></label>';
        }).join('') + '</div>'
      : '';

    overlay.innerHTML =
      '<div class="modal cust-modal">' +
        '<div class="modal__head"><div class="modal__title">Кастомізація: ' + esc(item.name) + '</div>' +
        '<button class="modal__close" type="button" aria-label="Закрити">&times;</button></div>' +
        '<div class="modal__body">' +
          '<div class="cust" data-item="' + item.id + '">' +
            '<div class="cust__head"><b>' + esc(item.name) + '</b><span class="price">' + money(item.price) + '</span></div>' +
            (item.descr ? '<div class="cust__desc">' + esc(item.descr) + '</div>' : '') +
            (hasDough && doughOpts ? '<div class="cust-block"><b class="cust-label">Тісто</b><div class="cust-row">' + doughOpts + '</div></div>' : '') +
            sizeBlock + ingBlock + topBlock +
            '<div class="cust__sum"><span>Разом</span><b class="num" id="custTotal">' + money(item.price) + '</b></div>' +
          '</div>' +
        '</div>' +
        '<div class="modal__foot">' +
          '<button class="btn" data-act="no">Скасувати</button>' +
          '<button class="btn btn--accent" data-act="yes">Додати: ' + money(item.price) + '</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(overlay);
    var cust = overlay.querySelector('.cust');

    function readOpts() {
      var size = (cust.querySelector('input[name=custSize]:checked') || { value: '30' }).value;
      var dough = (cust.querySelector('input[name=custDough]:checked') || { value: 'thin' }).value;
      var removed = Array.prototype.map.call(cust.querySelectorAll('input[type=checkbox]'), function (cb) {
        var id = Number(cb.value);
        if (cb.checked || id <= 0 || cb.hasAttribute('data-price')) return null;
        return id;
      }).filter(function (v) { return v !== null; });
      var added = [];
      var topIds = {};
      itemToppings(item.id).forEach(function (t) { topIds[t.ingredient_id] = true; });
      Array.prototype.forEach.call(cust.querySelectorAll('input[type=checkbox]'), function (cb) {
        var id = Number(cb.value);
        if (cb.checked && cb.hasAttribute('data-price') && topIds[id]) added.push(id);
      });
      return { size: Number(size), dough: dough, removed: removed, added: added };
    }
    function update() {
      var price = linePrice(item, readOpts());
      cust.querySelector('#custTotal').textContent = money(price);
      overlay.querySelector('[data-act="yes"]').textContent = 'Додати: ' + money(price);
    }
    cust.addEventListener('change', update);

    function close() {
      overlay.remove();
      document.removeEventListener('keydown', onKey);
    }
    function onKey(e) { if (e.key === 'Escape') close(); }
    document.addEventListener('keydown', onKey);
    overlay.querySelector('.modal__close').addEventListener('click', close);
    overlay.querySelector('[data-act="no"]').addEventListener('click', close);
    overlay.addEventListener('mousedown', function (e) { if (e.target === overlay) close(); });
    overlay.querySelector('[data-act="yes"]').addEventListener('click', function () {
      addToCart(item.id, readOpts());
      close();
    });
  }

  function openDrawer() {
    document.getElementById('drawer').classList.add('is-open');
    document.getElementById('drawerOverlay').classList.add('is-open');
  }
  function closeDrawer() {
    document.getElementById('drawer').classList.remove('is-open');
    document.getElementById('drawerOverlay').classList.remove('is-open');
  }

  function renderDrawer() {
    document.getElementById('cartCount').textContent = cartQty();
    var items = document.getElementById('drawerItems');
    if (!state.cart.length) {
      items.innerHTML = '<div class="empty">Кошик порожній</div>';
    } else {
      items.innerHTML = state.cart.map(function (l) {
        var sub = l.options && (l.options.size !== 30 || (l.options.removed || []).length || (l.options.added || []).length || l.options.dough !== 'thin')
          ? '<small style="color:var(--accent,#E63946)">' + esc(custShort(l.options)) + '</small>' : '';
        return '<div class="drawer__line">' +
          '<span>' + esc(l.name) + (sub ? '<br>' + sub : '') + '<br><small style="color:var(--ink-3)">' + money(l.price) + ' x' + l.qty + '</small></span>' +
          '<div class="qty">' +
            '<button class="qty__btn" data-dec="' + esc(l.key) + '" type="button">-</button><b>' + l.qty + '</b>' +
            '<button class="qty__btn" data-inc="' + esc(l.key) + '" type="button">+</button>' +
          '</div>' +
          '<div style="display:flex;align-items:center;gap:8px"><b class="num">' + money(l.price * l.qty) + '</b>' +
            '<button class="del" data-del="' + esc(l.key) + '" type="button">&times;</button></div>' +
        '</div>';
      }).join('');
    }
    items.onclick = function (e) {
      var b = e.target.closest('[data-inc],[data-dec],[data-del]');
      if (!b) return;
      if (b.dataset.inc !== undefined) changeQty(b.dataset.inc, 1);
      if (b.dataset.dec !== undefined) changeQty(b.dataset.dec, -1);
      if (b.dataset.del !== undefined) { state.cart = state.cart.filter(function (l) { return l.key !== b.dataset.del; }); state.promoApplied = null; renderDrawer(); }
    };
    updateTotal();
  }

  function custShort(opts) {
    var parts = [];
    if (opts.size === 40) parts.push('40 см');
    if (opts.dough === 'fluffy') parts.push('пишне тісто');
    if ((opts.removed || []).length) parts.push('без ' + (opts.removed || []).length);
    if ((opts.added || []).length) parts.push('+' + (opts.added || []).length);
    return parts.join(', ') || '';
  }

  function updateTotal() {
    var disc = state.promoApplied ? state.promoApplied.discount : 0;
    var sum = cartSum();
    document.getElementById('drawerSum').innerHTML =
      '<div class="row"><span>Підсумок</span><span>' + money(sum) + '</span></div>' +
      (disc ? '<div class="row" style="color:var(--green)"><span>Знижка ' + esc(state.promoApplied.code) + '</span><span>-' + money(disc) + '</span></div>' : '') +
      '<div class="row total"><span>До сплати</span><span>' + money(sum - disc) + '</span></div>';
    document.getElementById('coTotal').textContent = money(sum - disc);
  }

  /* --- Оформлення --- */
  function checkout(ev) {
    ev.preventDefault();
    var err = document.getElementById('coErr');
    err.textContent = '';
    if (!state.cart.length) { err.textContent = 'Кошик порожній'; return; }
    if (DEMO) { err.textContent = 'Демо-режим: на этой странице заказы не принимаются. Это статическая демонстрация меню.'; return; }

    var mode = document.querySelector('.mode-toggle button.is-active').dataset.mode;
    var payload = {
      action: 'create',
      consent: true,
      items: state.cart.map(function (l) { return { item_id: l.item_id, qty: l.qty, options: l.options }; }),
      phone: document.getElementById('coPhone').value,
      name: document.getElementById('coName').value,
      delivery_type: mode,
      payment: document.getElementById('coPay').value,
      promo_code: document.getElementById('coPromo').value,
      comment: document.getElementById('coComment').value,
    };
    if (mode === 'courier') {
      payload.street = document.getElementById('coStreet').value;
      payload.house = document.getElementById('coHouse').value;
      payload.apartment = document.getElementById('coFlat').value;
      payload.entrance = document.getElementById('coEntrance').value;
    }

    var btn = document.getElementById('coSubmit');
    btn.disabled = true;
    api('POST', API_BASE, payload).then(function (d) {
      closeDrawer();
      state.cart = [];
      state.promoApplied = null;
      renderDrawer();
      showSuccess(d);
      checkOrder(d.num, document.getElementById('coPhone').value);
      document.getElementById('stNum').value = d.num;
      document.getElementById('stPhone').value = document.getElementById('coPhone').value;
    }).catch(function (e) {
      err.textContent = e.message;
      btn.disabled = false;
    });
  }

  function showSuccess(o) {
    document.getElementById('coErr').textContent = '';
    var card = document.getElementById('orderCard');
    card.hidden = false;
    document.getElementById('orderEmpty').hidden = true;
    card.innerHTML = '<div style="text-align:center;padding:16px 0 8px">' +
      '<div style="font-family:var(--font-serif);font-style:italic;color:var(--green);font-size:20px">Замовлення прийнято!</div>' +
      '<div style="font-family:var(--font-mono);font-size:36px;font-weight:700;margin:8px 0">' + esc(o.num) + '</div>' +
      '<div>До сплати: <b>' + money(o.total) + '</b></div>' +
      (o.discount ? '<div style="color:var(--green);font-size:13px">Знижка: ' + money(o.discount) + '</div>' : '') +
      '</div>';
    document.getElementById('order').scrollIntoView({ behavior: 'smooth' });
  }

  /* --- Статус замовлення + чат --- */
  function checkOrder(num, phone, silent) {
    var card = document.getElementById('orderCard');
    var empty = document.getElementById('orderEmpty');
    return api('GET', API_BASE + '?num=' + encodeURIComponent(num) + '&phone=' + encodeURIComponent(phone)).then(function (d) {
      if (DEMO) return;
      if (!d.found) {
        empty.hidden = false;
        empty.textContent = silent ? '' : 'Замовлення не знайдено. Перевірте номер і телефон.';
        card.hidden = true;
        return;
      }
      empty.hidden = true;
      card.hidden = false;
      var o = d.order;
      var st = STATUS[o.status] || { label: o.status, cls: 'badge--gray' };
      var items = d.items.map(function (l) {
        return '<div class="l"><span>' + l.qty + 'x ' + esc(l.name) + '</span><span class="num">' + money(l.total) + '</span></div>';
      }).join('');
      var msgs = (d.messages || []).map(function (m) {
        var isOp = m.author === 'operator';
        return '<div class="chat__msg ' + (isOp ? 'chat__msg--out' : 'chat__msg--in') + '">' + esc(m.text) +
          '<div class="chat__meta">' + (isOp ? 'Оператор' : 'Ви') + ' · ' + esc(m.created_at).replace('T', ' ') + '</div></div>';
      }).join('');

      card.innerHTML =
        '<div class="order-card__head">' +
          '<span class="order-card__num">' + esc(o.num) + '</span>' +
          '<span class="badge ' + st.cls + '">' + st.label + '</span>' +
          '<span class="badge badge--gray">' + (o.delivery_type === 'pickup' ? 'Самовивіз' : 'Доставка') + '</span>' +
        '</div>' +
        '<div class="order-card__body">' +
          '<div class="order-card__items">' + items + '</div>' +
          '<div class="order-card__info">' +
            (o.address ? '<span>' + esc(o.address) + '</span>' : '') +
            '<span>Оплата: ' + esc(o.payment === 'cash' ? 'готівка' : o.payment === 'card_at_door' ? 'картка при видачі' : 'онлайн') + '</span>' +
            (o.comment ? '<span style="color:var(--ink-3)">' + esc(o.comment) + '</span>' : '') +
            '<span style="border-top:1px dashed var(--line);padding-top:6px">Підсумок: <b>' + money(o.subtotal) + '</b>' +
            (o.discount ? '<br>Знижка: <b style="color:var(--green)">-' + money(o.discount) + '</b>' : '') +
            '<br>Всього: <b style="color:var(--accent)">' + money(o.total) + '</b></span>' +
          '</div>' +
        '</div>' +
        '<div class="chat">' +
          '<b>Чат з оператором</b>' +
          '<div class="chat__msgs">' + (msgs || '<div style="color:var(--ink-3);font-size:13px">Повідомлень немає. Напишіть нам!</div>') + '</div>' +
          '<form class="chat__send"><input id="chatText" placeholder="Ваше повідомлення..." maxlength="500">' +
          '<button class="btn" type="submit">Надіслати</button></form>' +
        '</div>';

      card.querySelector('.chat__send').onsubmit = function (ev) {
        ev.preventDefault();
        var text = card.querySelector('#chatText').value.trim();
        if (!text) return;
        api('POST', API_BASE, { action: 'chat_send', num: num, phone: phone, text: text }).then(function () {
          card.querySelector('#chatText').value = '';
          return checkOrder(num, phone, true);
        }).catch(function (e) { card.querySelector('#chatText').placeholder = e.message; });
      };

      var c = card.querySelector('.chat__msgs');
      if (c) c.scrollTop = c.scrollHeight;
    });
  }

  /* --- ініціалізація --- */
  function init() {
    document.getElementById('cartBtn').onclick = openDrawer;
    document.getElementById('drawerClose').onclick = closeDrawer;
    document.getElementById('drawerOverlay').onclick = closeDrawer;

    document.getElementById('modeToggle').onclick = function (e) {
      var b = e.target.closest('[data-mode]');
      if (!b) return;
      document.querySelectorAll('#modeToggle button').forEach(function (x) { x.classList.remove('is-active'); });
      b.classList.add('is-active');
      document.getElementById('addrBlock').style.display = b.dataset.mode === 'courier' ? '' : 'none';
    };

    document.getElementById('coPromo').onchange = function () {
      var code = this.value.trim();
      var err = document.getElementById('coErr');
      if (!code || !state.cart.length) return;
      if (DEMO) { state.promoApplied = null; err.textContent = 'Демо-режим: промокоды недоступны.'; updateTotal(); return; }
      api('POST', API_BASE, { action: 'check_promo', code: code, items: state.cart.map(function (l) { return { item_id: l.item_id, qty: l.qty, options: l.options }; }) })
        .then(function (d) { state.promoApplied = { code: code, discount: d.discount }; err.textContent = 'Знижку застосовано: -' + money(d.discount); updateTotal(); })
        .catch(function (e) { state.promoApplied = null; err.textContent = e.message; updateTotal(); });
    };

    document.getElementById('checkoutForm').onsubmit = checkout;
    document.getElementById('statusForm').onsubmit = function (ev) {
      ev.preventDefault();
      stopPolling();
      var num = document.getElementById('stNum').value;
      var phone = document.getElementById('stPhone').value;
      checkOrder(num, phone).then(function () { startPolling(num, phone); });
    };

    loadMenu().then(function (d) {
      state.cats = d.categories;
      state.items = d.items;
      state.stops = d.stops || [];
      state.dough = d.dough || [];
      state.toppings = d.toppings || [];
      state.recipe = d.recipe || [];
      renderCats();
      renderGrid();
      renderDrawer();
      if (DEMO) showDemoBanner();
    }).catch(function () {
      document.getElementById('grid').innerHTML = '<div class="empty">Не вдалося завантажити меню</div>';
    });
  }

  function showDemoBanner() {
    var b = document.createElement('div');
    b.className = 'demo-banner';
    b.textContent = 'Демо-режим: меню статическое, заказы на этой странице не принимаются. Полная версия работает локально с PHP.';
    document.body.prepend(b);
  }

  function startPolling(num, phone) {
    stopPolling();
    state.pollTimer = setInterval(function () { checkOrder(num, phone, true); }, 15000);
  }
  function stopPolling() {
    if (state.pollTimer) { clearInterval(state.pollTimer); state.pollTimer = null; }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
