# Push read/badge recovery PRE-FLIGHT
Branch: fix/push-read-badge-recovery-20261008. Base: fe54ef48 (voice recovery preservation), app candidate base 6bba4163, installed Android 213622903. Production exact git SHA UNKNOWN.
Known-good: 8 translated physical messages after server recovery; voice owner-confirmed, separate from automated audio quality limitations.
Preserved production chat source hash 80619b090b46559587ceb6d3722c1cd308cbd44345d24e4748f7e1fe6ecef080; private backup verified present.
Scope: src/utils/readChatNotifications.js; visible-room successful history integration in DealWorkspaceScreenV2; behavioral tests. No auth, FSM, AI, schema, theme or navigation rewrite.
Evidence: Huawei POST_NOTIFICATION ignore persisted despite UI enabled; pm grant POST_NOTIFICATIONS yielded allow. Banner enabled via system UI. New physical background push delivered and opened chat after group expansion. Older same-room notifications remain after read. Source has no dismissNotification call.
Checks: Graphify AST-only completed; targeted read/dismiss race + other-room protection + appBadge/push/chat suites, lint, physical regression after a single necessary client build.
Risk: OS notification state races. Bound to request-start timestamp and current room/session/focus; failed history never dismisses. Preserve other-room and newer notifications.
Rollback: revert isolated client commit; retain previous installed Google-signed build and production voice config. Device original Huawei denied permission recorded; intentional notification enablement is not reverted unless requested.

Additional scoped compatibility: installed Expo SDK reconstructs background FCM as foreign_notifications and loses custom data; verified in local ExpoPresentationDelegate.kt. Production FCM sends random tags. Guarded server patch adds chat:ROOM native tag only for chat messages/attachments, while candidate provider already uses that collapse tag. Client safely parses this tag, never guesses by title/body. Preexisting random-tag notifications cannot be safely assigned to a room and remain excluded from automatic removal.

Second confirmed server/client mismatch: installed client calls /notifications/badge; deployed API has no route, so refreshAppIconBadge cannot update tab/icon state. Add only the authenticated GET, delegating to deployed _compute_recipient_badge already used for native push. No migration or unread writes. Protected by original notifications.py source hash 0b9fc184e5a2ae615d0d75be8b1a0c324efc49409f4a3ee8f5ebe261c8268838.

## Applied server compatibility
Native chat-tag patch APPLIED, backup /home/ubuntu/urtruck-push-recovery-backups/20261008T162158Z; patched SHA256 cbda81eb8a8e5b9c62a617fb5010c9af5577643da1b8543da498d4ce846afe56.
Authenticated badge endpoint APPLIED, backup /home/ubuntu/urtruck-push-recovery-backups/20261008T162406Z; patched SHA256 235871e8dc7ba05d4f43b7e5deb9b52f96bc13ce7797edaa8a37050f6f7ee084.
Both API restarts passed health; AI configuration unchanged.
Rollback: python3 /tmp/urtruck-production-chat-notification-tag.py --rollback TAG_BACKUP, or --badge-compat --rollback BADGE_BACKUP respectively.
Client dismissal candidate: 19 behavior/race/badge/push tests + 33 contract tests + 13 notification/token registration tests PASS; source lint 477 files PASS. Physical dismissal pending new client build.
