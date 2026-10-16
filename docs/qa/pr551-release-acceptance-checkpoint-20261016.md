# PR551 acceptance checkpoint — 2026-10-16

Updated 2026-10-16 17:39 UTC / 22:39 Asia/Almaty. Documentation-only checkpoint branch based on `main` at `d6759c76ca74abc00a09cb210f235f33b55f64c9`; no production, store, or user data was changed.

## Frozen app candidate and prior device evidence

- PR551 app source remains `f8cf82f30c96cfd35bffe7b2fdc67c7c0fb0d227` (tree `c44f8f6b1c76c6e4bd5db202b31cb75cace27bac`). The exact-source QA2 APK from run `38928961827`, artifact `12058647108`, has SHA-256 `ae06d4c70e0d4ccd277584fc2495b42643b5465879642b8ec6b62dba32743dd0`, package `com.urtruck.app.qa2`, versionCode `211040107`, signer fingerprint `fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c`.
- Fresh ADB read: Xiaomi `BUA6JB99T465Q49X` / model `25078RA3EY`; OPPO `WGCA9PSGOFUOWC7D` / model `PJB110`.
- The existing full `main:app` lab is exact f8 source on Mac port 8005; device reverse maps device port 8002 to host port 8005. The shortened 8002 lab and the fb23-based 8004 lab are not acceptance environments for f8. Prior two-device evidence is limited: bid/accept/deal/text/PDF persisted; PDF sender-to-receiver hash matched; image recipient-open, complete FSM, real notification delivery, full GPS and device performance remain unverified. OPPO status CTA was observed behind Android navigation; PDF-preview close behavior remains unresolved.

## PR555 safe-area fix

- PR555 source app diff `b5bb015f4dfc98ebdac6a7cc15486983865cf1ba` adds bottom inset padding to the deal-status panel. The follow-up test-only commit is `fb0036eab9c2622d1b606989facb05fc65b54845`; app code is unchanged between these two commits.
- The test now asserts rendered `paddingBottom`: inset 34 produces 46 and inset 0 produces 12. Targeted frontend test passed 5/5; diff check passed. Independent review on f8 → fb0036 passed. Required PR555 CI run `38939195333` passed backend, frontend/lint/build, and mandatory web E2E.
- QA APK workflow run `38938452127` completed successfully from app source `b5bb015f4dfc98ebdac6a7cc15486983865cf1ba`; artifact ID `12063605914`, name `UrTruck-apk`, compressed size 125,410,034 bytes. Download is still running slowly; APK hash, signer and device install are not yet verified. No device update has been performed in this turn.

## TestFlight tooling and approval

- PR553 merged by the normal GitHub path. Tooling head was `02f5fb9508fae6a4c90c49f41c713ed34d7b35bd`; merge commit and current `main` are `d6759c76ca74abc00a09cb210f235f33b55f64c9`.
- The workflow scopes secrets to consuming steps and pins EAS CLI `25.0.0`. Targeted workflow-contract test passed; independent review and Security Review returned no findings. CI runs `38939115496`, `38939115191`, and `38939115237` completed successfully.
- Current App Store Connect TestFlight UI readback shows iOS build 99 as the latest visible 1.0.9 build. The TestFlight workflow was dispatched with `expected_tooling_sha=d6759c76ca74abc00a09cb210f235f33b55f64c9`, `asc_max_ios_build=99`, and `upload_mode=upload_testflight`. Quality gate passed in run `38940764451`; `build-and-upload` is `waiting` on protected Environment `production`. No IPA was built or uploaded yet. Approval must occur through the normal Environment reviewer; do not self-approve or bypass.
- Approval task: https://github.com/777ubu-ai/urtruck-app/actions/runs/38940764451/job/117107642768. Required reviewer when run actor is `777ubu-ai`: `arbeiterschaft02-prog`.

## Google Play and remaining release evidence

- Existing AAB remains versionCode `214323606`, SHA-256 `e1b44daf7ee2b38d5c94fce52cd95a011a9b323843598835fb4b409b9e443767`; Internal edit readback previously recorded completed. Google-generated APK readback confirmed the bundle exists, but Xiaomi still offered `213798673` and OPPO availability remained region/account-limited. Exact final AAB DEX verification is `AAB_FINAL_DEX_PENDING`: the only local AABs do not match, and the bounded download of final artifact ended HTTP 503 due to account egress limit; no repeated download attempted.
- Play readback PR554 remains draft; current evidence does not establish Google Group membership for an individual tester or explain the old offer. No accounts/countries/tester settings were changed.
- `UPGRADE_PENDING`: no authorized protected copy of a representative old QA database and matching storage is available. Synthetic persistence evidence does not close this check.
- Real email/QQ delivery, physical iOS, actual push delivery on devices, complete deal journey, image recipient rendering, and final AAB DEX remain pending. No public release, production deploy, App Store submission change, or Google Play Production promotion was performed.

