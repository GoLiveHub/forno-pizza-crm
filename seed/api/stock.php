<?php
/**
 * Склад: ингредиенты, рецепты, закупки, движения.
 * GET -> ингредиенты, рецепты, позиции меню для выбора.
 * POST action=save_ingredient | delete_ingredient | save_recipe | stock_in.
 * Запись - только admin/cashier.
 */

require_once __DIR__ . '/helpers.php';

h_start_session();
crm_migrate();
crm_seed();

$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'GET') {
    h_require_auth(['admin', 'cashier', 'cook', 'manager', 'owner']);
    $ings = array_map(function ($i) {
        $i['stock'] = round((float) $i['stock'], 4);
        $i['min_stock'] = round((float) $i['min_stock'], 4);
        return $i;
    }, db_fetch_all("SELECT * FROM ingredients ORDER BY name COLLATE NOCASE"));
    $recs = db_fetch_all("SELECT r.item_id, r.ingredient_id, r.qty, i.name AS ing_name, i.unit FROM recipes r JOIN ingredients i ON i.id=r.ingredient_id ORDER BY r.item_id, r.id");
    $items = db_fetch_all("SELECT m.id, m.name, c.name AS category FROM menu_items m LEFT JOIN categories c ON c.id=m.category_id ORDER BY m.name COLLATE NOCASE");
    $byItem = [];
    foreach ($recs as $r) {
        $byItem[$r['item_id']][] = ['ingredient_id' => (int) $r['ingredient_id'], 'qty' => round((float) $r['qty'], 4)];
    }
    h_json(['ok' => true, 'ingredients' => $ings, 'items' => $items, 'recipes' => $byItem]);
}

if ($method !== 'POST') h_error('Метод не підтримується', 405);

$u = h_require_auth(['admin', 'cashier', 'manager', 'owner']);
$d = h_input();
if (!h_csrf_check($d['csrf'] ?? null)) h_error('Сесія застаріла', 403);
$action = $d['action'] ?? '';

switch ($action) {

    case 'save_ingredient':
        $id = (int) ($d['id'] ?? 0);
        $name = trim((string) ($d['name'] ?? ''));
        $unit = trim((string) ($d['unit'] ?? 'шт'));
        $stock = round((float) ($d['stock'] ?? 0), 4);
        $min = round((float) ($d['min_stock'] ?? 0), 4);
        $active = !empty($d['active']) ? 1 : 0;
        if ($name === '' || mb_strlen($name) > 60) h_error('Вкажіть назву інгредієнта', 400);
        if ($stock < 0 || $stock > 1e9) h_error('Невірний залишок', 400);
        if ($id) {
            $old = db_fetch_one("SELECT stock FROM ingredients WHERE id=?", [$id]);
            db_update('ingredients', ['name' => $name, 'unit' => $unit, 'stock' => $stock, 'min_stock' => $min, 'active' => $active], 'id=?', [$id]);
            if ($old && abs((float) $old['stock'] - $stock) > 0.001) {
                db_insert('stock_movements', [
                    'ingredient_id' => $id, 'kind' => 'adj', 'qty' => $stock - (float) $old['stock'],
                    'user_id' => (int) $u['id'], 'note' => 'Ручне коригування', 'created_at' => db_now(),
                ]);
            }
            crm_audit('stock_ingredient_update', 'ingredient', (string) $id, $name);
        } else {
            $id = db_insert('ingredients', ['name' => $name, 'unit' => $unit, 'stock' => $stock, 'min_stock' => $min, 'active' => $active]);
            crm_audit('stock_ingredient_create', 'ingredient', (string) $id, $name);
        }
        h_json(['ok' => true, 'id' => $id]);
        break;

    case 'delete_ingredient':
        $id = (int) ($d['id'] ?? 0);
        $inUse = (int) db_scalar("SELECT COUNT(*) FROM recipes WHERE ingredient_id=?", [$id]);
        if ($inUse > 0) h_error('Інгредієнт використовується у рецептах', 400);
        db_delete('ingredients', 'id=?', [$id]);
        crm_audit('stock_ingredient_delete', 'ingredient', (string) $id);
        h_json(['ok' => true]);
        break;

    case 'save_recipe':
        $item_id = (int) ($d['item_id'] ?? 0);
        $list = $d['recipe'];
        if (!db_fetch_one("SELECT id FROM menu_items WHERE id=?", [$item_id])) h_error('Позицію не знайдено', 404);
        if (!is_array($list)) $list = [];
        db_q("DELETE FROM recipes WHERE item_id=?", [$item_id]);
        foreach ($list as $r) {
            $ing = (int) ($r['ingredient_id'] ?? 0);
            $qty = (float) ($r['qty'] ?? 0);
            if (!$ing || $qty <= 0) continue;
            if (!db_fetch_one("SELECT id FROM ingredients WHERE id=?", [$ing])) continue;
            db_insert('recipes', ['item_id' => $item_id, 'ingredient_id' => $ing, 'qty' => $qty]);
        }
        crm_audit('stock_recipe_save', 'menu_item', (string) $item_id, 'Рецепт оновлено');
        h_json(['ok' => true]);
        break;

    case 'stock_in':
        $id = (int) ($d['ingredient_id'] ?? 0);
        $qty = round((float) ($d['qty'] ?? 0), 4);
        $note = trim((string) ($d['note'] ?? ''));
        if (!db_fetch_one("SELECT id FROM ingredients WHERE id=?", [$id])) h_error('Інгредієнт не знайдено', 404);
        if ($qty <= 0 || $qty > 1e9) h_error('Невірна кількість', 400);
        if (mb_strlen($note) > 200) h_error('Примітка занадто довга', 400);
        db_q("UPDATE ingredients SET stock = round(stock + ?, 4) WHERE id=?", [$qty, $id]);
        db_insert('stock_movements', [
            'ingredient_id' => $id, 'kind' => 'in', 'qty' => $qty,
            'user_id' => (int) $u['id'], 'note' => $note !== '' ? $note : 'Закупівля', 'created_at' => db_now(),
        ]);
        crm_audit('stock_in', 'ingredient', (string) $id, '+' . $qty . ' / ' . $note);
        h_json(['ok' => true]);
        break;

    default:
        h_error('Невідома дія', 400);
}
