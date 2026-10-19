import { durableStorage as storage } from './storage';
const published = new Map();
const operations = new Map();
export const publicationDraftKey = (kind, ownerId) => ownerId ? `ur_publication_draft_v1:${encodeURIComponent(kind)}:${encodeURIComponent(ownerId)}` : null;
const fields = value => { const { _publication, _generation, published: _published, ...values } = value || {}; return values; };
const revision = (values, clientId = null) => JSON.stringify({ values: fields(values), clientId });
const packed = (values, operation) => operation ? { ...fields(values), _publication: operation } : fields(values);
const newClientId = () => `publication_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}_${Math.random().toString(36).slice(2)}`;
function failure() { const e = new Error('PUBLICATION_DRAFT_FAILED'); e.code = 'PUBLICATION_DRAFT_FAILED'; return e; }
function enqueue(key, job) {
  if (!key) return Promise.resolve();
  const next = (operations.get(key) || Promise.resolve()).catch(() => {}).then(job);
  operations.set(key, next);
  next.finally(() => { if (operations.get(key) === next) operations.delete(key); }).catch(() => {});
  return next;
}
async function readRaw(key) {
  const raw = await storage.get(key);
  if (!raw) return null;
  try { const value = JSON.parse(raw); return value; } catch { throw failure(); }
}
async function write(key, value) {
  const encoded = JSON.stringify(value);
  try {
    await storage.set(key, encoded);
    if (await storage.get(key) !== encoded) throw failure();
  } catch { throw failure(); }
}
function checkGeneration(previous, generation) {
  if (generation !== undefined && previous?._generation !== generation) throw failure();
}
export const loadPublicationDraft = key => !key ? Promise.resolve({ draft: null, generation: null }) : enqueue(key, async () => {
  let value = await readRaw(key);
  if (!value?._generation) {
    value = { ...(value || {}), _generation: newClientId() };
    await write(key, value);
  }
  return { draft: value.published ? null : value, generation: value._generation };
});
function checkedOperation(key, ownerId, kind, value) {
  if (!ownerId || key !== publicationDraftKey(kind, ownerId)) throw failure();
  const op = value?._publication;
  if (op && (op.ownerId !== ownerId || op.kind !== kind || typeof op.clientId !== 'string')) throw failure();
  return op;
}
export const savePublicationDraft = (key, values, generation) => enqueue(key, async () => {
  let previous;
  try { previous = await readRaw(key); } catch { throw failure(); }
  checkGeneration(previous, generation);
  const value = { ...packed(values, previous?.published ? null : previous?._publication), ...(previous?._generation ? { _generation: previous._generation } : {}) };
  await write(key, value);
  published.get(key)?.delete(revision(value, value._publication?.clientId));
  published.get(key)?.delete(revision(value));
  published.get(key)?.delete(null);
});
export const preparePublicationDraft = (key, ownerId, kind, values, generation) => enqueue(key, async () => {
  const previous = await readRaw(key);
  checkGeneration(previous, generation);
  if (previous?.published) throw failure();
  const op = checkedOperation(key, ownerId, kind, previous) || { ownerId, kind, clientId: newClientId(), payload: null, form: null };
  await write(key, { ...packed(previous || values, op), ...(previous?._generation ? { _generation: previous._generation } : {}) });
  return { clientId: op.clientId, replayPayload: op.form === JSON.stringify(fields(values)) ? op.payload : null };
});
export const snapshotPublicationPayload = (key, ownerId, kind, values, clientId, payload, generation) => enqueue(key, async () => {
  const previous = await readRaw(key);
  checkGeneration(previous, generation);
  if (previous?.published) throw failure();
  const op = checkedOperation(key, ownerId, kind, previous);
  if (!op || op.clientId !== clientId) throw failure();
  const body = { ...payload, client_id: clientId };
  // Первый отправленный снимок неизменяем. Изменённая форма с тем же ключом получит явный409.
  const next = op.payload ? op : { ...op, form: JSON.stringify(fields(values)), payload: body };
  await write(key, { ...packed(previous || values, next), ...(previous?._generation ? { _generation: previous._generation } : {}) });
  return body;
});
export const resetPublicationOperation = (key, clientId, generation) => enqueue(key, async () => {
  const previous = await readRaw(key);
  checkGeneration(previous, generation);
  if (previous?.published || previous?._publication?.clientId !== clientId) throw failure();
  const nextGeneration = newClientId();
  await write(key, { ...fields(previous), _generation: nextGeneration });
  return nextGeneration;
});
export const clearPublicationDraft = (key, values, clientId = null, generation) => {
  const signature = values === undefined ? null : revision(values, clientId);
  const versions = published.get(key) || new Set();
  versions.add(signature);
  published.set(key, versions);
  return enqueue(key, async () => {
    let current;
    try { current = await readRaw(key); checkGeneration(current, generation); } catch { return false; }
    if (signature !== null) {
      if (!current || JSON.stringify(fields(current)) !== JSON.stringify(fields(values))) return false;
      if (clientId && current._publication?.clientId !== clientId) return false;
    }
    if (current?._generation) {
      // Старый экземпляр формы больше не может воскресить завершённую операцию.
      try { await write(key, { published: true, _generation: newClientId() }); return true; } catch { return false; }
    }
    // Ошибка локального удаления не превращает успешный POST в повторную публикацию.
    try { await storage.set(key, JSON.stringify({ published: true })); } catch {}
    try { await storage.remove(key); } catch {}
    return true;
  });
};
export async function readPublicationDraft(key) {
  if (!key) return null;
  await (operations.get(key) || Promise.resolve()).catch(() => {});
  const value = await readRaw(key);
  if (!value || value.published || published.get(key)?.has(null) || published.get(key)?.has(revision(value))
      || published.get(key)?.has(revision(value, value._publication?.clientId))) return null;
  return value;
}
