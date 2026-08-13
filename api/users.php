<?php
/**
 * Персонал: користувачі системи.
 * GET -> список користувачів.
 * POST action=save_user | delete_user.
 * Доступ: admin.
 */

require_once __DIR__ . '/helpers.php';

h_start_session();
crm_migrate();
crm_seed();

$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'GET') {
    $u = h_require_auth(['admin', 'manager', 'owner']);
    $rows = db_fetch_all("SELECT id, username, role, name, active, created_at, last_login_at FROM users ORDER BY id");
    h_json(['ok' => true, 'users' => $rows]);
}

if ($method !== 'POST') h_error('Метод не підтримується', 405);
$u = h_require_auth(['admin', 'manager', 'owner']);

$d = h_input();
if (!h_csrf_check($d['csrf'] ?? null)) h_error('Сесія застаріла', 403);
$action = $d['action'] ?? '';

switch ($action) {

    case 'save_user':
        $id = (int) ($d['id'] ?? 0);
        $username = trim((string) ($d['username'] ?? ''));
        $name = trim((string) ($d['name'] ?? ''));
        $role = in_array($d['role'] ?? '', ['admin', 'cashier', 'cook', 'courier', 'manager', 'support', 'owner'], true) ? $d['role'] : 'cashier';
        $active = !empty($d['active']) ? 1 : 0;
        $pass = (string) ($d['pass'] ?? '');

        // Власника може створювати/змінювати лише власник (менеджер — «крім власника»)
        $canOwner = in_array($u['role'], ['admin', 'owner'], true);
        if ($role === 'owner' && !$canOwner) h_error('Роль власника може видавати лише власник', 403);
        if ($id) {
            $tgt = db_fetch_one("SELECT role FROM users WHERE id=?", [$id]);
            if (!$tgt) h_error('Користувача не знайдено', 404);
            if ($tgt['role'] === 'owner' && !$canOwner) h_error('Недостатньо прав для зміни власника', 403);
        }

        if (!preg_match('/^[a-zA-Z0-9_\.\-]{3,30}$/', $username)) h_error('Логін: 3-30 символів, латиниця/цифри/_-.', 400);
        if (mb_strlen($name) > 60) h_error('Ім\'я занадто довге', 400);
        if ($pass !== '' && strlen($pass) < 6) h_error('Пароль мінімум 6 символів', 400);

        $dup = db_fetch_one("SELECT id FROM users WHERE username=? AND id<>?", [$username, $id]);
        if ($dup) h_error('Логін вже зайнятий', 400);

        $set = ['username' => $username, 'name' => $name, 'role' => $role, 'active' => $active];
        if ($id) {
            // не можна вимкнути або понизити самого себе
            if ($id === (int) $u['id'] && (!$active || $role !== 'admin')) h_error('Не можна вимкнути/понизити власний акаунт', 400);
            if ($pass !== '') $set['pass_hash'] = password_hash($pass, PASSWORD_DEFAULT);
            db_update('users', $set, 'id=?', [$id]);
            crm_audit('user_update', 'user', (string) $id, $username . ' / ' . $role);
        } else {
            if ($pass === '') h_error('Вкажіть пароль для нового користувача', 400);
            $set['pass_hash'] = password_hash($pass, PASSWORD_DEFAULT);
            $set['created_at'] = db_now();
            $id = db_insert('users', $set);
            crm_audit('user_create', 'user', (string) $id, $username . ' / ' . $role);
        }
        h_json(['ok' => true, 'id' => $id]);
        break;

    case 'delete_user':
        $id = (int) ($d['id'] ?? 0);
        if ($id === (int) $u['id']) h_error('Не можна видалити власний акаунт', 400);
        $row = db_fetch_one("SELECT username, role FROM users WHERE id=?", [$id]);
        if (!$row) h_error('Користувача не знайдено', 404);
        if ($row['role'] === 'owner' && !in_array($u['role'], ['admin', 'owner'], true)) h_error('Недостатньо прав для видалення власника', 403);
        db_delete('users', 'id=?', [$id]);
        crm_audit('user_delete', 'user', (string) $id, $row['username']);
        h_json(['ok' => true]);
        break;

    default:
        h_error('Невідома дія', 400);
}
