# Shipper card release check

Acceptance for the 16.08.2026 shipper-side visual repair.

- Legacy emoji flags are stripped from place values before the UI adds country flags.
- A normal route renders at most origin + destination flags (2 total).
- Multi-point legacy text such as `Калжат ↔ Дулаты` stays text inside the origin segment; no orphan flag row.
- ~~Machine cards use the same Save metaphor as driver cargo cards: outline bookmark when not saved, filled emerald bookmark when saved.~~
  **Reverted 2026-08-19**: bookmark caused a production visual-inconsistency
  bug against `FavoritesScreen`'s heart icon. Machine cards use a heart
  (outline when not saved, filled emerald when saved) — same as driver
  cargo cards and the Favorites list.
- No red/white heart **emoji** is used for favorite state (it's a themed
  Feather `heart` icon component, not a raw emoji glyph).
- Route receives the full primary width of a machine card; price is secondary and lower.
- Machine-card price is neutral text, not orange.
- My cargo route typography is increased and its price is neutral text.
- Deals inherit the same normalized place display, removing embedded-flag duplication there too.
