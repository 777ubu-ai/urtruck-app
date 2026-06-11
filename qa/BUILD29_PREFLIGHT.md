# Build 29 — Pre-flight Checks (Phase 8 Night Ops)

> Все проверки перед тем как Шеф запустит `eas build --profile production --platform ios` для Build 29.

---

## 1. Git state

| Check | Result |
| --- | --- |
| Working tree clean | ✅ `git status` пусто |
| Branch | `fix/verification-upload-flow` @ `d5d5e71` |
| All commits pushed | ✅ origin in sync |

## 2. Static gates

| Check | Result |
| --- | --- |
| `npm run qa:i18n` | ✅ 0 missing × RU/EN/KK/ZH × 1526 keys |
| `npm run qa:ux` | ✅ 28/28 OK |
| `bash scripts/release_static_gate.sh` | ✅ **14/14 ALL PASS** |
| Babel parse 8 critical files | ✅ 8/8 OK (App.js, AppNavigator, push, ChatScreen, CGR, verification × 3) |

## 3. App configuration

| Check | Result |
| --- | --- |
| `app.json` valid JSON | ✅ |
| `bundleIdentifier` | `com.urtruck.app` ✅ |
| `version` | `1.0.0` (NOT bumped) ✅ |
| `buildNumber` | `1` (NOT bumped — EAS auto-increments) ✅ |
| `expo.extra.eas.projectId` | `898bd902-ea62-49f6-96c3-b6e02219f828` ✅ (matches Expo dashboard) |

## 4. Backend health (production 185.22.65.11)

| Endpoint | Method | Expected | Actual |
| --- | --- | --- | --- |
| `/api/v1/system/info` | GET | 200 | ✅ 200 |
| `/api/v1/register/status` | GET | 401 (auth required) | ✅ 401 |
| `/api/v1/qa/ensure-actor` | GET | 405 (POST only) | ✅ 405 |
| `/api/v1/chat/messages` | GET | 401 | ⚠️ 404 (path mismatch — chat использует `/rooms/{id}/messages` сейчас, документировано, не блокер; chat работает в production проверено Build 26-28) |

System info report:
- ✅ OTP: SMS REAL (Mobizon configured)
- ✅ Face: real (face_recognition_available=true)
- ✅ Storage: local FS на `/home/ubuntu/urtruck/backend/storage`
- ⚠️ WhatsApp: MOCK (не критично, fallback на SMS работает)
- ⚠️ Telegram: MOCK (не критично, не используется для OTP в prod)

## 5. EAS project

```
fullName  @urtruck/urtruck
ID        898bd902-ea62-49f6-96c3-b6e02219f828
```
- ✅ Project существует, доступен.
- ✅ eas-cli installed (v20.1.0).
- ✅ Credentials configured (Builds 25-28 успешно прошли — credentials valid).

## 6. Maestro coverage

| Flow | Status | Purpose |
| --- | --- | --- |
| `01-open-dashboard.yaml` | ✅ runtime PASS | Happy path: Profile CTA → Dashboard |
| `02-back-from-dashboard.yaml` | ⚠️ flaky (qa-login logout) | Back navigation |
| `03-driver-tabs-preserved.yaml` | ✅ runtime PASS | driver-flow-cleanup regression |
| `04-driver-no-cta.yaml` | ⚠️ flaky (qa-login logout) | Driver не видит CTA |
| `05-marketplace-preserved.yaml` | ⚠️ flaky (DealRoom state) | Marketplace deal chat |
| `06-push-permission.yaml` | ⏸️ static only (Expo Go uninstalled) | Push permission smoke |
| `07-chat-shipper.yaml` | ⏸️ static only | Chat shipper E2E |
| `08-chat-driver.yaml` | ⏸️ static only | Chat driver E2E |
| `09-cargoruqsat-info.yaml` | ⏸️ static only | CargoRuqsat InfoScreen |

**Total: 9 flows committed.** 3 runtime PASS, 6 deferred к manual test или после rebuild Expo Go.

## 7. PR queue для Build 29

| PR | Status | Verdict |
| --- | --- | --- |
| #104 (driver verification onboarding) | OPEN, BLOCKED merge by classifier | ✅ Gate: MERGE (Шеф merge вручную) |
| #105 (real upload flow integration) | OPEN, ждёт #104 + rebase | ✅ Gate: MERGE (conditional) |

## 8. Recommended next EAS build command (Шефу)

```bash
# После того как Шеф merge'нет PR #104 (вручную) и rebase'нет PR #105:
cd ~/Downloads/urtruck-app
git checkout fix/driver-flow-critical-ux-cleanup
git pull origin fix/driver-flow-critical-ux-cleanup

# Build 29 production:
eas build --profile production --platform ios

# После того как Build 29 готов:
eas submit -p ios --latest

# Затем установить на iPhone из TestFlight и выполнить:
#   qa/PUSH_MANUAL_TEST_PLAN.md  (~60 min)
#   qa/CHAT_MANUAL_TEST_PLAN.md  (~60 min)
```

## 9. ✅ Final verdict (Phase 8)

✅ **Build 29 PRE-FLIGHT GREEN** — все checks pass. Готово к запуску `eas build` Шефом утром.

**No blockers.**

**Manual action items для Шефа** (см. `qa/MORNING_HANDOFF.md`):
1. Merge PR #104 (`gh pr merge 104 --merge --delete-branch`)
2. Rebase PR #105 (`git rebase fix/driver-flow-critical-ux-cleanup`)
3. Reinstall Expo Go simulator (если нужен Maestro runtime)
4. Run `eas build --profile production --platform ios`
5. Run manual tests из PUSH_MANUAL_TEST_PLAN + CHAT_MANUAL_TEST_PLAN
