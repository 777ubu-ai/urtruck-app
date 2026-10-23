# PR563 — обязательное применение native patches

PRE-FLIGHT: ветка `fix/qa2-native-patch-gate-20261018`, base SHA `0c6d07158f195ca24a4408be218284504f564552` (PR563). Кандидат PR561 остаётся `64cdf1c25f1fec723c7db242da630d2270f05940`; приложение, backend, UI, данные и окружения не меняются.

Known-good: package.json кандидата содержит postinstall=patch-package; штатные deploy-play.yml/build-android-apk.yml после ignore-scripts вызывают patch-package отдельно. Native GPS fixes находятся в patches/react-native-yamap+4.8.3.patch. Их сохранение обязательно для новой сборки.

Scope: только submit-android-qa2-internal.yml, его regression test и этот checkpoint. Защищены review/Environment/exact-SHA/QA2/Internal guards. Graphify-gated файлы не меняются. Проверки: воспроизведение отсутствия patch step, исполнение shell gate с успехом/ошибкой/отсутствующим patch, YAML parse и diff-check. Откат: не принимать отдельный commit или revert; данных для отката нет. Production deploy не выполняется.

Результаты: RED 3/4 PASS — новый тест воспроизвёл отсутствие native patch step. GREEN 4/4 PASS: bash реально исполняет шаг; отсутствующий обязательный patch останавливает выполнение; успешное применение пропускает дальше; exit 7 patch-package возвращается как exit 7. Порядок: после exact-SHA/QA2 intent guard, до Gradle. YAML parse PASS, diff-check PASS. Новый native binary не собирался; прежние native patch application доказательства не переносятся на будущую сборку.

Принять патч в PR563 после review до запуска Internal workflow. PR561 source и внешний вид не менялись. TestFlight, магазины, production и настройки GitHub не изменялись.
