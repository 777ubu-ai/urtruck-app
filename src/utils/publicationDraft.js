import { durableStorage as storage } from './storage';
const published = new Map();
const operations = new Map();
export const publicationDraftKey = (kind, ownerId) => ownerId ? `ur_publication_draft_v1:${encodeURIComponent(kind)}:${encodeURIComponent(ownerId)}` : null;
function enqueue(key, job) {
  if (!key) return Promise.resolve();
  const next = (operations.get(key) || Promise.resolve()).catch(() => {}).then(job);
  operations.set(key, next);
  next.finally(() => { if (operations.get(key) === next) operations.delete(key); }).catch(() => {});
  return next;
}
export const savePublicationDraft = (key, values) => {
  const encoded = JSON.stringify(values);
  return enqueue(key, async () => {
    try {
      await storage.set(key, encoded);
      if (await storage.get(key) !== encoded) throw new Error('DRAFT_NOT_DURABLE');
      published.get(key)?.delete(encoded);
      published.get(key)?.delete(null);
    } catch {
      const error = new Error('PUBLICATION_DRAFT_FAILED'); error.code = 'PUBLICATION_DRAFT_FAILED'; throw error;
    }
  });
};
export const clearPublicationDraft = (key, values) => {
  const encoded = values === undefined ? null : JSON.stringify(values);
  const versions = published.get(key) || new Set();
  versions.add(encoded);
  published.set(key, versions);
  return enqueue(key, async () => {
    // Поздний успех старой отправки не удаляет более новую редакцию формы.
    if (encoded !== null) {
      let current;
      try { current = await storage.get(key); } catch { return; }
      if (current !== encoded) return;
    }
    // Ошибка локального удаления не превращает успешный POST в повторную публикацию.
    try { await storage.set(key, JSON.stringify({ published: true })); } catch {}
    try { await storage.remove(key); } catch {}
  });
};
export async function readPublicationDraft(key) {
  if (!key) return null;
  await (operations.get(key) || Promise.resolve()).catch(() => {});
  const raw = await storage.get(key);
  if (!raw || published.get(key)?.has(null) || published.get(key)?.has(raw)) return null;
  try { const value = JSON.parse(raw); return value?.published ? null : value; } catch { return null; }
}
