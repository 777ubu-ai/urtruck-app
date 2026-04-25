# UrTruck — Деплой на сервер Ubuntu

> Сервер: 185.22.65.11
> Пользователь: ubuntu
> Домен: настроить A-запись на 185.22.65.11

---

## 1. Подключение к серверу

```bash
ssh ubuntu@185.22.65.11
```

---

## 2. Обновление системы

```bash
sudo apt update && sudo apt upgrade -y
```

---

## 3. Установка Node.js 20 LTS

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
node -v   # должно быть v20.x
npm -v    # должно быть 10.x
```

---

## 4. Установка PM2 (менеджер процессов)

```bash
sudo npm install -g pm2
pm2 startup   # автозапуск после перезагрузки
```

---

## 5. Установка Nginx

```bash
sudo apt install -y nginx
sudo systemctl enable nginx
sudo systemctl start nginx
```

---

## 6. Установка Certbot (SSL)

```bash
sudo apt install -y certbot python3-certbot-nginx
```

---

## 7. Загрузка проекта на сервер

### Вариант A: через Git (рекомендуется)

```bash
# На сервере
cd /home/ubuntu
git clone <URL_РЕПОЗИТОРИЯ> urtruck-app
cd urtruck-app
npm install
```

### Вариант B: через SCP (без Git)

```bash
# На локальной машине (Mac)
cd ~/Downloads/urtruck-app
npm run build:web

# Загружаем весь проект
scp -r ~/Downloads/urtruck-app ubuntu@185.22.65.11:/home/ubuntu/

# Или только билд
scp -r ~/Downloads/urtruck-app/dist ubuntu@185.22.65.11:/home/ubuntu/urtruck-app/
```

---

## 8. Сборка веб-версии

```bash
cd /home/ubuntu/urtruck-app
npm install
npx expo export --platform web
# Результат: папка dist/ с готовыми статическими файлами
```

---

## 9. Настройка Nginx

```bash
sudo nano /etc/nginx/sites-available/urtruck
```

Вставить:

```nginx
server {
    listen 80;
    server_name urtruck.app www.urtruck.app;
    # Если нет домена, временно использовать IP:
    # server_name 185.22.65.11;

    root /home/ubuntu/urtruck-app/dist;
    index index.html;

    # Gzip сжатие
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml;
    gzip_min_length 256;

    # Кэширование статики
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2)$ {
        expires 30d;
        add_header Cache-Control "public, immutable";
    }

    # SPA — все маршруты на index.html
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Блокировка доступа к скрытым файлам
    location ~ /\. {
        deny all;
    }
}
```

Активировать:

```bash
sudo ln -sf /etc/nginx/sites-available/urtruck /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t          # проверка конфига
sudo systemctl reload nginx
```

---

## 10. SSL сертификат (Let's Encrypt)

### Если есть домен:

```bash
sudo certbot --nginx -d urtruck.app -d www.urtruck.app
```

Certbot автоматически:
- Получит сертификат
- Обновит конфиг Nginx (добавит listen 443, ssl_certificate)
- Настроит редирект HTTP → HTTPS
- Автообновление через cron

### Проверка автообновления:

```bash
sudo certbot renew --dry-run
```

### Если нет домена (временно по IP):

```bash
# Самоподписанный сертификат
sudo openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout /etc/ssl/private/urtruck.key \
  -out /etc/ssl/certs/urtruck.crt \
  -subj "/CN=185.22.65.11"
```

Добавить в Nginx:

```nginx
server {
    listen 443 ssl;
    server_name 185.22.65.11;
    ssl_certificate /etc/ssl/certs/urtruck.crt;
    ssl_certificate_key /etc/ssl/private/urtruck.key;
    # ... остальное как выше
}
```

---

## 11. PM2 — автоматический редеплой (опционально)

Если нужен SSR или API-сервер:

```bash
cd /home/ubuntu/urtruck-app

# Запуск через serve (статика)
pm2 start npx --name "urtruck" -- serve dist -l 3000

# Сохранить конфигурацию
pm2 save
```

Nginx в этом случае проксирует:

```nginx
location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection 'upgrade';
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_cache_bypass $http_upgrade;
}
```

---

## 12. Скрипт автодеплоя

Создать `/home/ubuntu/deploy.sh`:

```bash
#!/bin/bash
set -e

echo "=== UrTruck Deploy ==="
cd /home/ubuntu/urtruck-app

echo "1. Обновляем код..."
git pull origin main

echo "2. Устанавливаем зависимости..."
npm install

echo "3. Собираем веб-версию..."
npx expo export --platform web

echo "4. Перезапускаем..."
pm2 restart urtruck 2>/dev/null || echo "Nginx обслуживает статику"
sudo systemctl reload nginx

echo "=== Готово! ==="
```

```bash
chmod +x /home/ubuntu/deploy.sh
```

---

## 13. Firewall

```bash
sudo ufw allow 22/tcp     # SSH
sudo ufw allow 80/tcp     # HTTP
sudo ufw allow 443/tcp    # HTTPS
sudo ufw enable
sudo ufw status
```

---

## 14. Мониторинг

```bash
# Логи Nginx
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log

# PM2 (если используется)
pm2 logs urtruck
pm2 monit

# Диск и память
df -h
free -h
```

---

## БЫСТРЫЙ ДЕПЛОЙ (всё одной командой)

На локальной машине:

```bash
# Собрать + загрузить + перезапустить
cd ~/Downloads/urtruck-app && \
npx expo export --platform web && \
scp -r dist/* ubuntu@185.22.65.11:/home/ubuntu/urtruck-app/dist/ && \
ssh ubuntu@185.22.65.11 "sudo systemctl reload nginx"
```

---

## ЧЕКЛИСТ ПОСЛЕ ДЕПЛОЯ

- [ ] `http://185.22.65.11` — открывается SplashScreen
- [ ] HTTPS работает (если есть домен)
- [ ] Авторизация через Supabase работает
- [ ] Nginx отдаёт gzip
- [ ] Firewall включён (22, 80, 443)
- [ ] PM2 автозапуск настроен
- [ ] SSL автообновление работает

---

*Последнее обновление: 12 апреля 2026*
