-- ============================================================
-- Deal Room foundation.
-- conversation_id хранит chat_rooms.id (room_id) для совместимости.
-- ============================================================

CREATE TABLE IF NOT EXISTS conversation_participants (
    id              TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL,
    user_id         TEXT NOT NULL,
    role            TEXT NOT NULL DEFAULT 'member',
    joined_at       TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    left_at         TEXT,
    is_active       INTEGER NOT NULL DEFAULT 1,
    UNIQUE (conversation_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_conv_part_conv ON conversation_participants(conversation_id);
CREATE INDEX IF NOT EXISTS idx_conv_part_user ON conversation_participants(user_id);

CREATE TABLE IF NOT EXISTS message_attachments (
    id               TEXT PRIMARY KEY,
    message_id       TEXT,
    conversation_id  TEXT NOT NULL,
    uploader_id      TEXT NOT NULL,
    kind             TEXT NOT NULL DEFAULT 'other',
    url              TEXT,
    mime_type        TEXT,
    size_bytes       INTEGER,
    original_name    TEXT,
    client_upload_id TEXT,
    upload_status    TEXT NOT NULL DEFAULT 'queued',
    created_at       TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_msg_att_conv ON message_attachments(conversation_id);
CREATE INDEX IF NOT EXISTS idx_msg_att_msg ON message_attachments(message_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_msg_att_client_upload
ON message_attachments(conversation_id, uploader_id, client_upload_id)
WHERE client_upload_id IS NOT NULL AND client_upload_id != '';

CREATE TABLE IF NOT EXISTS message_read_receipts (
    id          TEXT PRIMARY KEY,
    message_id  TEXT NOT NULL,
    user_id     TEXT NOT NULL,
    read_at     TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (message_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_read_rcpt_user ON message_read_receipts(user_id);

CREATE TABLE IF NOT EXISTS deal_events (
    id              TEXT PRIMARY KEY,
    conversation_id TEXT,
    event_type      TEXT NOT NULL,
    i18n_key        TEXT NOT NULL,
    payload_json    TEXT,
    actor_id        TEXT,
    actor_role      TEXT,
    load_id         TEXT,
    trip_id         TEXT,
    bid_id          TEXT,
    deal_id         TEXT,
    created_at      TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    is_system       INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_deal_events_deal ON deal_events(deal_id);
CREATE INDEX IF NOT EXISTS idx_deal_events_conv ON deal_events(conversation_id);

CREATE TRIGGER IF NOT EXISTS trg_deal_events_dedupe_status
BEFORE INSERT ON deal_events
WHEN NEW.event_type = 'deal.status_changed'
 AND NEW.deal_id IS NOT NULL
 AND EXISTS (
    SELECT 1
    FROM deal_events e
    WHERE e.deal_id = NEW.deal_id
      AND e.event_type = NEW.event_type
      AND COALESCE(e.payload_json, '') = COALESCE(NEW.payload_json, '')
 )
BEGIN
    SELECT RAISE(IGNORE);
END;

CREATE TABLE IF NOT EXISTS support_escalations (
    id                       TEXT PRIMARY KEY,
    conversation_id          TEXT,
    requested_by_user_id     TEXT NOT NULL,
    assigned_support_user_id TEXT,
    status                   TEXT NOT NULL DEFAULT 'open',
    reason                   TEXT,
    created_at               TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    closed_at                TEXT
);
CREATE INDEX IF NOT EXISTS idx_support_esc_status ON support_escalations(status);
CREATE INDEX IF NOT EXISTS idx_support_esc_user ON support_escalations(requested_by_user_id);
