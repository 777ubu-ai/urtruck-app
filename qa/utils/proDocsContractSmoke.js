// Item 2 (08.08.2026): контракт готовности PRO-документов к private bucket.
// НЕ заявляет, что политика приватности применена (это EXTERNAL в Supabase) —
// фиксирует, что КОД готов к переключению: есть signed-URL хелпер на
// createSignedUrl, upload возвращает storage path, и документирована
// зависимость от миграции. Защита от регресса «вернули только getPublicUrl».
import fs from 'node:fs';
import assert from 'node:assert/strict';

const src = fs.readFileSync('src/utils/proDocs.js', 'utf8');

assert.ok(/export async function createSignedProDocUrl/.test(src),
  'proDocs.js должен экспортировать createSignedProDocUrl для private bucket');
assert.ok(/\.createSignedUrl\(/.test(src),
  'createSignedProDocUrl должен использовать supabase createSignedUrl');
assert.ok(/return \{ ok: true, url, path, field, syncWarn \}/.test(src),
  'uploadProDoc должен возвращать storage path (additive) для перехода на signed URLs');

// Миграция подготовлена и на неё есть ссылка в коде.
assert.ok(fs.existsSync('backend/migrations/supabase_pro_documents_private.sql'),
  'должна существовать подготовленная политика приватности bucket');
assert.ok(/supabase_pro_documents_private\.sql/.test(src),
  'proDocs.js должен ссылаться на миграцию приватности (документированная зависимость)');

// forward-compatible резолвер показа (URL legacy / signed для path).
assert.ok(/export async function resolveProDocDisplayUrl/.test(src),
  'proDocs.js должен экспортировать resolveProDocDisplayUrl для перехода на private bucket');
const refSrc = fs.readFileSync('src/utils/proDocsRef.js', 'utf8');
assert.ok(/export function classifyProDocRef/.test(refSrc),
  'proDocsRef.js должен экспортировать чистый classifyProDocRef (тестируемый без supabase)');

console.log('pro-docs contract OK: signed-URL helper + resolver + path return + migration prepared (bucket private = EXTERNAL, не заявляем DONE)');
