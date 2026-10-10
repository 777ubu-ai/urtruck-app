# UrTruck — боевой аудит, checkpoint 10.10.2026
## Вердикт
NO-GO. Полный аудит не завершён; оценка 10/10 не подтверждена. Этот checkpoint фиксирует доступный прогон, а не разрешение релиза.
## Проверяемая база
Production Huawei GRL_AL10 Android 12: com.urtruck.app 1.0.9, versionCode 213702394. iPhone по последним данным владельца: 1.0.9 (96), прямого управления нет. OPPO в ADB отсутствует.
Кандидат: ветка fix/document-message-ownership-20261010, исходный HEAD 4d6c7dcea8654687538c86d0d43ee8deedeb81ff; код ownership 2093f103; PR #516. Исправление в production-клиенты не установлено.
Production backend SHA неизвестен; runtime /home/ubuntu/urtruck/backend. Хеш deal_room.py c7b6e39d67f0d8328b7278bf095eb7d75cdb34021a1821c80be4d12522a3087b. Не подменять production результатами кандидата.
## Результаты текущего прогона
| Проверка | Результат | Доказательство/граница |
|---|---|---|
| Production web, первый экран | PASS | https://urtruck.kz открывается, вход и просмотр грузов доступны |
| Email: запрос и фактическое письмо | PASS | Новый тестовый адрес Gmail alias; письмо UrTruck доставлено 09:40:14 UTC, найдено в INBOX |
| Email: четырёхзначный ввод | PASS | maxlength=4; экран подтверждения, таймер повторной отправки |
| Email: неверный код | PASS | 0000 отклонён: «Неверный или истёкший код», вход не завершён |
| Email: правильный код / регистрация нового пользователя | BLOCKED | Gmail connector скрывает OTP; нужен код из доставленного письма от владельца. Обход через логи/БД не выполнялся |
| Google, SMS, Apple | NOT TESTED | Требуются отдельные реальные сценарии, Google credentials/consent и мобильный SMS |
| Huawei: текущая сессия и список сделок | PASS | Водитель, четыре вкладки; текущая сделка открывается, переписка сохраняется |
| Huawei: карта принятой сделки | PARTIAL | Экран карты, маршрут и 4314 км; GPS/ETA/прогресс «—». Тайлы и реальный трекинг не подтверждены |
| Регистрация / машина / обе роли на обеих платформах | BLOCKED | Новая регистрация ожидает OTP; нет прямого управления iPhone/OPPO |
| Документы: свои справа | FAIL production | Скриншоты владельца: собственные PDF/XLSX слева, текст/фото/голос справа. Патч кандидата тесты проходит, физическая приёмка новой сборки не выполнена |
| Имя XLSX | FAIL production | На скриншоте имя %D1%8D%D0... вместо читаемого кириллического; отдельно перепроверить новый upload на кандидате |
| Текст / фото / голос / геолокация | PARTIAL | Ранее подтверждены обмен владельца и Huawei и сохранение сообщений. Текущий прогон не заменяет повтор после установки кандидата |
| Push все режимы, badge, logout/relogin | NOT TESTED | Ранее один push виден на iPhone; это не PASS всей матрицы |
| Отзывы, завершение, отмена, архив | NOT TESTED physical | Нужна отдельная QA-сделка, текущая реальная сделка не изменялась |
| Зависание iOS 2660 ms | OPEN | Предыдущий скриншот Hang Detection; требуется воспроизведение и профиль, причина неизвестна |
| Подписанный релиз / физическая новая сборка | NOT TESTED | iOS export bundle ранее PASS, подписанный IPA и установка этим не подтверждены |
## Автоматические проверки кандидата
Все команды выполнялись на Mac в рабочей ветке; тестовая БД изолирована, прямых изменений production-данных нет.
- pytest attachment upload / upload validation / attachment push: 37 passed.
- pytest actor FSM / vehicle management / vehicle snapshot / atomic reviews / route-country FSM / country guard / registration submit / room status gate: 80 passed.
- Node document ownership / attachment URL expiry: 8 passed.
- Node со штатным tests/frontend/loader.mjs: country flags / vehicle flow / country search / reviews dark / PDF preview / native push registration / GPS deeplink: 38 passed.
Итого: 163 passed, 0 failed в итоговых запусках. Первоначальный расширенный Node запуск без штатного loader/dependencies дал 9 ошибок окружения; после подключения существующих зависимостей и loader все 38 прошли. Временный node_modules symlink удалён.
Есть deprecation/experimental warnings; они не объявлены исправленными.
CI предыдущего HEAD: backend, frontend/build, mandatory web E2E — SUCCESS. Новый документальный SHA потребует собственного CI.
## Что нужно для завершения
1. Завершить новую email-регистрацию штатным OTP, затем обе роли и сохранение машины с повторным входом.
2. Google и SMS реальные входы; expiry/reuse/resend/limits без mock.
3. Независимый review патча, установка кандидата через тестовый канал; отправить PDF/XLSX с обеих сторон и перепроверить после reopen/polling.
4. Отдельная QA-сделка: полный FSM, сообщения/вложения/голос/перевод, отзывы и архив.
5. Физические Android+iPhone: все push-состояния, logout privacy, 30-минутный GPS, карта/граница, отсутствие мигания и зависаний.
6. Повтор обязательных gates на окончательном SHA, доказательная матрица полного ТЗ, GO/NO-GO. Боевой релиз только по отдельному разрешению.

