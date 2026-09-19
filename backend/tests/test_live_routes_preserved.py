"""Серверные маршруты сохраняют авторизацию после обновления QA-кода."""
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from api.admin_control import control_router
from api.presence import presence_router


@pytest.mark.parametrize("path", ["ping", "summary", "online", "deals", "chats", "users", "system"])
def test_control_center_requires_admin(path):
    app = FastAPI()
    app.include_router(control_router, prefix="/control")
    response = TestClient(app, client=("control-test-" + path, 50000)).get("/control/" + path)
    assert response.status_code in (401, 403)


def test_presence_requires_authentication():
    app = FastAPI()
    app.include_router(presence_router, prefix="/presence")
    response = TestClient(app).post("/presence/heartbeat", json={})
    assert response.status_code == 401
