"""RELEASE GATE: сервер обязан РЕАЛЬНО отправлять native push, а не мокать.

ROOT CAUSE финального блокера (04.09.2026, QA2 210488250): BID/ACCEPT/CHAT
события создавались, in-app уведомления приходили, но Android shade был пуст
(`dumpsys` — 0 active NotificationRecord для com.urtruck.app.qa2). При этом на
устройствах всё было в порядке: permission выдан, канал urtruck_messages_v2
зарегистрирован, Firebase source/generated guards PASS.

Точка отказа оказалась НЕ на клиенте и НЕ в сборке, а в ПРОВАЙДЕРЕ:

    GET /security/api/v1/push/info на живом проде отдавал
        "native": { "expo": {...}, "fcm": { "mode": "MOCK" } }

то есть форму СТАРОГО push_sender — без gateway, с FCM в MOCK. Раньше (когда
QA2 210488243 физически проходила push) тот же эндпоинт отдавал
    "gateway_provider": "native_fcm_apns", "fcm_live": true,
    "fcm_project_id": "urtruck-e722b"

Причина: services/push_gateway.py (коммит fb5c6415) ОТСУТСТВУЕТ в origin/main,
а прод деплоится из main. Оставшийся legacy-путь push_sender._send_fcm при
FCM_MOCK (то есть при незаданном FCM_SERVER_KEY) возвращает управление СРАЗУ,
ничего не отправляя — сообщение физически не уходит в FCM, поэтому shade пуст.

Этот файл делает такую регрессию невозможной «молча»: если gateway пропал из
кода или перестал использоваться, release-gate краснеет в CI, а не через
двухтелефонный физический прогон.
"""
import os
import re
from pathlib import Path

BACKEND = Path(__file__).resolve().parent.parent


def _read(rel):
    return (BACKEND / rel).read_text(encoding="utf-8")


def test_native_push_gateway_module_exists():
    """push_gateway — обязательная часть релиза, а не опциональный файл."""
    assert (BACKEND / "services" / "push_gateway.py").exists(), (
        "services/push_gateway.py отсутствует — без него остаётся только legacy "
        "_send_fcm, который при FCM_MOCK ничего не отправляет и даёт пустой shade"
    )


def test_push_sender_dispatches_through_gateway():
    """Бизнес-события обязаны идти через gateway, а не через legacy-мок."""
    sender = _read("services/push_sender.py")
    assert "from services import push_gateway" in sender, (
        "push_sender должен импортировать push_gateway"
    )
    assert "push_gateway.send_to_devices(" in sender, (
        "нативная доставка должна выполняться через gateway.send_to_devices"
    )
    assert "push_gateway.active_devices(" in sender, (
        "получатели должны разрешаться через реестр устройств gateway"
    )


def test_gateway_reports_real_mode_in_push_info():
    """/push/info обязан показывать РЕАЛЬНЫЙ режим провайдера.

    Именно по этому полю расхождение «prod vs ветка» и обнаружилось: старая
    форма ответа не содержит gateway-блока вообще, поэтому мониторинг не мог
    отличить живой FCM от мока.
    """
    sender = _read("services/push_sender.py")
    gateway = _read("services/push_gateway.py")
    # Форма ответа: /push/info обязан включать блок gateway, иначе по нему
    # нельзя отличить «сервер реально шлёт в FCM» от «сервер мокает» — ровно
    # эта слепота и стоила финального физического gate.
    assert '"gateway": push_gateway.info()' in sender, (
        "/push/info обязан раскрывать состояние gateway"
    )
    assert re.search(r"^def info\(\)", gateway, re.M), (
        "push_gateway должен предоставлять info() для диагностики"
    )
    # Внутри должно быть видно и режим провайдера, и реестр устройств.
    gw_info = gateway[gateway.index("def info()"):]
    for field in ("mode", "fcm", "registry"):
        assert field in gw_info, f"gateway.info() должен раскрывать {field}"


def test_fcm_provider_sends_notification_payload_not_data_only():
    """Сообщение обязано нести notification-блок, иначе shade останется пуст."""
    gateway = _read("services/push_gateway.py")
    assert '"notification": {"title": title, "body": body}' in gateway, (
        "data-only сообщение не создаёт системное уведомление в фоне/после kill"
    )
    assert '"channel_id": NATIVE_PUSH_CHANNEL_ID' in gateway, (
        "android.notification.channel_id обязателен: на Android 8+ уведомление "
        "с неизвестным каналом молча отбрасывается"
    )
    assert '"priority": "HIGH"' in gateway, "без HIGH нет heads-up"


def test_provider_errors_are_classified_not_swallowed():
    """Отказ провайдера обязан быть различим, а не «просто не пришло»."""
    gateway = _read("services/push_gateway.py")
    for marker in ("UNREGISTERED", "SENDER_ID_MISMATCH", "THIRD_PARTY_AUTH_ERROR"):
        assert marker in gateway, f"нет классификации ответа FCM: {marker}"
    assert 'error_code="provider_not_configured"' in gateway, (
        "незаданные креденшелы должны давать явный provider_not_configured, "
        "а не тихий no-op"
    )
    assert "push_delivery_log" in gateway, (
        "каждая попытка доставки должна логироваться с error_code — иначе "
        "«shade пуст» невозможно диагностировать без телефона"
    )


def test_legacy_mock_path_cannot_be_the_only_native_route():
    """Legacy FCM-мок не должен обслуживать бизнес-события в одиночку."""
    sender = _read("services/push_sender.py")
    # FCM_MOCK по-прежнему существует как безопасный dev-режим, но нативная
    # доставка бизнес-событий должна выбирать gateway.
    assert "FCM_MOCK" in sender, "dev-режим сохраняется"
    # Порядок проверяем ВНУТРИ _send_native, а не по позициям определений
    # функций в файле (определение legacy-функции стоит выше — это ничего не
    # говорит о порядке вызовов).
    start = sender.index("def _send_native(")
    body = sender[start:sender.index("\ndef ", start + 10)]
    gateway_idx = body.find("push_gateway.send_to_devices(")
    legacy_idx = body.find("_send_native_legacy(")
    assert gateway_idx != -1, "gateway-путь обязателен внутри _send_native"
    assert legacy_idx != -1, "legacy остаётся fallback'ом на время миграции"
    assert gateway_idx < legacy_idx, (
        "gateway должен пробоваться ДО legacy-пути, иначе бизнес-события уйдут "
        "в FCM_MOCK и shade останется пуст"
    )
