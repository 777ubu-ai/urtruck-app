# 🛡️ UrTruck — АРХИТЕКТУРА БЕЗОПАСНОСТИ И СКОРИНГА
# Полная инструкция для разработки

---

## ОБЗОР СИСТЕМЫ

UrTruck Security — отдельный сервер, который проверяет каждого водителя
и грузовладельца по 6 этапам и выдаёт скоринг от 0 до 100.

Результат: цветовой код 🟢🟡🔴 и числовой балл надёжности.

---

## ИНФРАСТРУКТУРА

### Сервер 1: Приложение UrTruck
- IP: 185.22.65.11
- Что стоит: React Native Web, Supabase клиент
- Задача: интерфейс пользователя

### Сервер 2: Система безопасности (НОВЫЙ)
- Рекомендация: Ubuntu 22.04, 2 CPU, 4GB RAM, 80GB SSD
- Провайдер: Hetzner ($10/мес) или DigitalOcean ($12/мес)
- Задача: парсинг, OCR, скоринг, мониторинг

### Связь между серверами
- Сервер 2 имеет доступ к Supabase (тот же URL и ключ)
- API эндпоинт: http://СЕРВЕР2:8000/api/v1/
- Сервер 1 вызывает Сервер 2 для проверки водителя
- Webhook: Сервер 2 отправляет уведомления на Сервер 1

---

## УСТАНОВКА СЕРВЕРА 2

### Шаг 1: Подключение
```bash
ssh ubuntu@IP_СЕРВЕРА_2
```

### Шаг 2: Обновление системы
```bash
sudo apt update && sudo apt upgrade -y
```

### Шаг 3: Установка Python
```bash
sudo apt install python3.11 python3.11-venv python3-pip -y
```

### Шаг 4: Установка PostgreSQL
```bash
sudo apt install postgresql postgresql-contrib -y
sudo -u postgres createuser urtruck_security
sudo -u postgres createdb urtruck_security_db
sudo -u postgres psql -c "ALTER USER urtruck_security WITH PASSWORD 'СИЛЬНЫЙ_ПАРОЛЬ';"
```

### Шаг 5: Установка Redis
```bash
sudo apt install redis-server -y
sudo systemctl enable redis-server
```

### Шаг 6: Установка Tesseract OCR
```bash
sudo apt install tesseract-ocr tesseract-ocr-rus tesseract-ocr-uzb tesseract-ocr-kaz tesseract-ocr-chi-sim -y
```

### Шаг 7: Установка дополнительных инструментов
```bash
sudo apt install nginx certbot python3-certbot-nginx git -y
```

### Шаг 8: Создание проекта
```bash
mkdir /home/ubuntu/urtruck-security
cd /home/ubuntu/urtruck-security
python3.11 -m venv venv
source venv/bin/activate
```

### Шаг 9: Установка Python библиотек
```bash
pip install fastapi uvicorn
pip install telethon          # Telegram парсинг
pip install pytesseract       # OCR
pip install Pillow            # Обработка изображений
pip install httpx             # HTTP запросы к API
pip install beautifulsoup4    # Парсинг сайтов
pip install selenium          # Парсинг динамических сайтов
pip install supabase          # Подключение к Supabase
pip install redis             # Кэш
pip install asyncpg           # PostgreSQL async
pip install sqlalchemy        # ORM
pip install celery            # Фоновые задачи
pip install apscheduler       # Планировщик (ежемесячная переоценка)
pip install python-multipart  # Загрузка файлов
pip install face-recognition  # Биометрия (Phase 3)
pip install numpy opencv-python # Обработка фото
```

### Шаг 10: Установка PM2 для управления процессами
```bash
sudo npm install -g pm2
```

---

## СТРУКТУРА ПРОЕКТА

