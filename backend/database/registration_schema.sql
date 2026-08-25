-- Регистрация водителей (5 этапов) + Lazy registration (4 уровня доверия)

-- Таблица регистрации (пошаговая)
CREATE TABLE IF NOT EXISTS drivers_registration (
  id TEXT PRIMARY KEY,
  phone TEXT UNIQUE,                     -- контактный номер; login identity хранится отдельно
  email TEXT,                            -- canonical Email/Google/Apple login identity
  whatsapp_verified INTEGER DEFAULT 0,

  -- Lazy registration: уровень доверия 0..3
  -- 0 = guest (anonymous, just browsing)
  -- 1 = auth identity verified (phone/email/social)
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
  manual_review_required INTEGER DEFAULT 0,
  manual_review_reason TEXT,
  rejected_reason TEXT,

  -- Связь со скорингом
  security_score INTEGER,
  security_color TEXT,

  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  approved_at TEXT
);

-- OTP codes (legacy table name/column retained for backward compatibility).
CREATE TABLE IF NOT EXISTS verification_codes (
  phone TEXT PRIMARY KEY,
  code TEXT NOT NULL,
  attempts INTEGER DEFAULT 0,
  expires_at TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
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
