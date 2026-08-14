<?php
/**
 * Меню и прайс: категории и позиции.
 * GET -> список категорий и позиций.
 * POST action=save_category | delete_category | save_item | delete_item.
 * Запись - только admin/cashier; чтение - admin/cashier/cook.
 */

require_once __DIR__ . '/helpers.php';

h_start_session();
crm_migrate();
crm_seed();

$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'GET') {
    $u = h_require_auth(['admin', 'cashier', 'cook', 'manager', 'owner']);
    $cats = db_fetch_all("SELECT c.*, (SELECT COUNT(*) FROM menu_items m WHERE m.category_id=c.id) AS items_cnt
                          FROM categories c ORDER BY c.sort, c.id");
    $items = db_fetch_all("SELECT m.*, c.name AS category FROM menu_items m LEFT JOIN categories c ON c.id=m.category_id
                           ORDER BY c.sort, m.sort, m.id");
    $dough = db_fetch_all("SELECT id, code, name FROM dough_types ORDER BY sort, id");
    $toppings = db_fetch_all("SELECT t.item_id, i.id AS ingredient_id, i.name AS ingredient_name, i.topping_price
                              FROM menu_toppings t JOIN ingredients i ON i.id=t.ingredient_id
                              WHERE i.active=1 AND i.topping_price>0 ORDER BY i.name");
    $ingredients = db_fetch_all("SELECT id, name, unit, topping_price, is_dough, is_base FROM ingredients WHERE active=1 ORDER BY id");
    $recipes = db_fetch_all("SELECT r.item_id, r.ingredient_id FROM recipes r JOIN ingredients i ON i.id=r.ingredient_id WHERE i.active=1 ORDER BY r.item_id, r.id");
    $mt = db_fetch_all("SELECT item_id, ingredient_id FROM menu_toppings ORDER BY item_id");
    h_json(['ok' => true, 'categories' => $cats, 'items' => $items, 'dough' => $dough, 'toppings' => $toppings,
            'ingredients' => $ingredients, 'recipes' => $recipes, 'menu_toppings' => $mt]);
}

if ($method !== 'POST') h_error('Метод не підтримується', 405);

$u = h_require_auth(['admin', 'cashier', 'manager', 'owner']);
$d = h_input();
if (!h_csrf_check($d['csrf'] ?? null)) h_error('Сесія застаріла', 403);
$action = $d['action'] ?? '';

switch ($action) {

    case 'save_category':
        $name = trim((string) ($d['name'] ?? ''));
        $id = (int) ($d['id'] ?? 0);
        $sort = (int) ($d['sort'] ?? 0);
        $active = !empty($d['active']) ? 1 : 0;
        if ($name === '' || mb_strlen($name) > 40) h_error('Вкажіть назву категорії', 400);
        if ($id) {
            db_update('categories', ['name' => $name, 'sort' => $sort, 'active' => $active], 'id=?', [$id]);
            crm_audit('category_update', 'category', (string) $id, $name);
        } else {
            $id = db_insert('categories', ['name' => $name, 'sort' => $sort, 'active' => $active]);
            crm_audit('category_create', 'category', (string) $id, $name);
        }
        h_json(['ok' => true, 'id' => $id]);
        break;

    case 'delete_category':
        $id = (int) ($d['id'] ?? 0);
        $cnt = db_scalar("SELECT COUNT(*) FROM menu_items WHERE category_id=?", [$id]);
        if ($cnt > 0) h_error('Спершу видаліть позиції цієї категорії', 400);
        db_delete('categories', 'id=?', [$id]);
        crm_audit('category_delete', 'category', (string) $id);
        h_json(['ok' => true]);
        break;

    case 'save_item':
        $name = trim((string) ($d['name'] ?? ''));
        $id = (int) ($d['id'] ?? 0);
        $cat = (int) ($d['category_id'] ?? 0);
        $price = round((float) ($d['price'] ?? 0), 2);
        $price40 = round((float) ($d['price40'] ?? 0), 2);
        $unit = trim((string) ($d['unit'] ?? 'шт'));
        $descr = trim((string) ($d['descr'] ?? ''));
        $img = trim((string) ($d['img'] ?? ''));
        $active = !empty($d['active']) ? 1 : 0;
        if ($name === '' || mb_strlen($name) > 80) h_error('Вкажіть назву позиції', 400);
        if ($price < 0 || $price > 100000) h_error('Невірна ціна', 400);
        if ($price40 < 0 || $price40 > 100000) h_error('Невірна ціна 40 см', 400);
        if ($cat && !db_fetch_one("SELECT id FROM categories WHERE id=?", [$cat])) h_error('Категорію не знайдено', 400);
        if ($img !== '' && !preg_match('#^uploads/menu/[A-Za-z0-9._\-]+\.(png|jpe?g|webp|gif)$#i', $img)) h_error('Невірний шлях до фото', 400);
        if ($id) {
            db_update('menu_items', ['category_id' => $cat, 'name' => $name, 'descr' => $descr, 'price' => $price, 'price40' => $price40, 'unit' => $unit, 'img' => $img, 'active' => $active, 'updated_at' => db_now()], 'id=?', [$id]);
            crm_audit('menu_update', 'menu_item', (string) $id, $name . ' / ' . $price . ' грн / 40 см: ' . $price40 . ' грн');
        } else {
            $id = db_insert('menu_items', [
                'category_id' => $cat, 'name' => $name, 'descr' => $descr, 'price' => $price, 'price40' => $price40, 'unit' => $unit,
                'active' => $active, 'sort' => 0, 'img' => $img,
                'created_at' => db_now(), 'updated_at' => db_now(),
            ]);
            crm_audit('menu_create', 'menu_item', (string) $id, $name . ' / ' . $price . ' грн / 40 см: ' . $price40 . ' грн');
        }
        h_json(['ok' => true, 'id' => $id]);
        break;

    case 'upload_image':
        $data = (string) ($d['data'] ?? '');
        if (!preg_match('#^data:image/(png|jpe?g|webp|gif);base64,(.+)$#is', $data, $m)) h_error('Невірний формат фото', 400);
        $ext = ['png' => 'png', 'jpg' => 'jpg', 'jpeg' => 'jpg', 'webp' => 'webp', 'gif' => 'gif'][strtolower($m[1])];
        $bin = base64_decode($m[2], true);
        if ($bin === false || $bin === '') h_error('Помилка декодування фото', 400);
        if (strlen($bin) > 4 * 1024 * 1024) h_error('Фото завелике (до 4 МБ)', 400);
        $dir = __DIR__ . '/../uploads/menu';
        if (!is_dir($dir) && !mkdir($dir, 0775, true)) h_error('Не вдалося створити папку uploads', 500);
        $name = 'menu_' . date('Ymd_His') . '_' . bin2hex(random_bytes(4)) . '.' . $ext;
        if (!@file_put_contents($dir . '/' . $name, $bin)) h_error('Не вдалося зберегти файл', 500);
        h_json(['ok' => true, 'img' => 'uploads/menu/' . $name]);
        break;

    case 'save_topping':
        // Додавання топінгу (доплатного інгредієнта) до позиції меню
        $item_id = (int) ($d['item_id'] ?? 0);
        $ingredient_id = (int) ($d['ingredient_id'] ?? 0);
        $price = round((float) ($d['price'] ?? 0), 2);
        if (!$item_id || !db_fetch_one("SELECT id FROM menu_items WHERE id=?", [$item_id])) h_error('Позицію меню не знайдено', 400);
        if (!$ingredient_id || !db_fetch_one("SELECT id FROM ingredients WHERE id=?", [$ingredient_id])) h_error('Інгредієнт не знайдено', 400);
        if ($price < 0 || $price > 100000) h_error('Невірна ціна топінгу', 400);
        db_q("UPDATE ingredients SET topping_price=? WHERE id=?", [$price, $ingredient_id]);
        db_q("INSERT OR IGNORE INTO menu_toppings (item_id, ingredient_id) VALUES (?, ?)", [$item_id, $ingredient_id]);
        crm_audit('topping_save', 'menu_item', (string) $item_id, 'топінг ' . $ingredient_id . ' / ' . $price . ' грн');
        h_json(['ok' => true]);
        break;

    case 'delete_topping':
        $item_id = (int) ($d['item_id'] ?? 0);
        $ingredient_id = (int) ($d['ingredient_id'] ?? 0);
        db_delete('menu_toppings', 'item_id=? AND ingredient_id=?', [$item_id, $ingredient_id]);
        crm_audit('topping_delete', 'menu_item', (string) $item_id, 'топінг ' . $ingredient_id);
        h_json(['ok' => true]);
        break;

    case 'save_compose':
        // Склад позиції: рецепт (можна прибрати) + добавки (з доплатою).
        $item_id = (int) ($d['item_id'] ?? 0);
        if (!$item_id || !db_fetch_one("SELECT id FROM menu_items WHERE id=?", [$item_id])) h_error('Позицію меню не знайдено', 400);
        $recipeIds = [];
        if (isset($d['recipe']) && is_array($d['recipe'])) {
            foreach ($d['recipe'] as $rid) {
                $rid = (int) $rid;
                if ($rid && db_fetch_one("SELECT id FROM ingredients WHERE id=?", [$rid])) $recipeIds[$rid] = true;
            }
        }
        $added = [];
        if (isset($d['added']) && is_array($d['added'])) {
            foreach ($d['added'] as $aid) {
                $aid = (int) $aid;
                if ($aid && db_fetch_one("SELECT id FROM ingredients WHERE id=?", [$aid])) $added[$aid] = true;
            }
        }
        // ціни добавок: id => price
        $prices = [];
        if (isset($d['prices']) && is_array($d['prices'])) {
            foreach ($d['prices'] as $aid => $price) {
                $aid = (int) $aid;
                if ($aid) $prices[$aid] = round((float) $price, 2);
            }
        }
        foreach ($added as $aid => $_) {
            $p = $prices[$aid] ?? 0;
            if ($p <= 0 || $p > 100000) $p = 0;
            db_q("UPDATE ingredients SET topping_price=? WHERE id=?", [$p, $aid]);
        }
        db_q("DELETE FROM recipes WHERE item_id=?", [$item_id]);
        foreach ($recipeIds as $rid => $_) {
            db_insert('recipes', ['item_id' => $item_id, 'ingredient_id' => $rid, 'qty' => 1]);
        }
        db_q("DELETE FROM menu_toppings WHERE item_id=?", [$item_id]);
        foreach ($added as $aid => $_) {
            db_q("INSERT OR IGNORE INTO menu_toppings (item_id, ingredient_id) VALUES (?, ?)", [$item_id, $aid]);
        }
        crm_audit('menu_compose', 'menu_item', (string) $item_id, 'рецепт ' . count($recipeIds) . ' / добавки ' . count($added));
        h_json(['ok' => true]);
        break;

    case 'delete_item':
        $id = (int) ($d['id'] ?? 0);
        $row = db_fetch_one("SELECT name FROM menu_items WHERE id=?", [$id]);
        if (!$row) h_error('Позицію не знайдено', 404);
        db_delete('menu_items', 'id=?', [$id]);
        db_delete('recipes', 'item_id=?', [$id]);
        crm_audit('menu_delete', 'menu_item', (string) $id, $row['name']);
        h_json(['ok' => true]);
        break;

    default:
        h_error('Невідома дія', 400);
}
