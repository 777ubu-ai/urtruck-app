# Девять языков водителя — 30.10.2026

## PRE-FLIGHT

Branch feat/additional-ui-languages-20261029, исходный проверенный HEAD178795492b9e5a888749551938a301c266610a19, CI41023094227 PASS3/3. Known-good этого SHA: Xiaomi Chrome9языков/профиль/валидация; новые native-бинарники ещё не проверены. Исторический PASS не переносится на новый кандидат. Подтверждённый полный production backend SHA UNKNOWN; production не меняется.

В PR объединены актуальная integration fbda7366e6161410c414ac93f1b08d123fb039f8 и точный GPS6522225c84f2a967275ab81975cca8f5dddd350e863. Единственный конфликт — две строки импортов DealWorkspace; сохранены обе. Решение владельца прямо разрешает это объединение и один новый Android-кандидат+iPhone для QA.

Graphify AST-only13253nodes/29808edges/691communities. Scope: фиксированные server push templates и locale aliases, App.js/push.js только синхронизация языка, GPS notice9, доступная вертикальная прокрутка приветствия. Native identity: следующий QA2Android214494479 после478; iOS marketing1.0.14, поскольку ASC30.10 подтвердил1.0.13(123) READY_FOR_SALE и EAS/ASCmax123. Workflow guard/средаQA2/источникCI/подписи не ослаблены, committed production version не меняется.

Риски: кэш и in-flight токена, callback предыдущей ротации, device-vs-sender language, opaqueпараметры, крупный шрифт, native API/SHA. Защищены владельцы токенов/Auth/FSM/Chat/БД/production/ключи/публичные отправки. Rollback: отдельные commits/merge отменяются git revert, серверные production данные не затронуты. QA2 deploy и native build только после exactSHA CI; rollback QA2 с резервной копией.

## Изменения и доказательства

- 30 системных push событий дополнены TR/UZ/KY/TG/BE. Старые RU/KK/ZH/EN побайтово сверяются hash497ebfbfdd576dffcefdd945f3bd20220d23fef4e6c31e5ebedb291fc600d0ad. В переводимых шаблонах сохраняются amount/route/rating/booking/comment/filename; пользовательский текст без i18n_event идёт без изменения.
- Смена языка обновляет locale той же установки. Locale входит в cache identity; быстрые переключения объединяются до последнего. Данные владельца и auth-generation guards сохранены. Смена языка не вызывает новый prompt push.
- Независимый review обнаружил P1 сочетания token rotation+locale replay+старый callback: исправлен ограниченным replaced-token context текущей цепочки (до4, без bearer, очистка в finally). Исполняемые проверки stale callback и настоящей следующей ротации PASS;26 native push tests PASS.
- GPS предупреждение переведено на9языков; поведение согласованного патча652 сохранено. ProtectedGPS исключение обновляет только hash объединённого DealWorkspace после проверки исходного hash652.
- Приветствие прокручивается вертикально вместе с текстом, кнопками и согласием; заголовок больше не ограничен двумя строками, CTA сохраняют минимальные размеры52/48dp и могут увеличиваться. Изображения/навигация/auth callbacks сохранены.

Адресные backend API/SQLite/gateway/ownership/template проверки:58PASS. Frontend push/onboarding/GPS/protected:71PASS. Полный frontend+unit:1663PASS. Native build contracts и locale:22PASS. Lint604файлов PASS, web export PASS. Browser18cases(270/390×520,все9языков,заголовок54px и CTA32px) проверяет доступность заголовка и обеих кнопок через реальную прокрутку. Это не native physical PASS.

## Сервер и устройства

QA2 фактическая конфигурация процесса: TRANSLATE_PROVIDER=local_ai; TRANSCRIBE_PROVIDER=openai/modelgpt-4o-mini-transcribe; fallbacklocal_ai. Локальный AI объявляет4языка, новые направления требуют отдельных фактических результатов. Ключ не выводился и не менялся. Интерфейс9языков не означает speech/translation support9.

Xiaomi25078RA3EY/Android16 и HuaweiGRL-AL10/Android12 подключены. iPhone15ProMax(iPhoneBah2) подключён, установлен1.0.13(123); владелец освободил и разблокировал его. UI runner требует включить DevToolsSecurity наMac; для этого нужен локальный пароль администратора, действие запрошено владельцу. Новый native кандидат, полная водительская матрица обоих телефонов и полный CI этого изменения pending. Публичный выпуск новых языков не объявляется.
