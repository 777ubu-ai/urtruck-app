# UrTruck: Процедура бэкапа и восстановления SQLite

> **Issue #296** — Документация для оператора

## 1. Текущая конфигурация

| Параметр | Значение |
|----------|----------|
| DB_PATH | `/home/ubuntu/urtruck-security/database/security.db` |
| Journal mode | WAL (Write-Ahead Logging) |
| busy_timeout | 5000 мс (5 секунд) |
| synchronous | NORMAL (для WAL — безопасный баланс скорости и надёжности) |
| Backup dir | `/home/ubuntu/urtruck-security/backups/` |
| Rotation | 48 снимков (1/час × 48 = 2 суток) |
| Формат файла | `security-YYYYMMDDTHHMMSSz.db` |
| Верификация | `PRAGMA quick_check` на каждом снимке |
| Контрольная сумма | `.sha256` рядом с каждым снимком |

## 2. Автоматический бэкап

APScheduler запускает `run_backup()` каждый час. Процесс:

```
1. sqlite3.backup() — online-safe копирование через SQLite C API
2. PRAGMA quick_check на КОПИИ (не на рабочей БД)
3. Если check FAIL → снимок удаляется, логируется ошибка
4. SHA-256 контрольная сумма сохраняется рядом (.sha256)
5. Ротация: удаляем снимки старше 48 (FIFO)
```

## 3. Ручной бэкап

```bash
cd /home/ubuntu/urtruck-security
python -c "from scheduler.backup_job import run_backup; print(run_backup())"
```

Или через sqlite3 CLI:
```bash
sqlite3 database/security.db ".backup backups/manual-$(date +%Y%m%dT%H%M%S).db"
```

## 4. Процедура восстановления

### ⚠️ ВАЖНО: никогда не восстанавливать поверх production без отдельного разрешения owner

### 4.1. Выбор снимка

```bash
ls -la /home/ubuntu/urtruck-security/backups/
# Проверить SHA-256:
sha256sum backups/security-20260825T120000Z.db
cat backups/security-20260825T120000Z.db.sha256
```

### 4.2. Проверка целостности снимка

```bash
sqlite3 backups/security-20260825T120000Z.db "PRAGMA integrity_check"
# Ожидаемый ответ: ok
```

### 4.3. Восстановление в изолированную среду (drill)

```bash
# Копируем снимок в отдельную директорию
cp backups/security-20260825T120000Z.db /tmp/restore-drill.db

# Проверяем данные
sqlite3 /tmp/restore-drill.db "SELECT COUNT(*) FROM drivers_registration"
sqlite3 /tmp/restore-drill.db "SELECT COUNT(*) FROM deals"
sqlite3 /tmp/restore-drill.db "SELECT COUNT(*) FROM chat_messages"

# Запускаем API на изолированной копии
DB_PATH=/tmp/restore-drill.db URTRUCK_ENV=drill uvicorn main:app --port 9001
# Проверяем: curl http://localhost:9001/health/ready
```

### 4.4. Восстановление в production (только с разрешения owner)

```bash
# 1. Остановить PM2 процесс
pm2 stop urtruck-security-api

# 2. Бэкап текущей БД (на всякий случай)
cp database/security.db database/security-pre-restore-$(date +%Y%m%dT%H%M%S).db

# 3. Восстановить из снимка
cp backups/security-20260825T120000Z.db database/security.db

# 4. Проверить
sqlite3 database/security.db "PRAGMA integrity_check"

# 5. Перезапустить
pm2 start urtruck-security-api
pm2 logs --lines 20

# 6. Проверить health
curl http://localhost:8001/health/ready
```

## 5. RPO / RTO

| Метрика | Цель | Текущее |
|---------|------|---------|
| RPO (Recovery Point Objective) | ≤ 1 час | 1 час (интервал бэкапа) |
| RTO (Recovery Time Objective) | ≤ 15 минут | ~5 минут (остановка + копирование + рестарт) |

## 6. Миграции

Миграции выполняются **идемпотентно** через `CREATE TABLE IF NOT EXISTS`,
`ALTER TABLE ... ADD COLUMN IF NOT EXISTS` и `CREATE INDEX IF NOT EXISTS`.
Каждый DAL-модуль инициализирует свою схему при старте (`init_*_schema()`).

**Rollback:** так как миграции только добавляют колонки/индексы и используют
`IF NOT EXISTS`, откат = восстановление из бэкапа. Деструктивные миграции
(удаление колонок, изменение типов) — только через отдельный скрипт
с подтверждением owner.

## 7. Известные риски

| Риск | Митигация |
|------|-----------|
| `database is locked` при N воркерах | WAL + busy_timeout=5s + fcntl lock на scheduler |
| Disk full | Мониторинг через `/metrics` (Prometheus) |
| Corrupted WAL | `PRAGMA quick_check` на каждом бэкапе, alert на FAIL |
| Orphan storage refs после restore | Подписанные URL истекают; новые загрузки создают новые ключи |
