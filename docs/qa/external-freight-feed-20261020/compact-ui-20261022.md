# PRE-FLIGHT: компактная внешняя лента, 22.10.2026

- Branch: qa2/external-feed-promotion; исходный HEAD f4575bc9e2997236dac19e14a4a15bfae0ce2191; PR base 64cdf1c2. Production SHA UNKNOWN.
- Known-good: на f4575bc9 подтверждены 72 backend/48 frontend/33 browser по отчёту исполнителя; предоставленные физические Chrome-снимки Xiaomi/Huawei подтверждают только synthetic stand, не native и не QA2. Старые APK Xiaomi 214494467/Huawei 213798673 новым кандидатом не являются.
- Владелец 22.10 разрешил унифицировать только внешний UI с существующим: карточка/шапка/кнопки/переносы, компактность и раскрытие полного исходного описания. Описание в свёрнутом виде до пяти строк, полное раскрытие без потери условий. Основные разделы менять не требуется.
- Planned: src/screens/ExternalFreightFeedScreen.js; связанные tests/e2e/external-freight-bookmarks.spec.js; при необходимости отдельный presentation helper/unit tests. Локальные COPY только для подписей внешнего UI, центральный i18n не меняется. Graphify AST до правок.
- Protected: основные ленты/карточки/общие кнопки/navigation/auth/chat/deals/GPS/push/AI; backend/DB/import/Telegram queue; production/stores. Нового APK нет.
- Checks: meaningful UI regression для обеих ролей, длинного текста, narrow 320px и увеличенного шрифта, фильтров/клавиатуры; scope guards; lint; web export. Физический Chrome на двух телефонах с явно synthetic fixtures отдельно от QA2/native.
- Risk: flex-wrap/длинный текст и шапка при font scaling; контракты bookmarks/filter query сохраняются. Не подавлять системное увеличение шрифта. Полный текст не обрезать и не переводить, валюты/суммы не менять.
- Rollback: revert отдельного патча/коммита; runtime/данные не меняются, backup/restore основной БД не нужен. Временный стенд отдельный; прежний не останавливать.

## Результаты
UI PATCH: PASS в проверенном browser scope; общий внешний импорт/релиз: PARTIAL.

| Проверка | Результат |
|---|---|
| Целевые клиентские/контрактные тесты | 48 PASS, в том числе29 guards защищённой реализации |
| Браузерные сценарии | 20 PASS на итоговом web export; обе роли,320px, увеличение текста150%, целые подписи кнопок, полный исходный текст40 условий, bookmarks/copy/filters/isolation |
| Lint | PASS,569 активных JS-файлов |
| Button design smoke / QA runners syntax / diff-check | PASS |
| Web export | PASS; EXTERNAL_FREIGHT flag включён только для отдельного тестового стенда |
| Native APK / iOS / живой импорт | Не выполнялись; browser PASS не переносится на них |

Итоговый набор Node и browser проверен после финальной правки. Backend72 относятся к исходномуf4575bc9; новый backend PASS не заявляется.

| Физический Chrome / synthetic stand | Xiaomi — грузоотправитель | Huawei — водитель |
|---|---|---|
| Модель / системный font_scale |25078RA3EY /1.3 |GRL_AL10 /1.0 |
| Полный заголовок / карточка / исходные24 условия и сворачивание |PASS |PASS |
| Закладка и saved-only после обновления страницы |PASS |PASS |
| Закладка после force-stop и нового запуска Chrome, без очистки данных |PASS |PASS |
| IME: ввод/кнопки/применение/повторное открытие/сброс |PASS, настоящие ADB touch |PASS, настоящие ADB touch |

Системные настройки шрифта не менялись. Ввод при повторном открытии проверен после свежего UI dump: видимая высота не меньше первоначальной, переходный кадр анимации не принимается как evidence.

Общая недоступность интернета с переключением системной сети, native Android и iPhone этим прогоном не подтверждены. Данные synthetic: пример машины добавлен только в отдельном стенде, отсутствие живых машин в прежней выборке не скрыто.


## Изменение интерфейса

- Шапка: полное название ленты, компактная отдельная кнопка закладок; режим сохранённых явно указан в названии. Системное увеличение шрифта не отключается.
- Карточка: геометрия MarketplaceCard (отступы 12/7, радиус18, промежуток7), маршрут15/19, характеристики объединены в строку, контакт с копированием, явная дата публикации. Склонение количества машин RU; единицы в подписи не меняют числовые значения.
- Исходное описание: максимум5 строк в свёрнутом состоянии; короткий текст без лишнего раскрытия; длинный раскрывается полностью, обратное сворачивание. Встроенного ограничения на10 строк нет: существенные условия нельзя терять. Текст источника и валюты не изменяются, AI не вызывается.
- Кнопки: существующие PrimaryButton/SecondaryButton; общий компонент и его настройки не менялись. Внешний фильтр использует безопасное растяжение/перенос подписей. На узком Xiaomi промежуточная версия с двумя рядами действий частично закрывала поле при повторном открытии IME: снимок xiaomi-before-actions-fix.png. Итоговый вариант — один ряд общих кнопок, minHeight48 и автоматическая высота.
- Границы: minWidth0, flexShrink, переносы; шапка и полоса фильтров не сжимаются содержимым списка. Горизонтальная прокрутка ограничена полосой фильтров.

## Изоляция и ограничения

Backend/импорт/очередь не менялись и backend72 повторно не запускались из-за чисто клиентского scope. Все29 guards основной реализации входят в48 целевых Node-тестов. Основные экраны, общие UI-компоненты, auth/чат/сделки/GPS/push и зависимости не изменены.

