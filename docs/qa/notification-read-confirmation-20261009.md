# iPhone notification badge persistence — 2026-10-09

## Pre-flight and evidence

Branch `fix/notification-read-confirmation-20261009`, base `e6f8dd1`. Prior known-good physical evidence establishes delivery and an icon badge on the owner's iPhone, not reset correctness for this candidate. Scope: notification read acknowledgements and screen UI; no server mutation, no cargo/deal deletion, no changes to chat unread, APNs credentials, flag design, or GPS. Rollback: revert the isolated correction commit. Physical acceptance remains pending.

Read-only production DB inspection for driver `5804eb84-132f-488b-9eff-f8cc732471ea` found 10 unread `reminder` and 3 unread `no_bids` entries; other-participant unread chat messages were zero. This account's known deal partners match the owner's screenshots, but the iPhone's current authenticated UID has not independently been read from the device. Consequently the 13-value match is strong evidence, not a claim that the device identity was independently proven.

The canonical badge combines unread non-chat notification rows and relevant unread chat messages. The Deals screen loads dashboards and notification paths but does not mark general reminders read when its tabs change. General reminders do not have corresponding deal-card unread markers. The installed menu lacked access to the inbox; PR #511 restores that access in source. These persistent database rows are not evidence of cached cargo cards.

## Additional reproducible defect and fix

`notificationsAPI.read/readAll` previously returned JSON from HTTP errors without checking status or explicit `{ok:true}`. Single-item handling also swallowed failures and marked UI rows read anyway. This allowed UI/DB disagreement and a badge that remained unchanged after apparent reading.

Read mutations now reject failed HTTP responses or missing explicit acknowledgements. A failed read leaves UI unread, reports the existing localized network error, and does not falsely broadcast successful reading. Successful single reads update only their item, broadcast and await one canonical badge refresh. Successful read-all performs one refresh rather than two. Late responses after account change/unmount cannot update the current screen or navigate. Account change clears the old inbox UI and triggers loading of the new owner's list. This does not claim global transport or account-token race closure.

Entering Deals alone does not mean every general notification or chat message has been read. The supported user flow is Profile → Notifications → open a notification, or explicitly mark all notifications read. Chat message read state remains room-specific; marking notification rows read does not falsely mark other rooms' messages read.

## Anti-regression checks

Graphify pre-change: 10,663 nodes, 23,583 edges; directly affected screen/API scope 8 nodes, 71 edges. SQL extractor and existing Gradle parse warnings limit the full graph's coverage.

43/43 targeted JavaScript tests passed with the established frontend loader. Twelve new behavioral cases execute the actual API and actual screen handlers in an isolated VM: HTTP 401/403/429/500, missing acknowledgement, successful acknowledgement, network rejection, account change during request, scoped item update, and read-all refresh ordering. Source lint passed for 484 active JavaScript files. Initial test invocation without the established loader failed module resolution; the correctly configured rerun passed. No physical reset PASS has been asserted.

## Remaining acceptance

Install the candidate containing PR #511 and this correction; confirm device UID. Read the informational inbox and verify server non-chat count and iPhone badge fall together. Add an unread message in another room and verify it survives unrelated notification reading. Verify pending read errors remain visibly unread; repeat with background/lock/cold start and actual push receipt. Provider configuration failures are a separate unresolved investigation, not fixed by this client correction.

The already running iOS and Android workflows were not cancelled or duplicated for this correction. This correction is not included in those frozen source SHAs.
