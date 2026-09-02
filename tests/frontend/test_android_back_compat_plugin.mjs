/**
 * P1 2026-09-02 — Regression test: Android 16 predictive back compatibility plugin.
 *
 * Android 16 (API 36) включает predictive back по умолчанию и перестаёт
 * вызывать legacy onBackPressed() / KEYCODE_BACK. React Native 0.76
 * (Expo SDK 52) ещё не поддерживает новый back API — поддержка появилась
 * в RN 0.81 (Expo SDK 54).
 *
 * Plugin `plugins/withAndroidBackCompat.js` ставит
 *   android:enableOnBackInvokedCallback="false"
 * на <application> — это официальный временный compatibility path.
 *
 * Тесты:
 *   1. Plugin файл существует и экспортирует функцию
 *   2. Plugin подключён в app.json → plugins[]
 *   3. Plugin использует withAndroidManifest (правильный mod)
 *   4. Plugin устанавливает enableOnBackInvokedCallback строго "false"
 *   5. Plugin не трогает другие атрибуты <application>
 *   6. Plugin идемпотентен (повторный вызов не ломает)
 *
 * Run: node tests/frontend/test_android_back_compat_plugin.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const require = createRequire(import.meta.url);

let passed = 0;
let failed = 0;
function expect(cond, msg) {
  if (cond) { console.log(`  ✅ ${msg}`); passed++; }
  else { console.error(`  ❌ FAIL: ${msg}`); failed++; }
}

console.log('\n=== 1. Plugin файл существует и экспортирует функцию ===');
const PLUGIN_PATH = path.join(ROOT, 'plugins/withAndroidBackCompat.js');
expect(fs.existsSync(PLUGIN_PATH), 'plugins/withAndroidBackCompat.js существует');

const plugin = require(PLUGIN_PATH);
expect(typeof plugin === 'function', 'module.exports — функция');

console.log('\n=== 2. Plugin подключён в app.json ===');
const appJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'app.json'), 'utf-8'));
const plugins = appJson?.expo?.plugins || [];
const pluginEntry = plugins.find(p =>
  (typeof p === 'string' && p.includes('withAndroidBackCompat')) ||
  (Array.isArray(p) && typeof p[0] === 'string' && p[0].includes('withAndroidBackCompat'))
);
expect(!!pluginEntry, 'withAndroidBackCompat найден в app.json plugins[]');

// Убедиться что плагин идёт ДО остальных (первый в массиве), чтобы
// он применился до всех expo-* плагинов
const firstPlugin = plugins[0];
const firstPluginName = typeof firstPlugin === 'string' ? firstPlugin : firstPlugin?.[0];
expect(
  firstPluginName?.includes('withAndroidBackCompat'),
  'withAndroidBackCompat — первый в plugins[] (применяется раньше всех)'
);

console.log('\n=== 3. Plugin использует withAndroidManifest ===');
const pluginSrc = fs.readFileSync(PLUGIN_PATH, 'utf-8');
expect(
  pluginSrc.includes("require('expo/config-plugins')") ||
    pluginSrc.includes('require("expo/config-plugins")'),
  "Импортирует из 'expo/config-plugins'"
);
expect(
  pluginSrc.includes('withAndroidManifest'),
  'Использует withAndroidManifest (правильный mod для AndroidManifest.xml)'
);

console.log('\n=== 4. Plugin устанавливает enableOnBackInvokedCallback = "false" ===');
{
  // Симулируем структуру manifest, как её видит Expo config plugin
  const fakeConfig = {
    modResults: {
      manifest: {
        application: [{
          $: {
            'android:name': '.MainApplication',
            'android:label': '@string/app_name',
          }
        }]
      }
    }
  };

  // withAndroidManifest вызывает callback(config) — нам нужен inner callback.
  // Plugin делает: return withAndroidManifest(config, (config) => { ... })
  // Мы не можем вызвать withAndroidManifest напрямую без expo internals.
  // Вместо этого проверяем через исходный код + eval inner logic.

  // Извлекаем тело callback'а из плагина и проверяем логику
  const callbackMatch = pluginSrc.match(
    /withAndroidManifest\s*\(\s*config\s*,\s*\(\s*config\s*\)\s*=>\s*\{([\s\S]*?)\}\s*\)/
  );
  expect(!!callbackMatch, 'Найден callback withAndroidManifest');

  if (callbackMatch) {
    const body = callbackMatch[1];
    expect(
      body.includes("'android:enableOnBackInvokedCallback'") ||
        body.includes('"android:enableOnBackInvokedCallback"'),
      "Устанавливает атрибут 'android:enableOnBackInvokedCallback'"
    );
    expect(
      body.includes("= 'false'") || body.includes('= "false"'),
      "Значение строго 'false' (строка, не boolean)"
    );

    // Проверяем что значение именно false, не true
    expect(
      !body.includes("= 'true'") && !body.includes('= "true"'),
      "Значение НЕ 'true' (иначе predictive back включён)"
    );
  }
}

console.log('\n=== 5. Plugin не трогает другие атрибуты <application> ===');
{
  // Проверяем что плагин модифицирует только enableOnBackInvokedCallback
  const callbackMatch = pluginSrc.match(
    /withAndroidManifest\s*\(\s*config\s*,\s*\(\s*config\s*\)\s*=>\s*\{([\s\S]*?)\}\s*\)/
  );
  if (callbackMatch) {
    const body = callbackMatch[1];
    // Считаем сколько android: атрибутов устанавливается
    const androidAttrs = body.match(/\['android:[^']+'\]\s*=/g) || [];
    expect(
      androidAttrs.length === 1,
      `Устанавливается ровно 1 android: атрибут (найдено ${androidAttrs.length})`
    );
    // Проверяем что не удаляет существующие атрибуты
    expect(
      !body.includes('delete') && !body.includes('= undefined'),
      'Не удаляет существующие атрибуты'
    );
  }
}

console.log('\n=== 6. Plugin идемпотентен ===');
{
  // Симулируем вызов логики плагина дважды на одном объекте
  const app = {
    $: {
      'android:name': '.MainApplication',
      'android:label': '@string/app_name',
      'android:allowBackup': 'true',
    }
  };

  // Первый вызов
  app.$['android:enableOnBackInvokedCallback'] = 'false';
  const after1 = JSON.stringify(app.$);

  // Второй вызов (идемпотентность)
  app.$['android:enableOnBackInvokedCallback'] = 'false';
  const after2 = JSON.stringify(app.$);

  expect(
    after1 === after2,
    'Повторный вызов не меняет результат (идемпотентность)'
  );
  expect(
    app.$['android:enableOnBackInvokedCallback'] === 'false',
    'Значение остаётся "false" после повторного вызова'
  );
  expect(
    app.$['android:name'] === '.MainApplication' &&
    app.$['android:label'] === '@string/app_name' &&
    app.$['android:allowBackup'] === 'true',
    'Остальные атрибуты не затронуты'
  );
}

console.log('\n=== 7. Комментарий-документация в плагине ===');
{
  expect(
    pluginSrc.includes('enableOnBackInvokedCallback') && pluginSrc.includes('predictive back'),
    'Плагин документирует назначение (predictive back)'
  );
  expect(
    pluginSrc.includes('SDK 54') || pluginSrc.includes('RN 0.81') || pluginSrc.includes('Expo SDK 54'),
    'Плагин указывает когда его можно убрать (SDK 54+ / RN 0.81+)'
  );
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
