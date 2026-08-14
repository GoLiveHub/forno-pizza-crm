<?php
/**
 * Общий слой базы данных (SQLite) и утилиты.
 *
 * Один файл, ничего настраивать не нужно: БД создаётся сама в api/data/forno.db
 * при первом обращении, таблицы создаются, меню с ценами заполняется из массива
 * MENU ниже (серверный источник правды по ценам).
 *
 * Фронтенд показывает те же цены через api/menu.php (см. js/menu.js).
 * Цены, которые клиент присылает в заказе, сервером игнорируются.
 */

require_once __DIR__ . '/config.php';

/* ---------- продакшн-режим ошибок ----------
   Не светить путями/SQL клиенту: ошибки в лог, клиенту - аккуратный JSON.
   (php.ini display_errors=Off ставится и в .htaccess, тут страхуемся.) */
ini_set('display_errors', '0');
ini_set('log_errors', '1');

set_exception_handler(function ($e) {
    error_log('FORNO error: ' . $e->getMessage() . ' in ' . $e->getFile() . ':' . $e->getLine());
    if (php_sapi_name() !== 'cli' && !headers_sent()) {
        http_response_code(500);
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode(['ok' => false, 'error' => 'internal error'], JSON_UNESCAPED_UNICODE);
    }
    exit(1);
});

function forno_respond($code, $payload) {
    http_response_code($code);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($payload, JSON_UNESCAPED_UNICODE);
    exit;
}

function forno_config() {
    return require __DIR__ . '/config.php';
}

/* ---------- города доставки ---------- */

function forno_cities() {
    $cfg = forno_config();
    $cities = $cfg['delivery_cities'] ?? ['Київ'];
    if (!is_array($cities) || $cities === []) {
        $cities = ['Київ'];
    }
    return array_values(array_unique(array_map('trim', $cities)));
}

/** Только для проверки: город принят, если он есть в списке (без учёта регистра). */
function forno_city_ok($city) {
    $city = mb_strtolower(trim((string)$city));
    if ($city === '') return false;
    foreach (forno_cities() as $c) {
        if (mb_strtolower($c) === $city) return true;
    }
    return false;
}

/* ---------- меню: серверный источник правды ---------- */
/* Дублирует js/menu-data.js. Цены меняются здесь, а не в браузере клиента. */

