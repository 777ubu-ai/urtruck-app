"""Уточнение неизвестной страны: владелец до сделки, обе стороны после принятия.

Города, цены, участники, ID, статусы и исходные объявления сделки не меняются.
Старые неизвестные страны никогда не заполняются миграцией или догадкой.
"""
from pathlib import Path
from uuid import uuid4

from fastapi import HTTPException
from services.geo_normalize import normalize_country, is_international_route

OPEN_STATUSES = ('accepted', 'in_progress', 'at_border')


def init_schema(c):
    schema = Path(__file__).resolve().parent.parent / 'database/route_country_clarifications.sql'
    c.executescript(schema.read_text(encoding='utf-8'))
    cols = {r['name'] for r in c.execute('PRAGMA table_info(deals)')}
    for name in ('from_country_snapshot', 'to_country_snapshot'):
        if name not in cols:
            c.execute(f'ALTER TABLE deals ADD COLUMN {name} TEXT')


def _fail(status, code, message):
    raise HTTPException(status_code=status, detail={'error': code, 'message': message})


def valid_route(from_country, to_country):
    _, error = is_international_route(from_country, to_country)
    if error != 'ok':
        _fail(409, error, 'Владелец должен уточнить страну маршрута до принятия предложения')
    return normalize_country(from_country), normalize_country(to_country)


def _lock(c):
    # Все проверки и запись защищены одним SQLite writer lock.
    if not c.in_transaction:
        c.execute('BEGIN IMMEDIATE')


def effective_route(c, deal):
    if deal.get('from_country_snapshot') is not None or deal.get('to_country_snapshot') is not None:
        return {'from_country': deal.get('from_country_snapshot'), 'to_country': deal.get('to_country_snapshot')}
    row = c.execute(
        'SELECT COALESCE(c.from_country,t.from_country) AS from_country, '
        'COALESCE(c.to_country,t.to_country) AS to_country FROM deals d '
        'LEFT JOIN cargos c ON c.id=d.cargo_id LEFT JOIN trips t ON t.id=d.trip_id WHERE d.id=?',
        (deal['id'],)).fetchone()
    return dict(row) if row else {'from_country': None, 'to_country': None}


def _existing(c, kind, entity_id, request_id, actor, countries):
    row = c.execute('SELECT * FROM route_country_clarifications WHERE entity_kind=? AND entity_id=? AND request_id=?',
                    (kind, entity_id, request_id)).fetchone()
    if row:
        row = dict(row)
        if row['proposer_id'] != actor or (row['from_country_after'], row['to_country_after']) != countries:
            _fail(409, 'ROUTE_REQUEST_CONFLICT', 'Этот запрос уже использован для другого уточнения')
    return dict(row) if row else None


def _changes(before, countries):
    for field, after in zip(('from_country', 'to_country'), countries):
        previous = normalize_country(before.get(field))
        if previous and previous != after:
            _fail(409, 'ROUTE_COUNTRY_ALREADY_SET', 'Известную страну нельзя менять через уточнение неизвестного маршрута')


def _record(c, kind, entity_id, actor, request_id, before, countries, status):
    rid = str(uuid4())
    c.execute('INSERT INTO route_country_clarifications '
              '(id,entity_kind,entity_id,request_id,proposer_id,from_country_before,to_country_before,'
              'from_country_after,to_country_after,status,applied_at) '
              "VALUES(?,?,?,?,?,?,?,?,?,?,CASE WHEN ?='applied' THEN CURRENT_TIMESTAMP END)",
              (rid, kind, entity_id, request_id, actor, before.get('from_country'), before.get('to_country'),
               *countries, status, status))
    return dict(c.execute('SELECT * FROM route_country_clarifications WHERE id=?', (rid,)).fetchone())


def clarify_listing(c, kind, entity_id, actor, request_id, from_country, to_country):
    _lock(c)
    table, owner = {'cargo': ('cargos', 'owner_id'), 'trip': ('trips', 'driver_id')}[kind]
    row = c.execute(f'SELECT * FROM {table} WHERE id=?', (entity_id,)).fetchone()
    if not row:
        _fail(404, 'LISTING_NOT_FOUND', 'Объявление не найдено')
    listing = dict(row)
    if listing[owner] != actor:
        _fail(403, 'NOT_LISTING_OWNER', 'Уточнить страну может только владелец объявления')
    countries = valid_route(from_country, to_country)
    previous = _existing(c, kind, entity_id, request_id, actor, countries)
    if previous:
        return {'ok': True, 'clarification': previous}
    if listing.get('status') != 'active' or c.execute(
            f"SELECT 1 FROM deals WHERE {kind}_id=? AND status <> 'cancelled' LIMIT 1", (entity_id,)).fetchone():
        _fail(409, 'ROUTE_REQUIRES_PARTNER_CONFIRMATION', 'Маршрут принятой сделки уточняется только с подтверждением второй стороны')
    _changes(listing, countries)
    changed = [(field, value) for field, value in zip(('from_country', 'to_country'), countries)
               if not normalize_country(listing.get(field))]
    if not changed:
        return {'ok': True, 'clarification': None}
    c.execute(f"UPDATE {table} SET " + ','.join(field+'=?' for field, _ in changed) + ' WHERE id=?',
              (*[value for _, value in changed], entity_id))
    return {'ok': True, 'clarification': _record(c, kind, entity_id, actor, request_id, listing, countries, 'applied')}


