# UrTruck — фактический ночной аудит 8–9 октября 2026

Статус: исправления подготовлены, автоматическая часть проверена; полная физическая приёмка открыта. Оценка 10/10 пока не подтверждена.

## Baseline и защищённый объём
- Репозиторий: 777ubu-ai/urtruck-app, ветка fix/route-country-list-20261008.
- Начало: a686d5b308c727411e099133347f159086200293.
- Итоговый frozen app source после BottomNav race: 0449116f88f59538310db46829957f96bd26e09d. Промежуточный f241f855 включает AX/composer/readiness, но ещё не BottomNav race. Последующий отдельный backend read-boundaries patch: 08f1d467923b1e701dbc06803e6a6f6d9c79dfaf; read-only production plan: 08c9dbb30566332a5a626c23c24e439d0162ddcd.
- Последовательные PR #506, #507, #508 не слиты; предыдущие исправления входят в кандидата.
- Прочитаны комплексное ТЗ 10/10, «Эконом Токенов», AGENTS.md и действующие каноны репозитория. Ночное задание: night-audit-assignment-20261009.md.
- Работа выполнялась в существующей папке /private/tmp/urtruck-ai-recovery-20261008; проект заново не создавался.
- Защищены круглый дизайн и размеры флагов, Android composer, данные телефонов, авторизация, работающий production AI.
- В этой части аудита production не изменялся и не перезапускался. Публичный rollout не запускался.
- Резервные копии AI и APNs сохранены: /home/ubuntu/urtruck-ai-recovery-backups/20261008T152841Z и /home/ubuntu/urtruck-apns-recovery-backups/20261008T203025Z.
- Откат клиентского кандидата: возврат к a686d5b3 / предыдущей внутренней сборке; не удалять приложения и данные. Серверный откат нужен только при фактической регрессии.

## Что исправлено
1. **iPhone: поле ввода.** Высота измеряется по строкам отдельного невидимого Text с той же шириной, шрифтом и межстрочным шагом. Видны до четырёх строк; после четвёртой включается внутренняя прокрутка. Учитываются переносы при наборе, вставке, завершающий Enter, удаление и межстрочный шаг. Запоздавшее измерение другого текста, комнаты или ширины игнорируется. Android сохраняет прежний расчёт. Это проверено на коде и callback-тестах; UIKit и реальное устройство ещё нужны.
2. **Состояние голосовых и документов.** Reconciliation теперь учитывает voiceProcessingStatus, voiceTranscriptReady и docDownloadUrl. Раньше обновления только этих полей могли оставить старую строку списка. Проверены переходы pending → ready / failed / expired и обновление ссылки документа.
3. **Справочник стран.** Исправлен прямой Node-импорт countries.js, из-за которого падал qa:zh. Список 249 кодов, локализация и прежний приоритет стран сохранены.
4. **Тест истории чата.** В harness добавлен callback scoped-очистки прочитанных уведомлений с проверкой комнаты, границы прочитанного и актуальности запроса. Два исходных падения были неполнотой тестового окружения; они не объявлены доказанной production-поломкой истории.

5. **Зарегистрированный API ТТН.** Убраны фиксированная цена 1500 и подмена перевозчика профилем запрашивающего; HTML/PDF используют один проверенный набор полей рейса, включая доступный объём и транзит. Динамический текст экранирован для HTML и PDF renderer. Доступ участника проверяется до чтения профиля. Текущих вызовов этого endpoint в src не найдено; production patch не применён. Это исправление API, не заявление о живом chat-attachment дефекте.

6. **AX и строгие 249.** Проверка обнаружила, что прежний общий справочник содержал 248 кодов, вопреки прошлым отчётам. Добавлены Аландские острова (AX) и RU/ZH/EN/KK names. Новый test проверяет ровно 249, все 996 name/search комбинаций и 249 ISO searches с отключённым Intl.DisplayNames. Флаг AX уже был bundled; renderer не изменён.
7. **Гонка чтения.** Новое сообщение между SELECT/UPDATE, поздний Bell event и запрос старой страницы теряли unread. Три новых теста воспроизвели ошибку; теперь read-marking ограничен возвращённым message ID и снимком notification IDs. Chat event keys ограничены также по message ID. Старые events без ключа ограничены снимком notification IDs. API-пути, участники и схема сохранены.

