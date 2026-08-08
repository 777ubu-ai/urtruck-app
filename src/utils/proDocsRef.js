// Item 2 (08.08.2026): чистая (без supabase/RN) классификация ссылки на
// PRO-документ. Нужна для forward-compatible показа при переходе bucket
// pro-documents с public на private:
//   * legacy-значение в профиле — полный public URL (http/https) → показываем
//     как есть (работает, пока bucket public);
//   * новое значение — storage path '{user_id}/{kind}_{ts}.jpg' → резолвим в
//     signed URL при показе (работает после перевода bucket в private).
// Вынесено отдельным модулем, чтобы юнит-тест не тянул supabase-клиент.

/**
 * @param {string|null|undefined} value
 * @returns {'empty'|'url'|'path'}
 */
export function classifyProDocRef(value) {
  if (!value || typeof value !== 'string' || !value.trim()) return 'empty';
  const v = value.trim();
  if (/^https?:\/\//i.test(v) || v.startsWith('data:') || v.startsWith('file:')) return 'url';
  return 'path';
}

/** true, если значение — уже готовый (legacy) полный URL, показываемый напрямую. */
export function isDirectlyDisplayable(value) {
  return classifyProDocRef(value) === 'url';
}