## PR555 APK installation readback

Updated 2026-10-16 17:55 UTC / 22:55 Asia/Almaty.

- Artifact `12063605914` from run `38938452127` downloaded and verified. APK SHA-256: `4a4583501fe0f452ac06c23f72f0d7a10a1b9b62d4945e3f7456bd7a44f8b6b6`. Package `com.urtruck.app.qa2`, versionName `1.0.9-qa2`, versionCode `211040107`; embedded QA config resolves API to `http://127.0.0.1:8002`; signer SHA-256 `fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c`. Workflow artifact checks, including merged Firebase service and app-owned DEX classes, completed successfully.
- `adb install -r` succeeded on Xiaomi `BUA6JB99T465Q49X` and OPPO `WGCA9PSGOFUOWC7D`; no uninstall or data clear. QA `firstInstallTime` stayed `2026-08-31 13:34:28` on Xiaomi and `2026-10-07 13:39:35` on OPPO. Production packages remained installed and unchanged: Xiaomi versionCode `10`; OPPO versionCode `214116271`, with their prior install/update timestamps unchanged.
- Xiaomi launched the QA app and displayed its existing shipper “Мои грузы” screen. OPPO app process remained alive and the sampled logcat window contained no matching fatal-exception lines, but the display is on Android keyguard; a normal swipe did not expose the app. No lock bypass was attempted. The driver status-button hit-target and confirmation flow are therefore `DEVICE_PENDING` on OPPO; Xiaomi is the shipper role and cannot validate the driver CTA.
- No new filesystem or device data was cleared. Lab health returned HTTP 200 on `127.0.0.1:8005`; both ADB reverse mappings remain `tcp:8002 -> tcp:8005`. Existing backend logs contain long-lived polling counts, so they are not a clean timed push-loop measurement and no new push acceptance is claimed.

## Physical continuation — 2026-10-16 23:07 Asia/Almaty

- Fresh `adb devices -l`: Xiaomi `BUA6JB99T465Q49X` / `25078RA3EY` and OPPO `WGCA9PSGOFUOWC7D` / `PJB110`, both ADB-authorized. Both still have the same QA APK installed from source `b5bb015f4dfc98ebdac6a7cc15486983865cf1ba`, APK SHA-256 `4a4583501fe0f452ac06c23f72f0d7a10a1b9b62d4945e3f7456bd7a44f8b6b6`. Production packages were not changed.
- Lab remains full `main:app` from frozen PR551 source on `127.0.0.1:8005`, health HTTP 200, isolated DB/storage; both devices retain reverse `tcp:8002 -> tcp:8005`.
- Xiaomi opened the existing synthetic in-progress deal `0db6581b-c203-422a-ad0e-7d93afb6b473` through UI. Status history rendered; the shipper view has no driver delivery CTA, so driver transition remains untested on this device.
- Map UI showed `Маршрут по дороге временно недоступен`; Retry, Back, and Expand controls remained visible. Ordinary Back returned to the deal workspace with chat intact. This proves navigation recovery for this control route only; it is not route-success evidence.
- PDF open rendered the one-page QA PDF. On this APK, the top title and close control overlap the Android status-bar region; close target bounds were only 34 px wide. Tap centered over the status-bar overlap did not close the preview; ordinary tap in the lower visible portion did close it. This is an observed UI defect.
- Minimal follow-up for PR555 committed as `1ef3c1d2fa594d2b1f6a1b747b896ff08a4fc0be` (base remains `f8cf82f30c96cfd35bffe7b2fdc67c7c0fb0d227`): use `react-native-safe-area-context` for the PDF modal and a 44×44 dp accessible close target. Targeted `test_deal_attachment_viewer.mjs` passed 5/5 and `git diff --check` passed. CI run `38944431461` is in progress (frontend/lint/build job passed; backend and mandatory web E2E still running). Independent review selection is pending; do not transfer the previous review to this new diff.
- The new candidate has not yet been built or installed. The currently installed APK is therefore not evidence for commit `1ef3c1d2` or for the PDF fix. OPPO is awake but remains on Android Keyguard (`NotificationShade`, `mShowingDreamingLockscreen=true`); no PIN/biometric bypass was attempted. The owner must unlock it on-device.
- Evidence screenshots from the prior APK are saved under `qa-evidence/release-consolidation-20261014/pr551-physical-readback-20261016/`: PDF overlap, close result, and map error/back controls. No real account data or production state was used.

## Superseding candidate and restart evidence — 2026-10-16 23:10 Asia/Almaty