8. **Счётчик вкладки Сделки.** Оба callback раньше принимали badge из superseded-ответа, уже отклонённого native механизмом. Теперь stale response не возвращает старое число в UI; cleanup отсекает поздний ответ прежнего экрана/аккаунта, эффекты учитывают user ID. Canonical значение при неподдерживаемом launcher по-прежнему видно внутри приложения. Настоящие callbacks: до patch 4 FAIL / 2 PASS, после 14/14 вместе с appBadge runtime.

Коммиты исправлений: 4cccfcf7, ef433d1e, a6a93e93, bfada6c9, 4d939621, a4e05b20, f241f855, 08f1d467, 0449116f.

## Фактически выполненные проверки

| Проверка | Результат | Граница доказательства |
|---|---|---|
| Frontend unit, финальный 0449116f | 1114/1114 PASS | JS-тесты, включая реальные callbacks и новые regressions |
| ESLint, финальный 0449116f | PASS | Статический анализ |
| qa:center:quick, финальный 0449116f | PASS | Все входящие gates, включая production web build |
| qa:i18n-duplicates | PASS | Проверка словарей |
| Канонический backend/API runner | PASS, все 130 модулей | Изолированная SQLite, тестовое окружение; не production DB |
| Обязательные web E2E | 23/23 PASS | Повторно после BottomNav/read patch на 0449116f, 69.61 с; изолированный локальный API и финальный bundle; часть recovery/crash тестов использует предусмотренные mocks |
| runtimeLocaleLeakProbe | 8/8 PASS | RU/ZH/EN/KK × два маршрута; анонимный app chrome, не все авторизованные экраны |
| APNs operations tests | 6/6 PASS | Изолированные операции настройки/отката, не доставка APNs на телефон |
| Kotlin badge policy | 5/5 PASS | Реальные исходники policy и JUnit; не новая APK и не значок launcher |
| Статический release gate | PASS | Повторно на чистом 0449116f: финальный клиент, backend read patch и ops plan |
| node-forge exception gate | PASS | Существующее проверенное исключение с компенсирующим patch; не «npm audit: ноль уязвимостей» |
| Graphify AST | PASS | 10541 узел, 23369 связей; SQL parser недоступен для 19 файлов, два Gradle предупреждения |

Backend runner стартовал на bfada6c9, завершился после frontend-only коммита 4d939621. Backend-исходники в этом промежутке не менялись. Результат не приписывается непроверенному изменению backend.

| Дополнительная проверка | Результат | Граница доказательства |
|---|---|---|
| ТТН regressions | 7/7 PASS | Исходные ошибки воспроизведены: 4 FAIL / 2 PASS до patch; итоговая проверка содержит реальную изолированную БД |
| Повторный canonical backend после ТТН | PASS, 130 модулей | Точный a4e05b20, 137.44 с |
| Облачный Full QA Actions 37845188843 | SUCCESS, 5/5 jobs | b9e301bc: клиент 4d939621, до отдельного backend ТТН patch |
| Desktop Playwright облачного аудита | 29 PASS, 2 SKIP | Пропущены только два production-smoke API сценария, локальный прогон не вызывал production |
| Mobile Playwright облачного аудита | 38 PASS | Mobile browser viewport; не реальные iOS/Huawei/OPPO |
| Full QA после AX, Actions 37847548191 | SUCCESS, 5/5 jobs | 159cae9a, клиентский source f241f855; до read-boundaries patch |
| Read race / pagination / notification paths | 28/28 PASS | До patch 3 FAIL / 25 PASS; реальные отдельные SQLite connections и позднее событие |
| Canonical backend после read patch | PASS, 130 модулей | Точный 08f1d467, 135.19 с |
| Read-only production plan safety | 4/4 PASS | Source guards, отсутствие runtime writes, private output, запрет symlink escape |
| BottomNav + appBadge runtime | 14/14 PASS | Выполняются реальные effect callbacks; superseded poll/native/notification, cleanup, сохранение canonical при OEM отказе |
| Full QA после всех code fixes, 37851244139 | SUCCESS, 5/5 jobs | Точный 0449116f, включает BottomNav/read/ТТН/AX/composer; 29 desktop PASS / 2 production smoke SKIP, 38 mobile viewport PASS |
| Production interpreter compile-only | 2 файла PASS, Python 3.12.3 | Не импортировал/не исполнял API, не писал runtime, не перезапускал API |

