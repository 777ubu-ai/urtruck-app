# Foundation V2 Integration Dependencies

Status: Checkpoint 1, runtime switch OFF.

The four named fix branches are not present in this worktree and are not merged here. Their acceptance must produce a new stable integration baseline before the adapters below become authoritative.

| File / area | Current owner-agent | Foundation V2 plan | Conflict point |
|---|---|---|---|
| `backend/api/auth_otp.py`, registration/auth flow | `fix/security-otp-coldstart-20260905` | Keep legacy route; later expose Auth contract and characterization comparison | OTP startup, auth state, security checks |
| `backend/api/marketplace.py`, bid/deal/FSM writes | `fix/deals-bids-concurrency-20260905` | Add Deals/Bids contracts and adapter; do not copy current implementation as canonical | Accept, status transitions, SQLite locking and invariants |
| `backend/api/chat.py`, `backend/api/deal_room.py`, push/voice services | `fix/voice-push-outbox-20260905` | Keep Chat/Voice legacy path; consume stable domain events only after Phase 1 | Message send, voice finalize, push side effects |
| `backend/main.py`, deployment/geocatalog files | `fix/deploy-geocatalog-release-20260905` | No runtime edits in Checkpoint 1; re-map after accepted baseline | Route registration and release configuration |

## Working rule

No file listed above is migrated or rewritten in Checkpoint 1. New contracts are dependency-injected and unconnected. If a future change overlaps an active fix, stop and rebase the architecture decision on the accepted integration baseline.
