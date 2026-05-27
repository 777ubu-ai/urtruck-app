"""Тесты парсеров CGR.

⚠️ Сейчас все парсеры — NotImplementedError. После заполнения
docs/cgr/CGR_DISCOVERY.md этого файла:
  1. Положить реальные ответы CGR в backend/tests/cgr/fixtures/
  2. Заменить эти тесты на тесты с фикстурами
  3. Удалить помеченные xfail-тесты
"""
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))


@pytest.mark.xfail(reason="Pending CGR_DISCOVERY.md 1.1", strict=True)
def test_parse_scoreboard_stub():
    from cgr.parsers import parse_scoreboard
    parse_scoreboard("<html><body><table></table></body></html>")


@pytest.mark.xfail(reason="Pending CGR_DISCOVERY.md 1.2", strict=True)
def test_parse_booking_lookup_stub():
    from cgr.parsers import parse_booking_lookup
    parse_booking_lookup("<html></html>", "TEST-123")


@pytest.mark.xfail(reason="Pending CGR_DISCOVERY.md 1.4", strict=True)
def test_parse_blocklist_page_stub():
    from cgr.parsers import parse_blocklist_page
    list(parse_blocklist_page("<html></html>", iin_salt="x" * 32))


# Что НЕ страдает от отсутствия разведки — exceptions module
def test_exceptions_hierarchy():
    from cgr.exceptions import (
        CGRException,
        CGRForbiddenError,
        CGRNotAvailableError,
        CGRParseError,
        CGRRateLimitError,
    )
    assert issubclass(CGRRateLimitError, CGRException)
    assert issubclass(CGRForbiddenError, CGRException)
    assert issubclass(CGRNotAvailableError, CGRException)
    assert issubclass(CGRParseError, CGRException)

    err = CGRRateLimitError(retry_after_sec=120)
    assert err.retry_after_sec == 120
