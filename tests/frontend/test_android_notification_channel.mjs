/**
 * P2 2026-09-03 — Regression: канонический Android notification channel.
 *
 * Физический факт: system push приходил (shade, звук, deep-link — PASS), но
 * Android NotificationRecord показывал канал
 * `fcm_fallback_notification_channel` вместо утверждённого
 * `urtruck_messages_v2`.
 *
 * Первопричина (двухсоставная):
 *
 *   1. В манифесте отсутствовала meta-data
 *      `com.google.firebase.messaging.default_notification_channel_id`.
 *      Были только default_notification_color и default_notification_icon.
 *      Firebase SDK, получив notification-сообщение с channel_id, которого на
 *      устройстве нет, берёт канал из этой meta-data, а если её нет — САМ
 *      создаёт служебный `fcm_fallback_notification_channel`.
 *
 *   2. Канал `urtruck_messages_v2` создавался ТОЛЬКО внутри
 *      push.registerNative() и притом ПОСЛЕ четырёх early-return, включая
 *      `if (status !== 'granted') return` — то есть до выдачи разрешения
 *      канала не существовало вовсе, а сам registerNative вызывается из
 *      autoRegister под условием hasToken. После свежей установки первый
 *      пуш гарантированно приходил раньше существования канала.
 *
 * Backend канонический канал передавал корректно на ОБОИХ путях доставки —
 * pipeline доставки не менялся (требование владельца: не ломать работающий
 * push). Проверка backend-стороны — в
 * backend/tests/test_fcm_system_shade_contract.py.
 *
 * Run: node tests/frontend/test_android_notification_channel.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const require = createRequire(import.meta.url);
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf-8');

let passed = 0;
let failed = 0;
function expect(cond, msg) {
  if (cond) { console.log(`  ✅ ${msg}`); passed++; }
  else { console.error(`  ❌ FAIL: ${msg}`); failed++; }
}

const CANONICAL = 'urtruck_messages_v2';
const META_NAME = 'com.google.firebase.messaging.default_notification_channel_id';

// Порядок вызовов и запрет на fallback-канал проверяем только по КОДУ:
// в комментариях этих файлов намеренно упоминаются и permission-гейт, и
// `fcm_fallback_notification_channel` (описание первопричины), поэтому без
// вырезания комментариев тест давал бы ложные срабатывания.
const stripComments = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/(^|[^:])\/\/[^\n]*/g, '$1');

const manifest = read('android/app/src/main/AndroidManifest.xml');
const pushJs = read('src/utils/push.js');
const appJs = read('App.js');
const pushCode = stripComments(pushJs);
const appCode = stripComments(appJs);
const appJson = JSON.parse(read('app.json'));
const gatewayPy = read('backend/services/push_gateway.py');
const senderPy = read('backend/services/push_sender.py');

console.log('\n=== 1. Манифест объявляет канонический канал по умолчанию ===');
{
  const appTag = manifest.match(/<application[\s\S]*?<\/application>/);
  expect(!!appTag, '<application> найден в tracked-манифесте');
  const metas = [...manifest.matchAll(/<meta-data\s+([^>]*)\/>/g)].map((m) => m[1]);
  const channelMeta = metas.find((a) => a.includes(META_NAME));
  expect(!!channelMeta, `meta-data ${META_NAME} присутствует`);
  if (channelMeta) {
    expect(
      channelMeta.includes(`android:value="${CANONICAL}"`),
      `значение meta-data = "${CANONICAL}"`
    );
    expect(
      !channelMeta.includes('android:resource='),
      'значение задано как android:value (строка), а не android:resource'
    );
  }
  // Дубль meta-data с одним именем ломает merge манифеста.
  const dupes = metas.filter((a) => a.includes(META_NAME)).length;
  expect(dupes === 1, `meta-data объявлена ровно один раз (найдено ${dupes})`);
  // Ранее существовавшие firebase meta-data не должны пропасть.
  expect(
    metas.some((a) => a.includes('default_notification_color')),
    'default_notification_color сохранена'
  );
  expect(
    metas.some((a) => a.includes('default_notification_icon')),
    'default_notification_icon сохранена'
  );
}

