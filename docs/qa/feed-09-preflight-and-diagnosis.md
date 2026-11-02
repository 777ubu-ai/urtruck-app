# URTRUCK-FEED-09 — preflight and confirmed findings

Captured: 2026-11-02, Asia/Almaty. Server evidence timestamps are UTC.

## Preflight

- Repository: `777ubu-ai/urtruck-app`.
- Starting branch: `fix/urtruck-feed09-qa2-deploy-order`, based on the exact promoted candidate `93005791fcdacc4e4511261a3aa53faa209c9aea` (`origin/qa2/integration-candidate`).
- Working-tree user evidence files from the prior task were preserved as untracked files; none are staged by this change.
- PR #663 is merged at `e47188aaddb5ac0bba32a00a5606dd45fa972c53`. Deployment run `41413633696` used candidate SHA `93005791fcdacc4e4511261a3aa53faa209c9aea`; feed preflight and the required Quality Gate passed.
- Known-good client identity from the preceding report: Xiaomi `25078RA3EY`, Android 16; APK package `com.urtruck.app.qa2`, version `1.0.12-qa2`, versionCode `214494480`, SHA-256 `5afadb3186310490e26086883e2720d9aa0260c99498d20dc38ed8986e7468f1`. This is build identity only, not feed acceptance. Huawei/iPhone remain unavailable in the current device inventory.
- Scope of this patch: serialize QA2 API readiness and bridge startup in `scripts/qa/deploy_external_feed_candidate.sh`; add deployment-order contract regression in `tests/frontend/test_qa2_external_feed_deploy_workflow.mjs`; record findings here. Protected: shared Telegram collector/publisher, Production, user data, queues/cursors/deduplication history, and all application data outside the three QA2 feed components.
- Checks: deployment contract test, shell syntax, existing targeted FEED-06 tests, then the required CI Quality Gate before any new QA2 workflow dispatch.
- Rollback: revert only the deployment-script/test commit through a PR. If a QA2 installation later fails, use its run-scoped code backup and restore code/configuration only; never restore SQLite snapshots over newer live rows. Keep timers stopped until the restored API health/readiness check passes.

## Confirmed deployment failure cause

Run `41413633696` passed exact-source validation, feed regressions, and all three required Quality Gate jobs. The installation step copied the candidate components, then invoked `systemctl restart` for the API and both `Type=oneshot` bridges in one systemd transaction. The bridge processes therefore attempted the importer while QA2 API was restarting and before its importer route was ready.

Evidence from the run and server logs:

- `urtruck-qa2-owned-feed-bridge.service` logged `HTTPError` at `2026-11-02T08:39:41Z`; incoming logged `HTTPError` at `08:39:54Z`.
- Nginx recorded HTTP 502 for `POST /api/v1/external-freight/import` at `08:39:41Z`, `08:39:52Z`, and `08:39:54Z`. It also recorded 502 responses for unrelated QA2 notification GETs from `08:39:41Z` through `08:40:05Z`, showing a temporary API upstream outage rather than an importer-only contract rejection.
- The QA2 API process started/restarted in the same window. Public and loopback `/health` later returned HTTP 200; a read-only GET to the protected importer returned 401, consistent with route auth and not a deploy probe.
- The rollback restored the old code files. The candidate manifest and QA2-only health module are absent. No queue or database restore was performed.

The reproducible cause is the restart ordering/readiness race. The fix will stop only QA2 bridge timers, let any current one-shot finish, install backed-up code, restart the API alone, wait for both `/health` and the importer route in OpenAPI, then run incoming and owned one-shots serially. Timer states are restored only after success or a code-only rollback has restored API readiness. It will not restart the shared Telegram collector or immediately start bridge sends during rollback.

## Health/SQLite count reconciliation

At `2026-11-02T09:23:18Z`, the shared collector health JSON reported incoming `pending=340`. A read-only query of the active QA2 incoming DB `/home/ubuntu/urtruck-qa2/external-feed/adapter.sqlite3` returned:

- `pending=98` (`delivered_at IS NULL`, `quarantined_at IS NULL`, `terminal_at IS NULL`);
- `terminal_expired=242` (`terminal_reason` is `source_retention_expired` or `api_expired`);
- `98 + 242 = 340`.

