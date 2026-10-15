# Фото чата — подготовка JPEG

Base: 6bf713eac1f9c7339b8651fecc132aa14f7862e5. Ветка fix/chat-photo-compression-20261015.
Graphify AST-only:11243 nodes/24849 edges. Scope: imageCompress, два отправителя фото,
новый pure helper, сообщения RU/KK/ZH/EN и тесты. Auth/Push/GPS/FSM/backend не меняются.

Подтверждённый source-дефект DealAttachments: преобразованный JPEG отправлялся с
исходными PNG/HEIC именем и MIME. Контракт backend отклоняет специфическое противоречие415.
Это source-level воспроизведение, не подтверждение конкретного отказа пользователя на iPhone.

Strict compression для фото чата не возвращает оригинал после сбоя.
После сжатия читается фактический размер через Expo File API; неизвестный/нулевой размер
и превышение8MiB прекращают подготовку. Имя и MIME результата JPEG согласованы.
Другие исторические callers compressImage сохраняют старое fallback-поведение.
PDF/XLS/XLSX/CSV не передаются в compressImage. Стабильный clientUploadId сохранён.

Проверки: full frontend+unit1229 PASS; целевые27 PASS; lint507 PASS;
i18n2029×4, missing0; git diff --check PASS.
Тест native compressor выполняет реальную функцию с замещёнными native-модулями;
тесты НЕ доказывают HEIC decoder/iPhone, фактические bytes нативного transcode или физическую доставку.

Новая QA mobile сборка и физический iPhone/Android прогон PENDING.
Выложенные IPA99/AAB, production и Apple submission не менялись.
Rollback: вернуть эту ветку/commit до нового QA build; данные не мигрируются.
