# UrTruck Foundation V2: Risk Register

| Risk | Severity | Evidence | Mitigation |
|---|---:|---|---|
| Unstable baseline while four release-fix branches are in flight | High | Architecture branch was created from `3281731`, current tree has many existing uncommitted changes | Do not move runtime logic until accepted integration baseline exists. Re-run AS-IS after baseline. |
| Deals/Bids/Cargo/Trips coupling in `marketplace.py` | High | One API file owns listing lifecycle, bids, accept, FSM, tracking, documents links, push fanout | Phase 1 module wrapper and characterization tests before movement. |
| Missing DB-level live deal invariant | High | Only one-deal-per-bid unique index exists opportunistically; live cargo/trip exclusivity is app-guarded | Add SQLite-safe partial indexes after duplicate audit; PostgreSQL target includes strict partial unique constraints. |
| Side effects lost after commit | High | Many post-commit `try/except: pass` push/notification calls | Generic transactional outbox. |
| Multiple unread/badge formulas | High | Chat unread, notification unread, attention state, frontend refresh utilities coexist | Notifications owner plus badge characterization tests. |
| SQLite single-writer pressure | Medium/High | Chat, GPS, push, marketplace writes share one DB | Keep transactions short; measure lock/busy metrics; consider PostgreSQL after Phase 2. |
| Chat depends on deal FSM constants | Medium | `api/chat.py` gates rooms by hard-coded deal status set | Chat should ask Deals public contract or consume `DealCreated/DealStatusChanged`. |
| Tracking coupled to deal transition | Medium | `_transition_deal` starts/stops `deal_tracking`; watchdog imports marketplace | Extract Tracking owner after Deals contract. |
| Document ownership split | Medium | Registration, profile, deal attachments, waybill in separate APIs | Documents module owns metadata/signing policies; old endpoints become adapters. |
| Translation provider coupled through chat endpoint | Medium | `/chat/translate` calls translation service and cache | Extract Translation contract; Chat stores original message independently. |
| Feature flags create dual truth | Medium | Planned V2 flags can accidentally maintain two business sources | Flags select implementation only; single DB source of truth; shadow mode logs diffs. |
| Architecture lint false positives | Low/Medium | Current code has practical legacy imports | Start lint in report-only mode; fail CI only after module boundary is active. |
