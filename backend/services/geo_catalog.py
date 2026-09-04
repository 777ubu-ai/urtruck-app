"""geo_catalog — backend-зеркало нормализованного справочника стран/локаций.

Читает ТОТ ЖЕ shared/geo-catalog.json, что и frontend
(src/utils/geoCatalogData.js генерируется из того же скрипта). Второго
справочника нет — §5 ТЗ Task 3.

Зачем на бэкенде:
  * §15 — фильтрация по маршруту должна выполняться в SQL, а не на телефоне;
  * §21 — сервер обязан отклонять сочетание «country = Germany, city = Almaty»,
    а не молча принимать его как валидное.
"""
from __future__ import annotations

import json
import os
from functools import lru_cache
from pathlib import Path
from typing import Optional

CITY = "CITY"
BORDER_CROSSING = "BORDER_CROSSING"
LOGISTICS_HUB = "LOGISTICS_HUB"
LOCATION_TYPES = (CITY, BORDER_CROSSING, LOGISTICS_HUB)

_BACKEND_DIR = Path(__file__).resolve().parent.parent


def _catalog_path() -> Path:
    """Путь к каталогу. В проде backend/ деплоится отдельно от репозитория,
    поэтому кроме репо-раскладки поддерживаем копию рядом с backend/data и
    явный override через env."""
    override = os.environ.get("GEO_CATALOG_PATH")
    candidates = [Path(override)] if override else []
    candidates += [
        _BACKEND_DIR.parent / "shared" / "geo-catalog.json",   # репозиторий
        _BACKEND_DIR / "data" / "geo-catalog.json",            # deploy-копия
    ]
    for p in candidates:
        if p.is_file():
            return p
    raise FileNotFoundError(
        "geo-catalog.json не найден. Ожидается shared/geo-catalog.json "
        "(репозиторий) или backend/data/geo-catalog.json (деплой), либо "
        "GEO_CATALOG_PATH. Сгенерировать: python3 scripts/generate_geo_catalog.py"
    )


@lru_cache(maxsize=1)
def _raw() -> dict:
    return json.loads(_catalog_path().read_text(encoding="utf-8"))


@lru_cache(maxsize=1)
def _countries() -> dict:
    return {c["id"]: c for c in _raw()["countries"]}


@lru_cache(maxsize=1)
def _locations() -> dict:
    return {l["id"]: l for l in _raw()["locations"]}


def countries() -> list[dict]:
    return list(_raw()["countries"])


def locations() -> list[dict]:
    return list(_raw()["locations"])


def get_country(country_id: Optional[str]) -> Optional[dict]:
    if not country_id:
        return None
    return _countries().get(str(country_id).strip().upper())


def get_location(location_id: Optional[str]) -> Optional[dict]:
    if not location_id:
        return None
    return _locations().get(str(location_id).strip())


def locations_for_country(country_id: str, location_type: Optional[str] = None) -> list[dict]:
    cid = str(country_id or "").strip().upper()
    out = [l for l in locations() if l["country_id"] == cid]
    if location_type:
        out = [l for l in out if l["type"] == location_type]
    return out


def localized_name(entity: Optional[dict], lang: str = "ru") -> str:
    """§8: один entity id → разные display names, языки не смешиваются."""
    if not entity:
        return ""
    names = entity.get("names") or {}
    key = str(lang or "ru").lower().replace("_", "-").split("-")[0]
    if key not in ("ru", "en", "zh", "kk"):
        key = "ru"
    return names.get(key) or names.get("ru") or names.get("en") or ""


class RouteScopeError(ValueError):
    """Невалидный маршрутный scope. Наверх отдаётся как HTTP 400."""


def validate_scope(country_id: Optional[str], location_id: Optional[str],
                   field: str = "origin") -> tuple[Optional[str], Optional[str]]:
    """§21: нормализовать и проверить пару country/location.

    Возвращает (country_id | None, location_id | None).
    location_id = None означает WHOLE COUNTRY scope (§4) — это валидно и НЕ
    является fake-city.

    Ошибки (RouteScopeError):
      * неизвестная страна;
      * неизвестная локация;
      * локация не принадлежит указанной стране («Germany + Almaty»);
      * локация без страны — scope неполный, молча трактовать нельзя.
    """
    cid = (str(country_id).strip().upper() or None) if country_id else None
    lid = (str(location_id).strip() or None) if location_id else None

    if cid and not get_country(cid):
        raise RouteScopeError(f"{field}_country_id: неизвестная страна {cid!r}")

    if lid:
        loc = get_location(lid)
        if not loc:
            raise RouteScopeError(f"{field}_location_id: неизвестная локация {lid!r}")
        if not cid:
            # Страну можно вывести из локации, но молчаливое достраивание
            # скрывало бы ошибку клиента — требуем явную пару.
            raise RouteScopeError(
                f"{field}_location_id указан без {field}_country_id"
            )
        if loc["country_id"] != cid:
            raise RouteScopeError(
                f"{field}: локация {lid!r} принадлежит стране "
                f"{loc['country_id']}, а не {cid}"
            )
    return cid, lid


