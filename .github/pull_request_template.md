## UrTruck PRE-FLIGHT

- Task / issue:
- Branch:
- HEAD SHA:
- Base SHA:
- Current main SHA:
- Golden capability:
- Known-good SHA / QA build:
- Evidence document:
- Diff range inspected:

### Scope

- Affected modules:
- Explicitly protected / unchanged modules:
- What known-good behavior must survive:
- Why this is the minimal change:
- Rollback plan:

### Regression analysis

- Current bug/regression:
- Root cause:
- Why existing tests did not catch it:
- New/updated regression test:
- Visual baseline SHA (UI changes):
- Before/after evidence plan:

## Verification

> Write exact results. Do not write "should work".

- [ ] Governance contract
- [ ] Backend/API regression
- [ ] Frontend unit/lint/build
- [ ] Deal/FSM/security checks where applicable
- [ ] Localization RU/ZH/EN (+KK where applicable)
- [ ] Mandatory E2E
- [ ] Playwright visual audit where applicable
- [ ] Maestro contract/device flow where applicable
- [ ] Bad network/retry/idempotency where applicable
- [ ] Android physical QA where required
- [ ] iPhone physical QA where required
- [ ] Production smoke where required

### Evidence

- CI run(s):
- Devices:
- Package / versionCode / versionName:
- Physical scenario:
- Before/after screenshots/video:
- Production version/SHA:
- Logs/artifacts:

## Golden Baseline impact

- [ ] I read `docs/GOLDEN_BASELINE.md` before changing this capability.
- [ ] No GOLDEN/CI-PROTECTED capability regressed.
- [ ] I compared against the last known-good implementation before rewriting.
- [ ] I did not include unrelated refactoring.
- [ ] UI changes were compared with the Golden Design recovery point.
- [ ] If baseline status changed, Golden Baseline contains exact new evidence.

## 10/10 classification

Choose at most one, only with evidence:

- [ ] **10/10 блока** — this specific block has exact SHA/build/device PASS.
- [ ] **10/10 продукта** — all release-specific gates are PASS on this exact SHA.
- [ ] **Не 10/10** — PARTIAL / BLOCKED / regression still exists.

## Risks / blockers

- Known risks:
- P0/P1:
- External provider/config blockers:
- Release blockers:

**Final status:** PASS / PARTIAL / BLOCKED
