# UrTruck Pro Test — изолированный контур

## Идентичность

- приложение: `UrTruck Pro Test`;
- Android package: `com.urtruck.protest`;
- iOS bundle ID: `com.urtruck.protest`;
- deep-link scheme: `urtruck-pro-test`;
- Android release track: только Google Play Internal;
- backend: отдельный каталог `/home/ubuntu/urtruck-pro-test/backend`, порт 8002;
- боевая установка `com.urtruck.app` не изменяется.

## Что создать до первой реальной сборки

1. Новую app в Google Play Console с package `com.urtruck.protest`.
2. Подписку `contacts_premium_monthly`, base plan `monthly`.
3. Firebase Android app `com.urtruck.protest` и её `google-services.json`.
4. Отдельный HTTPS URL тестового backend, проксирующий на `127.0.0.1:8002`.
5. Отдельную SQLite БД тестового backend.
6. RTDN Pub/Sub push на `<PRO_TEST_API_URL>/api/v1/payments/google/rtdn`.
7. Internal testers и License testers.

## GitHub Secrets

- `PRO_TEST_ANDROID_GOOGLE_SERVICES_JSON_BASE64`;
- `PRO_TEST_API_URL`;
- `PRO_TEST_SERVER_HOST`;
- `PRO_TEST_SERVER_USER`;
- `PRO_TEST_SERVER_PASS`;
- стандартные Android upload-key secrets;
- `PLAY_SERVICE_ACCOUNT_JSON` с доступом к отдельной app в Play Console.

## Проверка лимитов

### Free

1. Новый пользователь видит `0 из 5`.
2. Реальное принятие сделки даёт `1 из 5`.
3. Повторный тап не меняет счётчик.
4. Пятая сделка даёт `5 из 5`.
5. Шестая возвращает `402 deal_limit_exceeded` и открывает тарифы.
6. Отмена сделки не возвращает лимит.

### Pro

1. License tester покупает Pro через test instrument.
2. Backend в REAL-режиме проверяет token через Android Publisher API.
3. Статус становится active, лимит — `30`.
4. На `29 из 30` следующее принятие даёт `30 из 30`.
5. Тридцать первая сделка блокируется.
6. Переустановка восстанавливает подписку тому же UrTruck user.
7. Другой UrTruck user не может привязать тот же purchase token.
8. RTDN обновляет продление, отмену и окончание.

## Release gate

Не загружать AAB, пока отсутствует хотя бы один из обязательных secret или
отдельный backend. Не подставлять `https://urtruck.kz` как fallback: тестовая
монетизация не должна затрагивать боевую базу.
