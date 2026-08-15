-- Web Push подписки

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT,                          -- может быть NULL для guest'ов
  endpoint TEXT UNIQUE NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  user_agent TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  last_seen TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_push_user ON push_subscriptions(user_id);

-- Native Push (FCM/APNs) токены. Для FCM приложения напрямую и для Expo Push.
-- provider: 'expo' | 'fcm' | 'apns'
CREATE TABLE IF NOT EXISTS push_tokens_native (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT,
  token TEXT UNIQUE NOT NULL,
  provider TEXT NOT NULL DEFAULT 'expo',
  platform TEXT,                          -- 'ios' | 'android' | 'web'
  device_name TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  last_seen TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_push_native_user ON push_tokens_native(user_id);

-- Лог отправленных push (для отладки и avoiding дубликатов)
CREATE TABLE IF NOT EXISTS push_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT,
  kind TEXT NOT NULL,                     -- 'bid' | 'chat' | 'trip_state' | 'reminder' | 'welcome'
  title TEXT,
  body TEXT,
  data_json TEXT,
  web_sent INTEGER DEFAULT 0,
  native_sent INTEGER DEFAULT 0,
  error TEXT,
  event_key TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_push_log_user ON push_log(user_id);
CREATE INDEX IF NOT EXISTS idx_push_log_kind ON push_log(kind);

CREATE UNIQUE INDEX IF NOT EXISTS idx_push_log_event_key ON push_log(user_id, event_key) WHERE event_key IS NOT NULL;
