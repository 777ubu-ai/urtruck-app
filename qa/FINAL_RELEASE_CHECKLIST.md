# UrTruck — FINAL RELEASE CHECKLIST

Generated: 2026-09-14, session "CLAUDE FINAL CODE HARDENING".
Branch: `claude/final-code-hardening-20260914`. Base: `origin/codex/chat-voice-map-qa`.

Purpose: a machine-checkable split between what Claude proved at the CODE level
(no physical device, no production secrets, no real provider credentials) and
what still requires Codex's physical acceptance pass before this can ship.
**No item below may be marked PASS without evidence** — a code-level PASS is
not a substitute for the matching physical row.

Status legend: `[x]` = verified this session · `[ ]` = not yet verified ·
`BLOCKED_NO_PHYSICAL_DEVICE` / `BLOCKED_NO_PROVIDER_SECRET` /
`BLOCKED_NO_SMTP_CREDENTIAL` = explicitly cannot be verified in this
environment, named so nobody claims PASS by omission.

---

## SECTION A — CODE VERIFIED (Claude, this session)

### Deep links / App & Universal Links
- [x] Router understands `cargo`, `trip`, `deal`/chat, `driver`, notification kinds (code, `App.js` + `NotificationsScreen.js`)
- [x] Logged-in / logged-out-with-return-to-target / unauthorized-denied / invalid-id-no-crash / cold-start-vs-warm code contract parity — `tests/frontend/test_deep_link_driver_route.mjs`, `test_public_share_contract.mjs`
- [x] Invalid/foreign id shows an explicit not-found state (CargoDetail, TripDetail, DealWorkspaceScreenV2) instead of a blank shell
- [x] Android `intentFilters` + both `apple-app-site-association` copies cover `/driver`
- `BLOCKED` — `assetlinks.json` `sha256_cert_fingerprints` cannot be verified against the real production signing cert here; must be checked against the release keystore before the next Android release

### SMTP / Email
- [x] Provider abstraction, retryable-vs-permanent SMTP failure classification (`email_service.py`) — `test_email_service_hardening.py`
- [x] Safe preflight/health surface (`host_present`/`port_present`/`username_present`/`sender_present`/`tls_config_valid`) via `GET /api/v1/system/info`, no password ever logged/exposed
- [x] Production boot refuses to start with no real OTP channel configured, and now correctly recognizes email as one (`env_check.py`) — `test_otp_email_channel_boot_gate.py`
- `BLOCKED_NO_SMTP_CREDENTIAL` — real delivery never attempted, no `EMAIL_SMTP_*` credentials exist in this environment

### Routing
- [x] Provider abstraction, timeout, 401/403/429/5xx, invalid coordinates, no-route, malformed geometry, cache, IDOR — existing `test_global_routing.py` suite, re-verified green
- [x] **Zero fake straight-line fallback** — confirmed both failure exits of `build_road_route` return 503/502, never synthesized geometry
- [x] Config-health diagnostics (`routing.*` block in `/system/info`) expose configured/provider name only, never the secret — `test_routing_router_mounted.py`
- `BLOCKED_NO_PROVIDER_SECRET` — real road geometry never fetched; live call returns `503 road_routing_not_configured`

### STT (speech-to-text)
- [x] OpenAI 429 now classified retryable (was misclassified as bad-audio) — `test_stt_contract.py`
- [x] Outsider cannot transcribe another user's/deal's audio — IDOR regression present and green
- [x] Voice message still sends/plays with provider absent; transcription shows unavailable/retry, no crash/broken playback/endless spinner
- `BLOCKED_NO_PROVIDER_SECRET` — real transcription never attempted; fails closed to `TRANSCRIPTION_UNAVAILABLE`

### Push
- [x] Durable outbox, dedup (`_already_delivered(user_id, event_key)` — one event → one logical push), retry/backoff, dead-letter, receipt reconciliation, stale/invalid-token cleanup, logout invalidation, role isolation, 4-language locale, deep-link payload, `chat.voice` vs `chat` kind — 60/60 across the push suite
- `BLOCKED_NO_PHYSICAL_DEVICE` — no real FCM/APNs delivery attempted

