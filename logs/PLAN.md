# Карта состояния проекта по этапам ТЗ

> Обновлено: 2026-08-09. Источник требований: `logs/TZ.md`. Статус по результатам аудита кода и БД.
| # | Этап (ТЗ §6) | Статус | Комментарий (что есть / чего нет) |
|---|--------------|--------|------------------------------------|
| 1 | Восстановить чистую версию | ✅ не требуется | Правки локализации не меняли CSS-классы/id/структуру; дизайн не ломался. Откат не нужен. |
| 2 | Локализация | ✅ СДЕЛАНО | Словарь 760 пар + 80 partials, runtime `apply()`, переключатель, дата, блюда. Отчёт: `WORK_SESSION_2026-08-08.md`. |
| 3 | Полный цикл заказа | ✅ СДЕЛАНО | Статусы `new/cooking/done/cancelled` (+`delivering` в UI), нумерация `F-0016`, промокоды, чек, кнопка «Підтвердити» для сайт-заказов, отмена с обязательной причиной (select, `reason` в БД), баннер «Завислі замовлення» (доставка >20 мин), редактирование позиций до готовки (`edit_items`, только `status='new'` для admin/cashier). Нет: автоназначения курьера (Этап 8). Отчёт: `logs/TEST_REPORT.md`. |
| 4 | KDS отдельная страница | ✅ СДЕЛАНО | `kds.html` + `css/kds.css` + `js/kds.js` (тёмная тема, 3 колонки, таймеры, звук Web Audio, flash, гейт ролей cook/admin, polling 3 с, done>30мин скрываются). Использует существующие `api/orders.php`/`api/kds.php`. Отчёт: `logs/TEST_REPORT.md`, дифф: `logs/diffs/kds_2026-08-08.txt`. |
| 5 | Интеграция сайта и CRM | ✅ есть | `api/order_in.php` (X-Site-Key, rate limit), статус `new`, КДС; трекинг на сайте. Требует проверки в сквозном сценарии. |
| 6 | Кастомизация пиццы | ✅ СДЕЛАНО | Размер 30/40 см (`price40`), типы теста (`dough_types`), убрать ингредиенты из рецепта (бесплатно), добавить топпинги с доплатой (`menu_toppings` + `ingredients.topping_price`). Реализовано в POS (`js/modules/pos.js`), на сайте (`site/js/app.js`), бэке (`orders_core.php` — `crm_build_lines`/`crm_parse_options`/`crm_line_price`, списание ×40/30, возврат при отмене), меню (`api/menu.php`), менеджмент в `app.html#/menu`. Отчёт: `logs/TEST_REPORT.md`. |
| 7 | Роли manager/support/owner + вход с выбором роли | ✅ СДЕЛАНО | Роли `admin/cashier/cook/courier/manager/support/owner` (таблица `users.role`). Права в `api/orders.php`, `pos.php`, `menu.php`, `stock.php`, `clients.php`, `reports.php`, `users.php`, `settings.php`, `audit.php`, `chat.php`, `kds.php`, `discounts.php`. Гейты модулей в `js/modules/*.js` + `app.js` (rmap), дефолтные маршруты (cook→kds, support/courier→orders). Демо-вход с выбором роли на `login.html` (7 кнопок, `css/auth-roles.css`), демо-юзеры всех ролей в `crm_seed()`. Защита владельца: роль owner выдаёт только admin/owner. Переводы ролей в словаре. Smoke: 50/50. |
| 8 | Модуль курьеров | ✅ СДЕЛАНО | Автоназначение курьера (round-robin) при переходе в `delivering` (`api/orders.php`), `courier: {id,name}` в API, фильтр заказов курьера по `courier_id`, бейдж «Моє замовлення» + кнопка «Звук» в UI, время `delivering_at` фиксируется. Раздел «Кур'єри» (`api/couriers.php` + `js/modules/couriers.js` + `css/couriers.css`): карточки курьеров со статусом вільний/зайнятий и активными заказами, авто-обновление 15 с. Выбор курьера кассиром в POS (селект `#ckCourier` в режиме доставки: «Автоматично»/конкретный курьер, свободные первыми, статус в скобках; `courier_id` в `payload`). Валидация активного курьера при создании заказа. Демо-курьеры `courier`/`courier2`. Smoke: 78/78 ALL OK. Отчёт: `logs/TEST_REPORT.md`. |
| 9 | Дашборд и отчёты | ✅ СДЕЛАНО | Дашборд после входа (`api/dashboard.php` + `js/modules/dashboard.js` + `css/dashboard.css`): выручка сегодня/неделя/месяц, активные заказы по статусам, заказы по часам (30 дней), ТОП-5 блюд, доставка/самовывоз/на місці, среднее время готовки (из audit cooking→done), эффективность курьеров (кол-во доставок + среднее время). Дефолтный маршрут по роли (`app.js`: admin/owner/manager/cashier → dashboard, cook → kds, support/courier → orders). Отчёты за период — существующий `api/reports.php` + модуль reports (выручка, топ, статусы, часы, динамика). Smoke: 118/118 ALL OK. Отчёт: `logs/TEST_REPORT.md`. |
| 10 | Склад и списание | ✅ есть | `ingredients/recipes/stock_movements`; списание/возврат в `orders_core.php`. |
| 11 | Чат поддержки | ✅ есть | Таблица `chat`, модуль CRM, чат на сайте (polling). |
| 12 | Полировка UI/UX | ✅ СДЕЛАНО | Новый `css/polish.css` (подключён в app/login/kds): адаптив ≤700px (стеки сеток, модалки/тосты на всю ширину), анимации hover + `card-in`, `prefers-reduced-motion`, скроллбары, focus-ринг с клавиатуры, `.table-wrap`. KDS тёмная тема уже была (`kds.css`), добавлен адаптив 1-колонки + тач-кнопки 44px. Исправлен заголовок дашборда («Середня тривалість приготування» вместо искажённого «Середній година приготування»). Smoke: 118/118 ALL OK; CDP desktop 1440 / mobile 390 без переполнения. Бэкап: `backup/backup_2026-08-09/`. Отчёт: `logs/TEST_REPORT.md`, `logs/FINAL_REPORT.md`. |

## Фактическое состояние данных (демо)

- Заказы: 21 (статусы done/cancelled; доставка / самовывоз / на місці; оплата cash).
- Меню: 9 позиций, 3 категории (Піца, Напої, Десерти); у пицц есть `price40` (×1.5 от базовой), напитки/десерты — без 40 см.
- Тесто: 2 типа (`thin` Тонке / `fluffy` Пишне). Топпинги: `menu_toppings` (пиццы 1-6) + `ingredients.topping_price`.
- Промокоды: 1 (`WELCOME10`, percent 20%, min_total 500).
- Клиенты: 8. Ингредиенты: 18, рецепты: 29. Пользователи: 9 (admin, owner, manager, support, cashier, cook, courier + тестовые cook_smoke/cashier_smoke).
- Таблицы: audit, categories, chat, clients, dough_types, ingredients, login_attempts, menu_items, menu_toppings, order_items, orders, promocodes, recipes, settings, stock_movements, users.
- `migrate.php` — отсутствует (авто-миграции в `api/db.php`: `crm_migrate()` + `crm_seed_etap6()` одноразово по флагу `etap6_seed`).

## Следующие шаги (по порядку ТЗ)

Все этапы ТЗ выполнены. Итоговый отчёт: `logs/FINAL_REPORT.md`. Резервная копия: `backup/backup_2026-08-09/`.
