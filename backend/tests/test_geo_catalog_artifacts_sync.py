# -*- coding: utf-8 -*-
"""Синхронность трёх артефактов geo-каталога (P0-A, аудит 2026-09-05).

Генератор scripts/generate_geo_catalog.py пишет ТРИ артефакта из одного
источника:
  1. shared/geo-catalog.json           — репо-раскладка (dev, тесты);
  2. backend/data/geo-catalog.json     — deploy-копия: прод копирует только
                                         backend/*, shared/ на сервере нет;
  3. src/utils/geoCatalogData.js       — frontend-модуль с тем же payload.

Разъехавшиеся копии — это тихий split-brain: фильтр на сервере и пикер на
телефоне видят разные каталоги. Поэтому здесь строгое хэш-сравнение, а не
«файл существует».
"""
import hashlib
import json
import re
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent.parent
SHARED = REPO / "shared" / "geo-catalog.json"
BACKEND_COPY = REPO / "backend" / "data" / "geo-catalog.json"
FRONTEND_JS = REPO / "src" / "utils" / "geoCatalogData.js"


def _sha256(p: Path) -> str:
    return hashlib.sha256(p.read_bytes()).hexdigest()


def test_backend_deploy_copy_exists():
    # Именно этот файл доставляет каталог в прод (`scp backend/*`).
    assert BACKEND_COPY.is_file(), (
        "backend/data/geo-catalog.json отсутствует — прод-деплой уедет без "
        "каталога. Сгенерировать: python3 scripts/generate_geo_catalog.py"
    )


def test_shared_and_backend_copy_are_byte_identical():
    assert _sha256(SHARED) == _sha256(BACKEND_COPY), (
        "shared/geo-catalog.json и backend/data/geo-catalog.json разошлись. "
        "Перегенерировать оба: python3 scripts/generate_geo_catalog.py"
    )


def test_frontend_module_embeds_same_payload():
    js = FRONTEND_JS.read_text(encoding="utf-8")
    m = re.search(r"export default (\{.*\});\s*$", js, re.S)
    assert m, "src/utils/geoCatalogData.js: не найден export default {...}"
    js_payload = json.loads(m.group(1))
    shared_payload = json.loads(SHARED.read_text(encoding="utf-8"))
    assert js_payload == shared_payload, (
        "Payload src/utils/geoCatalogData.js != shared/geo-catalog.json. "
        "Перегенерировать: python3 scripts/generate_geo_catalog.py"
    )


def test_backend_copy_is_a_valid_catalog():
    data = json.loads(BACKEND_COPY.read_text(encoding="utf-8"))
    assert data.get("countries") and data.get("locations"), (
        "backend/data/geo-catalog.json пустой или битый"
    )
