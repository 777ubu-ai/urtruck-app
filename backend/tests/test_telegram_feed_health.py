"""Проверки реального прогресса, внешней паузы и ограничения рестартов."""
import importlib.util
from pathlib import Path

path = Path(__file__).resolve().parents[2]/'ops/telegram-feed/health.py'
spec = importlib.util.spec_from_file_location('feed_health', path)
health = importlib.util.module_from_spec(spec)
spec.loader.exec_module(health)


def snapshot(ready=1, progress=1, paused_until=0):
    return {'heartbeat_age': 0, 'telegram': {
        'ready': ready, 'progress': progress, 'paused_until': paused_until}}


def test_detects_stall_but_resets_after_real_delivery():
    first = health.evaluate(snapshot(), {}, 1000)
    stalled = health.evaluate(snapshot(), first, 1121)
    assert stalled['problems'] == ['telegram_delivery_stalled']
    assert health.evaluate(snapshot(progress=2), stalled, 1180)['problems'] == []


def test_empty_queue_and_flood_wait_are_not_delivery_failure():
    first = health.evaluate(snapshot(), {}, 1000)
    assert health.evaluate(snapshot(ready=0), first, 1500)['problems'] == []
    paused = health.evaluate(snapshot(paused_until=2000), first, 1500)
    assert paused['problems'] == []
    assert health.evaluate(snapshot(), paused, 2001)['problems'] == []


def test_recovery_is_bounded_and_does_not_restart_on_destination_error():
    state = health.evaluate({'heartbeat_age': 181}, {}, 1000)
    assert health.restart_allowed(state, 1000)
    state['restarts'] = [900]
    assert not health.restart_allowed(state, 1000)
    state['restarts'] = [400, 700]
    assert not health.restart_allowed(state, 1100)
    state['restarts'] = []
    state['problems'] = ['telegram_delivery_stalled']
    assert not health.restart_allowed(state, 1000)


def test_bridge_errors_are_visible_even_between_scheduled_retries():
    current = {'incoming': {'ready': 0, 'pending': 3, 'quarantined': 1, 'progress': 4}}
    first = health.evaluate(current, {}, 1000)
    assert first['problems'] == ['incoming_validation_quarantined']
    second = health.evaluate(current, first, 1121)
    assert second['problems'] == ['incoming_delivery_stalled', 'incoming_validation_quarantined']
