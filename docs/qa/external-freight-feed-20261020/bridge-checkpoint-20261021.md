# QA2 Telegram publication bridge — 2026-10-21

Prepared only; not installed or enabled on server. Existing Telegram publisher and source database unchanged.

## Behavior
Separate oneshot worker reads confirmed published rows with a positive destination message ID from the existing agent SQLite database in read-only mode. New, sending, uncertain and rejected rows are excluded. Source age limit is 120 hours; replay never refreshes source publication date. Durable adapter state is separate. Seen identities cover late Telegram reconciliation even if its destination ID is older than previously delivered IDs. Enqueue is durable before seen acknowledgement. Network failure retries through the existing adapter, independently of Telegram publishing. Only exact HTTPS qa2.urtruck.kz is permitted. Source records lacking either route endpoint are review-only.

Timer template: first run after 30 seconds, then 60 seconds after each completion; at most 50 source records and 50 pending deliveries per run. No exact one-minute delivery SLA claimed.

## Evidence
- Focused bridge + existing external feed/parser tests: **44 passed**, 3 existing deprecation warnings, 1.16 seconds.
- Isolated copy replay with mocked HTTP: 875 confirmed source records scanned and acknowledged; 37 active, 838 review, 0 rejected. A further replay scanned 0. This is NOT live QA2 delivery.
- Large review proportion means parser coverage remains a launch limitation; do not switch all records active to inflate the feed.
- Source DB unchanged in focused test.
- No GPS, maps, new dependencies, mobile edits, production deploy or store upload.

## Activation prerequisites / sequence
1. Obtain the required independent API/database review for PR568, promote through its existing QA2 branch and штатный deploy. Recheck exact final SHA and CI; the bridge commit is additional to b2d35fcd.
2. Confirm feed routes exist on QA2 and EXTERNAL_FREIGHT_FEED_ENABLED=true only there.
3. Provision the same newly generated importer key in QA2 backend and bridge environment via protected configuration; never put it into git, stdout or process arguments. Backend must be restarted by the штатный deploy so it reads the key.
4. Create /home/ubuntu/urtruck-qa2/external-feed with owner ubuntu and mode 0700. Bridge environment file /home/ubuntu/urtruck-qa2/external-feed-bridge.env must be 0600. Values: EXTERNAL_FREIGHT_IMPORT_ENABLED=true; EXTERNAL_FREIGHT_SOURCE_DB=/home/ubuntu/urtruck-telegram-feed/state/feed.sqlite3; EXTERNAL_FREIGHT_ADAPTER_DB=/home/ubuntu/urtruck-qa2/external-feed/adapter.sqlite3; EXTERNAL_FREIGHT_API_URL=https://qa2.urtruck.kz; EXTERNAL_FREIGHT_IMPORTER_KEY supplied securely.
5. Install reviewed service/timer templates, run one controlled batch first and inspect authenticated role-specific feeds. Enable the timer only after confirming correctness; retain review-only records.
6. Build/install QA2 APK 214494460 once from the final mobile candidate; check direction input with keyboard, cargo/vehicle roles, bookmarks across restart, filters and translation. No clearance from old APK evidence.
7. Improve parser using anonymized approved representative messages: explicit hyphen routes, prices and multi-route segmentation need separate tests. Ambiguous records remain review-only.

Rollback: stop and disable urtruck-qa2-feed-bridge.timer, then stop its service. Preserve outbox. Telegram service remains unchanged.

Current real blocker: PR568 has no independent review; docs/ENGINEERING_CONSTITUTION.md section 6 states “Автор не подтверждает критическую работу единолично” and requires stronger review for Database work. QA2 activation and live device acceptance have not happened.
