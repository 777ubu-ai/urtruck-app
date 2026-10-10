# UrTruck — продолжение checkpoint 10.10.2026

## PRE-FLIGHT
- Branch: fix/document-message-ownership-20261010.
- Исходный HEAD: e4f596030234680b33be2e2560436c8d0e54041c; код ownership: 2093f103c2ff23d9c6b8c2cde49187c3358dc97c.
- Known-good: опубликованный checkpoint описывает production Huawei com.urtruck.app 1.0.9 (213702394); новые физические PASS этим документом не добавляются. Production backend SHA UNKNOWN.
- Scope: read-only проверка PR #516, контракта ownership и цепочки имени вложения; сверка CI #516/#517. Меняется только этот журнал.
- Checks: чтение связанных API/клиентских функций и существующих тестов; GitHub CI на точном HEAD; ADB inventory. Успешные тесты без изменений повторно не запускаются.
- Protected: production runtime/данные, установленная сборка Huawei, iPhone, реальные сделки, Auth/FSM/GPS/push/платежи, код обоих PR.
- Rollback: удалить только новый документ либо отменить его отдельный документальный commit. Runtime и данные не меняются.

## Подтверждено в этом продолжении
- MacBook-Air-Bahitzan.local доступен через Desktop Commander.
- ADB: Huawei GRL_AL10, serial 3DJ0224B04002582; других устройств нет.
- PR #516 OPEN; HEAD e4f596030234680b33be2e2560436c8d0e54041c; reviews пусты.
- CI run 38044921750: Backend tests SUCCESS; Frontend tests, lint, and build SUCCESS; Mandatory web E2E subset SUCCESS.
- Рабочее дерево кандидата перед созданием журнала чистое.

## Gate
NO-GO. CI не заменяет физическую приёмку и не подтверждает весь обязательный release gate.

## Контракт документов — проверка исходников
- GET list_conversation_attachments проверяет существование комнаты, участие пользователя и доступность чата до чтения/подписания файлов. Поле mine вычисляется отдельно для текущей серверной сессии; исходная запись не изменяется.
- DAL отдаёт uploader_id через SELECT *. Клиент serverDocs вызывает isOwnDocument: серверный boolean имеет приоритет, fallback старого API сравнивает непустые ID.
- Ограничение совместимости: новый клиент + старый backend без mine продолжает использовать локальное сравнение ID; в комбинации с несовпадающими ID это не гарантирует устранение дефекта. Нужна согласованная проверка backend и клиента, production SHA по-прежнему UNKNOWN.
- Регрессионные тесты охватывают владельца, второго участника, запрет постороннему, optimistic/reload/polling. Здесь повторно не запускались; результаты CI и 163 тестов не превращаются в новый физический PASS.
- Имя файла: DocumentPicker.name → docName → uploadAttachment → multipart → sanitize_original_name → original_name → serverDocs.docName. В кандидатном backend percent decoding уже выполняется один раз при загрузке, перед очисткой путей/управляющих символов.
- Новый отдельный check на исходном e4f59603: sanitize_original_name(quote('экспортный_инвойс №10.xlsx'), 'xlsx') вернул исходное читаемое имя, assert PASS. Проверка чистой функции через importlib; runtime и БД не использовались.
- _sign_attachment и клиент чтения не декодируют ранее сохранённый original_name. Этот патч ownership не исправляет старые записи. Новый физический upload на установленном кандидате остаётся NOT TESTED. Причина production-скриншота этим анализом не доказана.

## Дополнительная сверка PR #517
- Branch: fix/vehicle-audit-ui-20261010; HEAD fb0676f2c869b55a34a7d91d17341a5c843bfd3a.
- OPEN, reviews пусты. CI run 38044316273: backend SUCCESS, frontend/lint/build SUCCESS, mandatory web E2E SUCCESS.
- Это отдельный PR; его исправления safe-area и ZH/EN units не добавлялись в текущую ветку. Физическая приёмка NOT TESTED.

## Устройства и незавершённые шаги
- dumpsys Huawei в этом продолжении подтвердил versionCode 213702394, versionName 1.0.9, targetSdk 36.
- iPhone не проверялся и новая сборка не устанавливалась. OPPO отсутствует в ADB.
- Полная email-регистрация требует свежего штатного OTP владельца; старый код из checkpoint нельзя считать действующим. Коды из логов/БД не извлекались; login/session не обходились.
- Google/Apple/SMS, второй авторизованный участник для IDOR, отдельная QA-сделка полного FSM, push matrix, 30 минут GPS и физические PDF/XLSX остаются незавершёнными.
- AUD-CHAT-OPEN и AUD-GUEST-FEED остаются OPEN по актуальному production-audit-checkpoint. Здесь повторный UI прогон не выполнялся.
- Код и production не изменялись; создан только документ. После документального commit CI исходного e4f59603 следует продолжать обозначать именно этим SHA.
