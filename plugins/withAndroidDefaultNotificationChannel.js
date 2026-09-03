/**
 * Expo Config Plugin: канонический Android notification channel по умолчанию.
 *
 * P2 (03.09.2026, физический QA на двух телефонах): system push приходил, но
 * Android NotificationRecord показывал канал `fcm_fallback_notification_channel`
 * вместо утверждённого `urtruck_messages_v2`.
 *
 * Причина: Firebase SDK, получив notification-сообщение, использует канал из
 * `android.notification.channel_id`; если такого канала на устройстве НЕТ, он
 * берёт канал из meta-data манифеста
 * `com.google.firebase.messaging.default_notification_channel_id`, а если и её
 * нет — САМ создаёт служебный `fcm_fallback_notification_channel`.
 * В манифесте UrTruck были только default_notification_color и
 * default_notification_icon, а channel_id отсутствовал.
 *
 * Backend при этом канонический канал передаёт корректно на обоих путях
 * доставки (services/push_gateway.py → android.notification.channel_id,
 * services/push_sender.py → channelId), поэтому pipeline доставки не менялся —
 * это правка исключительно Android-конфигурации приёмной стороны.
 *
 * Вторая половина фикса живёт в src/utils/push.js: канал создаётся на старте
 * приложения, а не только внутри registerNative() после permission-гейта,
 * иначе первый пуш после установки приходит раньше существования канала.
 *
 * Значение обязано совпадать с NATIVE_PUSH_CHANNEL_ID в src/utils/push.js,
 * backend/services/push_gateway.py и backend/services/push_sender.py.
 * Контракт закреплён тестами (tests/frontend/test_android_notification_channel.mjs,
 * backend/tests/test_fcm_system_shade_contract.py).
 */
const { withAndroidManifest } = require('expo/config-plugins');

const NATIVE_PUSH_CHANNEL_ID = 'urtruck_messages_v2';
const META_NAME = 'com.google.firebase.messaging.default_notification_channel_id';

function withAndroidDefaultNotificationChannel(config) {
  return withAndroidManifest(config, (config) => {
    const application = config.modResults?.manifest?.application?.[0];
    if (!application) return config;

    if (!Array.isArray(application['meta-data'])) {
      application['meta-data'] = [];
    }
    const metaData = application['meta-data'];

    // Идемпотентно: существующую запись обновляем, а не дублируем —
    // дубль meta-data с одним именем ломает сборку манифеста.
    const existing = metaData.find((item) => item?.$?.['android:name'] === META_NAME);
    if (existing) {
      existing.$['android:value'] = NATIVE_PUSH_CHANNEL_ID;
      delete existing.$['android:resource'];
    } else {
      metaData.push({
        $: {
          'android:name': META_NAME,
          'android:value': NATIVE_PUSH_CHANNEL_ID,
        },
      });
    }

    return config;
  });
}

module.exports = withAndroidDefaultNotificationChannel;
module.exports.NATIVE_PUSH_CHANNEL_ID = NATIVE_PUSH_CHANNEL_ID;
module.exports.META_NAME = META_NAME;
