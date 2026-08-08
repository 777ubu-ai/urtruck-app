// Item 2 (08.08.2026): regression на классификацию ссылки PRO-документа —
// ключ forward-compatible показа при переходе bucket public→private.
// Чистый модуль, без supabase/RN — запуск: node tests/unit/proDocsRef.test.mjs
import { classifyProDocRef, isDirectlyDisplayable } from '../../src/utils/proDocsRef.js';

let failed = 0;
function check(desc, actual, expected) {
  const ok = actual === expected;
  console.log((ok ? '  ok: ' : 'FAIL: ') + desc + ` (got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)})`);
  if (!ok) failed++;
}

// empty
check('null → empty', classifyProDocRef(null), 'empty');
check('undefined → empty', classifyProDocRef(undefined), 'empty');
check('"" → empty', classifyProDocRef(''), 'empty');
check('whitespace → empty', classifyProDocRef('   '), 'empty');

// legacy full URLs (показываем как есть, пока bucket public)
check('https URL → url', classifyProDocRef('https://x.supabase.co/storage/v1/object/public/pro-documents/u1/passport_intl_1.jpg'), 'url');
check('http URL → url', classifyProDocRef('http://example.com/a.jpg'), 'url');
check('data URI → url', classifyProDocRef('data:image/jpeg;base64,/9j/'), 'url');
check('file URI → url', classifyProDocRef('file:///tmp/a.jpg'), 'url');

// storage path (резолвим в signed URL после private-флипа)
check('storage path → path', classifyProDocRef('u1/passport_intl_1699999999.jpg'), 'path');
check('nested path → path', classifyProDocRef('user-123/tir_1700000000.jpg'), 'path');

// isDirectlyDisplayable
check('isDirectlyDisplayable(url) → true', isDirectlyDisplayable('https://x/y.jpg'), true);
check('isDirectlyDisplayable(path) → false', isDirectlyDisplayable('u1/tir_1.jpg'), false);
check('isDirectlyDisplayable(empty) → false', isDirectlyDisplayable(''), false);

console.log(failed === 0 ? '\nAll proDocsRef tests passed.' : `\n${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
