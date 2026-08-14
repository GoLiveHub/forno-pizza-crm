<?php
/**
 * Админ-API заказов.
 *
 * GET  api/orders.php            -> все заказы, новые сверху (только админ)
 * GET  api/orders.php?id=F-XXXX  -> один заказ (только админ)
 * POST {"id":"F-XXXX","status":"cooking","csrf":"..."}  -> смена статуса (админ + CSRF)
 * POST {"id":"F-XXXX","action":"delete","csrf":"..."}   -> удаление заказа (админ + CSRF)
 *
 * Всё хранится в SQLite. Без сессии админа возвращается 401.
 */

require_once __DIR__ . '/forno_db.php';

header('Content-Type: application/json; charset=utf-8');

if (!forno_is_admin()) {
    forno_respond(401, ['ok' => false, 'authed' => false, 'error' => 'auth required']);
}

$STATUSES = ['new', 'cooking', 'delivering', 'done'];

/* ---------- GET: список / один ---------- */
if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $id = isset($_GET['id']) ? trim((string)$_GET['id']) : '';

    if ($id !== '') {
        $stmt = forno_db()->prepare('SELECT * FROM orders WHERE id = ?');
        $stmt->execute([$id]);
        $row = $stmt->fetch();
        if (!$row) {
            forno_respond(404, ['ok' => false, 'error' => 'not found']);
        }
        forno_respond(200, ['ok' => true, 'order' => forno_order_row($row), 'csrf' => forno_csrf_token()]);
    }

    $rows = forno_db()->query('SELECT * FROM orders ORDER BY created DESC')->fetchAll();
    $orders = array_map('forno_order_row', $rows);

    forno_respond(200, [
        'ok'     => true,
        'count'  => count($orders),
        'orders' => $orders,
        'csrf'   => forno_csrf_token(),
    ]);
}

/* ---------- POST: смена статуса ---------- */
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    forno_respond(405, ['ok' => false, 'error' => 'method not allowed']);
}

$raw  = file_get_contents('php://input');
$data = json_decode($raw, true);

if (!is_array($data)) {
    forno_respond(400, ['ok' => false, 'error' => 'bad request']);
}

if (!forno_check_csrf(isset($data['csrf']) ? (string)$data['csrf'] : '')) {
    forno_respond(403, ['ok' => false, 'error' => 'csrf mismatch']);
}

/* ---------- POST: удаление заказа (право на удаление данных) ---------- */
$action = isset($data['action']) ? (string)$data['action'] : '';

if ($action === 'delete') {
    $id = isset($data['id']) ? trim((string)$data['id']) : '';
    if ($id === '') {
        forno_respond(400, ['ok' => false, 'error' => 'bad request']);
    }
    $stmt = forno_db()->prepare('DELETE FROM orders WHERE id = ?');
    $stmt->execute([$id]);
    if ($stmt->rowCount() === 0) {
        forno_respond(404, ['ok' => false, 'error' => 'not found']);
    }
    forno_respond(200, ['ok' => true, 'deleted' => $id]);
}

/* ---------- POST: смена статуса ---------- */
$id     = isset($data['id'])     ? trim((string)$data['id'])     : '';
$status = isset($data['status']) ? trim((string)$data['status']) : '';

if ($id === '' || !in_array($status, $STATUSES, true)) {
    forno_respond(400, ['ok' => false, 'error' => 'bad request']);
}

$stmt = forno_db()->prepare('UPDATE orders SET status = ? WHERE id = ?');
$stmt->execute([$status, $id]);

if ($stmt->rowCount() === 0) {
    forno_respond(404, ['ok' => false, 'error' => 'not found']);
}

forno_respond(200, ['ok' => true, 'id' => $id, 'status' => $status]);

/* ---------- помощь: строка БД -> массив как раньше ---------- */
function forno_order_row($row) {
    return [
        'id'       => $row['id'],
        'created'  => $row['created'],
        'status'   => $row['status'],
        'total'    => (int)$row['total'],
        'payment'  => $row['payment'],
        'comment'  => $row['comment'],
        'delivery_type' => isset($row['delivery_type']) ? $row['delivery_type'] : 'courier',
        'customer' => [
            'name'    => $row['customer_name'],
            'phone'   => $row['customer_phone'],
            'city'    => $row['customer_city'],
            'address' => $row['customer_address'],
        ],
        'items'    => json_decode($row['items'], true) ?: [],
    ];
}
