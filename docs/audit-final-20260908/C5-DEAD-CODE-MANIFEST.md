# C5 — DEAD-CODE DEPENDENCY GRAPH (baseline c4501ece, read-only)

Handoff для Claude (B1 — перенос тестов на живые экраны; B9 — финальный manifest удаления).

## Метод

Статические импорты по src/, App.js, tests/, qa/, scripts/, .maestro/; динамические import()/require() по src/ и App.js (динамических импортов экранов в проекте НЕТ — все import() — expo-/RN-модули и ассеты); все Stack.Screen-регистрации и navigate(); fs.readFileSync-читатели исходников.

## Ключевой факт о маршруте «Chat»

AppNavigator.js:188,249,260 — route `Chat` везде смонтирован как ChatScreenV2. ChatScreenV2.js:94-113 **всегда** рендерит DealWorkspaceRoute; легаси ChatScreen не импортируется ни в одной ветке. Комментарии «may keep using the legacy ChatScreen» (ChatScreenV2.js:10-11,27) устарели.

## Таблица вердиктов

| Файл | Строк | Импорты в prod | Route | Вердикт |
|---|---|---|---|---|
| src/screens/ChatScreen.js | 2814 | 0 | нет | **dead (prod) / test-only** — 8 тестовых читателей |
| src/screens/DealWorkspaceScreen.js | 1993 | 0 (сам — обёртка над DealWorkspaceRoute :33,:225) | route DealWorkspace не существует | **definitely dead**, тестовых читателей 0 |
| src/screens/QueueScreenCarousel.js | 859 | 0 | нет | **dead (prod) / test-only** — 1 qa-читатель |
| src/screens/QueueScreenLazy.js | 564 | 0 (QueueScreen.js:1 реэкспортирует LazyV2) | нет | **dead (prod) / test-only** — 3 qa/test читателя |
| src/screens/ChatsListLegacyScreen.js | 722 | ChatsListScreen.js:3 | route ChatsList (AppNavigator.js:189,263; App.js:139 push-tap) | **PRODUCTION LIVE** — НЕ удалять |
| src/components/QuickPhrases.js | — | единственный импортер ChatScreen.js:40 | — | dead (prod), каскадом за ChatScreen |
| src/screens/registration/SelfieStepScreen.js | — | 0 | не смонтирован (AppNavigator.js:285-288) | **definitely dead** / блокер — release_static_gate.sh |
| src/screens/registration/VehiclePhotosScreen.js | — | 0 | не смонтирован | **definitely dead** / блокер — release_static_gate.sh |

## Тесты-блокеры удаления (fs.readFileSync на мёртвый файл → упадёт сразу)

| Тест | Строка | Читает | Ассертит |
|---|---|---|---|
| tests/frontend/test_map_chat_integration.mjs | :4 | ChatScreen.js | openDealMap → TrackTruck, testID deal-track-truck / deal-open-driver-route |
| tests/frontend/test_deal_room_auto_map.mjs | :5 | ChatScreen.js | fullscreen-map контракт |
| tests/frontend/rc1_deal_fsm_static.mjs | :5 | ChatScreen.js | FSM deal-actions (at_border/delivered/in_progress, AppConfirmModal, startTrip+ensureBackgroundLocationPermission) |
| tests/frontend/rc1_deal_fsm_static.test.mjs | :5 | ChatScreen.js | дубль FSM-контракта |
| tests/frontend/test_shipper_inprogress_auto_map.mjs | :3 | ChatScreen.js | shipper CTA → полноэкранная карта |
| tests/frontend/test_vehicle_weight_routing.mjs | :45 | ChatScreen.js | deal.trip_capacity_tons → RouteMap без cargo_weight_tons fallback |
| tests/frontend/test_strict_locale_owned_content.mjs | :16 | QueueScreenLazy.js | localizeCheckpointName; ассерт смотрит в ЛЕГАСИ, живой аналог — QueueScreenLazyV2 |
| qa/utils/borderDashboardSmoke.js | :5 | QueueScreenLazy.js | wrapper содержит «./QueueScreenLazy» (substring совпадает с LazyV2 — проходит случайно), карусель/chips/booking testID'ы |
| qa/utils/zhLocalizationSmoke.js | :109,:127,:141 | ChatScreen.js, QueueScreenLazy.js | AppConfirmModal в ChatScreen; ZH-fallback-leak; border-localization |
| qa/utils/geographySmoke.js | :123 | QueueScreenCarousel.js | COPY KK/ZH — stale, реализация в QueueScreenLazyV2 |
| qa/utils/shareLocaleSmoke.js | :54 | ChatScreen.js | share-copy локали |
| scripts/release_static_gate.sh | :52,:54,:87,:89 | SelfieStepScreen.js, VehiclePhotosScreen.js | babel-parse gate + PII console-log gate — удаление сломает release-гейт |