- PR555 remains draft/open, exact base `f8cf82f30c96cfd35bffe7b2fdc67c7c0fb0d227`, current head `227ab583f1fca4064442356f62ec3b9d21063c6d`. This includes the original status-panel bottom inset and the PDF-modal fix. The previous passing CI at head `1ef3c1d2` is stale after the SafeAreaProvider correction and is not used; current required CI is run `38945022343`, still in progress. Review choice is pending from the owner; no APK has been built for `227ab583`.
- The PDF modal is wrapped in its own `SafeAreaProvider` because the app's existing fullscreen LocationPicker documents that RN Modal renders in a separate native hierarchy and needs a local provider. The close control now has minimum 44×44 dp and explicit button semantics. This directly addresses the observed status-bar overlap and narrow hit area; physical verification remains required on a new APK.
- On Xiaomi, force-stop/launcher relaunch without clearing app data returned to the signed-in QA app. Through the UI, the existing QA deal `0db6581b-c203-422a-ad0e-7d93afb6b473`, both chat messages (`QA551 text from Xiaomi`, `QA551 reply from OPPO`), `UrTruck-QA551-20261016.pdf`, and the existing `Рейс начался` event remained visible. This is limited persistence evidence for this QA session and deal; it does not cover profile/publication/favorites, ownership-denial, or upgrade from a representative old DB.
- Xiaomi map recovery and post-restart chat/PDF screenshots were captured under `qa-evidence/release-consolidation-20261014/pr551-physical-readback-20261016/`; screenshot evidence hash for the post-restart chat is `e55a0bb3a99d16819e2abb0fa42c3b43dc44eafef05de359601c0b464f4777ec`.

## Cross-device QA deal progression — prior APK only — 2026-10-16 23:16 Asia/Almaty

- Owner unlocked OPPO normally. No lock/PIN bypass was used. Both phones were confirmed on package `com.urtruck.app.qa2`, same installed APK source `b5bb015f4dfc98ebdac6a7cc15486983865cf1ba`, SHA-256 `4a4583501fe0f452ac06c23f72f0d7a10a1b9b62d4945e3f7456bd7a44f8b6b6`; Xiaomi acted as QA551 Shipper, OPPO as QA551 Driver. This state is isolated QA data only.
- On OPPO, the driver status panel showed the next action `Прибыл на границу` fully above Android system navigation (node bounds `[42,2058][1038,2208]` in 1080×2400). One ordinary tap produced the border status. `Доставлен` opened the confirmation dialog; cancel left the status at border. A second ordinary tap and confirmation changed the driver-side UI to `Доставлен — ожидается подтверждение получения`.
- Xiaomi then showed the same deal `0db6581b-c203-422a-ad0e-7d93afb6b473` and a separate shipper action `Подтвердить доставку`. The action opened a confirmation; confirming it showed `Получение подтверждено` and `Груз доставлен`, then a separate `Завершить сделку` confirmation. After confirmation both views showed `Сделка завершена`; the deal appeared under `Архив (1)`. OPPO displayed the rating prompt; it was dismissed with `Не сейчас` and no rating was submitted.
- OPPO opened the received QA PDF to page `1/1`; a received image bubble rendered an image (the fixture itself is a screenshot of the app login screen, not a transport/photo-of-load claim). For the PDF close control, a tap at its center in the overlapped system area did not close it, while a tap lower in the visible area did. This independently reproduced the safe-area defect on both devices before the PDF fix.
- This cross-device route/status/archive/file evidence is tied only to the prior APK hash above. It does not transfer to final head `227ab583`, not yet built. The full acceptance remains blocked on independent review, CI already passes for `227ab583` but review is pending, exact new APK build/install, and final-SHA critical retest on both devices. No push receipt, external email, 1000+1000 phone feed, performance/memory matrix, production compatibility, TestFlight upload, Play update resolution, or old-DB upgrade was established here.

## Current gate after cross-device run — 2026-10-16 23:17 Asia/Almaty

- PR555 title/body were refreshed to describe both status-panel and PDF safe-area fixes and to distinguish prior-APK observations from unverified new code.
- PR555 exact head `227ab583f1fca4064442356f62ec3b9d21063c6d`, base `f8cf82f30c96cfd35bffe7b2fdc67c7c0fb0d227`; required CI run `38945022343` completed SUCCESS for backend, frontend/lint/build, and mandatory web E2E.
- The owner has not yet selected the requested independent reviewer type (Security Review or Bugbot). Do not build/test the next candidate until that review is performed; prior review at `fb0036e` does not cover the PDF change.
- No QA APK exists for head `227ab583` yet. Installed devices remain on APK source `b5bb015f4dfc98ebdac6a7cc15486983865cf1ba` / SHA-256 `4a4583501fe0f452ac06c23f72f0d7a10a1b9b62d4945e3f7456bd7a44f8b6b6`. The newly committed PDF fix therefore remains `CODE_CHECKED/CI_PASS`, physical `PENDING`.
