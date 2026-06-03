"""CGR-исключения. Ловятся scheduler/services и логируются в Sentry."""


class CGRException(Exception):
    """База для всех CGR-ошибок."""


class CGRRateLimitError(CGRException):
    """CGR вернул 429 Too Many Requests. Worker должен sleep `retry_after`."""

    def __init__(self, retry_after_sec: int = 60):
        super().__init__(f"CGR rate limit hit, retry after {retry_after_sec}s")
        self.retry_after_sec = retry_after_sec


class CGRForbiddenError(CGRException):
    """CGR вернул 403 — IP заблокирован или anti-bot защита.
    Признак что разведку нужно проводить с другого IP."""


class CGRNotAvailableError(CGRException):
    """CGR недоступен 5+ раз подряд. Эндпоинт scoreboard переходит в stale-режим."""


class CGRParseError(CGRException):
    """Парсер не смог распарсить ответ CGR — вероятно, формат изменился.
    Trigger для пересмотра parsers.py + fixtures."""