```
urtruck-security/
├── main.py                    # FastAPI точка входа
├── config.py                  # Настройки (ключи, URL)
├── requirements.txt           # Зависимости
│
├── api/
│   ├── routes.py              # API эндпоинты
│   ├── models.py              # Pydantic модели
│   └── middleware.py          # Авторизация API
│
├── scoring/
│   ├── engine.py              # Главный движок скоринга (0-100)
│   ├── weights.py             # Веса для формулы скоринга
│   └── color_code.py          # Логика 🟢🟡🔴
│
├── parsers/
│   ├── telegram_parser.py     # Парсинг Telegram чатов
│   ├── della_parser.py        # Парсинг Della.kz
│   ├── ati_parser.py          # Парсинг ATI.su
│   ├── lardi_parser.py        # Парсинг Lardi-Trans
│   ├── olx_parser.py          # Парсинг OLX.kz
│   └── whatsapp_monitor.py    # Мониторинг WhatsApp (Phase 3)
│
├── ocr/
│   ├── document_reader.py     # OCR техпаспорта
│   ├── screenshot_reader.py   # OCR скриншотов из чатов
│   └── templates/             # Шаблоны документов по странам
│
├── verification/
│   ├── kz_checker.py          # Проверка по базам Казахстана
│   ├── uz_checker.py          # Проверка по базам Узбекистана
│   ├── ru_checker.py          # Проверка по базам России
│   ├── kg_checker.py          # Проверка по базам Кыргызстана
│   ├── tj_checker.py          # Проверка по базам Таджикистана
│   ├── vehicle_checker.py     # Проверка транспорта
│   └── cross_check.py         # Трансграничный кросс-чекинг
│
├── biometrics/                # Phase 3
│   ├── liveness.py            # Liveness Check (поверните голову)
│   ├── face_match.py          # Сверка лица с документом
│   └── in_route_check.py      # Периодическая проверка в рейсе
│
├── alerts/
│   ├── telegram_alert.py      # Тревожная кнопка
│   ├── push_sender.py         # Push уведомления
│   └── email_sender.py        # Email уведомления
│
├── blacklist/
│   ├── manager.py             # Управление чёрным списком
│   ├── auto_detect.py         # Автодетекция мошенников
│   └── keywords.py            # Ключевые слова для поиска
│
├── scheduler/
│   ├── monthly_recheck.py     # Ежемесячная переоценка
│   ├── daily_parse.py         # Ежедневный парсинг чатов
│   └── realtime_monitor.py    # Real-time мониторинг
│
└── database/
    ├── models.py              # SQLAlchemy модели
    ├── security_schema.sql    # Схема БД безопасности
    └── migrations/            # Миграции
```

---

## БАЗА ДАННЫХ БЕЗОПАСНОСТИ

```sql
-- Скоринг водителей
CREATE TABLE driver_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  driver_id UUID NOT NULL,
  
  -- Общий скоринг
  total_score INTEGER DEFAULT 50 CHECK (total_score >= 0 AND total_score <= 100),
  color_code VARCHAR(10) DEFAULT 'yellow' CHECK (color_code IN ('green', 'yellow', 'red')),
  
  -- Компоненты скоринга
  identity_score INTEGER DEFAULT 0,      -- Личность (документы)
  vehicle_score INTEGER DEFAULT 0,       -- Транспорт (возраст, ТО)
  experience_score INTEGER DEFAULT 0,    -- Стаж и опыт
  reputation_score INTEGER DEFAULT 0,    -- Отзывы Della/ATI
  social_score INTEGER DEFAULT 0,        -- Чёрные списки
  financial_score INTEGER DEFAULT 0,     -- Долги, аресты
  
  -- Метаданные
  last_checked TIMESTAMP DEFAULT NOW(),
  next_check TIMESTAMP DEFAULT NOW() + INTERVAL '30 days',
  check_count INTEGER DEFAULT 0,
  
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Чёрный список
CREATE TABLE blacklist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone VARCHAR(20),
  plate_number VARCHAR(20),
  full_name VARCHAR(100),
  reason TEXT NOT NULL,
  source VARCHAR(50),           -- 'telegram', 'della', 'ati', 'manual'
  source_link TEXT,              -- Ссылка на источник
  severity VARCHAR(10) DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Лог проверок
CREATE TABLE verification_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  check_type VARCHAR(50) NOT NULL,       -- 'identity', 'vehicle', 'reputation', etc.
  check_source VARCHAR(50) NOT NULL,     -- 'esgd', 'della', 'telegram', etc.
  result VARCHAR(20) NOT NULL,           -- 'pass', 'fail', 'warning', 'error'
  details JSONB,                          -- Подробности проверки
  score_impact INTEGER DEFAULT 0,         -- Влияние на скоринг
  created_at TIMESTAMP DEFAULT NOW()
);

-- Парсинг Telegram
CREATE TABLE telegram_mentions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_name VARCHAR(200),
  chat_id BIGINT,
  message_id BIGINT,
  message_text TEXT,
  mentioned_phone VARCHAR(20),
  mentioned_plate VARCHAR(20),
  mentioned_name VARCHAR(100),
  keywords_found TEXT[],                  -- ['кидала', 'мошенник']
  sentiment VARCHAR(20),                  -- 'negative', 'neutral', 'positive'
  screenshot_url TEXT,                    -- Если OCR скриншота
  created_at TIMESTAMP DEFAULT NOW()
);

-- OCR результаты
CREATE TABLE ocr_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  document_type VARCHAR(50),              -- 'tech_passport', 'license', 'selfie'
  image_url TEXT NOT NULL,
  extracted_data JSONB,                   -- Извлечённые данные
  confidence FLOAT,                       -- Уверенность OCR (0-1)
  is_verified BOOLEAN DEFAULT FALSE,
  verified_by VARCHAR(50),                -- 'auto' или UUID модератора
  created_at TIMESTAMP DEFAULT NOW()
);

-- Биометрия (Phase 3)
CREATE TABLE biometric_checks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  check_type VARCHAR(20),                 -- 'registration', 'in_route', 'weekly'
  selfie_url TEXT,
  liveness_passed BOOLEAN,
  face_match_score FLOAT,                 -- Совпадение с фото документа (0-1)
  created_at TIMESTAMP DEFAULT NOW()
);

-- Тревожные алерты
CREATE TABLE security_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_type VARCHAR(50),                 -- 'blacklist_match', 'score_drop', 'fake_document'
  severity VARCHAR(10),
  driver_id UUID,
  cargo_id UUID,                          -- Если везёт активный груз
  message TEXT,
  is_resolved BOOLEAN DEFAULT FALSE,
  resolved_by VARCHAR(50),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Индексы
CREATE INDEX idx_scores_user ON driver_scores(user_id);
CREATE INDEX idx_scores_color ON driver_scores(color_code);
CREATE INDEX idx_blacklist_phone ON blacklist(phone);
CREATE INDEX idx_blacklist_plate ON blacklist(plate_number);
CREATE INDEX idx_telegram_phone ON telegram_mentions(mentioned_phone);
CREATE INDEX idx_telegram_plate ON telegram_mentions(mentioned_plate);
CREATE INDEX idx_alerts_active ON security_alerts(is_resolved);
```

