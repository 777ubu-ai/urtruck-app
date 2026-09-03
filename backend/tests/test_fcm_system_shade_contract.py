"""P0 2026-09-03 — контракт «Android system push реально отображается в shade».

Физически доказанный дефект (двухтелефонный QA, com.urtruck.app.qa2):
business event и in-app notification работают, а Android system
notification в notification shade не появляется вообще.

Первопричина оказалась на стороне СБОРКИ (локальная ./gradlew release без
google-services.json → APK без Firebase runtime-конфига → FCM-токен
физически невозможен; закрыто гардом в android/app/build.gradle и тестом
tests/frontend/test_android_firebase_release_guard.mjs).

Backend при этом здоров, и этот файл фиксирует ровно те его свойства,
поломка любого из которых воспроизвела бы ТОТ ЖЕ симптом заново —
«событие есть, in-app есть, в shade пусто»:

  1. FCM-сообщение содержит блок `notification` (title/body). Data-only
     сообщение НЕ создаёт системное уведомление, когда приложение убито
     или в фоне — это классический способ получить ровно этот баг.
  2. Указан android.notification.channel_id, и он СОВПАДАЕТ с каналом,
     который создаёт приложение. На Android 8+ уведомление с неизвестным
     channel_id молча отбрасывается системой.
  3. Приоритет HIGH — иначе heads-up не показывается.
  4. Ошибки идентичности проекта (SENDER_ID_MISMATCH / THIRD_PARTY_AUTH_ERROR)
     классифицируются как invalid_credentials и НЕ гасят токен устройства
     (гасить его при ошибке креденшелов — потеря живого устройства).
"""
import os
import re

BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REPO_ROOT = os.path.dirname(BACKEND_DIR)


def _gateway_src() -> str:
    with open(os.path.join(BACKEND_DIR, "services", "push_gateway.py"), encoding="utf-8") as f:
        return f.read()


def _fcm_send_body() -> str:
    """Тело FCMProvider.send() — только оно формирует полезную нагрузку."""
    src = _gateway_src()
    start = src.index("class FCMProvider")
    end = src.index("class APNsProvider")
    cls = src[start:end]
    send_idx = cls.index("def send(")
    return cls[send_idx:]


def test_fcm_message_carries_notification_block_not_data_only():
    """Data-only push не показывается в shade — блок notification обязателен."""
    body = _fcm_send_body()
    assert '"notification": {"title": title, "body": body}' in body, (
        "FCM message должен содержать notification{title,body}: data-only "
        "сообщение не создаёт системное уведомление в фоне/после kill"
    )


def test_fcm_message_sets_high_priority_and_sound():
    body = _fcm_send_body()
    assert '"priority": "HIGH"' in body, "без HIGH приоритета нет heads-up уведомления"
    assert '"sound": "default"' in body, "уведомление должно быть звуковым"


def test_fcm_channel_id_matches_channel_created_by_the_app():
    """Android 8+: уведомление с неизвестным channel_id молча отбрасывается."""
    body = _fcm_send_body()
    assert '"channel_id": NATIVE_PUSH_CHANNEL_ID' in body, (
        "android.notification.channel_id обязателен"
    )

    gateway_channel = re.search(
        r'^NATIVE_PUSH_CHANNEL_ID\s*=\s*"([^"]+)"', _gateway_src(), re.M
    )
    assert gateway_channel, "NATIVE_PUSH_CHANNEL_ID не найден в push_gateway.py"

    with open(os.path.join(BACKEND_DIR, "services", "push_sender.py"), encoding="utf-8") as f:
        sender_channel = re.search(r'^NATIVE_PUSH_CHANNEL_ID\s*=\s*"([^"]+)"', f.read(), re.M)
    assert sender_channel, "NATIVE_PUSH_CHANNEL_ID не найден в push_sender.py"

    with open(os.path.join(REPO_ROOT, "src", "utils", "push.js"), encoding="utf-8") as f:
        push_js = f.read()
    app_channel = re.search(
        r"NATIVE_PUSH_CHANNEL_ID\s*=\s*'([^']+)'", push_js
    )
    assert app_channel, "NATIVE_PUSH_CHANNEL_ID не найден в src/utils/push.js"

    # Приложение обязано РЕАЛЬНО создать этот канал, а не только знать его id.
    assert "setNotificationChannelAsync(NATIVE_PUSH_CHANNEL_ID" in push_js, (
        "приложение должно создавать канал через setNotificationChannelAsync"
    )

    assert (
        gateway_channel.group(1) == sender_channel.group(1) == app_channel.group(1)
    ), (
        "channel_id разошёлся между backend и приложением: "
        f"gateway={gateway_channel.group(1)} sender={sender_channel.group(1)} "
        f"app={app_channel.group(1)} — Android отбросит такие уведомления"
    )


def test_fcm_credential_errors_do_not_disable_the_device():
    """Ошибка идентичности проекта не должна гасить живой токен устройства."""
    body = _fcm_send_body()
    assert "SENDER_ID_MISMATCH" in body and "THIRD_PARTY_AUTH_ERROR" in body, (
        "ошибки идентичности Firebase-проекта должны распознаваться отдельно"
    )
    assert 'code, retryable = "invalid_credentials", False' in body, (
        "они классифицируются как invalid_credentials"
    )

    # Гасится устройство только при invalid_token, и никогда при
    # invalid_credentials — иначе неверный конфиг сервера выключил бы
    # все реальные устройства.
    src = _gateway_src()
    assert 'if result.error_code == "invalid_token":' in src, (
        "деактивация устройства привязана строго к invalid_token"
    )
    assert 'error_code == "invalid_credentials"' not in src.split("def log_delivery")[1].split("def ")[0], (
        "invalid_credentials НЕ должен деактивировать устройство"
    )


def test_fcm_provider_is_bound_to_android_platform():
    """FCM должен обслуживать именно android-устройства."""
    src = _gateway_src()
    start = src.index("class FCMProvider")
    end = src.index("class APNsProvider")
    cls = src[start:end]
    assert 'return (platform or "").lower() == "android"' in cls, (
        "FCMProvider.supports_platform должен матчить android без учёта регистра"
    )