function forno_menu_seed() {
    return [
        ['id' => 'marinara',   'cat' => 'pizza',   'name' => 'Маргарита',           'desc' => 'Сан-марцано, фьорділатте, базилік, оливкова олія', 'weight' => '450 г', 'price' => 560, 'tag' => 'хіт'],
        ['id' => 'diavola',    'cat' => 'pizza',   'name' => 'Діавола',              'desc' => 'Сан-марцано, гостра салямі, моцарела, базилік', 'weight' => '460 г', 'price' => 640, 'tag' => 'хіт'],
        ['id' => 'prosciutto', 'cat' => 'pizza',   'name' => 'Прошутто',             'desc' => 'Сан-марцано, прошутто крудо, рукола, пармезан', 'weight' => '460 г', 'price' => 690, 'tag' => ''],
        ['id' => 'quattro',    'cat' => 'pizza',   'name' => 'Кватро Формаджі',      'desc' => 'Моцарела, горгонзола, пармезан, таледжо, мед', 'weight' => '470 г', 'price' => 720, 'tag' => ''],
        ['id' => 'calzone',    'cat' => 'pizza',   'name' => 'Кальцоне',             'desc' => 'Півмісяць: рикота, прошутто, моцарела', 'weight' => '520 г', 'price' => 700, 'tag' => ''],
        ['id' => 'truffle',    'cat' => 'pizza',   'name' => 'Трюфель',              'desc' => 'Вершки, печериці, таледжо, трюфельна олія', 'weight' => '480 г', 'price' => 890, 'tag' => 'хіт'],

        ['id' => 'focaccia',   'cat' => 'snack',   'name' => 'Фокача',               'desc' => 'Тісто 48 годин, розмарин, морська сіль', 'weight' => '300 г', 'price' => 260, 'tag' => ''],
        ['id' => 'bruschetta', 'cat' => 'snack',   'name' => 'Брускетта',            'desc' => 'Хліб на грилі, томати конфі, базилікова олія', 'weight' => '160 г', 'price' => 320, 'tag' => ''],
        ['id' => 'arancini',   'cat' => 'snack',   'name' => 'Аранчіні',             'desc' => 'Рисові кульки з моцарелою, печені в печі', 'weight' => '220 г', 'price' => 380, 'tag' => 'нове'],
        ['id' => 'nduja',      'cat' => 'snack',   'name' => 'Ндуя з медом',         'desc' => 'Гостра ковбаса, акацієвий мед, фокача', 'weight' => '180 г', 'price' => 290, 'tag' => ''],

        ['id' => 'tiramisu',   'cat' => 'dessert', 'name' => 'Тірамісу',             'desc' => 'Савоярді, маскарпоне, еспресо, какао', 'weight' => '180 г', 'price' => 420, 'tag' => 'хіт'],
        ['id' => 'tartaletta', 'cat' => 'dessert', 'name' => 'Лимонна тарталетка',   'desc' => 'Лимонний крем, меренга, сушений лимон', 'weight' => '140 г', 'price' => 390, 'tag' => ''],
        ['id' => 'gelato',     'cat' => 'dessert', 'name' => 'Джелато',              'desc' => 'Дві кульки, смак дня', 'weight' => '160 г', 'price' => 340, 'tag' => ''],
        ['id' => 'cannoli',    'cat' => 'dessert', 'name' => 'Канолі',               'desc' => 'Хрустка трубочка з рикотою та фісташкою', 'weight' => '120 г', 'price' => 380, 'tag' => ''],

        ['id' => 'limonade',   'cat' => 'drink',   'name' => 'Лимонад',              'desc' => 'Цитрус або імбир, ручна газація', 'weight' => '400 мл', 'price' => 240, 'tag' => ''],
        ['id' => 'aperol',     'cat' => 'drink',   'name' => 'Апероль шприц',        'desc' => 'Апероль, просеко, содова, апельсин', 'weight' => '250 мл', 'price' => 420, 'tag' => ''],
        ['id' => 'espresso',   'cat' => 'drink',   'name' => 'Еспресо',              'desc' => 'Суміш зерен, коротка чашка', 'weight' => '40 мл', 'price' => 180, 'tag' => ''],
        ['id' => 'vino',       'cat' => 'drink',   'name' => 'Безалкогольне вино',   'desc' => 'Глок або розе, келих', 'weight' => '150 мл', 'price' => 290, 'tag' => ''],
    ];
}

