-- Оптимизация: дополнительные индексы для частых запросов

-- Reviews: быстрый подсчёт по target
CREATE INDEX IF NOT EXISTS idx_reviews_target_visible ON reviews(target_id, is_visible, rating);

-- Registration: поиск по статусу для admin
CREATE INDEX IF NOT EXISTS idx_reg_status_updated ON drivers_registration(status, updated_at);

-- Registration: поиск по verification_level
CREATE INDEX IF NOT EXISTS idx_reg_level ON drivers_registration(verification_level);

-- Registration: поиск approved по ИИН (duplicate check)
CREATE INDEX IF NOT EXISTS idx_reg_iin_approved ON drivers_registration(iin, status);

-- Registration: поиск approved по plate (duplicate check)
CREATE INDEX IF NOT EXISTS idx_reg_plate_approved ON drivers_registration(vehicle_plate, status);

-- Push subscriptions: по user_id
CREATE INDEX IF NOT EXISTS idx_push_user_endpoint ON push_subscriptions(user_id, endpoint);

-- Favorites: быстрая проверка
CREATE INDEX IF NOT EXISTS idx_fav_check ON favorites(user_id, item_type, item_id);

-- Saved searches: match по маршруту
CREATE INDEX IF NOT EXISTS idx_ss_route_notify ON saved_searches(from_city, to_city, notify);

-- Blacklist: поиск по phone+plate
CREATE INDEX IF NOT EXISTS idx_bl_phone_plate ON blacklist(phone, plate_number, is_active);

-- Scores: быстрая сортировка для leaderboard
CREATE INDEX IF NOT EXISTS idx_scores_total ON driver_scores(total_score DESC);

-- Issue #290: Performance indexes для N+1-fix в /chat/rooms
-- Deals: поиск по chat_room_id (обогащение комнат)
CREATE INDEX IF NOT EXISTS idx_deals_chat_room ON deals(chat_room_id, created_at DESC);

-- Deals: legacy fallback поиск по участникам + cargo/trip
CREATE INDEX IF NOT EXISTS idx_deals_participants ON deals(shipper_id, driver_id, created_at DESC);

-- Chat messages: per-room unread count (sender_id != uid AND is_read = 0)
CREATE INDEX IF NOT EXISTS idx_chatmsg_room_unread ON chat_messages(room_id, is_read, sender_id);

-- Chat rooms: участник + last_at для сортировки
CREATE INDEX IF NOT EXISTS idx_chatrooms_p1 ON chat_rooms(participant_1, last_at DESC);
CREATE INDEX IF NOT EXISTS idx_chatrooms_p2 ON chat_rooms(participant_2, last_at DESC);

-- Cargos/Trips: фильтр по status + created_at для лент
CREATE INDEX IF NOT EXISTS idx_cargos_status_created ON cargos(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_trips_status_created ON trips(status, created_at DESC);

-- Bids: поиск по cargo_id/trip_id для enrichment
CREATE INDEX IF NOT EXISTS idx_bids_cargo ON bids(cargo_id, status);
CREATE INDEX IF NOT EXISTS idx_bids_trip ON bids(trip_id, status);

-- Deal locations: поиск по user_id для cleanup при удалении аккаунта
CREATE INDEX IF NOT EXISTS idx_deal_locations_user ON deal_locations(user_id);
