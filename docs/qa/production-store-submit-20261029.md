# PRE-FLIGHT: публичная отправка исправленного кандидата

Branch feat/production-store-submit-20261029; base protected main0fe002523a16bfca21b982f6fe89f48752c1a1f4. Владелец29.10 явно потребовал после проверки и исправления регистрации отправить основные App Store/Google Play. PR643 исправил подтверждённую гонку роли. Прежние IPA122/AAB215090229 публично не отправлять. Полный physical PASS не заявлять.

Готовый AAB1.0.13/215090230: run40776684461 SUCCESS, artifact12857270270, release config23716b734d358383902bdb8ef3ddd63122bd4b42, app source6aa6badf3ddfd8d124268c8cecf7c5e202c0baca. Размер145333018; SHA2562b77d67f7dff25815994af7df792f5695147dc9fa952ca2497991b4418b30a83. LOCAL_BINARY_VERIFIED: реальные API/source/version/native config, jarsigner, upload certificatebb2474c2ed08076f7141fe1e4d3f6c604fc3e860fe5811e3c2fcd129e7cb88b4, targetSDK36, PAGE_ALIGNMENT_16K, production feed и отсутствие background location. Новых сборок uploader не создаёт.

Файлы: существующий uploader с отдельной submit_production, отдельная ручная main/production workflow, immutable pins прежнего library workflow и его fixtures, новый ops test и отдельный шаг его запуска в quality-gate-reusable (hashFiles guard сохраняет совместимость старых source checkouts). App code/БД/runtime/другие workflow не менять.

Guards: package com.urtruck.app, exact run/source/size/SHA, snapshot всех tracks; отказ при незавершённых releases и candidate на другом треке. Отдельная обязательная свежая read-only проверка Console Publishing overview на отсутствие чужих pending/in-review непосредственно перед dispatch; tracks не доказывают состояние pending listings/details. Мутации только нужного bundle и PUT tracks/production с release1.0.13 completed; остальные tracks/listings/details не писать. :validate, затем :commit с ERROR_IF_IN_REVIEW без changesNotSentForReview — это явная отправка на review по новому указанию владельца, не library-only операция. Старый library путь не получает fallback.

Потеря ответа: только новый readback без второго upload/commit. Exact bundle SHA и полный readback всех tracks обязательны; review/live дополнительно сверить Console. Время одобрения определяет Google; публичную доступность не приписывать completed-запросу.

44 ops tests PASS: production assignment, чужие draft/rollout, неверные hash/version, изменение другого track, already assigned, HTTP refusal без fallback, lost response/readback, explicit main/production/secret scope, CI coverage. Усиленное review и обязательный CI до merge. Rollback до commit — незавершённый edit; review не отменять автоматически.