function forno_db() {
    static $pdo = null;
    if ($pdo !== null) return $pdo;

    $dir = __DIR__ . '/data';
    if (!is_dir($dir)) {
        mkdir($dir, 0775, true);
    }

    $pdo = new PDO('sqlite:' . $dir . '/forno.db');
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);

    $pdo->exec('CREATE TABLE IF NOT EXISTS menu (
        id     TEXT PRIMARY KEY,
        cat    TEXT NOT NULL DEFAULT \'\',
        name   TEXT NOT NULL,
        desc   TEXT NOT NULL DEFAULT \'\',
        weight TEXT NOT NULL DEFAULT \'\',
        price  INTEGER NOT NULL DEFAULT 0,
        tag    TEXT NOT NULL DEFAULT \'\'
    )');

    $pdo->exec('CREATE TABLE IF NOT EXISTS orders (
        id              TEXT PRIMARY KEY,
        created         TEXT NOT NULL,
        status          TEXT NOT NULL DEFAULT \'new\',
        customer_name   TEXT NOT NULL DEFAULT \'\',
        customer_phone  TEXT NOT NULL DEFAULT \'\',
        customer_city   TEXT NOT NULL DEFAULT \'\',
        customer_address TEXT NOT NULL DEFAULT \'\',
        delivery_type   TEXT NOT NULL DEFAULT \'courier\',
        payment         TEXT NOT NULL DEFAULT \'cash\',
        comment         TEXT NOT NULL DEFAULT \'\',
        total           INTEGER NOT NULL DEFAULT 0,
        items           TEXT NOT NULL DEFAULT \'[]\'
    )');

    // Миграция старых баз: добавляем customer_city / delivery_type, если колонок ещё нет
    $cols = $pdo->query('PRAGMA table_info(orders)')->fetchAll();
    $has  = array_fill_keys(array_column($cols, 'name'), true);
    if (!isset($has['customer_city'])) {
        $pdo->exec('ALTER TABLE orders ADD COLUMN customer_city TEXT NOT NULL DEFAULT \'\'');
    }
    if (!isset($has['delivery_type'])) {
        $pdo->exec('ALTER TABLE orders ADD COLUMN delivery_type TEXT NOT NULL DEFAULT \'courier\'');
    }

    $pdo->exec('CREATE TABLE IF NOT EXISTS rate_limit (
        ip TEXT NOT NULL,
        ts INTEGER NOT NULL
    )');

    $pdo->exec('CREATE TABLE IF NOT EXISTS login_rate_limit (
        ip TEXT NOT NULL,
        ts INTEGER NOT NULL
    )');

    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created)');
    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_rate_ip ON rate_limit(ip, ts)');

    // Хранение заказов: старые заказы удаляются автоматически. Срок задаётся в
    // config.php (orders_retention_days); это реализация права на удаление
    // данных, декларированного в privacy.html. 0 = хранить вечно.
    $retention = (int)(forno_config()['orders_retention_days'] ?? 730);
    if ($retention > 0) {
        $cut = time() - $retention * 86400;
        $old = $pdo->query('SELECT id, created FROM orders')->fetchAll();
        foreach ($old as $r) {
            $ts = strtotime((string)$r['created']);
            if ($ts !== false && $ts < $cut) {
                $pdo->prepare('DELETE FROM orders WHERE id = ?')->execute([$r['id']]);
            }
        }
    }

    // Сид меню при первом запуске
    $count = (int)$pdo->query('SELECT COUNT(*) FROM menu')->fetchColumn();
    if ($count === 0) {
        $stmt = $pdo->prepare(
            'INSERT INTO menu (id, cat, name, desc, weight, price, tag) VALUES (?, ?, ?, ?, ?, ?, ?)'
        );
        foreach (forno_menu_seed() as $m) {
            $stmt->execute([$m['id'], $m['cat'], $m['name'], $m['desc'], $m['weight'], $m['price'], $m['tag']]);
        }
    }

    return $pdo;
}

/** Возвращает меню из БД как массив: id => ['id','cat','name','desc','weight','price','tag'] */
function forno_menu() {
    $rows = forno_db()->query('SELECT * FROM menu')->fetchAll();
    $map = [];
    foreach ($rows as $r) {
        $map[$r['id']] = $r;
    }
    return $map;
}

/* ---------- сессия админа ---------- */

function forno_session_start() {
    if (session_status() === PHP_SESSION_ACTIVE) return;
    session_set_cookie_params([
        'lifetime' => 0,
        'path'     => '/',
        'httponly' => true,
        'samesite' => 'Lax',
        'secure'   => !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off',
    ]);
    session_name('FORNO_SESS');
    session_start();
}

function forno_is_admin() {
    forno_session_start();
    return !empty($_SESSION['admin']);
}

function forno_csrf_token() {
    if (empty($_SESSION['csrf'])) {
        $_SESSION['csrf'] = bin2hex(random_bytes(16));
    }
    return $_SESSION['csrf'];
}

function forno_check_csrf($token) {
    return !empty($_SESSION['csrf']) && hash_equals($_SESSION['csrf'], (string)$token);
}

/* ---------- rate limit ---------- */

