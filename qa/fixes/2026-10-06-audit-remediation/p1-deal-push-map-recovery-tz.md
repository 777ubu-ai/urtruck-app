# ТЗ: восстановление сделок, чата, push/badge, карты и GPS

**Дата:** 2026-10-06  
**Статус:** P1 remediation / release blocked  
**Область:** Android (Huawei client, OPPO driver) и iOS (iPhone Bah (2)).

## 1. Основание

На физическом Huawei в чате созданной сделки воспроизведён crash старого Android APK:
`Cannot read property 'contentSize' of null`, стек содержит `DealWorkspaceScreenV2`.
Из-за него клиент не может ответить в чате и надёжно проверить уведомления/геолокацию.

Пользователь также сообщил:
- при наборе сообщения отображается «Что-то пошло не так»;
- push не приходит и нет badge на иконке;
- карта не открывается, хотя раньше открывалась.

Это **P1**. Сообщение, push/badge, карта и GPS не считаются рабочими, пока не пройдут физический сценарий ниже. Никаких store rollout до результата.

## 2. Границы и ограничения

- Тестировать только QA2 с выделенными тестовыми аккаунтами; не удалять пользовательские сущности.
- Production пакет обязан обращаться только к `https://urtruck.kz`; QA2 — только через изолированный endpoint.
- Не скрывать crash глобальным error boundary и не заменять ошибку «тихим успехом».
- Не логировать токены, персональные данные, координаты или учётные данные в публичный CI/log.
- Запуск в Play/TestFlight запрещён до всех PASS-критериев и forensic-проверки подписанного артефакта.

## 3. Работы по исправлению

### D1. Crash в чате сделки

1. В `DealWorkspaceScreenV2` исключить любое прямое чтение `event.nativeEvent.contentSize.height` без проверки.
2. Обработчик scroll/keyboard/list-layout обязан:
   - принимать неполное событие;
   - не менять последнее достоверное scroll-состояние;
   - не вызывать повторный render/crash loop;
   - не блокировать отправку или приём сообщения.
3. Добавить unit/regression тесты на `undefined/null` в `nativeEvent`, `contentSize`, `height`, mount/unmount и приход сообщения во время ввода.
4. На устройстве проверить: открыть сделку, отправить с driver, ответить с client, свернуть/развернуть приложение, прокрутить чат. Ошибочный экран отсутствует.

### D2. Отправка и получение сообщений

1. Для каждого сообщения фиксировать в защищённой диагностике: client event id, server accepted/rejected, conversation/deal id, delivery event, UI-render event. Значения сообщений и токены редактировать/не публиковать.
2. При отказе API UI обязан показать действие «повторить», а не generic «Что-то пошло не так».
3. Не дублировать сообщение при retry; idempotency key обязателен.
4. Проверить обе стороны сделки: driver → client и client → driver, foreground и после background/foreground.

### D3. Push и badge

1. Проверить регистрацию FCM/APNs token при логине, смене пользователя и повторном запуске; сервер должен хранить только актуальный token и платформу.
2. Серверный журнал должен различать: queued, provider accepted, provider receipt/error, opened. Отсутствующий token — явная причина, не silent drop.
3. При активном чате показать in-app banner/счётчик непрочитанных, не полагаться на системный баннер.
4. При background/locked сценарии проверить системное уведомление и переход по тапу к нужной сделке.
5. Badge проверять отдельно:
   - iOS — badge на icon и очистка после прочтения;
   - Android — уведомление в шторке обязательно; icon badge зависит от OEM launcher и документируется отдельно. Нельзя объявлять Android FAIL только из-за отсутствия OEM badge при доставленном уведомлении.
6. Нельзя отправлять push реальным пользователям ради теста.

### D4. Карта и маршрут

1. Карта сделки должна открываться независимо от статуса фоновой GPS.
2. До открытия валидировать координаты pickup/delivery; при отсутствии показывать понятную причину и не падать.
3. Явно диагностировать недоступный provider/API key/сетевую ошибку/отсутствующие координаты, без скрытого blank screen.
4. На driver открыть маршрут из активной сделки, проверить visible map, точки погрузки/выгрузки и возврат в сделку.
5. На client проверить отображение статуса карты/маршрута из той же сделки.

### D5. GPS

1. Запрашивать permission только после явного действия водителя.
2. Проверить Android и iOS permissions, foreground update, background policy и поведение при запрете.
3. В активной сделке client получает обновление только после подтверждённого start tracking driver.
4. Остановить тестовый tracking после сценария.

## 4. Обязательная физическая матрица

| Шаг | Huawei (client) | OPPO (driver) | iPhone |
|---|---|---|---|
| Новый бинарник | manifest/SHA/config PASS | manifest/SHA/config PASS | build/provenance PASS |
| Груз → ставка → принятие → сделка | принять | отправить ставку | повторить c отдельной ролью |
| Чат driver → client | получить | отправить | повторить |
| Чат client → driver | отправить | получить | повторить |
| Push foreground | получить in-app/счётчик | отправить | повторить |
| Push background | получить system notification | отправить | повторить |
| Badge | Android policy evidence | Android policy evidence | iOS icon badge |
| Карта | state/route visible | открыть маршрут | открыть карту |
| GPS | увидеть update | дать permission, start/stop | дать permission, start/stop |

Если для iPhone отсутствует управляемый канал UI, результат по iPhone — **BLOCKED**, не PASS; нужна запись экрана и подтверждённые шаги на устройстве.

## 5. Приёмка и доказательства

PASS возможен только при наличии одновременно:
1. sha256, package, versionCode, signing certificate и embedded config нового артефакта;
2. видео/скриншотов или UI tree для каждого физического шага;
3. очищенного logcat/Xcode device log без crash/fatal JS exception;
4. server delivery trace для каждого тестового push без токенов/PII;
5. зафиксированного результата по каждой ячейке матрицы.

Любой crash, blank map, недоставленный push без объяснённого provider response, либо невалидный артефакт = **NO-GO**.

## 6. Порядок исполнения

1. Forensic-проверка завершённого Android build 213392856.
2. Установка только если versionCode больше 213298108 и prod/QA endpoint соответствует варианту.
3. Android: D1 → D2 → D3 → D4 → D5 на Huawei/OPPO.
4. iPhone: тот же сценарий только на проверяемом build 85 либо новом build с доказанной source provenance.
5. Обновить evidence и вынести один из verdict: PASS / FAIL / BLOCKED.

## 7. Supply-chain исправление (добавлено по фактическому EAS failure)

1. EAS preview обязан получать `EXPO_PUBLIC_YANDEX_MAPKIT_API_KEY` только через защищённое EAS environment. В `preview` не допускается пустой список variables перед запуском native build. Значение ключа не хранить в git, issue, логе или артефакте отчёта.
2. Release Gradle guard обязан принимать два и только два доверенных источника подписи: локальные `URTRUCK_UPLOAD_*` properties либо release signingConfig, который инжектирует EAS. Debug fallback допустим только с явным QA flag и никогда не подходит для production/Play.
3. Перед сборкой: проверить наличие переменной по имени без вывода значения, проверять signing path dry-run.
4. После сборки: forensic-проверка APK (package/versionCode/certificate/config/MapKit presence) до установки.
5. Фактический сбой build `121d82ca-ba18-4879-a0c8-af0657135fcc`: signing guard не распознал уже инжектированную EAS release подпись. Код исправлен; этот build не имеет artefact и не устанавливался.