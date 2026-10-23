# Feed recall PRE-FLIGHT — 2026-10-23
- Branch: fix/feed-recall-formats-20261023; base/runtime 84e8ef7b0644978aa71f8085b35e6e1a6bcecffd.
- Known-good: previous Android APK 214494469 owner-tested on Huawei/Xiaomi; new backend physical QA not inherited.
- Production SHA UNKNOWN; observed /api/version fingerprint unchanged in prior QA2 rollout.
- Scope: explicit cargo labels, empty-vehicle intent, unambiguous compact city-pair routes, regression tests.
- Protect: existing active parser outputs, per-block contact ownership, dates/TTL/source IDs, dedup/ACK, collector/session, schema, Auth/Deals/UI, production.
- Checks: reproduce synthetic failures; existing parser/collector/bridge tests; aggregate read-only shadow; exact-head CI before QA2 apply.
- Rollback: code-only via standard QA2 backup/rollback. Never restore stale DB over current queues.
- 24-hour read-only evidence: 12424 messages, 4017 unique normalized texts, 8407 repeated copies (67.7%).
- Classifier unique texts: cargo 1707, vehicle 6, unrecognized 2261, split 16, review 24, mixed 3.
- Count conversion is not message recall: timeframe, duplicates and multi-ad blocks differ. Do not target 50–70% raw input by publishing spam.
- Inspected at most20 redacted examples of latest-version unrecognized/direction cases. No raw Telegram texts or contacts included in git.

## Candidate checks
- 137 pure regression tests PASS, including vehicle supply/collector, bridge and existing review constraints. Unknown unlabelled cargo city-pairs remain review; compact hyphen pairs require two known literal names.
- New negative tests cover single hyphenated cities, multi-city lines, unknown places, sale/repair/questions, promotional prose and shared contact headers.
- No live runtime or queue mutations. Full same-window shadow and exact-head CI pending.

- Same-window shadow: 12453 raw messages, 4025 unique normalized texts, 143 recovered unique messages (354 source copies); 213 candidate cargo segments +1 vehicle segment before global dedup; distinct candidate active texts 720→869. All1514 active outbox payloads unchanged. No lost active messages or parse errors detected in candidate set.
- Parser revision v4 enables bounded normal reprocessing through the existing queue; no queue schema or delivery logic change.

- Final guard update: 141 tests PASS. Mixed arrow/compact lists are split with existing per-block contact rules; question marks/alternative slashes do not confirm compact routes. Previous shadow metrics belong to prior candidate; refresh before apply.

- A broad mixed-route candidate was rejected by shadow (81 existing active outputs changed); it was never deployed. Final scope applies mixed-format handling only to newly recognized intents and preserves established routes.
- Final shadow:12489 messages/4031 unique,144 recovered unique messages,365 source copies; distinct candidate active texts716→866. All1522 active outbox payloads unchanged; no lost active messages. 141 tests PASS. Exact-head CI and queue preview remain mandatory.

- Concurrent QA2 update #579 (3efde675) integrated normally: retained source_date priority for fresh arrivals and explicit vehicle origin from cargo-search phrase. Revision advanced to distinct recall-v5. Only parser-revision conflict resolved; no force push. Revalidate merged candidate before activation.
- Integrated candidate:146 pure tests PASS, including new #579 freshness/location regressions.
