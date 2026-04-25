CREATE TABLE IF NOT EXISTS favorites (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  item_type TEXT NOT NULL,        -- cargo | driver | route
  item_id TEXT NOT NULL,
  item_data TEXT,                  -- JSON snapshot для офлайн показа
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, item_type, item_id)
);

CREATE INDEX IF NOT EXISTS idx_fav_user ON favorites(user_id);
