-- ============================================================
-- YiwuExpress: FTL Market — Полная схема базы данных (Supabase)
-- Версия: 1.0
-- Все таблицы с учётом правок из обсуждения
-- ============================================================

-- ============================================================
-- 1. ПОЛЬЗОВАТЕЛИ (общая таблица)
-- ============================================================
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone VARCHAR(20) UNIQUE NOT NULL,
  role VARCHAR(10) NOT NULL CHECK (role IN ('driver', 'client')),
  display_name VARCHAR(100) NOT NULL,
  country VARCHAR(5),                     -- KZ, UZ, RU, KG, CN
  city VARCHAR(100),                      -- Город базирования
  photo_url TEXT,                         -- Селфи / фото профиля
  balance_tokens INTEGER DEFAULT 0,       -- Баланс в долларах (для покупки контактов)
  is_verified BOOLEAN DEFAULT FALSE,      -- Ручная проверка документов
  rating FLOAT DEFAULT 5.0,
  reviews_count INTEGER DEFAULT 0,
  last_active TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW()
);

-- ============================================================
-- 2. ВОДИТЕЛИ (профиль фуры)
-- ============================================================
CREATE TABLE drivers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Транспорт
  truck_type VARCHAR(20) NOT NULL CHECK (truck_type IN (
    'tent', 'ref', 'platform', 'auto', 'izoterm'
  )),
  volume_m3 INTEGER NOT NULL,             -- Объём прицепа (кубы)
  capacity_tons INTEGER NOT NULL,         -- Грузоподъёмность (тонны)
  plate_truck VARCHAR(20) NOT NULL,       -- Гос. номер тягача
  plate_trailer VARCHAR(20),             -- Гос. номер прицепа (может меняться)

  -- Документы
  tech_passport_url TEXT,                 -- Фото техпаспорта
  
  -- Разрешения (массив)
  permits TEXT[] DEFAULT '{}',            -- ['tir', 'adr', 'thermo']
  
  -- Языки
  languages TEXT[] DEFAULT '{ru}',        -- ['ru', 'uz', 'cn', 'kz']

  -- Монетизация
  free_posts_left INTEGER DEFAULT 3,      -- Бесплатных публикаций
  has_unlimited BOOLEAN DEFAULT FALSE,    -- Безлимит ($15-20/мес)
  unlimited_until DATE,                   -- До какой даты безлимит

  created_at TIMESTAMP DEFAULT NOW()
);

-- ============================================================
-- 3. КЛИЕНТЫ (грузовладельцы)
-- ============================================================
CREATE TABLE customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  company_type VARCHAR(20) CHECK (company_type IN (
    'importer', 'forwarder', 'shop'
  )),

  created_at TIMESTAMP DEFAULT NOW()
);

-- ============================================================
-- 4. РЕЙСЫ ВОДИТЕЛЕЙ ("Я еду в Китай")
-- ============================================================
CREATE TABLE driver_trips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id UUID NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,

  route_destination VARCHAR(100) NOT NULL,  -- Куда загружается (Иу, Гуанчжоу)
  arrival_date DATE NOT NULL,               -- Дата прибытия на склад
  available_volume_m3 INTEGER,              -- Свободный объём
  available_tons INTEGER,                   -- Свободный тоннаж

  status VARCHAR(20) DEFAULT 'active' CHECK (status IN (
    'active', 'departed', 'loading', 'border_crossed', 'unloading', 'completed', 'cancelled'
  )),

  created_at TIMESTAMP DEFAULT NOW()
);

-- ============================================================
-- 5. ГРУЗЫ (лоты от клиентов)
-- ============================================================
CREATE TABLE cargo_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,

  -- Маршрут
  origin_city VARCHAR(100) NOT NULL,        -- Город в Китае
  destination_city VARCHAR(100) NOT NULL,   -- Город назначения

  -- Груз
  cargo_description VARCHAR(255) NOT NULL,  -- Что везём
  weight_tons FLOAT NOT NULL,
  volume_m3 FLOAT NOT NULL,
  required_truck_type VARCHAR(20) NOT NULL CHECK (required_truck_type IN (
    'tent', 'ref', 'platform', 'auto', 'izoterm'
  )),

  -- Даты и цена
  pickup_date DATE NOT NULL,                -- Когда забирать
  offered_price INTEGER NOT NULL,           -- Ставка клиента
  currency VARCHAR(5) DEFAULT 'USD',        -- USD, CNY, KZT, UZS, RUB

  -- Фото
  photos TEXT[] DEFAULT '{}',               -- Массив URL фото груза

  -- Статус
  status VARCHAR(20) DEFAULT 'active' CHECK (status IN (
    'active', 'in_progress', 'completed', 'cancelled'
  )),

  -- Аналитика
  contact_views INTEGER DEFAULT 0,          -- Сколько раз открывали контакт
  
  created_at TIMESTAMP DEFAULT NOW()
);

-- ============================================================
-- 6. СТАВКИ / ТОРГ (InDrive-стиль)
-- ============================================================
CREATE TABLE bids (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cargo_id UUID NOT NULL REFERENCES cargo_posts(id) ON DELETE CASCADE,
  driver_id UUID NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,

  amount INTEGER NOT NULL,                  -- Предложенная цена
  currency VARCHAR(5) DEFAULT 'USD',

  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN (
    'pending', 'accepted', 'rejected', 'cancelled'
  )),

  created_at TIMESTAMP DEFAULT NOW(),
  
  -- Один водитель = одна ставка на один груз
  UNIQUE(cargo_id, driver_id)
);

