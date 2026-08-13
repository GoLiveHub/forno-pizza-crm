<?php
/**
 * Замовлення CRM: список, статуси, чат оператора.
 * GET -> список (фільтри status/source/q).
 * POST action=set_status | chat_send.
 * Права переходів: cook - cooking/done; courier - delivering/done; cashier/admin - будь-які.
 */

require_once __DIR__ . '/helpers.php';
require_once __DIR__ . '/orders_core.php';

// Причини скасування (зберігаються ключі, мітки локалізуються на клієнті)
define('CANCEL_REASONS', ['client_cancelled', 'no_ingredients', 'long_wait', 'order_error', 'other']);

h_start_session();
crm_migrate();
crm_seed();

$u = h_require_auth(['admin', 'cashier', 'cook', 'courier', 'manager', 'support', 'owner']);
$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'GET') {
    if (!empty($_GET['id'])) {
        $id = (int) $_GET['id'];
        $o = db_fetch_one("SELECT o.*, u.name AS courier_name FROM orders o LEFT JOIN users u ON u.id=o.courier_id WHERE o.id=?", [$id]);
        if (!$o) h_error('Замовлення не знайдено', 404);
        $o['items'] = db_fetch_all("SELECT item_id, name, price, qty, total, options FROM order_items WHERE order_id=? ORDER BY id", [$id]);
        $o['chat'] = db_fetch_all("SELECT id, author, text, is_read, created_at FROM chat WHERE order_id=? ORDER BY id", [$id]);
        $o['client_name'] = $o['contact_name'];
        $o['client_phone'] = $o['contact_phone'];
        $o['courier'] = $o['courier_id'] !== null ? ['id' => (int) $o['courier_id'], 'name' => (string) $o['courier_name']] : null;
        h_json(['ok' => true, 'order' => $o, 'cancel_reasons' => CANCEL_REASONS]);
    }
    $where = ['1=1'];
    $p = [];
    if (isset($_GET['status']) && $_GET['status'] !== '' && $_GET['status'] !== 'all') {
        $where[] = 'o.status=?';
        $p[] = $_GET['status'];
    }
    if (isset($_GET['source']) && $_GET['source'] !== '' && $_GET['source'] !== 'all') {
        $where[] = 'o.source=?';
        $p[] = $_GET['source'];
    }
    if (!empty($_GET['q'])) {
        $where[] = '(o.num LIKE ? OR o.contact_name LIKE ? OR o.contact_phone LIKE ?)';
        $q = '%' . trim($_GET['q']) . '%';
        $p[] = $q; $p[] = $q; $p[] = $q;
    }
    // Кур'єр бачить лише замовлення, призначені йому
    if ($u['role'] === 'courier') {
        $where[] = 'o.courier_id=?';
        $p[] = (int) $u['id'];
    }
    $rows = db_fetch_all(
        "SELECT o.*, c.blacklist AS client_blacklist,
            u.name AS courier_name,
            (SELECT COUNT(*) FROM chat ch WHERE ch.order_id=o.id AND ch.is_read=0 AND ch.author='client') AS unread
         FROM orders o
         LEFT JOIN clients c ON c.id=o.client_id
         LEFT JOIN users u ON u.id=o.courier_id
         WHERE " . implode(' AND ', $where) . " ORDER BY o.id DESC LIMIT 200",
        $p
    );
    foreach ($rows as &$o) {
        $o['items'] = db_fetch_all("SELECT item_id, name, price, qty, total, options FROM order_items WHERE order_id=? ORDER BY id", [$o['id']]);
        $o['client_name'] = $o['contact_name'];
        $o['client_phone'] = $o['contact_phone'];
        $o['courier'] = $o['courier_id'] !== null ? ['id' => (int) $o['courier_id'], 'name' => (string) $o['courier_name']] : null;
    }
    unset($o);

    // «Завислі» замовлення: кур'єр везе понад 20 хвилин -> система пропонує скасувати/переназначити
    $stuckSince = date('Y-m-d H:i:s', time() - 20 * 60);
    $stuck = db_fetch_all(
        "SELECT id, num, delivery_type, address, total, contact_name, contact_phone, updated_at
         FROM orders WHERE status='delivering' AND updated_at < ? ORDER BY updated_at ASC LIMIT 20",
        [$stuckSince]
    );
    h_json(['ok' => true, 'orders' => $rows, 'cancel_reasons' => CANCEL_REASONS, 'stuck' => $stuck]);
}

