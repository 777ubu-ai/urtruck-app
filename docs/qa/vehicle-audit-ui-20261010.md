# Vehicle UI audit fixes — PRE-FLIGHT 10.10.2026
Branch fix/vehicle-audit-ui-20261010. Base/HEAD before changes 1fcf04477483d8948fef32437dced7501a82ec8c. Production SHA UNKNOWN; Huawei Android12 com.urtruck.app 1.0.9 (213702394).
Physical findings: vehicle-save button partially covered by three-button system navigation; own vehicle cards show т/м³ in Chinese.
Known-good: same production profile translates Chinese units correctly; vehicle list and form navigation preserve existing vehicles. No physical known-good save-footer commit is confirmed.
Scope: src/screens/vehicle/VehicleSetupCountryScreen.js (safe bottom), src/screens/vehicle/VehicleChooserScreen.js (unit labels); regression test and test-only inset mock. Two distinct patches/commits.
Protected: Auth, registration requests/requirements, vehicle persistence, navigation routes, backend, FSM, GPS, chat/documents, production runtime/data, payments.
Graphify AST-only: 10311 nodes /22733 edges; affected screens share useVehicleCopy/useVehicleSetupStyles; retain these hooks and their behavior. SQL extractor/Gradle limitations recorded; no database/native edits planned.
Risk: extra bottom spacing/zero-inset web; language units. Test rendered footer at bottom insets 0/24/34/48; existing vehicle/theme/country tests; lint/web build on final candidate.
Rollback: revert the corresponding fix commit in this unprotected branch; no deployed runtime/data migration to undo.
Evidence directory Mac /tmp/urtruck-production-audit-evidence-20261010/screenshots. Physical candidate installation and iPhone acceptance pending.

Footer patch: before fix 3 rendered inset cases FAIL, web zero-inset PASS. After fix all 18 related tests PASS (4 rendered footer + vehicle flow/theme/country search). Physical new APK acceptance pending.

Unit patch: rendered vehicle card tests before fix FAIL for ZH/EN, PASS for RU/KK. After localized labels all 22 related tests PASS, including 8 rendered regressions. Backend requests/data/routes unchanged.
