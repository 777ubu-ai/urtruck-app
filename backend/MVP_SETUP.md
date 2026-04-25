# UrTruck MVP — настройка 3 критичных модулей

## #1 · WhatsApp Meta Cloud API

### Что дать Толе
- `WHATSAPP_ACCESS_TOKEN`
- `WHATSAPP_PHONE_NUMBER_ID`

### Как получить (30-60 минут)
1. Зайти на https://developers.facebook.com/ → Log in через Facebook
2. My Apps → Create App → Business → WhatsApp Business Platform
3. В панели приложения слева: **WhatsApp → API Setup**
4. Получить `Temporary access token` (24 часа) или сделать Permanent через System User:
   - Business Settings → Users → System Users → Add → Admin
   - Generate New Token → выбрать приложение → permissions: `whatsapp_business_messaging`, `whatsapp_business_management`
5. Скопировать `Phone number ID` из API Setup
6. Создать шаблон сообщения:
   - WhatsApp Manager → Message Templates → Create Template
   - Name: `otp_code` · Category: **Authentication** · Language: Russian
   - Body: `Ваш код подтверждения UrTruck: {{1}}. Никому не сообщайте.`
   - Отправить на аппрув (обычно 5-30 минут)
7. Добавить тестовый номер получателя в API Setup → Add phone number

### Что сделает Толя
```bash
echo "WHATSAPP_ACCESS_TOKEN=EAAG..." >> /home/ubuntu/urtruck-security/.env
echo "WHATSAPP_PHONE_NUMBER_ID=123456789" >> /home/ubuntu/urtruck-security/.env
pm2 restart urtruck-security-api
curl http://185.22.65.11:8001/api/v1/system/info
# → "whatsapp": {"mode": "REAL"}
```

### Лимиты (бесплатно)
- 1000 пользователь-инициированных разговоров/мес (мы не используем)
- **Unlimited utility/auth** для первой 1000 пользователей — OTP-коды сюда входят
- Далее ~$0.005 за сообщение

---

## #2 · Face Recognition (dlib + face_recognition)

### Что сделать на сервере
```bash
ssh ubuntu@185.22.65.11

# Системные зависимости (15 мин, одноразово)
sudo apt update
sudo apt install -y cmake build-essential \
  libopenblas-dev liblapack-dev libx11-dev \
  libgtk-3-dev libatlas-base-dev python3-dev

# Python пакеты (5-10 мин — dlib долго компилируется)
cd /home/ubuntu/urtruck-security
source venv/bin/activate  # или pipenv/poetry
pip install --no-cache-dir dlib==19.24.2
pip install face-recognition==1.3.0
pip install opencv-python-headless==4.10.0.84
pip install numpy

# Проверка
python3 -c "import face_recognition; print('OK')"

# Рестарт
pm2 restart urtruck-security-api
curl http://185.22.65.11:8001/api/v1/system/info
# → "face": {"face_recognition_available": true, "mode": "real"}
```

### Что получим
- **Liveness:** детекция лица в кадре + анти-спуфинг через Laplacian sharpness (фото с экрана размыто, реальное — резко)
- **Face match:** селфи ↔ фото на правах, distance<0.6 считается совпадением
- **128-мерный эмбеддинг** сохраняется для дубликатов / blacklist по лицу

### Fallback
Если `face_recognition` недоступен — работает эвристика на EXIF (как было). Код автоматически переключается.

---

## #3 · Persistent Storage

### Варианты

**A. Local FS (default, уже работает)**
- Файлы в `/home/ubuntu/urtruck-security/storage/{selfies,licenses,passports,vehicles}/`
- Раздача через `/security/storage/...` (nginx → FastAPI StaticFiles)
- Плюсы: zero setup, быстро
- Минусы: при переезде сервера нужно копировать; не масштабируется горизонтально

**B. Supabase Storage (рекомендуется)**
- https://supabase.com → New Project → Free tier (1GB storage, 2GB bandwidth/мес)
- Storage → New Bucket → name `urtruck-docs` → Public: off
- Settings → API → скопировать:
  - `Project URL` → `SUPABASE_URL`
  - `service_role key` → `SUPABASE_SERVICE_KEY`
- В `.env`:
  ```
  STORAGE_PROVIDER=supabase
  SUPABASE_URL=https://xxx.supabase.co
  SUPABASE_SERVICE_KEY=eyJ...
  SUPABASE_BUCKET=urtruck-docs
  ```

**C. AWS S3**
- Создать bucket, IAM user с `PutObject` permission
- `pip install boto3`
- В `.env`:
  ```
  STORAGE_PROVIDER=s3
  S3_BUCKET=urtruck-prod
  S3_REGION=eu-central-1
  AWS_ACCESS_KEY_ID=...
  AWS_SECRET_ACCESS_KEY=...
  ```

---

## Проверка после деплоя

```bash
# Все 3 модуля
curl http://185.22.65.11:8001/api/v1/system/info
```

Ожидаемый ответ в полном MVP:
```json
{
  "whatsapp": {"mode": "REAL"},
  "face": {"face_recognition_available": true, "opencv_available": true, "mode": "real"},
  "storage": {"provider": "supabase", "supabase_configured": true}
}
```

---

## Что даст пользователь

1. Meta: **WHATSAPP_ACCESS_TOKEN** + **WHATSAPP_PHONE_NUMBER_ID**
2. SSH: пароль от `ubuntu@185.22.65.11` (чтобы Толя сам поставил dlib)
3. Supabase: **SUPABASE_URL** + **SUPABASE_SERVICE_KEY** (опционально — можно оставить local)

После этого Толя за 15 минут поднимает всё и прогоняет E2E-тест.
