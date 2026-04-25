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
