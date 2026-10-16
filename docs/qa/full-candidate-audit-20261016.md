# PR551 audit checkpoint — 2026-10-16

Обновлено: 2026-10-16 16:25 Asia/Almaty. Дополнение ниже заменяет устаревшие статусы проверки сохранности и двухстороннего сценария.

## Идентичность

- Исходный кандидат PR550: `integration/qa-unified-20261016`, SHA `fb23ebd0572c34a889eddc9eea7bdc048db2eef7`, tree `5eb9fe1e568935c057bb9a51dd6c55cfe8f30b94`.
- Ветка аудита: `fix/full-candidate-audit-20261016`.
- Текущий source head: `6c667c36df230e5aca6469389b73e8a9161c8b97`, tree `700a695039c3996b78ec57401c16d64dec6bd68a`; base точный SHA исходного кандидата PR550.
- PR551: https://github.com/777ubu-ai/urtruck-app/pull/551 — OPEN, DRAFT; не объединять.
- Проверка кода на source head `6c667c36...`: run `38890514004`, SUCCESS, все 3 job (backend, mandatory web E2E, frontend/lint/build). PR head `e157b093...`, отличавшийся только этим checkpoint, также прошёл все 3 job в run `38891284275`. Предыдущий run `38890137677` относился к head `c4773420...` и был отменён после новой правки.
- Изменения только в `src/utils/push.js`, `tests/frontend/test_native_push_token_registration.mjs` и этом checkpoint. Backend, схема/миграции, production, магазинные артефакты, реальные аккаунты и данные не менялись.
- Последняя правка кода — commit `6c667c36`; API/backend source на финальном кандидате совпадает с кодом, проверенным в изолированном upgrade rehearsal на `2095819deaf42f29ec825821b045e3c95e9551f3`.

## Дефект push и исправление

Security Review точного diff PR551 `fb23ebd...` → `2095819...` выявил, что новый вход мог потерять попытку регистрации, если старый provider-token lookup продолжался после logout cleanup. Первая правка зафиксировала запрос после завершения старого lookup.

Повторный Security Review `fb23ebd...` → `c4773420...` нашёл две гонки в задержанном logout cleanup: регистрация нового аккаунта могла прийти до завершения cleanup, а асинхронное чтение сессии могло завершиться уже после него. На текущем head учтены обе последовательности: запрос ожидает завершения деактивации, сравнение идентичности сессии использует fingerprint (сырой bearer не сохраняется), а поздний результат чтения повторяет регистрацию только при совпадении поколения cleanup и отличающейся сессии. Native transport, ownership, cooldown/ограниченные retries, logout и смена аккаунта сохранены.

Behavioral regression в `tests/frontend/test_native_push_token_registration.mjs`:
- новый вход во время приостановки при задержанном cleanup — ровно одна регистрация с новым bearer;
- cleanup завершается до чтения токена — позднее чтение запускает ровно одну регистрацию с новым bearer;
- старый аккаунт не регистрируется повторно при cleanup;
- уже покрыты активный запрос, незавершённый OS token lookup, отмена retry, ротация токена, 404 без цикла и смена сессии.

Targeted test последней версии: 21/21 PASS. Полный `npm run test:unit`: 1252/1252 PASS. `npm run lint`: 508 активных JS-файлов PASS. `git diff --check`: PASS. До последних двух добавленных race-тестов предыдущий candidate head `2095819...` также прошёл полный CI run `38889304627` (все 3 job: frontend/lint/build, mandatory web E2E, backend). Требуется актуальный CI `38890514004`.

## Матрица API/кода

В затронутой области push проверены unit/behavioral тестами и CI: token registration, session change, logout cleanup, token rotation, retry/error throttling; backend push/bell critical subset в CI run `38889304627` PASS. Текущая правка не меняет backend API.

Остальные API и клиентские контракты остаются проверенными только имеющимся CI PR550/PR551 и доступными целевыми наборами; это не полный пользовательский путь:

