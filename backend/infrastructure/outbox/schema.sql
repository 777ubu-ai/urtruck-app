-- Domain outbox, separate from push_outbox.
CREATE TABLE IF NOT EXISTS domain_outbox (
    event_id TEXT PRIMARY KEY,
    event_type TEXT NOT NULL,
    aggregate_type TEXT NOT NULL,
    aggregate_id TEXT NOT NULL,
    payload TEXT NOT NULL,
    created_at TEXT NOT NULL,
    processed_at TEXT,
    attempts INTEGER NOT NULL DEFAULT 0,
    next_attempt_at TEXT,
    claimed_at TEXT,
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'processing', 'processed', 'failed'))
);
CREATE INDEX IF NOT EXISTS idx_domain_outbox_pending
    ON domain_outbox(status, next_attempt_at, created_at);
