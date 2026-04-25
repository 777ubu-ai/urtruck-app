-- UrTruck Security — схема БД (SQLite)

CREATE TABLE IF NOT EXISTS driver_scores (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  driver_id TEXT,
  total_score INTEGER DEFAULT 50 CHECK (total_score >= 0 AND total_score <= 100),
  color_code TEXT DEFAULT 'yellow' CHECK (color_code IN ('green', 'yellow', 'red', 'black')),
  identity_score INTEGER DEFAULT 0,
  reputation_score INTEGER DEFAULT 0,
  social_score INTEGER DEFAULT 0,
  experience_score INTEGER DEFAULT 0,
  vehicle_score INTEGER DEFAULT 0,
  financial_score INTEGER DEFAULT 0,
  bonus_score INTEGER DEFAULT 0,
  last_checked TEXT DEFAULT CURRENT_TIMESTAMP,
  next_check TEXT,
  check_count INTEGER DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS blacklist (
  id TEXT PRIMARY KEY,
  phone TEXT,
  plate_number TEXT,
  full_name TEXT,
  reason TEXT NOT NULL,
  source TEXT,
  source_link TEXT,
  severity TEXT DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS verification_logs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  check_type TEXT NOT NULL,
  check_source TEXT NOT NULL,
  result TEXT NOT NULL,
  details TEXT,
  score_impact INTEGER DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS telegram_mentions (
  id TEXT PRIMARY KEY,
  chat_name TEXT,
  chat_id INTEGER,
  message_id INTEGER,
  message_text TEXT,
  mentioned_phone TEXT,
  mentioned_plate TEXT,
  mentioned_name TEXT,
  keywords_found TEXT,
  sentiment TEXT,
  screenshot_url TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS ocr_results (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  document_type TEXT,
  image_url TEXT,
  extracted_data TEXT,
  confidence REAL,
  is_verified INTEGER DEFAULT 0,
  verified_by TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS security_alerts (
  id TEXT PRIMARY KEY,
  alert_type TEXT,
  severity TEXT,
  driver_id TEXT,
  cargo_id TEXT,
  message TEXT,
  is_resolved INTEGER DEFAULT 0,
  resolved_by TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_scores_user ON driver_scores(user_id);
CREATE INDEX IF NOT EXISTS idx_scores_color ON driver_scores(color_code);
CREATE INDEX IF NOT EXISTS idx_blacklist_phone ON blacklist(phone);
CREATE INDEX IF NOT EXISTS idx_blacklist_plate ON blacklist(plate_number);
CREATE INDEX IF NOT EXISTS idx_telegram_phone ON telegram_mentions(mentioned_phone);
CREATE INDEX IF NOT EXISTS idx_telegram_plate ON telegram_mentions(mentioned_plate);
CREATE INDEX IF NOT EXISTS idx_alerts_active ON security_alerts(is_resolved);
