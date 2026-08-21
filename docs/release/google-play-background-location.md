# Google Play — активный рейс и фоновая геолокация Android

> Каноническая release-документация. Состояние должно совпадать с `app.json`, `android/app/src/main/AndroidManifest.xml`, `src/utils/backgroundLocation.js` и disclosure UI.

## 1. Основная функция

**GPS-контроль активного грузового рейса.**

Водитель сам запускает функцию явным действием **«Начать рейс»** внутри принятой сделки. Во время активного рейса UrTruck собирает координаты автомобиля и передаёт их только участникам сделки, чтобы грузоотправитель видел движение груза на встроенной карте.

Для используемого UrTruck механизма `expo-location` background task Android требует foreground и background location permissions. Поэтому актуальная Android-сборка объявляет `ACCESS_BACKGROUND_LOCATION`, `FOREGROUND_SERVICE` и `FOREGROUND_SERVICE_LOCATION`, а `expo-location` настроен с `isAndroidBackgroundLocationEnabled: true` и `isAndroidForegroundServiceEnabled: true`.

Передача начинается только после пользовательского действия **«Начать рейс»** и успешного permission-flow. Передача прекращается после завершения или отмены рейса. Приложение не должно обещать продолжение tracking после принудительного завершения процесса пользователем/ОС: Expo background location на Android не гарантирует автоматический restart после termination.

## 2. Канонический пользовательский сценарий Android

1. Войти в UrTruck как водитель.
2. Открыть принятую сделку через любой вход: Сделки / Груз / Рейс / deep link.
3. Нажать **«Начать рейс»**.
4. До любого Android permission prompt UrTruck показывает prominent disclosure **«Отслеживать рейс»**.
5. Disclosure прямо сообщает:
   - UrTruck собирает данные о местоположении автомобиля;
   - данные передаются грузоотправителю для live-карты рейса;
   - передача может продолжаться **в фоновом режиме**, когда приложение свёрнуто или не отображается;
   - передача прекращается после завершения или отмены рейса.
6. Водитель нажимает **«Разрешить и начать рейс»**.
7. UrTruck запрашивает foreground location.
8. После foreground grant UrTruck запрашивает background location. На Android 11+ системный flow может открыть настройки приложения для выбора **«Разрешить всегда / Allow all the time»**.
9. UrTruck повторно проверяет foreground + background grants.
10. Только после успешного permission-flow сделка может перейти `accepted → in_progress`.
11. Location foreground service/background task запускается только из видимого приложения после пользовательского действия.
12. Во время активного рейса координаты отправляются только по server-approved deal IDs.
13. После `completed` / `cancelled` tracking останавливается, а сервер перестаёт принимать новые точки по закрытой сделке.

## 3. Что запрещено в flow

- permission prompt при регистрации, логине или обычном открытии приложения;
- скрытый запрос background permission из background hook;
- перевод сделки в `in_progress` до успешного permission-flow;
- доступ к координатам постороннего пользователя;
- отдельные разные permission-flow для `ChatScreenV2`, `CargoDetailV2` и `TripDetailV2`;
- обещание, что tracking гарантированно продолжится после force-stop/termination;
- текст disclosure, который скрывает факт фонового сбора location data;
- публикация AAB с `ACCESS_BACKGROUND_LOCATION` без заполненной/актуальной Play Console declaration.

## 4. Канонический route-host

Все реальные входы в принятую сделку должны рендерить workspace только через:

`src/components/deal/DealWorkspaceRoute.js`

Он монтирует:

`DealLocationPermissionGate → DealWorkspaceScreenV2`

Прямой импорт `DealWorkspaceScreenV2` из других screen-файлов запрещён regression-тестом. Это исключает повторение бага `disclosure_host_unavailable` при входе через карточку груза или рейса.

## 5. Текст prominent disclosure

Источник истины: `src/components/deal/BackgroundLocationDisclosureModal.js`.

RU-смысл должен оставаться эквивалентным:

> Во время активного рейса UrTruck собирает данные о местоположении автомобиля и передаёт их грузоотправителю, чтобы он видел движение груза на карте.
>
> Геолокация может продолжать передаваться в фоновом режиме, когда приложение свёрнуто или не отображается на экране, через системный сервис активного рейса.
>
> Передача геолокации прекращается после завершения или отмены рейса.

Кнопки: **Разрешить и начать рейс** / **Не сейчас**.

Тот же смысл обязан быть синхронно сохранён в RU / EN / ZH / KK.

## 6. Google Play declaration

