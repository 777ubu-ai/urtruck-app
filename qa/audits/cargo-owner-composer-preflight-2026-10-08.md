# Cargo ownership and composer preflight — 2026-10-08

Base: `5c447541bfab8a27f56a86ca0a8aa1a7c8abb8ea`, release branch `release/appstore-1.0.9-1fcf0447-20261008`. Isolated worktree; owner and device working copies untouched. Production runtime SHA was not established in this check. Installed QA2 iOS build 90 is from a different SHA and does not contain this fix.

## Confirmed UI defect and fix

`MyTripsScreen` opened own cargo without `isMine`; `CargoDetail` stored but did not use authenticated `/bids` `is_owner`. This could show “Предложить цену” on own cargo. The navigation now supplies ownership, and the detail uses the server verdict scoped to cargo and current account. A server `false` overrides a stale navigation flag. A verdict from another cargo/account cannot grant owner controls. Backend self-bid rejection and authorization remain unchanged.

Scope: `src/screens/MyTripsScreen.js`, `src/screens/CargoDetail.js`, one runtime regression file and this journal. Graphify AST analysis completed before edits: 10,313 nodes / 22,745 edges. Optional SQL and Gradle parser warnings do not affect the JS paths changed. Generated graph output is excluded from the commit.

## Verification

- New regressions before fix: 3 PASS / 4 FAIL; after fix: 7 PASS.
- Ownership, bid CTA/race/price and existing composer runtime/visibility regressions together: 35 PASS / 0 FAIL / 0 SKIP.
- `node scripts/lint-source.mjs`: PASS (475 JS files parsed).
- `git diff --check`: PASS.
- Runtime ownership regressions execute the actual source closure/navigation payload; normalization is mocked. They do not render native UI or call the deployed API.

Command: `node --experimental-loader ./tests/frontend/loader.mjs --test tests/frontend/test_cargo_owner_runtime.mjs tests/frontend/test_cargo_taken_bid_cta_contract.mjs tests/frontend/test_cargo_closed_after_race_contract.mjs tests/frontend/test_cargo_single_active_bid_price_contract.mjs tests/frontend/test_deal_composer_runtime_regressions.mjs tests/frontend/test_ios_chat_composer_p1.mjs tests/frontend/test_deal_chat_composer_visibility.mjs`.

Unchanged successful backend/full frontend gates were not repeated. No mobile build, merge, deploy or device action was performed in this check.

## Composer assessment

Existing `DealWorkspaceScreenV2` implementation retains a multiline input, bounded 44–104 height (up to four lines), shrink on deletion, internal scrolling at the maximum, accessible send/attachment controls, draft storage, and incoming-message reconciliation. The iOS height normalization already avoids double-counting vertical padding. Composer source was not rewritten or changed here. These tests cannot establish absence of visible iPhone flicker, keyboard overlap or native focus loss.

## Integration and rollback

Publish this as a separate PR on the release branch; review and integrate before the final production builds. Pin the resulting common SHA and verify production API host in both artifacts. Run only affected checks and required release gates on changed composition. Do not claim previous CI for a new SHA.

Native acceptance: own cargo hides bid CTA; foreign cargo retains allowed bidding; switching cargo/account cannot reuse ownership. Composer: 1–4 lines, long insertion, deletion, incoming message while typing, keyboard hide/show, background/foreground, cursor/focus and send availability on both platforms.

Rollback: revert the ownership fix commit. No schema, data or server configuration change is involved. Public release readiness and native acceptance remain separate.

## Android crash follow-up (11:59 Almaty)

Owner photos IMG_1924.jpeg / IMG_1925.jpeg show `Cannot read property 'contentSize' of null` with DealWorkspaceScreenV2 and basicStateReducer in the stack. Read-only ADB confirmed both connected OPPO and Huawei have `com.urtruck.app` versionCode 213298108 / versionName 1.0.9. The previously identified source for that artifact, aaef50ff, reads `event.nativeEvent.contentSize.height` inside a deferred functional `setInputHeight` updater (lines 1887–1891). Releasing the event before the updater executes can produce exactly this failure. Artifact sourcemap symbolication has not been performed.

The release-base implementation already snapshots `event?.nativeEvent?.contentSize?.height` synchronously, normalizes it and passes a number to setComposerHeight. No further production source patch was needed. Added a regression executing the current real callback, releasing nativeEvent before deferred state work and verifying the measured height survives. Targeted new regression: 1 PASS; existing successful scenarios not repeated. Installed devices have not been updated by this follow-up; native crash resolution is not yet physically accepted.

Additionally, an isolated reproduction executed the actual aaef50ff callback extracted with git show, queued its state updater, set nativeEvent to null and reproduced the contentSize exception. This establishes the source defect; it does not replace symbolication or native acceptance.

## Independent review follow-up (2026-10-08)

Security fix #502 was independently reviewed on 77da57c752c2276bd3594a21512c37b8464bab16; no findings in the two-file diff. Quality gate 37743221566 completed successfully (frontend, backend, mandatory Web E2E). #502 merged into #501 as fab911c9f38bfae79069ab7cf0a218d1aeee1f94; its tree stayed bdfe93e944d881501d9153348ed89c42bd61e356. Release/main not merged by that step.

The separate reviewer found an ownership callback dependency omission: refreshDeal retained loadBids from a previous myUserId when the account ID changed at the same cargo. The new runtime regression failed before the fix (captured local-user twice) and passed after adding myUserId to refreshDeal dependencies. Full affected ownership suite: 8/8 PASS; lint-source 475 files PASS; diff-check PASS. API/loadBids are mocked for this callback regression; the actual refreshDeal source and memoization dependencies execute. Incremental one-line fix and regression independently reviewed without findings. Composer production source remains unchanged.

Graphify AST was refreshed before this edit (10,326 nodes / 22,762 edges). New source changes invalidate reliance on prior CI as proof of the new HEAD; dispatch another exact-head gate before integration/build. Both Android production-named packages were again confirmed at versionCode 213298108; no corrected artifact was installed or push physically tested in this follow-up.
