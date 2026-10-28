# PRE-FLIGHT: точная причина Google Play HTTP400

Branch fix/play-upload-diagnostics-20261029; base6a3db24917cefd2ee066b75427213ed87f92a7c8. Existing protected library uploader run40771040938 дошёл до bundles upload и получил HTTP400 до commit; старый error handler удалил причину. Кандидат не пересобирать:1.0.13/215090229, SHA68a2fa53a4c5781cafdf5a38ea9157bd9d2fcedae0de12535f06ebd9f7f68a09.

Scope: только диагностическая JSON-строка stage/reason/message при HTTP-ошибке Google. Токены Authorization, OAuth assertion, JWT, PEM, sk-keys, email и управляющие символы удаляются. Секреты и сырые ответы не журналировать. Мутации API, artifact identity, версии, подписи, tracks и commit policy прежние.

Checks: tests маскировки/формата, существующие26 upload/idempotence/readback tests, полный CI и review. Повтор только существующего точного AAB после fresh store readback; не создавать новый build/versionCode.

Rollback: вернуть только предыдущую диагностику; параметры и данные магазина патч не изменяет. Публичную отправку не объявлять выполненной.
