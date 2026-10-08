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
