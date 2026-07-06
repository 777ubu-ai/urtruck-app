# 🔐 UrTruck — Доступ к серверу

**Сервер:** `185.22.65.11` (Ubuntu, PM2 + Nginx + FastAPI)
**Пользователь:** `ubuntu`
**Дата настройки:** 19 апреля 2026

---

## 1. Как подключиться

```bash
ssh -i ~/.ssh/urtruck ubuntu@185.22.65.11
```

Пароль НЕ нужен. Вход только по ключу.

---

## 2. Где лежат ключи

| Файл | Компьютер | Описание |
|---|---|---|
| `~/.ssh/urtruck` | Твой Mac | Приватный ключ. **НИКОМУ НЕ ДАВАТЬ.** |
| `~/.ssh/urtruck.pub` | Твой Mac | Публичный ключ. Можно давать разработчикам. |
| `/home/ubuntu/.ssh/authorized_keys` | Сервер | Список разрешённых ключей. |

---

## 3. Как деплоить

### Фронтенд (PWA)
```bash
cd /Users/bahitzanbahitzanovic/Downloads/urtruck-app
./deploy.sh
```
Результат: `http://185.22.65.11:8080`

### Бэкенд (FastAPI)
```bash
scp -i ~/.ssh/urtruck -r backend/* ubuntu@185.22.65.11:/home/ubuntu/urtruck-security/
ssh -i ~/.ssh/urtruck ubuntu@185.22.65.11 "source ~/.nvm/nvm.sh && pm2 restart urtruck-security-api"
```

### Чтобы SSH подхватывался автоматически (без `-i`), добавь в `~/.ssh/config`:
```
Host 185.22.65.11
    User ubuntu
    IdentityFile ~/.ssh/urtruck
```
После этого: `ssh 185.22.65.11` — и всё.

---

## 4. Что где на сервере

> ⚠️ **ВАЖНО (проверено 2026-07-06):** живой бэкенд-процесс PM2 `urtruck-security-api`
> запускается из **`/home/ubuntu/urtruck/backend/`** — именно туда льёт CI (`main.py`
> обновлялся оттуда), оттуда же читается **`.env`** (реальные секреты: Mobizon, admin,
> VAPID, OpenAI, SMTP). Каталог `/home/ubuntu/urtruck-security/` ниже — **устаревший**
> (в нём нет `main.py`); правки в его `.env` на прод НЕ влияют. Для секретов/.env и
> любых ручных правок бэкенда используйте `/home/ubuntu/urtruck/backend/`.

| Путь | Что |
|---|---|
| `/home/ubuntu/urtruck-app/` | Фронтенд (HTML/JS/CSS) |
| `/home/ubuntu/urtruck/backend/` | **Живой бэкенд** (FastAPI) — код, `.env`, CI-цель |
| `/home/ubuntu/urtruck/backend/.env` | **Прод-секреты** (Mobizon, admin, VAPID, OpenAI, SMTP) |
| `/home/ubuntu/urtruck-security/` | ⚠️ устаревший каталог (не рабочий процесс) |
| `/home/ubuntu/urtruck-security/.env` | Секреты (токены, ключи) |
| `/home/ubuntu/urtruck-security/database/security.db` | База данных |
| `/home/ubuntu/urtruck-security/certs/egov.p12` | ЭЦП eGov.kz |
| `/home/ubuntu/urtruck-security/storage/` | Фото (селфи, документы, авто) |
| `/home/ubuntu/urtruck-security/backups/` | Бэкапы БД (каждый час) |
| `/home/ubuntu/urtruck-versions/` | Версионированные билды (v51, v52...) |

---

## 5. PM2 процессы

```bash
# Статус
ssh -i ~/.ssh/urtruck ubuntu@185.22.65.11 "source ~/.nvm/nvm.sh && pm2 list"

# Логи
ssh -i ~/.ssh/urtruck ubuntu@185.22.65.11 "source ~/.nvm/nvm.sh && pm2 logs urtruck-security-api --lines 50"

# Рестарт
ssh -i ~/.ssh/urtruck ubuntu@185.22.65.11 "source ~/.nvm/nvm.sh && pm2 restart urtruck-security-api"
```

| Процесс | Порт | Что делает |
|---|---|---|
| `urtruck-security-api` | 8001 | FastAPI бэкенд |
| `urtruck-security-scheduler` | — | Фоновые задачи (backup, telegram parser) |

Nginx слушает порт `8080` (HTTP) и `8443` (HTTPS), проксирует `/security/*` → порт 8001.

---

## 6. Как дать доступ другому разработчику

```bash
# 1. Разработчик на СВОЁМ компе:
ssh-keygen -t ed25519 -C "имя" -f ~/.ssh/urtruck

# 2. Присылает тебе файл ~/.ssh/urtruck.pub

# 3. Ты добавляешь его ключ на сервер:
ssh -i ~/.ssh/urtruck ubuntu@185.22.65.11 "echo 'ВСТАВИТЬ_СОДЕРЖИМОЕ_PUB' >> ~/.ssh/authorized_keys"

# 4. Разработчик подключается:
ssh -i ~/.ssh/urtruck ubuntu@185.22.65.11
```

---

## 7. Безопасность

| Что | Статус |
|---|---|
| Вход по паролю через SSH | ❌ **Отключен** |
| Старый пароль `5XcLhHk/...` | ❌ **Не работает** |
| sshpass | ❌ **Бесполезен** |
| Вход по SSH-ключу | ✅ **Единственный способ** |
| `.env` в git | ❌ **Заблокирован .gitignore** |
| `deploy.sh` в git | ❌ **Заблокирован .gitignore** |
| CORS | ✅ **Только разрешённые домены** |
| API авторизация | ✅ **Bearer token на всех endpoints** |

---

## 8. Аварийный пароль

Работает **ТОЛЬКО** через консоль хостинга (VNC/KVM), **НЕ** через SSH:

```
2kZXFhUQ0ah+Xv2C6uZwoX6wGDJj5sU8
```

Сохрани в менеджере паролей (1Password, Bitwarden). Понадобится только если потеряешь SSH-ключ.

---

## 9. Ссылки

```
Приложение:  http://185.22.65.11:8080
HTTPS:       https://185.22.65.11:8443
API Swagger: http://185.22.65.11:8001/docs
Админка:     http://185.22.65.11:8001/admin (admin / urtruck2026)
API версия:  http://185.22.65.11:8001/api/version
Метрики:     http://185.22.65.11:8001/metrics
Telegram:    @UrTruckbot
```

---

*Tech Lead: Толик · Проект: UrTruck · 19.04.2026*
