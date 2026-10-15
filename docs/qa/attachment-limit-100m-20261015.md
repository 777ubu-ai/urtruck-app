# Увеличение вложений чата до 100 MiB — кандидат

Дата: 15 октября 2026. Владелец разрешил выполнить увеличение серверного лимита.
Ветка: fix/attachment-limit-100m-20261015. Base: 9ac0b6200e1e91aa40b99cd1f4943062e2acc048.
Production SHA UNKNOWN_MIXED. Не заменять production-файлы целиком из этой ветки.

## Подтверждённая причина
Nginx отклонил запрос 60405207 bytes к attachments 15.10 в 11:36 UTC.
Production Nginx: 16m. Deal-room API: 12 MiB. Supabase private bucket urtruck-docs: 10485760 bytes (10 MiB).
Это три независимых ограничения. Формат большого вложения не установлен по Nginx-журналу.

## Патч
MAX_ATTACH_BYTES: 12 -> 100 MiB. Ошибка 413 сообщает фактическое значение константы.
Контроль MIME/magic bytes, участника, статуса комнаты, приватность и idempotency не меняются.
Старый отдельный endpoint /chat/photo сохраняет 8 MiB; это НЕ обещание 100 MiB для каждого upload endpoint.
API по-прежнему читает максимум лимит+1 в bytes. При 100 MiB требуется отдельная проверка concurrent uploads/памяти; local unit PASS этого не доказывает.

## Проверки
50 PASS: test_deal_attachment_upload.py, test_upload_validation.py,
test_deal_room_status_gate.py, test_attachment_push.py.
Новые проверки передают 60 MiB и ровно 100 MiB PDF через реальную функцию upload_attachment;
хранилище замещено тестовым адаптером. 100 MiB + 1 отклоняется 413 до storage.
Это не реальный тест Supabase и не физический iPhone.
Graphify AST-only: 11112 nodes/24614 edges, без LLM.

## До применения
1. Усиленный независимый review, обязательный для Documents/production infrastructure по ENGINEERING_CONSTITUTION.md §6.
2. Проверить global Storage limit/план Supabase. Free ограничен 50 MB; bucket limit не выше global.
   Не менять тариф и не создавать новые расходы без отдельного разрешения.
3. Для 100 MiB нужен достаточный global limit, private bucket file_size_limit=104857600,
   неизменные public=false и allowed_mime_types. Сохранить точный readback bucket до изменения.
4. Nginx: request body 101m или больше multipart overhead; поднять только нужный upload route,
   без отключения auth/rate limits. nginx -t до reload. Не изменять чужие сайты.
5. Через reviewed guarded writer применить только утверждённый exact-hash patch, не полный backend deploy.
6. Проверить размеры, MIME, ownership и parallel uploads; после выкладки iPhone->Android и обратно,
   реальную загрузку/получение/скачивание, ошибки и ресурсы.

## Сохранение и rollback
Read-only копии трёх live-файлов и before-manifest.json находятся в qa-evidence/.../attachment-limit-100m-20261015/before.
Хеши исходников: upload_validation fd06f49f922cc8e136c4340779c29372db75e0fa325b5d86cf1b4ad58247754f;
deal_room c7b6e39d67f0d8328b7278bf095eb7d75cdb34021a1821c80be4d12522a3087b.
Перед каждой записью повторно сверить хеш; при расхождении остановиться.
Откат: восстановить изменённые файлы, Nginx и точные прежние bucket settings; reload/restart
только затронутого сервиса, health и маленькое вложение. Пользовательские объекты не удалять.

Статус: SOURCE_TESTS_PASS / PRODUCTION_NOT_CHANGED. Нельзя объявлять лимит включённым.

## Фактическая проверка Supabase — 15.10.2026, после 17:11 Алматы

Через Storage API попытались создать отдельный временный private bucket с file_size_limit=104857600.
Рабочий bucket не изменяли. Supabase вернул HTTP 400 с JSON statusCode=413,
error="Payload too large", message="The object exceeded the maximum allowed size".
Тестовый bucket не создан, файл не отправлялся. Readback рабочего bucket подтвердил
public=false, прежние MIME и лимит 10485760; изменений нет. Тариф/биллинг не менялись.

Вывод: текущая конфигурация проекта не допускает bucket limit 100 MiB.
Это НЕ доказательство тарифа Free и НЕ доказательство необходимости платного upgrade:
на платном проекте причиной также может быть уменьшенный global Storage limit.
Нужна проверка именно global Storage setting и плана перед выбором Supabase/VPS.
Без этой проверки обещать 100 MiB на существующем тарифе нельзя.
Сырые безопасные результаты: supabase-100m-probe.json в соседнем evidence на Mac.