function forno_client_ip() {
    $remote = $_SERVER['REMOTE_ADDR'] ?? 'unknown';

    // Если сайт стоит за доверенным прокси (Cloudflare/nginx) - реальный IP
    // берём из первого значения X-Forwarded-For, а не из адреса прокси.
    // Список доверенных прокси настраивается в config.php (trusted_proxies).
    $cfg     = forno_config();
    $trusted = $cfg['trusted_proxies'] ?? [];
    if (is_array($trusted) && in_array($remote, $trusted, true)) {
        $xff = trim((string)($_SERVER['HTTP_X_FORWARDED_FOR'] ?? ''));
        if ($xff !== '') {
            $first = trim(explode(',', $xff)[0]);
            if ($first !== '' && filter_var($first, FILTER_VALIDATE_IP)) {
                return $first;
            }
        }
    }
    return $remote;
}

function forno_rate_limit_ok() {
    $cfg = forno_config();
    $max    = (int)$cfg['rate_limit_max'];
    $window = (int)$cfg['rate_limit_window'];
    if ($max <= 0 || $window <= 0) return true;

    $pdo = forno_db();
    $ip  = forno_client_ip();
    $now = time();
    $cut = $now - $window;

    $pdo->prepare('DELETE FROM rate_limit WHERE ts < ?')->execute([$cut]);

    $stmt = $pdo->prepare('SELECT COUNT(*) FROM rate_limit WHERE ip = ? AND ts > ?');
    $stmt->execute([$ip, $cut]);
    $count = (int)$stmt->fetchColumn();

    if ($count >= $max) return false;

    $pdo->prepare('INSERT INTO rate_limit (ip, ts) VALUES (?, ?)')->execute([$ip, $now]);
    return true;
}

/** Правда, если с этого IP уже набрано max+ попыток входа за window секунд. */
function forno_login_rate_blocked() {
    $cfg = forno_config();
    $max    = (int)($cfg['login_rate_limit_max'] ?? 5);
    $window = (int)($cfg['login_rate_limit_window'] ?? 300);
    if ($max <= 0 || $window <= 0) return false;

    $pdo = forno_db();
    $ip  = forno_client_ip();
    $now = time();
    $cut = $now - $window;

    $pdo->prepare('DELETE FROM login_rate_limit WHERE ts < ?')->execute([$cut]);

    $stmt = $pdo->prepare('SELECT COUNT(*) FROM login_rate_limit WHERE ip = ? AND ts > ?');
    $stmt->execute([$ip, $cut]);
    return (int)$stmt->fetchColumn() >= $max;
}

/** Фиксирует неудачную попытку входа. */
function forno_login_rate_hit() {
    $pdo = forno_db();
    $pdo->prepare('INSERT INTO login_rate_limit (ip, ts) VALUES (?, ?)')
        ->execute([forno_client_ip(), time()]);
}

/** Сбрасывает счётчик попыток после успешного входа. */
function forno_login_rate_reset() {
    $pdo = forno_db();
    $pdo->prepare('DELETE FROM login_rate_limit WHERE ip = ?')->execute([forno_client_ip()]);
}

/* ---------- telegram ---------- */

function forno_send_telegram($text) {
    $cfg = forno_config();
    $token = trim((string)($cfg['telegram_bot_token'] ?? ''));
    $chat  = trim((string)($cfg['telegram_chat_id'] ?? ''));
    if ($token === '' || $chat === '') return;

    try {
        $url = 'https://api.telegram.org/bot' . $token . '/sendMessage';
        $body = json_encode([
            'chat_id'                  => $chat,
            'text'                     => $text,
            'parse_mode'               => 'HTML',
            'disable_web_page_preview' => true,
        ], JSON_UNESCAPED_UNICODE);

        $ctx = stream_context_create([
            'http' => [
                'method'  => 'POST',
                'header'  => "Content-Type: application/json\r\n",
                'content' => $body,
                'timeout' => 6,
            ],
        ]);
        @file_get_contents($url, false, $ctx);
    } catch (Throwable $e) {
        // уведомление не критично: молча пропускаем, заказ уже сохранён
    }
}
