<?php
/**
 * Каса (POS): меню для продажи, створення замовлення, пошук клієнта.
 * GET  -> меню + стоп-лист; GET ?q=телефон -> пошук клієнтів.
 * POST {action:create} -> створення замовлення через касу.
 */

require_once __DIR__ . '/helpers.php';
require_once __DIR__ . '/orders_core.php';

h_start_session();
crm_migrate();
crm_seed();

$u = h_require_auth(['admin', 'cashier', 'manager', 'owner']);
$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'GET') {
    if (isset($_GET['q']) && trim($_GET['q']) !== '') {
        $q = '%' . preg_replace('/\D+/', '', trim($_GET['q'])) . '%';
        $res = db_fetch_all("SELECT id, phone, name, address, blacklist, notes FROM clients WHERE phone LIKE ? OR name LIKE ? LIMIT 10", [$q, '%' . trim($_GET['q']) . '%']);
        h_json(['ok' => true, 'clients' => $res]);
    }
    $cats = db_fetch_all("SELECT id, name FROM categories WHERE active=1 ORDER BY sort, id");
    $items = db_fetch_all("SELECT m.id, m.category_id, m.name, m.descr, m.price, m.price40, m.unit, m.active
                           FROM menu_items m WHERE m.active=1 ORDER BY m.sort, m.id");
    $dough = db_fetch_all("SELECT id, code, name FROM dough_types WHERE active=1 ORDER BY sort, id");
    $toppings = db_fetch_all("SELECT t.item_id, i.id AS ingredient_id, i.name AS ingredient_name, i.topping_price
                              FROM menu_toppings t JOIN ingredients i ON i.id=t.ingredient_id
                              WHERE i.active=1 AND i.topping_price>0 ORDER BY i.name");
    $recipe = db_fetch_all("SELECT r.item_id, r.ingredient_id, i.name AS ingredient_name, i.is_dough, i.is_base
                            FROM recipes r JOIN ingredients i ON i.id=r.ingredient_id ORDER BY r.item_id, r.id");
    h_json(['ok' => true, 'categories' => $cats, 'items' => $items, 'stops' => crm_stop_item_ids(), 'dough' => $dough, 'toppings' => $toppings, 'recipe' => $recipe, 'couriers' => crm_courier_list()]);
}

if ($method !== 'POST') h_error('Метод не підтримується', 405);

$d = h_input();
if (!h_csrf_check($d['csrf'] ?? null)) h_error('Сесія застаріла', 403);
$action = $d['action'] ?? '';

switch ($action) {

    case 'create':
        h_rate_limit('pos', 30, 60);
        $r = crm_create_order($d, 'pos');
        if (isset($r['error'])) h_error($r['error'], 400);
        h_json(['ok' => true] + $r);
        break;

    case 'check_promo':
        $code = strtoupper(trim((string) ($d['code'] ?? '')));
        if ($code === '') h_error('Вкажіть промокод', 400);
        $items = $d['items'] ?? [];
        $lines = [];
        $subtotal = 0.0;
        foreach ($items as $it) {
            $item_id = (int) ($it['item_id'] ?? 0);
            $qty = (int) ($it['qty'] ?? 1);
            $row = db_fetch_one("SELECT id, category_id, name, price, price40, active FROM menu_items WHERE id=?", [$item_id]);
            if (!$row || !$row['active']) continue;
            $opts = crm_parse_options($row, $it);
            $price = crm_line_price($row, $opts);
            $lines[] = ['item_id' => $item_id, 'category_id' => (int) $row['category_id'], 'name' => $row['name'], 'price' => $price, 'qty' => $qty, 'total' => round($price * $qty, 2)];
            $subtotal += round($price * $qty, 2);
        }
        $r = crm_promo_apply($code, $lines, $subtotal);
        if (isset($r['error'])) h_error($r['error'], 400);
        h_json(['ok' => true, 'subtotal' => round($subtotal, 2), 'discount' => $r['discount'], 'total' => round($subtotal - $r['discount'], 2)]);
        break;

    default:
        h_error('Невідома дія', 400);
}
