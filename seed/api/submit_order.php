<?php
/**
 * Приём заказа.
 *
 * POST api/submit_order.php
 * Body: { items: [{id, qty}], customer: {name, phone, address}, payment, comment, delivery_type }
 * delivery_type: 'courier' (доставка) или 'pickup' (самовивіз). При самовивозі
 * адреса не потрібна - в замовлення підставляється адреса закладу з config.php.
 *
 * Заказ сохраняется в SQLite (api/data/forno.db). Цены и названия берутся ТОЛЬКО
 * из серверного меню, значения цены и total от клиента игнорируются (клиент не
 * может «прислать» цену). Rate limit по IP настраивается в config.php. Кросс-
 * доменные POST отклоняются. При заполненном Telegram-токене заведению уходит
 * уведомление.
 */

require_once __DIR__ . '/forno_db.php';

header('Content-Type: application/json; charset=utf-8');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    forno_respond(405, ['ok' => false, 'error' => 'method not allowed']);
}

/* ---------- защита от кросс-доменной отправки (CSRF-минимализм) ---------- */
$origin = isset($_SERVER['HTTP_ORIGIN']) ? trim((string)$_SERVER['HTTP_ORIGIN']) : '';
if ($origin !== '') {
    $originHost = (string)parse_url($origin, PHP_URL_HOST);
    $expectHost = preg_replace('/:\d+$/', '', (string)($_SERVER['HTTP_HOST'] ?? ''));
    if ($originHost === '' || $originHost !== $expectHost) {
        forno_respond(403, ['ok' => false, 'error' => 'forbidden origin']);
    }
}

/* ---------- rate limit ---------- */
if (!forno_rate_limit_ok()) {
    forno_respond(429, ['ok' => false, 'error' => 'занадто багато замовлень, зачекайте хвилину']);
}

$raw  = file_get_contents('php://input');
$data = json_decode($raw, true);

if (!is_array($data) || empty($data['items']) || !is_array($data['items'])) {
    forno_respond(400, ['ok' => false, 'error' => 'empty items']);
}

/* ---------- згода на обробку персональних даних (обов'язкова) ---------- */
if (empty($data['consent'])) {
    forno_respond(400, ['ok' => false, 'error' => 'Потрібна згода на обробку персональних даних.']);
}

/* ---------- состав: цены только из серверного меню ---------- */
$menu = forno_menu();
$items = [];
$total = 0;

foreach ($data['items'] as $it) {
    if (!is_array($it)) {
        forno_respond(400, ['ok' => false, 'error' => 'bad item']);
    }
    $id  = isset($it['id']) ? trim((string)$it['id']) : '';
    $qty = isset($it['qty']) ? (int)$it['qty'] : 0;

    if ($id === '' || $qty <= 0 || $qty > 99) {
        forno_respond(400, ['ok' => false, 'error' => 'bad item']);
    }
    if (!isset($menu[$id])) {
        forno_respond(400, ['ok' => false, 'error' => 'unknown item: ' . $id]);
    }

    $price = (int)$menu[$id]['price'];
    $items[] = ['id' => $id, 'name' => $menu[$id]['name'], 'price' => $price, 'qty' => $qty];
    $total += $price * $qty;
}

/* ---------- клиент ---------- */
$customer = isset($data['customer']) && is_array($data['customer']) ? $data['customer'] : [];

$name      = isset($customer['name'])    ? mb_substr(trim((string)$customer['name']), 0, 100)    : '';
$phone     = isset($customer['phone'])   ? mb_substr(trim((string)$customer['phone']), 0, 30)    : '';
$city      = isset($customer['city'])    ? mb_substr(trim((string)$customer['city']), 0, 60)     : '';
$street    = isset($customer['street'])  ? mb_substr(trim((string)$customer['street']), 0, 120)  : '';
$house     = isset($customer['house'])   ? mb_substr(trim((string)$customer['house']), 0, 20)    : '';
$apartment = isset($customer['apartment'])? mb_substr(trim((string)$customer['apartment']), 0, 30) : '';
$entrance  = isset($customer['entrance']) ? mb_substr(trim((string)$customer['entrance']), 0, 60) : '';
$address   = isset($customer['address']) ? mb_substr(trim((string)$customer['address']), 0, 200) : '';
$comment   = isset($data['comment'])     ? mb_substr(trim((string)$data['comment']), 0, 500)     : '';

if (forno_bad_name($name)) {
    forno_respond(400, ["ok" => false, "error" => "Вкажіть справжнє ім'я."]);
}
if (forno_bad_phone($phone)) {
    forno_respond(400, ['ok' => false, 'error' => 'Телефон виглядає неповним.']);
}
if (!forno_city_ok($city)) {
    forno_respond(400, ['ok' => false, 'error' => 'Ми доставляємо лише у: ' . implode(', ', forno_cities()) . '.']);
}

/* тип отримання: доставка кур'єром або самовивіз */
$deliveryType = (isset($data['delivery_type']) && $data['delivery_type'] === 'pickup') ? 'pickup' : 'courier';

