# Сессия: 2026-08-07 — Фикс «бесконечной загрузки» (спиннер) и падений модулей CRM

> Полный отчёт о проделанной работе, чтобы следующая сессия понимала контекст «от А до Я».
> Продолжать чтение после `PROJECT.md` (описание архитектуры) — этот файл описывает ТОЛЬКО последнюю сессию.

---

## 1. Контекст

- **Проект:** Forno Pizza CRM (см. `PROJECT.md`).
- **Стек:** PHP 8 + SQLite (OSPanel Apache), чистый JS (ES5-стиль) без фреймворков, единая точка входа `app.html` + модули в `js/modules/*.js`.
- **Расположение:** `C:\OSPanel\home\pizzarcm\`
- **Локальный URL:** `http://pizzarcm.local/` (корень → `login.html` по `DirectoryIndex`).
- **Тестовый логин:** `admin` / `admin-2026` (см. `api/config.php`).

### Как устроен интерфейс (важно для понимания)

- `app.html` подключает скрипты **со всеми версиями в query-строке** (`?v=N`) и содержит `<div id="view">` с placeholder-спиннером:
  ```html
  <div id="view">
    <div class="center-box"><div class="spinner"></div></div>
  </div>
  ```
- `js/app.js` — каркас: сессия → `init()` → роутер. Роутер создаёт `<section class="module" id="module-{id}">`, вставляет внутрь спиннер, и **один раз** вызывает `module.render(el)` (флаг `el.dataset.rendered`).
- Каждый модуль (`window.CRMModules.push({...})`) имеет `render(root)` + необязательные `load()`, `start()` (polling).
- Паттерн модуля (эталон): «спиннер → `load()` → построить страницу → `render()` → `start()` (таймер обновления)».

---

## 2. Что жаловался пользователь (симптомы)

1. **Касса (и не только): «бесконечная загрузка»** — `<div class="spinner"></div>` висит навсегда поверх страницы.
2. Ошибки в консоли браузера вида:
   - `Cannot set properties of undefined (setting 'innerHTML')` (в `orders.js` — `root` был `undefined`).
   - `Cannot read properties of null (reading 'querySelector')` (в `chat.js` / `audit.js` — `el` был `null`).
   - `Cannot set properties of null (setting 'innerHTML')` (в `kds.js` — `#kdsList` ещё не существовал).
3. Модуль **«Замовлення»** вообще не отображался (страница не строилась).

---

## 3. Корневые причины (найдены)

### A. Placeholder-спиннер в `#view` никогда не снимался
`app.js init()` **не удалял** стартовый `<div class="center-box"><div class="spinner">` из `#view`. Модули рендерили свой контент ПОД ним → поверх контента висел бесконечный спиннер.

### B. Модули вызывали DOM-функции до готовности DOM/`el`
Ошибка 1-го типа: **`load()` вызывал `render()` БЕЗ аргумента** (`render()` вместо `render(root)`).
- `orders.js` (старое поведение): `load()` звал `render()` → `render` начинался с `root.innerHTML = ...` при `root === undefined` → падение → catch → страница не строилась.

Ошибка 2-го типа: **`load()` обращался к `el`, пока он ещё не установлен** (модуль не делал `el = root` до вызова `load()`).
- `chat.js`: `load()` → `renderList()` → `el.querySelector('#chatList')` при `el === null` → падение.
- `audit.js`: `load()` → `renderRows()` → `el.querySelector('#auditBody')` при `el === null` → падение.

Ошибка 3-го типа: **`load()`/`render()` обращался к элементу, который ещё не создан в DOM**.
- `kds.js`: `load()` звал `render()` до `build()` → `el.querySelector('#kdsList')` возвращал `null` → `null.innerHTML` → падение.

### C. (Дополнительно, критично для пользователя) Кеш браузера + версии
См. раздел 6 — из-за этого даже после исправления кода спиннер продолжал «висеть».

---

## 4. Сделанные изменения (файл → правка)

### `js/app.js` — снятие placeholder-спиннера
В `init()` добавлено удаление стартового спиннера до создания модулей:
```js
var ph = view.querySelector('.center-box');
if (ph) ph.remove();
```
(строки 90–91 текущего файла).

### `js/modules/orders.js` — переписан порядок render/load
- `load()` больше НЕ вызывает `render()`; только обновляет состояние и, если `el` уже есть, перерисовывает список:
  ```js
  function load() {
    return API.get('api/orders.php?' + p).then(function (d) {
      state.orders = d.orders;
      if (el) renderList();
    });
  }
  ```
