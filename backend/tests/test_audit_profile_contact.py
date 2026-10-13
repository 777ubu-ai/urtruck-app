import pytest
from fastapi import HTTPException
from api import profile
from tests.test_profile_onboarding_contract import _run


def test_contact_email_is_separate_from_login_identity(monkeypatch):
    monkeypatch.setattr(profile,'_ensure_columns',lambda:None)
    result,captured=_run(monkeypatch,profile.UpdateProfileIn(contact_email=' Contact@Example.com ',country='Германия',city='Берлин'),current={'role':'client','email':'login@example.com'})
    assert result=={'ok':True}
    assert captured['values']['contact_email']=='contact@example.com'
    assert captured['values']['country']=='Германия'
    assert 'email' not in captured['values']
    assert 'phone' not in captured['values']


def test_contact_can_be_cleared_and_invalid_value_is_rejected(monkeypatch):
    monkeypatch.setattr(profile,'_ensure_columns',lambda:None)
    _,captured=_run(monkeypatch,profile.UpdateProfileIn(contact_email=''))
    assert captured['values']['contact_email']==''
    with pytest.raises(HTTPException) as e:_run(monkeypatch,profile.UpdateProfileIn(contact_email='not an email'))
    assert e.value.status_code==422
