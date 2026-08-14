<?php
/**
 * Акції та промокоди.
 * GET -> список промокодів + категорії для форми.
 * POST action=save_promo | delete_promo.
 */

require_once __DIR__ . '/helpers.php';

h_start_session();
crm_migrate();
crm_seed();

$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'GET') {
    $u = h_require_auth(['admin', 'cashier', 'manager', 'owner']);
    $rows = db_fetch_all("SELECT * FROM promocodes ORDER BY id DESC");
    $cats = db_fetch_all("SELECT id, name FROM categories ORDER BY sort");
    h_json(['ok' => true, 'promocodes' => $rows, 'categories' => $cats]);
}

if ($method !== 'POST') h_error('Метод не підтримується', 405);
$u = h_require_auth(['admin', 'cashier', 'manager', 'owner']);

$d = h_input();
if (!h_csrf_check($d['csrf'] ?? null)) h_error('Сесія застаріла', 403);
$action = $d['action'] ?? '';

switch ($action) {

    case 'save_promo':
        $id = (int) ($d['id'] ?? 0);
        $code = strtoupper(trim((string) ($d['code'] ?? '')));
        $kind = in_array($d['kind'] ?? '', ['percent', 'fixed', 'bogo'], true) ? $d['kind'] : 'percent';
        $value = (float) ($d['value'] ?? 0);
        $cat = (int) ($d['category_id'] ?? 0);
        $min = (float) ($d['min_total'] ?? 0);
        $active = !empty($d['active']) ? 1 : 0;
        $starts = trim((string) ($d['starts'] ?? ''));
        $ends = trim((string) ($d['ends'] ?? ''));
        $max = (int) ($d['max_uses'] ?? 0);

        if (!preg_match('/^[A-ZА-Я0-9_\-]{2,20}$/u', $code)) h_error('Код: 2-20 символів (літери, цифри, _-)', 400);
        if ($value < 0 || $value > 100000) h_error('Невірне значення знижки', 400);
        if ($kind === 'percent' && $value > 100) h_error('Процентна знижка не більше 100%', 400);
        if ($min < 0 || $min > 1e6) h_error('Невірна мінімальна сума', 400);
        if ($cat && !db_fetch_one("SELECT id FROM categories WHERE id=?", [$cat])) h_error('Категорію не знайдено', 400);

        $dup = db_fetch_one("SELECT id FROM promocodes WHERE code=? AND id<>?", [$code, $id]);
        if ($dup) h_error('Код вже існує', 400);

        if ($id) {
            db_update('promocodes', [
                'code' => $code, 'kind' => $kind, 'value' => $value, 'category_id' => $cat,
                'min_total' => $min, 'active' => $active, 'starts' => $starts, 'ends' => $ends, 'max_uses' => $max,
            ], 'id=?', [$id]);
            crm_audit('promo_update', 'promocode', (string) $id, $code);
        } else {
            $id = db_insert('promocodes', [
                'code' => $code, 'kind' => $kind, 'value' => $value, 'category_id' => $cat,
                'min_total' => $min, 'active' => $active, 'starts' => $starts, 'ends' => $ends,
                'max_uses' => $max, 'used' => 0,
            ]);
            crm_audit('promo_create', 'promocode', (string) $id, $code);
        }
        h_json(['ok' => true, 'id' => $id]);
        break;

    case 'delete_promo':
        $id = (int) ($d['id'] ?? 0);
        $row = db_fetch_one("SELECT code FROM promocodes WHERE id=?", [$id]);
        if (!$row) h_error('Промокод не знайдено', 404);
        db_delete('promocodes', 'id=?', [$id]);
        crm_audit('promo_delete', 'promocode', (string) $id, $row['code']);
        h_json(['ok' => true]);
        break;

    default:
        h_error('Невідома дія', 400);
}