- `render(root)` стал безопасным: `if (root) el = root; if (!el) return;` и **строит страницу** (toolbar, фильтры, `#ordList`) — раньше он только обновлял список.
- `renderList()` имеет guard `if (!list) return;`.
- Модуль `render` (регистрация): `el = root;` ставится ДО `load()`.
- Итоговая цепочка: `render(root)` → спиннер → `load().then(() => { render(root); startPolling(); })`.

### `js/modules/kds.js` — правильный порядок build → render
- `load()` обновляет только данные и вызывает `render()` **только если** список уже построен:
  ```js
  if (el && el.querySelector('#kdsList')) render();
  ```
- `render()` (без аргумента) теперь **только перерисовывает** `#kdsList` (всегда существует после `build()`), а `build()` создаёт структуру страницы (page-head + `#kdsList` + обработчик клика).
- Итоговая цепочка: спиннер → `load().then(() => { build(); render(); start(); })`.

### `js/modules/chat.js` — `el = root` до `load()`
- В регистрации модуля добавлено `el = root;` первой строкой `render` (до `load()`), чтобы `renderList()`/`loadThread()` не падали на `null`.
- Сами функции уже были защищены guard'ами (`if (!list) return`, `if (!thread) return`).

### `js/modules/audit.js` — `el = root` до `load()`
- Аналогично чату: в `render` модуля добавлено `el = root;` до `load()`, чтобы `renderRows()` не падал на `null`.
- `renderRows()` уже имела guard `if (!body) return;`.

> Принцип, который теперь соблюдается во всех 12 модулях:
> 1) `el = root;` ставится ПЕРВЫМ в `render`; 2) `load()` не должен трогать DOM до готовности структуры — либо guard `if (el && ...)`, либо построение в `.then()`.

### `app.html` — бамп версий (см. раздел 6)

---

## 5. Проверка (как я убедился, что работает)

### Инструмент: headless Chrome через CDP (Node-скрипт)
Писал временный скрипт `cdp_all.js` (запуск Chrome: `--headless=new --remote-debugging-port`), который:
1. Входил в систему через `fetch('api/auth.php')` с CSRF (admin/admin-2026).
2. Переходил на `app.html`.
3. Проходил по всем 12 модулям (`location.hash = '#/orders'` и т.д.).
4. Для каждого модуля проверял: есть ли `.module.is-active`, спиннер `.spinner`, `h1`, длину контента.
5. Собирал события `Runtime.exceptionThrown` и `Network.responseReceived` с HTTP ≥ 400.

Команды: `node --check` для каждого правленого JS + запуск CDP-скрипта.

### Результаты до фиксов chat/audit
```
MODULE chat  {"len":81,"hasH1":false}   ← показывалась ошибка, не модуль
MODULE audit {"len":81,"hasH1":false}   ← то же
```
Остальные (pos, orders, menu, stock, clients, kds, reports, discounts, users, settings) — ok.

### Результаты ПОСЛЕ фиксов chat/audit (финал)
```
LOGIN: login:200
AFTER LOGIN: {"spin":false,"pos":true}
MODULE pos      {"spin":false,"len":2435,"hasH1":true}
MODULE orders   {"spin":false,"len":12665,"hasH1":true}
MODULE menu     {"spin":false,"len":4887,"hasH1":true}
MODULE stock    {"spin":false,"len":9861,"hasH1":true}
MODULE clients  {"spin":false,"len":1555,"hasH1":true}
MODULE kds      {"spin":false,"len":2190,"hasH1":true}
MODULE chat     {"spin":false,"len":2258,"hasH1":true}
MODULE reports  {"spin":false,"len":6708,"hasH1":true}
MODULE discounts{"spin":false,"len":890,"hasH1":true}
MODULE users    {"spin":false,"len":721,"hasH1":true}
MODULE settings {"spin":false,"len":2463,"hasH1":true}
MODULE audit    {"spin":false,"len":8667,"hasH1":true}
=== EVENTS ===  (none)   ← нет исключений и HTTP>=400
```

### HTTP-проверка (что реально отдаёт сервер)
`curl http://pizzarcm.local/js/app.js` → содержит `ph.remove()` (фикс на сервере).

---

## 6. КЕШ И ВЕРСИИ (критично, не повторять ошибку!)

### Как устроен кеш
- `C:\OSPanel\home\pizzarcm\.htaccess` (строки 30–35):
  ```apache
  ExpiresByType text/css              "access plus 1 month"
  ExpiresByType application/javascript "access plus 7 days"
  ```
- **HTML НЕ кешируется** (в списке только CSS и JS) → `app.html` при обычном F5 перезагружается и подтягивает свежие версии скриптов.
- **JS кешируется на 7 дней** → если содержимое файла изменилось, а `?v=` не изменён, браузер отдаёт СТАРУЮ версию из кеша.

