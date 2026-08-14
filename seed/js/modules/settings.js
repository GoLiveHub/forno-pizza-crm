/* Модуль: Налаштування */
(function () {
  'use strict';

  var el = null;
  var state = {};

  function load() {
    return API.get('api/settings.php').then(function (d) {
      state.business = d.business;
      state.telegram = d.telegram;
      state.currency = d.currency || 'uah';
      state.rate = Number(d.rate) || 1.84;
      render();
    });
  }

  function render(root) {
    if (root) el = root;
    if (!el) return;
    var b = state.business;
    var tg = state.telegram;
    el.innerHTML =
      '<div class="page-head"><div><h1>Налаштування</h1><p class="hint">Заклад, доставка, повідомлення</p></div></div>' +

      '<div class="card" style="padding:20px;margin-bottom:16px">' +
        '<h3 style="margin-bottom:16px">Заклад</h3>' +
        '<div class="grid grid--3">' +
          '<div class="field"><label>Назва</label><input id="bName" maxlength="60" value="' + UI.esc(b.name) + '"></div>' +
          '<div class="field"><label>Адреса</label><input id="bAddr" maxlength="200" value="' + UI.esc(b.address) + '"></div>' +
          '<div class="field"><label>Телефон</label><input id="bPhone" maxlength="20" value="' + UI.esc(b.phone) + '"></div>' +
        '</div>' +
        '<button class="btn btn--accent" data-save="business" type="button">Зберегти заклад</button>' +
        '<div class="field__err" id="errBusiness"></div>' +
      '</div>' +

      '<div class="card" style="padding:20px;margin-bottom:16px">' +
        '<h3 style="margin-bottom:16px">Доставка та самовивіз</h3>' +
        '<div class="grid grid--2">' +
          '<div class="field"><label>Години самовивозу</label><input id="dPickup" maxlength="40" value="' + UI.esc(b.pickup_hours) + '"></div>' +
          '<div class="field"><label>Години доставки</label><input id="dDelivery" maxlength="40" value="' + UI.esc(b.delivery_hours) + '"></div>' +
        '</div>' +
        '<button class="btn btn--accent" data-save="delivery" type="button">Зберегти доставку</button>' +
        '<div class="field__err" id="errDelivery"></div>' +
      '</div>' +

      '<div class="card" style="padding:20px;margin-bottom:16px">' +
        '<h3 style="margin-bottom:16px">Telegram-повідомлення</h3>' +
        '<p class="hint" style="margin-bottom:12px">Сповіщення про нові замовлення у бота. Створіть бота через @BotFather і вкажіть токен.</p>' +
        '<div class="grid grid--2">' +
          '<div class="field"><label>Chat ID (адміністратора/групи)</label><input id="tgChat" maxlength="40" value="' + UI.esc(tg.chat_id) + '" placeholder="-100123456789"></div>' +
          '<div class="field"><label>Токен бота' + (tg.has_token ? ' (поточний: ' + UI.esc(tg.token_masked) + ')' : '') + '</label>' +
            '<input id="tgToken" maxlength="80" placeholder="123456:ABC-DEF..."></div>' +
        '</div>' +
        (tg.has_token ? '<label style="display:flex;gap:8px;align-items:center;margin-bottom:12px"><input type="checkbox" id="tgClear" style="width:auto"> Очистити токен</label>' : '') +
        '<button class="btn btn--accent" data-save="telegram" type="button">Зберегти Telegram</button>' +
        '<div class="field__err" id="errTelegram"></div>' +
      '</div>' +

      '<div class="card" style="padding:20px">' +
        '<h3 style="margin-bottom:16px">Вигляд та валюта</h3>' +
        '<div class="grid grid--3">' +
          '<div class="field"><label>Тема</label><select id="themeSel2">' +
            '<option value="light"' + (savedTheme() === 'light' ? ' selected' : '') + '>Світла</option>' +
            '<option value="dark"' + (savedTheme() === 'dark' ? ' selected' : '') + '>Темна</option>' +
            '<option value="system"' + (savedTheme() === 'system' ? ' selected' : '') + '>Як у системі</option>' +
          '</select></div>' +
          '<div class="field"><label>Валюта цін</label><select id="curSel">' +
            '<option value="uah"' + (state.currency === 'uah' ? ' selected' : '') + '>Гривня (грн)</option>' +
            '<option value="rub"' + (state.currency === 'rub' ? ' selected' : '') + '>Рубль (руб)</option>' +
          '</select></div>' +
          '<div class="field"><label>Курс рубля за 1 грн</label><input id="curRate" type="number" step="0.01" min="0.01" value="' + state.rate + '"></div>' +
        '</div>' +
        '<button class="btn btn--accent" data-save="currency" type="button">Зберегти вигляд</button>' +
        '<div class="field__err" id="errCurrency"></div>' +
      '</div>' +

      '<div class="card" style="padding:20px;margin-top:16px">' +
        '<h3 style="margin-bottom:16px">Безпека</h3>' +
        '<p class="hint" style="margin-bottom:12px">Зміна власного пароля.</p>' +
        '<div class="grid grid--3">' +
          '<div class="field"><label>Поточний пароль</label><input id="pwOld" type="password"></div>' +
          '<div class="field"><label>Новий пароль</label><input id="pwNew" type="password" minlength="6"></div>' +
          '<div style="display:flex;align-items:flex-end"><button class="btn" data-save="password" type="button">Змінити пароль</button></div>' +
        '</div>' +
        '<div class="field__err" id="errPassword"></div>' +
      '</div>';

    function savedTheme() { return localStorage.getItem('crm_theme') || 'light'; }
    function applyTheme(t) {
      var mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
      var dark = t === 'dark' || (t === 'system' && mq && mq.matches);
      document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    }

    el.addEventListener('click', function (e) {
      var t = e.target.closest('[data-save]');
      if (!t || !el.contains(t)) return;
      if (t.dataset.save === 'theme') { return; }
      save(t.dataset.save);
    });
    el.addEventListener('change', function (e) {
      if (e.target && e.target.id === 'themeSel2') {
        localStorage.setItem('crm_theme', e.target.value);
        applyTheme(e.target.value);
      }
    });
    applyTheme(savedTheme());
  }

  function save(kind) {
    var errEl = el.querySelector('#err' + (kind === 'business' ? 'Business' : kind === 'delivery' ? 'Delivery' : kind === 'telegram' ? 'Telegram' : kind === 'currency' ? 'Currency' : 'Password'));
    var req;
    if (kind === 'business') {
      req = API.post('api/settings.php', { action: 'save_business', name: el.querySelector('#bName').value, address: el.querySelector('#bAddr').value, phone: el.querySelector('#bPhone').value });
    } else if (kind === 'delivery') {
      req = API.post('api/settings.php', { action: 'save_delivery', pickup_hours: el.querySelector('#dPickup').value, delivery_hours: el.querySelector('#dDelivery').value });
    } else if (kind === 'telegram') {
      req = API.post('api/settings.php', { action: 'save_telegram', chat_id: el.querySelector('#tgChat').value, token: el.querySelector('#tgToken').value, clear_token: !!(el.querySelector('#tgClear') && el.querySelector('#tgClear').checked) });
    } else if (kind === 'currency') {
      req = API.post('api/settings.php', {
        action: 'save_currency',
        currency: el.querySelector('#curSel').value,
        rate: el.querySelector('#curRate').value,
      }).then(function () {
        localStorage.setItem('crm_curr', el.querySelector('#curSel').value);
        UI.toast('Збережено. Оновлюємо ціни…', 'ok');
        setTimeout(function () { window.location.reload(); }, 600);
      });
    } else {
      req = API.post('api/auth.php', { action: 'change_password', old: el.querySelector('#pwOld').value, new: el.querySelector('#pwNew').value });
    }
    if (kind === 'currency') return;
    req.then(function () {
      UI.toast('Збережено', 'ok');
      if (kind === 'password') { el.querySelector('#pwOld').value = ''; el.querySelector('#pwNew').value = ''; }
      else load();
    }).catch(function (e) {
      if (errEl) errEl.textContent = e.message;
    });
  }

  window.CRMModules = window.CRMModules || [];
  window.CRMModules.push({
    id: 'settings',
    title: 'Налаштування',
    group: 'system',
    roles: ['admin', 'owner'],
    render: function (root) {
      root.innerHTML = '<div class="center-box"><div class="spinner"></div></div>';
      load().then(function () { render(root); }).catch(function (e) {
        root.innerHTML = '<div class="empty">' + UI.esc(e.message) + '</div>';
      });
    },
  });
})();
