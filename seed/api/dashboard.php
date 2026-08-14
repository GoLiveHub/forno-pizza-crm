<?php
/**
 * Дашборд: головна сторінка після входу (власник/менеджер/касир/адмін).
 * GET -> метрики: виручка сьогодні/тиждень/місяць, активні замовлення,
 * замовлення по годинах, ТОП-5 страв, доставка/самовивіз,
 * середній час приготування, ефективність кур'єрів.
 * Доступ: admin/cashier/manager/owner.
 */

require_once __DIR__ . '/helpers.php';

h_start_session();
crm_migrate();
crm_seed();
h_require_auth(['admin', 'cashier', 'manager', 'owner']);

function dash_range(string $from, string $to): array {
    return db_fetch_one(
        "SELECT COUNT(*) AS orders_cnt, COALESCE(SUM(total),0) AS revenue
         FROM orders WHERE status='done' AND created_at BETWEEN ? AND ?",
        [$from, $to]
    );
}

$today = date('Y-m-d 00:00:00');
$tomorrow = date('Y-m-d 00:00:00', strtotime('+1 day'));
$monthAgo = date('Y-m-d 00:00:00', strtotime('-30 days'));

$todayR = dash_range($today, date('Y-m-d 23:59:59'));
$weekR = dash_range(date('Y-m-d 00:00:00', strtotime('-6 days')), date('Y-m-d 23:59:59'));
$monthR = dash_range($monthAgo, date('Y-m-d 23:59:59'));

$active = db_fetch_all(
    "SELECT status, COUNT(*) AS cnt FROM orders
     WHERE status IN ('new','cooking','delivering') GROUP BY status"
);
$activeTotal = 0;
foreach ($active as $a) $activeTotal += (int) $a['cnt'];

// Замовлення по годинах (за 30 днів, всі створені)
$by_hour = db_fetch_all(
    "SELECT CAST(strftime('%H', created_at) AS INTEGER) AS h, COUNT(*) AS cnt
     FROM orders WHERE created_at >= ? GROUP BY h ORDER BY h", [$monthAgo]
);

// ТОП-5 страв (за 30 днів, виконані)
$top_items = db_fetch_all(
    "SELECT oi.name, SUM(oi.qty) AS qty, SUM(oi.total) AS revenue
     FROM order_items oi JOIN orders o ON o.id=oi.order_id
     WHERE o.status='done' AND o.created_at >= ?
     GROUP BY oi.item_id ORDER BY qty DESC LIMIT 5", [$monthAgo]
);

// Доставка / самовивіз / на місці (за 30 днів, виконані)
$by_delivery = db_fetch_all(
    "SELECT delivery_type, COUNT(*) AS cnt, COALESCE(SUM(total),0) AS revenue
     FROM orders WHERE status='done' AND created_at >= ?
     GROUP BY delivery_type", [$monthAgo]
);

// Середній час приготування (з audit: cooking -> done; fallback closed - created)
$cookRows = db_fetch_all(
    "SELECT o.id, o.created_at, o.closed_at,
        (SELECT MIN(a.created_at) FROM audit a
         WHERE a.action='order_status' AND a.entity_id=CAST(o.id AS TEXT) AND a.detail LIKE '%-> cooking%') AS cook_at,
        (SELECT MIN(a.created_at) FROM audit a
         WHERE a.action='order_status' AND a.entity_id=CAST(o.id AS TEXT) AND a.detail LIKE '%-> done%') AS done_at
     FROM orders o WHERE o.status='done' AND o.created_at >= ?", [$monthAgo]
);
$prepSec = 0;
$prepN = 0;
foreach ($cookRows as $r) {
    $start = $r['cook_at'] ? strtotime($r['cook_at']) : strtotime($r['created_at']);
    $end = $r['done_at'] ? strtotime($r['done_at']) : strtotime($r['closed_at']);
    if ($start !== false && $end !== false && $end > $start) {
        $prepSec += $end - $start;
        $prepN++;
    }
}

// Ефективність кур'єрів (доставки done + середній час доставки)
$couriers = db_fetch_all(
    "SELECT o.courier_id AS id, u.name AS name,
        COUNT(*) AS deliveries,
        AVG(strftime('%s', o.closed_at) - strftime('%s', o.delivering_at)) AS avg_delivery_sec
     FROM orders o JOIN users u ON u.id=o.courier_id
     WHERE o.status='done' AND o.delivery_type='courier' AND o.courier_id IS NOT NULL
        AND o.delivering_at IS NOT NULL AND o.closed_at IS NOT NULL AND o.closed_at > o.delivering_at
        AND o.created_at >= ?
     GROUP BY o.courier_id ORDER BY deliveries DESC", [$monthAgo]
);
foreach ($couriers as &$c) {
    $c['avg_delivery_min'] = $c['avg_delivery_sec'] !== null ? round((float) $c['avg_delivery_sec'] / 60, 1) : 0;
    $c['deliveries'] = (int) $c['deliveries'];
    unset($c['avg_delivery_sec']);
}
unset($c);

h_json([
    'ok' => true,
    'today' => ['orders_cnt' => (int) $todayR['orders_cnt'], 'revenue' => round((float) $todayR['revenue'], 2)],
    'week' => ['orders_cnt' => (int) $weekR['orders_cnt'], 'revenue' => round((float) $weekR['revenue'], 2)],
    'month' => ['orders_cnt' => (int) $monthR['orders_cnt'], 'revenue' => round((float) $monthR['revenue'], 2)],
    'active_orders' => ['total' => $activeTotal, 'by_status' => $active],
    'by_hour' => $by_hour,
    'top_items' => $top_items,
    'by_delivery' => $by_delivery,
    'avg_prep_min' => $prepN > 0 ? round($prepSec / $prepN / 60, 1) : 0,
    'couriers' => $couriers,
]);
