<?php
/**
 * Журнал аудиту дій користувачів.
 * GET ?from&to&q&entity&limit -> список записів.
 */

require_once __DIR__ . '/helpers.php';

h_start_session();
crm_migrate();
crm_seed();
h_require_auth(['admin', 'owner']);

$where = ['1=1'];
$p = [];
if (!empty($_GET['from'])) {
    $where[] = 'a.created_at >= ?';
    $p[] = date('Y-m-d 00:00:00', strtotime($_GET['from']));
}
if (!empty($_GET['to'])) {
    $where[] = 'a.created_at <= ?';
    $p[] = date('Y-m-d 23:59:59', strtotime($_GET['to']));
}
if (!empty($_GET['q'])) {
    $where[] = '(a.detail LIKE ? OR u.username LIKE ? OR a.entity LIKE ?)';
    $q = '%' . trim($_GET['q']) . '%';
    $p[] = $q; $p[] = $q; $p[] = $q;
}
$limit = min(max((int) ($_GET['limit'] ?? 200), 1), 1000);

$rows = db_fetch_all(
    "SELECT a.id, a.action, a.entity, a.entity_id, a.detail, a.created_at, u.username, u.name AS user_name
     FROM audit a LEFT JOIN users u ON u.id=a.user_id
     WHERE " . implode(' AND ', $where) . " ORDER BY a.id DESC LIMIT $limit", $p
);
h_json(['ok' => true, 'audit' => $rows]);
