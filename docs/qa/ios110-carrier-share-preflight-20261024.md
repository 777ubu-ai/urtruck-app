# PRE-FLIGHT: каталог и связь поверх iOS110

- Branch `fix/ios110-carrier-share-20261024`; base `f387271aca1f8f216cbe7e1b79cd39816d19ea77` — исходник проверенного IPA1.0.11(110), SHA256 IPA `ee8581cbcaadf46b8e7625c5a09d5cd958363bb361969fb1a3594ebcdf264148`.
- Installed physical iOS/source UNKNOWN; historical artifact verification не заменяет приёмку нового кандидата. Production catalog overlay a17168e2 уже опубликован отдельно,1297 contacts.
- Scope: frontend связи/отправки поверх carrier integration PR589; merge актуальной release-базы `54cbecadeb8fc8da8ea60df53750f82773c126fd` сохраняет её уже принятый каталог backend/frontend. Сохраняется f387 reset-filter fix.
- Protected: ios/android, config/plugins/patches, app.config.js/app.json/eas.json, навигация, PDF/Chat/GPS/push/auth; backend вне принятого каталога. PUBLIC_WEB_ORIGIN в f387 уже существует и сохраняется со строгой origin policy; дефект main с отсутствующим экспортом не переносим на110.
- Risks: старый клиент не запрашивает carrier rows; тип контакта нельзя выдавать за свободную машину; поломка pagination/scroll/copy/share. Использовать existing main carrier query/render/model и отдельный carrier payload с allowlist.
- Test plan: реальные callbacks обеих ролей, carrier tail merge, query capability, телефоны/TG/private fields, reset/filter/resume, full frontend/lint/web, сравнение protected blobs с f387. Native/system-share pending отдельно.
- Dependency security: при необходимости только независимо проверенный CLI Zod override PR599; SDK/native packages не обновлять. Новые release/signing/version/store operations вне этого патча.
- Rollback: revert UI/helper/query/model patch; базы данных и опубликованный каталог не откатывать.
- Status: PREPARED_NOT_RELEASED.

## Проверенный кандидат

- Frontend port: e7387879 +0b7fdde2. Новый API capability query/carrier cursor проверяется реальным модулем запросов; старый тест счётчика обновлён на pathname +include_carriers=true с сохранением owner guard.
- 23 адресные регрессии PASS; полный frontend/unit **1528/1528 PASS**,0 fail/skip. Lint **584 active JS PASS**. Web export/finalize PASS,1JS bundle/8 обязательных источников. Native APIs в Node замоканы.
- Безопасность: **19/19 security tests PASS**. Audit gate PASS с прежним единственным компенсирующим node-forge patch; новых исключений нет. Braces upstream monitor PASS.
- Портированы точные vetted braces28d440b runtime/provenance/SBOM/monitor/tests из af93 и scoped CLI Zod4.6.7 из PR599. Package versions native/application и devDependencies **идентичны f387**; dependency diff только braces path и CLI override. Lockfile diff только braces vendor и Zod; libc/optional metadata не изменены.
- Byte parity с f387: ios/android, app.config.js/app.json/eas.json, patches/plugins, navigation, AuthContext/ThemeContext, env.js, deal/chat protected paths — **0 изменений**. Все PDF/webview/blob/navigation-bar зависимости сохранены.
- По отношению к актуальной release-базе54cb backend business code не меняется; production runtime/catalog и магазины этот кандидат не меняет. Native сборка/system-share/звонок/clipboard/физический iPhone — PENDING. Review/CI нового кандидата и платформенная приёмка требуются до release.


## Release база и проверка магазина

- Свежая read-only сверка владельца/root App Store Connect **24.10.2026 16:47:45 UTC**: версия1.0.11 READY_FOR_SALE, build110; последний VALID110. Локально проверенный IPA110 указывает исходник f387. Это не доказывает, какая сборка установлена на конкретном физическом iPhone.
- В main по отношению к110 найдены несогласованные для нового release отличия: Info.plist добавляет background location вместо snapshot-конфигурации110; удалены PDF/WebView/blob/navigation-bar dependencies; утрачен source SHA stamp в app.config. Не использовать main для нового APK/IPA без отдельной сверки native/PDF/GPS baseline.
- Merge54cb разрешён минимально: сохранены проверенные carrier/share callbacks, query/model и тесты; переняты reviewed каталог backend и честные EN/ZH подписи входа. После merge **58/58 связанных frontend tests PASS**; protected native/config/patches/plugins/navigation/Auth/env/deal/chat paths остались byte-identical f387.
- Из PR596 перенесён только self-contained carrier API test: устраняет зависимость от чужого test module/global actor. API/service code идентичен уже принятому каталогу. Локальный backend запуск BLOCKED: в scratch Python нет pytest; проверка backend обязательна в CI/подготовленном runtime. Не заявлять backend PASS по этому локальному запуску.
- Полные1528 unit/security19/lint/web/audit PASS относятся к frontend/security commit c1846a22 перед merge; merge не меняет эти UI файлы, кроме двух carrier title строк. Финальный CI и native QA остаются обязательными.
