import { useEffect, useRef, useState } from 'react';
import { publicationDraftKey, loadPublicationDraft, savePublicationDraft, clearPublicationDraft, preparePublicationDraft, snapshotPublicationPayload, resetPublicationOperation } from '../utils/publicationDraft';

// Черновик принадлежит конкретному аккаунту. Смена bearer не переносит форму другому человеку.
export function usePublicationDraft(kind, ownerId, values, setters) {
  const key = publicationDraftKey(kind, ownerId);
  const [loadedKey, setLoadedKey] = useState(null);
  const [generation, setGeneration] = useState(undefined);
  const [loadError, setLoadError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const settersRef = useRef(setters);
  settersRef.current = setters;
  const cleared = useRef(false);
  const timer = useRef(null);
  useEffect(() => {
    let alive = true;
    cleared.current = false;
    setLoadedKey(null);
    setLoadError(false);
    loadPublicationDraft(key).then(({ draft, generation: loadedGeneration }) => {
      if (!alive) return;
      if (draft) for (const [field, set] of Object.entries(settersRef.current)) {
        if (Object.prototype.hasOwnProperty.call(draft, field)) set(draft[field]);
      }
      setGeneration(loadedGeneration);
      setLoadedKey(key);
    }).catch(() => { if (alive) setLoadError(true); });
    return () => { alive = false; };
  }, [key, attempt]);
  const encoded = JSON.stringify(values);
  const currentDraft = useRef({ key, encoded, generation });
  currentDraft.current = { key, encoded, generation };
  useEffect(() => {
    if (!key || loadedKey !== key || cleared.current) return;
    timer.current = setTimeout(() => {
      if (!cleared.current) savePublicationDraft(key, JSON.parse(encoded), generation).catch(() => {});
    }, 250);
    return () => clearTimeout(timer.current);
  }, [key, loadedKey, encoded, generation]);
  return {
    ready: !!key && loadedKey === key,
    loadError, retry: () => setAttempt(value => value + 1),
    save: () => savePublicationDraft(key, values, generation),
    prepare: () => preparePublicationDraft(key, ownerId, kind, values, generation),
    snapshot: (clientId, payload) => snapshotPublicationPayload(key, ownerId, kind, values, clientId, payload, generation),
    resetOperation: async clientId => { const next = await resetPublicationOperation(key, clientId, generation); setGeneration(next); },
    clear: async (clientId = null) => {
      if (currentDraft.current.key === key && currentDraft.current.encoded === encoded && currentDraft.current.generation === generation) {
        cleared.current = true;
        clearTimeout(timer.current);
      }
      return await clearPublicationDraft(key, JSON.parse(encoded), clientId, generation);
    },
  };
}
