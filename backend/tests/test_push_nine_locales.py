"""Девять системных локалей: реальные registry API/SQLite и per-device gateway."""
import hashlib
import json
from string import Formatter
import uuid

import pytest
from api import push as api
from database import registration_dal as reg
from database.db import get_conn
from fastapi import FastAPI
from fastapi.testclient import TestClient
from services import push_gateway as gateway, push_i18n as i18n

LOCALES = ('RU','KK','EN','ZH','TR','UZ','KY','TG','BE')


def fields(text):
    return sorted(name for _, name, _, _ in Formatter().parse(text) if name is not None)


def test_previous_four_templates_are_unchanged():
    old = {event: {code: rows[code] for code in ('RU','KK','ZH','EN')} for event, rows in i18n.TEMPLATES.items()}
    assert hashlib.sha256(json.dumps(old,ensure_ascii=False,sort_keys=True).encode()).hexdigest() == '497ebfbfdd576dffcefdd945f3bd20220d23fef4e6c31e5ebedb291fc600d0ad'


@pytest.mark.parametrize('locale', LOCALES)
def test_every_template_preserves_placeholders_and_opaque_values(locale):
    values = {'amount':'1 234,50 USD','route':'Иу → Алматы {never_translate}', 'rating':'4.5','booking':'KZ-123', 'comment':'原文: пользователь {amount}', 'filename':'договор_原文.pdf'}
    for event, rows in i18n.TEMPLATES.items():
        assert set(rows) == set(LOCALES), event
        for source, text in zip(rows['RU'], rows[locale]):
            assert isinstance(text, str) and text.strip()
            assert fields(text) == fields(source), (event, locale)
        title, body = i18n.push_text(event, locale, **values)
        for name in fields(rows[locale][1]):
            assert values[name] in body, (event, locale, name)
        assert title and body
    assert i18n.push_text('review_received_comment', locale, **values)[1] == values['comment']
    assert i18n.push_text('chat_attachment', locale, **values)[1] == values['filename']
    assert i18n.push_text('not_a_system_event', locale) == (None, None)


@pytest.mark.parametrize('raw,expected', [('tr-TR','TR'),('uz_Latn_UZ','UZ'),('ky-KG','KY'),('kg','KY'),('tg-TJ','TG'),('tj','TG'),('be-BY','BE'),('by','BE'),('ru-RU','RU'),('kz','KK'),('zh-Hans-CN','ZH'),('en-US','EN'),('unknown','RU'),(None,'RU')])
def test_locale_tags_and_legacy_aliases(raw, expected):
    assert i18n.normalize_locale(raw) == expected


def identity():
    guest = reg.create_guest()
    uid = guest['id'] if isinstance(guest, dict) else guest
    return uid, {'Authorization':'Bearer '+reg.create_session(uid)}


def client():
    app = FastAPI(); app.include_router(api.push_router,prefix='/push')
    return TestClient(app)


@pytest.mark.parametrize('locale', LOCALES)
def test_device_locale_persists_updates_and_cannot_be_changed_by_other_owner(locale):
    c = client(); uid, auth = identity(); _, other_auth = identity()
    token = 'fcm-locale-'+uuid.uuid4().hex; device = uuid.uuid4().hex
    data = {'token':token,'device_id':device,'provider':'fcm','platform':'android','app_id':'com.urtruck.app.qa2','locale':locale}
    assert c.post('/push/register-native',json=data,headers=auth).status_code == 200
    assert gateway.get_recipient_locale(uid) == locale
    assert c.post('/push/register-native',json={**data,'locale':'tr-TR'},headers=auth).status_code == 200
    devices = gateway.active_devices(uid)
    assert len(devices) == 1 and devices[0]['locale'] == 'tr-TR'
    assert gateway.get_recipient_locale(uid) == 'TR'
    assert c.post('/push/register-native',json={**data,'device_id':uuid.uuid4().hex,'locale':'BE'},headers=other_auth).status_code == 409
    assert gateway.active_devices(uid)[0]['locale'] == 'tr-TR'
    # Отсутствующее поле старого клиента не стирает сохранённый язык.
    without = {key:value for key,value in data.items() if key != 'locale'}
    assert c.post('/push/register-native',json=without,headers=auth).status_code == 200
    assert gateway.active_devices(uid)[0]['locale'] == 'tr-TR'


def test_recipient_locale_uses_latest_enabled_device():
    uid, auth = identity(); c = client(); ids=[]
    for locale in ('BE','TR'):
        token='fcm-latest-'+uuid.uuid4().hex
        assert c.post('/push/register-native',headers=auth,json={'token':token,'device_id':uuid.uuid4().hex,'provider':'fcm','platform':'android','locale':locale}).status_code==200
        ids.append(next(d['id'] for d in gateway.active_devices(uid) if d['push_token']==token))
    with get_conn() as db:
        db.execute("UPDATE push_devices SET last_seen_at='2099-01-01' WHERE id=?", (ids[0],))
    assert gateway.get_recipient_locale(uid)=='BE'
    with get_conn() as db: db.execute('UPDATE push_devices SET enabled=0 WHERE id=?',(ids[0],))
    assert gateway.get_recipient_locale(uid)=='TR'


def test_delivery_localizes_each_recipient_device_without_touching_route_or_amount(monkeypatch):
    devices=[{'id':i+1,'push_provider':'fcm','push_token':'fcm-'+code,'platform':'android','locale':code} for i,code in enumerate(LOCALES)]
    monkeypatch.setattr(gateway,'active_devices',lambda uid: devices if uid=='recipient' else [])
    monkeypatch.setattr(gateway,'notification_already_read',lambda *a: False)
    monkeypatch.setattr(gateway,'_already_sent_to_device',lambda *a: False)
    monkeypatch.setattr(gateway,'log_delivery',lambda *a: None)
    calls=[]
    class Provider:
        def supports_platform(self, platform): return True
        def validate_token(self, token): return True
        def send(self,token,title,body,data,badge=None):
            calls.append((token,title,body,data))
            return gateway.ProviderResult('fcm','sent')
    monkeypatch.setattr(gateway,'FCMProvider',Provider)
    params={'route':'Иу → Алматы {keep}','amount':'1 234,50 USD'}
    result=gateway.send_to_devices(user_id='recipient',title='sender RU',body='исходный',data={'i18n_event':'bid_created','i18n_params':params},badge=0,mode='native')
    assert result['sent']==9
    for code, (token,title,body,data) in zip(LOCALES,calls):
        assert (title,body)==i18n.push_text('bid_created',code,**params)
        assert params['route'] in body and params['amount'] in body
    calls.clear()
    gateway.send_to_devices(user_id='recipient',title='Имя отправителя',body='原文 Привет {amount}',data={'kind':'chat'},badge=0,mode='native')
    assert len(calls)==9 and all((title,body)==('Имя отправителя','原文 Привет {amount}') for _,title,body,_ in calls)