| Область | Доказательство / статус |
|---|---|
| Auth, регистрация/вход, session и роли | CI social-auth, retry/idempotency и frontend tests; реальная OTP/email доставка и физическое восстановление сессии — `PENDING`. |
| Грузы/рейсы, поиск, фильтры, автоподгрузка, избранное | Существующий PR550 CI/targeted API suites, включая pagination/favorites/capacity; 1000+1000 API-проверку не повторяли, входные данные и backend-код для них не менялись. Полный UI-прогон — `PENDING`. |
| Сделки и разрешённые статусы | Backend FSM/deal suites в canonical CI; полный путь обеих ролей и физические действия — `PENDING`. |
| Чат, вложения и ownership | CI/API suites покрывают chat/deal attachment/document ownership contracts; реальные открытия файлов и внешние Storage ссылки на устройствах — `PENDING`. |
| Unread/счётчики и выход | Backend unread/push suites и новые logout/native-registration regressions; реальное системное уведомление, badge и доставка — `PENDING`. |
| Карта, timeout и загрузка | Существующие map/routing unit и API regressions в PR550 CI; фактическая отзывчивость native UI и GPS — `PENDING`. |
| Переводы/voice | Translation/STT boundary CI PASS; реальный платный/external provider и качество на устройстве — `PENDING`. |

Результаты test-merge PR550 не объявляются физической приёмкой. Текущий head не изменяет эти модули.

## Сохранность при обновлении backend

Использована отдельная SQLite-копия старой QA-схемы из snapshot `lab-before-vehicles-schema-20261015T190010.sqlite`, SHA-256 `7fd2d4d2ff7a910ffe7e0f35f24e69cd5391cebab19441b3b2762f67575227ab`, 688128 байт, 36 таблиц. Запуск `main:app` TestClient выполнялся дважды, с тестовым storage и без production credentials; integrity `ok` до/после. После schema init стало 51 таблица. 200 грузов, 15 избранных, 10 регистрационных сессий сохранили точные rowset hashes; 5 исходных строк профиля водителя сохранились, приложение добавило ожидаемую поддержку-учётку. Доказательства: `qa-evidence/.../full-audit-20261016T1520/old-qa-upgrade-preservation.json`.

Ограничение: старая QA-схема не содержит существующих сделок/сообщений/вложений, а в ней отсутствуют таблицы `attachments`/`message_attachments`; соответствующие каталоги файлов и содержимое не представлены. Trips/deals/chat rooms/messages в этом snapshot пустые. Поэтому сохранность этих данных при backend-upgrade не доказана, и rehearsal не заменяет проверку актуальной production-схемы. Ничего в production не изменялось.

## Dependency finding

`npm audit` на pinned lockfile показывает пять HIGH записей по одной цепочке `expo@57.0.24 → @expo/cli@57.0.26 → @expo/code-signing-certificates@0.0.6 → node-forge@1.4.0`. Advisory GHSA-86w9-cpqp-85rv затрагивает `<=1.4.0`, опубликованной patched версии в момент проверки нет. `node-forge`/code-signing пакет не импортируется приложением; Android Metro source map не содержит их модулей или source content. Это ограничивает применимость к runtime binary, но tooling риск остаётся. Сохранён узкий проверяемый upstream patch компенсации с SHA/expiry в существующем `scripts/security-node-forge-audit-gate.mjs`; audit gate PASS. Не запускался `npm audit fix --force`, Expo/RN не понижались, lockfile не менялся. Исключение нужно пересмотреть при upstream исправлении и не позже заданного expiry `2026-12-31`.

## PR542–545 и остатки

PR542–545 не входят в PR551 ancestry/diff и не проверялись как интегрированная композиция: PR542 — лимиты вложений; PR543 — подготовка JPEG/проверка размера; PR544 — private VPS attachment storage; PR545 — локализация отказа роли на ZH. Их нельзя считать включёнными или принятыми.

