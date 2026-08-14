/* Каркас приложения: авторизация, навигация по ролям, роутер модулей. */
(function () {
  'use strict';

  var MODULES = window.CRMModules || [];
  var state = API.state;
  var nav, topTitle, userName, userRole, view, sidebar, overlay, burger;

  var GROUPS = [
    { id: 'sales', label: 'Продажі' },
    { id: 'manage', label: 'Керування' },
    { id: 'staff', label: 'Персонал' },
    { id: 'analytics', label: 'Аналітика' },
    { id: 'system', label: 'Система' },
  ];

  function visibleModules() {
    return MODULES.filter(function (m) {
      return !m.roles || m.roles.indexOf(state.user.role) !== -1;
    });
  }

  function buildNav(activeId) {
    nav.innerHTML = '';
    GROUPS.forEach(function (g) {
      var items = visibleModules().filter(function (m) { return m.group === g.id; });
      if (!items.length) return;
      var label = document.createElement('div');
      label.className = 'nav__label';
      label.textContent = g.label;
      nav.appendChild(label);
      items.forEach(function (m) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'nav__item' + (m.id === activeId ? ' is-active' : '');
        b.dataset.module = m.id;
        b.textContent = m.title;
        b.addEventListener('click', function () { window.location.hash = '#/' + m.id; });
        nav.appendChild(b);
      });
    });
  }

  function renderModule(id) {
    var m = MODULES.filter(function (x) { return x.id === id; })[0];
    if (!m) return false;
    if (m.roles && m.roles.indexOf(state.user.role) === -1) return false;

    topTitle.textContent = m.title;
    buildNav(id);
    closeSidebar();

    var el = document.getElementById('module-' + id);
    if (!el) {
      el = document.createElement('section');
      el.className = 'module';
      el.id = 'module-' + id;
      el.innerHTML = '<div class="center-box"><div class="spinner"></div></div>';
      view.appendChild(el);
    }
    document.querySelectorAll('.module.is-active').forEach(function (x) { x.classList.remove('is-active'); });
    el.classList.add('is-active');
    if (!el.dataset.rendered) {
      el.dataset.rendered = '1';
      if (m.render) m.render(el);
    }
    if (m.onEnter) m.onEnter(el);
    return true;
  }

  function defaultModule() {
    var byRole = {
      admin: 'dashboard', owner: 'dashboard', manager: 'dashboard', cashier: 'dashboard',
      cook: 'kds', support: 'orders', courier: 'orders',
    };
    var want = byRole[state.user.role];
    if (want && visibleModules().some(function (m) { return m.id === want; })) return want;
    var first = visibleModules()[0];
    return first ? first.id : '';
  }

  function route() {
    var id = (window.location.hash || '').replace(/^#\//, '') || defaultModule();
    if (!renderModule(id)) {
      var first = visibleModules()[0];
      if (first) window.location.hash = '#/' + first.id;
    }
  }

  function closeSidebar() {
    sidebar.classList.remove('is-open');
    overlay.classList.remove('is-open');
  }

  function init() {
    nav = document.getElementById('nav');
    topTitle = document.getElementById('topTitle');
    userName = document.getElementById('userName');
    userRole = document.getElementById('userRole');
    view = document.getElementById('view');
    var ph = view.querySelector('.center-box');
    if (ph) ph.remove();
    sidebar = document.getElementById('sidebar');
    overlay = document.getElementById('sidebarOverlay');
    burger = document.getElementById('burger');

    burger.addEventListener('click', function () {
      sidebar.classList.toggle('is-open');
      overlay.classList.toggle('is-open');
    });
    overlay.addEventListener('click', closeSidebar);
    document.getElementById('logout').addEventListener('click', function () {
      API.post('api/auth.php', { action: 'logout' }).then(function () {
        window.location.href = 'login.html';
      });
    });

    var tick = function () {
      var d = new Date();
      var el = document.getElementById('topDate');
      if (el) el.textContent = d.toLocaleDateString(window.I18N ? I18N.locale() : 'uk-UA', { day: 'numeric', month: 'long', weekday: 'long' });
    };
    tick();
    setInterval(tick, 30000);
    if (window.I18N) I18N.onchange = function () { tick(); };

    /* Валюту и тему из localStorage/настроек */
    var themeSel = document.getElementById('themeSelect');
    var currSel = document.getElementById('currSelect');
    var savedTheme = localStorage.getItem('crm_theme') || 'light';
    function applyTheme(t) {
      var mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
      var dark = t === 'dark' || (t === 'system' && mq && mq.matches);
      document.documentElement.dataset.theme = dark ? 'dark' : 'light';
      if (themeSel) themeSel.value = t;
    }
    applyTheme(savedTheme);
    if (themeSel) themeSel.addEventListener('change', function () {
      localStorage.setItem('crm_theme', themeSel.value);
      applyTheme(themeSel.value);
    });

    window.CURR = { code: localStorage.getItem('crm_curr') || 'uah', rate: 1.84 };
    API.get('api/settings.php').then(function (d) {
      window.CURR.rate = Number(d.rate) || 1.84;
      window.CURR.code = localStorage.getItem('crm_curr') || d.currency || 'uah';
      if (currSel) currSel.value = window.CURR.code;
    }).catch(function () {
      if (currSel) currSel.value = window.CURR.code;
    });
    if (currSel) currSel.addEventListener('change', function () {
      localStorage.setItem('crm_curr', currSel.value);
      window.CURR.code = currSel.value;
      window.location.reload();
    });

    window.addEventListener('hashchange', route);
    route();
  }

  API.loadSession().then(function () {
    if (!API.state.authed) { window.location.href = 'login.html'; return; }
    init();
    var rmap = { owner: 'Владелец', admin: 'Администратор', manager: 'Менеджер', cashier: 'Кассир', support: 'Оператор поддержки', cook: 'Повар', courier: 'Курьер' };
    var roleWords = ['владелец', 'администратор', 'менеджер', 'кассир', 'оператор поддержки', 'повар', 'курьер', 'власник', 'адміністратор', 'касир', 'оператор підтримки', 'кухар', 'кур\'єр'];
    userName.textContent = API.state.user.name || API.state.user.username;
    var roleTxt = rmap[API.state.user.role] || API.state.user.role;
    var nm = userName.textContent.trim();
    userRole.textContent = nm && roleWords.indexOf(nm.toLowerCase()) !== -1 ? '' : roleTxt;
  }).catch(function () {
    window.location.href = 'login.html';
  });
})();
