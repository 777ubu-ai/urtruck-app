-- P2-4 — Supabase RLS: чек-лист проверок (READ-ONLY).
--
-- НЕ ВЫПОЛНЯТЬ автоматически. Запускать ВРУЧНУЮ в Supabase Studio → SQL Editor
-- (роль владельца/service). Эти запросы только ЧИТАЮТ системные каталоги —
-- ничего не меняют, anon-key не используется и НЕ трогается.
--
-- Контекст (CLAUDE.md): Supabase в UrTruck используется ТОЛЬКО для OTP-авторизации
-- клиентов и опционально Storage; основные данные — в SQLite на сервере. Поэтому
-- в public-схеме таблиц немного, и главный риск — таблица БЕЗ RLS, доступная anon.
--
-- Критерий PASS: (A) на каждой public-таблице RLS включён; (B) нет грантов
-- INSERT/UPDATE/DELETE для роли anon на чувствительные таблицы; (C) у каждой
-- таблицы с RLS есть осмысленные policy (а не «включили RLS и забыли политики»,
-- что блокирует всё, либо политика USING (true), что открывает всё).

-- ─────────────────────────────────────────────────────────────────────────
-- 1. Таблицы public-схемы и статус RLS. ❗ rowsecurity=false на public-таблице
--    с данными = дыра (anon может читать/писать).
-- ─────────────────────────────────────────────────────────────────────────
SELECT n.nspname               AS schema,
       c.relname               AS table,
       c.relrowsecurity        AS rls_enabled,
       c.relforcerowsecurity   AS rls_forced
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE c.relkind = 'r'
  AND n.nspname = 'public'
ORDER BY c.relrowsecurity ASC, c.relname;   -- сначала ОПАСНЫЕ (rls_enabled=false)

-- ─────────────────────────────────────────────────────────────────────────
-- 2. Public-таблицы БЕЗ RLS — должно вернуть 0 строк. Любая строка = gap.
-- ─────────────────────────────────────────────────────────────────────────
SELECT c.relname AS table_without_rls
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE c.relkind = 'r'
  AND n.nspname = 'public'
  AND c.relrowsecurity = false;

-- ─────────────────────────────────────────────────────────────────────────
-- 3. Все policy по таблицам: команда, роли, условия USING / WITH CHECK.
--    ❗ qual = 'true' (USING (true)) на anon-читаемой таблице = открытые данные.
-- ─────────────────────────────────────────────────────────────────────────
SELECT schemaname, tablename, policyname,
       cmd                              AS command,        -- SELECT/INSERT/UPDATE/DELETE/ALL
       roles,                                              -- {anon}, {authenticated}, ...
       qual                             AS using_expr,
       with_check                       AS with_check_expr
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, cmd;

-- ─────────────────────────────────────────────────────────────────────────
-- 4. Таблицы с включённым RLS, но БЕЗ единой policy → доступ фактически закрыт
--    для всех (часто непреднамеренно). Возвращает таблицы для ручного разбора.
-- ─────────────────────────────────────────────────────────────────────────
SELECT c.relname AS rls_on_but_no_policies
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
LEFT JOIN pg_policies p ON p.schemaname = n.nspname AND p.tablename = c.relname
WHERE c.relkind = 'r'
  AND n.nspname = 'public'
  AND c.relrowsecurity = true
GROUP BY c.relname
HAVING count(p.policyname) = 0;

-- ─────────────────────────────────────────────────────────────────────────
-- 5. Прямые табличные гранты для роли anon. ❗ INSERT/UPDATE/DELETE у anon на
--    таблицы с данными — почти всегда ошибка. SELECT — допустим только для
--    осознанно публичных справочников.
-- ─────────────────────────────────────────────────────────────────────────
SELECT table_schema, table_name, privilege_type
FROM information_schema.role_table_grants
WHERE grantee = 'anon'
  AND table_schema = 'public'
ORDER BY table_name, privilege_type;

-- ─────────────────────────────────────────────────────────────────────────
-- 6. Storage (если используется Supabase Storage): RLS на storage.objects и
--    публичность бакетов. ❗ public=true бакет = файлы доступны по прямой ссылке.
-- ─────────────────────────────────────────────────────────────────────────
SELECT id AS bucket, name, public AS is_public
FROM storage.buckets
ORDER BY public DESC, name;

SELECT policyname, cmd, roles, qual AS using_expr, with_check AS with_check_expr
FROM pg_policies
WHERE schemaname = 'storage' AND tablename = 'objects'
ORDER BY cmd;

-- ─────────────────────────────────────────────────────────────────────────
-- 7. (опционально) Проверка как anon — БЕЗ anon-key, через локальную роль:
--    в SQL Editor можно временно переключить роль и убедиться, что доступ
--    ограничен. Выполнять осознанно; вернуть роль обратно.
--      SET LOCAL ROLE anon;
--      SELECT count(*) FROM public.<table>;   -- ожидаем 0 или ошибку RLS
--      RESET ROLE;
-- ─────────────────────────────────────────────────────────────────────────

-- ════════════════════════════════════════════════════════════════════════
-- ФИКС для бага «new row violates row-level security policy» при загрузке
-- PRO-документов (загранпаспорт/TIR/CMR) — экран PRO-профиля.
-- ════════════════════════════════════════════════════════════════════════
-- Причина: src/utils/proDocs.js грузит файлы в Supabase Storage bucket
-- 'pro-documents' под ролью ANON (водители авторизованы через backend
-- UrTruck, а не через Supabase Auth → сессии нет, роль = anon). На бакете
-- есть public-read, но НЕТ политики INSERT для anon → upload режется RLS.
--
-- ВАРИАНТ 1 (быстрый, в Supabase SQL Editor) — разрешить anon загрузку
-- именно в этот бакет:
--
--   create policy "anon upload pro-documents"
--     on storage.objects for insert to anon
--     with check (bucket_id = 'pro-documents');
--   -- public read (если ещё не включён флагом бакета):
--   create policy "anon read pro-documents"
--     on storage.objects for select to anon
--     using (bucket_id = 'pro-documents');
--
--   ⚠️ Безопасность: anon-ключ зашит в приложении → любой с ключом сможет
--   лить файлы в этот бакет. Для пилота приемлемо; ограничить размер/типы
--   на уровне бакета. НЕ давать anon delete/update.
--
-- ВАРИАНТ 2 (чище, на потом): грузить PRO-доки через backend
-- (services/storage_service, service-role/local FS) как остальные фото —
-- тогда RLS вообще ни при чём. Требует нового backend-эндпоинта.
