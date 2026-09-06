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

-- Unified device registry for owned native push delivery.
-- push_tokens_native stays as legacy/compat storage; push_devices is the
-- canonical registry for FCM/APNs/Expo provider selection and token lifecycle.
CREATE TABLE IF NOT EXISTS push_devices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT,
  device_id TEXT,
  platform TEXT,
  app_id TEXT,
  push_provider TEXT NOT NULL,
  push_token TEXT NOT NULL,
  locale TEXT,
  app_version TEXT,
  os_version TEXT,
  device_model TEXT,
  enabled INTEGER NOT NULL DEFAULT 1,
  last_seen_at TEXT DEFAULT CURRENT_TIMESTAMP,
  token_updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  last_success_at TEXT,
  last_failure_at TEXT,
  failure_count INTEGER NOT NULL DEFAULT 0,
  invalidated_at TEXT,
  invalidated_reason TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(push_provider, push_token)
);

CREATE INDEX IF NOT EXISTS idx_push_devices_user ON push_devices(user_id);
CREATE INDEX IF NOT EXISTS idx_push_devices_device ON push_devices(device_id);
CREATE INDEX IF NOT EXISTS idx_push_devices_provider ON push_devices(push_provider, platform);

CREATE TABLE IF NOT EXISTS push_outbox (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  recipient_user_id TEXT NOT NULL,
  payload TEXT NOT NULL,
  priority TEXT NOT NULL DEFAULT 'normal',
  status TEXT NOT NULL DEFAULT 'pending',
  attempt_count INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TEXT DEFAULT CURRENT_TIMESTAMP,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  sent_at TEXT,
  failed_at TEXT,
  last_error TEXT,
  processing_started_at TEXT,
  UNIQUE(event_id, recipient_user_id)
);

CREATE INDEX IF NOT EXISTS idx_push_outbox_status_next ON push_outbox(status, next_attempt_at);
CREATE INDEX IF NOT EXISTS idx_push_outbox_event_type ON push_outbox(event_type);

CREATE TABLE IF NOT EXISTS push_delivery_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id TEXT,
  recipient_user_id TEXT,
  device_registry_id INTEGER,
  device_id TEXT,
  provider TEXT NOT NULL,
  attempt INTEGER NOT NULL DEFAULT 1,
  provider_message_id TEXT,
  status TEXT NOT NULL,
  provider_response TEXT,
  sent_at TEXT,
  delivered_at TEXT,
  error_code TEXT,
  token_masked TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_push_delivery_dedupe
  ON push_delivery_log(event_id, device_registry_id)
  WHERE event_id IS NOT NULL AND status = 'sent';
CREATE INDEX IF NOT EXISTS idx_push_delivery_event ON push_delivery_log(event_id);

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
  event_key TEXT,                          -- PR#187: дедуп доставок по ключу перехода
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_push_log_user ON push_log(user_id);
CREATE INDEX IF NOT EXISTS idx_push_log_kind ON push_log(kind);
-- PR#187: уникальный индекс дедупа НЕ создаём здесь — на legacy-БД (push_log
-- без event_key) он падал бы «no such column». Индекс создаётся в
-- api/push._migrate_ownership_columns СТРОГО после ADD COLUMN event_key
-- (работает и на fresh, и на legacy). См. также notifications._migrate_event_key.