Native-кандидаты отслеживаются отдельно в night-audit-candidate-20261009.md. Факт запуска или подготовки не равен PASS.

## Связность аккаунтов и новой сделки
Владелец создал груз с iPhone serik. Read-only серверная проверка подтверждает:
- cargo: a0697b13-7429-4a08-9e5f-e20ba71efaa1;
- shipper serik: 79ee0d85-3f1d-4ec3-9285-571662a9d0ff;
- driver Карго Федя 888: 5804eb84-132f-488b-9eff-f8cc732471ea;
- bid: 4c0ac922-48ab-4788-b91e-1289072a35e8, accepted;
- room: c7e06448-4bd8-487b-8002-c0ca92d70b66;
- маршрут: Хоргос → Нур Жолы → Москва, 15 т, 120 м³, 8888 USD, загрузка 11.10.2026.
Это отдельная общая сделка serik ↔ Huawei. Старую Android-сделку Иу → Алматы нельзя подменять этой комнатой.

Huawei и iPhone видят обмен в новой комнате: ранее отправленные сообщения 1440–1442 видны на снимке владельца, последний ответ владельца 1443 есть в серверной комнате. Все четыре имеют read=1. Для этой комнаты serik unread=0; unread непрочитанных нечатовых уведомлений serik также 0. Это не фото сброса значка iPhone и не вычисление общего badge для всех комнат.

## Production: проверено только чтением
- API/health и /api/v1/system/info отвечают 200, процесс API online.
- /api/v1/notifications/badge без авторизации отвечает 401.
- Получение голосовой расшифровки без авторизации отвечает 401.
- TRANSLATE_PROVIDER / TRANSCRIBE_PROVIDER: openai; модели gpt-4o-mini / gpt-4o-mini-transcribe; существующий ключ присутствует. Значение ключа не выводилось.
- APNs production-конфигурация присутствует; sandbox=false.
- Outbox 306 и APNs delivery 1895 имеют статус sent без last_error. Статус провайдера не доказывает баннер/звук на экране.
- Защищённые файлы сохранены без изменений относительно серверного восстановления:
  - api/chat.py: 80619b090b46559587ceb6d3722c1cd308cbd44345d24e4748f7e1fe6ecef080;
  - api/notifications.py: 235871e8dc7ba05d4f43b7e5deb9b52f96bc13ce7797edaa8a37050f6f7ee084;
  - services/push_gateway.py: cbda81eb8a8e5b9c62a617fb5010c9af5577643da1b8543da498d4ce846afe56.

## Код / установленные версии / физический результат

| Устройство | Установлено при аудите | Подтверждено | Открыто |
|---|---|---|---|
| iPhone владельца | 1.0.9 (91), serik | Полученные сообщения и значок 3 по фото/сообщению владельца | Верхний баннер, звук, сброс badge; новый composer и 249 стран; полная push-матрица |
| Huawei GRL_AL10 | 1.0.9 / 213640023 | Сохранён аккаунт водителя, общая комната serik открыта | Обновление требует Huawei ID; новая native badge policy ещё не установлена |
| OPPO PJB110 | 1.0.9 / 213645294 | Версия подтверждена adb | Телефон на lock screen; полный push/badge после разблокировки |

iPhone по USB недоступен, booted simulator отсутствует. Авторизация Huawei ID не обходилась, OPPO не разблокировался обходным способом, приложения не удалялись. Реальный RU↔ZH голосовой прогон ещё не проведён. Озвученный синтезатором Mac текст не засчитывается как достаточная проверка настоящей речи.

