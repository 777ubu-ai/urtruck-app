# UrTruck — candidate следующей версии, 15.10.2026

## PRE-FLIGHT

- Ветка: `fix/next-release-map-deal-ux-20261015`.
- Base/SHA: `9ac0b6200e1e91aa40b99cd1f4943062e2acc048` (точный HEAD до изменений).
- Known-good: frozen app candidate `9ac0…`; магазинные IPA 99/AAB 214116271 и текущая Apple submission вне этого worktree и не меняются.
- Scope: воспроизведение и минимальные клиентские исправления карты маршрута, статуса сделки/ошибок перехода и видимой отмены; без production writes, cleanup сделок, новых native/store builds.
- Защищаемые модули/контракты: Auth/profile, Chat/read cursor/attachments, push/outbox/unread, translations/voice, GPS/location permissions, участник/ownership checks, серверная FSM и SQLite business data. FSM: водитель `accepted→in_progress→at_border (международный)→delivered`; отправитель отдельно `delivered→received→completed`; отмена разрешена участнику только по серверному контракту.
- Dependency analysis: свежий Graphify AST-only на base SHA: 11,113 узлов / 25,282 связей, 1,223 исходных code files; SQL parser отсутствовал для 20 SQL files. Связанный hot path включает `DealWorkspaceScreenV2.js`, `TruckMap.native.js`, `TruckMap.web.js`, `routingAPI.js`, `geo.js`, `dealActionResolver.js`, `DealStatusTimeline.js`, `marketAPI.js`, `deal_room.py`, `deal_room_dal.py`, `marketplace.py`, unread/chat/push/GPS/i18n consumers. Граф создан до изменений; generated `graphify-out/` исключён из исходников.
- Baseline перед изменениями: 53 связанных frontend/unit checks PASS (deal workspace, routing lifecycle, timeline localization, unread/push contract, route metrics, workspace lifecycle, FSM status order); exact command и stdout сохранены в сессии. Это source-level baseline, не device acceptance.
- Источники визуального воспроизведения: фото `IMG_2254–IMG_2267` не присутствуют среди доступных файлов/вложений текущего checkout; поэтому их содержимое ещё не проверено. Сделка Ош→Поти кодом проверена: Ош имеет координату в `geo.js`, Поти есть в авторитетном `worldCities.js`/`geography.js`, но отсутствует в карте координат `geo.js`.
- План проверок: точечные geo/routing/UI regressions, связанные tests Chat/Push/i18n/GPS/FSM/attachments, затем применимые required CI и независимый review exact final SHA. Физические Android/iPhone проверки будут отмечены только при наличии устройства, установленного точного build и фактического evidence.
- Откат: отменить только собственные изменения этой ветки отдельным revert; не трогать frozen release/store artifacts, production, сделки/переписку/вложения и чужие worktrees.

## Подтвержденные до patch наблюдения

1. Ош→Поти теряет маршрутную точку: `src/utils/geo.js` содержит Ош, но не Поти. База городов содержит Поти (GeoNames Poti: latitude 42.14272, longitude 41.67384). `DealWorkspaceScreenV2` строит `routePoints` из `parseRouteCities`; если одной конечной точки нет, `TruckMap.native.js` получает менее двух точек и показывает `map_no_route_coordinates`, не отправляя road-route request.
2. Клиентский `changeDealStatus` показывает toast только если неуспешный ответ содержит HTTP `status`; затем безусловно refresh-ит deal/timeline. Сбой с `{ok:false}` без `status` останется тихим. Серверный FSM/actor guard уже обеспечивает отдельные `delivered` и `received`; не менять его.
3. Deal timeline API возвращает `actor_id`/`actor_role` и время события. `DealStatusTimeline` сейчас показывает actor только если сервер прислал display-name, а переход FSM записывает `actor_role` (`driver`/`client`). Это позволяет показать сторону, отменившую сделку, не раскрывая идентификатор.

Открытые утверждения фото о зависании native-карты и неотзывчивости кнопки, а также прочие визуальные/данные находки пока не доказаны устройством и не приписываются патчу.

## Изменения-кандидат