---

## ФОРМУЛА СКОРИНГА (0-100)

```
TOTAL_SCORE = 
  identity_score * 0.20      (Личность: документы, МВД)
  + reputation_score * 0.25  (Отзывы: UrTruck + Della/ATI)
  + social_score * 0.15      (Чёрные списки: Telegram/WhatsApp)
  + experience_score * 0.15  (Стаж: лет за рулём, кол-во рейсов)
  + vehicle_score * 0.10     (Транспорт: возраст, ТО, страховка)
  + financial_score * 0.10   (Финансы: нет долгов, нет арестов)
  + bonus * 0.05             (Бонус: завершённые рейсы в UrTruck)
```

### Цветовой код:
- 🟢 Зелёный: score >= 70 (Надёжный, можно доверять)
- 🟡 Жёлтый: score 40-69 (Новичок или мало данных)
- 🔴 Красный: score < 40 (Есть проблемы, не рекомендуется)
- ⛔ Чёрный: score = 0 (Заблокирован, в чёрном списке)

### Автоматические правила:
- Найден в чёрном списке Telegram → score = 0, БАН
- Претензия на Della/ATI → score -= 30
- Нет страховки → score -= 15
- Машина старше 15 лет → score -= 10
- Стаж < 2 лет → score -= 10
- Каждый успешный рейс в UrTruck → score += 2
- Каждый положительный отзыв → score += 1
- Каждый отрицательный отзыв → score -= 5

---

## КЛЮЧЕВЫЕ СЛОВА ДЛЯ ПАРСИНГА

### Негативные (ищем в Telegram/WhatsApp):
```python
NEGATIVE_KEYWORDS = [
    'кидала', 'кидалово', 'мошенник', 'мошенничество',
    'не грузить', 'не давать', 'не работать',
    'украл', 'украли', 'обман', 'обманул',
    'пропал', 'исчез', 'не отвечает', 'заблокировал',
    'сломал', 'повредил', 'испортил',
    'левый', 'фейк', 'подстава',
    'черный список', 'чс', 'блок',
    'долг', 'должен', 'не заплатил',
    'кинул', 'развод', 'лохотрон',
    # Узбекский
    'алдамчи', 'фирибгар',
    # Казахский  
    'алаяқ', 'сулу',
]

POSITIVE_KEYWORDS = [
    'рекомендую', 'отличный', 'надежный', 'проверенный',
    'довез', 'все четко', 'без проблем', 'молодец',
    'лучший', 'топ', 'огонь', 'красавчик',
]
```

