/*! i18n — UA <-> RU runtime dictionary + language toggle */
(function (global, document) {
  'use strict';

  var LS_KEY = 'ui_lang';

  var PAIRS = /*__PAIRS__*/;

  var PARTIALS = /*__PARTIALS__*/;

  var lang = 'uk';
  try {
    var saved = global.localStorage.getItem(LS_KEY);
    if (saved === 'ru' || saved === 'uk') lang = saved;
  } catch (e) {}

  function norm(s) { return String(s).replace(/\s+/g, ' ').trim(); }

  var ua2ru = {}, ru2ua = {};
  (function () {
    for (var i = 0; i < PAIRS.length; i++) {
      var u = norm(PAIRS[i][0]), r = norm(PAIRS[i][1]);
      if (!u || !r || u === r) continue;
      if (!(u in ua2ru)) ua2ru[u] = r;
      if (!(r in ru2ua)) ru2ua[r] = u;
    }
  })();

  var DIR = { ru: [], uk: [] };
  (function () {
    for (var i = 0; i < PARTIALS.length; i++) {
      DIR.ru.push([PARTIALS[i][0], PARTIALS[i][1]]);
      DIR.uk.push([PARTIALS[i][1], PARTIALS[i][0]]);
    }
  })();

  function translate(s) {
    if (typeof s !== 'string' || !s) return s;
    var n = norm(s);
    var hit = lang === 'ru' ? ua2ru[n] : ru2ua[n];
    if (hit) {
      var lead = /^\s*/.exec(s)[0];
      var trail = /\s*$/.exec(s)[0];
      return lead + hit + trail;
    }
    var ps = lang === 'ru' ? DIR.ru : DIR.uk;
    var i, j, p, at, inside;
    var fromRanges = [];
    for (i = 0; i < ps.length; i++) {
      var f = ps[i][0];
      if (!f) continue;
      at = s.indexOf(f);
      while (at !== -1) {
        fromRanges.push([at, at + f.length]);
        at = s.indexOf(f, at + f.length);
      }
    }
    var protect = [];
    var map = {};
    var tNo = 0;
    var order = [];
    for (i = 0; i < ps.length; i++) order.push(i);
    order.sort(function (a, b) { return ps[b][1].length - ps[a][1].length; });
    for (i = 0; i < order.length; i++) {
      var t = ps[order[i]][1];
      if (!t) continue;
      p = s.indexOf(t);
      while (p !== -1) {
        inside = false;
        for (j = 0; j < fromRanges.length; j++) {
          if (fromRanges[j][0] <= p && p + t.length <= fromRanges[j][1] && fromRanges[j][1] > fromRanges[j][0]) { inside = true; break; }
        }
        if (!inside) {
          for (j = 0; j < protect.length; j++) {
            if (!(p + t.length <= protect[j][0] || p >= protect[j][1])) { inside = true; break; }
          }
        }
        if (!inside) {
          var tok = '\u0001t' + (tNo++) + '\u0001';
          protect.push([p, p + t.length, tok]);
          map[tok] = t;
        }
        p = s.indexOf(t, p + t.length);
      }
    }
    if (protect.length) {
      protect.sort(function (a, b) { return a[0] - b[0]; });
      var out = '';
      var pos = 0;
      var pi = 0;
      while (pos < s.length) {
        if (pi < protect.length && protect[pi][0] === pos) {
          out += protect[pi][2];
          pos = protect[pi][1];
          pi++;
        } else {
          out += s.charAt(pos);
          pos++;
        }
      }
      s = out;
    }
    for (i = 0; i < ps.length; i++) {
      var fr = ps[i][0];
      if (fr && s.indexOf(fr) !== -1) s = s.split(fr).join(ps[i][1]);
    }
    for (var tk in map) s = s.split(tk).join(map[tk]);
    return s;
  }

  var ATTRS = ['placeholder', 'title', 'aria-label', 'alt'];

  var OBS_CFG = { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS };
  var obs = null;

  function apply(root) {
    root = root || document.body || document.documentElement;
    if (!root) return;
    if (obs) { try { obs.disconnect(); } catch (e) {} }
    var walker;
    try { walker = document.createTreeWalker(root, 4, null, false); } catch (e) { if (obs) { try { obs.observe(document.body, OBS_CFG); } catch (e2) {} } return; }
    var nodes = [], n;
    while ((n = walker.nextNode())) {
      if (n.parentNode && n.parentNode.hasAttribute && n.parentNode.hasAttribute('data-i18n-skip')) continue;
      nodes.push(n);
    }
    for (var i = 0; i < nodes.length; i++) {
      var v = nodes[i].nodeValue;
      if (v == null) continue;
      var nv = translate(v);
      if (nv !== v) nodes[i].nodeValue = nv;
    }
    var els = root.querySelectorAll ? root.querySelectorAll('*') : [];
    for (var j = 0; j < els.length; j++) {
      var el = els[j];
      for (var k = 0; k < ATTRS.length; k++) {
        var a = ATTRS[k];
        if (el.hasAttribute(a)) {
          var av = el.getAttribute(a);
          var anv = translate(av);
          if (anv !== av) el.setAttribute(a, anv);
        }
      }
    }
    if (obs) { try { obs.observe(document.body, OBS_CFG); } catch (e) {} }
  }

  var timer = null;
  function onMutations() {
    if (timer) return;
    timer = global.setTimeout(function () {
      timer = null;
      apply();
    }, 0);
  }

  function makeToggle() {
    var wrap = document.createElement('div');
    wrap.className = 'i18n-switch';
    wrap.setAttribute('role', 'group');
    wrap.setAttribute('aria-label', 'Мова / Язык');
    wrap.style.cssText = 'position:fixed;z-index:2147483000;top:72px;right:14px;display:inline-flex;border:1px solid rgba(120,120,120,.45);border-radius:999px;background:rgba(255,255,255,.95);box-shadow:0 1px 5px rgba(0,0,0,.18);overflow:hidden;vertical-align:middle;';
    function seg(code, label, active) {
      var b = document.createElement('button');
      b.type = 'button';
      b.textContent = label;
      b.style.cssText = 'border:0;background:transparent;color:#333;padding:5px 12px;font:600 12px/1.2 system-ui,Arial,sans-serif;cursor:pointer;letter-spacing:.03em;' + (active ? 'background:rgba(225,37,27,.92);color:#fff;' : '');
      b.addEventListener('click', function () {
        if (lang === code) return;
        lang = code;
        try { global.localStorage.setItem(LS_KEY, lang); } catch (e) {}
        if (document.documentElement) document.documentElement.setAttribute('lang', lang);
        replaceToggle();
        apply();
        if (global.I18N && typeof global.I18N.onchange === 'function') global.I18N.onchange(lang);
      });
      wrap.appendChild(b);
    }
    seg('uk', 'УКР', lang === 'uk');
    seg('ru', 'РУС', lang === 'ru');
    return wrap;
  }

  function insertToggle() {
    var w = makeToggle();
    document.body.appendChild(w);
  }

  function replaceToggle() {
    var old = document.querySelector('.i18n-switch');
    var w = makeToggle();
    document.body.appendChild(w);
    if (old && old.parentNode) old.remove();
  }

  function start() {
    if (!document.body) {
      document.addEventListener('DOMContentLoaded', start);
      return;
    }
    if (document.documentElement) document.documentElement.setAttribute('lang', lang);
    insertToggle();
    apply();
    if (global.MutationObserver) {
      try {
        obs = new MutationObserver(onMutations);
        obs.observe(document.body, OBS_CFG);
      } catch (e) {}
    }
  }

  function setLang(l) {
    if (l !== 'ru' && l !== 'uk') return;
    lang = l;
    try { global.localStorage.setItem(LS_KEY, lang); } catch (e) {}
    if (document.documentElement) document.documentElement.setAttribute('lang', lang);
    apply();
    if (global.I18N && typeof global.I18N.onchange === 'function') global.I18N.onchange(lang);
  }

  var api = {
    getLang: function () { return lang; },
    t: translate,
    apply: apply,
    setLang: setLang,
    locale: function () { return lang === 'ru' ? 'ru-RU' : 'uk-UA'; }
  };
  try { Object.defineProperty(api, 'lang', { get: function () { return lang; } }); } catch (e) { api.lang = lang; }

  global.I18N = api;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})(window, document);