### Ошибка, допущенная в сессии
Сначала я поднял версии модулей `?v=1 → ?v=2` и `app.js` остался `?v=3`. Но потом **правил `app.js`, `chat.js`, `audit.js` уже после бампа** — версии не изменились. У пользователя браузер держал в кеше старый `app.js?v=3` (без фикса снятия спиннера) → «всё равно бесконечная загрузка», хотя код на сервере уже был исправлен.

### Решение
Поднял ВСЕ версии JS заново в `app.html` (текущее состояние):
```html
js/api.js?v=3
js/ui.js?v=3
js/modules/pos.js?v=3        js/modules/chat.js?v=3
js/modules/orders.js?v=3     js/modules/reports.js?v=3
js/modules/menu.js?v=3       js/modules/discounts.js?v=3
js/modules/stock.js?v=3      js/modules/users.js?v=3
js/modules/clients.js?v=3    js/modules/settings.js?v=3
js/modules/kds.js?v=3        js/modules/audit.js?v=3
js/app.js?v=4
```
Теперь у браузера нет закешированного URL — при любом рефреше скачаются свежие файлы.

### Правило на будущее
> **После любого изменения JS файла — ОБЯЗАТЕЛЬНО поднять его `?v=` в `app.html`.** Иначе пользователь продолжит видеть старую версию (кеш 7 дней). Изменение версии — неотъемлемая часть правки JS в этом проекте.

### Что должен сделать пользователь
Простой **F5** (HTML не кешируется → подтянет новые URL). Если вдруг нет — `Ctrl+F5`.

---

## 7. Финальное состояние правленых файлов (что проверять в будущем)

- `js/app.js` — `init()` удаляет placeholder (строки 90–91); роутер и навигация не менялись.
- `js/modules/orders.js` — новый порядок: `load()` (только данные) → `render(root)` (строит страницу) → `startPolling()`; guard `if (el) renderList()`.
- `js/modules/kds.js` — `load()` → `build()` → `render()`; guard `if (el && el.querySelector('#kdsList')) render()`.
- `js/modules/chat.js` — `el = root;` первым в `render` модуля.
- `js/modules/audit.js` — `el = root;` первым в `render` модуля.
- `app.html` — версии: модули/api/ui `?v=3`, `app.js?v=4`.

---

## 8. Что проверено / что НЕ проверено

✅ Логин, рендер всех 12 модулей, отсутствие спиннеров, отсутствие JS-исключений, отсутствие HTTP≥400.

⚠️ НЕ покрыто длительными тестами (работает, но проверено только рендером):
- Живой polling (таймеры модулей): orders 15 с, kds 10 с, chat 12 с (проверяется только флаг `is-active`).
- Полные действия: создание заказа в кассе, смена статуса, KDS-кнопки, печать чека, чат (send/read), аудит-фильтры, складские операции.
- Авторизация под ролями cashier/cook/courier (видимость модулей, переходы статусов).

Если в следующей сессии нужно глубже проверить — расширить CDP-скрипт: ждать N секунд на модуле (чтобы сработал polling), кликать кнопки, проверять тосты/сетки.

---

## 9. Быстрые команды для следующей сессии

```powershell
# Проверка синтаксиса правленых JS
node --check "C:\OSPanel\home\pizzacrm\js\app.js"
node --check "C:\OSPanel\home\pizzacrm\js\modules\orders.js"
node --check "C:\OSPanel\home\pizzacrm\js\modules\kds.js"
node --check "C:\OSPanel\home\pizzacrm\js\modules\chat.js"
node --check "C:\OSPanel\home\pizzacrm\js\modules\audit.js"

# Проверка, что сервер отдаёт исправленный app.js
curl.exe -s "http://pizzarcm.local/js/app.js" | Select-String "ph.remove"

# Проверка версий в app.html
curl.exe -s "http://pizzarcm.local/app.html" | Select-String -Pattern "js/"
```

---

## 10. Полезные факты

- Модули регистрируются в `window.CRMModules` до загрузки `app.js` (порядок подключения в `app.html` важен: сначала api.js/ui.js, потом модули, потом app.js).
- `UI.STATUS`, `UI.statusBadge`, `UI.money`, `UI.esc`, `UI.toast`, `UI.printReceipt` — утилиты из `js/ui.js`.
- `API.get/post`, `API.state`, `API.loadSession` — из `js/api.js`.
- Временный диагностический скрипт `cdp_all.js` был удалён после проверки (лежал в `%TEMP%\opencode\`).
