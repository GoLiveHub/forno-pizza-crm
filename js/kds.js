/* Кухонний дисплей (KDS) — окрема сторінка kds.html.
   Ролі: cook / admin. Оновлення 3с, таймери, звук при новому замовленні.
   API: api/auth.php (сесія), api/orders.php (GET status, POST set_status). */
(function () {
  'use strict';

  var POLL_MS = 3000;
  var DONE_MAX_AGE_MS = 30 * 60 * 1000;

  var board = document.getElementById('kdsBoard');
  var info = document.getElementById('kdsInfo');
  var flash = document.getElementById('kdsFlash');
  var blocked = document.getElementById('kdsBlocked');

  var prevIds = null;
  var audioCtx = null;
  var beepOn = true;
  var pollTimer = null;
  var timerTick = null;

  function esc(s) {
    var d = document.createElement('div');
    d.textContent = String(s == null ? '' : s);
    return d.innerHTML;
  }

  function parseTs(ts) {
    return new Date(String(ts).replace(' ', 'T')).getTime();
  }

  function p2(n) { return String(n).padStart(2, '0'); }

  function fmtClock(d) {
    return p2(d.getHours()) + ':' + p2(d.getMinutes()) + ':' + p2(d.getSeconds());
  }

  function beep() {
    if (!beepOn) return;
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      var o = audioCtx.createOscillator();
      var g = audioCtx.createGain();
      o.connect(g); g.connect(audioCtx.destination);
      o.type = 'square'; o.frequency.value = 880;
      g.gain.setValueAtTime(0.1, audioCtx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.6);
      o.start(); o.stop(audioCtx.currentTime + 0.6);
    } catch (e) { /* без звуку */ }
  }

  function showFlash() {
    flash.classList.add('is-on');
    clearTimeout(flash._t);
    flash._t = setTimeout(function () { flash.classList.remove('is-on'); }, 4000);
  }

  function detectNew(orders) {
    var current = {};
    orders.forEach(function (o) {
      if (o.status === 'new' || o.status === 'cooking') current[o.id] = true;
    });
    if (prevIds !== null) {
      var fresh = false;
      for (var id in current) {
        if (Object.prototype.hasOwnProperty.call(current, id) && !prevIds[id]) { fresh = true; break; }
      }
      if (fresh) { beep(); showFlash(); }
    }
    prevIds = current;
  }

  function deliveryLabel(o) {
    var type = o.delivery_type === 'courier' ? 'Доставка' : (o.delivery_type === 'pickup' ? 'Самовивіз' : '');
    return type ? type + ' · ' : '';
  }

  function cardHtml(o, variant, actionsHtml) {
    var items = (o.items || []).map(function (l) {
      return '<div><b>' + esc(l.qty) + 'x</b> ' + esc(l.name) + '</div>';
    }).join('');
    return '<div class="kds-card kds-card--' + variant + '" data-id="' + o.id + '" data-ts="' + esc(o.created_at) + '">' +
      '<div class="kds-card__head">' +
        '<span class="kds-card__num">' + esc(o.num) + '</span>' +
        '<span class="kds-card__timer">00:00</span>' +
      '</div>' +
      '<div class="kds-card__sub">' + deliveryLabel(o) + esc(o.source) + '</div>' +
      '<div class="kds-card__items">' + items + '</div>' +
      (o.comment ? '<div class="kds-card__comment">' + esc(o.comment) + '</div>' : '') +
      (actionsHtml ? '<div class="kds-card__actions">' + actionsHtml + '</div>' : '') +
    '</div>';
  }

  function render(orders) {
    var newList = [];
    var cookingList = [];
    var doneList = [];
    orders.forEach(function (o) {
      if (o.status === 'new') newList.push(o);
      else if (o.status === 'cooking') cookingList.push(o);
      else if (o.status === 'done') doneList.push(o);
    });

    document.getElementById('countNew').textContent = newList.length;
    document.getElementById('countCooking').textContent = cookingList.length;
    document.getElementById('countDone').textContent = doneList.length;

    document.getElementById('colNew').innerHTML = newList.length
      ? newList.map(function (o) {
          return cardHtml(o, 'new', '<button class="kds-btn--start" data-act="cooking" data-id="' + o.id + '" type="button">Почати готувати</button>');
        }).join('')
      : '<div class="kds-empty">Немає активних замовлень</div>';

    document.getElementById('colCooking').innerHTML = cookingList.length
      ? cookingList.map(function (o) {
          return cardHtml(o, 'cooking', '<button class="kds-btn--done" data-act="done" data-id="' + o.id + '" type="button">Готово</button>');
        }).join('')
      : '<div class="kds-empty">Немає активних замовлень</div>';

    document.getElementById('colDone').innerHTML = doneList.length
      ? doneList.map(function (o) { return cardHtml(o, 'done', ''); }).join('')
      : '<div class="kds-empty">Немає активних замовлень</div>';
  }

  function tickTimers() {
    var cards = board.querySelectorAll('.kds-card[data-ts]');
    var now = Date.now();
    for (var i = 0; i < cards.length; i++) {
      var t = cards[i].querySelector('.kds-card__timer');
      if (!t) continue;
      var start = parseTs(cards[i].getAttribute('data-ts'));
      if (isNaN(start)) continue;
      var diff = Math.max(0, Math.floor((now - start) / 1000));
      var h = Math.floor(diff / 3600);
      var m = Math.floor((diff % 3600) / 60);
      var s = diff % 60;
      t.textContent = h > 0 ? p2(h) + ':' + p2(m) + ':' + p2(s) : p2(m) + ':' + p2(s);
    }
  }

  function load() {
    var tasks = ['new', 'cooking', 'done'].map(function (st) {
      return API.get('api/orders.php?status=' + st);
    });
    return Promise.all(tasks).then(function (res) {
      var orders = [];
      res.forEach(function (d) {
        (d.orders || []).forEach(function (o) { orders.push(o); });
      });
      var now = Date.now();
      orders = orders.filter(function (o) {
        if (o.status !== 'done') return true;
        var closed = parseTs(o.closed_at);
        if (isNaN(closed)) return true;
        return now - closed < DONE_MAX_AGE_MS;
      });
      detectNew(orders);
      render(orders);
      info.textContent = 'Оновлено: ' + fmtClock(new Date()) + ' · ' + (API.state.user ? API.state.user.name : '');
    });
  }

  function init() {
    API.loadSession().then(function (d) {
      if (!d.authed) { window.location.href = 'login.html'; return; }
      var role = d.user ? d.user.role : '';
      if (role !== 'cook' && role !== 'admin') {
        board.hidden = true;
        blocked.hidden = false;
        return;
      }
      load().catch(function (err) { info.textContent = err.message; });
      pollTimer = setInterval(function () {
        load().catch(function (err) { info.textContent = err.message; });
      }, POLL_MS);
      timerTick = setInterval(tickTimers, 1000);
    }).catch(function () {
      window.location.href = 'login.html';
    });

    board.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-act]');
      if (!btn) return;
      var id = Number(btn.getAttribute('data-id'));
      var status = btn.getAttribute('data-act');
      btn.disabled = true;
      API.post('api/orders.php', { action: 'set_status', id: id, status: status })
        .then(load)
        .catch(function (err) {
          btn.disabled = false;
          info.textContent = err.message;
        });
    });

    var beepBtn = document.getElementById('kdsBeep');
    beepBtn.addEventListener('click', function () {
      beepOn = !beepOn;
      beepBtn.classList.toggle('is-off', !beepOn);
      beepBtn.textContent = beepOn ? 'Звук' : 'Тихо';
    });

    document.getElementById('kdsLogout').addEventListener('click', function () {
      API.post('api/auth.php', { action: 'logout' }).then(function () {
        window.location.href = 'login.html';
      });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