The 340 value is a legacy aggregate that includes terminal rows, while the SQL pending definition excludes them. Candidate health code has a terminal-aware `terminal_clause` and regression assertions for separate pending/expired/terminal counts. The candidate QA2 health file was not installed by the failed run; current shared health is not suitable as the QA2 terminal-aware snapshot.

All 242 terminal rows have `terminal_reason=source_retention_expired` and the same `terminal_at=2026-11-02T08:39:53.228965Z`. This timestamp is during run `41413633696`, after candidate files were copied and while candidate bridge start was attempted. The live adapter file is back to SHA-256 `960eda356758c2191507b2b565e0841834fb1bd0189f1641c99d639d366642f8`, matching the old installed commit `4a524b31ac97d8ecd57e7463352160244fe7a41b`; that file has no terminal-expiry routine. Candidate adapter has the routine and terminal reason. The synchronized timestamp during the candidate deployment window is strong temporal evidence that the candidate expiry code ran before rollback, but it does not prove the full candidate was installed. These are terminal expiry transitions, not delivered or visible cards. The database was intentionally not rolled back.

At `09:26:48Z`, the active incoming DB reported pending 98, expired-pending 53, terminal-expired 242, quarantine 0; owned was empty. The prior 07:44 snapshot reported pending 270, expired-pending 236, ready 0, quarantine 0. Queue reduction from expiry is not counted as successful publication.

## Telegram publisher finding and limit

The source service `/home/ubuntu/urtruck-telegram-feed` is a separate shared runtime; its systemd command is `feed.py run`, with publisher logic in that process rather than a separate publisher unit. At `09:26:48Z`, SQLite showed 266 queued, one `sending` row whose attempt was about 6,182 seconds old, and 7,977 published rows. Across the preceding interval, the queue grew from 159 to 266 while the published total stayed 7,977. Source receipt continued and the latest collector heartbeat was fresh after its existing bounded monitor recovery.

From `08:30Z` to `09:26Z`, the collector journal contained 10 `telegram_destination_paused` events with `type=TimeoutError` and retry 60 seconds, plus one earlier flood-wait-class event. The live logger does not record which destination stage timed out (resolve, permission, history sync, reconciliation, or forward) or request duration. Because reconciliation protects the old `sending` row from duplicate forwarding, the old row must not be manually reset. The exact timeout stage remains unconfirmed; a shared collector change must be handled as a separate scope from this QA2-only installer. No new Telegram client/session or manual send was started.

## Current component identity snapshot

At `2026-11-02T09:21:59Z`, QA2 API service was active, both QA2 bridge timers were active, and the candidate manifest was absent. Backend file hashes did not form a candidate manifest: `main.py` matched candidate/old source, while classifier, adapter, queue bridge, parser, DAL, API router, and scheduler differed from candidate 930. Active adapter databases were `/home/ubuntu/urtruck-qa2/external-feed/adapter.sqlite3` and `/home/ubuntu/urtruck-qa2/external-feed-owned/adapter.sqlite3`. Both bridge env files pointed to `https://qa2.urtruck.kz`, had import enabled, and named their matching independent adapter DB; secret values were not read or emitted.

The existing QA2 deploy script does not modify `/home/ubuntu/urtruck-telegram-feed`; that collector/publisher and its health timer are explicitly protected by this patch.

## Local checks for the deploy-order patch

- `bash -n scripts/qa/deploy_external_feed_candidate.sh`: PASS.
- `node --test tests/frontend/test_qa2_external_feed_deploy_workflow.mjs`: 9/9 PASS, including readiness ordering, serial bridge starts, timer handling, scope guard, and rollback contract.
- `git diff --check`: PASS.
- Backend pytest regressions were not completed locally. The system Python environments have no `pytest`; an isolated temporary environment with pytest reaches repository `backend/tests/conftest.py` and stops because runtime dependency `fastapi` is absent. No project or user environment dependencies were installed. No backend source changed in this patch; the protected CI gate remains required before promotion/deploy.

## Status

This is a deploy-order fix prepared against the exact current candidate, not an installed candidate. No deployment has been retried. Next: commit only this script, its contract test, and this report; open a PR against `qa2/integration-candidate`; wait for required CI and approval; then run one new guarded QA2 deployment. The old run is not repeated. Two 60-minute balances and visible cards still require that installation and subsequent measurements.
