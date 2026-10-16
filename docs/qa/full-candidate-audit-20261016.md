# PR550 candidate audit checkpoint — 2026-10-16

## Identity

- Starting point: PR550 `integration/qa-unified-20261016` at `fb23ebd0572c34a889eddc9eea7bdc048db2eef7`, tree `5eb9fe1e568935c057bb9a51dd6c55cfe8f30b94`.
- Base: `qa/oppo-tabs-auth-performance-20261015` at `814c71d90d1339a2e3e989fe1ce6dbc496aae13c`.
- Fix branch: `fix/full-candidate-audit-20261016`; code patch commit `e3e015354717b2e681aced4e2db020abbaaec68c`.
- Draft PR551: base exact PR550 head `fb23ebd0572c34a889eddc9eea7bdc048db2eef7`; no merge.
- No backend, database schema source, store artifact, production setting, or user data was changed.

## Defect ledger

| ID | Priority | Evidence and cause | Fix / result |
|---|---|---|---|
| PUSH-LOGOUT-RACE-01 | P1 | Behavioral RED test modeled `/register-native` committing before its response; concurrent logout could deactivate first, then late registration reactivate the old account's token. A second controlled test showed an OS token lookup may complete after logout begins. | `src/utils/push.js` suspends callbacks/retries, invalidates the in-flight auth generation, aborts an active registration HTTP request, waits for its settlement, and refuses stale results/retries. Focused regression 17/17 PASS. Ownership checks and native FCM/APNs route remain enabled. |

## Data preservation rehearsal

Used only an isolated SQLite backup plus synthetic rows and a synthetic local PDF. The source QA fixture itself contains no existing deal/chat/attachment rows. Two full `main:app` startups returned health 200. First startup made expected one-time changes: filled null `published_at` for active cargo/trip and backfilled two conversation participants. The second startup changed no fixture fields/counts; SQLite `quick_check=ok`; synthetic file SHA-256 unchanged. This is not a rehearsal against the unknown live schema.

## Checks

Local final code patch: native push tests 17/17; unit 1248/1248; lint 508 active JS files; web export and static release checks PASS; `git diff --check` PASS. Backend code is unchanged from PR550; its candidate-specific regression subset previously passed 67 tests. Required CI status is read from the current PR head; results from older heads do not transfer. See PR551 for live check identity and conclusion.

## Risks and exclusions

- `npm audit` reports five High entries resolving to `node-forge@1.4.0` via Expo CLI/code-signing. The current advisory lists `<=1.4.0` affected and no patched version; an npm install of `1.4.1` returns 404. The proposed broad npm remediation downgrades Expo to 44.0.6, so no dependency/SDK change was made. Track separately before release.
- PR542–545 remain separate open drafts and are not ancestors or contents of PR550/551.
- Independent review, real Auth/OTP delivery, real FCM/APNs receipt, physical Android/iOS checks, full product journey, and performance acceptance are pending.
- PR551 remains draft and must not be merged until required CI and independent review pass.
