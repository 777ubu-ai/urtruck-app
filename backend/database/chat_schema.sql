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
  is_read INTEGER DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_chat_rooms_p1 ON chat_rooms(participant_1);
CREATE INDEX IF NOT EXISTS idx_chat_rooms_p2 ON chat_rooms(participant_2);
CREATE INDEX IF NOT EXISTS idx_chat_rooms_cargo ON chat_rooms(cargo_id);
CREATE INDEX IF NOT EXISTS idx_chat_msg_room ON chat_messages(room_id, created_at);
CREATE INDEX IF NOT EXISTS idx_chat_msg_unread ON chat_messages(room_id, is_read, sender_id);
