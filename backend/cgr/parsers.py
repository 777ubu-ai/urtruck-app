"""Парсеры ответов CGR.

⚠️ ВСЕ парсеры пока — заглушки с NotImplementedError. Реализация требует
завершения разведки cgr.qoldau.kz (см. docs/cgr/CGR_DISCOVERY.md).

После заполнения CGR_DISCOVERY.md:
  1. Положить реальные ответы CGR в backend/tests/cgr/fixtures/ (3-5 файлов)
  2. Заменить NotImplementedError на код в зависимости от формата (SSR/AJAX)
  3. Добавить unit-тесты в backend/tests/cgr/test_parsers.py

Для HTML парсинга — bs4 + lxml.
Для JSON — встроенный json.
"""
from typing import Iterable

from .exceptions import CGRParseError
from .schemas import BlocklistEntry, ScoreboardEntry


def parse_scoreboard(payload: str | dict) -> list[ScoreboardEntry]:
    """Парсит ответ /ru/registry/scoreboard.

    Args:
        payload: HTML-строка (SSR) или dict (если CGR отдаёт JSON).

    Returns:
        Список ScoreboardEntry — по 1-2 на каждый ПП (IN/OUT).

    Raises:
        CGRParseError: если формат не распознан.
    """
    raise NotImplementedError(
        "parse_scoreboard: требуется завершить разведку. "
        "См. docs/cgr/CGR_DISCOVERY.md этап 1.1."
    )


def parse_booking_lookup(payload: str | dict, booking_number: str) -> dict | None:
    """Ищет конкретную бронь по номеру в ответе /ru/registry/public-list.

    Returns:
        dict с полями {status, queue_position, scheduled_at, checkpoint_code}
        или None если бронь не найдена в реестре (вероятно фейк).
    """
    raise NotImplementedError(
        "parse_booking_lookup: требуется разведка 1.2 (формат брони и поиска)."
    )


def parse_blocklist_page(payload: str | dict, iin_salt: str) -> Iterable[BlocklistEntry]:
    """Парсит страницу /ru/information/blocked-users.

    ⚠️ Сразу хэширует ИИН с солью — открытый ИИН НИКОГДА не покидает эту функцию.

    Args:
        payload: HTML или JSON
        iin_salt: CGR_IIN_SALT из env (используется для SHA256)
    """
    raise NotImplementedError(
        "parse_blocklist_page: требуется разведка 1.4 (какие поля публикует CGR)."
    )
