<?php
/**
 * Ядро логики заказов: общее для кассы (POS), заказов и сайта.
 * Всё считает сервер: цены из меню, скидки, списание склада, клиент.
 */

require_once __DIR__ . '/helpers.php';

/**
 * Типы теста для кастомизации пиццы.
 */
function crm_dough_list(): array {
    return db_fetch_all("SELECT id, code, name FROM dough_types WHERE active=1 ORDER BY sort, id");
}

/**
 * Нормализация опций кастомизации позиции: размер, тесто, убрать/добавить ингредиенты.
 * Сервер сам решает, что допустимо: 40 см — только при price40>0,
 * убрать можно только ингредиенты рецепта, добавить — только из menu_toppings (с ценой).
 */
function crm_parse_options(array $row, array $it): array {
    $raw = $it['options'] ?? [];
    if (!is_array($raw)) $raw = [];

    $size = 30;
    if ((int) ($raw['size'] ?? 30) === 40 && (float) ($row['price40'] ?? 0) > 0) $size = 40;

    $dough = 'thin';
    $doughCodes = array_column(crm_dough_list(), 'code');
    if (in_array((string) ($raw['dough'] ?? ''), $doughCodes, true)) $dough = (string) $raw['dough'];

    $recipeIds = array_column(db_fetch_all("SELECT ingredient_id FROM recipes WHERE item_id=?", [(int) $row['id']]), 'ingredient_id');
    $baseIds = array_column(db_fetch_all(
        "SELECT r.ingredient_id FROM recipes r JOIN ingredients i ON i.id=r.ingredient_id
         WHERE r.item_id=? AND i.is_base=1",
        [(int) $row['id']]
    ), 'ingredient_id');
    $removed = [];
    if (isset($raw['removed']) && is_array($raw['removed'])) {
        foreach ($raw['removed'] as $rid) {
            $rid = (int) $rid;
            if (in_array($rid, $recipeIds, true) && !in_array($rid, $baseIds, true) && !in_array($rid, $removed, true)) $removed[] = $rid;
        }
    }

    $toppingIds = array_column(db_fetch_all(
        "SELECT t.ingredient_id FROM menu_toppings t JOIN ingredients i ON i.id=t.ingredient_id
         WHERE t.item_id=? AND i.active=1 AND i.topping_price>0",
        [(int) $row['id']]
    ), 'ingredient_id');
    $added = [];
    if (isset($raw['added']) && is_array($raw['added'])) {
        foreach ($raw['added'] as $aid) {
            $aid = (int) $aid;
            if (in_array($aid, $toppingIds, true) && !in_array($aid, $added, true)) $added[] = $aid;
        }
    }

    return ['size' => $size, 'dough' => $dough, 'removed' => $removed, 'added' => $added];
}

/**
 * Цена позиции с учётом кастомизации: 40 см дороже, каждый добавленный ингредиент + его цена.
 */
function crm_line_price(array $row, array $opts): float {
    $price = $opts['size'] === 40 && (float) ($row['price40'] ?? 0) > 0
        ? (float) $row['price40']
        : (float) $row['price'];
    foreach ($opts['added'] as $aid) {
        $price += (float) db_scalar("SELECT topping_price FROM ingredients WHERE id=?", [$aid]);
    }
    return round($price, 2);
}

/**
 * Название позиции с кастомизацией для чека/карточки (напр. «Маргарита (40 см, пишне тісто) · без базиліка · +гриби»).
 */
function crm_line_name(array $row, array $opts): string {
    $name = (string) $row['name'];
    $suffix = [];
    if ($opts['size'] === 40) $suffix[] = '40 см';
    if ($opts['dough'] === 'fluffy') $suffix[] = 'пишне тісто';
    if ($suffix) $name .= ' (' . implode(', ', $suffix) . ')';
    if ($opts['removed']) {
        $names = [];
        foreach ($opts['removed'] as $rid) $names[] = db_scalar("SELECT name FROM ingredients WHERE id=?", [$rid]);
        $name .= ' · без ' . implode(', без ', $names);
    }
    if ($opts['added']) {
        $names = [];
        foreach ($opts['added'] as $aid) $names[] = db_scalar("SELECT name FROM ingredients WHERE id=?", [$aid]);
        $name .= ' · +' . implode(', +', $names);
    }
    return $name;
}

