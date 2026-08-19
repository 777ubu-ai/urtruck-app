# UrTruck — offer expiry 2026-08-20

## Product rule

- `pending` / `countered` bid is actionable for 48 hours from its last activity (`updated_at`, fallback `created_at`).
- Pickup/departure date is a hard ceiling. A listing remains valid through that calendar date; starting the next UTC date, an active listing without an active accepted deal becomes `expired`.
- Expired bids are not deleted. They become `expired`, leave **Offers**, and remain visible in **Archive**.
- A counter/update resets the 48-hour activity window.
- Accepted bids/deals are never auto-expired or auto-cancelled by this cleanup.
- Re-publishing an expired listing does not revive old expired bids.
- Cargo `bids_count` is reconciled to the real number of `pending` / `countered` bids after expiry.

## UI contract

- Active offer cards show remaining lifetime rather than an old activity date.
- `expired` is displayed as **Истёк / Expired / 已过期 / Мерзімі өткен** through the existing i18n status keys.
- Client-side freshness filtering is only a safety net; backend state remains the source of truth.

## Validation target

- 48-hour TTL.
- Last-activity reset.
- Past cargo date.
- Past trip date.
- Current-day boundary.
- Accepted-deal protection.
- Idempotent cleanup / no duplicate expiry event.
- RU / EN / ZH / KK countdown copy.
