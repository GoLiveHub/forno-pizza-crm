<?php
/**
 * Сборка runtime-словарей локализации из источников:
 *   __dict_base.json      — базовый скан (фразы)
 *   __dict_manual.json    — ручные добавления (слова/короткие фразы)
 *   __dict_partials.json  — подстрочные замены
 * Шаблон: js/i18n.template.js -> js/i18n.js и site/js/i18n.js.
 *
 * Запуск: php tools/i18n_build.php
 */

$ROOT = __DIR__ . '/..';

function norm($s) { return preg_replace('/\s+/u', ' ', trim((string) $s)); }

function extractArrayFromJs(string $file, string $mark): array {
    $s = file_get_contents($file);
    $p = strpos($s, $mark);
    if ($p === false) throw new RuntimeException("marker not found: $mark in $file");
    $i = $p + strlen($mark);
    $depth = 0; $inStr = false; $esc = false; $len = strlen($s); $end = null;
    for (; $i < $len; $i++) {
        $ch = $s[$i];
        if ($inStr) {
            if ($esc) { $esc = false; continue; }
            if ($ch === '\\') { $esc = true; continue; }
            if ($ch === '"') $inStr = false;
            continue;
        }
        if ($ch === '"') { $inStr = true; continue; }
        if ($ch === '[') $depth++;
        elseif ($ch === ']') { if (--$depth === 0) { $end = $i + 1; break; } }
    }
    if ($end === null) throw new RuntimeException("unclosed array after $mark in $file");
    $arr = json_decode(substr($s, $p + strlen($mark), $end - ($p + strlen($mark))), true);
    if (!is_array($arr)) throw new RuntimeException("json decode failed for $mark: " . json_last_error_msg());
    return $arr;
}

$base   = json_decode(file_get_contents("$ROOT/__dict_base.json"), true)   ?: [];
$manual = json_decode(file_get_contents("$ROOT/__dict_manual.json"), true) ?: [];
$partials = json_decode(file_get_contents("$ROOT/__dict_partials.json"), true) ?: [];

// Слияние base+manual по нормализованному uk-ключу (manual приоритетнее).
$merged = [];
foreach ($base as $pr) $merged[norm($pr[0])] = norm($pr[1]);
foreach ($manual as $pr) $merged[norm($pr[0])] = norm($pr[1]);

// Сохраняем пары, которые живут только в текущем runtime (не теряем прошлые правки),
// и докидываем их в manual, чтобы словарь оставался полным источником.
$runtimePairs = extractArrayFromJs("$ROOT/js/i18n.js", 'var PAIRS = ');
$extra = [];
foreach ($runtimePairs as $pr) {
    $k = norm($pr[0]);
    if (!array_key_exists($k, $merged)) $extra[$k] = norm($pr[1]);
}
if ($extra) {
    $manualAppend = [];
    foreach ($extra as $k => $v) {
        $manualAppend[] = [$k, $v];
        $merged[$k] = $v;
    }
    $manual = array_merge($manual, $manualAppend);
    file_put_contents("$ROOT/__dict_manual.json", json_encode($manual, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT) . "\n");
    echo "Добавлено в __dict_manual.json (были только в runtime): " . count($manualAppend) . PHP_EOL;
}

// Итоговые пары: base (порядок) + manual (порядок), dedup по ключу.
$pairs = [];
$seen = [];
foreach (array_merge($base, $manual) as $pr) {
    $k = norm($pr[0]);
    if (isset($seen[$k])) continue;
    $seen[$k] = true;
    $pairs[] = [$k, norm($pr[1])];
}

$pairsJson = json_encode($pairs, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
$partialsJson = json_encode($partials, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);

$tpl = file_get_contents("$ROOT/js/i18n.template.js");
$out = str_replace('/*__PAIRS__*/', $pairsJson, $tpl);
$out = str_replace('/*__PARTIALS__*/', $partialsJson, $out);

if (strpos($out, '/*__PAIRS__*/') !== false || strpos($out, '/*__PARTIALS__*/') !== false) {
    throw new RuntimeException('placeholders остались не заменёнными');
}

file_put_contents("$ROOT/js/i18n.js", $out);
file_put_contents("$ROOT/site/js/i18n.js", $out);

echo "Готово: пар=" . count($pairs) . " (base=" . count($base) . " manual=" . count($manual) . ") partials=" . count($partials) . PHP_EOL;
echo "js/i18n.js = " . strlen($out) . " байт, site/js/i18n.js скопирован" . PHP_EOL;