/**
 * Позиция недоступна (не хватает ингредиента)? Возвращает имя ингредиента или null.
 * Позиции без рецепта не отслеживаются.
 * $opts: кастомизация — убранные ингредиенты не проверяются, добавленные проверяются.
 */
function crm_ingredient_shortage(int $item_id, ?array $opts = null): ?string {
    $opts = $opts ?? [];
    $removed = $opts['removed'] ?? [];
    $recs = db_fetch_all(
        "SELECT i.name AS ing, i.stock, r.qty, r.ingredient_id FROM recipes r JOIN ingredients i ON i.id=r.ingredient_id WHERE r.item_id=?",
        [$item_id]
    );
    if ($recs) {
        foreach ($recs as $r) {
            if (in_array((int) $r['ingredient_id'], $removed, true)) continue;
            if ((float) $r['stock'] < (float) $r['qty']) return $r['ing'];
        }
    }
    foreach (($opts['added'] ?? []) as $aid) {
        $i = db_fetch_one("SELECT name, stock FROM ingredients WHERE id=?", [$aid]);
        if ($i && (float) $i['stock'] < 1) return $i['name'];
    }
    return null;
}

/**
 * Список item_id, которых нельзя продавать (стоп-лист по складу).
 */
function crm_stop_item_ids(): array {
    $ids = [];
    foreach (db_fetch_all("SELECT DISTINCT item_id FROM recipes") as $r) {
        if (crm_ingredient_shortage((int) $r['item_id'])) $ids[(int) $r['item_id']] = true;
    }
    return array_keys($ids);
}

/**
 * Проверка и расчёт промокода. Возвращает ['discount'=>n] или ['error'=>...].
 * $lines: [item_id, name, price, qty, category_id, total].
 */
function crm_promo_apply(string $code, array $lines, float $subtotal): array {
    $p = db_fetch_one("SELECT * FROM promocodes WHERE code=? AND active=1", [$code]);
    if (!$p) return ['error' => 'Промокод не знайдено'];
    $now = time();
    if (!empty($p['starts']) && strtotime($p['starts']) > $now) return ['error' => 'Промокод ще не діє'];
    if (!empty($p['ends']) && strtotime($p['ends']) < $now) return ['error' => 'Термін дії промокода минув'];
    if ((int) $p['max_uses'] && (int) $p['used'] >= (int) $p['max_uses']) return ['error' => 'Ліміт використань вичерпано'];
    if ($subtotal < (float) $p['min_total']) return ['error' => 'Мінімальна сума замовлення: ' . (float) $p['min_total'] . ' грн'];

    $discount = 0.0;
    $cat = (int) $p['category_id'];
    if ($p['kind'] === 'percent') {
        $base = $subtotal;
        if ($cat) {
            $base = 0;
            foreach ($lines as $l) if ((int) $l['category_id'] === $cat) $base += (float) $l['total'];
            if ($base <= 0) return ['error' => 'У кошику немає позицій цієї категорії'];
        }
        $discount = $base * ((float) $p['value'] / 100);
    } elseif ($p['kind'] === 'fixed') {
        $discount = min((float) $p['value'], $subtotal);
    } elseif ($p['kind'] === 'bogo') {
        // 2 по ціні 1: знижка = найдешевша позиція кошика
        $totalQty = 0;
        $minPrice = INF;
        foreach ($lines as $l) {
            $totalQty += (int) $l['qty'];
            $minPrice = min($minPrice, (float) $l['price']);
        }
        if ($totalQty < 2) return ['error' => 'Для цього промокода потрібно мінімум 2 позиції'];
        $discount = $minPrice;
    }
    if ($discount > $subtotal) $discount = $subtotal;
    return ['discount' => round($discount, 2)];
}

/**
 * Списание ингредиентов по рецепту позиции (расход на порции).
 * $opts: кастомизация — 40 см расход ×1.33, убранные ингредиенты не списываются,
 * добавленные топпинги списываются отдельно.
 */
