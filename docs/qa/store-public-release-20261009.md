# UrTruck — подготовка публичного обновления 9 октября 2026

## Текущий статус после устранения отказа Apple

- **Apple 1.0.9 (94): WAITING_FOR_REVIEW**, повторная отправка подтверждена API. Автоматический выпуск AFTER_APPROVAL. Публичная доступность новой версии ещё не подтверждена.
- **Google Play 213660672: production draft** по последней проверке; публичный rollout не запускался. Блокеры Play Console/declarations остаются.
- Следующие разделы до записи об исправлении демонстрационного входа — история подготовки, а не текущий статус Apple.

## Разрешение и pre-flight
Владелец явно запросил обновление публичных App Store и Google Play 2026-10-09 около 10:27 Asia/Almaty. Это отдельное разрешение на работу с магазинами; новый серверный patch не входит в него.

- Branch/SHA: release/store-public-20261009 от b6167e6bdb1f26acf5cb8a891cc854f71f0ab207; основная рабочая ветка сохранена.
- Known-good: готовый app source 0449116f88f59538310db46829957f96bd26e09d; iOS 94 и Android 213660672 успешно загружены во внутренние каналы. CI на финальном backend 0cc7213a SUCCESS 5/5. Полная физическая приёмка новых версий открыта, 10/10 не заявляется.
- Scope: чтение состояний магазинов, подготовка существующих сборок к публичному обновлению. Новая сборка не нужна. Код приложения, production API, AI/APNs и данные устройств защищены.
- Checks: сопоставить package/bundle, version/build, доступ ключа к правильному приложению; проверить состояния review, текущие production releases, declarations для background/FGS location и метаданные магазинов. Ключи/токены не выводить.
- Rollback до публикации: удалить только собственный ephemeral Play edit; не менять публичные tracks при инспекции. Отменить только собственную новую отправку, если возникнет регрессия. Публичный baseline и точные возможности отката зафиксировать после чтения магазинов; понижение установленного versionCode не обещать.

## Начальный фактический результат
Публичный App Store KZ показывает 1.0.7; готовая новая версия 1.0.9 build 94 загружена отдельно в TestFlight. Google Play production пока проверяется авторизованным API.

Локальная загрузка Android APK остановлена после уточнения владельца: требуются магазины, а не USB-установка. Частичные файлы сохранены, приложения и данные не удалялись.

## Проверенные состояния перед подготовкой
- Google Play production: 1.0.9 / 212912064 completed. Internal: 1.0.9 / 213660672 completed. Новый артефакт уже в Google Play; повторная сборка/загрузка не нужна.
- Apple public: 1.0.7 build 7. Версия 1.0.9 REJECTED, выбрана старая сборка 85. Новая 94 VALID, не expired. Review submission UNRESOLVED_ISSUES; причины нужно прочитать перед повторной отправкой.
- Store patch scope: выбрать Apple build 94; подготовить Google production draft 213660672, сохранив текущий completed 212912064. Не объявлять draft опубликованным или отправленным на review.
- Перед публичным Google rollout требуется сверка фактических Play Console background/FGS location declarations и актуального видео по AGENTS.md и канону. API списка tracks не доказывает заполнение этих форм.
- Rollback подготовки: вернуть Apple build 85 до новой отправки; убрать только собственный production draft, сохранив исходный completed release и остальные tracks. Фактический старый public release не изменяется на этапе подготовки.

## Подготовка 05:38 UTC
Apple: build 94 выбран вместо 85; state PREPARE_FOR_SUBMISSION, releaseType AFTER_APPROVAL, на review ещё не отправлено. Старые unresolved review issues требуют чтения замечаний Apple.
Google prepare run 37889551766: validate PASS, commit вернул HTTP 400: changesNotSentForReview запрещён, изменения отправляются на review автоматически. Собственный ephemeral edit удалён, production не изменён. Следующий запрос убирает запрещённый параметр и сохраняет status=draft; draft не распространяется пользователям.

## Итоговая фактическая проверка 2026-10-09T06:59:40.369061+00:00

