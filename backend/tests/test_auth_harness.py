from fastapi import APIRouter, Depends, FastAPI
from fastapi.testclient import TestClient

from api.verification_gate import require_level
from tests.auth_harness import override_require_level


def test_auth_override_walks_fastapi_lazy_included_router():
    router = APIRouter()

    @router.get("/private")
    def private_route(user=Depends(require_level(1))):
        return {"user_id": user["id"]}

    app = FastAPI()
    app.include_router(router)
    overrides = override_require_level(app, lambda: {"id": "test-user"})

    assert overrides
    response = TestClient(app).get("/private")
    assert response.status_code == 200
    assert response.json() == {"user_id": "test-user"}
