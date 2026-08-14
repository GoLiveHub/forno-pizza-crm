<?php
/**
 * Общие помощники: JSON, сессия, роли, CSRF, rate limit, валидация, Telegram.
 */

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/db.php';

function h_json($data, int $code = 200): void {
    http_response_code($code);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
}

function h_error(string $msg, int $code = 400): void {
    h_json(['ok' => false, 'error' => $msg], $code);
}

function h_input(): array {
    $raw = file_get_contents('php://input');
    if ($raw === false || $raw === '') return [];
    $d = json_decode($raw, true);
    return is_array($d) ? $d : [];
}

function h_start_session(): void {
    if (session_status() === PHP_SESSION_NONE) {
        session_name(SESSION_NAME);
        session_set_cookie_params(['lifetime' => 0, 'path' => '/', 'httponly' => true, 'samesite' => 'Lax', 'secure' => false]);
        session_start();
    }
}

/**
 * Текущий пользователь из сессии (или null).
 */
function h_user(): ?array {
    if (!isset($_SESSION['uid'])) return null;
    $u = db_fetch_one("SELECT id, username, role, name FROM users WHERE id=? AND active=1", [$_SESSION['uid']]);
    return $u ?: null;
}

/**
 * Требование авторизации и ролей. Возвращает юзера или 401/403.
 */
function h_require_auth(array $roles = null): array {
    h_start_session();
    $u = h_user();
    if (!$u) h_error('Не авторизований', 401);
    if ($roles !== null && !in_array($u['role'], $roles, true)) {
        h_error('Недостатньо прав', 403);
    }
    return $u;
}

/**
 * CSRF-токен из сессии (создаётся при первом обращении).
 */
function h_csrf_token(): string {
    if (empty($_SESSION['csrf'])) $_SESSION['csrf'] = bin2hex(random_bytes(16));
    return $_SESSION['csrf'];
}

function h_csrf_check(?string $token): bool {
    return is_string($token) && !empty($_SESSION['csrf']) && hash_equals($_SESSION['csrf'], $token);
}

/**
 * Rate limit: key по IP, max попыток за window секунд. Блокирует (429), если превышен.
 */
function h_rate_limit(string $key, int $max, int $window): void {
    $ip = $_SERVER['REMOTE_ADDR'] ?? '0.0.0.0';
    $now = time();
    db_q("DELETE FROM login_attempts WHERE ts < ?", [$now - $window]);
    $k = $key . '|' . $ip;
    $cnt = db_scalar("SELECT COUNT(*) FROM login_attempts WHERE key = ?", [$k]);
    if ((int) $cnt >= $max) h_error('Забагато спроб. Спробуйте пізніше', 429);
}

function h_rate_hit(string $key): void {
    $ip = $_SERVER['REMOTE_ADDR'] ?? '0.0.0.0';
    db_insert('login_attempts', ['key' => $key . '|' . $ip, 'ip' => $ip, 'ts' => time()]);
}

function h_rate_clear(string $key): void {
    $ip = $_SERVER['REMOTE_ADDR'] ?? '0.0.0.0';
    db_q("DELETE FROM login_attempts WHERE key = ?", [$key . '|' . $ip]);
}

/**
 * Мусорные строки (спамо-слова). НЕ применять к коротким числовым полям.
 */
function h_junk(string $s): bool {
    $s = mb_strtolower(trim($s));
    $bad = ['тест', 'test', 'qwe', 'йцу', 'asdf', 'zxcv', 'фыва', 'олдж', 'junk', 'spam', 'asd', 'xyz', 'xxx', 'abc'];
    if (in_array($s, $bad, true)) return true;
    // повторы одного и того же символа (аааа, 1111)
    if (preg_match('/^(.)\1{2,}$/u', $s)) return true;
    return false;
}

/**
 * Имя: только буквы/пробел/дефис/апостроф, минимум 2 буквы.
 */
function h_bad_name(string $name): bool {
    $name = trim($name);
    if ($name === '' || mb_strlen($name) > 60) return true;
    if (!preg_match('/^\p{L}[\p{L}\s\'\-]*$/u', $name)) return true;
    preg_match_all('/\p{L}/u', $name, $m);
    if (count($m[0]) < 2) return true;
    return false;
}

/**
 * Улица: буквы, цифры, точки, дефис, минимум 3 символа.
 * Отклоняем «мусор» (повторы одного символа: вввввв, аааааа).
 */
function h_bad_street(string $street): bool {
    $street = trim($street);
    if (mb_strlen($street) < 3 || mb_strlen($street) > 90) return true;
    if (!preg_match('/^[\p{L}0-9\'\.\- ]+$/u', $street)) return true;
    if (preg_match('/^(.)\1{2,}$/u', $street)) return true;
    return false;
}

/**
 * Дом: 1-5 цифр + опционально буква или дробь (12, 12А, 12/2).
 */
function h_bad_house(string $house): bool {
    $house = trim($house);
    if ($house === '') return false; // необязательное на сервере решает вызывающий
    if (mb_strlen($house) > 10) return true;
    if (!preg_match('/^[0-9]{1,5}[A-ZА-Яа-яІіЇїЄє]?(\\/[0-9]{1,3})?$/u', $house)) return true;
    return false;
}

/**
 * Отправка в Telegram (тихо глотает ошибки).
 */
function h_tg_send(string $text): void {
    if (TG_BOT_TOKEN === '' || TG_CHAT_ID === '') return;
    try {
        $url = 'https://api.telegram.org/bot' . TG_BOT_TOKEN . '/sendMessage';
        $body = http_build_query(['chat_id' => TG_CHAT_ID, 'text' => $text, 'parse_mode' => 'HTML', 'disable_web_page_preview' => true]);
        $ctx = stream_context_create(['http' => [
            'method' => 'POST',
            'header' => "Content-Type: application/x-www-form-urlencoded\r\n",
            'content' => $body,
            'timeout' => 5,
        ]]);
        @file_get_contents($url, false, $ctx);
    } catch (Throwable $e) {
        // молча
    }
}

/**
 * Проверка Origin для POST (защита от кросс-сайт запросов). Список разрешённых.
 */
function h_check_origin(array $allowed = []): void {
    return; // Origin-проверка отключена для браузерного деплоя (php-wasm + SW)
    $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
    if ($origin === '') return; // не-браузерные клиенты
    $allowed[] = 'http://' . APP_DOMAIN;
    $allowed[] = 'https://' . APP_DOMAIN;
    foreach ($allowed as $a) {
        if (strcasecmp(parse_url($origin, PHP_URL_SCHEME) . '://' . parse_url($origin, PHP_URL_HOST), parse_url($a, PHP_URL_SCHEME) . '://' . parse_url($a, PHP_URL_HOST)) === 0) {
            return;
        }
    }
    h_error('Джерело запиту заборонено', 403);
}

/**
 * Экранирование для вывода в HTML (используется на витрине).
 */
function h_esc(string $s): string {
    return htmlspecialchars($s, ENT_QUOTES, 'UTF-8');
}
