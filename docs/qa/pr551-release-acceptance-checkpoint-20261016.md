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
