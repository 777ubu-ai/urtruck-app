# Session / badge recovery — 11.10.2026

## PRE-FLIGHT
Branch fix/session-badge-recovery-20261011; base 644591cab3c508053ec677975670d389b6ce2c83; binary source 7ee5e908. Production SHA UNKNOWN; production runtime /home/ubuntu/urtruck/backend; production DB /home/ubuntu/urtruck/runtime/security.db. Source tests are not physical acceptance.
Scope: src/utils/authEvents.js, AuthContext.js, registration.js and targeted behavioral tests. Preserve auth rejection, explicit logout, GPS stop/revoke sequence, push cleanup and account isolation; no auth rewrite or expiry bypass. Checks: delayed old bearer 401, valid me after feature 401, network/5xx, current revoked bearer, parallel calls, logout race, existing attachments transport tests. Rollback: revert isolated code commit; metadata-only report preserved.
Production reversible cleanup: 13 old reminder/no_bids rows for account matched by six screenshot deal IDs set is_read=1; no DELETE, no deal/chat changes. Original id/user_id/type/is_read saved server-side in /home/ubuntu/urtruck/runtime/qa-backups/notification-read-20261011/before.json. Restore only these recorded is_read values if requested.
Known findings: account sessions created Oct 10/11 expire Nov 9/10; today's logout is not proven to be TTL expiry. authedFetch previously notified global expiry on any 401, including guest traffic and an old token. Server badge included 13 hidden reminders, independent of archive count.

## Result / evidence
- Targeted auth/GPS/logout/dashboard/badge regression run: 64 passed, 0 failed.
- Full frontend/unit suite with repository loader: 1162 passed, 0 failed.
- Existing attachment transport contract + initial auth run: 23 passed, 0 failed (overlaps above; do not add into total).
- Lint: 489 active JavaScript files parsed, PASS.
- Web export/finalize: PASS; working-tree build includes this auth patch. Loader/deprecation warnings remain.
- The queued logout test executes the actual signOut function and verifies zero GPS/logout side effects after a newer sign-in or changed auth generation. Existing GPS stop assertions remain intact; their function locator was updated for the new optional ownership arguments.
- Production cleanup changed exactly 13 service rows; remaining unread non-chat service count was 0, 8 active account deals retained. The mobile badge may still include real unread messages. No physical refresh screenshot obtained.
- Cleanup is one-time only: future scheduler reminders/no_bids still participate in the existing canonical badge policy. No scheduler or badge formula changed.
- Client patch: guest/no-bearer or old-bearer 401 cannot trigger logout. A feature endpoint 401 is checked against the same current bearer via raw /register/me fetch; only a confirmed current 401 can initiate scoped logout. Network/5xx/5s timeout preserve local session. The original response is returned; failed writes are not retried. Validation adds at most 5s to a feature 401 response.
- Real expiration/revocation still requires sign-in; no indefinite credentials or relaxed server authentication. Production mixed 200/401 logs at screenshot time are insufficient to establish the exact cause for the installed client's failures.
- NOT DEPLOYED: no production frontend/backend auth files changed, no native binary rebuilt or store submission changed. Independent enhanced Auth review and final CI required before release under ENGINEERING_CONSTITUTION section 6.
- Production frontend served by nginx from /home/ubuntu/urtruck/frontend, not a Node process. Production source SHA remains UNKNOWN. A reviewed web-only rollout must back up this directory, preserve old hashed assets and .well-known/legal contracts, publish assets before atomically replacing index.html; rollback restores the backed-up index/assets. Native iOS/Android requires a new reviewed build.
