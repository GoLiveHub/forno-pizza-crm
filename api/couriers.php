<?php
/**
 * Кур'єри: список зі статусом (вільний/зайнятий).
 * GET -> активні/всі кур'єри + скільки активних замовлень на кожному.
 * Доступ: admin, cashier, manager, owner.
 */

require_once __DIR__ . '/helpers.php';
require_once __DIR__ . '/orders_core.php';

h_start_session();
crm_migrate();
crm_seed();

$u = h_require_auth(['admin', 'cashier', 'manager', 'owner']);

h_json(['ok' => true, 'couriers' => crm_courier_list()]);