Физические Android/iOS проверки, email/push внешняя доставка, полный двухсторонний бизнес-путь, реальная совместимость обновления со старыми непустыми сделками/файлами и production acceptance — `PENDING`. APK/IPA не создавались. Production, магазины и Apple submission не затрагивались.

## Следующий шаг

CI `38890514004` на source head `6c667c36...` и CI `38891284275` на PR head `e157b093...` завершены успешно. Независимый Security Review точного PR diff `fb23ebd...` → `e157b093...` завершён без findings; прикладной diff совпадает с проверенным `6c667c36...`. PR551 оставить неслитым по прямому указанию владельца.

## Дополнение 2026-10-16 16:25 Asia/Almaty — продолжение проверки

### Идентичность текущего продолжения

- PR551 base остаётся `fb23ebd0572c34a889eddc9eea7bdc048db2eef7`.
- Прикладной runtime diff PR551 остаётся `6c667c36df230e5aca6469389b73e8a9161c8b97`; в этом дополнении runtime-код не менялся.
- Добавлен только тестовый commit `5df1d7755d0dea6b8dd4461360f909bebfd44616` (tree `fa5d9adf8e297a0a0f8b540baf3cb3c79f22a4ca`): `backend/tests/test_two_role_acceptance_journey.py`.
- На момент записи PR551 remote tip ещё не прочитан после push; CI/review для нового test commit — `PENDING`. Предыдущий CI `38891284275` не включает этот тестовый commit. PR551 остаётся неслитым.

### Двухрольный API-путь

Новый интеграционный тест прошёл в локальной изолированной test DB на Python 3.12, закреплённом `backend/requirements-test.txt`; целевая команда запустила 65/65: новый путь плюс существующие lifecycle, attachment, three-account IDOR и deal FSM наборы.

Сценарий выполняет через HTTP handlers реальную регистрацию трёх аккаунтов, выдачу и проверку bearer-сессий, выбор канонических ролей, публикацию груза, ставку и принятие. Далее проверяются сообщение, повтор сообщения с тем же idempotency key, загрузка PDF, повтор загрузки без второго файла, доступ контрагента и запрет постороннему, роли/переходы `accepted → in_progress → at_border → delivered → received`, повторное чтение сессий, сделки, истории чата и вложения после повторной инициализации схем и создания нового router graph. Проверяется ровно одна сделка, одно сообщение и одна attachment row; файл и содержимое проверены во временном каталоге.

Внешняя доставка email OTP не проверялась: код и доставка заменены явным deterministic test adapter. Push provider также заменён заглушкой; уведомления на устройства не отправлялись. Storage provider заменён изолированным temp-file adapter; production/Supabase storage не проверялся. Повторное открытие API после startup-equivalent schema init проверено в том же Python process — это не тест аварийного перезапуска отдельного backend-процесса или ОС и не физическая проверка. Внешняя доставка и физическое поведение — `PENDING`.

Локальная установка test dependencies из `requirements-test.txt` под системным Python 3.14 не удалась из-за закреплённого `pydantic-core==2.23.4`/PyO3 (максимум Python 3.13); использован установленный Python 3.12 и внешний `/tmp` venv, зависимости репозитория не менялись.

### Проверка старых QA-копий и граница доказательства

Повторный read-only обзор 699 `.db/.sqlite/.sqlite3` файлов в `qa-evidence` не нашёл ни одной базы с непустой таблицей вложений; названные storage/uploads-каталоги не содержали файлов.

