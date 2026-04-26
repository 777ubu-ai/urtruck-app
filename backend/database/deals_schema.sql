-- Сделки — создаются при accept bid

CREATE TABLE IF NOT EXISTS deals (
  id TEXT PRIMARY KEY,
  cargo_id TEXT,
  trip_id TEXT,
  bid_id TEXT NOT NULL,

  shipper_id TEXT NOT NULL,       -- грузовладелец
  driver_id TEXT NOT NULL,        -- водитель

  from_city TEXT NOT NULL,
  to_city TEXT NOT NULL,
  amount INTEGER NOT NULL,        -- согласованная цена $

  status TEXT DEFAULT 'accepted', -- accepted | in_progress | delivered | cancelled
  chat_room_id TEXT,              -- привязанная комната чата

  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_deals_shipper ON deals(shipper_id, status);
CREATE INDEX IF NOT EXISTS idx_deals_driver ON deals(driver_id, status);
CREATE INDEX IF NOT EXISTS idx_deals_cargo ON deals(cargo_id);
CREATE INDEX IF NOT EXISTS idx_deals_status ON deals(status, created_at);
