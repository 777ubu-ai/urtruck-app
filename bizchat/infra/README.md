# Infra — локальное окружение Biz Chat

## Быстрый старт

```bash
cd infra
docker compose -f docker-compose.local.yml up -d
```

Через 10–20 секунд будут подняты:

| Сервис | Хост:порт | Назначение |
|---|---|---|
| **postgres** | `localhost:5432` | Основная БД (uuid-ossp, pgcrypto, pg_trgm, btree_gin, citext) |
| **redis** | `localhost:6379` | Кеш, счётчики, очереди, переводы |
| **pgadmin** | `http://localhost:5050` | Веб-UI для PostgreSQL |

### Реквизиты БД (локалка)

- **User:** `bizchat`
- **Password:** `bizchat_local_dev`
- **Database:** `bizchat`
- **Host:** `localhost`
- **Port:** `5432`

⚠️ Эти реквизиты **только для локальной разработки**. На staging/prod — отдельные пароли через Docker Secrets / sops.

### Вход в pgadmin

- URL: http://localhost:5050
- Email: `admin@bizchat.local`
- Password: `admin`

В pgadmin после входа добавь сервер:
- Name: `bizchat local`
- Host: `postgres` (из сети docker) или `host.docker.internal`
- Port: `5432`
- Username / Password: как выше

## Команды

```bash
# Старт всего
docker compose -f docker-compose.local.yml up -d

# Статус
docker compose -f docker-compose.local.yml ps

# Логи (follow)
docker compose -f docker-compose.local.yml logs -f postgres
docker compose -f docker-compose.local.yml logs -f redis

# Остановка (данные сохраняются)
docker compose -f docker-compose.local.yml down

# ПОЛНЫЙ СБРОС (удаляет volumes и все данные БД — осторожно!)
docker compose -f docker-compose.local.yml down -v

# Подключиться к postgres из хоста
psql postgresql://bizchat:bizchat_local_dev@localhost:5432/bizchat

# Подключиться к postgres изнутри контейнера
docker exec -it bizchat-postgres psql -U bizchat -d bizchat

# Подключиться к redis
docker exec -it bizchat-redis redis-cli
```

## Структура

```
infra/
├── docker-compose.local.yml     ← основной файл для локалки
├── postgres/
│   └── init.sql                 ← инициализация БД (расширения, timezone)
├── caddy/                       ← конфиг reverse proxy (позже, для staging/prod)
├── scripts/                     ← deploy, backup, restore (позже)
└── README.md                    ← этот файл
```

## Что НЕ включено (пока)

- **Backend (NestJS)** — запускается напрямую из `backend/` через `npm run start:dev`, не в Docker. Так быстрее hot-reload и понятнее отладка.
- **Elasticsearch** — на первый спринт не нужен, поиск по хэштегам делаем через `pg_trgm` (индекс уже включён в init.sql). Добавим в Фазе 2.
- **MinIO (S3-mock)** — пока не нужен, медиа-загрузка в Фазе 1 не делается (только после регистрации/ленты).
- **FFmpeg** — будет в Фазе 2 для обработки видео.

## Траблшутинг

**`Error response from daemon: Conflict. The container name "/bizchat-postgres" is already in use`**  
→ `docker compose -f docker-compose.local.yml down` и запусти заново.

**`could not connect to server: Connection refused` из backend**  
→ Подожди 10 сек после `up -d` (healthcheck postgres). Проверь `docker compose ps` — должен быть статус `healthy`.

**`permission denied` на volume после `down -v`**  
→ `docker volume prune` и запусти заново (только на локалке!).
