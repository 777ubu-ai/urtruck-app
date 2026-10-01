# Canonical unread badge contract

The authoritative value is `GET /api/v1/notifications/badge`. The same integer
must be used by the Deals tab, the FCM/APNs payload and the launcher icon.

Included:

1. Every unread durable `notifications` row except `chat_message` and
   `chat_attachment`. The database `event_key` uniqueness rule prevents one
   business event from being counted twice.
2. Every unread, non-system message sent by the other participant in a chat
   that is standalone or belongs to an active deal with status `accepted`,
   `in_progress`, `at_border`, `awaiting_confirmation`, `delivered` or
   `received`.

Excluded:

- the durable notification mirror of a chat message or attachment;
- the user's own messages and system messages;
- unread history in completed, cancelled, rejected or expired deals.

Reading an event removes it from the count through the corresponding server
read operation. The client must not invent a local reset to hide disagreement.

Some Xiaomi launchers reject Expo's numeric badge call with
`ShortcutBadgeException` / `android.intent.action.BADGE_COUNT_UPDATE`. In that
case the canonical server value and the in-app Deals number remain valid, while
the launcher-number result is reported as `launcher_badge_unsupported`; it is
not recorded as a successful zero.
