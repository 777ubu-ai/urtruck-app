# PRE-FLIGHT: каталог и связь поверх iOS110

- Branch `fix/ios110-carrier-share-20261024`; base `f387271aca1f8f216cbe7e1b79cd39816d19ea77` — исходник проверенного IPA1.0.11(110), SHA256 IPA `ee8581cbcaadf46b8e7625c5a09d5cd958363bb361969fb1a3594ebcdf264148`.
- Installed physical iOS/source UNKNOWN; historical artifact verification не заменяет приёмку нового кандидата. Production catalog overlay a17168e2 уже опубликован отдельно,1297 contacts.
- Scope: только frontend каталога из PR589 и связь/отправка из PR597, связанные регрессии. Сохраняется f387 reset-filter fix.
- Protected: ios/android, config/plugins/patches, app.config.js/app.json/eas.json, навигация, PDF/Chat/GPS/push/auth/backend. PUBLIC_WEB_ORIGIN в f387 уже существует и сохраняется со строгой origin policy; дефект main с отсутствующим экспортом не переносим на110.
- Risks: старый клиент не запрашивает carrier rows; тип контакта нельзя выдавать за свободную машину; поломка pagination/scroll/copy/share. Использовать existing main carrier query/render/model и отдельный carrier payload с allowlist.
- Test plan: реальные callbacks обеих ролей, carrier tail merge, query capability, телефоны/TG/private fields, reset/filter/resume, full frontend/lint/web, сравнение protected blobs с f387. Native/system-share pending отдельно.
- Dependency security: при необходимости только независимо проверенный CLI Zod override PR599; SDK/native packages не обновлять. Новые release/signing/version/store operations вне этого патча.
- Rollback: revert UI/helper/query/model patch; базы данных и опубликованный каталог не откатывать.
- Status: PREPARED_NOT_RELEASED.
