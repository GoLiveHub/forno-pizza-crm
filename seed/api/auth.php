<?php
/**
 * Авторизация админа.
 *
 * GET  api/auth.php        -> { ok, authed }
 * POST api/auth.php        -> вход/выход
 *      {"action":"login","username":"admin","password":"..."}   -> { ok, authed }
 *      {"action":"logout"}                                      -> { ok, authed:false }
 *
 * Пароль проверяется через password_verify() против config.php. Сессия в куке
 * FORNO_SESS (HttpOnly, SameSite=Lax). После входа выдаётся CSRF-токен.
 */

require_once __DIR__ . '/forno_db.php';

header('Content-Type: application/json; charset=utf-8');

forno_session_start();

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    forno_respond(200, ['ok' => true, 'authed' => forno_is_admin(), 'csrf' => forno_csrf_token()]);
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    forno_respond(405, ['ok' => false, 'error' => 'method not allowed']);
}

$raw  = file_get_contents('php://input');
$data = json_decode($raw, true);

if (!is_array($data)) {
    forno_respond(400, ['ok' => false, 'error' => 'bad request']);
}

$action = isset($data['action']) ? (string)$data['action'] : '';

if ($action === 'logout') {
    $_SESSION = [];
    if (ini_get('session.use_cookies')) {
        $p = session_get_cookie_params();
        setcookie(session_name(), '', time() - 42000, $p['path'], $p['domain'], $p['secure'], $p['httponly']);
    }
    session_destroy();
    forno_respond(200, ['ok' => true, 'authed' => false]);
}

if ($action === 'login') {
    // CSRF-токен берётся из сессии (отдаётся на GET api/auth.php и подставляется
    // формой логина). Без него кросс-сайтовая подделка входа заблокирована,
    // даже если SameSite почему-то не сработает.
    if (!forno_check_csrf(isset($data['csrf']) ? (string)$data['csrf'] : '')) {
        forno_respond(403, ['ok' => false, 'authed' => false, 'error' => 'csrf mismatch']);
    }

    if (forno_login_rate_blocked()) {
        forno_respond(429, ['ok' => false, 'authed' => false, 'error' => 'забагато спроб входу, зачекайте кілька хвилин']);
    }

    $cfg      = forno_config();
    $username = isset($data['username']) ? (string)$data['username'] : '';
    $password = isset($data['password']) ? (string)$data['password'] : '';

    $ok = hash_equals((string)$cfg['admin_user'], $username)
        && password_verify($password, (string)$cfg['admin_pass_hash']);

    if ($ok) {
        forno_login_rate_reset();
        session_regenerate_id(true);
        $_SESSION['admin'] = true;
        $_SESSION['csrf']  = bin2hex(random_bytes(16));
        forno_respond(200, ['ok' => true, 'authed' => true, 'csrf' => $_SESSION['csrf']]);
    }

    forno_login_rate_hit();
    forno_respond(401, ['ok' => false, 'authed' => false, 'error' => 'невірний логін або пароль']);
}

forno_respond(400, ['ok' => false, 'error' => 'bad request']);