Не блокеры: tests/e2e/cyrillic-leak.spec.js:55-63 ходит по каталогу динамически; tests/e2e/*chat*.spec.js — runtime-прогон живого route Chat (ChatScreenV2→DealWorkspaceRoute).

## Уникальная product-логика ChatScreen.js, которой НЕТ в DealWorkspaceScreenV2.js

Подтверждено grep'ом: в V2 нет ни одного совпадения `BidModal|Bargain|bid|transcribe|QuickPhrases`.

1. **Голосовая транскрипция** — chatAPI.transcribe вызывается только ChatScreen.js:975 (toggleVoiceTranscript :964-997; стейты :712-713). В V2 нет. API chatAPI.js:132 живой.
2. **Контекстные быстрые фразы** — QuickPhrases (рендер :2551, attach-панель :2691-2695, ключ quick_phrases используется только здесь). В V2 нет.
3. **Торг внутри чата** — BargainCard (:2290), in-chat BidModal (:1282-1356), accept-bid confirm (:1342-1356, canAcceptBid :1337), плитка «Своя цена» (:2670-2674). В V2 нет. Каскад: BargainCard импортируется ТОЛЬКО ChatScreen.js:48 → удаление ChatScreen делает components/deal/BargainCard.js мёртвым. BidModal остаётся живым (CargoDetail.js:26).
4. DealRoomCard (DealRoom.js:64) используется только ChatScreen.js:2301 — станет висячим экспортом (DealRoom.js сам жив: accentFor нужен ChatsListLegacyScreen, DealsScreen, DealAttachments, DealStatusTimeline).

Что в V2 есть и совпадает: голосовые (voiceRecorder + VoiceMessageBubble :47-48,:879-941), документы (expo-document-picker :24,:826-852 — в легаси ChatScreen документов нет), перевод (chatAPI.translate V2 :547,:740), attach-location/call (COPY :85-136).

## Прочие факты

- Navigate('Selfie…'/'VehiclePhotos'/'DealWorkspace'/'QueueScreenLazy'/'QueueScreenCarousel') в проекте нет (grep — 0).
- ChatsListLegacyScreen — читается test_deals_whatsapp_floating_header.mjs:7 (не блокер).
- docs/APP_OVERVIEW_FOR_DEVELOPERS.md:137 фиксирует SelfieStep/VehiclePhotos как «сохранены, но не смонтированы» — синхронизировать при удалении.

## Продуктовое решение, блокирующее удаление ChatScreen.js

Торг-в-чате и голосовая транскрипция: портировать в V2 или признать отказанными фичами — вне кода. До решения удаление ChatScreen.js = потеря фич (если не портировать) либо чистая зачистка (если портировать). Статус: **требует решения владельца продукта**.

## BLOCKED

- Prod-usage (OTA/code-push, server-driven routing) — нет доступа к прод-аналитике/краш-логам. Локально доказано: ни один JS-путь в репозитории эти файлы не импортирует.
