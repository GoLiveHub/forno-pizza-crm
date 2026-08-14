<?php
/**
 * Клієнти: база, чорний список, нотатки.
 * GET -> список (пошук q), статистика по клієнтах.
 * POST action=update_client | toggle_blacklist.
 */

require_once __DIR__ . '/helpers.php';

h_start_session();
crm_migrate();
crm_seed();

$u = h_require_auth(['admin', 'cashier', 'cook', 'courier', 'manager', 'support', 'owner']);
$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'GET') {
    $where = ['1=1'];
    $p = [];
    if (!empty($_GET['q'])) {
        $where[] = '(c.name LIKE ? OR c.phone LIKE ?)';
        $q = '%' . trim($_GET['q']) . '%';
        $p[] = $q; $p[] = $q;
    }
    $rows = db_fetch_all(
        "SELECT c.*,
            (SELECT COUNT(*) FROM orders o WHERE o.client_id=c.id) AS orders_cnt,
            (SELECT SUM(o.total) FROM orders o WHERE o.client_id=c.id AND o.status='done') AS total_spent,
            (SELECT MAX(o.created_at) FROM orders o WHERE o.client_id=c.id) AS last_order_at
         FROM clients c WHERE " . implode(' AND ', $where) . " ORDER BY c.id DESC LIMIT 300",
        $p
    );
    foreach ($rows as &$c) {
        $c['total_spent'] = $c['total_spent'] !== null ? round((float) $c['total_spent'], 2) : 0;
    }
    unset($c);
    h_json(['ok' => true, 'clients' => $rows]);
}

if ($method !== 'POST') h_error('Метод не підтримується', 405);
h_require_auth(['admin', 'cashier', 'manager', 'owner']);

$d = h_input();
if (!h_csrf_check($d['csrf'] ?? null)) h_error('Сесія застаріла', 403);
$action = $d['action'] ?? '';

switch ($action) {

    case 'update_client':
        $id = (int) ($d['id'] ?? 0);
        $name = trim((string) ($d['name'] ?? ''));
        $address = trim((string) ($d['address'] ?? ''));
        $notes = trim((string) ($d['notes'] ?? ''));
        $c = db_fetch_one("SELECT * FROM clients WHERE id=?", [$id]);
        if (!$c) h_error('Клієнта не знайдено', 404);
        if ($name !== '' && h_bad_name($name)) h_error('Некоректне ім\'я', 400);
        if (mb_strlen($address) > 200) h_error('Адреса занадто довга', 400);
        if (mb_strlen($notes) > 500) h_error('Нотатки занадто довгі', 400);
        db_update('clients', ['name' => $name, 'address' => $address, 'notes' => $notes], 'id=?', [$id]);
        crm_audit('client_update', 'client', (string) $id, $c['phone']);
        h_json(['ok' => true]);
        break;

    case 'toggle_blacklist':
        $id = (int) ($d['id'] ?? 0);
        $c = db_fetch_one("SELECT * FROM clients WHERE id=?", [$id]);
        if (!$c) h_error('Клієнта не знайдено', 404);
        $new = (int) $c['blacklist'] === 1 ? 0 : 1;
        db_update('clients', ['blacklist' => $new], 'id=?', [$id]);
        crm_audit($new ? 'client_blacklist' : 'client_unblacklist', 'client', (string) $id, $c['phone']);
        h_json(['ok' => true, 'blacklist' => $new]);
        break;

    default:
        h_error('Невідома дія', 400);
}