Рабочая папка исходно не содержала node_modules. После неудачного старта lint/export подключены существующие зависимости соседней копии; package.json и package-lock.json полностью совпадают. Версии/lockfile не изменялись. Временный symlink не коммитится.

Graphify AST:12173 nodes/27381 edges. Предупреждения: отсутствует необязательный SQL extractor, частичный Gradle parse. К этому UI-патчу SQL/Gradle не относятся; это не runtime evidence.

Стенд8770 отдельный, synthetic fixtures для груза и машины. Рабочий стенд8769 и Telegram queue не менялись. Новые Chrome-сессии живут на отдельном origin, реальные сессии приложений не затронуты.

## Повторяемые команды

```bash
EXPO_PUBLIC_EXTERNAL_FREIGHT_FEED_ENABLED=true ./node_modules/.bin/expo export --platform web --output-dir /tmp/urtruck-external-compact-web-20261022
EXTERNAL_FEED_TEST_DIST=/tmp/urtruck-external-compact-web-20261022 ./node_modules/.bin/playwright test tests/e2e/external-freight-bookmarks.spec.js --reporter=line
node scripts/qa/external-compact-stand-20261022.cjs
# Для каждого телефона: adb -s SERIAL reverse tcp:8770 tcp:8770
# CDP forwarding: Huawei9223, Xiaomi9224 -> localabstract:chrome_devtools_remote
# Задать HUAWEI_SERIAL и XIAOMI_SERIAL из adb devices -l:
node scripts/qa/external-compact-physical-20261022.cjs
python3 scripts/qa/external-compact-native-touch-20261022.py
RESTART_ONLY=1 python3 scripts/qa/external-compact-native-touch-20261022.py
```

Физические runners не устанавливают APK. JS runner проверяет карточки и закладки в Chrome; отдельный Python runner проверяет IME только настоящими касаниями Android без CDP. Координаты берутся из свежего Android UI tree; отсутствие цели/ошибка dump останавливают проверку, старый XML не переиспользуется. Промежуточные отказы отладочной автоматизации (повторное подключение к нескольким вкладкам и IME) не приняты как PASS: итоговый результат опирается на отдельный ADB-only прогон и снимки.

## Живой QA2 и review

Повторная read-only проверка22.10: `/api/v1/external-freight/count`404 и `/api/v1/external-freight`404, тело Not Found. В PR568 есть COMMENTED review дляf4575bc9, подтверждающее устранение прежних трёх дефектов; оно размещено аккаунтом автора и не является независимым approval. Новый UI-патч тоже требует review на итоговом SHA. QA2 deploy/import и native acceptance остаются отдельными этапами.


## Установленные приложения и следующий APK

Проверено через ADB22.10: Huawei — com.urtruck.app/213798673/1.0.9; Xiaomi — com.urtruck.app.qa2/214494467/1.0.9-qa2. Пакеты различаются. Один QA2 APK нельзя объявлять обновлением поверх обоих: на Huawei он устанавливается отдельным QA2 пакетом, сохраняя основное приложение и его данные; потребуется отдельный QA2 вход. Сейчас это не выполнялось. При запрете отдельной установки на Huawei — native acceptance BLOCKED, удалять/переподписывать основной пакет нельзя.


## Скриншоты и результаты

Предыдущиеf4575bc9 снимки скопированы из прежнего two-phones-noapk evidence; данные разных кадров могут отличаться, это не пиксельный benchmark плотности.

| Устройство | До | После | Клавиатура после повторного открытия | После перезапуска Chrome |
|---|---|---|---|---|
| Xiaomi | [f4575bc9](compact-ui-20261022/before-f457-xiaomi.png) | [Карточка](compact-ui-20261022/xiaomi-final-card-STAND.png) | [Поле и кнопки](compact-ui-20261022/xiaomi-native-touch-reopen-keyboard-STAND.png) | [Закладка](compact-ui-20261022/xiaomi-native-touch-after-chrome-restart-STAND.png) |
| Huawei | [f4575bc9](compact-ui-20261022/before-f457-huawei.png) | [Карточка](compact-ui-20261022/huawei-final-card-STAND.png) | [Поле и кнопки](compact-ui-20261022/huawei-native-touch-reopen-keyboard-STAND.png) | [Закладка](compact-ui-20261022/huawei-native-touch-after-chrome-restart-STAND.png) |

Подписи RU укорочены до «Сброс / Отмена / Найти», чтобы не разрывать слово на узком экране. Это интерфейс фильтра, не изменение текста источника. Оригинальные суммы/валюты не менялись.

Машинные результаты: [карточки](compact-ui-20261022/physical-results.json), [IME](compact-ui-20261022/native-touch-results.json), [Chrome restart](compact-ui-20261022/native-restart-results.json). [Fingerprint исходников и web bundles](compact-ui-20261022/source-fingerprint.json) связывает тестовый экспорт с кодом; после проверки прикладной код не менялся.

## Следующий шаг

1. Независимое review итогового UI-кандидата и CI его commit.
2. После approval — штатное продвижение в разрешённую QA2-ветку и deploy, сверка фактического SHA/API.
3. Отдельный bridge и реальный импорт грузов/машин; нет подходящих машин — честный пустой результат, synthetic не публиковать.
4. После успешного живого web smoke — один QA2 APK; Xiaomi update с проверкой подписи, Huawei отдельный QA2 package без удаления основного. Физическая native матрица обеих ролей, включая сеть/клавиатуру/закладки/restart.

Production/магазины не разрешены этой задачей и не затрагивались. Новый APK не собирался и не устанавливался. Итог: PARTIAL до review/QA2/live/native.
