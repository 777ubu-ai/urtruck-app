"""Public crawler HTML must expose only a currently public cargo allow-list."""
from fastapi import FastAPI
from fastapi.testclient import TestClient

from api.public_share import share_router
from database.db import get_conn


app = FastAPI()
app.include_router(share_router)
client = TestClient(app)


def _seed(cargo_id: str, *, status: str = "active", description: str = "Electronics"):
    with get_conn() as conn:
        conn.execute(
            """INSERT INTO cargos
               (id, owner_id, owner_phone, owner_name, from_city, to_city,
                cargo_desc, cargo_type, weight_tons, volume_m3, price,
                currency, pickup_date, status, published_at)
               VALUES (?, 'owner-private', '+70000000000', 'Private owner',
                       'Иу', 'Алматы', ?, 'tent', 10, 82, 1500, 'USD',
                       '2099-10-05', ?, CURRENT_TIMESTAMP)""",
            (cargo_id, description, status),
        )


def _get(cargo_id: str, host: str = "qa2.urtruck.kz"):
    return client.get(f"/cargos/{cargo_id}", headers={"host": host})


def test_active_public_cargo_has_server_html_og_and_escapes_untrusted_text():
    cargo_id = "share-public-1"
    _seed(cargo_id, description="Electronics <script>alert(1)</script>")

    response = _get(cargo_id)

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/html")
    assert response.headers["cache-control"] == "no-store, max-age=0"
    assert 'property="og:title"' in response.text
    assert 'property="og:description"' in response.text
    assert 'property="og:image"' in response.text
    assert 'property="og:url" content="https://qa2.urtruck.kz/cargos/share-public-1"' in response.text
    assert "&lt;script&gt;alert(1)&lt;/script&gt;" in response.text
    assert "<script>alert(1)</script>" not in response.text
    assert "Private owner" not in response.text
    assert "+70000000000" not in response.text


def test_closed_technical_unknown_and_unapproved_host_fail_closed_without_existence_oracle():
    _seed("share-closed-1", status="taken")
    _seed("share-qa-1", description="QA2 PUSH E2E versionCode 211040091")

    for cargo_id, host in [
        ("share-closed-1", "qa2.urtruck.kz"),
        ("share-qa-1", "qa2.urtruck.kz"),
        ("missing-share", "qa2.urtruck.kz"),
        ("share-closed-1", "attacker.example"),
    ]:
        response = _get(cargo_id, host)
        assert response.status_code == 404
        assert response.json()["detail"] == "Not found"
