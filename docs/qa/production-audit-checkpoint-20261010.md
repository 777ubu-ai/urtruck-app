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
