# Keyboard visibility — preflight

Branch feat/external-freight-feed-20261020; base 7dfa8a332cb5bb687537fffb0db26da6989178f0. Production SHA UNKNOWN for this task; no deploy.

Known evidence: Xiaomi BUA6JB99T465Q49X, com.urtruck.app.qa2 214494460. Direction search field, typed Tashkent and result remain above real IME (PASS for this scenario). Price filter fields and Apply are hidden by real IME (FAIL). Evidence /private/tmp/urtruck-keyboard-audit-20261021/{direction-keyboard.png,price-keyboard-before.png}.

Scope: ExternalFreightFeedScreen.js price/filter modal, shared ui/v1/BottomSheet.js and DriverExpensesScreen.js form use existing KeyboardSafeLayout/KeyboardSafeScrollView. No redesign or new keyboard calculations. Preserve navigation, chat, authentication, GPS, backend, existing data and unrelated dirty files. Risk: shared sheet resizing/scrolling affects callers; verify existing contracts, lint and web build, then native retest on a rebuilt binary. Historical APK is not proof of the patch.

Checks: shared keyboard contracts, shared primitives, filter theme, external feed UI E2E; lint and QA2 web build. Native acceptance pending new APK; iPhone remains separate.
Rollback: revert only this task's commit; no data or server configuration changes.
