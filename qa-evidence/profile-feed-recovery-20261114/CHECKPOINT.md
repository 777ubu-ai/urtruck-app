# Profile/feed recovery — 2026-11-14

Preflight: branch fix/profile-feed-recovery-20261114; base 16baf761f47754811ccb8cc04632151e43ebe88f (includes existing history-preservation patch). Previous QA2 candidate f5fae81; physical acceptance not established. Production SHA UNKNOWN. Owner authorized these two fixes. Protected: production, databases, push, GPS, versions and concurrent checkout. Scope: registration.profile request timeout; external feed request reset/lifecycle; regression tests. Checks: isolated regression before/after, session recovery, feed runtime, lint and web build. Rollback: revert only this patch through PR; no data/configuration changes. No store workflow dispatch.

## Result

- Graphify AST analysis completed (14915 nodes / 33983 edges); affected profile/feed dependencies inspected.
- Optional profile now shares the bounded account JSON request (headers + body, 15 seconds); timeout returns null without discarding the verified session. Existing token/generation ownership checks remain unchanged.
- Cached filter reset replaces aborted/in-flight request. Finally releases loading only for the current sequence and owner, preventing old completions from unlocking new requests.
- New isolated request regressions 6/6 PASS; auth recovery 29/29 PASS including profile-timeout outbox resume and stale-token exclusion. Related feed/logout/outbox regression initial run 118/118 PASS; auth suite then expanded by two passing tests.
- Full unit run: 2021/2022 PASS; sole failure was the expected protected registration.js hash. Updated only its approved-scope hash with the owner's authorization and reran affected scope suite: 29/29 PASS. No tests disabled.
- Lint PASS (680 active JavaScript files); web export PASS; git diff --check PASS.
- Production, databases, push configuration, versions and store builds unchanged. No workflow dispatch.
- Physical devices, live Google/Apple/email, live push and feed-data completeness NOT RUN in this patch. No claim of resolving production/QA2 dataset differences.
- Preserve concurrent PR710 history patch; this branch is based on its exact head 16baf761. Apply this patch before selecting the next binary source SHA.
