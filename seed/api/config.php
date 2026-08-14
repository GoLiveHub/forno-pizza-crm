<?php
/**
 * Конфигурация CRM пиццерии.
 * Настройки под каждый запуск. Изменять перед продакшеном.
 */

define('APP_NAME', 'Forno CRM');
define('APP_DOMAIN', 'pizzarcm.local');
define('APP_BASE', '/');
define('DB_PATH', __DIR__ . '/../data/crm.db');

// Сессия
define('SESSION_NAME', 'FORNO_CRM_SESS');
define('SESSION_TTL', 60 * 60 * 8); // 8 часов

// Rate limit на вход
define('LOGIN_MAX_ATTEMPTS', 6);
define('LOGIN_WINDOW_SEC', 60);

// Приём заказов с сайта (order_in)
define('ORDER_MAX_PER_MIN', 10);           // общий лимит на IP
define('ORDER_SITE_KEY', 'change-me-site-key'); // секретный ключ сайта-витрины

// Печать чека
define('RECEIPT_HEADER', 'Forno Pizza');

// Онлайн-оплата (LiqPay). Пустые значения = демо-режим (заказ помечается demo, без реального шлюза).
define('LIQPAY_PUBLIC_KEY', '');
define('LIQPAY_PRIVATE_KEY', '');
define('LIQPAY_MODE', 'sandbox'); // sandbox | live

// Telegram-уведомления (пустые = выключено)
define('TG_BOT_TOKEN', '');
define('TG_CHAT_ID', '');

// Первый администратор (создаётся при первом запуске, если таблица пустая)
// ВАЖНО: перед запуском задайте свой пароль.
define('BOOTSTRAP_ADMIN', 'admin');
define('BOOTSTRAP_PASS', 'change-me-before-launch');
