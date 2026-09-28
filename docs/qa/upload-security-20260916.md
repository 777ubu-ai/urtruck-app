# Безопасность загрузок — 2026-09-16

База: ba2835d682a079e676f07cc588ddd9c6cbe65942, qa/master-hard-qa-20260916.

## Исправления
- Вложение сделки читается максимум до лимита 12 МиБ + 1 байт.
- Формы ограничены до 16 МиБ на весь запрос, включая chunked/ложный Content-Length. При превышении 413; время приёма 120 секунд (408); одновременно 8 форм на ASGI worker (503 + Retry-After).
- При ошибке парсера временные файлы закрываются; действующие проверки участника, MIME/magic и идемпотентности сохранены.
- Обновлены FastAPI, Starlette, python-multipart, Pillow, h2, PyJWT, cryptography, lxml; pytest отдельно как test dependency.
- Выбран FastAPI 0.136.0: 0.137+ изменяет маршруты на lazy included routers и несовместим с текущим auth harness. Auth не ослаблялся.

## Проверка
Python 3.12, чистый venv, pip check PASS. Полный установленный граф (включая тестовые зависимости): pip-audit 2.10.1, 0 известных уязвимостей, без ignore. В проверочном venv pip 26.2.
Полный backend: **828 passed**, 268 предупреждений deprecation. 6 новых тестов ASGI включают chunked, ложный размер, закрытие файлов, timeout, конкурентный лимит, обычный файл и неизменность JSON.

Изолированный снимок исходников и новая SQLite-база: /private/tmp/urtruck-security-20260916-i3Bkql. В копии только hardcoded test_deal_attachment_upload DB_PATH заменён на уникальный DB_PATH окружения; assertions не изменялись. Копия инициализирована как Git-репозиторий для workflow-тестов. STORAGE_LOCAL_ROOT изолирован. Production не развёртывался.
Доказательства: pytest-v3.json, pytest-v3.log, candidate-audit-v2.json, candidate-audit-v2.log.

## Границы
Нулевая выдача SCA означает отсутствие известных advisory на момент скана, не полную гарантию безопасности. Нативные Android/iOS сборки и production rollout сюда не входят. Общий release verdict остаётся BLOCKED до остальных пакетов.

Источники advisory: https://github.com/advisories/GHSA-82w8-qh3p-5jfq ; https://github.com/advisories/GHSA-pp6c-gr5w-3c5g ; https://github.com/advisories/GHSA-mj87-hwqh-73pj .
