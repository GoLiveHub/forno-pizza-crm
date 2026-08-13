/* Общие UI-хелперы. */
(function () {
  'use strict';

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /* Продажное округление: дробную цену округляем вверх до целого, заканчивающегося на 9
     (248.1 -> 249, 1293.4 -> 1299). Целые оставляем как есть. */
  function sell(n) {
    var v = Number(n || 0);
    if (!isFinite(v)) return 0;
    if (Math.round(v) === v) return v;
    var r = Math.ceil(v);
    var t = Math.ceil((r + 1) / 10) * 10 - 1;
    return t >= r ? t : r;
  }

  function money(n) {
    var cur = window.CURR || { code: 'uah', rate: 1 };
    var v = Number(n || 0);
    if (cur.code === 'rub') v = v * (Number(cur.rate) || 1);
    v = sell(v);
    var locale = window.I18N ? I18N.locale() : 'uk-UA';
    if (cur.code === 'rub') locale = 'ru-RU';
    return v.toLocaleString(locale, { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + ' ' + (cur.code === 'rub' ? 'руб' : 'грн');
  }

  /* Округлённое количество без «плавающего» хвоста (1306.0119999999997 -> 1306.012). */
  function qty(n) {
    var v = Number(n || 0);
    if (!isFinite(v)) return '0';
    var s = String(Math.round(v * 1000) / 1000);
    if (s.indexOf('.') !== -1) s = s.replace(/0+$/, '').replace(/\.$/, '');
    return s;
  }

  function toast(msg, type) {
    var wrap = document.querySelector('.toast-wrap');
    if (!wrap) {
      wrap = document.createElement('div');
      wrap.className = 'toast-wrap';
      document.body.appendChild(wrap);
    }
    var t = document.createElement('div');
    t.className = 'toast' + (type === 'err' ? ' toast--err' : type === 'ok' ? ' toast--ok' : '');
    t.textContent = msg;
    wrap.appendChild(t);
    setTimeout(function () { t.remove(); }, 3600);
  }

  var STATUS_META = {
    new: { label: 'Новий', cls: 'badge--blue', dot: 'new' },
    cooking: { label: 'Готується', cls: 'badge--gold', dot: 'cooking' },
    delivering: { label: 'Доставляється', cls: 'badge--red', dot: 'delivering' },
    done: { label: 'Виконано', cls: 'badge--green', dot: 'done' },
    cancelled: { label: 'Скасовано', cls: 'badge--gray', dot: 'cancelled' },
  };

  function statusBadge(status) {
    var m = STATUS_META[status] || { label: status, cls: 'badge--gray', dot: '' };
    return '<span class="badge ' + m.cls + '"><span class="status-dot ' + m.dot + '"></span>' + esc(m.label) + '</span>';
  }

  var PAY_META = {
    cash: 'Готівка',
    card_at_door: 'Картка при видачі',
    card_online: 'Онлайн',
  };

  function payLabel(p) { return PAY_META[p] || p; }
  function sourceLabel(s) { return s === 'pos' ? 'Каса' : 'Сайт'; }
  function deliveryLabel(d) { return d === 'pickup' ? 'Самовивіз' : d === 'dinein' ? 'На місці' : 'Доставка'; }

  function modal(title, bodyHtml, opts) {
    opts = opts || {};
    var ov = document.createElement('div');
    ov.className = 'modal-overlay';
    ov.innerHTML =
      '<div class="modal' + (opts.lg ? ' modal--lg' : '') + '" role="dialog" aria-modal="true">' +
        '<div class="modal__head"><div class="modal__title">' + esc(title) + '</div>' +
        '<button class="modal__close" type="button" aria-label="Закрити">&times;</button></div>' +
        '<div class="modal__body">' + bodyHtml + '</div>' +
        (opts.footer ? '<div class="modal__foot">' + opts.footer + '</div>' : '') +
      '</div>';
    function close() {
      ov.remove();
      document.removeEventListener('keydown', onKey);
      if (opts.onClose) opts.onClose();
    }
    function onKey(e) { if (e.key === 'Escape') close(); }
    document.addEventListener('keydown', onKey);
    ov.querySelector('.modal__close').addEventListener('click', close);
    ov.addEventListener('mousedown', function (e) { if (e.target === ov && opts.dismiss !== false) close(); });
    document.body.appendChild(ov);
    return { el: ov, close: close };
  }

  function confirmBox(title, text, onYes, opts) {
    opts = opts || {};
    var body = '<p style="color:var(--ink-2)">' + esc(text) + '</p>';
    var foot = '<button class="btn btn--ghost" data-act="no">Скасувати</button>' +
               '<button class="btn btn--accent" data-act="yes">' + esc(opts.yesLabel || 'Так') + '</button>';
    var m = modal(title, body, { footer: foot });
    m.el.querySelector('[data-act="no"]').addEventListener('click', m.close);
    m.el.querySelector('[data-act="yes"]').addEventListener('click', function () {
      m.close();
      onYes();
    });
  }

  /* Печать чека: открывает отдельное окно с чеком и вызывает print(). */
  function printReceipt(o) {
    var biz = { name: 'Forno Pizza', address: '', phone: '' };
    fetch('api/settings.php').then(function (r) { return r.json(); }).then(function (d) {
      if (d && d.business) {
        biz.name = d.business.name || biz.name;
        biz.address = d.business.address || '';
        biz.phone = d.business.phone || '';
      }
    }).catch(function () {}).then(function () {
      var lines = o.items || [];
      var rows = lines.map(function (l, i) {
        var n = String(l.name || '');
        var per = Number(l.price || 0);
        var q = Number(l.qty || 1);
        var tot = Number(l.total != null ? l.total : per * q);
        return (i + 1) + '. ' + n + '\n' +
          '   ' + q + ' x ' + money(per) + '  ' + pad(money(tot), 12);
      }).join('\n');
      var payInfo = payLabel(o.payment) + (o.pay_status === 'paid' ? '  [ОПЛАЧЕНО]' : '');
      var html = '<!doctype html><html><head><meta charset="utf-8"><title>Чек ' + esc(o.num) + '</title>' +
        '<style>body{font-family:ui-monospace,Consolas,monospace;font-size:13px;width:280px;margin:0 auto;padding:16px;color:#111;white-space:pre-wrap}' +
        '.c{text-align:center} hr{border:none;border-top:1px dashed #999;margin:8px 0}.t{display:flex;justify-content:space-between}</style></head><body>' +
        '<div class="c"><b>' + esc(biz.name) + '</b><br>' + esc(biz.address) + '<br>' + esc(biz.phone) + '</div>' +
        '<hr><div class="c">' + esc(o.num) + '   ' + esc((o.created_at || '').replace('T', ' ')) + '</div><hr>' +
        rows + '<hr>' +
        '<div class="t"><span>Підсумок</span><span>' + money(o.subtotal) + '</span></div>' +
        (o.discount ? '<div class="t"><span>Знижка</span><span>-' + money(o.discount) + '</span></div>' : '') +
        '<div class="t"><b>До сплати</b><b>' + money(o.total) + '</b></div><hr>' +
        '<div class="c">' + deliveryLabel(o.delivery_type) + ' | ' + payInfo + '</div>' +
        (o.address ? '<div class="c">' + esc(o.address) + '</div>' : '') +
        (o.comment ? '<div class="c">' + esc(o.comment) + '</div>' : '') +
        '<hr><div class="c">Дякуємо за замовлення!</div></body></html>';
      var w = window.open('', '_blank', 'width=340,height=640');
      if (!w) { toast('Дозвольте спливаючі вікна для друку чека', 'err'); return; }
      w.document.write(html);
      w.document.close();
      w.focus();
      setTimeout(function () { w.print(); }, 300);
    });
  }

  function pad(s, n) {
    s = String(s);
    while (s.length < n) s = ' ' + s;
    return s;
  }

  window.UI = {
    esc: esc,
    money: money,
    qty: qty,
    toast: toast,
    modal: modal,
    confirmBox: confirmBox,
    statusBadge: statusBadge,
    payLabel: payLabel,
    sourceLabel: sourceLabel,
    deliveryLabel: deliveryLabel,
    STATUS: STATUS_META,
    printReceipt: printReceipt,
  };
})();
