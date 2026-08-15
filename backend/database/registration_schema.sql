-- Регистрация водителей (5 этапов) + Lazy registration (4 уровня доверия)

-- Таблица регистрации (пошаговая)
CREATE TABLE IF NOT EXISTS drivers_registration (
  id TEXT PRIMARY KEY,
  phone TEXT UNIQUE,                     -- NULL для guest (level 0)
  whatsapp_verified INTEGER DEFAULT 0,
  phone_verified INTEGER DEFAULT 0,      -- только OTP реального номера, не email
  email TEXT,
  email_verified INTEGER DEFAULT 0,

  -- Lazy registration: уровень доверия 0..3
  -- 0 = guest (anonymous, just browsing)
  -- 1 = phone verified (OTP passed)
  -- 2 = identity (IIN + selfie + liveness)
  -- 3 = full driver (license + vehicle passport + vehicle)
  verification_level INTEGER DEFAULT 0,
  role TEXT DEFAULT 'guest',             -- guest | client | driver

  -- Digital ID (этап 2)
  iin TEXT,
  full_name TEXT,
  selfie_url TEXT,
  face_verified INTEGER DEFAULT 0,
  face_quality REAL,
  face_match_score REAL,

  -- Документы (этап 3)
  license_url TEXT,
  license_ocr TEXT,                    -- JSON: категория, стаж, номер
  license_verified INTEGER DEFAULT 0,
  passport_url TEXT,
  passport_ocr TEXT,                   -- JSON: plate, VIN, brand, year
  passport_verified INTEGER DEFAULT 0,

  -- Транспорт (этап 4)
  vehicle_type TEXT,                   -- car | van | truck | tent | ref | platform
  vehicle_capacity_kg INTEGER,
  vehicle_plate TEXT,
  vehicle_brand TEXT,
  vehicle_year INTEGER,
  vehicle_vin TEXT,
  vehicle_photo_url TEXT,

  -- Статусы
  current_step INTEGER DEFAULT 1,      -- 1-5
  status TEXT DEFAULT 'pending',       -- pending | under_review | approved | rejected | manual_review
  moderation_score REAL,               -- авто-модерация 0-1
  auto_approved INTEGER DEFAULT 0,
  manual_review_required INTEGER DEFAULT 0,  -- падение face API → ручная проверка
  manual_review_reason TEXT,
  rejected_reason TEXT,

  -- Связь со скорингом
  security_score INTEGER,
  security_color TEXT,

  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  approved_at TEXT
);

-- WhatsApp коды подтверждения (TTL 5 минут)
CREATE TABLE IF NOT EXISTS verification_codes (
  phone TEXT PRIMARY KEY,
  code TEXT NOT NULL,
  attempts INTEGER DEFAULT 0,
  expires_at TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- SEC-005: Telegram получает только high-entropy challenge, никогда сам OTP.
-- Challenge привязывается к private Telegram actor/chat, затем атомарно
-- поглощается только после проверки self-contact с тем же номером телефона.
CREATE TABLE IF NOT EXISTS telegram_otp_challenges (
  token_hash TEXT PRIMARY KEY,
  phone TEXT NOT NULL,
  otp_digest TEXT NOT NULL,
  telegram_user_id TEXT,
  telegram_chat_id TEXT,
  state TEXT NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0,
  expires_at TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  bound_at TEXT,
  consumed_at TEXT
);

-- Persistent limiter shared by all API workers using the same project DB.
CREATE TABLE IF NOT EXISTS telegram_otp_rate_limits (
  scope_hash TEXT PRIMARY KEY,
  attempts INTEGER NOT NULL DEFAULT 0,
  window_started TEXT NOT NULL,
  blocked_until TEXT
);

-- Сессии (токены)
CREATE TABLE IF NOT EXISTS reg_sessions (
  token TEXT PRIMARY KEY,
  driver_id TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_reg_phone ON drivers_registration(phone);
CREATE INDEX IF NOT EXISTS idx_reg_status ON drivers_registration(status);
CREATE INDEX IF NOT EXISTS idx_reg_step ON drivers_registration(current_step);
CREATE INDEX IF NOT EXISTS idx_tg_otp_phone_state ON telegram_otp_challenges(phone, state);
CREATE INDEX IF NOT EXISTS idx_tg_otp_actor_state ON telegram_otp_challenges(telegram_user_id, telegram_chat_id, state);
