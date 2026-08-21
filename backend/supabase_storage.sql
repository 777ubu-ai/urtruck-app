-- UrTruck production Storage bootstrap
--
-- Apply this only to the UrTruck Supabase project.  The application backend
-- accesses this bucket with SUPABASE_SERVICE_KEY; clients never receive that
-- key and never receive an unbounded public URL.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'urtruck-docs',
  'urtruck-docs',
  false,
  10485760,
  array[
    'image/jpeg', 'image/png', 'application/pdf',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/csv', 'text/comma-separated-values', 'application/csv',
    'audio/webm', 'audio/mp4', 'audio/mpeg', 'audio/aac',
    'audio/ogg', 'audio/wav'
  ]
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- No policy is deliberately created here.  Supabase Storage denies browser
-- reads and uploads by default; only the trusted UrTruck backend uses its
-- server-only service key.  Route-level authorization then decides whether a
-- caller may receive a short-lived URL for an individual object.
