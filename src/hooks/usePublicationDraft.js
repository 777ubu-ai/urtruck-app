import { useEffect, useRef, useState } from 'react';
import { publicationDraftKey, readPublicationDraft, savePublicationDraft, clearPublicationDraft } from '../utils/publicationDraft';

// Черновик принадлежит конкретному аккаунту. Смена bearer не переносит форму другому человеку.
export function usePublicationDraft(kind, ownerId, values, setters) {
  const key = publicationDraftKey(kind, ownerId);
  const [loadedKey, setLoadedKey] = useState(null);
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
    readPublicationDraft(key).then(draft => {
      if (!alive) return;
      if (draft) for (const [field, set] of Object.entries(settersRef.current)) {
        if (Object.prototype.hasOwnProperty.call(draft, field)) set(draft[field]);
      }
      setLoadedKey(key);
    }).catch(() => { if (alive) setLoadError(true); });
    return () => { alive = false; };
  }, [key, attempt]);
  const encoded = JSON.stringify(values);
  const currentDraft = useRef({ key, encoded });
  currentDraft.current = { key, encoded };
  useEffect(() => {
    if (!key || loadedKey !== key || cleared.current) return;
    timer.current = setTimeout(() => {
      if (!cleared.current) savePublicationDraft(key, JSON.parse(encoded)).catch(() => {});
    }, 250);
    return () => clearTimeout(timer.current);
  }, [key, loadedKey, encoded]);
  return {
    ready: !!key && loadedKey === key,
    loadError, retry: () => setAttempt(value => value + 1),
    save: () => savePublicationDraft(key, values),
    clear: async () => {
      if (currentDraft.current.key === key && currentDraft.current.encoded === encoded) {
        cleared.current = true;
        clearTimeout(timer.current);
      }
      await clearPublicationDraft(key, JSON.parse(encoded));
    },
  };
}