function crm_stock_consume(int $item_id, int $order_id, array $opts = []): void {
    $removed = $opts['removed'] ?? [];
    $k = $opts['size'] === 40 ? 40 / 30 : 1;
    foreach (db_fetch_all("SELECT ingredient_id, qty FROM recipes WHERE item_id=?", [$item_id]) as $r) {
        if (in_array((int) $r['ingredient_id'], $removed, true)) continue;
        $qty = round((float) $r['qty'] * $k, 3);
        db_q("UPDATE ingredients SET stock = round(stock - ?, 4) WHERE id=?", [$qty, (int) $r['ingredient_id']]);
        db_insert('stock_movements', [
            'ingredient_id' => (int) $r['ingredient_id'],
            'kind' => 'out',
            'qty' => $qty,
            'order_id' => $order_id,
            'user_id' => $_SESSION['uid'] ?? null,
            'note' => 'Списання за замовленням',
            'created_at' => db_now(),
        ]);
    }
    foreach (($opts['added'] ?? []) as $aid) {
        $i = db_fetch_one("SELECT topping_price FROM ingredients WHERE id=?", [$aid]);
        $qty = $i ? round((float) $i['topping_price'] > 0 ? 1 * $k : 1 * $k, 3) : 1;
        db_q("UPDATE ingredients SET stock = round(stock - ?, 4) WHERE id=?", [$qty, (int) $aid]);
        db_insert('stock_movements', [
            'ingredient_id' => (int) $aid,
            'kind' => 'out',
            'qty' => $qty,
            'order_id' => $order_id,
            'user_id' => $_SESSION['uid'] ?? null,
            'note' => 'Доданий інгредієнт',
            'created_at' => db_now(),
        ]);
    }
}

/**
 * Возврат ингредиентов при отмене/редактировании (обратно списанию, с учётом кастомизации).
 */
function crm_stock_refund(int $item_id, int $order_id, array $opts = []): void {
    $removed = $opts['removed'] ?? [];
    $k = $opts['size'] === 40 ? 40 / 30 : 1;
    foreach (db_fetch_all("SELECT ingredient_id, qty FROM recipes WHERE item_id=?", [$item_id]) as $r) {
        if (in_array((int) $r['ingredient_id'], $removed, true)) continue;
        $qty = round((float) $r['qty'] * $k, 3);
        db_q("UPDATE ingredients SET stock = round(stock + ?, 4) WHERE id=?", [$qty, (int) $r['ingredient_id']]);
        db_insert('stock_movements', [
            'ingredient_id' => (int) $r['ingredient_id'],
            'kind' => 'in',
            'qty' => $qty,
            'order_id' => $order_id,
            'user_id' => $_SESSION['uid'] ?? null,
            'note' => 'Повернення за замовленням',
            'created_at' => db_now(),
        ]);
    }
    foreach (($opts['added'] ?? []) as $aid) {
        db_q("UPDATE ingredients SET stock = round(stock + 1, 4) WHERE id=?", [(int) $aid]);
        db_insert('stock_movements', [
            'ingredient_id' => (int) $aid,
            'kind' => 'in',
            'qty' => 1,
            'order_id' => $order_id,
            'user_id' => $_SESSION['uid'] ?? null,
            'note' => 'Повернення доданого інгредієнта',
            'created_at' => db_now(),
        ]);
    }
}

/**
 * Создание заказа. Источник: 'pos' (каса) или 'site' (витрина).
 * Вход: items[{item_id,qty,options?}], phone, name, delivery_type, payment, street/house/apartment/entrance, promo_code, comment.
 * options: {size:30|40, dough:'thin'|'fluffy', removed:[ingredient_id], added:[ingredient_id]}.
 * Выход: массив с order_id/num/total/subtotal/discount ИЛИ ['error'].
 */
