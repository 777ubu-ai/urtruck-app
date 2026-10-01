"""Server-rendered, privacy-minimal public cargo previews for social crawlers."""
import re
from html import escape
from urllib.parse import quote

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import HTMLResponse

from database.db import get_conn
from api.marketplace import _public_cargo_ok


share_router = APIRouter()

_PUBLIC_HOSTS = frozenset({"urtruck.kz", "qa2.urtruck.kz"})
_TECHNICAL_SHARE_TEXT = re.compile(r"\b(?:qa\d*|push\s*e2e|versioncode|reboot-push)\b", re.IGNORECASE)


def _text(value) -> str:
    """Keep untrusted database text harmless in HTML and compact in OG tags."""
    return " ".join(str(value or "").replace("\x00", " ").split()).strip()


def _origin(request: Request) -> str:
    # Do not reflect an arbitrary Host/X-Forwarded-Host into og:url.  nginx is
    # the TLS boundary; these two names are the only approved public origins.
    host = request.headers.get("host", "").split(":", 1)[0].lower()
    if host not in _PUBLIC_HOSTS:
        raise HTTPException(status_code=404, detail="Not found")
    return f"https://{host}"


def _cargo_row(cargo_id: str):
    with get_conn() as conn:
        row = conn.execute(
            """SELECT id, from_city, to_city, cargo_desc, cargo_type,
                      weight_tons, volume_m3, price, currency, pickup_date,
                      status, updated_at, published_at, created_at
                 FROM cargos WHERE id = ?""",
            (cargo_id,),
        ).fetchone()
    if not row:
        return None
    listing = dict(row)
    visible_text = " ".join(_text(listing.get(key)) for key in ("from_city", "to_city", "cargo_desc"))
    if (listing.get("status") != "active" or not _public_cargo_ok(listing)
            or _TECHNICAL_SHARE_TEXT.search(visible_text)):
        return None
    return listing


@share_router.get("/cargos/{cargo_id}", response_class=HTMLResponse, include_in_schema=False)
def public_cargo_preview(cargo_id: str, request: Request):
    """Return a crawler-readable page only for an active public cargo.

    This intentionally does not reuse the authenticated detail endpoint: it
    selects a small allow-list of fields and never emits owner, bid, photo or
    document information.  Closed/deleted/private IDs all produce the same
    404 so the route cannot be used as an existence oracle.
    """
    origin = _origin(request)
    cargo = _cargo_row(cargo_id)
    if not cargo:
        raise HTTPException(status_code=404, detail="Not found")

    route = f"{_text(cargo['from_city'])} → {_text(cargo['to_city'])}"
    title = f"UrTruck — {route}"
    parts = [_text(cargo["cargo_desc"])]
    if cargo.get("pickup_date"):
        parts.append(f"Погрузка: {_text(cargo['pickup_date'])}")
    if cargo.get("price"):
        parts.append(f"Цена: {_text(cargo['price'])} {_text(cargo['currency']) or 'USD'}")
    description = " · ".join(part for part in parts if part)
    canonical = f"{origin}/cargos/{quote(str(cargo['id']), safe='')}"
    revision = quote(_text(cargo.get("updated_at") or cargo.get("published_at") or cargo.get("created_at")), safe="")
    image = f"{origin}/share/urtruck-market-v2.png?v={revision}"

    meta = {
        "title": escape(title, quote=True),
        "description": escape(description, quote=True),
        "canonical": escape(canonical, quote=True),
        "image": escape(image, quote=True),
        "route": escape(route),
    }
    body = f"""<!doctype html>
<html lang="ru"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{meta['title']}</title>
<link rel="canonical" href="{meta['canonical']}">
<meta name="description" content="{meta['description']}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="UrTruck">
<meta property="og:title" content="{meta['title']}">
<meta property="og:description" content="{meta['description']}">
<meta property="og:image" content="{meta['image']}">
<meta property="og:url" content="{meta['canonical']}">
<meta name="twitter:card" content="summary_large_image"></head>
<body><main><h1>{meta['route']}</h1><p>{meta['description']}</p></main></body></html>"""
    # A closed listing must disappear quickly.  Social platforms may still
    # retain their own preview cache; the versioned image avoids reusing an
    # old image after a permitted listing update.
    return HTMLResponse(body, headers={"Cache-Control": "no-store, max-age=0", "Pragma": "no-cache"})
