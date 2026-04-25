-- Серверный чат: сообщения сохраняются между сессиями

CREATE TABLE IF NOT EXISTS chat_rooms (
  id TEXT PRIMARY KEY,
  participant_1 TEXT NOT NULL,
  participant_2 TEXT NOT NULL,
  cargo_id TEXT,
  trip_id TEXT,
  last_message TEXT,
  last_at TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(participant_1, participant_2)
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  room_id TEXT NOT NULL,
  sender_id TEXT NOT NULL,
  text TEXT,
  photo_url TEXT,
  is_voice INTEGER DEFAULT 0,
  voice_duration INTEGER,
  is_read INTEGER DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_chat_rooms_p1 ON chat_rooms(participant_1);
CREATE INDEX IF NOT EXISTS idx_chat_rooms_p2 ON chat_rooms(participant_2);
CREATE INDEX IF NOT EXISTS idx_chat_msg_room ON chat_messages(room_id, created_at);
CREATE INDEX IF NOT EXISTS idx_chat_msg_unread ON chat_messages(room_id, is_read, sender_id);
