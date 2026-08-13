/* Модуль: Замовлення */
(function () {
  'use strict';

  var el = null;
  var state = { orders: [], status: 'all', source: 'all', q: '', timer: null, active: false, cancelReasons: [], stuck: [] };

  var audioCtx = null;
  var courierSound = true;
  var prevAssignedIds = null;

  var STATUSES = ['new', 'cooking', 'delivering', 'done', 'cancelled'];

  var CANCEL_LABELS = {
    client_cancelled: 'Клієнт скасував',
    no_ingredients: 'Немає інгредієнтів',
    long_wait: 'Довге очікування',
    order_error: 'Помилка замовлення',
    other: 'Інша причина'
  };

  function allowedTransitions(role, from, o) {
    if (role === 'admin' || role === 'cashier' || role === 'manager' || role === 'owner') {
      var all = { new: ['cooking', 'delivering', 'cancelled'], cooking: ['delivering', 'done', 'cancelled'], delivering: ['done', 'cancelled'] };
      if (o && o.delivery_type === 'dinein' && from === 'new') all.new.push('done');
      return all[from] || [];
    }
    if (role === 'cook') return { new: ['cooking'], cooking: ['done'] }[from] || [];
    if (role === 'courier') return { new: ['delivering'], cooking: ['delivering'], delivering: ['done'] }[from] || [];
    if (role === 'support') return { new: ['cancelled'], cooking: ['cancelled'], delivering: ['cancelled'] }[from] || [];
    return [];
  }

  function fmtTime(ts) {
    var d = new Date(ts.replace(' ', 'T'));
    var loc = window.I18N ? I18N.locale() : 'uk-UA';
    return d.toLocaleTimeString(loc, { hour: '2-digit', minute: '2-digit' }) + ' ' + d.toLocaleDateString(loc, { day: 'numeric', month: 'short' });
  }

  function beepCourier() {
    if (!courierSound) return;
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      var o = audioCtx.createOscillator();
      var g = audioCtx.createGain();
      o.connect(g); g.connect(audioCtx.destination);
      o.type = 'sine'; o.frequency.value = 740;
      g.gain.setValueAtTime(0.12, audioCtx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.7);
      o.start(); o.stop(audioCtx.currentTime + 0.7);
      if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
    } catch (e) { /* без звуку */ }
  }

  // Кур'єр: звук + вібрація при появі нового призначеного замовлення (status=delivering)
  function detectNewAssignments(orders) {
    if (API.state.user.role !== 'courier') return;
    var current = {};
    orders.forEach(function (o) {
      if (o.status === 'delivering' && o.courier_id === API.state.user.id) current[o.id] = true;
    });
    if (prevAssignedIds !== null) {
      var fresh = false;
      for (var id in current) {
        if (Object.prototype.hasOwnProperty.call(current, id) && !prevAssignedIds[id]) { fresh = true; break; }
      }
      if (fresh) {
        beepCourier();
        UI.toast('Нове замовлення для доставки!', 'ok');
      }
    }
    prevAssignedIds = current;
  }

  function load() {
    var p = 'status=' + state.status + '&source=' + state.source + '&q=' + encodeURIComponent(state.q);
    return API.get('api/orders.php?' + p).then(function (d) {
      state.orders = d.orders;
      state.cancelReasons = d.cancel_reasons || [];
      state.stuck = d.stuck || [];
      detectNewAssignments(state.orders);
      if (el) renderList();
      if (el) renderStuck();
    });
  }

  function render(root) {
    if (root) el = root;
    if (!el) return;
    var role = API.state.user.role;
    var counts = {};
    state.orders.forEach(function (o) { counts[o.status] = (counts[o.status] || 0) + 1; });

    var filters = STATUSES.map(function (s) {
      return '<button class="ord-stat' + (state.status === s ? ' is-active' : '') + '" data-status="' + s + '" type="button">' +
        UI.STATUS[s].label + ' <span class="n">' + (counts[s] || 0) + '</span></button>';
    }).join('') +
      '<button class="ord-stat' + (state.status === 'all' ? ' is-active' : '') + '" data-status="all" type="button">Усі <span class="n">' + state.orders.length + '</span></button>';

    var html =
      '<div class="page-head"><div><h1>Замовлення</h1><p class="hint">Оновлюється автоматично кожні 15 секунд</p></div></div>' +
      '<div class="toolbar">' +
        '<div class="order-filters">' + filters + '</div>' +
        '<div style="flex:1"></div>' +
        (role === 'courier'
          ? '<button class="mini-btn" id="ordCourierSound" data-sound-toggle type="button">Звук</button>'
          : '') +
        '<select id="ordSource" style="max-width:160px">' +
          '<option value="all">Усі джерела</option>' +
          '<option value="site">Сайт</option>' +
          '<option value="pos">Каса</option>' +
        '</select>' +
        '<input class="search" id="ordSearch" placeholder="Пошук: номер, ім\'я, телефон" style="max-width:260px">' +
      '</div>' +
      '<div id="ordStuck"></div>' +
      '<div id="ordList"></div>';

    el.innerHTML = html;
    el.addEventListener('click', onClick);
    el.addEventListener('input', onInput);

    el.querySelector('#ordSource').value = state.source;
    el.querySelector('#ordSearch').value = state.q;
    var snd = el.querySelector('#ordCourierSound');
    if (snd) {
      snd.classList.toggle('is-off', !courierSound);
      snd.addEventListener('click', function () {
        courierSound = !courierSound;
        snd.classList.toggle('is-off', !courierSound);
        snd.textContent = courierSound ? 'Звук' : 'Тихо';
      });
    }
    renderList();
    renderStuck();
  }

  function renderList() {
    var list = el.querySelector('#ordList');
    if (!list) return;
    if (!state.orders.length) {
      list.innerHTML = '<div class="empty">Немає замовлень за цим фільтром</div>';
      return;
    }
    list.innerHTML = state.orders.map(function (o) {
      var role = API.state.user.role;
      var trans = allowedTransitions(role, o.status, o);
      var btns = trans.map(function (t) {
        var label = { cooking: 'Готувати', delivering: 'У доставку', done: 'Готово / Виконано', cancelled: 'Скасувати' }[t] || t;
        if (o.status === 'new' && o.source === 'site' && t === 'cooking') label = 'Підтвердити';
        var cls = t === 'cancelled' ? 'btn--ghost mini-btn--danger' : '';
        return '<button class="mini-btn ' + cls + '" data-status="' + t + '" data-id="' + o.id + '" type="button">' + label + '</button>';
      }).join('');

      var canEdit = o.status === 'new' && (role === 'admin' || role === 'cashier' || role === 'manager' || role === 'owner');
      var editBtn = canEdit ? '<button class="mini-btn" data-edit="' + o.id + '" type="button">Редагувати</button>' : '';
      var cancelNote = o.cancel_reason ? '<span style="color:var(--danger)">Причина: ' + UI.esc(CANCEL_LABELS[o.cancel_reason] || o.cancel_reason) + '</span>' : '';

      var items = o.items.map(function (l) {
        return '<div class="l"><span>' + l.qty + 'x ' + UI.esc(l.name) + '</span><span class="num">' + UI.money(l.total) + '</span></div>';
      }).join('');

      return '<div class="order-card' + (role === 'courier' && o.courier_id === API.state.user.id ? ' order-card--mine' : '') + '" id="oc-' + o.id + '">' +
        '<div class="order-card__head">' +
          '<span class="order-card__num">' + UI.esc(o.num) + '</span>' +
          UI.statusBadge(o.status) +
          '<span class="badge badge--gray">' + UI.deliveryLabel(o.delivery_type) + '</span>' +
          '<span class="badge badge--gray">' + UI.sourceLabel(o.source) + '</span>' +
          (role === 'courier' && o.courier_id === API.state.user.id ? '<span class="badge badge--accent">Моє замовлення</span>' : '') +
          (o.courier && role !== 'courier' ? '<span class="badge badge--gray">Кур\'єр: ' + UI.esc(o.courier.name) + '</span>' : '') +
          (o.unread ? '<span class="badge badge--red">Чат: ' + o.unread + '</span>' : '') +
          '<span class="order-card__time">' + fmtTime(o.created_at) + '</span>' +
        '</div>' +
        '<div class="order-card__body">' +
          '<div class="order-card__items">' + items + '</div>' +
          '<div class="order-card__info">' +
            '<span><b>' + UI.esc(o.contact_name) + '</b></span>' +
            '<span class="num">' + UI.esc(o.contact_phone) + '</span>' +
            (o.address ? '<span class="addr">' + UI.esc(o.address) + '</span>' : '') +
            '<span>Оплата: ' + UI.payLabel(o.payment) + '</span>' +
            (cancelNote ? '<span>' + cancelNote + '</span>' : '') +
            (o.promo_code ? '<span style="color:var(--green)">Промокод: ' + UI.esc(o.promo_code) + '</span>' : '') +
            (o.comment ? '<span style="color:var(--ink-3)">' + UI.esc(o.comment) + '</span>' : '') +
            '<span style="border-top:1px dashed var(--line);padding-top:6px">' +
              'Підсумок: <b class="num">' + UI.money(o.subtotal) + '</b>' +
              (o.discount ? '<br>Знижка: <span class="num" style="color:var(--green)">-' + UI.money(o.discount) + '</span>' : '') +
              '<br>Всього: <b class="num" style="color:var(--accent)">' + UI.money(o.total) + '</b>' +
            '</span>' +
          '</div>' +
        '</div>' +
        '<div class="order-card__foot">' +
          '<div style="display:flex;gap:8px;flex-wrap:wrap">' + btns + editBtn + '</div>' +
          '<div style="flex:1"></div>' +
          '<button class="mini-btn" data-chat="' + o.id + '" type="button">' + (o.unread ? 'Чат (' + o.unread + ')' : 'Чат') + '</button>' +
          '<button class="mini-btn" data-receipt="' + o.id + '" type="button">Чек</button>' +
        '</div>' +
        '<div class="chat-panel" id="cp-' + o.id + '" hidden>' +
          '<button class="chat-panel__toggle" data-chattoggle="' + o.id + '" type="button">Повідомлення</button>' +
          '<div id="chatbody-' + o.id + '"></div>' +
        '</div>' +
      '</div>';
    }).join('');
  }

  function renderStuck() {
    var box = el.querySelector('#ordStuck');
    if (!box) return;
    if (!state.stuck || !state.stuck.length) {
      box.innerHTML = '';
      return;
    }
    box.innerHTML =
      '<div class="stuck-bar">' +
        '<div class="stuck-bar__title">Завислі замовлення (в дорозі понад 20 хв)</div>' +
        state.stuck.map(function (o) {
          return '<div class="stuck-bar__row">' +
            '<b>' + UI.esc(o.num) + '</b>' +
            '<span>' + UI.esc(o.contact_name || '') + ' · ' + UI.esc(o.address || '') + '</span>' +
            '<span class="stuck-bar__time">' + fmtTime(o.updated_at) + '</span>' +
            '<span style="flex:1"></span>' +
            '<button class="mini-btn mini-btn--danger" data-stuck-cancel="' + o.id + '" type="button">Скасувати</button>' +
          '</div>';
        }).join('') +
      '</div>';
  }

  function openCancelModal(o) {
    var reasons = (state.cancelReasons && state.cancelReasons.length) ? state.cancelReasons : ['client_cancelled', 'no_ingredients', 'long_wait', 'order_error', 'other'];
    var opts = reasons.map(function (r) {
      return '<option value="' + r + '">' + UI.esc(CANCEL_LABELS[r] || r) + '</option>';
    }).join('');
    var body =
      '<p style="color:var(--ink-2)">' + UI.esc(o.num) + ' · ' + UI.esc(o.contact_name || '') + '</p>' +
      '<label style="display:block;font-size:var(--fs-sm);color:var(--ink-3);margin-bottom:6px">Причина скасування</label>' +
      '<select id="cancelReasonSel" style="width:100%">' +
        '<option value="">— Виберіть причину —</option>' + opts +
      '</select>';
    var m = UI.modal('Скасування замовлення', body, {
      footer: '<button class="btn btn--ghost" data-act="no">Закрити</button>' +
              '<button class="btn btn--danger" data-act="yes">Скасувати замовлення</button>',
      onClose: function () { window.__ordCancelId = null; }
    });
    window.__ordCancelId = o.id;
    m.el.querySelector('[data-act="no"]').addEventListener('click', m.close);
    m.el.querySelector('[data-act="yes"]').addEventListener('click', function () {
      var sel = m.el.querySelector('#cancelReasonSel');
      var reason = sel ? sel.value : '';
      if (!reason) { UI.toast('Оберіть причину скасування', 'err'); return; }
      m.close();
      setStatus(o.id, 'cancelled', reason);
    });
  }

  function openEditModal(id) {
    API.get('api/orders.php?id=' + id).then(function (d) {
      var o = d.order;
      var rows = (o.items || []).map(function (l) {
        return '<div class="edit-line" data-edit-row>' +
          '<input type="hidden" data-edit-item="' + l.item_id + '">' +
          '<span style="flex:1">' + UI.esc(l.name) + '</span>' +
          '<span class="edit-price">' + UI.money(l.price) + '</span>' +
          '<input class="edit-qty" type="number" min="1" max="99" value="' + l.qty + '" style="width:64px" data-edit-qty="' + l.item_id + '">' +
          '<button class="mini-btn mini-btn--danger" data-edit-del="' + l.item_id + '" type="button">Видалити</button>' +
        '</div>';
      }).join('');
      var body =
        '<div class="edit-list">' + (rows || '<div style="color:var(--ink-3)">Немає позицій</div>') + '</div>' +
        '<div class="edit-add">' +
          '<select id="editMenuSel" style="flex:1;min-width:0"></select>' +
          '<button class="btn btn--sm" data-edit-add-item type="button">Додати позицію</button>' +
        '</div>';
      var m = UI.modal('Редагування замовлення ' + UI.esc(o.num), body, {
        lg: true,
        footer: '<button class="btn btn--ghost" data-act="no">Закрити</button>' +
                '<button class="btn btn--accent" data-act="yes">Зберегти</button>',
        onClose: function () { window.__ordEditId = null; }
      });
      window.__ordEditId = id;
      m.el.querySelector('[data-act="no"]').addEventListener('click', m.close);
      m.el.querySelector('[data-act="yes"]').addEventListener('click', function () { saveEdit(id, m); });
      m.el.addEventListener('click', function (e) {
        var del = e.target.closest('[data-edit-del]');
        if (del) { var row = del.closest('[data-edit-row]'); if (row) row.remove(); return; }
        var add = e.target.closest('[data-edit-add-item]');
        if (add) {
          var sel = m.el.querySelector('#editMenuSel');
          if (!sel || !sel.value) { UI.toast('Оберіть позицію з меню', 'err'); return; }
          var opt = sel.options[sel.selectedIndex];
          var line = '<div class="edit-line" data-edit-row>' +
            '<input type="hidden" data-edit-item="' + sel.value + '">' +
            '<span style="flex:1">' + UI.esc(opt.getAttribute('data-name')) + '</span>' +
            '<span class="edit-price">' + opt.getAttribute('data-price') + '</span>' +
            '<input class="edit-qty" type="number" min="1" max="99" value="1" style="width:64px" data-edit-qty="' + sel.value + '">' +
            '<button class="mini-btn mini-btn--danger" data-edit-del="' + sel.value + '" type="button">Видалити</button>' +
          '</div>';
          var list = m.el.querySelector('.edit-list');
          if (list.querySelector('.edit-line') === null) list.innerHTML = '';
          list.insertAdjacentHTML('beforeend', line);
        }
      });
      API.get('api/menu.php').then(function (md) {
        var sel = m.el.querySelector('#editMenuSel');
        if (!sel) return;
        sel.innerHTML = (md.items || []).map(function (it) {
          return '<option value="' + it.id + '" data-name="' + UI.esc(it.name) + '" data-price="' + UI.money(it.price) + '">' +
            UI.esc(it.name) + ' — ' + UI.money(it.price) + '</option>';
        }).join('');
      }).catch(function () {});
    }).catch(function (e) { UI.toast(e.message, 'err'); });
  }

  function saveEdit(id, m) {
    var items = [].map.call(m.el.querySelectorAll('[data-edit-item]'), function (h) {
      var qtyEl = m.el.querySelector('[data-edit-qty="' + h.value + '"]');
      var qty = qtyEl ? parseInt(qtyEl.value, 10) : 0;
      if (!qty || qty < 1) return null;
      return { item_id: Number(h.value), qty: qty };
    }).filter(Boolean);
    if (!items.length) { UI.toast('Додайте хоча б одну позицію', 'err'); return; }
    API.post('api/orders.php', { action: 'edit_items', id: id, items: items }).then(function () {
      m.close();
      UI.toast('Замовлення оновлено', 'ok');
      load();
    }).catch(function (e) { UI.toast(e.message, 'err'); });
  }

  function openChat(id) {
    API.get('api/orders.php?id=' + id).then(function (d) {
      var o = d.order;
      var panel = el.querySelector('#cp-' + id);
      if (!panel) return;
      panel.hidden = false;
      var body = panel.querySelector('#chatbody-' + id);
      var msgs = (o.chat || []).map(function (m) {
        var isOp = m.author === 'operator';
        return '<div class="msg ' + (isOp ? 'msg--out' : 'msg--in') + '">' + UI.esc(m.text) +
          '<div class="msg__meta">' + fmtTime(m.created_at) + (isOp ? ' · оператор' : ' · клієнт') + '</div></div>';
      }).join('');
      body.innerHTML =
        '<div class="chat-msgs" style="max-height:240px;overflow-y:auto;display:flex;flex-direction:column;gap:8px;padding:12px;background:var(--bg-soft)">' +
          (msgs || '<div style="color:var(--ink-3);font-size:var(--fs-sm)">Немає повідомлень. Клієнт може написати зі сторінки статусу замовлення.</div>') +
        '</div>' +
        '<div style="display:flex;gap:8px;padding:10px 12px;border-top:1px solid var(--line)">' +
          '<input id="chatInput-' + id + '" placeholder="Написати клієнту..." maxlength="500">' +
          '<button class="btn btn--sm" data-chatsend="' + id + '" type="button">Надіслати</button>' +
        '</div>';
      API.post('api/orders.php', { action: 'chat_read', id: id }).then(function () {
        var b = el.querySelector('[data-chat="' + id + '"]');
        if (b) b.textContent = 'Чат';
      }).catch(function () {});
    }).catch(function (e) { UI.toast(e.message, 'err'); });
  }

  function sendChat(id) {
    var inp = el.querySelector('#chatInput-' + id);
    var text = inp ? inp.value.trim() : '';
    if (!text) return;
    API.post('api/orders.php', { action: 'chat_send', id: id, text: text }).then(function () {
      inp.value = '';
      openChat(id);
    }).catch(function (e) { UI.toast(e.message, 'err'); });
  }

  function setStatus(id, status, reason) {
    var body = { action: 'set_status', id: id, status: status };
    if (reason) body.reason = reason;
    API.post('api/orders.php', body).then(function () {
      UI.toast('Статус змінено', 'ok');
      return load();
    }).catch(function (e) { UI.toast(e.message, 'err'); });
  }

  function onClick(e) {
    var t = e.target.closest('[data-status], [data-chat], [data-receipt], [data-chatsend], [data-chattoggle], [data-edit], [data-stuck-cancel]');
    if (!t || !el.contains(t)) return;
    if (t.dataset.status !== undefined && t.dataset.id !== undefined) {
      if (t.dataset.status === 'cancelled') {
        var co = state.orders.filter(function (x) { return x.id === Number(t.dataset.id); })[0];
        if (co) openCancelModal(co);
        return;
      }
      setStatus(Number(t.dataset.id), t.dataset.status);
      return;
    }
    if (t.dataset.edit !== undefined) { openEditModal(Number(t.dataset.edit)); return; }
    if (t.dataset.stuckCancel !== undefined) {
      var so = state.stuck.filter(function (x) { return x.id === Number(t.dataset.stuckCancel); })[0];
      if (so) openCancelModal(so);
      return;
    }
    if (t.dataset.chat !== undefined) { openChat(Number(t.dataset.chat)); return; }
    if (t.dataset.receipt !== undefined) {
      var o = state.orders.filter(function (x) { return x.id === Number(t.dataset.receipt); })[0];
      if (o) UI.printReceipt(o);
      return;
    }
    if (t.dataset.chatsend !== undefined) { sendChat(Number(t.dataset.chatsend)); return; }
    if (t.dataset.chattoggle !== undefined) {
      var p = el.querySelector('#cp-' + t.dataset.chattoggle);
      if (p) p.hidden = !p.hidden;
      if (!p.hidden) openChat(Number(t.dataset.chattoggle));
    }
  }

  function onInput(e) {
    if (e.target.id === 'ordSearch') {
      state.q = e.target.value.trim();
      clearTimeout(state.qTimer);
      state.qTimer = setTimeout(load, 400);
    }
    if (e.target.id === 'ordSource') {
      state.source = e.target.value;
      load();
    }
  }

  function startPolling() {
    stopPolling();
    state.timer = setInterval(function () {
      if (el && el.classList.contains('is-active')) load();
    }, 15000);
  }

  function stopPolling() {
    if (state.timer) { clearInterval(state.timer); state.timer = null; }
  }

  window.CRMModules = window.CRMModules || [];
  window.CRMModules.push({
    id: 'orders',
    title: 'Замовлення',
    group: 'sales',
    roles: ['admin', 'cashier', 'cook', 'courier', 'manager', 'support', 'owner'],
    render: function (root) {
      el = root;
      root.innerHTML = '<div class="center-box"><div class="spinner"></div></div>';
      load().then(function () { render(root); startPolling(); }).catch(function (e) {
        root.innerHTML = '<div class="empty">' + UI.esc(e.message) + '</div>';
      });
    },
  });
})();
