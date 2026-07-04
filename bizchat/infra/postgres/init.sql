-- Инициализация PostgreSQL для Biz Chat (локалка)
-- Выполняется один раз при первом создании контейнера (пустой volume).
-- Для прода используется отдельный скрипт, это только для dev-окружения.

-- Включаем расширения, которые понадобятся бэкенду
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";       -- uuid_generate_v4()
CREATE EXTENSION IF NOT EXISTS "pgcrypto";        -- gen_random_uuid(), crypt()
CREATE EXTENSION IF NOT EXISTS "pg_trgm";         -- поиск по триграммам (для fallback'а без Elasticsearch)
CREATE EXTENSION IF NOT EXISTS "btree_gin";       -- индексы для массивов (hashtags[])
CREATE EXTENSION IF NOT EXISTS "citext";          -- регистронезависимые строки (email, username)

-- Тайм-зона UTC для всех дат
SET TIME ZONE 'UTC';

-- Дефолтные настройки для новой БД
ALTER DATABASE bizchat SET timezone TO 'UTC';
ALTER DATABASE bizchat SET statement_timeout = '30s';
ALTER DATABASE bizchat SET idle_in_transaction_session_timeout = '60s';

-- Проверка, что всё встало
DO $$
BEGIN
    RAISE NOTICE 'Biz Chat PostgreSQL инициализирован. Расширения: uuid-ossp, pgcrypto, pg_trgm, btree_gin, citext. Timezone: UTC.';
END $$;
