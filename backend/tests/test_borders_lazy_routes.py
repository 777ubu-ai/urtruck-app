import os
import sys
from pathlib import Path

os.environ.setdefault("DB_PATH", "/tmp/urtruck_test_borders_lazy_routes.db")
os.environ.setdefault("CGR_FEATURE_ENABLED", "true")
os.environ.setdefault("CGR_IIN_SALT", "test-lazy-routes-salt")
Path(os.environ["DB_PATH"]).unlink(missing_ok=True)
ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from database import db as ddb
from database import cgr_dal

ddb.init_db()
cgr_dal.init_cgr_schema()
cgr_dal.upsert_checkpoint("Калжат - Дулаты", country_to="CN", code="kalzhat_dulaty")

from fastapi import FastAPI
from fastapi.testclient import TestClient
from api.borders import borders_router

app = FastAPI()
app.include_router(borders_router, prefix="/api/v1/borders")
client = TestClient(app)


def test_catalog_is_specific_route_and_network_free_contract():
    response = client.get("/api/v1/borders/catalog")
    assert response.status_code == 200, response.text
    data = response.json()
    assert data["lazy"] is True
    assert data["cgr_requests"] == 0
    assert any(x["name"] == "Калжат - Дулаты" for x in data["checkpoints"])


def test_live_route_registered_before_legacy_dynamic_route():
    paths = [getattr(route, "path", "") for route in borders_router.routes]
    assert "/live/{code}" in paths
    assert "/catalog" in paths
    assert "/{border_id}" in paths
    assert paths.index("/catalog") < paths.index("/{border_id}")
    assert paths.index("/live/{code}") < paths.index("/{border_id}")