- Apple 1.0.9 build 94: PREPARE_FOR_SUBMISSION, AFTER_APPROVAL. На App Review не отправлено. API подтверждает старый submission UNRESOLVED_ISSUES; текст замечаний через выполненные официальные API не получен. Нужен вход в App Store Connect для чтения и устранения замечаний; безопасный запрос входа завершился тайм-аутом, свежая cloud browser форма снова требует Apple Account. Нельзя считать вход успешным.
- Google Play: production содержит прежний 212912064 completed и новый 213660672 draft. Подготовка SUCCESS Actions 37889767275; свежая повторная API-проверка SUCCESS Actions 37896359597. Draft не распространяется пользователям; API commit учитывает автоматическую review policy, но фактический статус ожидания review по Publishing overview не подтверждён.
- Перед финальной отправкой/rollout Google требуется проверить фактические background location и FGS location declarations, действующее demo-video и Publishing overview в авторизованном Play Console. Это требование AGENTS.md и docs/release/google-play-background-location.md; API tracks не заменяет проверку форм.
- Разрешение владельца на публичное обновление уже получено; повторное разрешение не требуется. Блокеры — доступ к замечаниям Apple и проверка Google declarations, а не отсутствие разрешения. Новый серверный patch отдельно не разрешён и не применялся.
- Ключи/токены не публиковались; новые сборки не запускались; приложения/данные не удалялись. Raw metadata и SHA индекс сохранены приватно у владельца в qa-evidence/store-public-20261009.

## Продолжение входа 2026-10-09T07:12:28.092332+00:00

- Владелец подтвердил самостоятельное продолжение и готовность предоставить вход через защищённую форму. Значения паролей/кодов в чат и отчёт не передавались.
- Безопасная форма Apple: username и password submitted; это не доказательство входа. Apple показала «Check the account information you entered and try again». Успешный вход не подтверждён; требуется исправленный вход или ручная передача того же окна.
- Открытие https://play.google.com/console/ дважды отклонено автоматической проверкой браузера. Причина: Google перенаправляет на google.play, который reviewer классифицирует как недоверенный lookalike. Официальный переход подтверждён чтением https://play.google.com/console/about/ и ссылки Play Console на полученной странице; повторное открытие после проверки тоже отклонено. Дальнейшие обходы/альтернативные поверхности для заблокированного перехода не выполнялись. Для продолжения этого browser action требуется отдельное подтверждение адреса/разблокировка review.
- Состояния релизов не объявляются опубликованными: Apple 94 Prepare for Submission, Play 213660672 production draft по последней проверке.

## Исправление сведений для App Review — 2026-10-09T07:33:52.129820+00:00

PRE-FLIGHT: release/store-public-20261009, исходный SHA cb27cf71648dc52353445395a49ff643fb062df1. Сборка 94/app source 0449116f не изменены; полная физическая приёмка не закрыта. Scope: production API login smoke для существующего демонстрационного аккаунта, исправление App Store review details и повторная отправка. Production код, конфигурация, сервисы, QA2 и устройства защищены. Backup старых review details приватный, mode 600. Откат отправки: отменить собственную отправку по фактическому текущему состоянию Apple; публичная 1.0.7 не менялась. Не возвращать заведомо нерабочий код без отдельной причины.

Причина отказа подтверждена текстом Apple, предоставленным владельцем: Guideline 2.1, проверка сборки 85 от 6 октября, невозможность войти в demo account. Старые сведения из App Store Connect воспроизводят HTTP 400 «Неверный или истёкший код» на production.

Фактический production runtime /home/ubuntu/urtruck/backend уже содержит отдельно настроенные REVIEWER_DEMO_EMAIL и непубличный REVIEWER_DEMO_CODE. Прежний путь /home/ubuntu/urtruck-security не является текущим production runtime. С действующими сведениями вход HTTP 200, сессия выдана, verification_level=2. Профиль: driver, approved, App Review Demo. GET register/me, market/my, chat/rooms, notifications/badge — HTTP 200; email/send — HTTP 200, sent=true, error=null. Это API-smoke доступа, не полная проверка всех функций на iPhone/iPad.

PATCH appStoreReviewDetails обновил сведения входа и пошаговую инструкцию email → экран кода → код из поля Demo Account Password. Свежий GET подтвердил совпадение с действующей production конфигурацией. Код/пароль/токен не включены в отчёт, git или evidence. Backend не изменялся и не перезапускался.

Единственный rejected item существующей submission bea2c456-d49f-4894-ab2b-afb5a316e64e соответствует версии f449ae1b-74a0-4c56-9ee4-6c45e1c890ca. После подтверждения устранения demo-login проблемы выполнены resolved=true и submitted=true. Свежие GET подтвердили submission WAITING_FOR_REVIEW и version WAITING_FOR_REVIEW, build 94, releaseType AFTER_APPROVAL. Apple approval/публичная публикация ещё не получены.

Ключи, пароль демонстрационного аккаунта и сессии остались только в приватных локальных файлах mode 600. Сборки/скачивания не повторялись, рабочая ветка с PR #506–508 не изменена. Google Play остаётся отдельным незавершённым этапом.
