# Полный список стран маршрута
PRE-FLIGHT: fix/route-country-list-20261008 от14c2c2d9. Production app source6bba4163 / iOS91; серверный SHA UNKNOWN.
Known-good: утверждённые SVG, размеры и оформление флагов на скриншотах владельца iPhone91 и OPPO213645294.
Причина: LocationPickerModal читает geography.COUNTRY_ORDER (21 страна), а полный ISO-справочник countries.ALL_COUNTRIES уже существует. Germany/Belgium/Netherlands отсутствуют именно в списке, SVG работают.
Scope: только справочник geography, локализованный fallback названия LocationPickerModal и regression tests. CountryFlag, стили, GPS/FSM/chat/push/auth не менять.
Checks: Graphify AST-only10484 nodes/23241 edges, связанные импорты рассмотрены; regression покрытия списка/локализации/размеров + прежние visual flag contracts.
Rollback: revert этого изолированного патча; сборки/сервер/данные не изменены.
Физическая приёмка нового списка требует новой установленной сборки. Build91 не содержит этот патч; iPhone можно проверять вручную без USB.

Проверки: 20/20 coverage/filter/localization/visual-contract PASS; штатный lint478 файлов PASS; diff-check PASS. CountryFlag.js и стили не изменены. Новый список249 стран ещё не установлен на iPhone.
