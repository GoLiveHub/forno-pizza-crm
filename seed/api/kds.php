<?php
/**
 * Кухонна стрічка (KDS): замовлення, які треба готувати.
 * GET -> замовлення у статусах new/cooking.
 * POST action=set_status -> переходи cooking/done (кухар).
 */

require_once __DIR__ . '/helpers.php';

h_start_session();
crm_migrate();
crm_seed();

$u = h_require_auth(['admin', 'cashier', 'cook', 'manager', 'owner']);

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $rows = db_fetch_all(
        "SELECT o.*, (SELECT COUNT(*) FROM chat ch WHERE ch.order_id=o.id AND ch.is_read=0 AND ch.author='client') AS unread
         FROM orders o
         WHERE o.status IN ('new','cooking')
         ORDER BY o.id ASC LIMIT 50"
    );
    foreach ($rows as &$o) {
        $o['items'] = db_fetch_all("SELECT name, qty FROM order_items WHERE order_id=? ORDER BY id", [$o['id']]);
    }
    unset($o);
    h_json(['ok' => true, 'orders' => $rows]);
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') h_error('Метод не підтримується', 405);

$d = h_input();
if (!h_csrf_check($d['csrf'] ?? null)) h_error('Сесія застаріла', 403);

$id = (int) ($d['id'] ?? 0);
$status = (string) ($d['status'] ?? '');
if (!in_array($status, ['cooking', 'done'], true)) h_error('Невідомий статус', 400);
$o = db_fetch_one("SELECT * FROM orders WHERE id=?", [$id]);
if (!$o) h_error('Замовлення не знайдено', 404);

$role = $u['role'];
if ($role !== 'admin' && $role !== 'cashier') {
    // кухар: new->cooking, cooking->done
    $ok = ($status === 'cooking' && $o['status'] === 'new') || ($status === 'done' && $o['status'] === 'cooking');
    if (!$ok) h_error('Недостатньо прав для цього переходу', 403);
}
if ($o['status'] === 'done' || $o['status'] === 'cancelled') h_error('Замовлення закрите', 400);

$set = ['status' => $status, 'updated_at' => db_now()];
if ($status === 'done') {
    $set['closed_at'] = db_now();
    if ($o['payment'] !== 'card_online') $set['pay_status'] = 'paid';
}
db_update('orders', $set, 'id=?', [$id]);
crm_audit('order_status', 'order', (string) $id, $o['num'] . ': ' . $o['status'] . ' -> ' . $status);
h_json(['ok' => true]);
