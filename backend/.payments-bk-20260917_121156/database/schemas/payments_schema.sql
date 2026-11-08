-- ============================================================
-- Подписка на разблокировку контактов (Google Play Billing).
-- ============================================================

CREATE TABLE IF NOT EXISTS subscriptions (
    id              TEXT PRIMARY KEY,
    user_id         TEXT NOT NULL,
    provider        TEXT NOT NULL DEFAULT 'google_play',
    product_id      TEXT NOT NULL,
    purchase_token  TEXT NOT NULL,
    status          TEXT NOT NULL DEFAULT 'active',   -- active | expired | cancelled | pending
    auto_renewing   INTEGER NOT NULL DEFAULT 1,
    period_start    TEXT,
    period_end      TEXT,
    raw_response    TEXT,
    created_at      TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (provider, purchase_token)
);
CREATE INDEX IF NOT EXISTS idx_subscriptions_user ON subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(user_id, status, period_end);

-- Лимит бесплатных раскрытий контакта: одна строка на (user_id, deal_id) —
-- повторный просмотр уже раскрытого контакта лимит не тратит (idempotent).
-- period_key ('YYYY-MM') фиксирует, в каком месяце реально ушёл лимит —
-- по нему считается "сколько уже использовано в этом месяце".
CREATE TABLE IF NOT EXISTS contact_reveals (
    id          TEXT PRIMARY KEY,
    user_id     TEXT NOT NULL,
    deal_id     TEXT NOT NULL,
    period_key  TEXT NOT NULL,
    revealed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (user_id, deal_id)
);
CREATE INDEX IF NOT EXISTS idx_contact_reveals_period ON contact_reveals(user_id, period_key);
