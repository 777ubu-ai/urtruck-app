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
    current = {'incoming': {'ready': 1, 'pending': 3, 'quarantined': 1, 'progress': 4}}
    first = health.evaluate(current, {}, 1000)
    assert first['problems'] == ['incoming_validation_quarantined']
    second = health.evaluate(current, first, 1121)
    assert second['problems'] == ['incoming_delivery_stalled', 'incoming_validation_quarantined']


def test_scheduled_retry_is_not_misreported_as_a_stalled_ready_queue():
    delayed = {'incoming': {'ready': 0, 'pending': 1, 'quarantined': 0,
                            'progress': 'same-progress'}}
    first = health.evaluate(delayed, {}, 1000)
    later = health.evaluate(delayed, first, 1121)
    assert later['problems'] == []


def test_due_incoming_record_still_alerts_when_progress_stops():
    due = {'incoming': {'ready': 1, 'pending': 1, 'quarantined': 0,
                        'progress': 'same-progress'}}
    first = health.evaluate(due, {}, 1000)
    later = health.evaluate(due, first, 1121)
    assert later['problems'] == ['incoming_delivery_stalled']


def test_sustained_incoming_backlog_growth_is_reported_separately_from_delivery_stall():
    first = health.evaluate({'incoming': {'ready': 0, 'pending': 100, 'quarantined': 0,
                                           'progress': 'moving'}}, {}, 1000)
    later = health.evaluate({'incoming': {'ready': 0, 'pending': 130, 'quarantined': 0,
                                           'progress': 'moving'}}, first, 1600)
    assert later['problems'] == ['incoming_backlog_growing']
    assert 'incoming_delivery_stalled' not in later['problems']


def test_backlog_growth_alert_resets_when_pending_declines():
    first = health.evaluate({'incoming': {'ready': 0, 'pending': 100, 'progress': 'moving'}}, {}, 1000)
    decline = health.evaluate({'incoming': {'ready': 0, 'pending': 90, 'progress': 'moving'}}, first, 1400)
    later = health.evaluate({'incoming': {'ready': 0, 'pending': 100, 'progress': 'moving'}}, decline, 1700)
    assert later['problems'] == []


def test_expired_retries_are_reported_but_not_counted_as_ready_backlog():
    current = {'incoming': {'ready': 0, 'pending': 61, 'backlog': 1, 'expired_pending': 60,
                            'quarantined': 0, 'progress': 'same-progress'}}
    first = health.evaluate(current, {}, 1000)
    later = health.evaluate(current, first, 1121)
    assert 'incoming_expired_pending' in later['problems']
    assert 'incoming_delivery_stalled' not in later['problems']


def test_source_queue_stall_is_distinct_from_import_delivery_progress():
    current = {'incoming': {'ready': 0, 'pending': 0, 'source_waiting': 20,
                            'source_progress': 'same-source-progress', 'progress': 'delivery-moving'}}
    first = health.evaluate(current, {}, 1000)
    later = health.evaluate(current, first, 1121)
    assert later['problems'] == ['incoming_source_stalled']


def test_source_queue_progress_resets_stall_and_source_backlog_growth_is_separate():
    first_snapshot = {'incoming': {'ready': 0, 'source_waiting': 20,
        'source_progress': 'scan-1', 'progress': 'delivery-moving'}}
    first = health.evaluate(first_snapshot, {}, 1000)
    later_snapshot = {'incoming': {'ready': 0, 'source_waiting': 60,
        'source_progress': 'scan-2', 'progress': 'delivery-moving'}}
    later = health.evaluate(later_snapshot, first, 1600)
    assert later['problems'] == ['incoming_source_backlog_growing']
