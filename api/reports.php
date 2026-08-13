<?php
/**
 * Звіти та аналітика.
 * GET ?from=Y-m-d&to=Y-m-d&group=day|week|month -> зведення.
 * Доступ: admin/cashier.
 */

require_once __DIR__ . '/helpers.php';

h_start_session();
crm_migrate();
crm_seed();
h_require_auth(['admin', 'cashier', 'manager', 'owner']);

$from = trim((string) ($_GET['from'] ?? ''));
$to = trim((string) ($_GET['to'] ?? ''));
$group = in_array($_GET['group'] ?? '', ['day', 'week', 'month'], true) ? $_GET['group'] : 'day';

$from = $from !== '' ? date('Y-m-d 00:00:00', strtotime($from)) : date('Y-m-d 00:00:00', strtotime('-30 days'));
$to = $to !== '' ? date('Y-m-d 23:59:59', strtotime($to)) : date('Y-m-d 23:59:59');
$fromTs = strtotime($from);
$toTs = strtotime($to);
if ($fromTs === false || $toTs === false || $toTs < $fromTs) h_error('Невірний період', 400);

$fmt = $group === 'month' ? '%Y-%m' : ($group === 'week' ? '%Y-W%W' : '%Y-%m-%d');
$days = [];
$step = $group === 'month' ? 30 : ($group === 'week' ? 7 : 1);
for ($t = $fromTs; $t <= $toTs; $t += $step * 86400) {
    $days[date($group === 'month' ? 'Y-m' : ($group === 'week' ? 'Y-W' : 'Y-m-d'), $t)] = ['revenue' => 0, 'orders' => 0];
}

// Середнє за день по дні тижня (для "година пік" можна розширити)
$by_day = db_fetch_all(
    "SELECT strftime(?, created_at) AS d, COUNT(*) AS cnt, COALESCE(SUM(total),0) AS rev
     FROM orders
     WHERE status='done' AND created_at BETWEEN ? AND ?
     GROUP BY d", [$fmt, $from, $to]
);
foreach ($by_day as $r) {
    $key = $r['d'];
    if (!isset($days[$key])) {
        // ключ стрічки може відрізнятися форматом (W%W), намалюємо як є
        $days[$key] = ['revenue' => 0, 'orders' => 0];
    }
    $days[$key]['revenue'] += (float) $r['rev'];
    $days[$key]['orders'] += (int) $r['cnt'];
}
$series = [];
foreach ($days as $k => $v) $series[] = ['date' => $k, 'revenue' => round($v['revenue'], 2), 'orders' => $v['orders']];

$tot = db_fetch_one(
    "SELECT COUNT(*) AS orders_cnt, COALESCE(SUM(total),0) AS revenue, COALESCE(SUM(discount),0) AS discounts,
            COALESCE(AVG(total),0) AS avg_check
     FROM orders WHERE status='done' AND created_at BETWEEN ? AND ?", [$from, $to]
);

$top_items = db_fetch_all(
    "SELECT oi.name, SUM(oi.qty) AS qty, SUM(oi.total) AS revenue
     FROM order_items oi JOIN orders o ON o.id=oi.order_id
     WHERE o.status='done' AND o.created_at BETWEEN ? AND ?
     GROUP BY oi.item_id ORDER BY qty DESC LIMIT 10", [$from, $to]
);

$by_status = db_fetch_all(
    "SELECT status, COUNT(*) AS cnt, COALESCE(SUM(total),0) AS rev
     FROM orders WHERE created_at BETWEEN ? AND ?
     GROUP BY status", [$from, $to]
);

$by_source = db_fetch_all(
    "SELECT source, COUNT(*) AS cnt FROM orders
     WHERE created_at BETWEEN ? AND ? GROUP BY source", [$from, $to]
);

$by_hour = db_fetch_all(
    "SELECT CAST(strftime('%H', created_at) AS INTEGER) AS h, COUNT(*) AS cnt
     FROM orders WHERE status='done' AND created_at BETWEEN ? AND ?
     GROUP BY h ORDER BY h", [$from, $to]
);

$repeat = db_fetch_one(
    "SELECT COUNT(DISTINCT client_id) AS clients
     FROM orders WHERE status='done' AND client_id IS NOT NULL AND created_at BETWEEN ? AND ?", [$from, $to]
);

h_json([
    'ok' => true,
    'total' => [
        'orders_cnt' => (int) $tot['orders_cnt'],
        'revenue' => round((float) $tot['revenue'], 2),
        'discounts' => round((float) $tot['discounts'], 2),
        'avg_check' => round((float) $tot['avg_check'], 2),
        'clients' => (int) ($repeat['clients'] ?? 0),
    ],
    'series' => $series,
    'top_items' => $top_items,
    'by_status' => $by_status,
    'by_source' => $by_source,
    'by_hour' => $by_hour,
]);
