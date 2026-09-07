# UrTruck — что вошло в v1.0.8 (платежи: дофинализация Google Play Billing)

Отчёт по ветке `payments` (на базе `a2098b01` — подписка на разблокировку
контактов через Google Play Billing). Эта часть — **код**: дофинализация контура
«покупка → серверная верификация → лимиты контактов» до состояния «готово к
тестированию в Play Console». Монетизация на проде **включена не была**:
`CONTACTS_MONETIZATION_ENABLED=false` по умолчанию, `IS_BETA=true` не тронут —
включение только по согласованию с владельцем (см. CLAUDE.md).

---

## ✅ Бэкенд

- **Тесты платежного контура** — новый `backend/tests/test_payments_contract.py`
  (11 тестов): верификация покупки (MOCK, +30 дней), идемпотентность по
  `purchase_token`, RTDN-webhook (unknown token / expired / cancelled / мусорный
  payload), лимит 3 бесплатных раскрытия контакта (повторный просмотр не тратит
  лимит, подписка = безлимит), гейт `contact_locked` в `get_deal`,
  `/subscription/status` для free/premium. **11/11 passed.**
- **`conftest.py`** — теперь поднимает payments-схему (`subscriptions`,
  `contact_reveals`); без этого падал полный прогон suite.
- **Prod-guard в `services/env_check.py`** — сервер с включённой монетизацией,
  но без `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` больше не стартует молча
  (раньше: пустой env = MOCK-режим = любой фейковый токен давал вечную подписку).
- **`backend/.env.example`** — добавлена секция платёжных ключей
  (`CONTACTS_MONETIZATION_ENABLED`, `FREE/PREMIUM_CONTACT_LIMIT`,
  `GOOGLE_PLAY_PACKAGE_NAME`, `GOOGLE_PLAY_CONTACTS_PRODUCT_ID`,
  `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON`) с комментариями.

## 📱 Android / фронтенд

- **Разрешение `com.android.vending.BILLING`** — добавлено в `app.json` и
  `AndroidManifest.xml` (+ `<queries>` для `com.android.vending`, нужен на
  Android 11+). Без него покупка падает с `BILLING_UNAVAILABLE`.
- **Restore purchase** — `SubscriptionScreen` теперь при неактивном статусе
  подтягивает покупки через `getAvailablePurchases()` и верифицирует на сервере:
  подписка работает на втором устройстве и после переустановки.
- **Честная ошибка загрузки** — offline отличается от «подписки нет»:
  состояние ошибки с кнопкой retry, кнопка покупки не показывается вслепую.
- **Beta-режим** — пока `IS_BETA` и монетизация выключены, вместо кнопки
  покупки показывается «контакты бесплатны в период пилота» (RU/KZ/CN/EN).
- **Версия 1.0.8** (android versionCode 10) — под подписку в Play Console.

## 🔧 Версии

- `app.json`: 1.0.7 → **1.0.8**, `versionCode` 9 → **10** (iOS buildNumber не
  тронут — подписка Android-only, EAS `autoIncrement` поднимет сам при сборке).

## 📋 Что осталось (владелец, вне кода)

1. **Play Console**: создать подписку `contacts_premium_monthly` (Monthly, цена
   KZ, Set active) после публикации сборки с BILLING в треке.
2. **RTDN**: Monetization setup → Real-time developer notifications → топик
   Pub/Sub; push-подписка на `POST /api/v1/payments/google/rtdn`.
3. **Service account** (GCP) + приглашение в Play Console с правом
   «View financial data»; JSON-ключ → серверный `.env` (`GOOGLE_PLAY_SERVICE_ACCOUNT_JSON`).
4. **License testers** (покупки без списания, подписка протухает за ~30 мин).
5. **Сервер**: выкатить backend с новым кодом, задать `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON`.
6. **Ручное тестирование** по таблице сценариев (покупка, restore на 2-м
   устройстве, отмена, протухание, лимит 3) — только с license tester-аккаунтов.
7. **Только после согласования**: `CONTACTS_MONETIZATION_ENABLED=true`
   (обновить privacy policy про покупки — Google проверяет).

## Проверки

- `pytest tests/test_payments_contract.py -q` → **11 passed**
  (изоляция, полный suite, скрипт-режим).
- Полный прогон suite: 93 падения идентичны чистому HEAD `a2098b01`
  (пре-существующие Windows/timing), регрессий нет.
- `py_compile` / `node --check` на изменённых файлах — OK.
