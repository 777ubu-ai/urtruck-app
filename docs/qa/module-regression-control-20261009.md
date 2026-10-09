# UrTruck: module boundaries and regression control

Owner request: 2026-10-09. Extend existing ENGINEERING_CONSTITUTION and GOLDEN_BASELINE; do not replace them or move working code during release recovery.

## Pre-flight

Branch `fix/store-regression-gates-20261009`, original base `b7e218b`; incorporates notification-read fix as `830c1a9`. Scope of this change: three CI workflow dependencies/triggers and module/defect records. Protected: business logic, database, production API, existing submitted builds, iOS signing, flags, GPS permissions. Rollback: revert the isolated workflow/document commit. No production settings or branch protections changed.

## Logical modules — labels, not a bulk folder migration

| ID | Responsibility | Existing primary code | Required adjacent checks |
|---|---|---|---|
| A1 | Driver login and registration | onboarding/, registration/, AuthContext.js, registration.js | session recovery, role switch, A2/B1, S1 |
| A2 | Driver vehicles | screens/vehicle/, utils/vehicleAPI.js | authenticated save, list/reload, editing, keyboard; A1/A3 |
| A3 | Driver routes | MyTripsScreen, CreateTripScreen, EditTripScreen | vehicle selection, countries, publication, withdrawal; A2/A4/B2 |
| A4 | Driver offers and deals | DealsScreen, DealWorkspaceScreenV2, market API | bid/counter/accept, counterpart visibility, statuses; B3/S2/S3 |
| A5 | Driver trip tracking | backgroundLocation, deal location gate | explicit trip start, permissions, GPS stop; A4/B4 |
| B1 | Shipper login/profile | shared onboarding and AuthContext | same authenticated identity, role boundaries; A1/S1 |
| B2 | Shipper cargo | CreateCargoScreen, CargoFeedScreen, cargo detail | publish/edit, countries, currency, both parties; A3/B3 |
| B3 | Shipper offers/deals | shared DealsScreen and deal workspace | accept once, shared room, role-specific actions; A4/S2/S3 |
| B4 | Shipper tracking/documents | deal workspace and access APIs | access as owner/counterparty/third party; A5/S4 |
| S1 | Shared identity/session/API | AuthContext, registration, authEvents | both roles, logout, token expiry, account-switch races |
| S2 | Shared push/unread | push gateway, notifications API, appBadge, inbox | provider acceptance, device receipt, scoped read, other rooms, stale replies |
| S3 | Shared chat/translation/voice | chat APIs/workspace and AI services | RU↔ZH text and actual voice, numbers/time/price, read state |
| S4 | Shared documents/maps/GPS | existing dedicated utilities/APIs | authorization, attachments, tracking lifecycle |
| S5 | Shared countries/design | i18n, country catalog and flag components | 249 countries, save/reload, RU/ZH/EN/KK, approved flag dimensions |
| S6 | Build/release | GitHub workflows and release scripts | exact source SHA, native identity/config, Android 16 KB, iOS signing |

Shared services remain shared: copying Auth or Chat into role folders would create two implementations that drift. Codes A/B/S identify ownership and affected areas; actual paths remain authoritative. Each critical PR must list directly changed and dependent module IDs. An individual fix branch and immutable candidate SHA provide code isolation; folders alone do not.

## Confirmed enforcement gap

At inspection, PR Quality Gate only triggered for pull requests targeting main or qa2/integration-candidate. Stacked PRs targeting working branches were not covered by that trigger. deploy-play.yml and the canonical testflight-local.yml did not depend on the existing reusable full quality gate. Main required status checks existed, but required approving review count was zero and enforce_admins was false. These facts identify a verification bypass; they do not prove which change caused a particular device defect.

Change: remove the PR target-branch restriction. Both canonical store workflows must wait for the existing reusable Backend / Frontend / mandatory E2E quality gate before building/uploading. Read-only download of an existing Google-signed APK retains its independent path, without unnecessary rebuild or full test rerun. A failure/skipped gate blocks the build job through its ordinary `needs` dependency; no continue-on-error or always bypass is introduced.

This is enforced by those workflows after incorporation. It does not retroactively gate already dispatched runs or automatically cover arbitrary copied workflows (including earlier frozen iOS build branches). It does not create independent human review, alter GitHub permissions, or prove physical acceptance. Managers must not treat a successful build as a complete release approval.

## Control and evidence

Implementer: minimal patch + regression test, exact SHA and affected modules. CI: automatic backend, frontend/lint/web, mandatory E2E checks; native checks stay in each build. Critical review: a second reviewer must inspect risks and evidence; current GitHub settings do not enforce that requirement. Release manager: confirm device acceptance and store declarations against the exact artifact before public release. No named reviewer is invented or assigned without agreement.

One immutable source SHA per candidate; record all included fixes. Fixes made after a build dispatch require a new candidate and cannot be claimed to be installed in the earlier build. Avoid mixing server deployment status, code status, test status and installed phone version.

## Current defect register — keep release limitations visible

| Defect | Evidence/status | Required closure |
|---|---|---|
| Vehicle save shows session expired on iPhone | Owner screenshots 15:07–15:08; root cause unknown | Correlate HTTP response/session with actual installed SHA; preserve draft on re-login; verify save/list/reload |
| Vehicle numeric input obscured by keyboard | Owner screenshot; device repro pending | Focus/scroll both fields and save button on real iPhone; adjacent forms regression |
| General notification badge 13 without deal unread | DB for known driver: reminder10 + no_bids3, chat unread0; device UID not independently read | Accessible inbox, confirmed read and badge convergence on device; preserve unrelated chat |
| Read UI accepted failed server acknowledgement | Actual API/handler tests reproduced; PR #512 corrected source | Install correction and prove physical reset |
| APNs provider_not_configured attempts | Production telemetry recorded; historical origin unresolved | Determine emitting process/config and verify all message/event paths |

These are unresolved limitations, not grounds to claim 10/10. Stop unrelated feature work while release blockers remain. Public release requires the existing constitution's critical path and device evidence. Preparing a build/store draft is not public acceptance.

## Validation of this change

Parsed all three modified workflow YAML files and checked build `needs: quality-gate`, canonical reusable workflow reference, absence of failure bypass and unrestricted PR target branches. Read-only APK download remains independent. Full local frontend/unit command: 1131/1131 PASS, zero failed/skipped. Source lint: 484 active JS files PASS. This is local verification against the source tree; native MapKit dependency installation and physical validation are separate. Backend/E2E CI run results are not yet claimed.
