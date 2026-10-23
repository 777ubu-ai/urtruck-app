# PRE-FLIGHT: контакты перевозчиков в разделе машин

- Branch/base: feat/carrier-directory-20261023 / 6a38d00982d33740f68595e28d341c9022fba365.
- Known-good: QA2 a30dd65f, текущая лента проверялась отдельно. Исторические CI/native PASS не переносятся на новый каталог. Production SHA UNKNOWN.
- Задача владельца: показать подготовленные контакты в разделе машин, сохранить их постоянно. Разрешена передача имён, компаний, телефонов, email, городов и источников на 185.22.65.11. Публикация запрошена явно.
- Scope: новый services/carrier_directory.py и CLI импорта; GET external-freight/directory с существующими auth/feature gate; новый тип карточки в той же ленте машин, без отдельного раздела; адресные регрессии. Реальные контакты и приватные исходники не входят в Git.
- Protected: существующая таблица объявлений/TTL/очередь Telegram, авторизация, роли, чат, сделки, GPS, магазинные сборки другого исполнителя. Production runtime не менять вне штатного review/CI/deploy.
- Данные: 1808 записей уже в закрытой базе сервера; только 1297 подготовленных допускаются в каталог. В каталоге availability=unknown, общий счётчик карточек, нет фиктивных маршрутов/цен/свободных машин. ИИН, даты рождения, номера транспорта, локальные имена исходных файлов не выдаются клиенту.
- Checks: synthetic import/idempotency/hidden preservation/pagination/search injection/privacy/permissions; auth/role/feature route tests; frontend scope и поведение; lint/build/CI; независимый review; физическая приёмка нового бинарника отдельно.
- Rollback: адресный revert кода каталога/отключение включения контактов в запросах ленты. Отдельную БД контактов сохранить; старые снимки рабочих БД поверх текущих не восстанавливать.

Проверено локально в изолированном дереве: 56 backend tests PASS (включая существующие external freight contracts), 42 frontend tests PASS; lint 580 active JS PASS; web build PASS; git diff --check PASS. Проверки синтетические; реальные контакты в Git не попадали. Native/device QA и CI на точном commit ещё PENDING.

Статус: AWAITING_REVIEW_CI. До подтверждённого runtime/API/native результата не заявлять клиентскую публикацию завершённой.
