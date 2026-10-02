-- Серверный чат: сообщения сохраняются между сессиями
--
-- Variant B (14.06): КАНОНИЧЕСКАЯ комната сделки = (cargo/trip + owner + bidder).
-- Каноничность гарантируется UNIQUE(deal_key), где deal_key кодирует контекст:
--   cargo-сделка : "c:{cargo_id}:{p1}:{p2}"
--   trip-сделка  : "t:{trip_id}:{p1}:{p2}"
--   без сделки   : "p:{p1}:{p2}"  (поддержка/общий чат — одна комната на пару)
-- p1,p2 = sorted(owner_id, bidder_id). Разные грузы той же пары → РАЗНЫЕ комнаты;
-- повторный get_or_create_deal_room → та же комната. Старая
-- UNIQUE(participant_1, participant_2) убрана (мешала Варианту B).
-- participant_1/2 сохранены для быстрых проверок участия и совместимости.

CREATE TABLE IF NOT EXISTS chat_rooms (
  id TEXT PRIMARY KEY,
  participant_1 TEXT NOT NULL,
  participant_2 TEXT NOT NULL,
  owner_id TEXT,                 -- роль: грузовладелец (cargo) / владелец рейса (trip)
  bidder_id TEXT,                -- роль: водитель/откликнувшийся
  bid_id TEXT,                   -- метаданные активной ставки (НЕ входит в ключ)
  cargo_id TEXT,
  trip_id TEXT,
  deal_key TEXT,                 -- канонический ключ комнаты (см. выше)
  last_message TEXT,
  last_at TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(deal_key)
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  room_id TEXT NOT NULL,
  sender_id TEXT NOT NULL,
  text TEXT,
  photo_url TEXT,
  is_voice INTEGER DEFAULT 0,
  voice_duration INTEGER,
  voice_transcript TEXT,
  voice_transcript_lang TEXT,
  voice_transcript_provider TEXT,
  voice_transcribed_at TEXT,
  is_read INTEGER DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_chat_rooms_p1 ON chat_rooms(participant_1);
CREATE INDEX IF NOT EXISTS idx_chat_rooms_p2 ON chat_rooms(participant_2);
CREATE INDEX IF NOT EXISTS idx_chat_rooms_cargo ON chat_rooms(cargo_id);
CREATE INDEX IF NOT EXISTS idx_chat_msg_room ON chat_messages(room_id, created_at);
CREATE INDEX IF NOT EXISTS idx_chat_msg_unread ON chat_messages(room_id, is_read, sender_id);

-- Background STT is created only for newly sent voice messages. The tuple
-- makes audio/model changes explicit and prevents duplicate inference under
-- retries or multiple worker processes. Transcript text stays on the message
-- but is not returned by chat history until an authorized explicit request.
CREATE TABLE IF NOT EXISTS voice_processing_jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  message_id INTEGER NOT NULL,
  audio_version TEXT NOT NULL,
  model_version TEXT NOT NULL,
  source_lang TEXT,
  target_lang TEXT,
  status TEXT NOT NULL DEFAULT 'queued',
  attempt_count INTEGER NOT NULL DEFAULT 0,
  next_retry_at TEXT DEFAULT CURRENT_TIMESTAMP,
  locked_at TEXT,
  locked_by TEXT,
  force_reprocess INTEGER NOT NULL DEFAULT 0,
  -- Only queued/processing/retryable jobs expire.  A ready result belongs to
  -- its chat message and uses a never-expire legacy-compatible sentinel.
  expires_at TEXT,
  last_error TEXT,
  ready_at TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(message_id, audio_version, model_version)
);

-- Operational STT evidence deliberately excludes raw audio, transcript,
-- translation and provider payloads.  It is separate from message content so
-- bounded QA2 cost/latency reporting cannot become a conversation dataset.
CREATE TABLE IF NOT EXISTS voice_processing_metrics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id INTEGER,
  message_id INTEGER NOT NULL,
  provider TEXT NOT NULL,
  model TEXT,
  latency_ms INTEGER,
  audio_duration_seconds INTEGER,
  usage_input_tokens INTEGER,
  usage_output_tokens INTEGER,
  usage_total_tokens INTEGER,
  estimated_cost_microusd INTEGER,
  -- `stt`, `translation` or `persist`; no user content is stored here.
  stage TEXT NOT NULL DEFAULT 'stt',
  outcome TEXT NOT NULL,
  fallback INTEGER NOT NULL DEFAULT 0,
  error_category TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_voice_processing_metrics_message
  ON voice_processing_metrics(message_id, created_at);
-- The ready index is created by ``api.chat._ensure_columns`` after additive
-- upgrades have supplied all columns on a database created by an older queue
-- revision.  Keeping it out of this script avoids startup failure when an
-- existing table lacks a newly introduced indexed column.
