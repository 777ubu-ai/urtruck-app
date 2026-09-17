-- Отдельные машины водителя. Машина не является набором полей профиля.
CREATE TABLE IF NOT EXISTS vehicles (
  id TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL,
  vehicle_registration_country_code TEXT NOT NULL,
  vehicle_type TEXT NOT NULL,
  body_type TEXT NOT NULL,
  make TEXT NOT NULL,
  model TEXT NOT NULL,
  license_plate TEXT NOT NULL,
  payload_tons REAL NOT NULL,
  cargo_volume_m3 REAL NOT NULL,
  cargo_length_m REAL,
  cargo_width_m REAL,
  cargo_height_m REAL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(owner_user_id, license_plate)
);

CREATE INDEX IF NOT EXISTS idx_vehicles_owner ON vehicles(owner_user_id);