def _deal(c, deal_id, actor):
    row = c.execute('SELECT * FROM deals WHERE id=?', (deal_id,)).fetchone()
    if not row:
        _fail(404, 'DEAL_NOT_FOUND', 'Сделка не найдена')
    deal = dict(row)
    if actor not in (deal['shipper_id'], deal['driver_id']):
        _fail(403, 'NOT_DEAL_PARTICIPANT', 'Уточнение доступно только участникам сделки')
    return deal


def _open(deal, countries):
    if deal['status'] not in OPEN_STATUSES:
        _fail(409, 'ROUTE_DEAL_CLOSED', 'В доставленной или закрытой сделке маршрут не изменяется')
    if deal['status'] == 'at_border' and countries[0] == countries[1]:
        _fail(409, 'ROUTE_BORDER_CONFLICT', 'Внутренний маршрут несовместим с уже зафиксированным пересечением границы')


def propose_deal(c, deal_id, actor, request_id, from_country, to_country):
    _lock(c)
    deal = _deal(c, deal_id, actor)
    owner = deal['shipper_id'] if deal.get('cargo_id') else deal['driver_id']
    if actor != owner or deal['shipper_id'] == deal['driver_id']:
        _fail(403, 'NOT_LISTING_OWNER', 'Предложить уточнение может только владелец исходного объявления')
    countries = valid_route(from_country, to_country)
    previous = _existing(c, 'deal', deal_id, request_id, actor, countries)
    if previous:
        return {'ok': True, 'clarification': previous}
    _open(deal, countries)
    before = effective_route(c, deal)
    _changes(before, countries)
    if is_international_route(before['from_country'], before['to_country'])[1] == 'ok':
        _fail(409, 'ROUTE_ALREADY_RESOLVED', 'Страны маршрута уже определены')
    c.execute("UPDATE route_country_clarifications SET status='superseded' "
              "WHERE entity_kind='deal' AND entity_id=? AND status='pending'", (deal_id,))
    return {'ok': True, 'clarification': _record(c, 'deal', deal_id, actor, request_id, before, countries, 'pending')}


def confirm_deal(c, deal_id, clarification_id, actor):
    _lock(c)
    deal = _deal(c, deal_id, actor)
    row = c.execute("SELECT * FROM route_country_clarifications WHERE id=? AND entity_kind='deal' AND entity_id=?",
                    (clarification_id, deal_id)).fetchone()
    if not row:
        _fail(404, 'ROUTE_PROPOSAL_NOT_FOUND', 'Предложение уточнения не найдено')
    proposed = dict(row)
    if actor == proposed['proposer_id']:
        _fail(403, 'ROUTE_PARTNER_CONFIRMATION_REQUIRED', 'Нужно подтверждение второй стороны сделки')
    if proposed['status'] == 'applied' and proposed['approver_id'] == actor:
        return {'ok': True, 'clarification': proposed}
    if proposed['status'] != 'pending':
        _fail(409, 'ROUTE_PROPOSAL_STALE', 'Это предложение уже заменено; обновите данные сделки')
    countries = valid_route(proposed['from_country_after'], proposed['to_country_after'])
    _open(deal, countries)
    current = effective_route(c, deal)
    if (current['from_country'], current['to_country']) != (proposed['from_country_before'], proposed['to_country_before']):
        _fail(409, 'ROUTE_PROPOSAL_STALE', 'Маршрут изменился; требуется новое подтверждение')
    _changes(current, countries)
    c.execute('UPDATE deals SET from_country_snapshot=?,to_country_snapshot=? WHERE id=?', (*countries, deal_id))
    c.execute("UPDATE route_country_clarifications SET status='applied',approver_id=?,applied_at=CURRENT_TIMESTAMP "
              "WHERE id=? AND status='pending'", (actor, clarification_id))
    return {'ok': True, 'clarification': dict(c.execute('SELECT * FROM route_country_clarifications WHERE id=?', (clarification_id,)).fetchone())}


def deal_state(c, deal, actor):
    # Миграция создаёт пустой журнал, без выдуманного backfill старых сделок.
    pending = c.execute("SELECT * FROM route_country_clarifications WHERE entity_kind='deal' AND entity_id=? AND status='pending'", (deal['id'],)).fetchone()
    applied = c.execute("SELECT * FROM route_country_clarifications WHERE entity_kind='deal' AND entity_id=? AND status='applied' ORDER BY rowid DESC LIMIT 1", (deal['id'],)).fetchone()
    owner = deal['shipper_id'] if deal.get('cargo_id') else deal['driver_id']
    return {'pending': dict(pending) if pending else None, 'applied': dict(applied) if applied else None,
            'can_propose': actor == owner and deal['status'] in OPEN_STATUSES
            and is_international_route(**effective_route(c, deal))[1] != 'ok',
            'can_confirm': bool(pending and pending['proposer_id'] != actor and deal['status'] in OPEN_STATUSES)}
