// Состояние только голосового текста одной комнаты/сессии. Сервер остаётся
// источником сохранённых original/переводов; запись и плеер сюда не входят.
export function normalizeVoiceLanguage(value) {
  const code = String(value || '').trim().toLowerCase().split(/[-_]/)[0];
  const aliases = { russian: 'ru', rus: 'ru', chinese: 'zh', chi: 'zh', zho: 'zh', cn: 'zh', english: 'en', eng: 'en', kazakh: 'kk', kaz: 'kk', kz: 'kk' };
  return code === 'auto' ? '' : (aliases[code] || code);
}

function validTranslation(result, targetLang) {
  return typeof result?.translated_text === 'string' && !!result.translated_text.trim()
    && typeof result.provider === 'string' && !!result.provider.trim()
    && !/stub|error|^skip|unknown/i.test(result.provider)
    && (!result.target_lang || normalizeVoiceLanguage(result.target_lang) === targetLang);
}

function unavailable(code = null) {
  return Object.assign(new Error('voice_text_unavailable'), { code });
}

export function createVoiceTranscriptState(api) {
  const entries = new Map();
  const listeners = new Set();
  let active = true;
  let generation = 0;
  const emit = () => { if (active) listeners.forEach((listener) => listener()); };
  const entryFor = (id) => {
    const key = String(id);
    if (!entries.has(key)) entries.set(key, { id: key, targets: new Map(), visible: false });
    return entries.get(key);
  };
  const targetFor = (entry, lang) => {
    if (!entry.targets.has(lang)) entry.targets.set(lang, {});
    return entry.targets.get(lang);
  };
  const ready = (entry, lang) => !!entry.transcriptText
    && (entry.sourceLang === lang || !!entry.targets.get(lang)?.translatedText);

  function setOriginal(entry, text, sourceLang, provider) {
    if (typeof text !== 'string' || !text.trim()) return false;
    const source = normalizeVoiceLanguage(sourceLang);
    const originalProvider = provider || null;
    if (entry.transcriptText === text && entry.sourceLang === source && entry.provider === originalProvider) return false;
    // Новый original не должен наследовать перевод старой версии текста.
    if (entry.transcriptText && entry.transcriptText !== text) entry.targets.clear();
    Object.assign(entry, { transcriptText: text, sourceLang: source, provider: originalProvider });
    return true;
  }

  function hydrate(messages) {
    if (!active) return;
    let changed = false;
    for (const item of messages) {
      if (!item?.voice || !item.id || !item.transcript) continue;
      changed = setOriginal(entryFor(item.id), item.transcript, item.transcriptLang, item.transcriptProvider) || changed;
    }
    if (changed) emit();
  }

  function transcribe(entry, lang, isCurrent) {
    if (entry.sttPending) return entry.sttPending;
    entry.sttPending = Promise.resolve().then(async () => {
      if (!isCurrent()) return null;
      const result = await api.transcribe(entry.id, lang);
      if (!isCurrent()) return null;
      if (!result?.transcript_text?.trim() || /stub|error/i.test(result.provider || '')) throw unavailable();
      setOriginal(entry, result.transcript_text, result.source_lang, result.provider);
      const translated = { translated_text: result.translated_text, provider: result.translation_provider, target_lang: result.target_lang };
      if (!result.translation_error && validTranslation(translated, lang)) {
        Object.assign(targetFor(entry, lang), { translatedText: translated.translated_text, provider: translated.provider });
      }
      return { targetLang: lang, translationError: result.translation_error };
    }).finally(() => {
      if (isCurrent()) { entry.sttPending = null; emit(); }
    });
    return entry.sttPending;
  }

  function load(entry, lang) {
    if (!active || !lang) return Promise.resolve();
    const target = targetFor(entry, lang);
    if (target.pending) return target.pending;
    if (ready(entry, lang)) return Promise.resolve();
    const requestGeneration = generation;
    const isCurrent = () => active && generation === requestGeneration;
    target.error = null;
    target.showOriginal = false;
    target.pending = Promise.resolve().then(async () => {
      if (!isCurrent()) return;
      let sttResult = null;
      if (!entry.transcriptText) sttResult = await transcribe(entry, lang, isCurrent);
      if (!isCurrent() || ready(entry, lang)) return;
      // Первый /transcribe уже пытался перевести на этот язык. Не повторяем
      // платный этап сразу после его ошибки; следующий retry — /translate.
      if (sttResult?.targetLang === lang) throw unavailable(sttResult.translationError);
      const original = entry.transcriptText;
      const result = await api.translate(entry.id, lang);
      if (!isCurrent()) return;
      if (entry.transcriptText !== original || !validTranslation(result, lang)) throw unavailable();
      Object.assign(target, { translatedText: result.translated_text, provider: result.provider });
    }).catch((error) => {
      if (isCurrent()) target.error = {
        code: error?.code || null,
        key: entry.transcriptText ? 'translation_unavailable' : 'voice_transcription_unavailable',
      };
    }).finally(() => {
      if (isCurrent()) { target.pending = null; emit(); }
    });
    emit();
    return target.pending;
  }

  function view(id, language, t = (key) => key) {
    const entry = entries.get(String(id));
    if (!entry) return undefined;
    const lang = normalizeVoiceLanguage(language);
    const target = entry.targets.get(lang) || {};
    const errorKey = target.error?.code ? `err_${target.error.code}` : null;
    const localized = errorKey ? t(errorKey) : null;
    return {
      visible: entry.visible,
      transcriptText: entry.transcriptText,
      sourceLang: entry.sourceLang,
      provider: entry.provider,
      translatedText: target.translatedText || null,
      translationProvider: target.provider || null,
      showOriginal: !!target.showOriginal,
      needsTranslation: !!entry.transcriptText && entry.sourceLang !== lang,
      transcribing: !!entry.sttPending || !!target.pending,
      translationError: !!target.error && !!entry.transcriptText,
      errorText: target.error ? (localized && localized !== errorKey ? localized : t(target.error.key)) : null,
    };
  }

  return {
    hydrate,
    view,
    prewarm(id) {
      if (!active || !id) return Promise.resolve();
      const entry = entryFor(id);
      const requestGeneration = generation;
      const isCurrent = () => active && generation === requestGeneration;
      const pending = transcribe(entry, '', isCurrent);
      // Publish the in-flight state immediately. If the user taps “В текст”
      // while background STT is running, toggle() reuses this same promise
      // instead of issuing a second request that receives HTTP 409.
      emit();
      return pending.catch(() => null);
    },
    connect(listener) {
      active = true;
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
        if (!listeners.size) {
          active = false;
          generation += 1;
          entries.clear();
        }
      };
    },
    toggle(item, language) {
      if (!active || !item?.id) return Promise.resolve();
      hydrate([item]);
      const entry = entryFor(item.id);
      const lang = normalizeVoiceLanguage(language);
      const target = targetFor(entry, lang);
      if (target.pending) return target.pending;
      if (entry.visible && ready(entry, lang)) { entry.visible = false; emit(); return Promise.resolve(); }
      entry.visible = true;
      emit();
      return load(entry, lang);
    },
    retry(item, language) {
      if (!active || !item?.id) return Promise.resolve();
      hydrate([item]);
      const entry = entryFor(item.id);
      entry.visible = true;
      return load(entry, normalizeVoiceLanguage(language));
    },
    toggleOriginal(id, language) {
      if (!active) return;
      const entry = entries.get(String(id));
      const target = entry?.targets.get(normalizeVoiceLanguage(language));
      if (!target?.translatedText) return;
      target.showOriginal = !target.showOriginal;
      emit();
    },
    ensureVisible(language) {
      return Promise.all([...entries.values()].filter((entry) => entry.visible)
        .map((entry) => load(entry, normalizeVoiceLanguage(language))));
    },
  };
}
