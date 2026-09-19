-- Кэш переводов сообщений чата

CREATE TABLE IF NOT EXISTS chat_translations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  message_id INTEGER NOT NULL,
  target_lang TEXT NOT NULL,
  translated_text TEXT NOT NULL,
  provider TEXT DEFAULT 'stub',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(message_id, target_lang)
);

CREATE INDEX IF NOT EXISTS idx_translations_msg ON chat_translations(message_id, target_lang);


-- Общая память точных переводов между сообщениями. Исходный текст в этой
-- таблице не хранится: source_hash привязан к языкам, provider/model и версии
-- промпта, поэтому смена модели или правил не отдаст устаревший результат.
CREATE TABLE IF NOT EXISTS translation_memory (
  source_hash TEXT NOT NULL,
  source_lang TEXT NOT NULL,
  target_lang TEXT NOT NULL,
  translated_text TEXT NOT NULL,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  prompt_version TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  last_used_at TEXT DEFAULT CURRENT_TIMESTAMP,
  hit_count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (source_hash, source_lang, target_lang, provider, model, prompt_version)
);

CREATE INDEX IF NOT EXISTS idx_translation_memory_lookup
  ON translation_memory(source_hash, source_lang, target_lang, provider, model, prompt_version);
