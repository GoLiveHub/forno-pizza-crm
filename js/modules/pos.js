/* Модуль: Каса (POS) */
(function () {
  'use strict';

  var el = null;
  var state = {
    cats: [],
    items: [],
    stops: [],
    dough: [],
    toppings: [],
    recipe: [],
    couriers: [],
    selCat: 0,
    cart: [], // {item_id, key, name, price, qty, options}
    promo: '',
    promoApplied: null, // {code, discount}
    client: null, // найденный клиент
    created: null, // последний созданный заказ
  };
  var cartSeq = 0; // уникальный ключ для позиций с кастомизацией

  var REQ = { courier: 'Доставка кур\'єром', pickup: 'Самовивіз' };

  function load() {
    return API.get('api/pos.php').then(function (d) {
      state.cats = d.categories;
      state.items = d.items;
      state.stops = d.stops || [];
      state.dough = d.dough || [];
      state.toppings = d.toppings || [];
      state.recipe = d.recipe || [];
      state.couriers = d.couriers || [];
      return d;
    });
  }

  function cartSum() {
    return state.cart.reduce(function (s, l) { return s + l.price * l.qty; }, 0);
  }

  function cartQty() {
    return state.cart.reduce(function (s, l) { return s + l.qty; }, 0);
  }

  function lineKey(item_id, opts) {
    return item_id + ':' + JSON.stringify(opts || {});
  }

  function addToCart(item_id, opts) {
    var it = state.items.filter(function (x) { return x.id === item_id; })[0];
    if (!it || state.stops.indexOf(item_id) !== -1) return;
    var options = opts || { size: 30, dough: 'thin', removed: [], added: [] };
    var price = opts ? linePrice(it, opts) : it.price;
    var name = opts ? lineName(it, opts) : it.name;
    var key = lineKey(item_id, options);
    var line = state.cart.filter(function (l) { return l.key === key; })[0];
    if (line) {
      if (line.qty >= 99) return;
      line.qty++;
    } else {
      state.cart.push({ item_id: it.id, key: key, name: name, price: price, qty: 1, options: options });
    }
    state.promoApplied = null;
    renderCart();
  }

  function changeQty(key, delta) {
    var line = state.cart.filter(function (l) { return l.key === key; })[0];
    if (!line) return;
    line.qty += delta;
    if (line.qty <= 0) {
      state.cart = state.cart.filter(function (l) { return l.key !== key; });
    }
    state.promoApplied = null;
    renderCart();
  }

  /* --- Кастомизация пиццы (Этап 6) --- */
  function itemRecipe(item_id) {
    return (state.recipe || []).filter(function (r) { return r.item_id === item_id; });
  }
  function itemToppings(item_id) {
    return (state.toppings || []).filter(function (t) { return t.item_id === item_id; });
  }
  function isCustomizable(item) {
    return item && (item.price40 > 0 || itemRecipe(item.id).length > 0 || itemToppings(item.id).length > 0);
  }
  function basePrice(item, size) {
    return size === 40 && item.price40 > 0 ? item.price40 : item.price;
  }
  function linePrice(item, opts) {
    var p = basePrice(item, opts.size || 30);
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
      var names = removed.map(function (rid) {
        var r = itemRecipe(item.id).filter(function (x) { return x.ingredient_id === rid; })[0];
        return r ? r.ingredient_name : '';
      }).filter(Boolean);
      if (names.length) n += ' · без ' + names.join(', ');
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
    var doughOpts = (state.dough || []).map(function (d, i) {
      return '<label class="cust-radio"><input type="radio" name="custDough" value="' + d.code + '"' + (i === 0 ? ' checked' : '') + '> ' + UI.esc(d.name) + '</label>';
    }).join('');
    var sizeBlock = item.price40 > 0
      ? '<div class="cust-block"><b class="cust-label">Розмір</b>' +
        '<div class="cust-sizes">' +
          '<label class="cust-radio"><input type="radio" name="custSize" value="30" checked> 30 см <small>' + UI.money(item.price) + '</small></label>' +
          '<label class="cust-radio"><input type="radio" name="custSize" value="40"> 40 см <small>' + UI.money(item.price40) + '</small></label>' +
        '</div></div>'
      : '<input type="hidden" name="custSize" value="30">';
    var recipe = itemRecipe(item.id).filter(function (r) { return !r.is_dough; });
    var hasDough = item.price40 > 0 || itemRecipe(item.id).some(function (r) { return r.is_dough; });
    var ingBlock = recipe.length
      ? '<div class="cust-block"><b class="cust-label">Інгредієнти <small>прибрати — безкоштовно</small></b>' +
        recipe.map(function (r) {
          var base = !!r.is_base;
          return '<label class="cust-check"><input type="checkbox" value="' + r.ingredient_id + '" checked' + (base ? ' disabled' : '') + '> <span>' + UI.esc(r.ingredient_name) + (base ? ' <small class="cust-extra--free">(база)</small>' : '') + '</span><small class="cust-extra cust-extra--free">—</small></label>';
        }).join('') + '</div>'
      : '';
    var tops = itemToppings(item.id);
    var topBlock = tops.length
      ? '<div class="cust-block"><b class="cust-label">Добавки <small>додати — доплата</small></b>' +
        tops.map(function (t) {
          return '<label class="cust-check"><input type="checkbox" value="' + t.ingredient_id + '" data-price="' + Number(t.topping_price) + '"> <span>' + UI.esc(t.ingredient_name) + '</span><small class="cust-extra">+' + UI.money(t.topping_price) + '</small></label>';
        }).join('') + '</div>'
      : '';

    var body =
      '<div class="cust" data-item="' + item.id + '">' +
        '<div class="cust__head"><b>' + UI.esc(item.name) + '</b><span class="price">' + UI.money(item.price) + '</span></div>' +
        (item.descr ? '<div class="cust__desc">' + UI.esc(item.descr) + '</div>' : '') +
        (hasDough && doughOpts ? '<div class="cust-block"><b class="cust-label">Тісто</b><div class="cust-row">' + doughOpts + '</div></div>' : '') +
        sizeBlock + ingBlock + topBlock +
        '<div class="cust__sum"><span>Разом</span><b class="num" id="custTotal">' + UI.money(item.price) + '</b></div>' +
      '</div>';

    var m = UI.modal('Кастомізація: ' + item.name, body, {
      footer: '<button class="btn btn--ghost" data-act="no">Скасувати</button>' +
        '<button class="btn btn--accent" data-act="yes">Додати: ' + UI.money(item.price) + '</button>',
    });
    var cust = m.el.querySelector('.cust');

    function readOpts() {
      var size = (cust.querySelector('input[name=custSize]:checked') || { value: '30' }).value;
      var dough = (cust.querySelector('input[name=custDough]:checked') || { value: 'thin' }).value;
      var removed = Array.prototype.map.call(cust.querySelectorAll('input[type=checkbox]'), function (cb) {
        return cb.checked || cb.hasAttribute('data-price') ? null : Number(cb.value);
      }).filter(function (v) { return v !== null && v > 0; });
      var added = [];
      var topIds = {};
      itemToppings(item.id).forEach(function (t) { topIds[t.ingredient_id] = true; });
      Array.prototype.forEach.call(cust.querySelectorAll('.cust-block input[type=checkbox]'), function (cb) {
        var id = Number(cb.value);
        if (cb.checked && cb.hasAttribute('data-price') && topIds[id]) added.push(id);
      });
      return { size: Number(size), dough: dough, removed: removed, added: added };
    }

    function update() {
      var opts = readOpts();
      var price = linePrice(item, opts);
      m.el.querySelector('#custTotal').textContent = UI.money(price);
      var btn = m.el.querySelector('[data-act="yes"]');
      btn.textContent = 'Додати: ' + UI.money(price);
      return opts;
    }
    cust.addEventListener('change', update);

    m.el.querySelector('[data-act="no"]').addEventListener('click', m.close);
    m.el.querySelector('[data-act="yes"]').addEventListener('click', function () {
      addToCart(item.id, readOpts());
      m.close();
    });
  }

  function render(root) {
    el = root;
    root.innerHTML = '<div class="center-box"><div class="spinner"></div></div>';
    load().then(function () {
      build();
      renderProducts();
      renderCart();
    }).catch(function (e) {
      root.innerHTML = '<div class="empty">' + UI.esc(e.message) + '</div>';
    });
  }

  function build() {
    el.innerHTML =
      '<div class="page-head"><div><h1>Каса</h1><p class="hint">Оберіть позиції та оформіть продаж</p></div></div>' +
      '<div class="pos">' +
        '<div class="pos__left">' +
          '<div class="pos__cats" id="posCats"></div>' +
          '<div class="pos__grid" id="posGrid"></div>' +
        '</div>' +
        '<aside class="cart" id="cartPanel">' +
          '<div class="cart__head"><span>Замовлення</span><span id="cartCount">0</span></div>' +
          '<div class="cart__items" id="cartItems"><div class="cart__empty">Кошик порожній</div></div>' +
          '<div class="cart__sum" id="cartSum"></div>' +
          '<div class="cart__foot">' +
            '<div class="promo-row"><input id="posPromo" placeholder="Промокод" maxlength="20"><button class="btn btn--ghost btn--sm" id="posPromoBtn" type="button">OK</button></div>' +
            '<button class="btn btn--accent btn--lg" id="posCheckout" type="button" disabled>Оформити</button>' +
          '</div>' +
        '</aside>' +
      '</div>';
    el.addEventListener('click', onClick);
    el.addEventListener('input', onInput);
    document.getElementById('posPromo').addEventListener('keydown', function (e) { if (e.key === 'Enter') applyPromo(); });
  }

  function renderProducts() {
    var catsEl = el.querySelector('#posCats');
    catsEl.innerHTML = '<button class="pos__cat' + (state.selCat === 0 ? ' is-active' : '') + '" data-cat="0">Усі</button>' +
      state.cats.map(function (c) {
        return '<button class="pos__cat' + (state.selCat === c.id ? ' is-active' : '') + '" data-cat="' + c.id + '">' + UI.esc(c.name) + '</button>';
      }).join('');

    var list = state.items.filter(function (i) { return state.selCat === 0 || i.category_id === state.selCat; });
    var grid = el.querySelector('#posGrid');
    grid.innerHTML = list.map(function (i) {
      var off = state.stops.indexOf(i.id) !== -1;
      return '<button class="pos__tile' + (off ? ' is-off' : '') + '" data-add="' + i.id + '" type="button" ' + (off ? 'disabled' : '') + '>' +
        '<b>' + UI.esc(i.name) + '</b>' +
        (off ? '<span class="off-mark">немає на складі</span>' : '') +
        '<span class="price">' + UI.money(i.price) + '</span>' +
        (i.price40 > 0 ? '<span class="price price--40">40 см: ' + UI.money(i.price40) + '</span>' : '') +
        '<span class="unit">' + UI.esc(i.unit || '') + '</span>' +
      '</button>';
    }).join('');
    if (!list.length) grid.innerHTML = '<div class="empty" style="grid-column:1/-1">Немає позицій</div>';
  }

  function renderCart() {
    var count = cartQty();
    el.querySelector('#cartCount').textContent = count;
    var itemsEl = el.querySelector('#cartItems');
    if (!state.cart.length) {
      itemsEl.innerHTML = '<div class="cart__empty">Кошик порожній</div>';
    } else {
      itemsEl.innerHTML = state.cart.map(function (l) {
        var sub = l.options && (l.options.size !== 30 || (l.options.removed || []).length || (l.options.added || []).length || l.options.dough !== 'thin')
          ? '<small style="color:var(--accent)">' + UI.esc(custShort(l.options)) + '</small>' : '';
        return '<div class="cart__line">' +
          '<span>' + UI.esc(l.name) + (sub ? '<br>' + sub : '') + '<br><small style="color:var(--ink-3)">' + UI.money(l.price) + ' x' + l.qty + '</small></span>' +
          '<div class="qty">' +
            '<button class="qty__btn" data-dec="' + UI.esc(l.key) + '" type="button">-</button>' +
            '<b>' + l.qty + '</b>' +
            '<button class="qty__btn" data-inc="' + UI.esc(l.key) + '" type="button">+</button>' +
          '</div>' +
          '<div style="display:flex;align-items:center;gap:8px">' +
            '<b class="num">' + UI.money(l.price * l.qty) + '</b>' +
            '<button class="del" data-del="' + UI.esc(l.key) + '" type="button" aria-label="Прибрати">&times;</button>' +
          '</div>' +
        '</div>';
      }).join('');
    }

    var sum = cartSum();
    var disc = state.promoApplied ? state.promoApplied.discount : 0;
    var sumEl = el.querySelector('#cartSum');
    sumEl.innerHTML =
      '<div class="row"><span>Підсумок</span><span class="num">' + UI.money(sum) + '</span></div>' +
      (disc ? '<div class="row" style="color:var(--green)"><span>Знижка ' + UI.esc(state.promoApplied.code) + '</span><span class="num">-' + UI.money(disc) + '</span></div>' : '') +
      '<div class="row total"><span>До сплати</span><span class="num">' + UI.money(sum - disc) + '</span></div>';
    el.querySelector('#posCheckout').disabled = !state.cart.length;
  }

  function applyPromo() {
    var code = el.querySelector('#posPromo').value.trim();
    if (!code) { state.promoApplied = null; state.promo = ''; renderCart(); return; }
    if (!state.cart.length) { UI.toast('Спершу додайте позиції', 'err'); return; }
    API.post('api/pos.php', {
      action: 'check_promo',
      code: code,
      items: state.cart.map(function (l) { return { item_id: l.item_id, qty: l.qty, options: l.options }; }),
    }).then(function (d) {
      state.promoApplied = { code: code, discount: d.discount };
      state.promo = code;
      renderCart();
      UI.toast('Промокод застосовано: -' + UI.money(d.discount), 'ok');
    }).catch(function (e) {
      state.promoApplied = null;
      renderCart();
      UI.toast(e.message, 'err');
    });
  }

  function checkout() {
    if (!state.cart.length) return;
    var body =
      '<div class="grid grid--2">' +
        '<div class="field"><label for="ckPhone">Телефон</label>' +
          '<input id="ckPhone" placeholder="Телефон (не обов\'язково)" maxlength="18"></div>' +
        '<div class="field"><label for="ckName">Ім\'я</label>' +
          '<input id="ckName" placeholder="Ім\'я (не обов\'язково)" maxlength="40"></div>' +
      '</div>' +
      '<div class="field"><label>Спосіб отримання</label>' +
        '<div class="delivery__toggle" style="display:flex;gap:0;border:1px solid var(--line-strong)">' +
          '<button type="button" class="pos__cat is-active" data-mode="courier">Доставка</button>' +
          '<button type="button" class="pos__cat" data-mode="pickup">Самовивіз</button>' +
          '<button type="button" class="pos__cat" data-mode="dinein">На місці</button>' +
        '</div></div>' +
      '<div id="ckAddrBlock">' +
        '<div class="grid grid--2">' +
          '<div class="field"><label for="ckStreet">Вулиця <span class="field__req">*</span></label><input id="ckStreet" maxlength="90"></div>' +
          '<div class="field"><label for="ckHouse">Будинок <span class="field__req">*</span></label><input id="ckHouse" maxlength="10"></div>' +
        '</div>' +
        '<div class="grid grid--2">' +
          '<div class="field"><label for="ckFlat">Квартира / офіс</label><input id="ckFlat" maxlength="10"></div>' +
          '<div class="field"><label for="ckEntrance">Під\'їзд, поверх, домофон</label><input id="ckEntrance" maxlength="30"></div>' +
        '</div>' +
      '</div>' +
      '<div class="field" id="ckCourierBlock" style="display:none"><label for="ckCourier">Кур\'єр</label>' +
        '<select id="ckCourier"><option value="0">Автоматично</option></select></div>' +
      '<div class="field"><label>Оплата</label>' +
        '<select id="ckPay">' +
          '<option value="cash">Готівка</option>' +
          '<option value="card_at_door">Картка при видачі</option>' +
          '<option value="card_online">Онлайн (демо)</option>' +
        '</select></div>' +
      '<div class="field"><label for="ckComment">Коментар</label><textarea id="ckComment" rows="2" maxlength="300"></textarea></div>' +
      '<div class="field__err" id="ckErr"></div>';

    var m = UI.modal('Оформлення продажу', body, {
      lg: true,
      footer: '<button class="btn btn--ghost" data-act="no">Скасувати</button>' +
        '<button class="btn btn--accent" data-act="yes">Оформити: ' + UI.money(finalTotal()) + '</button>',
      onClose: function () { clearInterval(phoneTimer); },
    });

    var mode = 'courier';
    var phoneTimer = null;

    function switchMode(newMode) {
      mode = newMode;
      m.el.querySelectorAll('[data-mode]').forEach(function (b) {
        b.classList.toggle('is-active', b.dataset.mode === newMode);
      });
      m.el.querySelector('#ckAddrBlock').style.display = newMode === 'courier' ? '' : 'none';
      m.el.querySelector('#ckCourierBlock').style.display = newMode === 'courier' ? '' : 'none';
    }

    m.el.querySelectorAll('[data-mode]').forEach(function (b) {
      b.addEventListener('click', function () { switchMode(b.dataset.mode); });
    });
    switchMode('courier');

    // список кур'єрів для ручного вибору (вільні — перші)
    API.get('api/couriers.php').then(function (d) {
      var sel = m.el.querySelector('#ckCourier');
      if (!sel) return;
      var list = (d.couriers || []).filter(function (c) { return c.active === 1; })
        .sort(function (a, b) { return (a.status === 'busy' ? 1 : 0) - (b.status === 'busy' ? 1 : 0) || a.id - b.id; });
      list.forEach(function (c) {
        var opt = document.createElement('option');
        opt.value = c.id;
        opt.textContent = c.name + ' (' + (c.status === 'busy' ? 'зайнятий' : 'вільний') + ')';
        sel.appendChild(opt);
      });
    }).catch(function () {});

    // поиск клиента по телефону
    var phoneInput = m.el.querySelector('#ckPhone');
    function searchClient() {
      var q = phoneInput.value.replace(/\D/g, '');
      if (q.length < 5) return;
      API.get('api/pos.php?q=' + encodeURIComponent(q)).then(function (d) {
        var c = d.clients && d.clients.length === 1 ? d.clients[0] : null;
        if (!c) return;
        state.client = c;
        if (!m.el.querySelector('#ckName').value) m.el.querySelector('#ckName').value = c.name || '';
        if (!m.el.querySelector('#ckStreet').value && c.address) {
          var parts = c.address.split(', ');
          m.el.querySelector('#ckStreet').value = parts[0] || '';
          m.el.querySelector('#ckHouse').value = parts[1] || '';
        }
        if (c.blacklist) UI.toast('Клієнт у чорному списку!', 'err');
      }).catch(function () {});
    }
    phoneInput.addEventListener('input', function () {
      clearTimeout(phoneTimer);
      phoneTimer = setTimeout(searchClient, 500);
    });

    m.el.querySelector('[data-act="no"]').addEventListener('click', m.close);
    m.el.querySelector('[data-act="yes"]').addEventListener('click', function () {
      var pay = m.el.querySelector('#ckPay').value;
      var payload = {
        action: 'create',
        items: state.cart.map(function (l) { return { item_id: l.item_id, qty: l.qty, options: l.options }; }),
        phone: m.el.querySelector('#ckPhone').value,
        name: m.el.querySelector('#ckName').value,
        delivery_type: mode,
        payment: pay,
        comment: m.el.querySelector('#ckComment').value,
      };
      if (mode === 'courier') {
        payload.street = m.el.querySelector('#ckStreet').value;
        payload.house = m.el.querySelector('#ckHouse').value;
        payload.apartment = m.el.querySelector('#ckFlat').value;
        payload.entrance = m.el.querySelector('#ckEntrance').value;
        var cid = Number(m.el.querySelector('#ckCourier').value);
        if (cid > 0) payload.courier_id = cid;
      }
      if (state.promoApplied) payload.promo_code = state.promoApplied.code;

      var btn = m.el.querySelector('[data-act="yes"]');
      btn.disabled = true;
      API.post('api/pos.php', payload).then(function (d) {
        m.close();
        state.created = Object.assign({}, d, {
          items: state.cart.map(function (l) { return { name: l.name, price: l.price, qty: l.qty, total: l.price * l.qty }; }),
          payment: pay,
          delivery_type: mode,
          contact_name: m.el.querySelector('#ckName').value,
          contact_phone: m.el.querySelector('#ckPhone').value,
          created_at: new Date().toISOString(),
        });
        state.cart = [];
        state.promoApplied = null;
        el.querySelector('#posPromo').value = '';
        renderProducts();
        renderCart();
        showCreated(d);
      }).catch(function (e) {
        btn.disabled = false;
        m.el.querySelector('#ckErr').textContent = e.message;
      });
    });
  }

  function finalTotal() {
    return cartSum() - (state.promoApplied ? state.promoApplied.discount : 0);
  }

  function showCreated(o) {
    var body = '<div style="text-align:center;padding:16px 0">' +
      '<div class="eyebrow">Замовлення створено</div>' +
      '<div style="font-family:var(--font-mono);font-size:40px;font-weight:700;margin:10px 0">' + UI.esc(o.num) + '</div>' +
      '<div style="color:var(--ink-2)">До сплати: <b class="num">' + UI.money(o.total) + '</b></div>' +
      (o.discount ? '<div style="color:var(--green);font-size:var(--fs-sm)">Знижка: ' + UI.money(o.discount) + '</div>' : '') +
      (o.delivery_type === 'dinein' ? '<div style="color:var(--green);font-size:var(--fs-sm)">Оплачено на місці</div>' : '') +
    '</div>';
    var foot = '<button class="btn btn--ghost" data-act="new">Нове замовлення</button>' +
      '<button class="btn" data-act="receipt">Роздрукувати чек</button>';
    if (o.delivery_type === 'dinein') {
      foot = '<button class="btn btn--accent" data-act="done">Видати (закрити)</button>' + foot;
    }
    var m = UI.modal('Продаж оформлено', body, { footer: foot });
    m.el.querySelector('[data-act="new"]').addEventListener('click', function () { m.close(); });
    m.el.querySelector('[data-act="receipt"]').addEventListener('click', function () {
      UI.printReceipt(o);
      m.close();
    });
    var doneBtn = m.el.querySelector('[data-act="done"]');
    if (doneBtn) doneBtn.addEventListener('click', function () {
      doneBtn.disabled = true;
      API.post('api/orders.php', { action: 'set_status', id: o.order_id, status: 'done' }).then(function () {
        UI.toast('Замовлення ' + UI.esc(o.num) + ' видано', 'ok');
        m.close();
      }).catch(function (e) {
        doneBtn.disabled = false;
        UI.toast(e.message, 'err');
      });
    });
  }

  function custShort(opts) {
    var parts = [];
    if (opts.size === 40) parts.push('40 см');
    if (opts.dough === 'fluffy') parts.push('пишне тісто');
    if ((opts.removed || []).length) parts.push('без ' + (opts.removed || []).length);
    if ((opts.added || []).length) parts.push('+' + (opts.added || []).length);
    return parts.join(', ') || '';
  }

  function onClick(e) {
    var t = e.target.closest('[data-cat], [data-add], [data-inc], [data-dec], [data-del]');
    if (!t || !el.contains(t)) return;
    if (t.dataset.cat !== undefined) {
      state.selCat = Number(t.dataset.cat);
      renderProducts();
      return;
    }
    if (t.dataset.add !== undefined) {
      var it = state.items.filter(function (x) { return x.id === Number(t.dataset.add); })[0];
      if (it && isCustomizable(it)) { openCustomize(it); return; }
      addToCart(Number(t.dataset.add));
      return;
    }
    if (t.dataset.inc !== undefined) { changeQty(t.dataset.inc, 1); return; }
    if (t.dataset.dec !== undefined) { changeQty(t.dataset.dec, -1); return; }
    if (t.dataset.del !== undefined) { state.cart = state.cart.filter(function (l) { return l.key !== t.dataset.del; }); state.promoApplied = null; renderCart(); return; }
  }

  function onInput(e) {
    if (e.target.id === 'posPromo') {
      if (!e.target.value.trim()) { state.promoApplied = null; renderCart(); }
    }
  }

  window.CRMModules = window.CRMModules || [];
  window.CRMModules.push({
    id: 'pos',
    title: 'Каса',
    group: 'sales',
    roles: ['admin', 'cashier', 'manager', 'owner'],
    render: function (root) { render(root); },
  });

  document.addEventListener('click', function (e) {
    var b = e.target.closest('#posCheckout');
    if (b) checkout();
    var p = e.target.closest('#posPromoBtn');
    if (p) applyPromo();
  });
})();
