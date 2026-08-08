# RELEASE QA — REAL DEVICE MATRIX (STEP 5, 08.08.2026)

Легенда статусов:
- **CI** — проверяется в GitHub Actions на каждый PR.
- **AUTO** — проверено локальной automation/тестом/статическим контрактом (не на устройстве).
- **DEVICE** — требует реального iPhone (TestFlight) / Android (internal). **NOT VERIFIED** до физического прогона.

Автоматика на момент отчёта (proof): backend **32/32** файла, frontend **13/13**,
pure-unit **2/2**, три CI-контура GREEN.

## Release-конфиг (перепроверено)

| Пункт | Статус | Где |
|---|---|---|
| iOS version/build 1.0.5/2 (app.json↔Info.plist↔pbxproj) | **CI** | `qa:release-version` |
| Android versionName 1.0.5 | **CI** | `qa:release-version` |
| iOS `UIBackgroundModes: location` | **CI** | `qa:release-version` (GPS-parity) |
| Android `ACCESS_BACKGROUND_LOCATION`+`FOREGROUND_SERVICE_LOCATION` | **CI** | `qa:release-version` |
| `aps-environment: production` | **AUTO** | Info.plist/entitlements |
| deep-link scheme `urtruck://` (iOS+Android) | **AUTO** | Info.plist/AndroidManifest |
| push tap-routing (url→entity) | **AUTO** | `App.js:parseNotifUrl/navigateFromUrl` (cargos/trips/deals/chats) |
| universal links (associatedDomains/AASA) | **NOT PRESENT** | отсутствуют — только custom scheme |

## PUSH (обе роли, iOS + Android)

| Сценарий | CI/AUTO | DEVICE |
|---|---|---|
| token registration при логине (projectId, 409 conflict) | AUTO (`src/utils/push.js`, backend `test_push_token_security` 11) | NOT VERIFIED |
| foreground push | — | NOT VERIFIED |
| background push (свёрнуто) | — | NOT VERIFIED |
| terminated push (закрыто) | — | NOT VERIFIED |
| события: message/bid/accepted/status/attachment/counter | AUTO (backend отправка) | NOT VERIFIED (реальная доставка) |
| tap → правильный entity (cargo/trip/deal/chat) | AUTO (`navigateFromUrl`) | NOT VERIFIED |
| token rebind при смене аккаунта | AUTO (`test_push_anonymous_ownership_guard`, `_resolve_ownership`) | NOT VERIFIED |
| account isolation (logout A → login B, push A не приходит B) | AUTO (`test_logout_push_cleanup`) | **NOT VERIFIED (обязателен device-proof)** |

## GPS (active-trip)

| Сценарий | CI/AUTO | DEVICE |
|---|---|---|
| start при accepted/in_progress/at_border | AUTO (`AppNavigator IN_WORK`, `useDealLocationBroadcast`) | NOT VERIFIED |
| stop при delivered/completed/cancelled | AUTO (completed вне IN_WORK) | NOT VERIFIED |
| stop при logout | AUTO (`backgroundLocation` cleanup) | NOT VERIFIED |
| background mode работает | CI (perms present) | **NOT VERIFIED** |
| Android 13 разрешение POST_NOTIFICATIONS/location | AUTO (manifest) | NOT VERIFIED |
| Android 14+ foreground-service-location без краша | CI (perm present) | **NOT VERIFIED (краш-риск проверить)** |
| iOS background location indicator | AUTO | NOT VERIFIED |
| permission denied/revoked — нет краша | — | NOT VERIFIED |
| двойной watcher не стартует | AUTO (`hasStartedLocationUpdatesAsync` guard) | NOT VERIFIED |

## DEAL (cargo→…→completed)

| Сценарий | CI/AUTO | DEVICE |
|---|---|---|
| cargo→bid→counter→accept | CI (`test_bid_actions` 35) | NOT VERIFIED |
| chat только post-accept | CI (bid pending → chat blocked) | NOT VERIFIED |
| status FSM accepted→in_progress→at_border→delivered→completed | CI (`test_deal_status_actor_fsm` 26) | NOT VERIFIED |
| **shipper completed после delivered** (P0-1 fix) | CI (8 новых тестов) | **NOT VERIFIED (ключевой сценарий на устройстве)** |
| driver не может completed / shipper не может delivered | CI | NOT VERIFIED |
| completed в табе «Завершённые» + timeline | CI/AUTO (`COMPLETED_STATUSES`, timeline event тест) | NOT VERIFIED |
| идемпотентность/конкурентные тапы | CI (concurrent tests) | NOT VERIFIED |
| documents: загрузка/открытие/подпись | AUTO (backend fallback тест) + PARTIAL | **NOT VERIFIED** |

## REGISTRATION / AUTH

| Сценарий | CI/AUTO | DEVICE |
|---|---|---|
| OTP verify (валид/неверный/истёкший/replay/брутфорс/DB-блок) | CI (`test_otp_verify_security` 7) | NOT VERIFIED |
| email signup | AUTO (email_verify эндпоинт) | NOT VERIFIED |
| **shipper: обязательные name+phone; driver: phone — даже при email signup** | AUTO частично (ProfileV2 требует name+city) | **NOT VERIFIED — проверить, что phone обязателен на email-пути обеих ролей** |
| OTP/email return (возврат из Mail → focus/quickbar) | — | **NOT VERIFIED (device)** |
| session persistence после cold-start | AUTO (`test_storage_remove_by_prefix`, SecureStore) | **NOT VERIFIED** |
| cold-start без вылета | — | **NOT VERIFIED** |

## Строгая real-device матрица прогона (для владельца)

**iOS (TestFlight) × {shipper, driver}** и **Android internal × {shipper, driver}** — прогнать каждую строку разделов PUSH/GPS/DEAL/REGISTRATION выше, отметить PASS/FAIL. Особое внимание (высокий риск на устройстве):
1. Android 14+ старт рейса — фоновый location-сервис без `SecurityException`.
2. iOS фоновый GPS при свёрнутом приложении.
3. Push terminated-state + tap-routing в правильный экран.
4. Account isolation: logout A → login B → пуш для A не приходит B.
5. shipper completed → сделка закрывается, попадает в «Завершённые».
6. phone обязателен для обеих ролей при email-signup.

## Что требует владельца / устройства / Store (STEP 5 remaining)

- Реальный прогон матрицы выше на iPhone (TestFlight) и Android (internal) — **DEVICE**.
- TestFlight-сборка (`eas build -p ios --profile production` + submit) — нужен Apple-доступ.
- Android internal (`deploy-play.yml` internal track) — нужен Play-доступ + не-скомпрометированный upload key.
- Всё из merge-gate: FILE_SIGNING_KEY на сервере, Supabase private apply, Android Play reset — **EXTERNAL**.

Никакой пункт не помечается REAL DEVICE VERIFIED без физического proof.
