<?php
/**
 * Настройки заведения.
 *
 * Пароль админа хранится только в виде bcrypt-хэша. Смена пароля:
 *   php -r "echo password_hash('НовыйПароль', PASSWORD_DEFAULT);"
 * получившуюся строку вставить в admin_pass_hash.
 */

return [
    // Домен сайта (используется в тексте заказов и ответах API).
    'site_domain'     => 'forno.example',
    // Логин админа
    'admin_user'      => 'admin',
    // Пароль НЕ хранится в этом файле в открытом виде - только bcrypt-хэш.
    'admin_pass_hash' => '$2y$10$QwfpWkE8JyaZptkfv//pYejkeMbqI8DyHlRRF6rpRYa2afj41P6z2',

    // Здесь нужно вписать апи от вашего бота для того чтобы вы получали уведомления о заказах.
    // Как настроить: создать бота через @BotFather, написать ему любое сообщение,
    // затем выполнить https://api.telegram.org/bot<ТОКЕН>/getUpdates и из ответа
    // взять chat.id. Пустые поля = уведомления выключены.
    'telegram_bot_token' => '',
    'telegram_chat_id'   => '',

    // Доверенные прокси (Cloudflare/nginx). Если сайт стоит за прокси, впишите
    // его IP сюда - тогда rate limit считает реальный IP клиента из
    // X-Forwarded-For, а не адрес прокси. Пусто = прокси нет, всё по REMOTE_ADDR.
    'trusted_proxies'   => [],

    // Rate limit на приём заказов: не больше max заказов за window секунд с одного IP
    'rate_limit_max'    => 6,
    'rate_limit_window' => 60,

    // Rate limit на ВХОД в админку: не больше max попыток за window секунд с одного IP
    // (защита от перебора пароля; bcrypt и так замедляет перебор, но лимит обязателен)
    'login_rate_limit_max'    => 5,
    'login_rate_limit_window' => 300,

    // Хранение заказов: заказы старше этого срока удаляются автоматически.
    // Срок декларирован в privacy.html. 0 = не удалять никогда.
    'orders_retention_days' => 730,

    // Города доставки: заказ принимается только из них. Держать в синхроне
    // с window.FORNO_DELIVERY_CITIES в js/menu-data.js.
    'delivery_cities'   => ['Київ'],

    // Самовивіз: адреса закладу і години роботи (показуються в формі замовлення
    // і підставляються в адресу замовлення). Держать в синхроне
    // с window.FORNO_PICKUP в js/menu-data.js.
    'pickup_address'    => 'вул. ???, ? · Київ',
    'pickup_hours'      => 'Щодня 12:00–23:00',
];
