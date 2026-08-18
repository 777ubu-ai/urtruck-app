# Shipper card release check

Acceptance for the 16.08.2026 shipper-side visual repair.

- Legacy emoji flags are stripped from place values before the UI adds country flags.
- A normal route renders at most origin + destination flags (2 total).
- Multi-point legacy text such as `Калжат ↔ Дулаты` stays text inside the origin segment; no orphan flag row.
- Machine cards use the same Save metaphor as driver cargo cards: outline
  bookmark when not saved, filled emerald bookmark when saved. **Owner-
  confirmed 2026-08-19** as the canonical icon — `FavoritesScreen` was the
  odd one out using a heart and is now bookmark too, for consistency.
- No red/white heart is used for favorite state anywhere (bookmark only).
- Route receives the full primary width of a machine card; price is secondary and lower.
- Machine-card price is neutral text, not orange.
- My cargo route typography is increased and its price is neutral text.
- Deals inherit the same normalized place display, removing embedded-flag duplication there too.