Background location является чувствительным разрешением. Перед загрузкой/публикацией сборки с `ACCESS_BACKGROUND_LOCATION`:

1. Play Console → **Policy / App content / Sensitive app permissions / Background location**.
2. Указать единственную core-функцию: **GPS tracking of an active freight trip initiated by the driver**.
3. Объяснить значимую пользу: грузоотправитель контролирует фактическое движение груза во время многодневной международной перевозки; функция является частью основного сценария сделки.
4. Указать, что tracking запускается только явным действием водителя **Start trip** и прекращается после завершения/отмены рейса.
5. Приложить видео фактического Android flow.
6. Убедиться, что privacy policy и store listing описывают background location тем же смыслом, без противоречий.
7. Проверить **все активные tracks**: старые APK/AAB тоже учитываются Play при проверке permissions.

Отдельно для Android 14+ проверить FGS declaration для service type `location` / `FOREGROUND_SERVICE_LOCATION`.

## 7. Видео для Google Play — до 30 секунд

Записывать на реальном Android release/release-like build с package `com.urtruck.app`.

1. **0–4 сек.** Показать принятую сделку водителя и кнопку **«Начать рейс»**.
2. **4–9 сек.** Нажать кнопку и полностью показать prominent disclosure UrTruck **до** Android runtime permission.
3. **9–14 сек.** Нажать **«Разрешить и начать рейс»**, показать foreground permission.
4. **14–19 сек.** Показать background permission/settings step и **«Разрешить всегда»**.
5. **19–24 сек.** Вернуться в UrTruck: статус активного рейса + встроенная карта + текущая позиция.
6. **24–28 сек.** Свернуть приложение и показать системное уведомление/location foreground service, затем вернуться в UrTruck.
7. **28–30 сек.** Показать, что live GPS продолжается; если помещается — завершение/отмена и остановку tracking.

Видео не должно быть снято на iOS и не должно показывать flow, отличающийся от текущего AAB.

## 8. Release checklist

- [ ] Manifest содержит `ACCESS_FINE_LOCATION`.
- [ ] Manifest содержит `ACCESS_COARSE_LOCATION`.
- [ ] Manifest содержит `ACCESS_BACKGROUND_LOCATION`.
- [ ] Manifest содержит `FOREGROUND_SERVICE`.
- [ ] Manifest содержит `FOREGROUND_SERVICE_LOCATION`.
- [ ] `app.json` содержит `isAndroidForegroundServiceEnabled: true`.
- [ ] `app.json` содержит `isAndroidBackgroundLocationEnabled: true`.
- [ ] Disclosure появляется только после **«Начать рейс»** у водителя.
- [ ] Disclosure появляется до Android runtime permission.
- [ ] Disclosure прямо говорит о collection + sharing + background use + stop condition.
- [ ] RU / EN / ZH / KK несут одинаковый смысл.
- [ ] При отказе сделка остаётся `accepted`.
- [ ] `in_progress` выставляется только после успешного foreground + background grants.
- [ ] `ChatScreenV2`, `CargoDetailV2`, `TripDetailV2` используют `DealWorkspaceRoute`.
- [ ] Background hook не открывает permission prompt самостоятельно.
- [ ] Foreground service впервые запускается только пока приложение visible.
- [ ] Завершение/отмена останавливает tracking.
- [ ] Посторонний пользователь не видит координаты.
- [ ] `npm run qa:gps-consent` — PASS.
- [ ] `node --test tests/frontend/test_android_background_location_disclosure.mjs` — PASS.
- [ ] Реальный Android: foreground denied / background denied / Allow all the time / settings recovery — проверены.
- [ ] Реальный Android: сворачивание + screen off + возврат — проверены.
- [ ] Проверен force-stop: приложение не обещает автоматическое продолжение после termination.
- [ ] Play Console Background location declaration заполнена и соответствует AAB.
- [ ] Play Console FGS location declaration соответствует AAB.
- [ ] Privacy policy и store listing описывают background location.
- [ ] Видео до 30 секунд записано на актуальном Android build.

## 9. Источники политики

Перед фактической отправкой в Google Play повторно сверить актуальные официальные страницы:

- Google Play Console Help: **Understanding location in the background permissions**.
- Google Play Policy: **Permissions for Foreground Services**.
- Android Developers: **Foreground service types — location** и ограничения запуска FGS из background.
- Expo Documentation: **Location → Background permissions**.

Не полагаться на старые комментарии/скриншоты Play Console: политика и интерфейс формы могут меняться.