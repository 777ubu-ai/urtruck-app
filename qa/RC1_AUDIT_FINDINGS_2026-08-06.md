# UrTruck RC1 audit findings — 2026-08-06

## Confirmed green

- Backend/API modules: all passed in isolated databases.
- Maestro flow contracts: passed.
- Design/FSM/UX gate: passed.
- Mobile Playwright: 36/36 passed on Pixel 7 and iPhone 13 profiles.
- Production web build: passed.

## Confirmed failures from desktop Playwright

1. `premium.login.spec.js` — session persistence/reload test timed out.
2. `full.auth.regression.spec.js` — client registration/reload/logout/login timed out.
3. `auth.logic.lock.spec.js` — driver registration entry timed out; dependent auth-lock tests were skipped.
4. `visual.screenshots.spec.js` — desktop, iPhone 13 and iPhone SE visual capture suites timed out.
5. `guest.mode.spec.js` — RoleScreen language switch / guest-feed entry failed; dependent guest tests were skipped.

## Product defects confirmed by owner screenshots/code review

### P0 — deal FSM and roles

- Driver starts a trip and immediately sees a dominant delivered/arrived action.
- Shipper UI currently offers a `delivered` transition while the deal is `in_progress`; shipper must only confirm receipt after driver marks delivery.
- International routes must keep the border guard and cannot jump directly to delivery.
- Every status mutation must require explicit confirmation and be idempotent.
- Timeline must not show duplicate `trip started` events.

### P0 — identity/profile

- A cargo/trip publisher cannot remain anonymous.
- Before first publication require a usable display identity:
  - private account: name + city;
  - company account: company name + contact person + city.
- Other users must never see `Пользователь UrTruck` or `Профиль не заполнен` as the primary identity.

### P1 — deal/chat UI

- Reduce excessive empty vertical space.
- Replace emoji actions with Feather icons.
- Make the active trip state visually primary; make the next irreversible action secondary until confirmed.
- Keep message input, voice recording and safe-area compact on iPhone.
- Keep call action consistent with the message action.

## RC1 fix order

1. Canonical deal-action resolver by status and role.
2. Backend role/transition regression tests.
3. ChatScreen action confirmation and compact status card.
4. Timeline deduplication.
5. Mandatory identity gate before publish.
6. Auth timeout fixes and deterministic test setup.
7. Visual suite split into smaller screen groups.
8. Guest-mode selector/entry fix.
9. Full rerun and production deploy.
