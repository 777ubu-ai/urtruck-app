# PRE-FLIGHT: сохранение AAB в библиотеке без изменения треков

База `97529e5e53e1c5112473d15fd6f826b40c46fe52`, ветка
`ops/play-bundle-library-20261023`. Предыдущий run39979394287 остановился
до upload на `existing_other_internal_draft`. Защита сработала правильно:
черновик и файлы не менялись. Его содержимое не подменяем ради зелёного run.

Обновляем только операционный uploader, workflow и его synthetic-тесты.
Мобильный код, сборки, production API и источники импорта не меняются.
Разрешение владельца на загрузку готового AAB сохраняется; финальная кнопка
Google Play принадлежит руководителю.

Новая операция вообще не вызывает tracks PUT/PATCH и не формирует release.
Она сохраняет тот же immutable AAB в библиотеке. В Internal снимается snapshot,
который сравнивается перед commit и в новом read-edit. Новый edit подтверждает
сохранённые versionCode и SHA-256. Существующий matching bundle не загружается
заново и не вызывает лишний commit. После потери ответа commit выполняется
readback, но нет повторного upload/commit. HTTP-отказ review не имеет fallback.

Сохраняются guards provenance, package, source, version, hash, main и
step-scoped credentials. Commit только changesNotSentForReview=true и
ERROR_IF_IN_REVIEW. Любое рассогласование — остановка.

Официальный контракт отдельного хранения и последующего назначения трека:
https://developers.google.com/android-publisher/edits

Результат называется «AAB сохранён в библиотеке, к треку не привязан».
«Добавить из библиотеки», тестовый rollout и review оставлены руководителю.
Автоматические тесты используют только синтетический API без Google-запросов:
25 PASS, diff-check PASS. До запуска — независимое review точного SHA и CI.
