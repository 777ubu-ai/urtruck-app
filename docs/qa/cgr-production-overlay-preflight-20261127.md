# Production preflight — CGR online-board overlay

## Starting point

- Fix: merged PR #732 (`65c7370810593fbaadff5cf39a0eb9a9878ed9a8`).
- Allowed source files: `backend/api/borders.py`, `backend/cgr/scoreboard_service.py`.
- Public API: `https://urtruck.kz/api/v1/borders/online-board`.
- Live read-only probe on 2026-11-27: all five supported checkpoint codes returned HTTP 200 with `{"error":"Погранпереход не найден"}`. This is the old dynamic route response; it is not a valid empty board.
- `/api/version` reported backend runtime marker `1.0.50`, build time `2026-11-23 18:21`; no exact production source SHA is exposed.
- Production deploy run `45849941921` skipped its deploy job because the protected source marker is `manual_external_feed_overlay`. That overlay has no CGR modules and must not be reused for this change.
- PR #732 backend regression and release gate passed in run `45848932003`.

## Scope and data safety

The production writer may replace only the two allowlisted Python modules above. It must not copy, migrate, or delete SQLite databases, `.env`, storage, frontend files, chat, deals, GPS, or push modules. It must use the pinned-key SSH transport and `production` environment, serialize with other production deploys, and abort if the active listener/root is not the expected production service.

Before replacement, it must create a private, code-only backup of exactly those two current files, record source and SHA-256 values, restore each file into a temporary probe directory, and verify the probe hashes. It must keep the backup if deploy or smoke checks fail. Rollback restores only those two files and restarts the same API process.

No CGR data is synthesized. The online-board verification must distinguish a valid page, an empty official result, unknown checkpoint, and upstream/network failure. A valid zero result is accepted only when the official source counter confirms zero.

## Acceptance evidence

- Existing PR #732 code and CI are reused; no backend module changes are planned.
- After deploy, probe the five official checkpoint codes, the official status list, one and multiple status filters, plate search, pagination, and a deliberately unmatched plate.
- Feed diagnostics are read-only: record process CPU/RSS, SQLite journal/WAL state, query plan, page and count SQL timings, and sanitized matching backend errors. The protected endpoint also needs a real QA session; an anonymous 401 is not a feed-performance measurement.
- Verify the already released iOS 1.0.17 (133) after the API overlay. Do not create build 134 unless the existing client still has a confirmed defect.
