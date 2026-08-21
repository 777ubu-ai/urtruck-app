-- P0 (item 2, 08.08.2026): pro-documents (загранпаспорта, права, техпаспорта,
-- удостоверения) НЕ должны быть public-read. Ниже — политика перевода bucket
-- в private + owner-only доступ через Supabase Storage RLS.
--
-- ⚠️ EXTERNAL ACTION REQUIRED: применяется в Supabase (SQL Editor проекта
-- pymddxenwtjcbmrafvnc ИЛИ через Management API с service_role). У агента нет
-- доступа к консоли Supabase — файл подготовлен, применяет владелец.
-- (2026-08-21: ссылка на проект исправлена — hchmnocoxjvtgdamcmmi, указанный
-- здесь ранее, больше не резолвится нигде и не виден в списке проектов
-- аккаунта; см. src/config/supabase.js. Bucket pro-documents в
-- pymddxenwtjcbmrafvnc пока не создан — этот файл всё ещё не применён.)
--
-- Предпосылки:
--   * путь объекта: "{user_id}/{kind}_{ts}.jpg" (см. src/utils/proDocs.js);
--   * первый сегмент пути (storage.foldername(name))[1] = user_id владельца.

-- 1) Перевести bucket в private (снять public-read).
update storage.buckets set public = false where id = 'pro-documents';

-- 2) Включить RLS на storage.objects (обычно уже включён в Supabase).
alter table storage.objects enable row level security;

-- 3) Снести возможную старую разрешающую-всем политику чтения.
drop policy if exists "pro-documents public read" on storage.objects;
drop policy if exists "Public read pro-documents" on storage.objects;

-- 4) Читать объект может ТОЛЬКО владелец (первый сегмент пути == его uid).
--    (Бэкенд ходит service_role-ключом в обход RLS — ему доступ сохраняется;
--     анонимный/чужой доступ закрывается.)
create policy "pro-documents owner read"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'pro-documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- 5) Загружать в свою папку может только сам пользователь.
create policy "pro-documents owner write"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'pro-documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- После применения проверить (должно быть 0 строк — публичного доступа нет):
--   select id, public from storage.buckets where id = 'pro-documents';  -- public=false
-- И smoke: получить объект чужого user_id анонимно → 403/404 (IDOR закрыт).
--
-- Код-часть (отдельно, требует согласования владельца по CLAUDE.md):
--   src/utils/proDocs.js использует getPublicUrl() — после перевода bucket в
--   private нужно перейти на createSignedUrl(path, ttl) ЛИБО на бэкенд-выдачу
--   через тот же signed-URL механизм, что license/passport (file_signing).
--   backend/api/profile.py:118 уже оборачивает поля в file_signing.sign(), но
--   sign() возвращает http(s)-URL без изменений — для supabase-путей нужен
--   createSignedUrl вместо публичного URL.
