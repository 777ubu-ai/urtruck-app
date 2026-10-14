// Явный state-machine ручного текстового перевода одной приватной комнаты.
// Polling/hydrate читают только сохранённый результат и никогда не запускают AI.
export function normalizeTextTranslationLanguage(value) {
  const code = String(value || '').trim().toLowerCase().split(/[-_]/)[0];
  const aliases = { russian: 'ru', rus: 'ru', chinese: 'zh', chi: 'zh', cn: 'zh', english: 'en', eng: 'en', kazakh: 'kk', kaz: 'kk', kz: 'kk' };
  return aliases[code] || code;
}

export function manualTextTranslationCacheKey(roomId, userId, language) {
  return `ur_chat_translation_v1:${roomId || 'none'}:${userId || 'anonymous'}:${normalizeTextTranslationLanguage(language)}`;
}

function usable(result, language) {
  const provider = String(result?.provider || '').trim();
  const target = result?.target_lang ? normalizeTextTranslationLanguage(result.target_lang) : language;
  return typeof result?.translated_text === 'string' && !!result.translated_text.trim()
    && !!provider && !/stub|error|unknown/i.test(provider) && target === language;
}

export function createManualTextTranslationState(api, persistence, { roomId, userId, language }) {
  const targetLanguage = normalizeTextTranslationLanguage(language);
  const cacheKey = manualTextTranslationCacheKey(roomId, userId, targetLanguage);
  const translations = new Map();
  const errors = new Map();
  const pending = new Map();
  const listeners = new Set();
  let active = true;
  let generation = 0;
  const current = (requestGeneration) => active && generation === requestGeneration;
  const emit = () => { if (active) listeners.forEach((listener) => listener()); };

  async function hydrate() {
    const requestGeneration = generation;
    const raw = await persistence.get(cacheKey);
    if (!current(requestGeneration) || !raw) return;
    try {
      const cached = JSON.parse(raw);
      if (!cached || typeof cached !== 'object' || Array.isArray(cached)) return;
      Object.entries(cached).forEach(([id, value]) => {
        if (typeof value?.text === 'string' && value.text.trim()) translations.set(String(id), value);
      });
      emit();
    } catch { /* Повреждённый кэш не мешает открытому чату. */ }
  }

  function view(id) {
    const key = String(id);
    return {
      translation: translations.get(key) || null,
      error: errors.get(key) || null,
      pending: pending.has(key),
    };
  }

  function translate(id) {
    const key = String(id);
    if (!active || !key) return Promise.resolve(null);
    if (translations.has(key)) return Promise.resolve(translations.get(key));
    if (pending.has(key)) return pending.get(key);
    const requestGeneration = generation;
    errors.delete(key);
    const request = Promise.resolve().then(async () => {
      const result = await api.translate(key, targetLanguage);
      if (!current(requestGeneration)) return null;
      if (!usable(result, targetLanguage)) throw new Error('translation_unavailable');
      const value = { text: result.translated_text, provider: result.provider };
      translations.set(key, value);
      const serialized = Object.fromEntries(translations);
      void persistence.set(cacheKey, JSON.stringify(serialized));
      return value;
    }).catch(() => {
      if (current(requestGeneration)) errors.set(key, { code: 'translation_unavailable' });
      return null;
    }).finally(() => {
      if (current(requestGeneration)) pending.delete(key);
      if (current(requestGeneration)) emit();
    });
    pending.set(key, request);
    emit();
    return request;
  }

  return {
    cacheKey,
    hydrate,
    view,
    translate,
    retry: translate,
    connect(listener) {
      active = true;
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
        if (!listeners.size) {
          active = false;
          generation += 1;
          pending.clear();
          translations.clear();
          errors.clear();
        }
      };
    },
  };
}