def _fold(value: Optional[str]) -> str:
    return str(value or "").strip().lower().replace("ё", "е")


@lru_cache(maxsize=1)
def _alias_index() -> dict:
    """(country_id, folded_term) → location_id.

    Нужен для backfill: исторические объявления хранят маршрут свободным
    текстом (`from_city` = «Алматы, 🇰🇿», `from_point_name` = «Хоргос»).
    Индекс покрывает все локализованные названия и aliases.
    """
    idx: dict[tuple[str, str], str] = {}
    for loc in locations():
        terms = list((loc.get("names") or {}).values())
        terms += list(loc.get("aliases") or [])
        if loc.get("partner_name"):
            terms.append(loc["partner_name"])
        for term in terms:
            key = (loc["country_id"], _fold(term))
            # Первое вхождение выигрывает: города идут в каталоге раньше
            # хабов, поэтому «Роттердам» — город, а не «Порт Роттердам».
            idx.setdefault(key, loc["id"])
    return idx


def resolve_location_id(country_id: Optional[str], text: Optional[str]) -> Optional[str]:
    """Свободный текст → location_id внутри указанной страны, иначе None.

    Сознательно НЕ угадывает при пустой стране и не ищет по подстроке:
    ошибочный backfill хуже отсутствующего, потому что тихо меняет то, что
    пользователь увидит в фильтре.
    """
    if not country_id or not text:
        return None
    cid = str(country_id).strip().upper()
    raw = str(text)
    # Легаси-формат picker'а: "<name>, <flag>" — отрезаем хвост с флагом.
    head = raw.split(",")[0]
    for candidate in (raw, head):
        hit = _alias_index().get((cid, _fold(candidate)))
        if hit:
            return hit
    return None


@lru_cache(maxsize=1)
def _global_alias_index() -> dict:
    """folded_term → location_id, ТОЛЬКО для однозначных названий.

    Термины, встречающиеся более чем в одной локации, из индекса
    ИСКЛЮЧАЮТСЯ. Пример: «Хоргос» — это и город в Китае (cn-horgos), и город
    в Казахстане (kz-khorgos-kz); угадать сторону границы по одному слову
    нельзя, поэтому такой ввод остаётся неразрешённым, а не разрешается
    наугад в чужую страну.
    """
    counts: dict[str, set] = {}
    for loc in locations():
        terms = list((loc.get("names") or {}).values())
        terms += list(loc.get("aliases") or [])
        if loc.get("partner_name"):
            terms.append(loc["partner_name"])
        for term in terms:
            counts.setdefault(_fold(term), set()).add(loc["id"])
    return {term: next(iter(ids)) for term, ids in counts.items() if len(ids) == 1}


def resolve_location_global(text: Optional[str]) -> Optional[dict]:
    """Свободный текст → локация без указания страны, если название однозначно.

    Нужно потому, что формы создания груза/рейса допускают свободный ввод:
    когда пользователь не выбрал точку из реестра, клиент присылает
    from_country = null и только from_city. Без этого резолва такое
    объявление получало location_id = NULL и не попадало в маршрутный
    фильтр по конкретному городу.
    """
    if not text:
        return None
    raw = str(text)
    # Легаси-формат picker'а: "<name>, <flag>".
    for candidate in (raw, raw.split(",")[0]):
        hit = _global_alias_index().get(_fold(candidate))
        if hit:
            return get_location(hit)
    return None


def canonical_route_point(country: Optional[str], point_name: Optional[str],
                          city: Optional[str]) -> tuple[Optional[str], Optional[str], Optional[str]]:
    """Canonical-resolve маршрутной точки ПЕРЕД записью в БД.

    Возвращает (country_id, location_id, location_type).

    Порядок:
      1. страна пришла от клиента → ищем локацию внутри неё;
      2. страны нет → ищем по однозначному названию во всём каталоге и
         берём страну из найденной локации;
      3. не опознали → отдаём нормализованную страну (или None) и
         location_id = None. NULL здесь значит «локация неизвестна»:
         объявление остаётся видимым в scope «вся страна», но не всплывает
         в фильтре по конкретному городу.

    Чего эта функция НЕ делает: не переписывает страну, присланную клиентом.
    Если клиент указал DE, а текст однозначно указывает на KZ, страна
    остаётся DE, а локация — NULL. Молча перенести груз в другую страну
    хуже, чем оставить его без локации.
    """
    cid = (str(country).strip().upper() or None) if country else None
    if cid and not get_country(cid):
        cid = None

    if cid:
        lid = resolve_location_id(cid, point_name) or resolve_location_id(cid, city)
        if lid:
            loc = get_location(lid)
            return cid, lid, loc["type"]
        return cid, None, None

    loc = resolve_location_global(point_name) or resolve_location_global(city)
    if loc:
        return loc["country_id"], loc["id"], loc["type"]
    return None, None, None
