-- Грузы, рейсы, ставки — серверное хранение для видимости между юзерами

CREATE TABLE IF NOT EXISTS cargos (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  owner_phone TEXT,
  owner_name TEXT,

  from_city TEXT NOT NULL,
  to_city TEXT NOT NULL,
  cargo_desc TEXT NOT NULL,           -- свободный текст (не dropdown)
  cargo_type TEXT DEFAULT 'tent',     -- тип кузова
  weight_tons REAL DEFAULT 0,
  volume_m3 REAL DEFAULT 0,
  price INTEGER DEFAULT 0,            -- $ USD
  pickup_date TEXT,
  photos TEXT,                        -- JSON array of URLs

  status TEXT DEFAULT 'active',       -- active | taken | completed | cancelled | unpublished | expired
  taken_by TEXT,                      -- driver_id кто взял
  bids_count INTEGER DEFAULT 0,

  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS trips (
  id TEXT PRIMARY KEY,
  driver_id TEXT NOT NULL,
  driver_phone TEXT,
  driver_name TEXT,

  from_city TEXT NOT NULL,
  to_city TEXT NOT NULL,
  transit TEXT,
  truck_type TEXT DEFAULT 'tent',
  capacity_tons REAL DEFAULT 20,
  available_m3 REAL DEFAULT 82,
  price INTEGER DEFAULT 0,
  departure TEXT,
  arrival TEXT,

  status TEXT DEFAULT 'active',       -- active | booked | in_transit | delivered | cancelled
  booked_by TEXT,

  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS bids (
  id TEXT PRIMARY KEY,
  cargo_id TEXT,                      -- на какой груз
  trip_id TEXT,                       -- или на какой рейс
  bidder_id TEXT NOT NULL,
  bidder_name TEXT,
  bidder_phone TEXT,
  amount INTEGER NOT NULL,            -- предложенная цена $
  message TEXT,
  status TEXT DEFAULT 'pending',      -- pending | accepted | rejected | cancelled | countered
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  counter_amount INTEGER,             -- counter-offer от owner-а
  counter_message TEXT,
  counter_by TEXT,                    -- 'owner' (на будущее: 'driver' для встречного)
  counter_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_cargos_status ON cargos(status, created_at);
CREATE INDEX IF NOT EXISTS idx_cargos_owner ON cargos(owner_id);
CREATE INDEX IF NOT EXISTS idx_cargos_route ON cargos(from_city, to_city);
CREATE INDEX IF NOT EXISTS idx_trips_status ON trips(status, created_at);
CREATE INDEX IF NOT EXISTS idx_trips_driver ON trips(driver_id);
CREATE INDEX IF NOT EXISTS idx_trips_route ON trips(from_city, to_city);
CREATE INDEX IF NOT EXISTS idx_bids_cargo ON bids(cargo_id, status);
CREATE INDEX IF NOT EXISTS idx_bids_trip ON bids(trip_id, status);
CREATE INDEX IF NOT EXISTS idx_bids_bidder ON bids(bidder_id);
