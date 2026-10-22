# QA2 published queue bridge — preflight

Base: 41c01c848a6e908b9567cf60da78b934074ee355.
Scope: separate read-only published-agent-queue bridge, focused tests and disabled service templates. No Telegram publisher changes, production changes, mobile changes or new dependencies.
Authorization: owner's request to mirror selected Telegram posts into QA2 and test. Activation remains behind independent API/database review of PR568 and штатный QA2 deploy.
Checks: published-only selection, late reconciliation, replay, durable network retry, unchanged source DB, TTL, malformed records, disabled gate and QA2-only destination.
Rollback: stop/disable the separate timer; existing Telegram publisher remains running. Keep outbox for retry; do not delete source or user data.
