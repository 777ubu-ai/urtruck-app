# PRE-FLIGHT: production-кандидаты 1.0.13

Branch ops/public-store-preflight-20261028; starting SHA a8ed684304b5ff7ae099952de4daeedc0bf92deb, source/base88e349531a3cc8777b95e09b65fb6ebfb8dc29cc. Known-good source PR635/CI40702441326 PASS3/3; собственный physical PASS новых production-бинарников отсутствует. Production runtime продвигается отдельно ограниченным PR637.

Scope: только существующие testflight-local.yml/deploy-play.yml, общий guard точного PR/source/CI, его тесты и release-журнал. Приложение, зависимости, Chat/FSM/Push/GPS/Auth, каталог и QA2 не меняются. Версии согласуются на runner существующим prepare_store_candidate_version.py без prebuild. APIhttps://urtruck.kz, com.urtruck.app, ASC6764504167; iOS/Android1.0.13.

Checks: неверная ветка/repo/event/SHA/PR/tree/CI отклоняются; production-source приложение byte-identical88e3495 кроме штатной runner-only metadata; свежие ASC/EAS/Play counters; встроенные API/source/feed/version, signatures, FCM/16KB/native permissions. Android AAB+APK собираются одним runner без загрузки; iOS IPA сохраняется без автоматической отправки. Публичная отправка только после обязательной приёмки. TestFlight/Internal не являются публичным выпуском.

Rollback: отменить новый run/не продвигать артефакты; текущие магазинные версии остаются. Runtime rollback отдельного PR637 не заменяет БД. Повторные сборки существующего точного кандидата не создавать; проверять run/artifacts перед dispatch.

До первой сборки обновлён только публичный RSA-ключ передачи APK: прежний приватный ключ на машине не найден. Новый приватный ключ сохранён локально в ~/.config/urtruck-release/apk-device-qa-20261028.pem с правами 0600; в Git попадает только публичная часть. HMAC и SHA-256 проверяются перед расшифровкой и установкой. Это не ключ подписи Android; магазинная подпись и package остаются прежними. Допуск guard расширен ровно на этот публичный файл.


Локальные проверки:43 tests общего source/PR/CI/counter guard и Play snapshot PASS;42 существующих release/counter tests PASS; YAML/bash-n PASS. Новый production Android lane принимает только production/draft, build_installable_apk=true, submit_to_play=false и feed=true; QA2 и старые lanes сохраняют ограничения. В новой ветке AAB и APK создаются за один запуск, versionCode native manifest и app.config сверяются. iOS проверяет privacy purpose/подпись/APNs/source/API/feed/version до сохранения артефакта; TestFlight upload выключен по умолчанию и не является App Review.

## PRE-FLIGHT29.10: исправленная регистрация PR643

Владелец потребовал проверить обе регистрации, исправить подтверждённые ошибки, затем отправить основные магазины. P1 позднего ответа смены роли закрыт PR643: head6bb350e76f145c7865c9d0fe3efe68da3a6bb5ae, merge6aa6badf3ddfd8d124268c8cecf7c5e202c0baca, CI40775129541 PASS3/3, дерево идентично.1627 frontend tests PASS, lint593 PASS, усиленное review без замечаний.

Прежние IPA122/AAB215090229 не использовать публично: они не содержат фикс. Разрешённые конфигурационные правки: точные app SHA/PR643/CI в существующем guard, оба production workflow, fixtures адресных guard tests. ASC/EAS max122 → iOS123; Android fresh Play max228, прежний кандидат229 известен, следующий номер max(live+1,215090230). Это осознанный пропуск прежнего кандидата, не мнимый новый максимум Play.

API urtruck.kz, com.urtruck.app, ASC6764504167, version1.0.13 и OTA off сохранены; app code в release PR не менять. После build обязательна новая проверка готовых бинарников. Незавершённые physical проверки не превращать в PASS. Rollback: возврат только release-конфигурации; новые binaries не подменять старыми.
