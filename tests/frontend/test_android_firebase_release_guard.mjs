/**
 * P0 2026-09-03 — Regression: release-сборка не может выйти без Firebase/FCM.
 *
 * Физически доказанный дефект (двухтелефонный QA, com.urtruck.app.qa2):
 * business event и in-app notification работают, а Android system push в
 * notification shade не приходит вообще.
 *
 * Первопричина (подтверждена владельцем: QA2 APK собирался ЛОКАЛЬНО через
 * ./gradlew на Mac):
 *
 *   - android/app/build.gradle подключал плагин com.google.gms.google-services
 *     УСЛОВНО: `if (file("google-services.json").exists())`.
 *   - google-services.json лежит в .gitignore (см. .gitignore) — после
 *     свежего clone файла нет.
 *   - Итог: release-сборка молча выходила БЕЗ Firebase runtime-конфига
 *     (google_app_id / gcm_defaultSenderId в билд не попадали), FirebaseApp
 *     не инициализировался, getDevicePushTokenAsync() не мог выдать
 *     FCM-токен → system push физически невозможен.
 *   - Backend при этом здоров (/push/info: fcm_live=true, project
 *     urtruck-e722b), а in-app уведомления идут через REST — именно это
 *     маскировало дефект.
 *   - Гард scripts/verify_android_firebase_config.py вызывался ТОЛЬКО из
 *     CI-воркфлоу, локальный путь сборки был не защищён.
 *
 * Контракт после фикса: debug собирается без Firebase (сознательно, для
 * контрибьютора без файла), release — падает ЗАКРЫТО.
 *
 * Run: node tests/frontend/test_android_firebase_release_guard.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf-8');

let passed = 0;
let failed = 0;
function expect(cond, msg) {
  if (cond) { console.log(`  ✅ ${msg}`); passed++; }
  else { console.error(`  ❌ FAIL: ${msg}`); failed++; }
}

const appGradle = read('android/app/build.gradle');
const rootGradle = read('android/build.gradle');
const gitignore = read('.gitignore');

console.log('\n=== 1. Happy path сохранён: плагин подключается когда файл есть ===');
{
  expect(
    appGradle.includes('if (file("google-services.json").exists())'),
    'условие наличия google-services.json на месте'
  );
  expect(
    appGradle.includes('apply plugin: "com.google.gms.google-services"'),
    'плагин com.google.gms.google-services применяется в happy path'
  );
  expect(
    rootGradle.includes('com.google.gms:google-services'),
    'classpath google-services есть в корневом build.gradle'
  );
}

console.log('\n=== 2. Есть else-ветка (раньше её не было — молчаливый пропуск) ===');
{
  const guardIdx = appGradle.indexOf('if (file("google-services.json").exists())');
  const tail = guardIdx === -1 ? '' : appGradle.slice(guardIdx);
  expect(
    /\}\s*else\s*\{/.test(tail),
    'у условия появилась else-ветка (отсутствие файла больше не игнорируется)'
  );
  expect(
    tail.includes('throw new GradleException'),
    'else-ветка бросает GradleException (fail closed, а не warning)'
  );
}

console.log('\n=== 3. Падает именно на RELEASE, а не на debug ===');
{
  const guardIdx = appGradle.indexOf('gradle.taskGraph.whenReady');
  expect(guardIdx !== -1, 'гард навешен через gradle.taskGraph.whenReady');
  const block = guardIdx === -1 ? '' : appGradle.slice(guardIdx, guardIdx + 1200);

  // Регексп должен матчить assembleRelease/bundleRelease и НЕ матчить debug.
  const patternMatch = block.match(/\/\^\(assemble\|bundle\)\.\*Release\$\//);
  expect(!!patternMatch, 'условие ограничено задачами ^(assemble|bundle).*Release$');

  if (patternMatch) {
    // Проверяем сам регексп на реальных именах задач Gradle.
    const taskRe = /^(assemble|bundle).*Release$/;
    for (const t of ['assembleRelease', 'bundleRelease']) {
      expect(taskRe.test(t), `release-задача '${t}' попадает под гард`);
    }
    for (const t of ['assembleDebug', 'bundleDebug', 'installDebug', 'test']) {
      expect(!taskRe.test(t), `debug/прочая задача '${t}' НЕ блокируется`);
    }
  }

  expect(
    block.includes('t.project == project'),
    'гард ограничен задачами этого модуля (не ловит чужие проекты)'
  );
}

console.log('\n=== 4. Сообщение об ошибке ведёт к решению ===');
{
  // P1-PUSH (04.09.2026): теперь в файле ДВА fail-closed гарда — «файла нет»
  // и «файл не подходит для этого applicationId». Контракт сообщений
  // проверяем по совокупности обоих, а не по первому найденному блоку.
  const msg = appGradle.includes('throw new GradleException')
    ? appGradle.slice(appGradle.indexOf('gradle.taskGraph.whenReady'))
    : '';
  expect(
    msg.includes('verify_android_firebase_config.py'),
    'сообщение указывает на скрипт проверки конфига'
  );
  expect(
    msg.includes('docs/release/android-firebase-config.md'),
    'сообщение ссылается на канон-документ инцидента'
  );
  expect(
    /android\/app\//.test(msg),
    'сообщение указывает КУДА положить файл (android/app/)'
  );
  expect(
    /push/i.test(msg),
    'сообщение объясняет последствие (push не будет работать)'
  );
}

console.log('\n=== 5. Причина, по которой дефект был возможен, зафиксирована ===');
{
  expect(
    /google-services\.json/.test(gitignore),
    'google-services.json действительно в .gitignore (файла нет после clone)'
  );
  // Гард в CI должен остаться — он проверяет ещё и идентичность проекта.
  const apkWorkflow = read('.github/workflows/build-android-apk.yml');
  const playWorkflow = read('.github/workflows/deploy-play.yml');
  expect(
    apkWorkflow.includes('verify_android_firebase_config.py'),
    'CI build-android-apk.yml по-прежнему проверяет конфиг'
  );
  expect(
    playWorkflow.includes('verify_android_firebase_config.py'),
    'CI deploy-play.yml по-прежнему проверяет конфиг'
  );
}

console.log('\n=== 6. Gradle-файл синтаксически цел (баланс скобок в гарде) ===');
{
  // Баланс считаем по ВСЕМУ файлу: срез «от гарда до конца» заведомо
  // несбалансирован, потому что закрывает внешний else, открытый выше.
  const opens = (appGradle.match(/\{/g) || []).length;
  const closes = (appGradle.match(/\}/g) || []).length;
  expect(
    opens === closes,
    `фигурные скобки сбалансированы во всём build.gradle (${opens} открывающих / ${closes} закрывающих)`
  );
  // Плагин Google Services не должен применяться дважды
  const applyCount = (appGradle.match(/apply plugin: "com\.google\.gms\.google-services"/g) || []).length;
  expect(applyCount === 1, `плагин применяется ровно один раз (найдено ${applyCount})`);
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
