# Biz Chat — Production Deployment Guide

Пошаговая инструкция: от чистой Ubuntu VPS до работающего `https://bizchat.app` и `https://api.bizchat.app`.

> **Цель:** разработчик клонирует репозиторий, заполняет `.env.production`, запускает `./infra/deploy.sh` — и получает живое приложение.

---

## 1. Требования к VPS

| Параметр | Минимум | Рекомендуется |
|---|---|---|
| OS | Ubuntu 22.04 LTS | Ubuntu 24.04 LTS |
| RAM | 2 GB | 4 GB |
| CPU | 2 vCPU | 4 vCPU |
| Диск | 40 GB SSD | 80 GB SSD |
| Сеть | 1 Gbps, public IPv4 | + IPv6 |

Нужны открытые порты `22`, `80`, `443` (всё остальное — внутри docker network).

---

## 2. Подготовка VPS

```bash
# Свежие пакеты
sudo apt update && sudo apt upgrade -y

# Базовые утилиты
sudo apt install -y curl git wget ufw fail2ban

# Firewall
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable

# Docker (официальный скрипт)
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
newgrp docker   # перезагрузить группы в текущей сессии

# Проверка
docker --version
docker compose version
```

---

## 3. Клонирование репозитория

```bash
cd ~
git clone https://github.com/<org>/bizchat.git
cd bizchat
```

---

## 4. Конфигурация окружения

```bash
# Создаём .env.production из шаблона
cp infra/.env.production.example infra/.env.production

# Генерируем сильные секреты
openssl rand -base64 48   # -> JWT_SECRET (минимум 64 символа)
openssl rand -base64 24   # -> DB_PASSWORD
openssl rand -base64 24   # -> REDIS_PASSWORD

# Редактируем
nano infra/.env.production
```

**Обязательно заполнить:**
- `DB_PASSWORD`, `REDIS_PASSWORD`, `JWT_SECRET`
- `TWILIO_*` (для SMS)
- `APP_API_URL=https://api.bizchat.app`, `APP_WS_URL=wss://api.bizchat.app`
- `CORS_ORIGIN=https://bizchat.app,https://www.bizchat.app`

---

## 5. Firebase Service Account (push-уведомления)

1. Firebase Console → Project Settings → Service accounts → **Generate new private key**.
2. Скачать `firebase-service-account.json`.
3. Положить на VPS:

```bash
mkdir -p infra/secrets
# Скопировать файл на сервер, например через scp:
#   scp firebase-service-account.json user@vps:/home/user/bizchat/infra/secrets/
chmod 600 infra/secrets/firebase-service-account.json
```

Если сейчас нет — deploy.sh создаст заглушечный JSON и push будет отключён.

---

## 6. DNS

В панели регистратора домена создаём A-записи:

| Host | Type | Value |
|---|---|---|
| `bizchat.app` | A | `<IP VPS>` |
| `www.bizchat.app` | A | `<IP VPS>` |
| `api.bizchat.app` | A | `<IP VPS>` |

Проверка: `dig +short bizchat.app` должен вернуть IP VPS. Подождать 5-30 минут распространения.

---

## 7. SSL через Let's Encrypt (Certbot)

**Перед первым запуском deploy.sh** получаем сертификаты:

```bash
# Ставим certbot на хост
sudo apt install -y certbot

# Standalone mode — занимает 80 порт, поэтому docker не должен быть запущен
sudo certbot certonly --standalone \
    -d bizchat.app -d www.bizchat.app -d api.bizchat.app \
    --agree-tos --no-eff-email -m admin@bizchat.app

# Сертификаты лягут в /etc/letsencrypt/live/bizchat.app/ и .../api.bizchat.app/
```

Далее в `infra/nginx/nginx.conf` раскомментировать блоки `listen 443 ssl` и `if ($scheme = http) { return 301 ... }` (см. комментарии в файле).

**Автопродление** — добавить в cron:
```bash
sudo crontab -e
# Каждую ночь в 3:00 — обновление сертификатов + reload nginx
0 3 * * * certbot renew --quiet && cd /home/$USER/bizchat && docker compose -f infra/docker-compose.production.yml exec nginx-proxy nginx -s reload
```

