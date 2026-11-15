"""Непрочитанное сообщение сохраняется при переносе сделки в архив."""
import uuid
from api import chat, notifications
from api.chat import SendMessageIn, get_messages, get_or_create_deal_room, send_message
from database.db import get_conn
from tests.test_unread_badge import _ids, _mk_accepted_deal, _u

def test_completed_deal_preserves_unread_until_its_room_is_read(monkeypatch):
    monkeypatch.setattr(chat,'send_to_user',lambda *args,**kwargs: 0)
    owner,driver=_ids(); rooms=[]; deals=[]
    for _ in range(2):
        cargo='archive-'+uuid.uuid4().hex
        room=get_or_create_deal_room(cargo,owner,driver); rooms.append(room)
        deals.append(_mk_accepted_deal(cargo,owner,driver,room))
        send_message(SendMessageIn(room_id=room,text='Контроль'),user=_u(driver))
    before=notifications.unread_badge_snapshot(owner)
    assert before['badge']==2
    with get_conn() as c: c.execute("UPDATE deals SET status='completed' WHERE id=?",(deals[0],))
    after=notifications.unread_badge_snapshot(owner)
    assert after['badge']==2
    assert {r['room_id'] for r in after['rooms']}==set(rooms)
    assert notifications.unread_badge_snapshot(driver)['badge']==0
    get_messages(rooms[0],user=_u(owner))
    remaining=notifications.unread_badge_snapshot(owner)
    assert remaining['badge']==1 and remaining['rooms'][0]['room_id']==rooms[1]
    assert notifications.unread_badge_snapshot(driver)['badge']==0