function crm_create_order(array $d, string $source): array {
    $items = $d['items'] ?? [];
    if (!is_array($items) || !count($items)) return ['error' => 'Кошик порожній'];
    if (count($items) > 40) return ['error' => 'Забагато позицій у кошику'];

    $delivery = in_array($d['delivery_type'] ?? '', ['courier', 'pickup', 'dinein'], true) ? $d['delivery_type'] : 'courier';
    $payment = in_array($d['payment'] ?? '', ['cash', 'card_at_door', 'card_online'], true) ? $d['payment'] : 'cash';

    $lines = [];
    foreach ($items as $it) {
        $item_id = (int) ($it['item_id'] ?? 0);
        $qty = (int) ($it['qty'] ?? 1);
        if ($qty < 1 || $qty > 99) return ['error' => 'Невірна кількість позиції'];
        $row = db_fetch_one("SELECT id, category_id, name, price, price40, active FROM menu_items WHERE id=?", [$item_id]);
        if (!$row) return ['error' => 'Позицію меню не знайдено'];
        if (!$row['active']) return ['error' => 'Позиція "' . $row['name'] . '" вимкнена'];
        $opts = crm_parse_options($row, $it);
        $short = crm_ingredient_shortage($item_id, $opts);
        if ($short) return ['error' => 'Позиція "' . $row['name'] . '" недоступна (немає: ' . $short . ')'];
        $price = crm_line_price($row, $opts);
        $lines[] = [
            'item_id' => $item_id,
            'category_id' => (int) $row['category_id'],
            'name' => crm_line_name($row, $opts),
            'price' => $price,
            'qty' => $qty,
            'total' => round($price * $qty, 2),
            'options' => $opts,
        ];
    }

    $phone = crm_phone_normalize((string) ($d['phone'] ?? ''));
    $name = trim((string) ($d['name'] ?? ''));
    if ($name !== '' && h_bad_name($name)) return ['error' => 'Вкажіть коректне ім\'я'];

    // Телефон необов'язковий (замовлення на місці без контактів). Якщо вказаний —
    // будь-який номер з 5-15 цифр (без прив'язки до +380/України).
    $client_id = null;
    if ($phone !== '') {
        if (!preg_match('/^\d{5,15}$/', $phone)) return ['error' => 'Невірний номер телефону'];
        $client = db_fetch_one("SELECT * FROM clients WHERE phone=?", [$phone]);
        if ($client && (int) $client['blacklist'] === 1) return ['error' => 'Клієнта заблоковано. Зверніться в підтримку'];
        if ($client) {
            $client_id = (int) $client['id'];
            if ($client['name'] === '' && $name !== '') db_update('clients', ['name' => $name], 'id=?', [$client_id]);
        } else {
            $client_id = db_insert('clients', [
                'phone' => $phone,
                'name' => $name,
                'address' => trim((string) ($d['address'] ?? '')),
                'blacklist' => 0,
                'notes' => '',
                'created_at' => db_now(),
            ]);
        }
    }

    $subtotal = 0.0;
    foreach ($lines as $l) $subtotal += $l['total'];

    $promo_code = strtoupper(trim((string) ($d['promo_code'] ?? '')));
    $discount = 0.0;
    if ($promo_code !== '') {
        $r = crm_promo_apply($promo_code, $lines, $subtotal);
        if (isset($r['error'])) return ['error' => $r['error']];
        $discount = $r['discount'];
    }
    $total = round($subtotal - $discount, 2);
    if ($total < 0) $total = 0;

    $address = '';
    if ($delivery === 'courier') {
        $street = trim((string) ($d['street'] ?? ''));
        $house = trim((string) ($d['house'] ?? ''));
        $apartment = trim((string) ($d['apartment'] ?? ''));
        $entrance = trim((string) ($d['entrance'] ?? ''));
        if (h_bad_street($street)) return ['error' => 'Вкажіть вулицю доставки'];
        if ($house === '' || h_bad_house($house)) return ['error' => 'Вкажіть номер будинку'];
        $address = $street . ', ' . $house;
        if ($apartment !== '') $address .= ', кв. ' . $apartment;
        if ($entrance !== '') $address .= ', ' . $entrance;
    } elseif ($delivery === 'pickup') {
        $biz = crm_business();
        $address = 'Самовивіз: ' . $biz['address'];
    }

    $comment = trim((string) ($d['comment'] ?? ''));
    if (mb_strlen($comment) > 300) return ['error' => 'Коментар занадто довгий'];

    // Кур'єр: явний вибір при створенні або авто (round-robin при переході в delivering).
    // Для джерела 'site' кур'єр не обирається.
    $courier_id = null;
    if ($delivery === 'courier' && $source === 'pos') {
        $cid = (int) ($d['courier_id'] ?? 0);
        if ($cid > 0) {
            $cr = db_fetch_one("SELECT id FROM users WHERE id=? AND role='courier' AND active=1", [$cid]);
            if (!$cr) return ['error' => 'Кур\'єра не знайдено'];
            $courier_id = $cid;
        }
    }

    $now = db_now();
    $order_id = db_insert('orders', [
        'num' => '',
        'client_id' => $client_id,
        'status' => 'new',
        'source' => $source,
        'delivery_type' => $delivery,
        'address' => $address,
        'contact_name' => $name,
        'contact_phone' => $phone,
        'payment' => $payment,
        'pay_status' => $delivery === 'dinein' ? 'paid' : 'pending',
        'courier_id' => $courier_id,
        'subtotal' => round($subtotal, 2),
        'discount' => $discount,
        'total' => $total,
        'promo_code' => $promo_code,
        'comment' => $comment,
        'operator_id' => $_SESSION['uid'] ?? null,
        'created_at' => $now,
        'updated_at' => $now,
        'closed_at' => null,
    ]);
    $num = crm_order_num($order_id);
    db_update('orders', ['num' => $num], 'id=?', [$order_id]);

    foreach ($lines as $l) {
        db_insert('order_items', [
            'order_id' => $order_id,
            'item_id' => $l['item_id'],
            'name' => $l['name'],
            'price' => $l['price'],
            'qty' => $l['qty'],
            'total' => $l['total'],
            'options' => json_encode($l['options'], JSON_UNESCAPED_UNICODE),
        ]);
        crm_stock_consume($l['item_id'], $order_id, $l['options']);
    }
    if ($promo_code !== '') db_q("UPDATE promocodes SET used=used+1 WHERE code=?", [$promo_code]);

    crm_audit('order_create', 'order', (string) $order_id, $num . ' / ' . $total . ' грн / ' . $source);
    if (TG_BOT_TOKEN !== '') {
        $biz = crm_business();
        $itemLines = '';
        foreach ($lines as $l) $itemLines .= '- ' . $l['qty'] . 'x ' . $l['name'] . ' = ' . $l['total'] . " грн\n";
        h_tg_send(
            "<b>Нове замовлення " . $num . "</b>\n" .
            ($delivery === 'pickup' ? 'Самовивіз' : ($delivery === 'dinein' ? 'На місці' : 'Доставка')) . "\n" .
            $itemLines .
            "Сума: <b>" . $total . " грн</b>\n" .
            ($name !== '' ? "Клієнт: " . $name . ", " . ($phone !== '' ? $phone : 'без телефону') . "\n" : '') .
            ($address !== '' ? "Адреса: " . $address . "\n" : '') .
            "Оплата: " . ($payment === 'cash' ? 'готівка' : $payment) . ($delivery === 'dinein' ? ' (оплачено)' : '')
        );
    }

    return ['order_id' => $order_id, 'num' => $num, 'total' => $total, 'subtotal' => $subtotal, 'discount' => $discount];
}

/**
 * Кур'єри зі статусом зайнятості (Етап 8).
 * status: 'busy' якщо є призначені замовлення в роботі (new/cooking/delivering).
 */
function crm_courier_list(): array {
    $rows = db_fetch_all("SELECT id, username, role, name, active FROM users WHERE role='courier' ORDER BY id");
    $out = [];
    foreach ($rows as $c) {
        $orders = db_fetch_all(
            "SELECT id, num, status, total FROM orders WHERE courier_id=? AND status IN ('new','cooking','delivering') ORDER BY id",
            [(int) $c['id']]
        );
        $out[] = [
            'id' => (int) $c['id'],
            'username' => $c['username'],
            'name' => $c['name'],
            'active' => (int) $c['active'],
            'status' => $orders ? 'busy' : 'free',
            'orders' => $orders,
        ];
    }
    return $out;
}
