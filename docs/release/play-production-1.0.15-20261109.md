# Подготовка Android production 1.0.15 без публикации

Владелец разрешил App Review и публичный выпуск после обязательной приёмки.
Открытые физические и Console-проверки не считаются пройденными.

PRE-FLIGHT: ветка fix/play-production-1.0.15-20261109; frozen app source
a2258821b5daff8bfa5ec0f54f14999c00df7338, PR698, CI42523132083 PASS.
Scope: только штатный Android workflow, исполняемые guards и этот документ.
Runtime-файлы, backend, production SQLite, существующие установки и сессии
не изменяются. Откат — остановить продвижение нового артефакта; не заменять
живую базу и не публиковать прежний QA2/Internal AAB.

Для отдельной подготовки одного AAB workflow допускает только эту ветку,
workflow_dispatch, production API/package, production track, status=draft,
submit_to_play=false, build_installable_apk=false и точный source_sha a2258821.
PR698 должен по-прежнему иметь тот же HEAD, три обязательных CI — success.
Delta workflow против исходника ограничена этим workflow, тестом guard и
этим документом. Старые ограничения QA2/Internal и upload-сертификата сохранены.

Сверка Play 09.11.2026 03:51 UTC: maximum215771497; план215771498.
EAS remote213392856 ниже Play; default EAS certificate f815… отличается
от принятого upload certificate bb2474c2… и не используется. Штатный workflow
использует прежний GitHub secret и проверяет сертификат bb2474c2… внутри job.

VersionName1.0.15 подготавливается только в runner-копии frozen source.
Фактический AAB обязан пройти API/source/feed/version/signature/16K/manifest/
Firebase и snapshot GPS gates до признания готовым. iOS129 не пересобирается.

Публикация, отправка review и обновление телефонов этим workflow не выполняются.
После обязательной физической приёмки и проверки Console допускается отправить
тот же проверенный AAB в production без повторной сборки. Номер и отсутствие
конкурирующей загрузки повторно сверять перед upload.