if ($method !== 'POST') h_error('Метод не підтримується', 405);

$d = h_input();
if (!h_csrf_check($d['csrf'] ?? null)) h_error('Сесія застаріла', 403);
$action = $d['action'] ?? '';

switch ($action) {

    case 'set_status':
        $id = (int) ($d['id'] ?? 0);
        $status = (string) ($d['status'] ?? '');
        $allowed = ['new', 'cooking', 'delivering', 'done', 'cancelled'];
        if (!in_array($status, $allowed, true)) h_error('Невідомий статус', 400);
        $o = db_fetch_one("SELECT * FROM orders WHERE id=?", [$id]);
        if (!$o) h_error('Замовлення не знайдено', 404);

        $role = $u['role'];
        $from = $o['status'];
        if ($role === 'cook' && !in_array($status, ['cooking', 'done'], true)) h_error('Недостатньо прав', 403);
        if ($role === 'courier' && !in_array($status, ['delivering', 'done'], true)) h_error('Недостатньо прав', 403);
        if ($role === 'support' && $status !== 'cancelled') h_error('Недостатньо прав', 403);
        if ($from === 'done' || $from === 'cancelled') h_error('Замовлення закрите, статус не змінюється', 400);
        if ($status === $from) h_error('Статус вже такий', 400);

        $set = ['status' => $status, 'updated_at' => db_now()];
        if ($status === 'done' || $status === 'cancelled') $set['closed_at'] = db_now();
        if ($status === 'done' && $o['payment'] !== 'card_online') $set['pay_status'] = 'paid';

        // Етап 8: автоназначення кур'єра при переході в доставку (round-robin по активних кур'єрах)
        if ($status === 'delivering' && (int) $o['courier_id'] === 0) {
            $couriers = db_fetch_all("SELECT id FROM users WHERE role='courier' AND active=1 ORDER BY id ASC");
            if (!$couriers) h_error('Немає активних кур\'єрів', 400);
            // останній призначений кур'єр -> наступний по списку (round-robin)
            $lastCourierId = (int) db_scalar("SELECT courier_id FROM orders WHERE courier_id IS NOT NULL AND courier_id>0 ORDER BY id DESC LIMIT 1");
            $nextId = null;
            foreach ($couriers as $c) {
                if ((int) $c['id'] > $lastCourierId) { $nextId = (int) $c['id']; break; }
            }
            if ($nextId === null) $nextId = (int) $couriers[0]['id'];
            $set['courier_id'] = $nextId;
            $set['delivering_at'] = db_now();
        }

        if ($status === 'cancelled') {
            // обов'язкова причина зі списку
            $reason = (string) ($d['reason'] ?? '');
            if (!in_array($reason, CANCEL_REASONS, true)) h_error('Вкажіть причину скасування', 400);
            $set['cancel_reason'] = $reason;
            // повернення складу при скасуванні (з урахуванням кастомізації)
            foreach (db_fetch_all("SELECT item_id, qty, options FROM order_items WHERE order_id=?", [$id]) as $oi) {
                $opts = json_decode((string) $oi['options'], true) ?: [];
                for ($i = 0; $i < (int) $oi['qty']; $i++) {
                    crm_stock_refund((int) $oi['item_id'], $id, $opts);
                }
            }
        }
        db_update('orders', $set, 'id=?', [$id]);
        crm_audit('order_status', 'order', (string) $id, $o['num'] . ': ' . $from . ' -> ' . $status . ($status === 'cancelled' ? ' (' . ($set['cancel_reason'] ?? '') . ')' : '') . (isset($set['courier_id']) ? ' кур\'єр #' . $set['courier_id'] : ''));
        h_json(['ok' => true, 'courier_id' => $set['courier_id'] ?? null, 'courier_name' => isset($set['courier_id']) ? (db_scalar("SELECT name FROM users WHERE id=?", [(int) $set['courier_id']]) ?? '') : null]);
        break;

    case 'edit_items':
        // Редагування позицій: касир/адмін/менеджер/власник, тільки до початку приготування (status=new)
        if (!in_array($u['role'], ['admin', 'cashier', 'manager', 'owner'], true)) h_error('Недостатньо прав', 403);
        $id = (int) ($d['id'] ?? 0);
        $items = $d['items'] ?? [];
        if (!is_array($items) || !count($items)) h_error('Кошик порожній', 400);
        if (count($items) > 40) h_error('Забагато позицій', 400);
        $o = db_fetch_one("SELECT * FROM orders WHERE id=?", [$id]);
        if (!$o) h_error('Замовлення не знайдено', 404);
        if ($o['status'] !== 'new') h_error('Редагувати можна лише до початку приготування', 400);

        $lines = [];
        foreach ($items as $it) {
            $item_id = (int) ($it['item_id'] ?? 0);
            $qty = (int) ($it['qty'] ?? 1);
            if ($qty < 1 || $qty > 99) h_error('Невірна кількість позиції', 400);
            $row = db_fetch_one("SELECT id, category_id, name, price, price40, active FROM menu_items WHERE id=?", [$item_id]);
            if (!$row) h_error('Позицію меню не знайдено', 400);
            if (!$row['active']) h_error('Позиція "' . $row['name'] . '" вимкнена', 400);
            $opts = crm_parse_options($row, $it);
            $short = crm_ingredient_shortage($item_id, $opts);
            if ($short) h_error('Позиція "' . $row['name'] . '" недоступна (немає: ' . $short . ')', 400);
            $price = crm_line_price($row, $opts);
            $lines[] = [
                'item_id' => $item_id,
                'category_id' => (int) $row['category_id'],
                'name' => crm_line_name($row, $opts),
                'price' => $price,
                'qty' => $qty,
                'total' => round($price * $qty, 2),
                'options' => $opts,
            ];
        }

        // повернення складу по старих позиціях + чистка старих рухів
        foreach (db_fetch_all("SELECT item_id, qty, options FROM order_items WHERE order_id=?", [$id]) as $oi) {
            $opts = json_decode((string) $oi['options'], true) ?: [];
            for ($i = 0; $i < (int) $oi['qty']; $i++) {
                crm_stock_refund((int) $oi['item_id'], $id, $opts);
            }
        }
        db_q("DELETE FROM stock_movements WHERE order_id=? AND kind='out'", [$id]);

        // перерахунок сум і промокоду
        $subtotal = 0.0;
        foreach ($lines as $l) $subtotal += $l['total'];
        $discount = 0.0;
        if ($o['promo_code'] !== '') {
            $rr = crm_promo_apply($o['promo_code'], $lines, $subtotal);
            if (!isset($rr['error'])) $discount = $rr['discount'];
        }
        $total = round($subtotal - $discount, 2);
        if ($total < 0) $total = 0;

        // заміна позицій
        db_delete('order_items', 'order_id=?', [$id]);
        foreach ($lines as $l) {
            db_insert('order_items', [
                'order_id' => $id,
                'item_id' => $l['item_id'],
                'name' => $l['name'],
                'price' => $l['price'],
                'qty' => $l['qty'],
                'total' => $l['total'],
                'options' => json_encode($l['options'], JSON_UNESCAPED_UNICODE),
            ]);
            crm_stock_consume($l['item_id'], $id, $l['options']);
        }
        db_update('orders', [
            'subtotal' => round($subtotal, 2),
            'discount' => $discount,
            'total' => $total,
            'updated_at' => db_now(),
        ], 'id=?', [$id]);
        crm_audit('order_edit', 'order', (string) $id, $o['num'] . ': позиції оновлено, сума ' . round($total, 2) . ' грн');
        h_json(['ok' => true, 'subtotal' => round($subtotal, 2), 'discount' => $discount, 'total' => $total]);
        break;

    case 'chat_send':
        $id = (int) ($d['id'] ?? 0);
        $text = trim((string) ($d['text'] ?? ''));
        $o = db_fetch_one("SELECT * FROM orders WHERE id=?", [$id]);
        if (!$o) h_error('Замовлення не знайдено', 404);
        if ($text === '' || mb_strlen($text) > 500) h_error('Повідомлення порожнє або занадто довге', 400);
        db_insert('chat', [
            'order_id' => $id,
            'author' => 'operator',
            'author_id' => (int) $u['id'],
            'text' => $text,
            'is_read' => 1,
            'created_at' => db_now(),
        ]);
        crm_audit('chat_operator', 'order', (string) $id, $o['num']);
        h_json(['ok' => true]);
        break;

    case 'chat_read':
        $id = (int) ($d['id'] ?? 0);
        db_q("UPDATE chat SET is_read=1 WHERE order_id=? AND author='client'", [$id]);
        h_json(['ok' => true]);
        break;

    default:
        h_error('Невідома дія', 400);
}