/* адреса: сервер збирає її сам із полів, клієнтський `address` не довіряється */
if ($deliveryType === 'pickup') {
    $cfg = forno_config();
    $pickupAddr = trim((string)($cfg['pickup_address'] ?? 'Самовивіз'));
    $address = 'Самовивіз' . ($pickupAddr !== '' ? ': ' . $pickupAddr : '');
} elseif ($street !== '' && $house !== '') {
    if (forno_bad_street($street)) {
        forno_respond(400, ['ok' => false, 'error' => 'Вкажіть назву вулиці, будь ласка.']);
    }
    if (forno_bad_house($house)) {
        forno_respond(400, ['ok' => false, 'error' => 'Перевірте номер будинку: цифри, можна з літерою (напр. 12 або 12А).']);
    }
    $address = $street . ', ' . $house;
    if ($apartment !== '') {
        $address .= ', кв. ' . $apartment;
    }
    if ($entrance !== '') {
        $address .= ', ' . $entrance;
    }
} elseif (forno_bad_address($address)) {
    forno_respond(400, ['ok' => false, 'error' => 'Вкажіть адресу: вулицю і номер будинку.']);
}

$paymentRaw = $data['payment'] ?? 'cash';
$payment = in_array($paymentRaw, ['cash', 'card'], true)
    ? (string)$paymentRaw
    : 'cash';

/* ---------- сохранение ---------- */
$orderId = 'F-' . strtoupper(base_convert((string)(microtime(true) * 10000), 10, 36));
$created = date('c');

$pdo = forno_db();
$stmt = $pdo->prepare(
    'INSERT INTO orders (id, created, status, customer_name, customer_phone,
                         customer_city, customer_address, delivery_type, payment, comment, total, items)
     VALUES (?, ?, \'new\', ?, ?, ?, ?, ?, ?, ?, ?, ?)'
);
$stmt->execute([
    $orderId,
    $created,
    $name,
    $phone,
    $city,
    $address,
    $deliveryType,
    $payment,
    $comment,
    $total,
    json_encode($items, JSON_UNESCAPED_UNICODE),
]);

/* ---------- уведомление заведению ---------- */
$lines = ['Нове замовлення <b>' . $orderId . '</b>'];
foreach ($items as $it) {
    $lines[] = $it['qty'] . ' × ' . $it['name'] . ' - ' . $it['price'] * $it['qty'] . ' ₴';
}
$lines[] = 'Разом: <b>' . $total . ' ₴</b>';
$lines[] = $name . ', ' . $phone;
$lines[] = ($deliveryType === 'pickup' ? 'Самовивіз: ' : 'Доставка: ') . $address;
if ($comment !== '') {
    $lines[] = '«' . $comment . '»';
}
forno_send_telegram(implode("\n", $lines));

forno_respond(200, ['ok' => true, 'order_id' => $orderId, 'total' => $total, 'created' => $created]);

/* ---------- валидация (сервер - источник правды, клиент можно обойти) ---------- */

/** Нормализация телефона к цифрам. */
function forno_phone_digits($phone) {
    return preg_replace('/\D+/', '', (string)$phone);
}

/** Украинский номер: 0XXXXXXXXX (10 цифр) или 380XXXXXXXXX (12 цифр). */
function forno_bad_phone($phone) {
    $d = forno_phone_digits($phone);
    return !(preg_match('/^0\d{9}$/', $d) || preg_match('/^380\d{9}$/', $d));
}

/** Имя: минимум 2 символа, только буквы/пробел/дефис/апостроф, минимум 2 буквы. */
function forno_bad_name($name) {
    $n = trim((string)$name);
    if (mb_strlen($n) < 2 || mb_strlen($n) > 100) return true;
    if (!preg_match('/^[a-zа-яіїєґ\'\’\- ]+$/iu', $n)) return true;
    if (!preg_match('/[a-zа-яіїєґ]{2}/iu', $n)) return true;
    return forno_is_junk($n);
}

/** Улица: минимум 3 символа, минимум 2 буквы, не мусор. */
function forno_bad_street($street) {
    $s = trim((string)$street);
    if (mb_strlen($s) < 3 || mb_strlen($s) > 120) return true;
    if (!preg_match('/[a-zа-яіїєґ]{2,}/iu', $s)) return true;
    return forno_is_junk($s);
}

/** Дом: цифры (до 5), опционально одна буква или дробь типа 12А / 12/2. */
function forno_bad_house($house) {
    $h = trim((string)$house);
    if ($h === '' || mb_strlen($h) > 20) return true;
    return !preg_match('/^[0-9]{1,5}(?:[a-zа-яіїєґ]|[-\\/][0-9]{1,3})?$/iu', $h);
}

/** Адрес (legacy): минимум 8 символов, есть буквы и номер дома (цифра), не мусор. */
function forno_bad_address($address) {
    $a = trim((string)$address);
    if (mb_strlen($a) < 8 || mb_strlen($a) > 200) return true;
    if (!preg_match('/\d/', $a)) return true;           // номер дома обязателен
    if (!preg_match('/[a-zа-яіїєґ]/iu', $a)) return true; // есть название улицы
    return forno_is_junk($a);
}

/** Мусорные строки: одно и то же повторяется, либо известное слово-заглушка. */
function forno_is_junk($s) {
    $clean = mb_strtolower(preg_replace('/[^\p{L}\p{N}]+/u', '', $s));
    if ($clean === '') return true;
    if (count(array_unique(mb_str_split($clean))) === 1) return true; // «аааа», «1111»
    $junk = ['тест', 'test', 'qwe', 'йцу', 'фыв', 'asd', 'lol', 'немає', 'нет', 'xз'];
    foreach ($junk as $j) {
        if (mb_strpos($clean, $j) !== false) return true;
    }
    return false;
}