---

## 8. Первый deploy

```bash
cd ~/bizchat
chmod +x infra/deploy.sh
./infra/deploy.sh
```

Скрипт:
1. проверит окружение,
2. `git pull`,
3. соберёт Docker-образы (backend, web),
4. поднимет контейнеры,
5. дождётся healthcheck backend,
6. прогонит миграции БД,
7. покажет статус и URL.

Ожидаемое время первого билда: **7-15 минут** (Flutter web — самый долгий).

---

## 9. Проверка

```bash
# Статус
docker compose -f infra/docker-compose.production.yml ps

# Живой API
curl https://api.bizchat.app/api/v1/posts/feed?limit=1

# Web UI — открыть в браузере
open https://bizchat.app
```

---

## 10. Логи и мониторинг

```bash
# Live backend логи
docker compose -f infra/docker-compose.production.yml logs -f backend

# Все сервисы
docker compose -f infra/docker-compose.production.yml logs -f

# nginx access log
docker compose -f infra/docker-compose.production.yml exec nginx-proxy tail -f /var/log/nginx/access.log

# Использование ресурсов
docker stats
```

---

## 11. Backup БД

```bash
# Ручной бэкап
docker compose -f infra/docker-compose.production.yml exec -T postgres \
    pg_dump -U bizchat bizchat | gzip > backup_$(date +%Y%m%d_%H%M%S).sql.gz

# Автоматический — cron на хосте, каждую ночь в 2:00
sudo crontab -e
```

Добавить:
```cron
0 2 * * * cd /home/$USER/bizchat && docker compose -f infra/docker-compose.production.yml exec -T postgres pg_dump -U bizchat bizchat | gzip > /var/backups/bizchat/db_$(date +\%Y\%m\%d).sql.gz && find /var/backups/bizchat/ -name "db_*.sql.gz" -mtime +14 -delete
```

Хранить 14 дней. Раз в неделю копировать последний бэкап на внешнее хранилище (S3/rsync).

**Восстановление:**
```bash
gunzip < backup_20260411.sql.gz | docker compose -f infra/docker-compose.production.yml exec -T postgres psql -U bizchat bizchat
```

---

## 12. Откат на предыдущую версию

```bash
# Посмотреть историю
git log --oneline -20

# Откатиться на нужный коммит
git checkout <prev_sha>

# Пересобрать и перезапустить
./infra/deploy.sh

# Если миграции накатили изменения схемы, которые несовместимы — откатить миграции
docker compose -f infra/docker-compose.production.yml exec backend npm run migration:revert
```

---

## 13. Обновление

Обычное обновление после пуша в main — просто:
```bash
./infra/deploy.sh
```

Скрипт сам сделает `git pull`, пересоберёт образы и перезапустит контейнеры с нулевым простоем (если backend healthy).

---

## 14. Troubleshooting

| Проблема | Решение |
|---|---|
| `nginx: bind: address already in use` | `sudo systemctl stop nginx` (хостовый nginx) или `sudo fuser -k 80/tcp` |
| Backend unhealthy | `docker compose logs backend` — обычно DB connection или missing env |
| Миграции падают | Проверить `DB_*` в env + `docker compose exec backend npm run migration:show` |
| SSL 404 на acme challenge | Сертификат истёк — `sudo certbot renew` + `docker compose restart nginx-proxy` |
| Нет push | Проверить `infra/secrets/firebase-service-account.json` + логи backend на `[FCM]` |

---

## 15. Безопасность (чеклист)

- [ ] `ufw` включён, открыты только 22/80/443
- [ ] `fail2ban` настроен на SSH
- [ ] SSH key-only auth (отключить пароли в `/etc/ssh/sshd_config`)
- [ ] `.env.production` имеет права `600` (`chmod 600 infra/.env.production`)
- [ ] `firebase-service-account.json` — `600`
- [ ] Регулярные backup'ы работают (проверять раз в неделю)
- [ ] `docker system prune -af` раз в месяц (очистка старых образов)
- [ ] Мониторинг uptime (UptimeRobot / betterstack) на `https://api.bizchat.app/api/v1/posts/feed?limit=1`