## Продолжение аудита — 10.10.2026, после checkpoint 8b25fcb
### Подтверждено на production
- Huawei остаётся единственным устройством в ADB. Сессия водителя сохранена.
- Карта принятой сделки: тайлы и линия маршрута видны внутри UrTruck; разворот/возврат работают. Показанные 4314 км являются значением UI, независимая точность маршрута не проверена. Активный GPS/ETA/30 минут — NOT TESTED.
- Chinese + dark profile: переключение работает, данные сохранены; профиль переводит единицы. Reviews: раздел открывается, пустое состояние на китайском; создание отзыва — NOT TESTED.
- Country picker: широкий локализованный каталог; поиск NL показывает 荷兰 и флаг. Полная физическая проверка всех стран не выполнена.
- Border: выбранная машина и текущая сделка видны; «Активная очередь не найдена», GPS/ETA недоступны. Внешний CGR и международный FSM — NOT TESTED.
- Google web: кнопка открывает accounts.google.com sign-in; успешная авторизация/callback — BLOCKED без учётных данных.
- Anonymous production API: attachments, conversation messages и legacy chat messages существующей тестовой комнаты вернули 401 JSON, без редиректа. Проверка другого авторизованного участника — BLOCKED, RLS в целом этим не подтверждён.
### Новые дефекты и воспроизведение
| ID | Severity | Шаги / факт | Статус |
|---|---|---|---|
| AUD-CHAT-OPEN | medium | Открыть текущий чат, прокрутить до сообщений за сегодня 14:11, выйти в Deals, снова открыть ту же карточку. Показаны «Вчера» и первые сообщения 01:11 вместо последних | OPEN production; новый кандидат физически не проверен, не менять прокрутку по догадке |
| AUD-VEHICLE-SAFE | medium | Profile → My vehicles → Add vehicle. Нижняя часть save-кнопки и её текст перекрыты системной three-button navbar. Нажатие по центру привело на Home; PID приложения сохранился, после возврата форма на месте | PATCH READY в #517, physical acceptance pending |
| AUD-VEHICLE-UNITS | medium | Переключить ZH → My vehicles. Карточки: «篷布车 · 30 т · 150 м³»; ожидается китайская запись единиц | PATCH READY в #517; EN неверные единицы также подтверждены render-test |
| AUD-GUEST-FEED | medium | В чистом web context нажать «Смотреть грузы». Открывается «Мои грузы» с login gate, публичного списка грузов нет. Повторено в отдельном чистом context | OPEN; кандидат OnboardingV2 goGuest также reset Main role client, поэтому не считать уже исправленным |
### Изолированные исправления
PR https://github.com/777ubu-ai/urtruck-app/pull/517
Branch fix/vehicle-audit-ui-20261010; base 1fcf04477483d8948fef32437dced7501a82ec8c.
- decc059: только нижний safe-area footer + regression proof/test fixture.
- 3def0ac: локализованные единицы карточек.
- fb0676f: журнал проверок. HEAD fb0676f; полный hash получить через git при продолжении.
Graphify AST-only 10311 nodes /22733 edges; сгенерированный graphify-out удалён.
До safe-area fix: 3 inset render cases FAIL / zero-inset PASS. До units fix: ZH/EN FAIL, RU/KK PASS. Итоговый локальный набор: 22 PASS (8 rendered regressions + 14 existing vehicle tests).
Lint PASS (476 active JS), build:web PASS (export + mandatory static assets).
CI run 38044316273: backend PASS, frontend/lint/build PASS, mandatory web E2E PASS на HEAD fb0676f. Независимое review не подтверждено, APK/IPA не установлены, production не менялся.
Никаких изменений vehicle API, регистрации/required fields, ролей аккаунтов, FSM, GPS, production-данных и платежей.
### Evidence и ограничения
Mac: /tmp/urtruck-production-audit-evidence-20261010/screenshots/.
Полный video-repro: videos/chat-reopen-complete.mp4, 7.666678 s, 1191652 bytes. Скрипт проверил latest перед выходом, карточку той же сделки, old history после возврата; последний кадр просмотрен. Первая chat-reopen.mp4 закончилась до reopen и не является полным repro.
Agent-device Android helper дважды timed out на OEM install dialog; установка отменена. Fallback ADB работал. OEM screenrecord отсутствует; scrcpy завершил полный video-repro.
Private chat/профиль/геолокация из raw evidence не публикуются в публичный GitHub repo.
### Gate
NO-GO сохраняется. Сохранённые патчи и успешный CI не означают физическую приёмку.
Самый ранний блокированный шаг: правильный email OTP новой QA-регистрации. Gmail скрывает OTP; требуются штатно доставленный код владельца и завершение роли. Нужны iPhone/Android обе роли, новая QA-сделка, GPS/граница/доставка/отзывы, push все режимы, logout privacy и новая сборка.