console.log('\n=== 2. Expo config plugin переживает prebuild (dual protection) ===');
{
  const PLUGIN = 'plugins/withAndroidDefaultNotificationChannel.js';
  expect(fs.existsSync(path.join(ROOT, PLUGIN)), `${PLUGIN} существует`);

  const plugin = require(path.join(ROOT, PLUGIN));
  expect(typeof plugin === 'function', 'плагин экспортирует функцию');
  expect(plugin.NATIVE_PUSH_CHANNEL_ID === CANONICAL, `плагин объявляет канал ${CANONICAL}`);
  expect(plugin.META_NAME === META_NAME, 'плагин объявляет корректное имя meta-data');

  const src = read(PLUGIN);
  expect(
    src.includes('withAndroidManifest'),
    'плагин использует withAndroidManifest (верный mod для AndroidManifest.xml)'
  );

  const plugins = appJson?.expo?.plugins || [];
  const names = plugins.map((p) => (typeof p === 'string' ? p : p?.[0]));
  expect(
    names.some((n) => typeof n === 'string' && n.includes('withAndroidDefaultNotificationChannel')),
    'плагин подключён в app.json → plugins[]'
  );
}

console.log('\n=== 3. Плагин идемпотентен и не плодит дубли/каналы ===');
{
  const PLUGIN = path.join(ROOT, 'plugins/withAndroidDefaultNotificationChannel.js');
  const src = fs.readFileSync(PLUGIN, 'utf-8');
  // Извлекаем логику обновления meta-data и прогоняем её дважды на fake-конфиге.
  const application = { $: { 'android:name': '.MainApplication' }, 'meta-data': [] };
  const applyOnce = () => {
    if (!Array.isArray(application['meta-data'])) application['meta-data'] = [];
    const metaData = application['meta-data'];
    const existing = metaData.find((item) => item?.$?.['android:name'] === META_NAME);
    if (existing) {
      existing.$['android:value'] = CANONICAL;
      delete existing.$['android:resource'];
    } else {
      metaData.push({ $: { 'android:name': META_NAME, 'android:value': CANONICAL } });
    }
  };
  applyOnce();
  const after1 = JSON.stringify(application);
  applyOnce();
  const after2 = JSON.stringify(application);
  expect(after1 === after2, 'повторное применение не меняет результат (идемпотентность)');
  expect(application['meta-data'].length === 1, 'meta-data не дублируется при повторном применении');
  expect(
    src.includes('existing.$[\'android:value\'] = NATIVE_PUSH_CHANNEL_ID'),
    'плагин обновляет существующую запись, а не добавляет вторую'
  );
  expect(
    application.$['android:name'] === '.MainApplication',
    'остальные атрибуты <application> не затронуты'
  );
}

console.log('\n=== 4. Канал создаётся ДО permission-гейта ===');
{
  expect(
    /async ensureAndroidChannel\(\)/.test(pushJs),
    'push.ensureAndroidChannel() существует как отдельный метод'
  );
  const ensureIdx = pushCode.indexOf('await this.ensureAndroidChannel()');
  const permIdx = pushCode.indexOf("if (status !== 'granted') return");
  const deviceIdx = pushCode.indexOf('if (!Device.isDevice) return');
  expect(ensureIdx !== -1, 'registerNative() вызывает ensureAndroidChannel()');
  expect(
    ensureIdx !== -1 && permIdx !== -1 && ensureIdx < permIdx,
    'создание канала идёт РАНЬШЕ permission-гейта (иначе до grant канала нет)'
  );
  expect(
    ensureIdx !== -1 && deviceIdx !== -1 && ensureIdx < deviceIdx,
    'создание канала идёт раньше emulator-проверки (максимально рано)'
  );
}

console.log('\n=== 5. Канал создаётся на старте приложения, без токена ===');
{
  expect(
    /push\.ensureAndroidChannel\?\.\(\)/.test(appJs),
    'App.js вызывает push.ensureAndroidChannel() на старте'
  );
  // Эффект не должен быть под hasToken — иначе после свежей установки
  // канала не будет до логина.
  const idx = appJs.indexOf('push.ensureAndroidChannel?.()');
  const effectStart = appJs.lastIndexOf('useEffect(', idx);
  const effectEnd = appJs.indexOf('}, [', idx);
  const effect = appJs.slice(effectStart, effectEnd + 8);
  expect(
    /\}, \[\]\)/.test(effect),
    'эффект безусловный (deps []) — не зависит от hasToken/сессии'
  );
  expect(
    !/hasToken/.test(effect),
    'эффект не гейтится на hasToken'
  );
}

