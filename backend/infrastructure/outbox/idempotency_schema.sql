-- SQLite-compatible idempotency record. Add within the caller's transaction.
CREATE TABLE IF NOT EXISTS idempotency_records (
    operation_key TEXT PRIMARY KEY,
    operation_name TEXT NOT NULL,
    payload_fingerprint TEXT NOT NULL,
    result_payload TEXT,
    status TEXT NOT NULL DEFAULT 'reserved'
        CHECK (status IN ('reserved', 'completed', 'failed')),
    created_at TEXT NOT NULL,
    completed_at TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_idempotency_operation_key
    ON idempotency_records(operation_key);
