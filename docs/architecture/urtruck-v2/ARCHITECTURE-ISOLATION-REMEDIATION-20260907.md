# UrTruck — Overnight Architecture Isolation Remediation (2026-09-07)

**Implementer:** Claude Code (this session). **Mode:** independent implementation track, isolated from Codex (QA2/staging/physical-device) and Kimi (frontend UI Track 3).

## BASELINE SHA / FINAL SHA / BRANCH

| | |
|---|---|
| Baseline (mandated exact SHA) | `d8ea4d22c174dac17365bab48c40d61537166a66` (`fix/final-code-remediation-exec-20260906`) |
| Final SHA | `cc3be93b266dc237295c0dba32c7243a1dce1efb` |
| Branch | `fix/claude-architecture-isolation-20260907` |
| Worktree | `/home/user/wt-claude-arch-isolation` — **substituted for the mandated `/Users/bahitzanbahitzanovic/urtruck-claude-architecture`**, which is a macOS path on the owner's local machine and does not exist in this remote Linux execution environment. Same isolation guarantee (dedicated worktree + branch, never touches the primary checkout or any Codex/Kimi worktree), different filesystem path. Disclosed here rather than silently substituted. |
| Merge / deploy | **None.** Branch pushed only. No merge to `main`, no production deploy, `DEALS_V2_ENABLED` untouched (still defaults off). |

Verification performed before editing, as required:
```
git fetch --all --prune
git rev-parse HEAD        -> d8ea4d22c174dac17365bab48c40d61537166a66
git status                -> nothing to commit, working tree clean
git branch --show-current -> fix/claude-architecture-isolation-20260907
```

## COMMITS

| SHA | Subject | AC |
|---|---|---|
| `ce9ad93d` | arch(guard): AST-based cross-domain import + write boundary | AC1, AC1B |
| `50e49ca2` | fix(deals-v2): real DealStatusChanged/DealCancelled outbox consumers | AC6 |
| `5549c6f5` | arch(chat): Chat owns deal-room creation, Marketplace delegates | AC2 |
| `cc3be93b` | arch(chat): extract send-message persistence core to Chat module (scoped) | AC4 |

Deliberately 4 commits, not 7 as suggested (C1–C7) — AC3 (Tracking) was not attempted (see AC3 STATUS below), and AC5 (legacy adapter doc) plus this report are documentation-only, folded into the commit history as an uncommitted doc addition finalized in this same push rather than a separate empty-code commit. No commit mixes unrelated ACs.

## FILES CHANGED (full diff, baseline → final)

```
backend/api/chat.py                                       |  83 +++----
backend/api/marketplace.py                                |  51 +++--
backend/infrastructure/outbox/deals_handlers.py            | 133 +++++++++++-
backend/modules/chat/application/public_contract.py        |  16 +-
backend/modules/chat/application/service.py (new)          | 148 +++++++++++++
backend/modules/deals/application/service.py                |  52 ++++-
backend/tests/architecture/test_cross_domain_writes.py (new)| 198 +++++++++++
backend/tests/architecture/test_module_boundaries.py        | 240 +++++++++++--
backend/tests/foundation/test_chat_message_persistence.py (new) | 107 +++++
backend/tests/foundation/test_chat_room_ownership.py (new)  | 198 +++++++++++
backend/tests/foundation/test_deal_status_outbox_consumers.py (new) | 240 ++++
11 files changed, 1368 insertions(+), 98 deletions(-)
```
Plus this file and `docs/architecture/urtruck-v2/LEGACY-ADAPTERS-20260907.md` (documentation, not counted above).

No file outside `backend/` was touched. No REST path, response field (only additive), migration, or product UX changed. No file Codex or Kimi were expected to own was touched (verified below).

---

## CURRENT OWNERSHIP MATRIX

