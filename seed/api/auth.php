<?php
/**
 * Аутентификация CRM.
 * GET  -> состояние сессии + CSRF.
 * POST {action:login}  -> вход.
 * POST {action:logout} -> выход.
 * POST {action:change_password} -> смена своего пароля.
 */

require_once __DIR__ . '/helpers.php';

h_start_session();
crm_migrate();
crm_seed();

$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'GET') {
    $u = h_user();
    h_json([
        'ok' => true,
        'authed' => $u !== null,
        'user' => $u,
        'csrf' => h_csrf_token(),
    ]);
}

if ($method !== 'POST') h_error('Метод не підтримується', 405);

$d = h_input();
$action = $d['action'] ?? '';

switch ($action) {

    case 'login':
        h_check_origin();
        if (!h_csrf_check($d['csrf'] ?? null)) h_error('Сесія застаріла, оновіть сторінку', 403);
        h_rate_limit('login', LOGIN_MAX_ATTEMPTS, LOGIN_WINDOW_SEC);

        $username = trim((string) ($d['username'] ?? ''));
        $password = (string) ($d['password'] ?? '');

        if ($username === '' || $password === '') {
            h_rate_hit('login');
            h_error('Вкажіть логін і пароль', 400);
        }

        $u = db_fetch_one("SELECT * FROM users WHERE username=? AND active=1", [$username]);
        if (!$u || !password_verify($password, $u['pass_hash'])) {
            h_rate_hit('login');
            h_error('Невірний логін або пароль', 401);
        }

        h_rate_clear('login');
        session_regenerate_id(true);
        $_SESSION['uid'] = (int) $u['id'];
        $_SESSION['csrf'] = h_csrf_token();
        db_update('users', ['last_login_at' => db_now()], 'id=?', [$u['id']]);
        crm_audit('login', 'user', (string) $u['id'], $u['username']);

        h_json(['ok' => true, 'user' => ['id' => (int) $u['id'], 'username' => $u['username'], 'role' => $u['role'], 'name' => $u['name']], 'csrf' => h_csrf_token()]);
        break;

    case 'logout':
        $_SESSION = [];
        session_destroy();
        h_json(['ok' => true]);
        break;

    case 'change_password':
        $u = h_require_auth();
        if (!h_csrf_check($d['csrf'] ?? null)) h_error('Сесія застаріла', 403);
        $old = (string) ($d['old'] ?? '');
        $new = (string) ($d['new'] ?? '');
        $row = db_fetch_one("SELECT pass_hash FROM users WHERE id=?", [$u['id']]);
        if (!$row || !password_verify($old, $row['pass_hash'])) h_error('Поточний пароль невірний', 400);
        if (strlen($new) < 6) h_error('Новий пароль занадто короткий (мінімум 6 символів)', 400);
        db_update('users', ['pass_hash' => password_hash($new, PASSWORD_DEFAULT)], 'id=?', [$u['id']]);
        crm_audit('change_password', 'user', (string) $u['id']);
        h_json(['ok' => true]);
        break;

    default:
        h_error('Невідома дія', 400);
}