### Bell / Notifications (backend contract only — UI intentionally untouched)
- [x] Unread lifecycle 0→1→read→0; completed/cancelled/rejected/expired/dead-room excluded — 35/35

### Files / Documents / Attachments
- [x] Upload/download auth, signed-URL HMAC (valid→200, tampered→403, path-traversal→403), MIME/size validation, duplicate-upload idempotency, outsider denied — 73/73 incl. live HTTP verification on an isolated backend
- [x] Deal-status gate now applied to the deal-room attachment door (previously only the legacy chat door enforced it) — new P1 fix, `test_deal_room_status_gate.py` 11/11
- [x] PDF backend/API contract — PASS
- `BLOCKED_NO_PHYSICAL_DEVICE` — physical PDF opening not attempted

### Third-account IDOR (expanded)
- [x] 19/19 live outsider vectors denied (chat both doors, deal timeline/detail/tracking/location/waybill, GPS spoof, bid accept/events, counterparty profile, private cargo listing, tampered attachment signature, path traversal) + 34/34 + 7/7 new regression (`GET /users/counterparty/{id}`)

### Legacy / dead code
- [x] Dead `Auth` route alias (duplicate of `Login`) removed; repo-wide reachability sweep added
- [x] `Role`/`Reg`/`RegOtp`/`RegProfile`/`Login` confirmed **still live** on this base (the separate auth-canon-closure branch that redirects these paths has not yet been cherry-picked into `codex/chat-voice-map-qa` by Codex) — not deleted, correctly classified
- [x] Second chat list (`ChatsListLegacyScreen`) confirmed **production-live** (generic chat push with no id routes here) and already correctly isolated from the Deals inbox — not touched, reachability regression added

### i18n / error UX (RU/ZH/EN/KK)
- [x] 6 active-user-facing leaks found and fixed (HeaderMenuButton a11y label, PriceSavingsBadge, marketAPI status-code fallback, 4× raw `e.message` in `registration.js`, `vehicleAPI.js`, push channel name) — `qa:i18n` 1998/1998/1998/1998, 0 missing
- [x] Backend error sanitization swept — zero new leaks, no stack/SQL/path/secret in any API response

### Config / secrets
- [x] Repo-wide secret-pattern scan — 0 leaks (only the intentionally-public Supabase anon key, documented as non-secret)
- [x] `.github/workflows/*` — 19 files, all via `${{ secrets.* }}`, 0 hardcoded

### Production boot guards
- [x] Ephemeral `DB_PATH` (`:memory:`, `/tmp/*`) refused in production
- [x] Email/SMTP now recognized as a valid sole OTP channel (was a P0 false boot refusal)
- [x] BETA_MODE / demo-OTP already fail-closed (prior session)

### Dependencies
- [x] `npm audit fix` (no `--force`) applied — 46→36 advisories, `package-lock.json` only, build+tests re-verified green
- Documented, not upgraded (needs a dedicated task): backend `pip-audit` findings (pillow/lxml/cryptography/starlette/pyjwt/python-multipart/h2 — every fix needs a risky minor/major bump); remaining 36 npm advisories need Expo 52→57 (out of scope, SDK pinned)

### CORS / headers
- [x] `GET /storage/{path}` (signed private documents) now sends `Cache-Control: private, no-store`
- Documented, not added: CSP header (needs a coordinated frontend audit)

### Database / migrations
- [x] Reviewed — all idempotent, index coverage already strong; no schema change made (none justified)

### Concurrency
- [x] **P0 found and fixed live**: OTP code could be consumed twice (race between `check_code()` and `delete_code()`) — reproduced with 20 concurrent threads (6 winners from 1 code) before the fix; now atomic `consume_code()`, DELETE rowcount is sole source of truth — `test_otp_consume_race.py` 3/3
- [x] Bid-accept races, duplicate start/complete/upload, push-outbox dedup, chat client_msg_id — verified already covered by existing tests, not modified