---

## TELEGRAM ГРУППЫ ДЛЯ МОНИТОРИНГА

```python
TELEGRAM_GROUPS = [
    # Казахстан
    'gruzoperevozki_kz',
    'dalnoboi_kz',
    'fury_almaty',
    'kargo_kitai_kz',
    'logistics_kazakhstan',
    
    # Узбекистан
    'gruzoperevozki_uz',
    'tashkent_cargo',
    'uzbek_logistics',
    
    # Россия
    'dalnoboi_ru',
    'gruzoperevozki_russia',
    'cargo_china_russia',
    
    # Кыргызстан
    'cargo_bishkek',
    'logistics_kg',
    
    # Международные
    'china_cargo_sng',
    'yiwu_logistics',
    'guangzhou_cargo',
    'khorgos_border',
]
```

---

## API ЭНДПОИНТЫ

```
POST /api/v1/check/full          — Полная проверка водителя (все 6 этапов)
POST /api/v1/check/quick         — Быстрая проверка (только чёрный список)
GET  /api/v1/score/{user_id}     — Получить скоринг водителя
POST /api/v1/ocr/passport        — Распознать техпаспорт
POST /api/v1/ocr/selfie          — Проверить селфи
POST /api/v1/blacklist/check     — Проверить по чёрному списку
POST /api/v1/blacklist/add       — Добавить в чёрный список
GET  /api/v1/alerts/active       — Активные алерты
POST /api/v1/biometric/liveness  — Liveness Check (Phase 3)
GET  /api/v1/report/{user_id}    — Полный отчёт по водителю
```

---

## ИНТЕГРАЦИЯ С ПРИЛОЖЕНИЕМ

### Как это работает для пользователя:

1. Водитель нажимает «Зарегистрироваться»
2. Загружает фото техпаспорта → OCR извлекает данные
3. Загружает селфи → проверка лица
4. Сервер безопасности запускает проверку (10-30 секунд)
5. Результат: «Надёжность: 72/100 🟢»
6. Водитель видит свой рейтинг в профиле
7. Клиент видит рейтинг водителя в карточке

### Webhook в приложение:
```json
{
  "event": "score_updated",
  "user_id": "uuid",
  "total_score": 72,
  "color_code": "green",
  "details": {
    "identity": 18,
    "reputation": 20,
    "social": 12,
    "experience": 10,
    "vehicle": 8,
    "financial": 4
  },
  "warnings": [],
  "blocked": false
}
```

### Тревожный Webhook:
```json
{
  "event": "security_alert",
  "severity": "critical",
  "driver_id": "uuid",
  "active_cargo_id": "uuid",
  "message": "Водитель найден в чёрном списке Telegram",
  "source": "telegram_chat: dalnoboi_kz",
  "action_required": true
}
```

---

## ЗАПУСК СЕРВЕРА

### Файл main.py:
```python
from fastapi import FastAPI
from api.routes import router

app = FastAPI(title="UrTruck Security", version="1.0")
app.include_router(router, prefix="/api/v1")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
```

### Запуск через PM2:
```bash
cd /home/ubuntu/urtruck-security
source venv/bin/activate
pm2 start "uvicorn main:app --host 0.0.0.0 --port 8000" --name security-api
pm2 start "celery -A scheduler worker" --name security-worker
pm2 start "python parsers/telegram_parser.py" --name telegram-parser
pm2 save
pm2 startup
```

### Nginx конфигурация:
```nginx
server {
    listen 80;
    server_name security.urtruck.com;

    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

### SSL сертификат:
```bash
sudo certbot --nginx -d security.urtruck.com
```

---

## CRON ЗАДАЧИ

```bash
# Ежедневный парсинг Telegram (каждые 6 часов)
0 */6 * * * cd /home/ubuntu/urtruck-security && venv/bin/python parsers/telegram_parser.py

# Ежедневный парсинг Della/ATI (раз в день, ночью)
0 3 * * * cd /home/ubuntu/urtruck-security && venv/bin/python parsers/della_parser.py

# Ежемесячная переоценка всех водителей (1 числа каждого месяца)
0 2 1 * * cd /home/ubuntu/urtruck-security && venv/bin/python scheduler/monthly_recheck.py