console.log('\n=== 6. Единственная точка создания канала, с утверждёнными параметрами ===');
{
  const creations = (pushJs.match(/setNotificationChannelAsync\(/g) || []).length;
  expect(creations === 1, `setNotificationChannelAsync вызывается ровно один раз (найдено ${creations})`);
  const block = pushJs.slice(pushJs.indexOf('async ensureAndroidChannel()'), pushJs.indexOf('async ensureAndroidChannel()') + 900);
  expect(block.includes(`setNotificationChannelAsync(NATIVE_PUSH_CHANNEL_ID`), 'канал создаётся под каноническим id');
  expect(/importance: Notifications\.AndroidImportance\.MAX/.test(block), 'importance = MAX (heads-up + звук)');
  expect(/sound: 'default'/.test(block), 'звук default сохранён');
  expect(/vibrationPattern: \[0, 250, 250, 250\]/.test(block), 'vibrationPattern сохранён');
  expect(/lightColor: '#378ADD'/.test(block), 'lightColor сохранён');
  // Создание канала не должно требовать разрешения.
  expect(
    !/requestPermissionsAsync|getPermissionsAsync/.test(block),
    'ensureAndroidChannel не запрашивает permissions (создание канала их не требует)'
  );
}

console.log('\n=== 7. Один канонический id во всех четырёх местах ===');
{
  const fromPushJs = pushJs.match(/export const NATIVE_PUSH_CHANNEL_ID = '([^']+)'/);
  const fromGateway = gatewayPy.match(/^NATIVE_PUSH_CHANNEL_ID\s*=\s*"([^"]+)"/m);
  const fromSender = senderPy.match(/^NATIVE_PUSH_CHANNEL_ID\s*=\s*"([^"]+)"/m);
  const fromPlugin = require(path.join(ROOT, 'plugins/withAndroidDefaultNotificationChannel.js')).NATIVE_PUSH_CHANNEL_ID;

  expect(!!fromPushJs && fromPushJs[1] === CANONICAL, `push.js: ${CANONICAL}`);
  expect(!!fromGateway && fromGateway[1] === CANONICAL, `push_gateway.py: ${CANONICAL}`);
  expect(!!fromSender && fromSender[1] === CANONICAL, `push_sender.py: ${CANONICAL}`);
  expect(fromPlugin === CANONICAL, `plugin: ${CANONICAL}`);
  expect(
    manifest.includes(`android:value="${CANONICAL}"`),
    `AndroidManifest.xml: ${CANONICAL}`
  );
}

console.log('\n=== 8. Fallback-канал не используется как штатный ===');
{
  // Python-комментарии тоже вырезаем — в push_gateway/push_sender инцидент
  // может быть описан текстом.
  const stripPy = (src) => src.replace(/(^|[^:])#[^\n]*/g, '$1').replace(/"""[\s\S]*?"""/g, ' ');
  for (const [name, src] of [
    ['push.js', pushCode],
    ['App.js', appCode],
    ['push_gateway.py', stripPy(gatewayPy)],
    ['push_sender.py', stripPy(senderPy)],
    ['AndroidManifest.xml', manifest.replace(/<!--[\s\S]*?-->/g, ' ')],
  ]) {
    expect(
      !/fcm_fallback_notification_channel/.test(src),
      `${name}: код не использует fcm_fallback_notification_channel как штатный канал`
    );
  }
}

console.log('\n=== 9. Оба backend-пути по-прежнему передают канал (push не тронут) ===');
{
  expect(
    /"channel_id": NATIVE_PUSH_CHANNEL_ID/.test(gatewayPy),
    'push_gateway (FCM v1): android.notification.channel_id = канонический'
  );
  expect(
    /"channelId": NATIVE_PUSH_CHANNEL_ID/.test(senderPy),
    'push_sender (Expo): channelId = канонический'
  );
  // Android 13+ permission не должен пострадать: POST_NOTIFICATIONS
  // приходит из манифеста expo-notifications через manifest merger.
  const libManifest = 'node_modules/expo-notifications/android/src/main/AndroidManifest.xml';
  if (fs.existsSync(path.join(ROOT, libManifest))) {
    expect(
      read(libManifest).includes('POST_NOTIFICATIONS'),
      'POST_NOTIFICATIONS по-прежнему приходит из expo-notifications (Android 13+ не сломан)'
    );
  }
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
