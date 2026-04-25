CREATE TABLE IF NOT EXISTS saved_searches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  from_city TEXT,
  to_city TEXT,
  truck_type TEXT,
  min_price INTEGER,
  max_price INTEGER,
  notify INTEGER DEFAULT 1,           -- push при новом matching грузе
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, from_city, to_city)
);

CREATE INDEX IF NOT EXISTS idx_ss_user ON saved_searches(user_id);
CREATE INDEX IF NOT EXISTS idx_ss_route ON saved_searches(from_city, to_city);