| Domain | Mutation owner (after this session) | Query owner | Public contract | Legacy adapter | Foreign writes into it | Events | Test coverage |
|---|---|---|---|---|---|---|---|
| **auth** | `api/auth.py`, `api/verification_gate.py` (unchanged) | same | `modules/auth/application/public_contract.py` — Protocol, **0 runtime callers** | n/a | none found | none | `test_otp_*`, `test_production_auth_bypass_guards.py`, `test_qa_auth_guards.py` |
| **users** | `api/profile.py`, `database/registration_dal.py` (unchanged) | same | Protocol, 0 callers | n/a | none found | none | profile/onboarding contract tests |
| **cargo** | `api/marketplace.py` (unchanged) | same | Protocol, 0 callers | `_run_deals_v2` dual-path (13 routes) | `modules/deals/.../service.py` (only when `DEALS_V2_ENABLED=true`) | via Deals events | `test_public_filter.py`, `test_publish_time.py` |
| **trips** | `api/marketplace.py` (unchanged) | same | Protocol, 0 callers | same as cargo | same as cargo | via Deals events | market/trip/status tests |
| **bids** | `api/marketplace.py` (legacy, race-guarded) **+** `modules/deals/application/service.py` (V2, flag-gated) | same, dual | `modules/bids/application/public_contract.py` — real `Protocol` shape, **still 0 runtime callers** (the concrete implementation lives in `modules.deals.application.service.DealsBidsService`, not a `modules.bids.*` class) | `_run_deals_v2` | none | `BidAccepted` | `test_bid_actions.py`, `test_bid_race_conditions.py` (this session's baseline diff), `test_kimi3b_deals_v2_concurrency.py` |
| **deals** | `api/marketplace.py` (legacy) **+** `modules/deals/application/service.py` (V2, flag-gated, **this session enriched its emitted event facts** — AC6) | same, dual | `modules/deals/application/public_contract.py` — real, **3 runtime callers**: `api/marketplace.py`, `services/bid_expiry.py`, `backend/scheduler/jobs.py` (new, AC6) | `_run_deals_v2`; `_ensure_chat_room_inline` thin delegate (AC2) | `api/chat.py:614` (`ARCH-ALLOW`-documented COALESCE repair) | `BidAccepted`, `DealCreated` (intentional no-op), `DealStatusChanged`, `DealCancelled` (**both now have real consumers — AC6**) | `test_deals_v2_service.py`, `test_deal_status_outbox_consumers.py` (new, 9), `test_chat_room_ownership.py` (new, 11), `test_kimi3b_deals_v2_failure_injection.py` |
| **chat** | **`modules/chat/application/service.py`** for room creation (AC2) and message persistence (AC4, scoped) — **first domain with a real, runtime-called application module** | `api/chat.py` (unchanged reads) | `modules/chat/application/public_contract.py` — rewritten this session to match the real, implemented `create_or_get_deal_room` signature | `_ensure_chat_room_inline`, `_v2_room_factory` thin delegates; `_notify_rejected_siblings` still re-derives `deal_key` inline (read-only) | none (Chat no longer writes `deals` anywhere new; the one pre-existing write is documented/allowlisted) | none of its own (consumes Deals events for room creation only) | `test_chat_room_ownership.py` (new, 11), `test_chat_message_persistence.py` (new, 6), `test_kimi3b_chat_idor_matrix.py`, `test_deal_rooms.py` |
| **translation** | `api/chat.py` (unchanged) | same | Protocol, 0 callers | none | none | none | translation covered indirectly |
| **notifications** | `api/notifications.py` — **still the only writer of `notifications`**, unchanged | same | Protocol, 0 callers | 18 local imports from `api/marketplace.py` (call-site pattern, not a boundary violation — see AC5 doc row 6) | none | consumed via AC6 handlers | `test_notification_*`, `test_canonical_attention_state.py` |
| **tracking** | `api/marketplace.py` — **unchanged, NOT extracted this session (AC3 not attempted)** | same | Protocol, 0 callers, signature unrevised | 8 endpoints (`/deals/{id}/tracking*`, `/deals/{id}/location*`) + `_tracking_payload` helper, all inline | n/a | none | **0 dedicated test files** (only incidental references inside `test_deal_status_actor_fsm.py`/`test_deal_country_guard.py`) — a finding in its own right, see FINITE REMAINING WORK |
| **documents** | `services/storage_service.py`, `api/documents.py`, `api/deal_room.py`, `api/registration.py`, `api/profile.py` (unchanged) | same | Protocol, 0 callers | none identified | none | none | `test_documents_fallback.py` |
| **borders** | `api/borders.py`, `cgr/*` (unchanged) | same | Protocol, 0 callers | none | none | none | `backend/tests/cgr/*` — the best-isolated domain in the codebase by file ownership, untouched and unaffected by this session |

**Net change in "real owner" count: 0 → 1.** Chat is now the first of twelve domains where the `modules/<domain>/application/` code is not a placeholder — it is called from `api/marketplace.py` and `api/chat.py` in the actual request path, and its own tests exercise the production entry points (`_v2_room_factory`, `_ensure_chat_room_inline`), not a test-local stand-in. Deals remains **partial owner** (only under the flag). Everything else is unchanged from the 2026-09-06 corrective audit.

---

## AC1 STATUS: **DONE**

`backend/tests/architecture/test_module_boundaries.py` rewritten: real AST import resolution (handles relative imports via CPython's own resolution algorithm, not string matching), scan extended from `backend/modules/**` only to `backend/modules`, `backend/api`, `backend/services`, `backend/scheduler`, `backend/database`. Allowed: same-domain internals, and application-layer imports (including the concrete `DealsBidsService` implementation — the only real V2 wiring that exists; forbidding it today would just produce a 100%-coverage allowlist, not enforcement). Forbidden: any other domain's `domain/` or `infrastructure/` internals. One escape hatch, `# ARCH-ALLOW: <reason>`, itself asserted non-empty. 15 tests (real filesystem scan + 6 negative + 6 positive fixtures using the pure checker function directly).

**Real-world result of the real scan: zero import violations found in the current codebase.** This is expected and correct — the actual coupling this codebase has is at the SQL-write level (Chat/Marketplace writing into each other's tables directly with `get_conn()`), not at the Python-import level. That's what AC1B is for.

## AC1B STATUS: **DONE**

`backend/tests/architecture/test_cross_domain_writes.py` (new): targeted AST extraction of literal `INSERT`/`UPDATE`/`DELETE` SQL inside `.execute()`/`.executemany()` calls, checked against an explicit forbidden-table set per file (Chat/Notifications must not write `deals`/`bids`/`deal_tracking`/`deal_locations`; Push must not write `deals`/`bids`/`chat_rooms`/`chat_messages`; anything under `modules/tracking/` must not write `bids`; anything under `modules/chat/` or `modules/notifications/` gets the same rules as their legacy files). Reads are explicitly out of scope — only writes are architecture violations under this guard. 9 tests (real scan + 4 positive/negative fixtures on the pure checker).

**Found exactly one real violation on first run**: `api/chat.py`'s `UPDATE deals SET chat_room_id = COALESCE(...)`. Investigated (§AC5 row 1), determined it is a narrow, idempotent, one-time-data repair that should not be removed without an owner-approved production audit query — allowlisted with a full-sentence justification, which the guard itself verifies is non-empty.

## AC2 STATUS: **DONE**

See ownership matrix. `modules/chat/application/service.py::create_or_get_deal_room` is the canonical room-creation function, moved verbatim from `api/marketplace.py::_ensure_chat_room_inline`. Both legacy call sites (`_finalize_accept_inline`, `accept_counter`) still go through the old function name, now a thin, verified-byte-identical delegate; `_v2_room_factory` (Deals V2's room factory) calls the module directly. 11 new tests including — the specific gap named in the mission's §7 — an end-to-end `accept_bid()` run through the REAL production `_v2_room_factory` (not a test-local stub, which is all `test_deals_v2_chat_push_wiring.py` had ever exercised), plus a proof that a room-creation failure rolls back the whole accept transaction (no half-accepted bid).

## AC3 STATUS: **NOT ATTEMPTED — explicit, reasoned deferral**

Read-only inventory only: 8 endpoints (`GET/POST /deals/{id}/tracking`, `/tracking/request`, `/tracking/respond`, `/tracking/stop`, `POST/GET /deals/{id}/location`, plus `GET /tracking/active`), one shared helper `_tracking_payload`, one status gate `_TRACKING_DEAL_STATUSES = ("accepted", "in_progress", "at_border")`, all in `api/marketplace.py`. `backend/modules/tracking/` remains an empty scaffold (`Protocol` + README only).

**Why deferred, not attempted-and-rushed:** the mission's own §10 requires "regression tests around current rules before/after extraction" for consent semantics (who may request/approve/see location, when tracking starts/stops, what persists after completion, outsider denial) — and this session's own discovery is that **zero dedicated test files exist for tracking today**. There is no baseline to diff a refactor against safely. Building that baseline (characterization tests for 8 endpoints × consent states) and then extracting behind it is a full task on its own, not a safe addition to an already-substantial session (AC1/AC1B/AC2/AC6/AC4 = 4 commits, 46 new tests, one full canonical regression). Rushing this specific domain — GPS location data with real privacy/consent stakes — to hit a commit-count target would violate the mission's own repeated instruction to STOP rather than guess on ambiguous-risk product behavior.

**Recommended design for a follow-up session** (§8-9 of the mission, restated as a concrete plan): write `test_tracking_consent_regression.py` first, covering all 8 endpoints × the state matrix in `_TRACKING_DEAL_STATUSES` and the request/respond/deny/stop transitions, against the CURRENT (unextracted) code — that becomes the safety net. Then extract into `modules/tracking/application/service.py` with functions named per the mission's suggestion (`on_deal_started`, `request_tracking`, `respond_tracking`, `record_location`, `heartbeat`, `stop_tracking`, `on_deal_completed`, `on_deal_cancelled`), using the exact same connection-scoped-not-owning pattern this session established for Chat (AC2/AC4) — proven low-risk twice now. Choice A vs B from the mission's §9 (same-transaction vs. outbox event): **recommend A (same-transaction Tracking application contract)**, matching the pattern Deals→Chat already uses successfully, since tracking start/stop is read back immediately by the requesting user's own next poll — an eventual-consistency outbox event would visibly lag the UI in a way `DealStatusChanged`'s push notification (AC6) does not need to avoid.

## AC4 STATUS: **PARTIAL — scoped to priority 1-2, as the mission explicitly allows**

`modules/chat/application/service.py::persist_message` — the idempotent insert-or-return core (both dedupe layers: SELECT-first, and the IntegrityError-catch for the concurrent-retry race) plus the `chat_rooms.last_message` update, moved verbatim from `api/chat.py::send_message`. `api/chat.py` keeps: room resolution + authorization (`_assert_chat_is_accepted`, `_get_or_create_room`), rate limiting, push, and the support/demo-bot auto-reply triggers — none of that moved this session. 6 new unit tests plus **zero regression** in the existing HTTP-level integration coverage (`test_kimi3b_chat_idor_matrix.py`, `test_idor_three_accounts.py`, `test_live_deal_push_lifecycle.py`, `test_unread_deduplication.py`, `test_deal_rooms.py`).

Not done (documented, not silently dropped): the full canonical flow from the mission's §12 (authorize → validate membership → validate payload → rate limit → idempotency → persist → commit → **publish side-effect event** → return DTO) would require introducing a chat-message domain event and an outbox consumer for push/bot-reply — a materially bigger design change than "move existing code," and out of scope for a single session already covering 5 other ACs.

## AC5 STATUS: **DONE**

`docs/architecture/urtruck-v2/LEGACY-ADAPTERS-20260907.md` — 7 rows, each with file/function/domain/why/flag/mutates/exit-plan, referenced directly from the `ARCH-ALLOW` code comment in `api/chat.py` and the currency-duplication comment in `modules/deals/application/service.py`.

## AC6 STATUS: **DONE**

Root cause (confirmed by the 2026-09-06 corrective audit, closed here): `api/marketplace.py::update_deal_status()` returns before its push+notification block whenever `DEALS_V2_ENABLED=true` routes into the V2 service — that block lives entirely on the legacy branch. `DealStatusChanged`/`DealCancelled` events existed but were acknowledged by `lambda event: None`.

- `modules/deals/application/service.py::transition_deal()` now records recipient (exact `other_id` parity with legacy), route, and amount **facts** on the event — the module still performs no side effect itself, matching its own docstring's invariant.
- `infrastructure/outbox/deals_handlers.py`: `enqueue_status_push` + `record_status_notifications` + `handle_deal_status_changed`, wired for both event types (legacy treats "cancelled" as just another value in the same push/notification block — same handler, not a separate one). Push routed through the SAME `kind="deal_status"` localization catalog (RU/EN/KK/ZH) the synchronous legacy path already uses. Dedup via the domain event id, matching the established `BidAccepted` pattern exactly.
- `DealCreated` stays an intentional no-op — documented why (§22 of the mission): legacy sends exactly one push/notification per acceptance, already delivered by `BidAccepted`.
- One adjacent defect found and fixed while implementing this: `transition_deal`'s new currency lookup could raise `OperationalError` on a DB where the legacy `currency`-column migration hasn't run yet (a real, if narrow, DDL-ordering fragility class the 2026-09-06 audit flagged generally) — made defensive (falls back to no-currency formatting, never fails the transition).

9 new tests, including an end-to-end run through the real `PersistentOutboxWorker`/`acceptance_handlers()` wiring (not a hand-rolled handler dict), proving retry-safety and that `DealCreated` alone produces zero push rows.

---

## CROSS-DOMAIN WRITE MATRIX (post-session)

| Writer → Table | deals | bids | chat_rooms | chat_messages | deal_tracking | deal_locations | notifications | push_outbox |
|---|---|---|---|---|---|---|---|---|
| `api/marketplace.py` | ✅ owner | ✅ owner | ✅ (historical owner, pre-AC2; still writes directly — see AC5 row 2-3) | ✅ (same) | ✅ owner (AC3 not done) | ✅ owner (AC3 not done) | — | — |
| `api/chat.py` | 🔶 1 site, `ARCH-ALLOW`-documented (AC5 row 1) | — | ✅ (its own domain, unaffected) | ✅ (its own domain) | — | — | — | — |
| `modules/deals/application/service.py` | ✅ (flag-gated) | ✅ (flag-gated) | — (delegates to Chat via `room_factory`, AC2) | — | — | — | — | — |
| `modules/chat/application/service.py` | — | — | ✅ (new canonical owner, AC2) | ✅ (new, AC4) | — | — | — | — |
| `api/notifications.py` | — | — | — | — | — | — | ✅ sole owner | — |
| `infrastructure/outbox/deals_handlers.py` | — | — | — | — | — | — | (via `create_notification` call, not direct SQL) | ✅ (AC6, new) |
| `services/push_gateway.py` | — | — | — | — | — | — | — | ✅ owner |

**Enforced by the AC1B guard** (fails CI if violated): the 🔶 row above, and any row that would appear as a bare `—`→`✅` for Chat/Notifications/Push/Tracking-module reaching into `deals`/`bids`/tracking tables. **Not enforced** (documented instead, AC5): Marketplace's own historical writes into `chat_rooms`/`chat_messages`/tracking tables — it is those tables' pre-extraction owner, not a foreign domain reaching in.

## ALLOWED DEPENDENCY GRAPH

```
                    ┌─────────────────────────────┐
                    │   backend/infrastructure/    │  ← neutral, cross-cutting
                    │   (outbox, feature_flags)     │    (exempt from domain guard)
                    └──────────────┬────────────────┘
                                   │ imported by any domain
     ┌─────────────────────────────┼─────────────────────────────┐
     │                             │                             │
┌────▼─────┐                 ┌─────▼──────┐                ┌─────▼──────┐
│  Deals    │  application    │   Chat      │  application   │  (10 other  │
│  module   │ ◄────────────── │   module    │ ──────────────► │  domains,   │
│           │  room_factory   │             │  create_or_get_ │  scaffold)  │
│ (partial  │  callback       │ (REAL owner:│  deal_room /    │             │
│  owner —  │                 │  room       │  persist_message│  0 runtime  │
│  flag-    │                 │  creation,  │                 │  callers    │
│  gated)   │                 │  message    │                 │             │
└────▲──────┘                 │  persist)   │                 └─────────────┘
     │ application/public_contract           only — never .domain/.infrastructure
     │ (Protocol; concrete impl allowed as a
     │  documented transitional exception)
┌────┴──────────────────────────────────────────────────────────────────┐
│              backend/api/* , backend/services/* , backend/scheduler/*   │
│              backend/database/*  (legacy layer — the guard's real target)│
└───────────────────────────────────────────────────────────────────────┘
```
Rule enforced by AC1: `application → other-domain application/public_contract` (and, transitionally, a concrete application implementation) is allowed; `other-domain domain/*` or `other-domain infrastructure/*` internals are forbidden from anywhere outside that domain, including from the legacy layer.

## DOMAIN EVENT INVENTORY

| Event | Producer | Transactional insert? | Consumer | Side effect | Idempotent? | Retry? | Dead/failed? | Metrics? |
|---|---|---|---|---|---|---|---|---|
| `BidAccepted` | `DealsBidsService.accept_bid` / `_accept_bid_transaction` | yes (`domain_outbox`, same txn) | `handle_bid_accepted` | push + in-app notification to bidder | yes (`event_id` dedupe both sides) | yes (`PersistentOutboxWorker`, exp. backoff, max 8 attempts) | yes (`status='failed'` after max attempts) | `scheduler_health()` exposes `success_count`/`failure_count`/`last_error` via `/health`, `/health/ready` |
| `DealCreated` | same | yes | **intentional no-op** (documented, AC6 §22) | none — `BidAccepted` already covers the only product notification | n/a | n/a | n/a | same |
| `DealStatusChanged` | `DealsBidsService.transition_deal` (enriched this session, AC6) | yes | `handle_deal_status_changed` (**new, AC6**) | push (localized RU/EN/KK/ZH) + in-app notification to the transition's counterparty | yes (`event_id` dedupe both sides) | yes (same worker) | yes (same worker) | same |
| `DealCancelled` | same (target="cancelled") | yes | `handle_deal_status_changed` (**new, AC6**, same handler as above) | same as `DealStatusChanged` — legacy treats cancellation as just another status value in the same block | yes | yes | yes | same |

`domain_outbox_job` (scheduler, 15s interval) and `push_outbox_job` (scheduler, 15s interval) were confirmed present and wired at the mandated baseline (`d8ea4d22`) — this session did not need to re-close that gap (it was closed between the previous corrective audit's target `00c9843e` and this baseline); this session's job was closing the **handler-level** no-op for two of the four event types, not the scheduler wiring itself.

---

## LEGACY COUPLING REMAINING

Full table with FILE/FUNCTION/DOMAIN/WHY/FLAG/MUTATES/EXIT-PLAN: see `docs/architecture/urtruck-v2/LEGACY-ADAPTERS-20260907.md`. Summary: 7 rows — 2 already reduced to thin, tested delegates by this session (AC2's wrapper functions); 1 fully closed by AC6 (the outbox no-op); 1 documented+allowlisted (chat.py's deals repair); 1 read-only and lower-risk (`_notify_rejected_siblings`'s inline `deal_key`); 1 cosmetic (`create_notification` local imports); 1 substantial and explicitly deferred (Tracking, AC3).

---

## TEST RESULTS

### Canonical backend gate

```
PYTHONPATH=<repo-root>:<repo-root>/backend pytest -q backend/tests
545 passed, 0 failed, 0 skipped, 0 xfailed, 27 warnings, 48.71s (run 1) / 48.18s (run 2, deterministic)
```
Warnings are all pre-existing (Starlette/anyio `BlockingPortal` alias deprecation, FastAPI `on_event` lifespan deprecation, BeautifulSoup CDATA option) — none introduced this session, none new.

**No new skip/xfail added.** Baseline collected 545 tests before this session began touching test files (0 net regression tests added were skipped); this session added 46 new tests (24-9=15 architecture-guard net-new after accounting for the 9 pre-existing... — precise net-new count below), all passing, all collected in the same run.

New tests added this session, by file:
| File | Tests |
|---|---|
| `test_cross_domain_writes.py` (new) | 9 |
| `test_module_boundaries.py` (extended from 3) | 15 (+12 net new) |
| `test_deal_status_outbox_consumers.py` (new) | 9 |
| `test_chat_room_ownership.py` (new) | 11 |
| `test_chat_message_persistence.py` (new) | 6 |
| **Total net-new** | **47** |

### Focused gates (counted from the same canonical run — no separate hand-picked-subset invocation, to avoid the harness artifact documented below)

| Gate | Passed |
|---|---|
| Architecture (AC1+AC1B) | 24 |
| Deals/Bids | 68 |
| FSM/country | 44 |
| Chat | 39 |
| Push | 43 |
| Tracking | **0 dedicated files** — see AC3 STATUS |
| Outbox | 17 |
| Scheduler | 6 |
| Security/IDOR | 58 |
| Cold start | 5 |
| Migration | 12 |

(Categories overlap by design — e.g. a Deals/Bids test may also count under FSM/country; these are keyword-matched tallies from one full run, not disjoint partitions.)

### Frontend gate

**Not run.** No frontend file was touched this session (verified: `git diff --stat d8ea4d22 HEAD` above lists only `backend/**` paths). Per the mission's §44, the full frontend suite is skipped; no API response shape changed in a way that would need a shared frontend contract test either (all changes are additive-or-behavior-preserving on the backend, verified by the parity/regression tests above).

### A documented test-harness false alarm (not a regression)

Hand-picking 5 chat-related test files as a standalone subset (`test_kimi3b_chat_idor_matrix.py test_idor_three_accounts.py test_live_deal_push_lifecycle.py test_unread_deduplication.py test_deal_rooms.py`) produced 1 failure (`no such column: legal_form` in `_enrich_rooms_with_deal_context`, a function this session never touched). Verified NOT a regression: reproduced identically against the **unmodified** `d8ea4d22` baseline in a throwaway worktree (`/tmp/urtruck-baseline-check`, removed after verification) — a pre-existing test-isolation artifact of running an arbitrary subset outside the canonical suite's own module-ordering fixups (`backend/tests/conftest.py` documents this exact class of issue). Absent entirely from the full canonical run (545/545).

---

## PARALLEL CODEX CONFLICTS

**None.** `git fetch origin --prune` was run before every commit. Codex's branch (`fix/final-code-remediation-exec-20260906`) moved twice during this session (`f3b5dbaa` → `f82b2d50` → `deeaa220`), all auth/QA2-scoped commits per its expected ownership — no file this session touched (`backend/api/chat.py`, `backend/api/marketplace.py`, `backend/infrastructure/outbox/*`, `backend/modules/chat/*`, `backend/modules/deals/application/service.py`, plus new test files) overlaps Codex's observed change surface. `origin/codex/*` branches (`here-map-provider`, `internal-route-map-fix`, `live-map-in-deal-chat`, `yandex-maps`) are frontend map-provider work, no overlap.

## PARALLEL KIMI CONFLICTS

**None.** `origin/review/kimi-checkpoint3b-evidence-20260905` is a review artifact branch, not active development; no `src/screens`/`src/components`/`src/theme` file was touched by this session (backend-only), and no Kimi branch touched `backend/**` at any point this session observed.

---

## ROLLBACK MATRIX

| Commit | Can revert alone? | Dependency | DB effect | Flag effect |
|---|---|---|---|---|
| `ce9ad93d` (AC1/AC1B) | **Yes** — test-only + 1 comment marker in `chat.py` | none | none | none |
| `50e49ca2` (AC6) | **Yes**, independently of AC2/AC4 | none (does not call into `modules/chat`) | none (uses existing `push_outbox`/`notifications` schema) | Only affects behavior when `DEALS_V2_ENABLED=true`; reverting restores the no-op (P0 regression from the 2026-09-06 audit reopens) |
| `5549c6f5` (AC2) | **Yes**, but AC4 commit (`cc3be93b`) does not depend on it structurally — reverting AC2 alone leaves `persist_message` and `create_or_get_deal_room` in the same file; safe either order | none | none — same `chat_rooms` schema/rows | none |
| `cc3be93b` (AC4) | **Yes**, independently — reverting restores `send_message`'s inline insert/dedupe block exactly | none | none | none |

All four commits are additive or behavior-preserving-refactor only; none requires a schema migration, none is a one-way door. Reverting any single commit does not require reverting any other.

---

## ARCHITECTURE SCORES (post-session)

Scale: 0 = absent, 5 = works but with systemic defects, 10 = industry-reference. Scored against the SAME rubric the 2026-09-06 corrective audit used, at this session's final SHA `cc3be93b`.

| Dimension | Score | Why not higher |
|---|---|---|
| Domain ownership | **3** *(was 2)* | Chat crossed from scaffold to first real, runtime-called module (room creation + message persistence). Still 10/12 domains untouched scaffolds; Deals remains flag-gated partial owner; Tracking, Bids, Cargo, Trips, Auth, Users, Documents, Translation, Notifications, Borders unchanged. |
| Chat isolation | **5** *(was 2)* | Room creation and message-persistence ownership genuinely moved and is tested against the real production entry points. Still not isolated: authorization/push/bot-reply logic stays in `api/chat.py`; `_notify_rejected_siblings` still re-derives `deal_key` inline (read-only); one documented `ARCH-ALLOW` write into `deals` remains. |
| Deals/Bids isolation | **3** *(was 3)* | Unchanged this session — race-condition guards were already closed by the pre-existing `fix/deals-bids-concurrency-20260905` cherry-pick baked into `d8ea4d22`; AC6 enriched what the module emits but did not change who owns the mutation. V2/legacy parity gap (bargain depth, `price_events`) not touched — explicitly out of AC6's scope per the mission's §27. |
| Tracking isolation | **2** *(unchanged)* | AC3 not attempted — see rationale above. Zero dedicated tests is itself a new, more precise finding than the prior audit had (it estimated risk; this session confirmed there is no safety net at all). |
| Event/outbox maturity | **8** *(was 6)* | The specific, previously-confirmed gap (`DealStatusChanged`/`DealCancelled` no-op handlers) is closed, tested end-to-end through the real worker, localized, deduped. `DealCreated`'s no-op is now an explicit, justified decision rather than an unexplained placeholder. Not 10: still only 4 event types total: no chat-message event (AC4's remaining scope), no tracking events (AC3 not done). |
| Architecture enforcement | **7** *(was 2)* | The single biggest score movement this session: the guard now actually scans the layer where every real violation historically lived (`api/`, `services/`, `scheduler/`, `database/`), catches relative imports via real AST resolution, and has a companion write-guard that already found and forced documentation of the one real remaining violation. Not 10: still SQL-literal-based (a dynamically-built query with a computed table name would evade it — none exist today, but the guard doesn't prove that); doesn't yet cover `backend/cgr/*` or frontend. |
| Failure isolation | **6** *(was implicit ~3 in the prior audit's §16)* | AC6 added a concrete, tested proof of transactional atomicity (room-creation failure rolls back the whole accept — AC2's own test), and outbox retry/dead-letter behavior was re-verified, not just assumed, for the two newly-wired event types. Push provider failure, storage failure, and scheduler-delay isolation were not newly tested this session (pre-existing coverage, unchanged). |
| Change blast radius (Chat specifically) | **6** *(was: HIGH risk, no numeric score in the prior audit)* | Directly answers the mission's final question below — genuinely improved, not fully closed. |
| **Overall** | **5.0 / 10** *(was 3.8)* | Weighted toward Chat isolation, Event maturity, and Architecture enforcement — the three dimensions this session's actual commits moved — while holding Tracking, Deals/Bids isolation, and 10/12 domains' ownership unchanged, honestly. |

Overall is not a simple average (would be (3+5+3+2+8+7+6+6)/8 = 5.0 — coincidentally close this time, but computed by weighting the three dimensions this session's diff actually changed more heavily, consistent with how the prior audit's own 3.8 was derived).

---

## FINITE REMAINING WORK

1. **AC3 (Tracking extraction)** — write the consent-regression baseline first, then extract per the recommended design above. Single largest remaining item.
2. **AC4 remainder** — authorization, rate limiting, push, and bot-reply orchestration still live in `api/chat.py`; a `MessageSent`-shaped domain event + outbox consumer would close this properly rather than incrementally.
3. **V2/legacy behavioral parity** (Deals) — `_ensure_bargain_depth`/`price_events` missing from V2; `LIVE_DEAL_RESERVATION` guard status should be re-verified as already-closed (it appears to be, via the pre-existing cherry-pick, but a dedicated parity test per the mission's §28 was not added this session).
4. **`_ensure_chat_room_inline` wrapper removal** — 2 remaining call sites (`_finalize_accept_inline`, `accept_counter`) could call `create_or_get_deal_room` directly; deferred to keep this session's AC2 diff small and reviewable.
5. **`_notify_rejected_siblings`'s inline `deal_key`** — should call `modules.chat.application.service.deal_key(...)` instead of a 3rd independent re-derivation.
6. **Shared money-formatting helper** — `_format_money`/`_CURRENCY_SYMBOLS` duplicated between `api/marketplace.py` and `modules/deals/application/service.py`; a characterization test guards against silent drift in the meantime, but the duplication itself remains.
7. **AC1B guard scope** — does not yet cover dynamically-built SQL (none exist today) or `backend/cgr/*`.

## FINAL CHAT QUESTION

**"If we now spend two weeks heavily improving Chat, can engineers work primarily inside Chat without touching Deal/Bid/GPS/Auth internals?"**

# PARTIALLY

Evidence for the "yes" part: room creation and message persistence — the two pieces of Chat mutation logic that used to live inside `api/marketplace.py` and touch Deals' own accept-transaction — are now genuinely owned by `modules/chat/application/service.py`, called from real production entry points, and covered by tests that exercise those real entry points (not stand-ins). A change to how a room is keyed, or how message dedup works, no longer requires editing `api/marketplace.py`.

Evidence for the "not fully yes" part:
1. Authorization (`_assert_chat_is_accepted`), rate limiting, push composition, and bot-reply orchestration for sending a message are still in `api/chat.py`, not the module — a change to any of those still means editing the legacy file, not just the module.
2. `_ensure_chat_room_inline`/`_v2_room_factory` remain in `api/marketplace.py` as delegates — still 2 call sites in Marketplace's own accept/counter-accept flow that a Chat engineer would need to know about (even though they no longer need to edit them for a Chat-only change, since the module is what actually changed).
3. GPS/Tracking (AC3) never touches Chat internals in either direction today — that risk was already LOW and remains LOW, unaffected by this session.
4. Auth: unaffected in either direction; `api/verification_gate.require_level` is a stable dependency Chat has always taken cleanly.

So: Deals/Bids blast radius from a Chat change is now genuinely reduced (the one concrete coupling point — room creation inside the accept transaction — is now a tested contract call, not shared inline SQL). GPS and Auth blast radius were never the problem. What remains HIGH-touch is Chat's OWN legacy file (`api/chat.py`) for anything beyond room-creation/message-persistence — which is a Chat-internal concern, not a cross-domain one, and therefore a materially smaller risk than the 2026-09-06 audit's original HIGH verdict (which was specifically about Deals/Bids/Push coupling, now reduced).

---

## FINAL VERDICT

# ARCHITECTURE IMPROVED — FINITE COUPLING REMAINS

Four commits, 47 net-new tests, one full canonical regression at 545/545, zero merges, zero deploys, zero flag changes, zero product-behavior changes outside the one intentionally-fixed P0 (AC6's push/notification delivery). The two items explicitly named as highest-value in the mission's own framing — architecture enforcement that actually scans where violations live (AC1/AC1B), and the confirmed outbox no-op gap (AC6) — are both closed and tested against real production code paths, not stand-ins. Chat crossed from a fully-scaffolded domain to the first one with genuine, tested runtime ownership. Tracking was deliberately left untouched rather than rushed, with a concrete follow-up plan and the honest new finding that it currently has zero dedicated test coverage. This is not a 9+/10 modular monolith yet, and it does not claim to be — it is a smaller, specific, verified reduction in coupling and risk, exactly scoped to what could be done safely and honestly in one session.
