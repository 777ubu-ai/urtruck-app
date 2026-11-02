# Общий кандидат UrTruck за 30–31 октября 2026
Статус: интеграция подготовлена, выпуск НЕ принят.
PRE-FLIGHT: отдельная integration/urtruck-release-20261031; base a0af68b7743469f7f163ebaa41c4a40ac5e464a4. Production SHA UNKNOWN. Known-good physical для объединённого кода отсутствует.
Авторизация: владелец попросил собрать вчерашние и сегодняшние исправления в одну ветку. Исходные ветки и qa2/integration-candidate не изменяются. Откат интеграции: закрыть draft PR и продолжать с прежней основы; сервер и данные не менялись.

## Состав
- Основа a0af68b7743469f7f163ebaa41c4a40ac5e464a4: объединённый PR653, девять UI-языков и GPS-пауза PR652.
- PR651, 12eb889d534da19b485d999de370d5b8eddb87b4: лента без периодического опроса, диагностика переводчика, включая PR658.
- PR661, 557da97173cd47a2f457f345ea6361ac9c9d8689: наследует PR651, ограничивает retention двух временных CI-отчётов.
- PR660, e3500e69735a747ddf332c2793c282b86f023d59: карточки FEED03/WhatsApp/Share, исправление expired ACK, пакетные записи, health и scoped deploy, строгий preflight.
- PR659 не добавляется: альтернативный путь диагностики QA2 уже заменён в PR651; его нельзя механически накладывать поверх актуального workflow.

## Метод объединения
Дерево PR661 используется как основа. Наложены все 61 изменённый путь PR660, включая бинарные evidence без повторной генерации.
Два пересечения относительно общего предка объединены git merge-file:
src/screens/ExternalFreightFeedScreen.js и tests/frontend/test_external_freight_resume_runtime.mjs.
Оба завершились exit 0, без маркеров конфликтов. Сохранены изменения обеих сторон, включая удаление минутного polling и действия карточки.
История сохраняет обе исходные вершины родителями интеграционного коммита. Это отдельный draft-кандидат, не promotion и не принятие красных source PR.

## Проверки
12 PASS / 0 FAIL:
node --test tests/frontend/test_external_feed_card_actions_locale.mjs tests/frontend/test_external_freight_phone.mjs tests/frontend/test_qa2_external_feed_deploy_workflow.mjs
Whitespace-check двух объединённых файлов PASS.
Полный install/backend/frontend/lint/build/E2E и исполнение resume/entry VM-тестов в этой облегчённой среде НЕ выполнены: нет @babel/core и соответствующих плагинов; это не PASS этих сценариев.
Проверка Git деревьев: 2251 entries PR660, 2212 entries PR661; оба ответа полные, truncated=false. Состав переносимых файлов определён сравнением с одним общим предком, а не датой изменения файла.

## Блокеры и продолжение
После сообщения владельца об очистке выполнена одна повторная попытка CI41214295912: attempt 2 снова failure, у трёх job нет выполненных steps. Наличие свободного хранилища не доказывает снятие billing lock. Сами caches и billing в этой проверке не читались.
Нужен успешный CI на точном объединённом SHA, затем QA2 promotion/deploy, два часовых баланса, видимость грузов/машин и устройства.
UI-языки не означают 9 языков inference: подтверждение RU→ZH и новых направлений всё ещё требуется.
В app.json основы записаны version1.0.12/iOS114; EAS appVersionSource=remote. Перед бинарниками сверить ASC/Play/EAS: в отчёте PR653 уже указаны production1.0.13(123) и QA2 IPA1.0.14(124). Не собирать магазинный откат по старому app.json. В этом коммите номера не меняются.
Прямого SSH, EAS/store credentials и устройств в executor нет. Новые APK/IPA, deploy, списания, Production/store submission не выполнялись.
