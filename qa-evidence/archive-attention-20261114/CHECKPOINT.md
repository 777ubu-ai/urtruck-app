# Archive attention production hotfix

Base: origin/main 89ca9a47882d8d2c3a68aa448da9cea05f6bea8a.
Branch: fix/production-archive-attention-20261114.
Production notifications.py SHA256 e46b72982e40d628ac6107d567440e18660ebccde957bbbffd665a02cd69257d matches base. Overall runtime SHA not independently established.
Known-good: installed internal source f2f2dc24672e47740b03f907e49895ad5ddbd103 already implements archive/card attention from snapshot. Device full acceptance pending.
Observed: production attention HTTP404; badge HTTP401 without token; QA2 attention HTTP401.
Scope: additive read-only snapshot endpoint and regression tests. Existing count function, provider transport, read endpoints, databases, listings and auth unchanged.
Checks: historical events beyond 50, account isolation, chat mirror exclusion, read-to-zero, HTTP authorization and archive UI partition.
Rollback: restore backend/api/notifications.py from base via the same controlled deployment path, restart API, verify health. No data rollback.
Production not changed. Store binaries not rebuilt.

## Validation
- Related backend regressions: 35 passed.
- Installed candidate client partition tests: 12 passed, including archive and scoped read.
- AST comparison: every existing production function is unchanged. Only unread_badge_snapshot and attention_snapshot added.
- Read-only production SQLite comparison for 20 accounts with unread history: snapshot total equals legacy badge count; component sum equal. No account identifiers or content recorded. Zero DB writes.
- git diff --check passed.
- Physical post-deploy archive indicator/read behavior NOT RUN.
- Production endpoint remains absent until separately authorized deployment. No mobile build required for source f2f2dc.

## Expanded compatibility scope
Read-only production probes also confirm HTTP404 for protected media and attachment-content routes required by installed f2f2dc clients. Added the two byte routes, isolated exact-room ACL helper, bounded storage read primitives; existing function ASTs remain identical to main for chat.py, deal_room.py and storage_service.py. No upload/send/status implementation or schema changed.
Ported endpoint/storage regressions cover both participants, strangers, expired tokens, wrong IDs/categories, revoked access mid-read, replaced objects, ambiguous/unlinked historical rooms, path traversal and byte bounds. Total related backend run: 70 passed. Client screen runtime: both roles pass archive/card mapping and scoped-read preservation.
Frontend CI blockers corrected separately: node-forge 1.4.2→1.4.3 only in lockfile, exploit and valid-signature regressions pass; production smoke now verifies actual owner-approved store landing rather than obsolete phone onboarding. Local 839 unit tests, lint, web build, dependency audits pass. Existing production smoke: 3 passed, 1 preview-only skipped.
Runtime deployment must include notifications.py, chat.py, deal_room.py and storage_service.py from one checked candidate; do not deploy only attention and declare files ready. No production write performed. Physical native acceptance remains pending; Huawei still501, iPhone unavailable.
