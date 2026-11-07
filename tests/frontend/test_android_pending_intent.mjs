import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';

const read = path => readFileSync(path, 'utf8');

test('восстановленная Activity сохраняет новый Intent до передачи перехода в React Native', () => {
  const native = read('android/app/src/main/java/com/urtruck/app/MainActivity.kt');
  assert.match(native, /import android\.content\.Intent/);
  assert.match(native, /override fun onNewIntent\(intent: Intent\)\s*\{\s*setIntent\(intent\)\s*super\.onNewIntent\(intent\)\s*\}/);
});

test('prebuild сохраняет обработчик и повторное применение не дублирует его', () => {
  const require = createRequire(import.meta.url);
  const { preservePendingIntent } = require('../../plugins/withAndroidPendingIntent.js');
  const template = 'package sample\nimport android.os.Bundle\nclass MainActivity : ReactActivity() {\n  override fun onCreate(savedInstanceState: Bundle?) {\n    super.onCreate(null)\n  }\n}\n';
  const transformed = preservePendingIntent(template);
  assert.match(transformed, /import android\.content\.Intent/);
  assert.match(transformed, /setIntent\(intent\)\s*super\.onNewIntent\(intent\)/);
  assert.equal(preservePendingIntent(transformed), transformed);
  assert.equal((transformed.match(/override fun onNewIntent/g) || []).length, 1);
  assert.match(read('app.config.js'), /\.\/plugins\/withAndroidPendingIntent/);
});

test('неизвестный существующий обработчик или шаблон останавливает prebuild вместо потери чужого кода', () => {
  const require = createRequire(import.meta.url);
  const { preservePendingIntent } = require('../../plugins/withAndroidPendingIntent.js');
  assert.throws(() => preservePendingIntent('class MainActivity { override fun onNewIntent(intent: Intent) { customHandler(intent) } }'), /onNewIntent/);
  assert.throws(() => preservePendingIntent('class Unrelated {}'), /onCreate/);
});
