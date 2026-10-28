# PRE-FLIGHT: загрузка существующего production AAB1.0.13

Base72d7f33f, branch fix/upload-production-candidates-20261029. Владелец явно запросил загрузку готовых кандидатов. Приложение88e349531a3cc8777b95e09b65fb6ebfb8dc29cc, release configa25622c2987c6adec17fd35a8182947ecb0535a7, run40731167085 SUCCESS, AAB215090229, SHA25668a2fa53a4c5781cafdf5a38ea9157bd9d2fcedae0de12535f06ebd9f7f68a09, размер145331173. Локально AAB подпись/config/API/source/version/16KB проверены, APK той же сборки принят частично в эмуляторе. Полного physical PASS нет.

Scope: только pinned run/artifact/version/hash/size существующего защищённого library upload. Приложение, подпись, модели, backend и библиотечный uploader алгоритмически не меняются. Не пересобирать. До загрузки повторно сверить текущие номера; уже существующий такой же SHA считается no-op, другой SHA с тем же versionCode — отказ.

Checks: существующие tests provenance/checksum/idempotence/commit/readback, усиленное review, полный CI. Запуск только protected main, environment production, явный UPLOAD_BUNDLE_LIBRARY. Статусы всех releases остаются прежними; changesNotSentForReview=true. Это загрузка кандидата в магазин, не публичная отправка/публикация и не physical PASS.

Rollback: не назначать bundle на track; публичные и внутренние releases остаются прежними. Принятый библиотекой versionCode повторно не использовать и новый дубликат не создавать.
