# PRE-FLIGHT — кнопка и изоляция ленты

Branch: fix/external-feed-counter-20261021. Base: e9f12b0eb6aadf73ea09d313655f886b02143df5. Production SHA: UNKNOWN, не проверялся в этой работе.

Known-good: цена физически проверена на Xiaomi 214494467 / 05cabf85; новые изменения не наследуют этот PASS. Текущий e9f12b0e имеет кодовые проверки, физическая приёмка pending.

Scope: src/components/externalFreight/ExternalFreightEntry.js; src/utils/externalFreightFeed.js; backend/api/external_freight.py; backend/database/external_freight_dal.py; связанные тесты. Основные экраны, Auth, GPS, чат, сделки, общие header/picker и основная БД защищены. У владельца есть явное разрешение на изолированную ленту и счётчик. Риск: неверный вид счётчика при смене роли; обращение admin approve к основной БД. Анализ зависимостей: API -> external DAL -> external connection; UI -> external API + read-only AuthContext/theme/navigation.

Checks: regression approve, роли/TTL/count, защищённые SHA, frontend unit, lint, web build и браузерные сценарии. APK не собираем. QA2 deploy/магазины не выполняем.

Rollback: отдельный revert итогового коммита. Runtime/данные не меняются. Новый count — совместимое добавление, без миграции основной БД.

## Результат

CHANGED:
- Кнопка входа получила светлый фон, контур, иконку списка и отдельный счётчик без ведущих нулей и ограничения 10 000. Проверено отображение 100 001 на ширине 320 px для обеих ролей.
- GET /external-freight/count защищён обычной авторизацией и feature flag. Вид ленты определяется серверной ролью: driver -> cargo, client -> vehicle. Счётчик исключает review/hidden/closed/expired и active с истёкшим expires_at даже без cleanup. Изменения/повторы импорта не продлевают существующий TTL.
- Запрос счётчика выполняется при открытии/возвращении и раз в 60 секунд только на активной основной странице. Отмена при уходе/сворачивании, timeout 8 секунд, защита смены пользователя/роли. Ошибка API скрывает число; успешный ноль отображается как 0.
- Подтверждённый дефект: два импорта get_conn в approve использовали основную database.db, несмотря на внешнюю БД DAL. Теперь используется external_freight_connection; regression запрещает любое обращение к main get_conn и проверяет однократный аудит одобрения.

TESTS на итоговом коде:
- backend внешней ленты/parser/queue: 58 passed (в том числе реальная изолированная SQLite с 100 001 активной записью).
- frontend unit/contracts: 48 passed, включая 29 guards сохранности согласованной основной реализации.
- lint: 568 active JS parsed, PASS.
- web build: PASS, QA2 flavor + external flag.
- Playwright: 15 passed; все пять фильтров apply/cancel/reopen, дата, дробная цена, прямой ввод China/Бахты/Ташкент, сохранённые, изоляция основных фильтров, две роли, 320 px, 100 001, ноль и ошибка count.
- git diff --check: PASS.
- AST Graphify выполнен до правок; анализ подтверждает отдельный external DAL/connection. Есть предупреждения экстрактора SQL/Gradle; они не считаются runtime-проверкой.

Визуальная проверка browser screenshot: test-results/external-entry-driver-320.png и external-entry-client-320.png. Это синтетические браузерные данные, не реальная QA2 лента и не телефон. На driver виден существующий web push notice; он не менялся в этом патче.

PHYSICAL DEVICES: новый код не установлен, APK не собирался.
QA2: свежая read-only проверка OpenAPI показывает 0 external-freight маршрутов.
PR568: OPEN, head при сверке e9f12b0e, reviews пустой. Обязательное независимое review по §6 ENGINEERING_CONSTITUTION не пройдено.
PRODUCTION/магазины/агент: не менялись.
Причина отказа на старом APK 214494466 остаётся недоказанной; исправленный stale XML скрипта не является доказательством native root cause.

Следующий этап: review итогового PR568 -> штатный QA2 deploy -> безопасное подключение адаптера и реальный импорт обеих категорий -> web/API приёмка единого SHA -> один APK для Xiaomi, затем отдельный iPhone. Приёмка текущего кода на устройствах не заявляется.
FINAL STATUS: PASS для перечисленных локальных проверок; PARTIAL для функции в целом.
