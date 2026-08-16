import os
import sys
from pathlib import Path

os.environ.setdefault("DB_PATH", "/tmp/urtruck_test_cgr_full_catalog.db")
os.environ.setdefault("CGR_FEATURE_ENABLED", "true")
os.environ.setdefault("CGR_IIN_SALT", "test-full-catalog-salt")
Path(os.environ["DB_PATH"]).unlink(missing_ok=True)
ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from database import db as ddb
from database import cgr_dal

ddb.init_db()
cgr_dal.init_cgr_schema()

from cgr import checkpoint_catalog_service as service


def _card(name: str, external_id: str, country: str) -> str:
    return f"""
    <div class='col-sm-8'>
      <div class='row row h-100'>
        <div class='col-md-8'><div><a href='/ru/registry/checkpoint/list/{external_id}/view'>{name}</a></div></div>
        <div class='col-md-4'>{country}</div>
      </div>
    </div>
    """


def test_parser_keeps_country_and_single_name_checkpoint():
    html = (
        _card("Кайрак - Бугристое", "111", "Россия")
        + _card("Тажен - Каракалпакстан", "222", "Узбекистан")
        + _card("Порт Курык", "333", "Страны Каспийского моря")
    )
    rows = service.parse_directory_page(html)
    by_name = {row.name: row for row in rows}
    assert by_name["Кайрак - Бугристое"].country == "RU"
    assert by_name["Тажен - Каракалпакстан"].country == "UZ"
    assert by_name["Порт Курык"].country == "CASPIAN"
    assert by_name["Порт Курык"].external_id == "333"


def test_full_seed_walks_pages_until_no_new_rows(monkeypatch):
    pages = {
        1: _card("Аксай - Илек", "101", "Россия") + _card("Кордай - Ак-Жол", "102", "Кыргызстан"),
        2: _card("Калжат - Дулаты", "103", "Китай") + _card("Капланбек - Навои", "104", "Узбекистан"),
        3: _card("Порт Курык", "105", "Страны Каспийского моря"),
        4: "<html><body>no rows</body></html>",
    }
    calls = []

    async def fake_fetch_checkpoint_list(country_code=None, page=1):
        calls.append((country_code, page))
        return pages[page]

    monkeypatch.setattr(service.cgr_client, "fetch_checkpoint_list", fake_fetch_checkpoint_list)
    service.clear_external_id_cache()

    import asyncio
    result = asyncio.run(service.seed_full_catalog(max_pages=10))

    assert result["records"] == 5
    assert result["pages"] == 3
    assert result["countries"] == {"RU": 1, "KG": 1, "CN": 1, "UZ": 1, "CASPIAN": 1}
    assert calls == [(None, 1), (None, 2), (None, 3), (None, 4)]

    cps = {cp["name_ru"]: cp for cp in cgr_dal.get_all_checkpoints(active_only=True)}
    assert cps["Аксай - Илек"]["country_to"] == "RU"
    assert cps["Калжат - Дулаты"]["country_to"] == "CN"
    assert cps["Порт Курык"]["country_to"] == "CASPIAN"
