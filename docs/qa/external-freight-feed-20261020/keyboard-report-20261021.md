# Keyboard visibility — 21.10.2026

Base: 7dfa8a332cb5bb687537fffb0db26da6989178f0. Scope: existing canonical keyboard layout used in external-feed filters, shared BottomSheet and driver expense form. No redesign, navigation/backend/GPS changes or deployment.

## Physical evidence before patch
Xiaomi BUA6JB99T465Q49X / com.urtruck.app.qa2 / 214494460, firstInstallTime 2026-08-31 unchanged. At 17:36 Almaty, From picker input Tashkent and result Ташкент stayed above visible native IME. At 17:40, price filter min/max fields and Apply were covered by visible native numeric IME. Screenshots in keyboard-evidence/ are genuine device captures, NOT patched-build acceptance. Search entry was discarded without selecting a city; price draft was cancelled without applying. No business records changed.

## Fix
External filter Modal now composes KeyboardSafeLayout and a shrinking KeyboardSafeScrollView; Apply remains outside the scroll body. Shared BottomSheet uses the same existing primitive instead of assuming Android adjustResize always works. Expense form uses the same layout/scroll primitive. No new per-screen IME offsets or SDK/dependency changes.

## Verification
- 16 shared keyboard/primitives/filter-theme contracts PASS.
- 20 expenses/runtime/edit-cargo/keyboard contracts PASS after updating obsolete wrapper assertion and adding the shared-wrapper mock; behavior assertions retained.
- External feed E2E: 4 existing scenarios PASS; new short-viewport price scenario PASS after correcting its fixture to select a currency before applying a price range. Price and range validation were not weakened.
- Shared marketplace BottomSheet short-viewport input/action scenario PASS.
- 6 driver-expenses E2E scenarios PASS.
- Lint: 561 active JavaScript files parsed, PASS. QA2 web build PASS. git diff --check PASS.
- Web viewport resize is NOT a native IME test. Native acceptance of the patch on Android and iPhone remains pending.

## Integration
No new APK launched during this task: existing concurrent run 39600511731 uses workflow head 7839a623 and must NOT be assumed to contain this patch. PR568 has advanced independently; do not overwrite its newer changes or the unrelated dirty implementation-checkpoint.md. Cherry-pick this keyboard commit onto the final candidate before a consolidated native build, then identify actual source/build and retest.

## Remaining verification
On rebuilt Android and iPhone: external min/max price + Apply above IME, shared marketplace price, expense amount/date/multiline note + Save, keyboard switching, short viewport and enlarged font; dismiss/reopen retains expected drafts. Audit remaining custom keyboard containers separately (DealWorkspace has a special composer contract; RatingModal, EditCargoModal and VerificationStepLayout require scenario-specific native checks). No claim that every app page has passed.

Status: source fix + targeted web checks PASS; patched native binary and universal keyboard acceptance PENDING. Rollback: revert only this task commit, with no data/server rollback.