## Production read-boundaries: подготовлено, не применено
Read-only AST проверка фактического runtime подтвердила тот же неограниченный UPDATE chat_messages и отсутствие notification snapshot. Полный SHA сервера по-прежнему UNKNOWN: отдельные файлы не равны HEAD репозитория.

Подготовлен точечный review-кандидат на копии фактических API-файлов. Source guards требуют исходные SHA-256 выше; все функции, кроме get_messages и mark_notifications_read_by_urls, сохранены с идентичным AST, включая голосовые, доступы и badge. Приватный diff/manifest находятся в qa-evidence/night-audit-20261009/production-read-review.
- Предлагаемый api/chat.py: 26d2cea4fb9ed1b23084a661e15f72f3d8a94a7e2efc6acca183c834d476a370.
- Предлагаемый api/notifications.py: 962d7c99409fe4ebfe95622e1c11636ef6ac915fe643a51b5e297d9cefbd87dc.
- Скрипт scripts/ops/production_chat_read_boundaries.py только готовит план/приватный кандидат; он не имеет apply/restart операции.
- Ночное ТЗ, разделы 2 и 14, требует отдельного разрешения для нового production deploy; разрешение APNs его не заменяет. Этот patch и ТТН остаются FIXED_CODE, не DEPLOYED.
- Перед разрешённым применением: перепроверить все три защищённых fingerprints, private backup двух API-файлов и режимов, сохранить diff/manifest/rollback, применить только согласованный patch, перезапустить только API, проверить health/access/AI/push, затем наблюдение 15/60/180 минут. Не объявлять это наблюдение выполненным заранее.

## Что нужно для честных 10/10
- Установить следующий внутренний iPhone build с проверенным SHA; 91 не перезаписывать.
- На iPhone проверить последовательность 1 → 2 → 3 → 4 → 5 строк, авто-переносы без Enter, большую вставку, удаление до одной строки, смену комнаты, клавиатуру и черновики. После четвёртой высота постоянна, курсор виден, поле прокручивается.
- Обновить Huawei штатно с вводом Huawei ID владельцем; сохранить аккаунт и данные. Разблокировать OPPO штатно.
- На общей сделке выполнить настоящие RU↔ZH текстовые и голосовые обмены в обе стороны: отрицания, города, дата, время, цена, масса/объём. Сравнить оригинал, расшифровку и перевод после повторного открытия/перезапуска.
- Для каждого телефона отдельно подтвердить доставку, баннер, звук, нужную комнату, unread, рост badge и сброс после чтения: другой экран, фон, блокировка, удаление из recent apps; отметить OS-ограничения без подмены результата.
- В двух комнатах подтвердить scoped-очистку и сохранность уведомлений другой комнаты/сделок; гонки чтение/новое сообщение, смену аккаунта и запоздавшие ответы.
- На iPhone и Android проверить все 249 кодов на выбор/поиск/сохранение/повторное открытие в RU/ZH/EN/KK, включая DE/BE/NL. Размеры флагов не менять.
- Документы, GPS/карта и весь жизненный цикл сделки проверять живыми согласованными сценариями на новых native-кандидатах. Наличие автоматических тестов не заменяет эту приёмку.

## Доказательства и ограничения
Логи, result JSON, исходные XML/PNG устройств и affected graph находятся у владельца:
 /Users/bahitzanbahitzanovic/Desktop/URTRUCK_MAIN_PROJECT/qa-evidence/night-audit-20261009

Финальный frontend: final-bottom-nav; повторные E2E: final-bottom-nav-E2E. Исторические AX/read прогоны сохранены отдельно. Backend после ТТН: final-documents; после read patch: final-read-race/backend-isolated.log. Kotlin: kotlin-policy.log. Исторические проверки 4d939621 сохранены отдельно. Первые кандидаты 37845195639/37846232177 отменены до submit из-за найденного отсутствующего AX; новые native runs 37847554527/37847561121 используют f241f855.
Индекс SHA-256 сохраняется как evidence-sha256.txt в той же папке. Приватная тестовая DB, ключи и сырые пользовательские файлы в публичный GitHub не публикуются.