- Снимок старой QA-схемы `lab-before-vehicles-schema-20261015T190010.sqlite`, SHA-256 `7fd2d4d2ff7a910ffe7e0f35f24e69cd5391cebab19441b3b2762f67575227ab`: `cargos=200`, `trips=0`, `deals=0`, `chat_rooms=0`, `chat_messages=0`; таблицы participants/attachments отсутствуют.
- Найденный `night-audit-20261009/e2e.db`, SHA-256 `aca5dd5a66b74dc26f2901edc6a97ed1579c7fee4bc1d9cd4c4f4f08075db770`: `cargos=2`, `deals=2`, `chat_rooms=2`, `chat_messages=4`, но `conversation_participants=0`, `message_attachments=0`; соответствующих файлов нет. Это E2E fixture, не репрезентативная старая QA-база с файлами.
- Итого: подходящей копии с непустыми сделками, участниками, сообщениями, attachment rows и соответствующими файлами нет. Сохранность такой старой пользовательской QA-цепочки при upgrade не подтверждена; synthetic интеграционный тест этот пробел не закрывает. Требуется отдельная обезличенная QA-копия со связанными записями и фактическими файлами, без production credentials.

### Dependency exception

Повторный `node scripts/security-node-forge-audit-gate.mjs` на 16.10.2026 PASS для `node-forge@1.4.0`, advisory `GHSA-86w9-cpqp-85rv`, range `<=1.4.0`, применённого patch SHA-256 `f3e83351dc92090ce21f339420699316bebc4d128ad3e5ff19d1f55988653c47`, expiry `2026-12-31T00:00:00.000Z`. npm audit по-прежнему показывает 5 HIGH записей по связанным Expo/code-signing nodes; рекомендованный npm fix предлагает major downgrade Expo до `44.0.6` и не применялся. Gate проверяет узкую локальную upstream-компенсацию и срок; advisory остаётся открытым до исправления зависимости. Это не означает, что upstream-уязвимость устранена, и не даёт нулевой audit risk.

### Следующие шаги

1. Обновить описание PR551 с новым test commit и прежними точными base/app-source SHA; дождаться required CI для нового PR tip.
2. Проверить независимое review нового base→head diff; предыдущее review подтверждает runtime patch, но не добавленный сценарный тест.
3. Повторить upgrade-preservation только при появлении подходящей обезличенной QA-копии с непустыми attachments и файлами. До этого сохранность таких файлов — `PENDING`.
4. PR542–545 остаются отдельно; production, магазины и реальные пользовательские данные не менялись.

## Итоговое дополнение 2026-10-16 — CI и состояние PR551

- Required PR CI `38893764718` завершился `SUCCESS` на точном PR head `5b6ea23e0a653935e9fa7730b1717b95526582cf`, checkout/tree `dfd32df936a2662cd73e9b302e9a54e274262260`; backend, mandatory web E2E и frontend/lint/build — 3/3 jobs.
- Новый двухрольный сценарий и целевые существующие backend регрессии локально прошли 65/65 на отдельной test DB. В CI прошли также canonical backend suite, P0/P1 security subset, Push/Bell subset, Translation/STT boundary, mandatory web E2E, dependency audit, lint и web build.
- Это завершает пункты CI, записанные выше как ожидающие. Нового независимого Security Review добавленного тестового diff не проводилось; прежний review относится к runtime diff `fb23ebd...` → `6c667c36...`.
- Текущая PR композиция: base `fb23ebd0572c34a889eddc9eea7bdc048db2eef7`; runtime source `6c667c36df230e5aca6469389b73e8a9161c8b97`; двухрольный тест `5df1d7755d0dea6b8dd4461360f909bebfd44616`; checkpoint commit/head `5b6ea23e0a653935e9fa7730b1717b95526582cf`. PR551 остаётся OPEN/DRAFT и не объединён.
- Сохранность связанной старой QA-цепочки с непустыми сделками, участниками, сообщениями, attachment rows и соответствующими файлами остаётся `PENDING`: подходящая обезличенная копия не найдена. Synthetic двухрольный тест это ограничение не закрывает.
- Node-forge audit gate прошёл, но `GHSA-86w9-cpqp-85rv` остаётся применимым к установленной `1.4.0` (диапазон `<=1.4.0`); локальная компенсация действует до пересмотра не позднее `2026-12-31T00:00:00.000Z` и не является upstream-исправлением.
