/* Модуль: Чат */
(function () {
  'use strict';

  var el = null;
  var state = { dialogs: [], active: 0, timer: null };

  function fmtTime(ts) {
    if (!ts) return '';
    var d = new Date(ts.replace(' ', 'T'));
    var loc = window.I18N ? I18N.locale() : 'uk-UA';
    return d.toLocaleDateString(loc, { day: 'numeric', month: 'short' }) + ' ' + d.toLocaleTimeString(loc, { hour: '2-digit', minute: '2-digit' });
  }

  function load() {
    return API.get('api/chat.php').then(function (d) {
      state.dialogs = d.dialogs;
      if (state.active && !state.dialogs.some(function (x) { return x.order_id === state.active; })) state.active = 0;
      renderList();
      if (state.active) loadThread(state.active);
    });
  }

  function render(root) {
    el = root;
    root.innerHTML =
      '<div class="page-head"><div><h1>Чат з клієнтами</h1><p class="hint">Повідомлення клієнтів зі сторінки замовлення на сайті</p></div></div>' +
      '<div class="chat-window">' +
        '<div class="chat-list" id="chatList"></div>' +
        '<div class="chat-thread" id="chatThread"></div>' +
      '</div>';
    el.addEventListener('click', onClick);
    renderList();
    if (state.active) loadThread(state.active);
  }

  function renderList() {
    var list = el.querySelector('#chatList');
    if (!list) return;
    if (!state.dialogs.length) { list.innerHTML = '<div class="empty">Повідомлень немає</div>'; return; }
    list.innerHTML = state.dialogs.map(function (d) {
      return '<div style="padding:12px 14px;border-bottom:1px solid var(--line);cursor:pointer;' + (d.order_id === state.active ? 'background:var(--bg-soft)' : '') + '" data-dialog="' + d.order_id + '">' +
        '<div style="display:flex;justify-content:space-between;align-items:center">' +
          '<b class="num">' + UI.esc(d.num) + '</b>' +
          (d.unread ? '<span class="badge badge--red">' + d.unread + '</span>' : '') +
        '</div>' +
        '<div style="font-size:var(--fs-sm);color:var(--ink-2);margin-top:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + UI.esc(d.last_text || '…') + '</div>' +
        '<div style="font-size:11px;color:var(--ink-3);margin-top:4px">' + fmtTime(d.last_at) + ' · ' + UI.deliveryLabel(d.delivery_type) + '</div>' +
      '</div>';
    }).join('');
  }

  function loadThread(id) {
    state.active = id;
    renderList();
    API.get('api/orders.php?id=' + id).then(function (d) {
      var o = d.order;
      var thread = el.querySelector('#chatThread');
      if (!thread) return;
      var msgs = (o.chat || []).map(function (m) {
        var isOp = m.author === 'operator';
        return '<div class="msg ' + (isOp ? 'msg--out' : 'msg--in') + '">' + UI.esc(m.text) +
          '<div class="msg__meta">' + fmtTime(m.created_at) + (isOp ? ' · оператор' : ' · клієнт') + '</div></div>';
      }).join('');
      thread.innerHTML =
        '<div style="padding:12px 16px;border-bottom:1px solid var(--line);display:flex;justify-content:space-between;align-items:center">' +
          '<b class="num">' + UI.esc(o.num) + '</b>' +
          '<span style="font-size:var(--fs-sm);color:var(--ink-2)">' + UI.esc(o.contact_name) + ' · ' + UI.esc(o.contact_phone) + '</span>' +
        '</div>' +
        '<div class="chat-msgs">' + (msgs || '<div style="color:var(--ink-3)">Немає повідомлень</div>') + '</div>' +
        '<div class="chat-send">' +
          '<input id="chatMsg" placeholder="Написати клієнту..." maxlength="500">' +
          '<button class="btn btn--sm" data-send="' + id + '" type="button">Надіслати</button>' +
        '</div>';
      var c = thread.querySelector('.chat-msgs');
      if (c) c.scrollTop = c.scrollHeight;
      API.post('api/chat.php', { action: 'chat_read', id: id }).catch(function () {});
    }).catch(function (e) { UI.toast(e.message, 'err'); });
  }

  function onClick(e) {
    var t = e.target.closest('[data-dialog], [data-send]');
    if (!t || !el.contains(t)) return;
    if (t.dataset.dialog !== undefined) { loadThread(Number(t.dataset.dialog)); return; }
    if (t.dataset.send !== undefined) {
      var inp = el.querySelector('#chatMsg');
      var text = inp ? inp.value.trim() : '';
      if (!text) return;
      API.post('api/chat.php', { action: 'chat_send', id: Number(t.dataset.send), text: text })
        .then(function () { loadThread(Number(t.dataset.send)); })
        .catch(function (err) { UI.toast(err.message, 'err'); });
    }
  }

  function start() {
    if (state.timer) clearInterval(state.timer);
    state.timer = setInterval(function () {
      if (el && el.classList.contains('is-active')) load();
    }, 12000);
  }

  window.CRMModules = window.CRMModules || [];
  window.CRMModules.push({
    id: 'chat',
    title: 'Чат',
    group: 'sales',
    roles: ['admin', 'cashier', 'manager', 'support', 'owner'],
    render: function (root) {
      el = root;
      root.innerHTML = '<div class="center-box"><div class="spinner"></div></div>';
      load().then(function () { render(root); start(); }).catch(function (e) {
        root.innerHTML = '<div class="empty">' + UI.esc(e.message) + '</div>';
      });
    },
  });
})();
