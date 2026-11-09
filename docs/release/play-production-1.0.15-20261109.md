# Подготовка Android production 1.0.15 без публикации

Владелец разрешил App Review и публичный выпуск после обязательной приёмки.
Открытые физические и Console-проверки не считаются пройденными.

PRE-FLIGHT: ветка fix/play-production-1.0.15-20261109; frozen app source
3e1c845461a91c8c21531183c2259bb256c13588, PR698, CI42565307552 (ожидается).
Scope: только штатный Android workflow, исполняемые guards и этот документ.
Runtime-файлы, backend, production SQLite, существующие установки и сессии
не изменяются. Откат — остановить продвижение нового артефакта; не заменять
живую базу и не публиковать прежний QA2/Internal AAB.

Для отдельной подготовки одного AAB workflow допускает только эту ветку,
workflow_dispatch, production API/package, production track, status=draft,
submit_to_play=false, build_installable_apk=false и точный source_sha 3e1c8454.
PR698 должен по-прежнему иметь тот же HEAD, три обязательных CI — success.
Delta workflow против исходника ограничена этим workflow, тестом guard и
этим документом. Старые ограничения QA2/Internal и upload-сертификата сохранены.

Сверка Play 09.11.2026 03:51 UTC: maximum215771497; план215771498.
EAS remote213392856 ниже Play; default EAS certificate f815… отличается
от принятого upload certificate bb2474c2… и не используется. Штатный workflow
использует прежний GitHub secret и проверяет сертификат bb2474c2… внутри job.

VersionName1.0.15 подготавливается только в runner-копии frozen source.
Фактический AAB обязан пройти API/source/feed/version/signature/16K/manifest/
Firebase и snapshot GPS gates до признания готовым. Изменение мобильного UI требует следующей iOS-сборки;129 не содержит P1-исправления.

Публикация, отправка review и обновление телефонов этим workflow не выполняются.
После обязательной физической приёмки и проверки Console допускается отправить
тот же проверенный AAB в production без повторной сборки. Номер и отсутствие
конкурирующей загрузки повторно сверять перед upload.


## Отправка того же AAB после обязательной приёмки

Путь existing_aab_run_id не запускает native build или новый номер. Он принимает
только successful run42566989119 с workflow SHA32d40da0 и исходником3e1c8454,
ровно215771498/version1.0.15. Обезличенный release_gate_json обязан содержать
SHA256 AAB и все8критериев PASS со ссылками на доказательства: обновление без
потерь, Apple/Google, карточки/возврат, сделки/чат/документы, реальныеpush,
GPSsnapshot, Console, productionIDs/личные/внешние. NOT RUN/BLOCKED/отсутствующая
ссылка блокируют upload до передачи storecredentials. Текущая физическая
приёмка NOT RUN: допустимый отчёт не создан и upload-only не запущен.

После download того же immutable artifact повторно проверяются SHA256,
jarsigner и прежний uploadcertificatebb2474c2…; артефакт не переподписывается.
Разрешены только production/completed, submit_to_play=true,
production_review_only=false, внешняялентаtrue, безAPK/другихdownloadinputs.
Review-onlytrue отклоняется: публичное продвижение не обходит выбор оператора.
Google statuscompleted означает запрос Production/review; факт публичного
распространения проверяется отдельно после обработки/одобрения, включая
состояние managedpublishing в Console. Ранее созданную заявку не отменять.
