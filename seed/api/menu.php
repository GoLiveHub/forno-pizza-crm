<?php
/**
 * Серверное меню с ценами.
 *
 * GET api/menu.php -> { ok, menu: [{id, cat, name, desc, weight, price, tag}] }
 *
 * Это источник правды по ценам: submit_order.php берёт цены отсюда (из БД),
 * а фронтенд (js/menu.js) подтягивает их для отображения. Публичный эндпоинт,
 * авторизация не нужна - цены и так видны на сайте.
 */

require_once __DIR__ . '/forno_db.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    forno_respond(405, ['ok' => false, 'error' => 'method not allowed']);
}

$menu = forno_db()->query('SELECT id, cat, name, desc, weight, price, tag FROM menu ORDER BY rowid')->fetchAll();

forno_respond(200, ['ok' => true, 'menu' => $menu]);
