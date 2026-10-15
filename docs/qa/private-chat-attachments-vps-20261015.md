# Приватное VPS-хранение вложений — default-off кандидат

Base:40010abeb9449ebfad9e55a232f75faab78075bd (PR542; API100MiB).
Ветка fix/private-chat-attachments-vps-20261015. Production SHA UNKNOWN_MIXED.
Graphify AST-only11125nodes/24628edges. Scope storage_service и signed download handler;
Auth, DB-схема, FSM, Push, GPS, фото/голосовые endpoints и store binaries не меняются.

Режим выключен по умолчанию. Только category chat_attachments может сохраняться на VPS:
PRIVATE_CHAT_ATTACHMENT_ROOT=/home/ubuntu/urtruck/runtime/private-chat-attachments
PRIVATE_CHAT_ATTACHMENT_WRITE=true
Остальные категории и все supabase:// refs продолжают использовать прежний Supabase.

Private root в production ограничен точным persistent путём вне deploy/frontend; требуется
отдельный FILE_SIGNING_KEY>=32bytes. Файл сохраняется атомарно через временный0600,
fsync и rename. На диске остаётся резерв2GiB. Публичный alias не создаётся.
Signed endpoint проверяет HMAC/expiry и traversal, Cache-Control private,no-store.

Rollback новых записей: PRIVATE_CHAT_ATTACHMENT_WRITE=false при СОХРАНЁННОМ root.
Это оставляет доступ к уже отправленным VPS файлам. До выбора режима backup должен
охватывать private root отдельно от backend code; TTL удаление не добавлено.

64 целевых backend теста PASS: private storage,60MiB roundtrip на disk, HMAC/expiry/
подмена подписи/path traversal/permissions/disk reserve, старые Supabase refs,
attachments100MiB boundaries, upload validation/status gate/push/storage cache.
Это локальные проверки; Nginx и полный production HTTP путь не проверены.

До rollout: усиленный review; backup/restore test private root; concurrency/memory
проверка100MiB (upload API пока держит bounded100MiB+1bytes на запрос; общий бюджет
одновременных uploads не доказан); nginx101m+multipart на upload маршруте;
точечный reviewed guarded writer по before-hash вместо полного backend deploy;
маленький/60/100MiB upload+download с двух финальных магазинных клиентов.

Production/config/данные/магазины не менялись. Не включать только на основании unit PASS.
