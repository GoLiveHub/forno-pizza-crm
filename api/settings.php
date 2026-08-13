<?php
/**
 * Налаштування закладу, доставки, Telegram.
 * GET -> поточні значення (токен Telegram маскується).
 * POST action=save_business | save_delivery | save_telegram.
 * Запис: admin.
 */

require_once __DIR__ . '/helpers.php';

h_start_session();
crm_migrate();
crm_seed();

$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'GET') {
    $u = h_require_auth(['admin', 'cashier', 'cook', 'courier', 'manager', 'support', 'owner']);
    $biz = crm_business();
    $tgToken = crm_setting('tg_token', '');
    h_json([
        'ok' => true,
        'business' => $biz,
        'telegram' => [
            'chat_id' => crm_setting('tg_chat_id', ''),
            'token_masked' => $tgToken !== '' ? substr($tgToken, 0, 6) . '…' . substr($tgToken, -4) : '',
            'has_token' => $tgToken !== '',
        ],
        'currency' => crm_setting('biz_currency', 'uah'),
        'rate' => (float) crm_setting('biz_rate', '1.84'),
    ]);
}

if ($method !== 'POST') h_error('Метод не підтримується', 405);
$u = h_require_auth(['admin', 'owner']);

$d = h_input();
if (!h_csrf_check($d['csrf'] ?? null)) h_error('Сесія застаріла', 403);
$action = $d['action'] ?? '';

switch ($action) {

    case 'save_business':
        $name = trim((string) ($d['name'] ?? ''));
        $address = trim((string) ($d['address'] ?? ''));
        $phone = trim((string) ($d['phone'] ?? ''));
        if ($name === '' || mb_strlen($name) > 60) h_error('Вкажіть назву закладу', 400);
        if (mb_strlen($address) > 200) h_error('Адреса занадто довга', 400);
        crm_set_setting('biz_name', $name);
        crm_set_setting('biz_address', $address);
        crm_set_setting('biz_phone', $phone);
        crm_audit('settings_business', 'settings', 'business', $name);
        h_json(['ok' => true]);
        break;

    case 'save_delivery':
        $pickup = trim((string) ($d['pickup_hours'] ?? ''));
        $delivery = trim((string) ($d['delivery_hours'] ?? ''));
        if (mb_strlen($pickup) > 40 || mb_strlen($delivery) > 40) h_error('Занадто довгі значення', 400);
        crm_set_setting('biz_hours', $pickup);
        crm_set_setting('delivery_hours', $delivery);
        crm_audit('settings_delivery', 'settings', 'delivery', $pickup . ' / ' . $delivery);
        h_json(['ok' => true]);
        break;

    case 'save_telegram':
        $chat_id = trim((string) ($d['chat_id'] ?? ''));
        $token = trim((string) ($d['token'] ?? ''));
        $clear = !empty($d['clear_token']) ? 1 : 0;
        if (mb_strlen($chat_id) > 40) h_error('Невірний chat_id', 400);
        if ($clear) {
            crm_set_setting('tg_token', '');
        } elseif ($token !== '') {
            if (!preg_match('/^[0-9]{6,12}:[A-Za-z0-9_\-]{30,60}$/', $token)) h_error('Невірний формат токена бота', 400);
            crm_set_setting('tg_token', $token);
        }
        crm_set_setting('tg_chat_id', $chat_id);
        crm_audit('settings_telegram', 'settings', 'telegram', $clear ? 'токен очищено' : 'оновлено');
        h_json(['ok' => true]);
        break;

    case 'save_currency':
        $code = strtolower(trim((string) ($d['currency'] ?? 'uah')));
        $rate = (float) ($d['rate'] ?? 1);
        if (!in_array($code, ['uah', 'rub'], true)) h_error('Невірна валюта', 400);
        if ($rate <= 0 || $rate > 100000) h_error('Невірний курс', 400);
        crm_set_setting('biz_currency', $code);
        crm_set_setting('biz_rate', (string) round($rate, 4));
        crm_audit('settings_currency', 'settings', 'currency', $code . ' / ' . round($rate, 4));
        h_json(['ok' => true]);
        break;

    default:
        h_error('Невідома дія', 400);
}
