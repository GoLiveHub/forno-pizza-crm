<?php
/**
 * Чат: загальний список діалогів із клієнтами по замовленнях.
 * GET -> діалоги (останнє повідомлення, лічильник непрочитаних).
 * POST action=chat_send | chat_read — делегуємо в orders-логіку.
 */

require_once __DIR__ . '/helpers.php';

h_start_session();
crm_migrate();
crm_seed();

$u = h_require_auth(['admin', 'cashier', 'courier', 'manager', 'support', 'owner']);
$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'GET') {
    $rows = db_fetch_all(
        "SELECT o.id AS order_id, o.num, o.status, o.created_at,
            (SELECT ch.text FROM chat ch WHERE ch.order_id=o.id ORDER BY ch.id DESC LIMIT 1) AS last_text,
            (SELECT ch.author FROM chat ch WHERE ch.order_id=o.id ORDER BY ch.id DESC LIMIT 1) AS last_author,
            (SELECT MAX(ch.created_at) FROM chat ch WHERE ch.order_id=o.id) AS last_at,
            (SELECT COUNT(*) FROM chat ch WHERE ch.order_id=o.id AND ch.is_read=0 AND ch.author='client') AS unread
         FROM orders o
         WHERE EXISTS (SELECT 1 FROM chat ch WHERE ch.order_id=o.id)
         ORDER BY last_at DESC LIMIT 200"
    );
    foreach ($rows as &$r) {
        $r['last_text'] = $r['last_text'] !== null ? $r['last_text'] : '';
    }
    unset($r);
    h_json(['ok' => true, 'dialogs' => $rows]);
}

if ($method !== 'POST') h_error('Метод не підтримується', 405);
$u = h_require_auth(['admin', 'cashier', 'manager', 'support', 'owner']);

$d = h_input();
if (!h_csrf_check($d['csrf'] ?? null)) h_error('Сесія застаріла', 403);
$action = $d['action'] ?? '';

switch ($action) {

    case 'chat_send':
    case 'chat_read':
        $id = (int) ($d['id'] ?? 0);
        if ($action === 'chat_send') {
            $text = trim((string) ($d['text'] ?? ''));
            $o = db_fetch_one("SELECT * FROM orders WHERE id=?", [$id]);
            if (!$o) h_error('Замовлення не знайдено', 404);
            if ($text === '' || mb_strlen($text) > 500) h_error('Повідомлення порожнє або занадто довге', 400);
            db_insert('chat', [
                'order_id' => $id, 'author' => 'operator', 'author_id' => (int) $u['id'],
                'text' => $text, 'is_read' => 1, 'created_at' => db_now(),
            ]);
            crm_audit('chat_operator', 'order', (string) $id, $o['num']);
        } else {
            db_q("UPDATE chat SET is_read=1 WHERE order_id=? AND author='client'", [$id]);
        }
        h_json(['ok' => true]);
        break;

    default:
        h_error('Невідома дія', 400);
}