## Продолжение физического обмена
С Huawei 213640023 через реальный UI отправлено китайское сообщение 1444 в подтверждённую комнату serik:
«Huawei 测试：明天10:00在霍尔果斯装货，运费8888美元，重量15吨，体积120立方米。不要在09:00出发。目的地是莫斯科。»

Timestamp 2026-10-08 21:19:41 UTC; при read-only проверке is_read=0. Outbox 308 и APNs delivery 1900: sent, ошибок нет, 21:19:42 UTC. Это физическая отправка текста и принятие APNs; просмотр, русский перевод, баннер, звук и сброс на iPhone не подтверждены. Не считать это настоящей речью или полным двусторонним RU↔ZH PASS.

## Карта покрытия аудита
| Область | Проверенный код/регрессии | Что остаётся физически |
|---|---|---|
| Сделка и обе стороны | test_deal_status_actor_fsm.py, test_p0_deal_bid_race.py, test_deal_rooms.py; новая production-комната serik ↔ водитель подтверждена read-only | Полный жизненный цикл на обоих телефонах, статусы после повторного входа |
| Push / unread / badge | test_unread_badge.py, test_read_chat_notifications.mjs, test_app_badge_runtime.mjs, Kotlin policy; scoped очистка, dedupe, stale callbacks | Каждый launcher и iOS баннер/звук/reset в разных состояниях |
| Перевод | test_translation_fail_closed.py, test_translation_memory.py, test_auto_translation_singleflight.mjs; структурированные provider failures, cache/retry | Реальные смысловые RU↔ZH фразы, отрицания и терминология |
| Голос | test_voice_background_processing.py, voice migrations, readiness reconcile; leases, recover/retry, stale worker, STT/translation separation | Запись настоящей речи обеими сторонами и сохранение результата после перезапуска |
| Доступы / документы | Проверки участника chat/voice/doc API; test_deal_attachment_upload.py, test_documents_fallback.py | Реальные вложения и печатный документ; ТТН использует данные рейса, отдельно проверить согласованную цену сделки/полноту реквизитов |
| GPS / карта | test_deal_location_coords_validation.py, test_gps_sample_journal.py, lost/restored, background timestamp/headless contract tests, map locale tests | Реальные координаты, разрешения, фон/блокировка, offline/reconnect |
| Страны / локализация | Общий справочник 249 кодов, Node-импорт, QA Center, i18n duplicates, 8 locale probes | Все страны, поиск, сохранение и повторное открытие на native RU/ZH/EN/KK |
| Авторизация / аккаунт | Canonical backend, social-auth/retry/pending и logout GPS regressions | Повторный вход и account switch на native с исходными аккаунтами |

Этот отчёт перечисляет выполненную часть большого ТЗ. Он не означает завершение всех 16 разделов, универсальный PASS перевода, ноль всех уязвимостей или готовность публичного выпуска.


## Мобильные кандидаты после последней находки
- Промежуточный iPhone build 93 (Actions 37847554527), source f241f855, успешно загружен в TestFlight. Локально проверены IPA SHA-256 7f7eda62c739dc1ae91da5cfcdacbc811987a7c373d7093ca9cb2e9b5ac6f72e, codesign strict, com.urtruck.app, production host и aps-environment=production. На телефон не установлен.
- Промежуточный Android 213658419 (Actions 37847561121), source f241f855, успешно загружен только в internal; AAB SHA-256 fef0007fb786272b605659fd323dcb23b4f2f6317fae66c15c679a3fc02b2532, manifest/package/version и один FCM handler проверены runner. Локальный AAB transfer остановлен как ненужный после N-19; повторное скачивание не запускается.
- Итоговые source 0449116f: iOS Actions 37851771645 (workflow 5433e7e7227adade694ef00ccca1aa7ef08485fa), Android Actions 37851776201 (workflow cbce14aeed2b31d703a31bcfc10bb6cc0474df0e). Запущены только после CI 37851244139 SUCCESS и локальных gates. Выполняются; ожидаемый следующий iOS номер 94, фактический номер ещё не объявлен. iOS проверяет production APNs entitlement до submit, Android min version >213658419. Никакого public rollout.
