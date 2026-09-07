"""UrTruck security primitives: log redaction и token revocation guard.

Слой создан при remediation утечки QA-токена (RC-20260907):
- log_redaction — централизованное вычищение секретов из логов/ошибок;
- token_guard — отзыв скомпрометированных токенов по fingerprint (SHA-256),
  без хранения и без публикации самих токенов.
"""
