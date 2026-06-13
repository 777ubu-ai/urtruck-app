"""Парсеры публичных реестров cgr.qoldau.kz.

Разведка выполнена 2026-06-13 — см. docs/cgr/CGR_DISCOVERY.md.
Источник: SSR HTML (bs4 + lxml). Фикстуры: backend/tests/cgr/fixtures/.

Поток А (публичные данные, без авторизации):
  - /ru/registry/checkpoint/list  → справочник погранпереходов
  - /ru/registry/public-list      → реестр очереди: Пункт · ГРНЗ · Дата · Статус
    (ИИН/ФИО НЕ публикуются — только госномер; privacy-safe)

ВАЖНО: в публичном реестре НЕТ «номера брони» — личный поиск водителя идёт
по ГРНЗ (госномеру ТС) через фильтр ?flTruckNumber=...

Блок-лист (/ru/information/blocked-users) — пока НЕ реализован (этап 1.4 PII).
Операторский API cgr-api.qoldau.kz (Checkpoint/WaitingArea) — не для агрегатора.
"""
import re
from typing import Iterable

from bs4 import BeautifulSoup

from .exceptions import CGRParseError
from .schemas import BlocklistEntry


# Маппинг человекочитаемых статусов CGR → наши коды.
# Значения flStatus: WaitingPayment, NotPaid, Validating, ReviewFailed,
# Pending (=В очереди), Cancelled (=Пропуск отозван) и др.
_STATUS_MAP = [
    ("в очереди", "in_queue"),
    ("пересёк", "crossed"),
    ("пересек", "crossed"),
    ("отозван", "revoked"),
    ("аннулирован", "revoked"),
    ("производится оплата", "payment"),
    ("оплата не произведена", "not_paid"),
    ("проверка провалена", "review_failed"),
    ("производится проверка", "validating"),
    ("вызван", "called"),
]


def normalize_status(raw: str) -> dict:
    """'В очереди Опаздывает' → {code:'in_queue', is_late:True, raw:'...'}."""
    low = (raw or "").lower()
    code = "unknown"
    for needle, c in _STATUS_MAP:
        if needle in low:
            code = c
            break
    return {"code": code, "is_late": "опазд" in low, "raw": (raw or "").strip()}


def _normalize_plate(plate: str) -> str:
    """ГРНЗ → верхний регистр без пробелов/дефисов для надёжного сравнения."""
    return re.sub(r"[\s\-]", "", (plate or "")).upper()


def parse_public_list(html: str) -> list[dict]:
    """Парсит одну страницу /ru/registry/public-list в список строк очереди.

    Returns:
        [{checkpoint, plate, queue_datetime, status: {code,is_late,raw}}]

    Raises:
        CGRParseError: если таблица не найдена / структура изменилась.
    """
    soup = BeautifulSoup(html or "", "lxml")
    table = soup.find("table")
    if table is None:
        raise CGRParseError("public-list: <table> не найдена (формат изменился?)")

    rows: list[dict] = []
    for tr in table.find_all("tr")[1:]:  # пропускаем заголовок
        tds = tr.find_all("td")
        if len(tds) < 4:
            continue
        checkpoint = tds[0].get_text(" ", strip=True)
        plate = tds[1].get_text(" ", strip=True)
        when = tds[2].get_text(" ", strip=True)
        status_raw = tds[3].get_text(" ", strip=True)
        if not checkpoint and not plate:
            continue
        rows.append({
            "checkpoint": checkpoint,
            "plate": _normalize_plate(plate),
            "queue_datetime": when,
            "status": normalize_status(status_raw),
        })
    return rows


def parse_booking_lookup(payload: str | dict, plate: str) -> dict | None:
    """Ищет статус машины по ГРНЗ в ответе /ru/registry/public-list?flTruckNumber=.

    `plate` — госномер ТС (в публичном реестре номера брони нет, ищем по ГРНЗ).

    Returns:
        {status, is_late, queue_datetime, checkpoint} для свежайшей записи,
        или None если машина в реестре не найдена.
    """
    if isinstance(payload, dict):
        # На случай если CGR когда-нибудь начнёт отдавать JSON.
        raise CGRParseError("public-list ожидался HTML, получен dict")
    target = _normalize_plate(plate)
    matches = [r for r in parse_public_list(payload) if r["plate"] == target]
    if not matches:
        return None
    top = matches[0]  # реестр отсортирован по свежести
    return {
        "status": top["status"]["code"],
        "is_late": top["status"]["is_late"],
        "status_raw": top["status"]["raw"],
        "queue_datetime": top["queue_datetime"],
        "checkpoint": top["checkpoint"],
    }


def count_queue_by_checkpoint(rows: Iterable[dict]) -> dict[str, int]:
    """Сводка длины очереди по пунктам: считаем статус in_queue.

    Используется scoreboard-сервисом поверх страниц ?flStatus=Pending.
    """
    counts: dict[str, int] = {}
    for r in rows:
        if r["status"]["code"] == "in_queue" and r["checkpoint"]:
            counts[r["checkpoint"]] = counts.get(r["checkpoint"], 0) + 1
    return counts


def parse_checkpoint_list(html: str) -> list[dict]:
    """Парсит /ru/registry/checkpoint/list — справочник переходов.

    Имена идут парами «KZ-сторона - Соседняя-сторона» (напр. «Достык - Алашанькоу»).

    Returns:
        [{name, side_kz, side_neighbor}] — то, что реально публикует CGR.
    """
    soup = BeautifulSoup(html or "", "lxml")
    seen: set[str] = set()
    out: list[dict] = []
    pat = re.compile(
        r"^[\w.\- ]*[А-Яа-яA-Za-z]{2,}[\w. ]*\s-\s[\w.\- ]*[А-Яа-яA-Za-z]{2,}[\w. ]*$"
    )
    for el in soup.find_all(string=lambda s: s and " - " in s):
        t = el.strip()
        if not (4 < len(t) < 60):
            continue
        if "пропуск" in t.lower() or "очеред" in t.lower():
            continue
        if not pat.match(t) or t in seen:
            continue
        seen.add(t)
        left, _, right = t.partition(" - ")
        out.append({"name": t, "side_kz": left.strip(), "side_neighbor": right.strip()})
    return out


# --- Блок-лист: НЕ реализован (этап 1.4, PII-критично) ---
def parse_blocklist_page(payload: str | dict, iin_salt: str) -> Iterable[BlocklistEntry]:
    raise NotImplementedError(
        "parse_blocklist_page: требуется разведка 1.4 (какие поля публикует CGR). "
        "См. docs/cgr/CGR_DISCOVERY.md."
    )


# Обратная совместимость: старый scoreboard_service импортирует parse_scoreboard.
# Реальное табло теперь собирается scoreboard-сервисом из public-list
# (агрегация in_queue по пунктам), поэтому здесь — тонкий адаптер: на вход
# страница public-list, на выход — счётчики по чекпоинтам.
def parse_scoreboard(payload: str | dict) -> dict[str, int]:
    if isinstance(payload, dict):
        raise CGRParseError("scoreboard ожидался HTML public-list, получен dict")
    return count_queue_by_checkpoint(parse_public_list(payload))
