-- Отзывы после поездок: клиент → водитель, водитель → клиент

CREATE TABLE IF NOT EXISTS reviews (
  id TEXT PRIMARY KEY,
  trip_id TEXT,                          -- связь с рейсом (опционально)
  author_id TEXT NOT NULL,               -- кто оставил
  author_role TEXT NOT NULL,             -- driver | client
  target_id TEXT NOT NULL,               -- о ком
  target_role TEXT NOT NULL,             -- driver | client
  rating INTEGER NOT NULL,               -- 1..5
  text TEXT,                             -- комментарий (опционально)
  tags TEXT,                             -- JSON: ["punctual", "clean", "polite"]
  is_visible INTEGER DEFAULT 1,          -- модератор может скрыть
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_reviews_target ON reviews(target_id, is_visible);
CREATE INDEX IF NOT EXISTS idx_reviews_author ON reviews(author_id);
CREATE INDEX IF NOT EXISTS idx_reviews_trip ON reviews(trip_id);
