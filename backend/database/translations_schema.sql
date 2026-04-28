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
