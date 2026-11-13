-- Только явные исправления стран. Исходные значения и согласования сохраняются.
CREATE TABLE IF NOT EXISTS route_country_clarifications (
  id TEXT PRIMARY KEY,
  entity_kind TEXT NOT NULL CHECK(entity_kind IN ('cargo', 'trip', 'deal')),
  entity_id TEXT NOT NULL,
  request_id TEXT NOT NULL,
  proposer_id TEXT NOT NULL,
  approver_id TEXT,
  from_country_before TEXT,
  to_country_before TEXT,
  from_country_after TEXT NOT NULL,
  to_country_after TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('pending', 'applied', 'superseded')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  applied_at TEXT,
  UNIQUE(entity_kind, entity_id, request_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_route_country_one_pending
  ON route_country_clarifications(entity_kind, entity_id) WHERE status='pending';
CREATE INDEX IF NOT EXISTS idx_route_country_history
  ON route_country_clarifications(entity_kind, entity_id, created_at);
