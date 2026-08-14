<?php
/**
 * Слой базы данных SQLite для CRM.
 * Схема, авто-миграции, стартовые данные, хелперы.
 * Всё через PDO prepared statements.
 */

require_once __DIR__ . '/config.php';

function db(): PDO {
    static $pdo = null;
    if ($pdo === null) {
        $dir = dirname(DB_PATH);
        if (!is_dir($dir)) mkdir($dir, 0777, true);
        $pdo = new PDO('sqlite:' . DB_PATH);
        $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        $pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
        $pdo->exec('PRAGMA foreign_keys = ON');
        // WAL отключён для браузерного деплоя (journal_mode=DELETE)
    }
    return $pdo;
}

function db_q(string $sql, array $p = []): PDOStatement {
    $st = db()->prepare($sql);
    $st->execute($p);
    return $st;
}

function db_fetch_all(string $sql, array $p = []): array {
    return db_q($sql, $p)->fetchAll();
}

function db_fetch_one(string $sql, array $p = []): ?array {
    $r = db_q($sql, $p)->fetch();
    return $r === false ? null : $r;
}

function db_scalar(string $sql, array $p = []) {
    return db_q($sql, $p)->fetchColumn();
}

function db_insert(string $table, array $data): int {
    $cols = implode(',', array_keys($data));
    $ph   = implode(',', array_fill(0, count($data), '?'));
    db_q("INSERT INTO $table ($cols) VALUES ($ph)", array_values($data));
    return (int) db()->lastInsertId();
}

function db_update(string $table, array $data, string $where, array $whereP = []): void {
    $set = implode(',', array_map(fn($k) => "$k=?", array_keys($data)));
    db_q("UPDATE $table SET $set WHERE $where", array_merge(array_values($data), $whereP));
}

function db_delete(string $table, string $where, array $whereP = []): void {
    db_q("DELETE FROM $table WHERE $where", $whereP);
}

function db_now(): string {
    return date('Y-m-d H:i:s');
}

/**
 * Проверка существования колонки таблицы (SQLite).
 */
function db_has_column(string $table, string $column): bool {
    foreach (db_q("PRAGMA table_info($table)") as $row) {
        if ($row['name'] === $column) return true;
    }
    return false;
}

/**
 * Создание схемы и авто-миграции. Вызывается при каждом запросе.
 */
function crm_migrate(): void {
    $sql = "
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    pass_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'cashier',
    name TEXT NOT NULL DEFAULT '',
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    last_login_at TEXT
);

CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    sort INTEGER NOT NULL DEFAULT 0,
    active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS menu_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category_id INTEGER NOT NULL DEFAULT 0,
    name TEXT NOT NULL,
    descr TEXT NOT NULL DEFAULT '',
    price REAL NOT NULL DEFAULT 0,
    unit TEXT NOT NULL DEFAULT '',
    active INTEGER NOT NULL DEFAULT 1,
    sort INTEGER NOT NULL DEFAULT 0,
    img TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ingredients (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    unit TEXT NOT NULL DEFAULT 'шт',
    stock REAL NOT NULL DEFAULT 0,
    min_stock REAL NOT NULL DEFAULT 0,
    active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS recipes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    item_id INTEGER NOT NULL,
    ingredient_id INTEGER NOT NULL,
    qty REAL NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS clients (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    phone TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL DEFAULT '',
    address TEXT NOT NULL DEFAULT '',
    blacklist INTEGER NOT NULL DEFAULT 0,
    notes TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    num TEXT NOT NULL UNIQUE,
    client_id INTEGER,
    status TEXT NOT NULL DEFAULT 'new',
    source TEXT NOT NULL DEFAULT 'site',
    delivery_type TEXT NOT NULL DEFAULT 'courier',
    address TEXT NOT NULL DEFAULT '',
    contact_name TEXT NOT NULL DEFAULT '',
    contact_phone TEXT NOT NULL DEFAULT '',
    payment TEXT NOT NULL DEFAULT 'cash',
    pay_status TEXT NOT NULL DEFAULT 'pending',
    subtotal REAL NOT NULL DEFAULT 0,
    discount REAL NOT NULL DEFAULT 0,
    total REAL NOT NULL DEFAULT 0,
    promo_code TEXT NOT NULL DEFAULT '',
    comment TEXT NOT NULL DEFAULT '',
    operator_id INTEGER,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    closed_at TEXT
);

CREATE TABLE IF NOT EXISTS order_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL,
    item_id INTEGER NOT NULL DEFAULT 0,
    name TEXT NOT NULL,
    price REAL NOT NULL DEFAULT 0,
    qty INTEGER NOT NULL DEFAULT 1,
    total REAL NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS promocodes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL UNIQUE,
    kind TEXT NOT NULL DEFAULT 'percent',
    value REAL NOT NULL DEFAULT 0,
    category_id INTEGER NOT NULL DEFAULT 0,
    min_total REAL NOT NULL DEFAULT 0,
    active INTEGER NOT NULL DEFAULT 1,
    starts TEXT NOT NULL DEFAULT '',
    ends TEXT NOT NULL DEFAULT '',
    max_uses INTEGER NOT NULL DEFAULT 0,
    used INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS stock_movements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ingredient_id INTEGER NOT NULL,
    kind TEXT NOT NULL DEFAULT 'in',
    qty REAL NOT NULL DEFAULT 0,
    order_id INTEGER,
    user_id INTEGER,
    note TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    action TEXT NOT NULL,
    entity TEXT NOT NULL DEFAULT '',
    entity_id TEXT NOT NULL DEFAULT '',
    detail TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS chat (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL,
    author TEXT NOT NULL DEFAULT 'client',
    author_id INTEGER,
    text TEXT NOT NULL,
    is_read INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS login_attempts (
    key TEXT NOT NULL,
    ip TEXT NOT NULL,
    ts INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS dough_types (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    active INTEGER NOT NULL DEFAULT 1,
    sort INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS menu_toppings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    item_id INTEGER NOT NULL,
    ingredient_id INTEGER NOT NULL,
    UNIQUE(item_id, ingredient_id)
);
";
    db()->exec($sql);

    // Авто-миграции колонок (паттерн: PRAGMA + ALTER TABLE)
    if (!db_has_column('login_attempts', 'key')) db()->exec("ALTER TABLE login_attempts ADD COLUMN key TEXT NOT NULL DEFAULT ''");
    if (!db_has_column('orders', 'operator_id'))  db()->exec("ALTER TABLE orders ADD COLUMN operator_id INTEGER");
    if (!db_has_column('orders', 'contact_name')) db()->exec("ALTER TABLE orders ADD COLUMN contact_name TEXT NOT NULL DEFAULT ''");
    if (!db_has_column('orders', 'contact_phone')) db()->exec("ALTER TABLE orders ADD COLUMN contact_phone TEXT NOT NULL DEFAULT ''");
    if (!db_has_column('orders', 'comment'))      db()->exec("ALTER TABLE orders ADD COLUMN comment TEXT NOT NULL DEFAULT ''");
    if (!db_has_column('orders', 'closed_at'))    db()->exec("ALTER TABLE orders ADD COLUMN closed_at TEXT");
    if (!db_has_column('orders', 'cancel_reason')) db()->exec("ALTER TABLE orders ADD COLUMN cancel_reason TEXT NOT NULL DEFAULT ''");
    if (!db_has_column('orders', 'courier_id'))    db()->exec("ALTER TABLE orders ADD COLUMN courier_id INTEGER");
    if (!db_has_column('orders', 'delivering_at')) db()->exec("ALTER TABLE orders ADD COLUMN delivering_at TEXT");
    if (!db_has_column('menu_items', 'img'))      db()->exec("ALTER TABLE menu_items ADD COLUMN img TEXT NOT NULL DEFAULT ''");
    if (!db_has_column('menu_items', 'price40'))  db()->exec("ALTER TABLE menu_items ADD COLUMN price40 REAL NOT NULL DEFAULT 0");
    if (!db_has_column('chat', 'is_read'))        db()->exec("ALTER TABLE chat ADD COLUMN is_read INTEGER NOT NULL DEFAULT 0");
    if (!db_has_column('order_items', 'options')) db()->exec("ALTER TABLE order_items ADD COLUMN options TEXT NOT NULL DEFAULT ''");
    if (!db_has_column('ingredients', 'topping_price')) db()->exec("ALTER TABLE ingredients ADD COLUMN topping_price REAL NOT NULL DEFAULT 0");
    if (!db_has_column('ingredients', 'is_dough')) db()->exec("ALTER TABLE ingredients ADD COLUMN is_dough INTEGER NOT NULL DEFAULT 0");
    if (!db_has_column('ingredients', 'is_base')) db()->exec("ALTER TABLE ingredients ADD COLUMN is_base INTEGER NOT NULL DEFAULT 0");

    // Индексы
    db()->exec("CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status)");
    db()->exec("CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at)");
    db()->exec("CREATE INDEX IF NOT EXISTS idx_orders_client ON orders(client_id)");
    db()->exec("CREATE INDEX IF NOT EXISTS idx_orders_courier ON orders(courier_id)");
    db()->exec("CREATE INDEX IF NOT EXISTS idx_items_cat ON menu_items(category_id)");
    db()->exec("CREATE INDEX IF NOT EXISTS idx_stock_mov ON stock_movements(ingredient_id)");
    db()->exec("CREATE INDEX IF NOT EXISTS idx_chat_order ON chat(order_id)");
    db()->exec("CREATE INDEX IF NOT EXISTS idx_audit_time ON audit(created_at)");
}

/**
 * Стартовые данные: первый админ, категории, меню, ингредиенты, рецепты, промокод.
 */
function crm_seed(): void {
    if ((int) db_scalar("SELECT COUNT(*) FROM users") === 0) {
        db_insert('users', [
            'username' => BOOTSTRAP_ADMIN,
            'pass_hash' => password_hash(BOOTSTRAP_PASS, PASSWORD_DEFAULT),
            'role' => 'admin',
            'name' => 'Адміністратор',
            'active' => 1,
            'created_at' => db_now(),
        ]);
    }

    // Демо-користувачі всіх ролей (Етап 7). Створюються, якщо логіна ще немає.
    $demoUsers = [
        ['owner',   'owner-2026',   'owner',   'Власник'],
        ['manager', 'manager-2026', 'manager', 'Менеджер'],
        ['support', 'support-2026', 'support', 'Оператор підтримки'],
        ['cashier', 'cashier-2026', 'cashier', 'Касир'],
        ['cook',    'cook-2026',    'cook',    'Кухар'],
        ['courier', 'courier-2026', 'courier', 'Кур\'єр'],
        ['courier2', 'courier2-2026', 'courier', 'Кур\'єр 2'],
    ];
    foreach ($demoUsers as $du) {
        $exists = db_scalar("SELECT id FROM users WHERE username=?", [$du[0]]);
        if (!$exists) {
            db_insert('users', [
                'username' => $du[0],
                'pass_hash' => password_hash($du[1], PASSWORD_DEFAULT),
                'role' => $du[2],
                'name' => $du[3],
                'active' => 1,
                'created_at' => db_now(),
            ]);
        }
    }

    if ((int) db_scalar("SELECT COUNT(*) FROM categories") === 0) {
        foreach ([['Піца', 1], ['Напої', 2], ['Десерти', 3]] as $i => $c) {
            db_insert('categories', ['name' => $c[0], 'sort' => $c[1], 'active' => 1]);
        }
        $seed = [
            ['Маргарита', 1, 189.00, 'томатний соус, моцарела, базилік'],
            ['Діавола', 1, 229.00, 'томатний соус, моцарела, салямі піканте'],
            ['Прошутто', 1, 259.00, 'вершки, моцарела, прошутто, рукола'],
            ['Кватро Формаджі', 1, 249.00, 'чотири сири, мед, горіхи'],
            ['Кальцоне', 1, 239.00, 'рикота, моцарела, шинка, гриби'],
            ['Трюфель', 1, 279.00, 'трюфельний крем, моцарела, гриби'],
            ['Лимонад', 2, 69.00, 'лимон, м\'ята, 0.5 л'],
            ['Апельсиновий фреш', 2, 89.00, 'свіжий апельсин, 0.4 л'],
            ['Тірамісу', 3, 119.00, 'класичний італійський десерт'],
        ];
        foreach ($seed as $i => $m) {
            db_insert('menu_items', [
                'category_id' => $m[1],
                'name' => $m[0],
                'descr' => $m[3],
                'price' => $m[2],
                'unit' => 'шт',
                'active' => 1,
                'sort' => $i,
                'img' => '',
                'created_at' => db_now(),
                'updated_at' => db_now(),
            ]);
        }
    }

    if ((int) db_scalar("SELECT COUNT(*) FROM ingredients") === 0) {
        foreach ([
            ['Тісто 30 см', 'шт', 20, 4],
            ['Соус томатний', 'порц', 50, 10],
            ['Моцарела', 'порц', 50, 10],
            ['Базилік', 'порц', 50, 10],
            ['Салямі піканте', 'порц', 30, 6],
            ['Вершки', 'порц', 40, 8],
            ['Прошутто', 'порц', 25, 5],
            ['Рукола', 'порц', 25, 5],
            ['Чотири сири', 'порц', 30, 6],
            ['Мед', 'порц', 30, 6],
            ['Горіхи', 'порц', 30, 6],
            ['Рикота', 'порц', 25, 5],
            ['Шинка', 'порц', 25, 5],
            ['Гриби', 'порц', 25, 5],
            ['Трюфельний крем', 'порц', 20, 4],
            ['Лимонад', 'шт', 30, 6],
            ['Апельсиновий фреш', 'шт', 25, 5],
            ['Тірамісу', 'шт', 20, 4],
        ] as $i => $ing) {
            db_insert('ingredients', ['name' => $ing[0], 'unit' => $ing[1], 'stock' => $ing[2], 'min_stock' => $ing[3], 'active' => 1]);
        }
        // Рецепты: item_id => [[ingredient_id, qty]]
        $rec = [
            1 => [[1,1],[2,1],[3,1],[4,1]],
            2 => [[1,1],[2,1],[3,1],[5,1]],
            3 => [[1,1],[6,1],[3,1],[7,1],[8,1]],
            4 => [[1,1],[9,1],[10,1],[11,1]],
            5 => [[1,1],[12,1],[3,1],[13,1],[14,1]],
            6 => [[1,1],[15,1],[3,1],[14,1]],
            7 => [[16,1]],
            8 => [[17,1]],
            9 => [[18,1]],
        ];
        foreach ($rec as $item => $list) {
            foreach ($list as $r) db_insert('recipes', ['item_id' => $item, 'ingredient_id' => $r[0], 'qty' => $r[1]]);
        }
    }

    if ((int) db_scalar("SELECT COUNT(*) FROM promocodes") === 0) {
        db_insert('promocodes', [
            'code' => 'WELCOME10',
            'kind' => 'percent',
            'value' => 10,
            'category_id' => 0,
            'min_total' => 300,
            'active' => 1,
            'starts' => '',
            'ends' => '',
            'max_uses' => 0,
            'used' => 0,
        ]);
    }

    crm_seed_etap6();
    crm_seed_drink_addons();
    crm_seed_drink_recipes();
}

/**
 * Этап 6: кастомизация пиццы.
 * Одноразовый сид (флаг 'etap6_seed'): типы теста, цена 40 см, топпинги.
 * Идемпотентный — при повторных запусках ничего не перезаписывает.
 */
function crm_seed_etap6(): void {
    if (crm_setting('etap6_seed') === '1') return;

    // Типы теста (тонке/пишне) — без изменения цены
    if ((int) db_scalar("SELECT COUNT(*) FROM dough_types") === 0) {
        db_q("INSERT INTO dough_types (code, name, active, sort) VALUES ('thin', 'Тонке', 1, 1), ('fluffy', 'Пишне', 1, 2)");
    }

    // Тесто в рецептах помечаем признаком is_dough
    db_q("UPDATE ingredients SET is_dough=1 WHERE name='Тісто 30 см'");

    // Цена добавления ингредиента (топпинги) — «в настройках»
    $toppings = [
        'Моцарела' => 30, 'Салямі піканте' => 25, 'Вершки' => 20, 'Прошутто' => 35,
        'Рукола' => 25, 'Чотири сири' => 35, 'Мед' => 15, 'Горіхи' => 20,
        'Рикота' => 25, 'Шинка' => 25, 'Гриби' => 20, 'Трюфельний крем' => 40,
    ];
    foreach ($toppings as $name => $price) {
        db_q("UPDATE ingredients SET topping_price=? WHERE name=?", [(float) $price, $name]);
    }

    // Цена 40 см для пицц (категория «Піца»): 30 см +50%
    $cat = db_fetch_one("SELECT id FROM categories WHERE name='Піца' LIMIT 1");
    if ($cat) {
        foreach (db_fetch_all("SELECT id, price FROM menu_items WHERE category_id=? AND price40=0", [(int) $cat['id']]) as $m) {
            db_q("UPDATE menu_items SET price40=? WHERE id=?", [round((float) $m['price'] * 1.5, 2), (int) $m['id']]);
        }
    }

    // Доступные топпинги для каждой пиццы: все ингредиенты с ценой добавления
    $toppingIds = array_column(db_fetch_all("SELECT id FROM ingredients WHERE topping_price>0"), 'id');
    if ($cat && $toppingIds) {
        foreach (db_fetch_all("SELECT id FROM menu_items WHERE category_id=?", [(int) $cat['id']]) as $m) {
            foreach ($toppingIds as $ingId) {
                db_q("INSERT OR IGNORE INTO menu_toppings (item_id, ingredient_id) VALUES (?, ?)", [(int) $m['id'], (int) $ingId]);
            }
        }
    }

    crm_set_setting('etap6_seed', '1');
}

/**
 * Добавки до напоїв: лід, лимон, сироп (+ мёд) — однократный сид.
 * Делает напитки кастомизируемыми в POS: убрать ингредиент рецепта / добавить добавки.
 */
function crm_seed_drink_addons(): void {
    if (crm_setting('drink_addons_seed') === '1') return;

    $add = [
        ['Лід', 40, 8, 10],
        ['Лимон', 40, 8, 12],
        ['Сироп', 40, 8, 15],
        ['Мед', 30, 6, 15],
    ];
    foreach ($add as $a) {
        $id = db_scalar("SELECT id FROM ingredients WHERE name=?", [$a[0]]);
        if (!$id) {
            $id = db_insert('ingredients', ['name' => $a[0], 'unit' => 'порц', 'stock' => $a[1], 'min_stock' => $a[2], 'active' => 1]);
        }
        db_q("UPDATE ingredients SET topping_price=? WHERE id=?", [(float) $a[3], $id]);
    }

    // Для напитков разрешаем добавки мед/лід/лимон/сироп
    $cat = db_fetch_one("SELECT id FROM categories WHERE name='Напої' LIMIT 1");
    if ($cat) {
        $ids = array_column(db_fetch_all("SELECT id FROM ingredients WHERE name IN ('Мед','Лід','Лимон','Сироп')"), 'id');
        if ($ids) {
            foreach (db_fetch_all("SELECT id FROM menu_items WHERE category_id=?", [(int) $cat['id']]) as $m) {
                foreach ($ids as $ingId) {
                    db_q("INSERT OR IGNORE INTO menu_toppings (item_id, ingredient_id) VALUES (?, ?)", [(int) $m['id'], $ingId]);
                }
            }
        }
    }

    crm_set_setting('drink_addons_seed', '1');
}

/**
 * Состав напоїв/десертів: базовий інгредієнт (is_base) + лід у рецепті.
 * Однократний сид (флаг 'drink_recipes_seed'):
 *  - базовий інгредієнт позиції позначається is_base=1 (його не можна прибрати в кастомизації);
 *  - до рецепту напоїв додається Лід (можна прибрати безкоштовно);
 *  - Лід прибирається зі списку добавок напоїв (залишаються Мед/Лимон/Сироп).
 */
function crm_seed_drink_recipes(): void {
    if (crm_setting('drink_recipes_seed') === '1') return;

    // Базові інгредієнти: ім'я збігається з ім'ям позиції (Лимонад, Апельсиновий фреш, Тірамісу…)
    foreach (db_fetch_all("SELECT m.id, m.name FROM menu_items m") as $m) {
        db_q(
            "UPDATE ingredients SET is_base=1 WHERE name=? AND id IN (SELECT ingredient_id FROM recipes WHERE item_id=?)",
            [(string) $m['name'], (int) $m['id']]
        );
    }

    // Лід до рецептів напоїв (можна прибрати безкоштовно) та прибрати зі списку добавок
    $drinkCat = db_fetch_one("SELECT id FROM categories WHERE name='Напої' LIMIT 1");
    if ($drinkCat) {
        $ice = db_scalar("SELECT id FROM ingredients WHERE name='Лід' LIMIT 1");
        if ($ice) {
            foreach (db_fetch_all("SELECT id FROM menu_items WHERE category_id=?", [(int) $drinkCat['id']]) as $m) {
                $has = db_scalar("SELECT COUNT(*) FROM recipes WHERE item_id=? AND ingredient_id=?", [(int) $m['id'], (int) $ice]);
                if (!$has) db_insert('recipes', ['item_id' => (int) $m['id'], 'ingredient_id' => (int) $ice, 'qty' => 1]);
                db_q("DELETE FROM menu_toppings WHERE item_id=? AND ingredient_id=?", [(int) $m['id'], (int) $ice]);
            }
        }
    }

    crm_set_setting('drink_recipes_seed', '1');
}

function crm_setting(string $key, string $default = ''): string {
    $v = db_scalar("SELECT value FROM settings WHERE key=?", [$key]);
    if ($v === null || $v === false) return $default;
    return (string) $v;
}

function crm_set_setting(string $key, string $value): void {
    db_q("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", [$key, $value]);
}

/**
 * Запись в журнал аудита.
 */
function crm_audit(string $action, string $entity = '', string $entity_id = '', string $detail = ''): void {
    db_insert('audit', [
        'user_id' => $_SESSION['uid'] ?? null,
        'action' => $action,
        'entity' => $entity,
        'entity_id' => $entity_id,
        'detail' => $detail,
        'created_at' => db_now(),
    ]);
}

/**
 * Генерация номера заказа F-XXXX (по автоинкременту id).
 */
function crm_order_num(int $id): string {
    return 'F-' . str_pad((string) $id, 4, '0', STR_PAD_LEFT);
}

/**
 * Нормализация телефона: оставляем только цифры (+380XXXXXXXXX -> 380XXXXXXXXX).
 * Ведущий 0 трактуем как украинский и дописываем 38 (0XXXXXXXXX -> 380XXXXXXXXX).
 */
function crm_phone_normalize(string $raw): string {
    $digits = preg_replace('/\D+/', '', $raw);
    if (substr($digits, 0, 1) === '0') $digits = '38' . $digits;
    return $digits;
}

/**
 * Валидный номер: 5-15 цифр (страна/оператор не привязаны к +380).
 */
function crm_phone_valid(string $raw): bool {
    $d = crm_phone_normalize($raw);
    return (bool) preg_match('/^\d{5,15}$/', $d);
}

/**
 * Параметры доставки/самовивоза и контакты заведения (для формы и чеков).
 */
function crm_business(): array {
    return [
        'name' => crm_setting('biz_name', 'Forno Pizza'),
        'address' => crm_setting('biz_address', 'вул. Хрещатик, 1, Київ'),
        'phone' => crm_setting('biz_phone', '+380 00 000 0000'),
        'pickup_hours' => crm_setting('biz_hours', '12:00 - 23:00'),
        'delivery_hours' => crm_setting('delivery_hours', '12:00 - 22:30'),
    ];
}
