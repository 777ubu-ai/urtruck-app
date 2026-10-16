# PR551 audit checkpoint — 2026-10-16

Обновлено: 2026-10-16 16:05 Asia/Almaty. Этот файл заменяет прежний checkpoint с устаревшими SHA и числом тестов.

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
