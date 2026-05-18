# Sentry Setup Plan для UrTruck

Документ-предложение. **Код пока не добавляется** — требуется явный OK
владельца на изменение `package.json` (новые dependencies) + создание
аккаунта Sentry и получение DSN.

## Зачем

Сейчас в UrTruck **нет production-мониторинга**. Когда юзер словит
crash на iPhone — мы об этом узнаём только если он напишет в чат
поддержки или скриншот пришлёт. Реальная картина (сколько crash'ей в
сутки, на каких устройствах, в каких функциях, какой stack-trace) —
неизвестна.

Sentry даёт:
- **Crash reports** с stack-trace на JavaScript-уровне (RN+Web)
- **Performance monitoring** — медленные экраны, медленные API-calls
- **Release tracking** — какой commit/build вылетает чаще
- **User session replay** (опционально) — видео что юзер делал до crash'а
- **Source maps** — читаемые stack-trace вместо minified

Бесплатный план Sentry: **5k events/month**, 1 dev — этого хватит на
первые 6-12 месяцев UrTruck.

## Архитектура подключения

Три точки intеграции:

### 1. Frontend (React Native + Web)

```
package: @sentry/react-native (~10 MB native bundle)
init:    src/sentry.js — Sentry.init({ dsn, environment, release })
hook:    error boundary + unhandled promise rejection
```

### 2. Backend (FastAPI Python)

```
package: sentry-sdk[fastapi] (~3 MB)
init:    backend/main.py — sentry_sdk.init(dsn=..., traces_sample_rate=0.1)
автоматически:
  - все unhandled exceptions
  - middleware → request_id, latency
```

### 3. Release tracking

Привязка version + commit SHA → Sentry release. Когда вылетает crash,
сразу видим в каком билде это случилось.

## Что нужно от владельца

| # | Шаг | Действие | Где |
|---|---|---|---|
| 1 | Создать Sentry-аккаунт | sentry.io, бесплатный план | браузер |
| 2 | Создать проект `urtruck-frontend` | platform: React Native | sentry.io |
| 3 | Создать проект `urtruck-backend` | platform: Python/FastAPI | sentry.io |
| 4 | Скопировать DSN | `https://xxx@oXXX.ingest.sentry.io/XXX` | sentry.io project settings |
| 5 | Добавить в `.env` | `EXPO_PUBLIC_SENTRY_DSN_FE=...` | local + CI secret |
| 6 | OK на изменение `package.json` | добавить `@sentry/react-native ^5.x` | этот PR |
| 7 | OK на изменение `backend/requirements.txt` | добавить `sentry-sdk[fastapi]` | отдельный PR |

## Что нужно от меня (после OK)

| # | Действие | Файл | Риск |
|---|---|---|---|
| 1 | Добавить `@sentry/react-native` в `package.json` | `package.json` | низкий (новый dep, не breaking) |
| 2 | Добавить `import './sentry'` в `App.js` | `App.js` | минимальный |
| 3 | Создать `src/sentry.js` с init-кодом | новый файл | — |
| 4 | Добавить error boundary с Sentry-handler | `src/components/ErrorBoundary.js` | если есть, иначе создать |
| 5 | Добавить `sentry-sdk` в `backend/requirements.txt` | `backend/requirements.txt` | низкий |
| 6 | Добавить `sentry_sdk.init(...)` в `backend/main.py` | `backend/main.py` | минимальный |
| 7 | Добавить release tag из `.version` в deploy.sh / CI | `.github/workflows/deploy.yml` | минимальный |

## Альтернативы (если Sentry не подходит)

- **PostHog** — open-source, full session replay, дороже
- **LogRocket** — лучший session replay, $99/mo
- **Bugsnag** — похоже на Sentry, чуть скромнее
- **Self-hosted Sentry** — на VPS, бесплатно, но maintenance overhead

## Решение

Sentry — **default choice** для startup'ов до $1M revenue. Бесплатный
план хватает. Migration на платный или другой провайдер — позже.

## Когда подключать

**Сейчас не критично**, потому что:
- TestFlight Internal — 1 тестер (ты), баги сообщаешь напрямую
- urtruck.kz — низкий трафик, можно собирать feedback вручную

**Станет критично когда:**
- Internal-тестеров будет > 10
- External TestFlight откроют (100+ юзеров)
- App Store live release

**Минимум полезного:**
- Подключить **только frontend Sentry** (1 PR, 30 минут моего времени
  + 5 минут твоего на DSN), потому что 90% багов сейчас в UI.
- Backend Sentry — отдельно, когда чат/translate/marketplace начнёт
  реально работать с пользователями.

## Что я могу сделать прямо сейчас БЕЗ изменения package.json

1. ✅ Подготовить `src/sentry.js` (init-код, отключенный no-op если
   DSN не задан в env). При merge — никакого effekt'а пока user не
   добавит DSN.
2. ✅ Подготовить error boundary с placeholder.
3. ✅ Документация для подключения.

Но **активация Sentry** = добавить `@sentry/react-native` в
package.json, а это запрещено owner-инструкцией.

## Следующий шаг

Скажи:
- **"Делаем Sentry, package.json трогать OK"** — открою PR с frontend
  интеграцией, сделаешь DSN, мержим.
- **"Подожди, потом"** — оставляем этот доку как backlog item, реактивно
  возвращаемся когда TestFlight откроется external'но.
