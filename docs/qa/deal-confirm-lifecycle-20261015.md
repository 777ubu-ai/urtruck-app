# Deal confirmation: source audit and regression evidence — 2026-10-15

## PRE-FLIGHT

- Branch: `fix/deal-confirm-lifecycle-20261015`, isolated from PR536 base `1080523a04a931dfe4465805e80c4a99c0e4b506`.
- Owner authorized code audit/minimal fixes. Physical phones explicitly deferred. Existing CI/device evidence is not acceptance of this new patch.
- Scope: `DealWorkspaceScreenV2`, opt-in embedded content in shared `AppConfirmModal`, targeted tests. Backend FSM, API contracts, push/unread/chat/attachments/voice/Auth/GPS and business data are protected.
- No mobile artifact, deploy, store submission, production mutation or dependency change.
- Rollback: revert this isolated patch; no data/settings require restoration. Independent review and platform acceptance remain required before release.

## Confirmed defects and fix

1. Actual callback reproduction accepted a pending confirmation after blur, generation change or unmount. A second ask replaced the first unresolved promise. Dialogs are now scoped to focused deal/room/user, cancel on cleanup, permit one pending request and reject stale dialog callbacks.
2. Even after accepting Yes, blur before the async continuation could still issue delivered/cancelled API calls. Both action paths recheck scope immediately before the request.
3. Status panel and confirmation rendered two simultaneously visible Modal hosts. Both the structural actual-JSX test and the built web baseline reproduced two hosts. Confirmation content now replaces the status panel inside its single host; other consumers keep the default shared Modal. This removes a confirmed topology defect; it does **not** establish the physical root cause of the owner's earlier phone no-op.

No server status transition/role permission was relaxed. Cancelling an accepted deal remains distinct from rejecting a counter-offer.

## Evidence and verification

- BEFORE actual-callback tests: stale confirmation/concurrent request failures; additional red reproduction of Yes→blur microtask gap.
- BEFORE actual-JSX structural test and built web driver fixture: expected one host, received two. Structural hosts are mocks; built web is React Native Web, neither is native device acceptance.
- AFTER full `npm run test:unit`: 1207/1207 PASS, including 16 new actual-source lifecycle/host checks. `npm run lint`: PASS, 502 active JavaScript files. `git diff --check`: PASS. `npm run build:web`: PASS.
- Local browser fixture suite covers driver at_border→delivered, client delivered→received→completed in RU/EN/ZH; cancellation and Escape do not send requests; one explicit confirmation sends one request; HTTP503 is visible and retry works; accepted-deal cancellation for both roles; wrong-role CTA absent; map fallback expand/chat/back. Final browser result: **13/13 PASS (26.2s)**; see `evidence/deal-confirm-lifecycle-20261015/browser-final.txt`.
- Browser requests are loopback-only, API responses synthetic, external origins aborted, service workers blocked. No production API, real deal, GPS point, push provider or device registration used.
- One earlier web run used a nonexistent chat selector; corrected to the actual map-back control. A rapid initial Escape occurred before the React Native Web Modal was active; the map scenario now dismisses through its visible backdrop and waits for zero modal hosts before interacting. Escape is separately covered after confirmation presentation. Preserve failures as diagnostics, do not count an incomplete run as PASS.
- Graphify AST-only before: 11125 nodes/24644 edges; after: 11160/24651. Known extractor limitations: 20 SQL files lack tree_sitter_sql, two Gradle files partially parsed. No LLM/extras installed; generated graph is not committed.

## Separate capacity candidate

PR537 (`f975e450cae9bb44a9e2217bd382c54af3605f51`) independently fixes the own/public list caps using paging and filters before LIMIT. Isolated synthetic tests covered 5000 cargo + 5000 trip listings and a separate 10000-profile dataset. Required CI passed on its recorded merge checkout; see `marketplace-capacity-20261015.md` on that branch. This patch does not include PR537. No assertion of 10000 concurrent sessions, native memory/FPS or production capacity follows from those tests.

## Remaining verification and owner handoff

- Native OPPO/Huawei/iOS confirmation, actual map SDK controls and original map freeze/no-op: DEVICE_TESTS_PENDING. Do not unlock phones or rebuild store artifacts as a substitute for this source result.
- GPS/ETA must use genuine authorized tracking data. Weight 10000t and repeated PDF reports require source values/attachment IDs; do not guess causes or deduplicate by filename.
- Original priorities not closed by this patch: readable trip reference/offer typography, next-action discoverability and cancellation reason when unavailable in current data. Reproduce and patch separately with regression evidence.
- PR536/PR537 and this branch must be integrated in an isolated candidate and checked on the exact resulting tree before any future build. No historical PASS carries over.
- Production push sync is a separate protected workflow; do not self-approve/bypass its environment gate. Do not clean test deals before delivery checks and separate data-cleanup approval.

Verdict: confirmed source defects repaired; native P1 closure and overall release remain NEEDS_VERIFICATION/RELEASE_BLOCKED. This is not a claim that every product defect is fixed.
