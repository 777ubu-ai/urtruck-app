# Deal status sheet: Android navigation overlap

Preflight: isolated branch `fix/deal-status-safe-area-20261016`, base and known tested candidate `f8cf82f30c96cfd35bffe7b2fdc67c7c0fb0d227`. Graphify dependency graph inspected before editing.

Physical finding on OPPO Android 14, exact candidate QA APK SHA-256 `ae06d4c70e0d4ccd277584fc2495b42643b5465879642b8ec6b62dba32743dd0`: the next-status button bounds were [42,2226][1038,2376], while Android navigation occupied y=2268..2400. Its center activated Home. The process remained alive; this is not a confirmed crash.

Scope: add bottom safe-area padding to the status sheet using the screen's existing inset. No status transitions, handlers, authentication, push, backend, data schema or production settings change. Update the existing JSX-render test fixture with an inset because it renders the actual modal fragment. Rollback: revert this isolated layout commit; no data rollback.

Validation: full local unit suite 1252/1252 and lint passed. Physical acceptance requires a new exact-source QA APK and fresh button bounds above the navigation bar; source checks cannot prove native geometry. Original candidate remains frozen and its full physical deal acceptance is blocked.