- `src/utils/geo.js`: добавлены координаты Поти из уже включённого набора GeoNames и английский alias. Ошибка маршрута Ош→Поти локализована до клиентского словаря координат; дорожная линия по-прежнему строится только из подтверждённой геометрии routing API.
- `src/screens/DealWorkspaceScreenV2.js`: любой явный `{ok:false}` от API перехода статуса теперь показывает причину/общую ошибку даже без HTTP `status`; состояние и события по-прежнему перечитываются с сервера. FSM, роль и подтверждение отправителя не изменены. Это исправляет тихий класс отказов, но ещё не доказывает первопричину неотзывчивого нажатия на телефоне.
- `src/components/deal/DealStatusTimeline.js`: для отмены при отсутствии display name показывается локализованная сторона по сохранённому `actor_role`; дата и время берутся из сохранённого `created_at`. Идентификатор аккаунта в UI не раскрывается.
- `src/utils/attachmentFilename.js`, `src/components/deal/DealAttachments.js`: percent-encoded UTF-8 декодируется один раз для display label/PDF suffix; некорректная последовательность или control chars оставляют безопасный исходный label. Подписанная ссылка и правила доступа не менялись.
- Tests: `tests/frontend/test_yandex_road_route.mjs`, `test_deal_workspace.mjs`, `test_deal_timeline_localization.mjs`, новый `test_attachment_filename_display.mjs`.

## Проверки после изменений

- Свежий Graphify AST-only на candidate working tree: 11,121 nodes / 25,301 edges; SQL parser отсутствовал для 20 SQL files. Generated graph удалён, в исходники не включён.
- Точечные suites: 63/63 PASS командой `node --experimental-loader ./tests/frontend/loader.mjs --test tests/frontend/test_attachment_filename_display.mjs tests/frontend/test_deal_workspace.mjs tests/frontend/test_routing_request_lifecycle.mjs tests/frontend/test_deal_timeline_localization.mjs tests/frontend/test_status_push_pro_filter_contract.mjs tests/frontend/test_route_metrics_truth.mjs tests/frontend/test_workspace_target_lifecycle.mjs tests/frontend/test_yandex_road_route.mjs tests/unit/dealStatusOrder.test.mjs`.
- `git diff --check`: PASS.
- Первоначальный full sweep/lint был заблокирован отсутствующими `node_modules`; затем зависимости штатно восстановлены через `npm ci --no-audit --no-fund` из существующего lockfile. После этого полный `npm run test:unit`: 1,190/1,190 PASS; `npm run lint`: PASS, parsed 500 active JavaScript files. `package-lock.json` не менялся, приложение не собиралось.
- Android OPPO PJB110 / ADB id `WGCA9PSGOFUOWC7D` доступен; нового candidate build на нём нет, поэтому физическое поведение не проверено. iPhone 15 Pro Max / CoreDevice `7B1F72C0-7AD0-5A77-ACFD-F6523CA3573B` имеет состояние `unavailable`. Booted iOS Simulator не заменяет требуемый физический iPhone.
- Ветка основана на exact `9ac0b6200e1e91aa40b99cd1f4943062e2acc048`; точные candidate commit/tree записываются во внешнем checkpoint после фиксации этой версии dossier. Release branch при readback осталась clean и на том же SHA.

## Оставшиеся доказательства / блокеры

- Не получены изображения `IMG_2254–IMG_2267`; повторно приложить оригиналы в доступный проектный checkout, чтобы сверить фактические экраны и указанные ID.
- Не выполнено native воспроизведение freeze карты, кнопки «Доставлен», перехода/отмены offline/reconnect, длинного ожидания и возврата; нужны точные app build/source, роль и deal IDs с телефонов. Ош→Поти имеет исправленный недостающий пункт источника, но нет фактического ответа routing provider на этот рейс.
- Отмена обеими ролями не проигрывалась на выделенных тестовых сделках; patch показывает уже сохранённые event fields, а не доказывает наличие event у каждой старой сделки.
- Дубли `report-5068.pdf` невозможно классифицировать без attachment/message IDs; вес `10000 т` нельзя исправлять до проверки фактического ввода/значения API; пустые GPS/ETA требуют сопоставить состояние рейса и tracking API. Никакие данные не менялись.
- Разметка карточек/подписанный вход в статусы не менялись до доступного визуального evidence и проверки размера шрифта.
- Производство, deploy, IPA/AAB, Apple submission и Play tracks этим кандидатом не менялись.
