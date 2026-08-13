<?php
/**
 * Публічний прийом замовлень з сайту-вітрини.
 * - POST {action:create}: створення замовлення (ключ сайту, rate limit, consent).
 * - GET ?num&phone: статус замовлення + повідомлення чату.
 * - POST {action:chat_send}: повідомлення клієнта в чат замовлення.
 * - GET ?new=1&num&phone: чи є нові повідомлення (для опитування клієнта).
 */

require_once __DIR__ . '/helpers.php';
require_once __DIR__ . '/orders_core.php';

crm_migrate();
crm_seed();
h_start_session();

$method = $_SERVER['REQUEST_METHOD'];

/**
 * Перевірка доступу публічного API: ключ сайту + rate limit.
 */
function site_guard(): void {
    $key = $_SERVER['HTTP_X_SITE_KEY'] ?? '';
    if (!hash_equals(ORDER_SITE_KEY, $key)) h_error('Доступ заборонено', 403);
    h_rate_limit('order_in', ORDER_MAX_PER_MIN, 60);
}

/**
 * Знайти замовлення клієнта за номером і телефоном (без авторизації).
 */
function find_client_order(array $d): ?array {
    $num = strtoupper(trim((string) ($d['num'] ?? '')));
    $phone = crm_phone_normalize((string) ($d['phone'] ?? ''));
    if (!preg_match('/^F-\d{1,6}$/', $num)) return null;
    $o = db_fetch_one("SELECT * FROM orders WHERE num=? AND contact_phone=?", [$num, $phone]);
    return $o;
}

if ($method === 'GET') {
    if (isset($_GET['menu'])) {
        $cats = db_fetch_all("SELECT id, name FROM categories WHERE active=1 ORDER BY sort, id");
        $items = db_fetch_all("SELECT m.id, m.category_id, m.name, m.descr, m.price, m.price40, m.unit, m.img FROM menu_items m WHERE m.active=1 ORDER BY m.sort, m.id");
        $dough = db_fetch_all("SELECT id, code, name FROM dough_types WHERE active=1 ORDER BY sort, id");
        $toppings = db_fetch_all("SELECT t.item_id, i.id AS ingredient_id, i.name AS ingredient_name, i.topping_price
                                  FROM menu_toppings t JOIN ingredients i ON i.id=t.ingredient_id
                                  WHERE i.active=1 AND i.topping_price>0 ORDER BY i.name");
        $recipe = db_fetch_all("SELECT r.item_id, r.ingredient_id, i.name AS ingredient_name, i.is_dough, i.is_base
                                FROM recipes r JOIN ingredients i ON i.id=r.ingredient_id ORDER BY r.item_id, r.id");
        h_json(['ok' => true, 'categories' => $cats, 'items' => $items, 'stops' => crm_stop_item_ids(), 'dough' => $dough, 'toppings' => $toppings, 'recipe' => $recipe]);
    }
    $num = strtoupper(trim($_GET['num'] ?? ''));
    $phone = crm_phone_normalize((string) ($_GET['phone'] ?? ''));
    if (!preg_match('/^F-\d{1,6}$/', $num)) h_error('Невірний номер замовлення', 400);
    $o = db_fetch_one("SELECT * FROM orders WHERE num=? AND contact_phone=?", [$num, $phone]);
    if (!$o) h_json(['ok' => true, 'found' => false]);

    $items = db_fetch_all("SELECT name, price, qty, total FROM order_items WHERE order_id=? ORDER BY id", [$o['id']]);
    $msgs = db_fetch_all("SELECT author, text, created_at FROM chat WHERE order_id=? ORDER BY id", [$o['id']]);
    h_json([
        'ok' => true,
        'found' => true,
        'order' => [
            'num' => $o['num'],
            'status' => $o['status'],
            'delivery_type' => $o['delivery_type'],
            'address' => $o['address'],
            'payment' => $o['payment'],
            'subtotal' => $o['subtotal'],
            'discount' => $o['discount'],
            'total' => $o['total'],
            'comment' => $o['comment'],
            'created_at' => $o['created_at'],
        ],
        'items' => $items,
        'messages' => $msgs,
    ]);
}

if ($method !== 'POST') h_error('Метод не підтримується', 405);

$d = h_input();
$action = $d['action'] ?? '';

switch ($action) {

    case 'check_promo':
        site_guard();
        $code = strtoupper(trim((string) ($d['code'] ?? '')));
        $items = $d['items'] ?? [];
        if ($code === '' || !is_array($items) || !count($items)) h_error('Вкажіть промокод і позиції', 400);
        $lines = [];
        $subtotal = 0.0;
        foreach ($items as $it) {
            $item_id = (int) ($it['item_id'] ?? 0);
            $qty = (int) ($it['qty'] ?? 1);
            if ($qty < 1 || $qty > 99) h_error('Невірна кількість', 400);
            $row = db_fetch_one("SELECT id, category_id, name, price, price40, active FROM menu_items WHERE id=?", [$item_id]);
            if (!$row || !$row['active']) h_error('Позицію меню не знайдено', 400);
            $opts = crm_parse_options($row, $it);
            $price = crm_line_price($row, $opts);
            $lines[] = [
                'item_id' => $item_id, 'category_id' => (int) $row['category_id'],
                'name' => $row['name'], 'price' => $price, 'qty' => $qty,
                'total' => round($price * $qty, 2),
            ];
            $subtotal += $price * $qty;
        }
        $r = crm_promo_apply($code, $lines, $subtotal);
        if (isset($r['error'])) h_error($r['error'], 400);
        h_json(['ok' => true, 'discount' => $r['discount']]);
        break;

    case 'create':
        site_guard();
        if (empty($d['consent'])) h_error('Потрібна згода на обробку персональних даних', 400);
        $r = crm_create_order($d, 'site');
        if (isset($r['error'])) h_error($r['error'], 400);
        h_json(['ok' => true] + $r);
        break;

    case 'chat_send':
        site_guard();
        $o = find_client_order($d);
        if (!$o) h_error('Замовлення не знайдено за цим номером і телефоном', 404);
        $text = trim((string) ($d['text'] ?? ''));
        if ($text === '' || mb_strlen($text) > 500) h_error('Повідомлення порожнє або занадто довге', 400);
        if (h_junk($text)) h_error('Повідомлення схоже на спам', 400);
        h_rate_limit('chat_client', 12, 60);
        db_insert('chat', [
            'order_id' => (int) $o['id'],
            'author' => 'client',
            'author_id' => null,
            'text' => $text,
            'is_read' => 0,
            'created_at' => db_now(),
        ]);
        h_json(['ok' => true]);
        break;

    default:
        h_error('Невідома дія', 400);
}
