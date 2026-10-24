# Телефон ленты: только копирование — PRE-FLIGHT

Дата:25.10.2026, Алматы. Branch `fix/owned-telegram-feed-share-20261025`, starting HEAD `6a6cfa13c11a756acb79a6bbcbd722285f3e2919`, base `54cbecad`. Рабочее дерево чистое. Known-good: exact-SHA CI40133279282,3/3PASS; физическая версия с этой правкой не существует. Production SHA UNKNOWN.

Новый отчёт другого исполнителя описывает отсутствие его копии; здесь точная копия сохранена, HEAD совпал с живым PR602. Новое клонирование и обход proxy не нужны. Обязательные инструкции и связанные тесты прочитаны.

Scope: `src/screens/ExternalFreightFeedScreen.js`, `src/components/externalFreight/CarrierDirectory.js`, два существующих runtime-теста и этот журнал. Убрать звонок только в ленте/контактах, номер и отдельная иконка копируют. Оставить Share, собственный Telegram, явно заданный Telegram-контакт, закладки/фильтры/верстку и остальные модули. Общий externalPhoneURL не удалять. Риск: потерять copy/Share при изменении соседних touchable; проверить реальные callbacks обеих ролей и4языков.

Разрешение: прямое требование владельца «телефон должен просто копировать», повторное общее согласование не требуется. Graphify AST-only:14719nodes30709links, связи двух компонентов изучены; generated graph не коммитится. SQL/Gradle extraction warnings не затрагивают эту UI-правку.

Checks: новые ожидания no-dial FAIL до кода, targeted runtime+share PASS после; frontend suite/lint/web и exact-final CI. Физика и server deployment отдельно, не объявлять выполненными.

Rollback: revert нового узкого коммита; сервер/env/базы/native/магазины не изменяются. Никаких новых сборок для каждого UI-шага.

## Проверки и ограниченная матрица требований

- До правки: штатный frontend loader воспроизвёл6FAIL (обе роли и4языка контактов),17PASS. Первая попытка без штатного loader завершилась ошибкой загрузки RN/Flow и не считается воспроизведением UI-дефекта.
- После:28 адресных runtime/share/phone/envPASS; полный frontend1536PASS; lint585JS PASS; web export/finalize PASS; diff-checkPASS.
- Независимое review:APPROVE,23runtime/share testsPASS. Проверен только узкий diff; сервер/устройства не проверялись.
- Скопированы точные номера с плюсом/скобками/пробелами и без плюса; у перевозчика и номер, и иконка копируют. Открытий dialer0. Share и собственный Telegram продолжают проходить runtime callbacks обеих ролей.
- Счётчик: код `/count?include_carriers=true` дляvehicle складывает `count_active_items(vehicle)` и `list_contacts(limit=1).total`. Поэтому наблюдённое наXiaomi1324 не доказывает1324активных/уникальныхмашин. Фактический состав без runtimeDB/API не подтверждён; семантика не изменялась этим узким патчем.
- Машины/полнота40тыс./precision/recall/задержки/живойownbridge: UNKNOWN, соответствующие backend/collector не менялись. Не переносить историческийPASS на живое окружение.
- Проверка ComposioGithub connectionlist: ACTIVEнет,accountsпусты/statusinitiated. Dispatch не выполнялся. DesktopCommander после запрета не использовался. Блокер runtime остаётся, но для локальной правки он не нужен.
- Визуальные screenshots/nativeClipboard/реальные Android/iPhone: НЕ ПРОВЕРЕНО. Новый APK/IPA не создавался; production/QA2/settings/stores не менялись.