-- ============================================================
-- 7. ОПЛАТА КОНТАКТОВ ($2 за контакт)
-- ============================================================
CREATE TABLE contact_purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_id UUID NOT NULL REFERENCES users(id),    -- Кто купил
  seller_id UUID NOT NULL REFERENCES users(id),   -- Чей контакт
  amount INTEGER DEFAULT 2,                        -- Цена ($2)

  created_at TIMESTAMP DEFAULT NOW(),
  
  -- Нельзя купить один контакт дважды в рамках одной сделки
  UNIQUE(buyer_id, seller_id)
);

-- ============================================================
-- 8. ЧАТЫ
-- ============================================================
CREATE TABLE chats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  participant_1 UUID NOT NULL REFERENCES users(id),
  participant_2 UUID NOT NULL REFERENCES users(id),
  cargo_id UUID REFERENCES cargo_posts(id),        -- К какому грузу привязан чат
  
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id UUID NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES users(id),

  message_text TEXT NOT NULL,
  translated_text TEXT,                    -- Авто-перевод (RU/UZ/CN/KZ)
  translated_lang VARCHAR(5),             -- На какой язык перевели

  -- Вложения
  attachment_url TEXT,                     -- Фото документов, груза, склада
  attachment_type VARCHAR(20),            -- 'image', 'document'

  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW()
);

-- ============================================================
-- 9. ОТЗЫВЫ И РЕЙТИНГИ
-- ============================================================
CREATE TABLE reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_user_id UUID NOT NULL REFERENCES users(id),
  to_user_id UUID NOT NULL REFERENCES users(id),
  cargo_id UUID REFERENCES cargo_posts(id),

  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment TEXT,

  created_at TIMESTAMP DEFAULT NOW(),
  
  -- Один отзыв за рейс
  UNIQUE(from_user_id, to_user_id, cargo_id)
);

-- ============================================================
-- 10. ИСТОРИЯ ТРАНЗАКЦИЙ (Кошелёк)
-- ============================================================
CREATE TABLE transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  
  type VARCHAR(20) NOT NULL CHECK (type IN (
    'topup',            -- Пополнение баланса
    'contact_purchase', -- Покупка контакта ($2)
    'post_payment',     -- Оплата публикации (водитель)
    'unlimited_plan'    -- Безлимит ($15-20/мес)
  )),
  
  amount INTEGER NOT NULL,                 -- Сумма (положительная = приход, отрицательная = расход)
  currency VARCHAR(5) DEFAULT 'USD',
  description TEXT,

  created_at TIMESTAMP DEFAULT NOW()
);

-- ============================================================
-- ИНДЕКСЫ (для скорости)
-- ============================================================
CREATE INDEX idx_cargo_status ON cargo_posts(status);
CREATE INDEX idx_cargo_truck_type ON cargo_posts(required_truck_type);
CREATE INDEX idx_cargo_pickup_date ON cargo_posts(pickup_date);
CREATE INDEX idx_cargo_destination ON cargo_posts(destination_city);
CREATE INDEX idx_drivers_truck_type ON drivers(truck_type);
CREATE INDEX idx_bids_cargo ON bids(cargo_id);
CREATE INDEX idx_bids_driver ON bids(driver_id);
CREATE INDEX idx_chat_messages_chat ON chat_messages(chat_id);
CREATE INDEX idx_users_phone ON users(phone);
CREATE INDEX idx_users_last_active ON users(last_active);
CREATE INDEX idx_driver_trips_status ON driver_trips(status);
CREATE INDEX idx_driver_trips_date ON driver_trips(arrival_date);
CREATE INDEX idx_transactions_user ON transactions(user_id);

-- ============================================================
-- RLS (Row Level Security) — базовые политики
-- ============================================================
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE drivers ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE cargo_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE bids ENABLE ROW LEVEL SECURITY;
ALTER TABLE chats ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

-- Пользователь видит только свой профиль (для редактирования)
CREATE POLICY "Users can view own profile" ON users
  FOR SELECT USING (auth.uid() = id);

-- Все видят активные грузы
CREATE POLICY "Anyone can view active cargo" ON cargo_posts
  FOR SELECT USING (status = 'active');

-- Клиент создаёт свои грузы
CREATE POLICY "Customers can create cargo" ON cargo_posts
  FOR INSERT WITH CHECK (
    customer_id IN (SELECT id FROM customers WHERE user_id = auth.uid())
  );

-- Водители создают ставки
CREATE POLICY "Drivers can create bids" ON bids
  FOR INSERT WITH CHECK (
    driver_id IN (SELECT id FROM drivers WHERE user_id = auth.uid())
  );

-- Участники видят свои чаты
CREATE POLICY "Chat participants can view messages" ON chat_messages
  FOR SELECT USING (
    chat_id IN (
      SELECT id FROM chats 
      WHERE participant_1 = auth.uid() OR participant_2 = auth.uid()
    )
  );