### Observability
- [x] Sentry no longer fires unconditionally in every test run — now genuinely environment-gated, `environment` tag reflects real env — `test_sentry_env_gate.py` 4/4

### Health endpoints
- [x] Found and fixed a route-shadowing bug: `GET /health` was defined twice, `main.py`'s copy was dead code, never executed
- [x] Live handler now does a real DB-reachability check (`SELECT 1`, 503 on failure), deliberately excludes optional providers so one hiccup doesn't pull a healthy instance from a load balancer — `test_health_endpoint.py` 4/4

### Final automated gate (this session, on the final reordered HEAD)
- [x] Backend: **805/805 PASS**
- [x] Frontend: **565/565 PASS**
- [x] Lint: **PASS** (351 files)
- [x] Web build: **PASS**, exit 0
- [x] `git diff --check` (whole branch vs base): **PASS**
- [x] Secret scan (pattern-based, whole branch diff): **0 findings**
- [x] i18n parity (`qa:i18n`): **PASS**, 1998/1998/1998/1998, 0 missing
- [x] Workflow YAML validation (19 files): **PASS**
- [x] `release:check-config`: **PASS**

### Pre-existing gap, NOT introduced or duplicated this session
- GPS consent contract (`npm run qa:gps-consent`) still fails on **this base** (`codex/chat-voice-map-qa`) at the same stale `truck-map-yandex-webview` literal — the fix (commit `826bf1c0`, `qa/utils/gpsConsentSmoke.js`) already exists and is proven 82/82 on the sibling branch `claude/final-1010-audit-20260914`, just not yet cherry-picked into this base by Codex. Task 6's ownership matrix did not assign this file to any agent (it belongs to the separate auth-canon handoff package) — not re-fixed here to avoid a duplicate/conflicting fix landing from two different branches.

---

## SECTION B — REQUIRES PHYSICAL (Codex's job, not verifiable here)

| # | Item | Why blocked here |
|---|---|---|
| 1 | APK install + first-run on a real Android device | No physical device in this environment |
| 2 | Deep links / universal links opened from an actual OS surface (SMS, browser, another app) on Android + iOS | No physical device; `assetlinks.json` cert fingerprint also needs the real release keystore |
| 3 | Google OAuth end-to-end on a real device (new/existing/cancel/duplicate-callback/cold-start) | No physical device / real Google consent screen |
| 4 | Real email OTP delivery (SMTP) | `BLOCKED_NO_SMTP_CREDENTIAL` — no SMTP credentials in this environment |
| 5 | Apple Sign-In on real iOS hardware | No iOS runtime/device here; gating mechanism itself is code-verified |
| 6 | Real push delivery (FCM/APNs) to a physical device, including background/killed-app states | No physical device, no real push credentials exchanged end-to-end |
| 7 | Moving GPS / real background-location trial on Android | No physical device; background location task cannot be exercised outside a real OS |
| 8 | Real routing-provider road geometry (Yandex/ORS) | `BLOCKED_NO_PROVIDER_SECRET` — no routing API key in this environment |
| 9 | Real STT transcription with production vocabulary (Алматы/Хоргос/Yiwu/CMR/TIR/USD/тенге/тонна) | `BLOCKED_NO_PROVIDER_SECRET` — no STT provider key in this environment |
| 10 | Camera capture flow (document/selfie OCR) on a real device | No physical device / camera hardware |
| 11 | PDF opening in a real mobile PDF viewer (native share sheet, external app) | No physical device; backend/API contract already code-verified PASS |
| 12 | Two-phone concurrent chat/voice/GPS/deal session (cross-device race, not just concurrent HTTP) | No physical device pair |
| 13 | iOS build / TestFlight distribution | No iOS build environment here; explicitly out of scope for this pass |
| 14 | Final visual/UX pass on real device screen sizes and OS chrome | No physical device |

---

## Build this checklist evaluates

BASE: `origin/codex/chat-voice-map-qa` @ `27aba8188981314a84fd6c6548a3ec26ef0baa8f`
FINAL: `claude/final-code-hardening-20260914` (see final report for exact SHA)