# Очистка старых логов (раз в неделю)
0 4 * * 0 cd /home/ubuntu/urtruck-security && venv/bin/python scheduler/cleanup.py
```

---

## ЮРИДИЧЕСКИЕ ШАГИ (ПАРАЛЛЕЛЬНО)

### Казахстан:
- [ ] Заявка на API eGov.kz — через egov.kz/services
- [ ] Заявка на API ЕСБД (id.mkb.kz) — через страхового партнёра
- [ ] Заявка в adilet.gov.kz — проверка должников
- [ ] Договор со страховой компанией (Евразия, Номад)
- [ ] Договор с Первым Кредитным Бюро

### Узбекистан:
- [ ] Заявка на API my.gov.uz
- [ ] Заявка на API e-osgo.uz
- [ ] Заявка на API soliq.uz
- [ ] Договор с Узинфоком (кредитное бюро)

### Россия:
- [ ] Договор с DaData.ru — агрегатор данных (быстрый старт)
- [ ] Заявка в ГИБДД на API проверки
- [ ] Договор с РСА (НСИС) — проверка водителей

### Кыргызстан:
- [ ] Заявка на API Tunduk
- [ ] Договор со страховой компанией

### Таджикистан:
- [ ] Заявка на API гос. порталов

### Della/ATI:
- [ ] Заявка на официальный API della.kz
- [ ] Заявка на официальный API ati.su

### Таможенные брокеры:
- [ ] Партнёрство с брокером на Хоргосе
- [ ] Партнёрство с брокером на Достыке
- [ ] Партнёрство с брокером на Бахты

---

## ФАЗЫ РЕАЛИЗАЦИИ

### Phase 1: MVP (Сейчас — 2 недели)
- [ ] Купить второй сервер
- [ ] Установить всё по инструкции выше
- [ ] Telegram парсер — мониторинг 20 групп
- [ ] OCR техпаспорта — автозаполнение данных
- [ ] Чёрный список — поиск по номеру и госномеру
- [ ] Базовый скоринг — на основе документов и чёрного списка
- [ ] API endpoint /check/quick — быстрая проверка
- [ ] Интеграция с приложением — показ 🟢🟡🔴

### Phase 2: Автоматизация (2-3 месяца)
- [ ] Полный скоринг 0-100
- [ ] Парсер Della.kz — отзывы и претензии
- [ ] Парсер ATI.su — отзывы и претензии
- [ ] Подключение гос. баз через страхового партнёра
- [ ] Проверка транспорта (возраст, ТО, залог)
- [ ] Трансграничный кросс-чекинг
- [ ] Ежемесячная автоматическая переоценка
- [ ] Админ-панель модератора

### Phase 3: Высокие технологии (4-6 месяцев)
- [ ] Биометрия Liveness Check при регистрации
- [ ] Периодическое селфи в рейсе
- [ ] Сверка лица с документом
- [ ] Тревожная кнопка (real-time Telegram)
- [ ] OCR скриншотов из чатов
- [ ] Рейтинг маршрута (задержки, риски)
- [ ] Интеграция с таможенными брокерами

### Phase 4: FinTech (6-12 месяцев)
- [ ] Страхование грузов в приложении
- [ ] Гарантийный фонд ($500-1000)
- [ ] Эскроу-платежи
- [ ] Блокчейн-реестр сделок
- [ ] AI-модель предсказания рисков

---

## МЕТРИКИ УСПЕХА

| Метрика | Phase 1 | Phase 2 | Phase 3 |
|---------|---------|---------|---------|
| Водителей проверено | 100 | 1000 | 5000 |
| Мошенников заблокировано | 5 | 50 | 200 |
| Telegram групп мониторится | 20 | 50 | 100 |
| Точность OCR | 80% | 90% | 95% |
| Скоринг покрытие | 30% | 70% | 95% |
| Время проверки | 5 мин | 30 сек | 10 сек |

---

## СТОИМОСТЬ

| Статья | Ежемесячно |
|--------|-----------|
| Сервер 2 (Hetzner) | $10-20 |
| DaData API (если РФ) | $20-50 |
| Telegram Premium (для парсинга) | $5 |
| SMS для верификации | $10-20 |
| Домен security.urtruck.com | $1 |
| ИТОГО | $46-96/мес |

---

*Документ создан: Апрель 2026*
*Версия: 1.0*
*Статус: Готов к реализации Phase 1*
