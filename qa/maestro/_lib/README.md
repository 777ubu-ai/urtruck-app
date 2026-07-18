# Maestro harness — как прогонять надёжно (build 38)

## ⚠️ Главное правило: приложение и ensure-actor должны смотреть в ОДИН backend

`ensure-actor.js` создаёт актор-токены на **локальном** backend
(`MAESTRO_BACKEND_BASE`, по умолчанию `http://127.0.0.1:8001/api/v1`).

А приложение в Expo Go по умолчанию (`src/config/env.js`) без
`EXPO_PUBLIC_API_URL` бьёт в **ПРОД** (`https://urtruck.kz`). Тогда локальный
QA-токен на проде невалиден → `/register/me` не отдаёт роль → роль в приложении
резолвится в дефолт/`client` → **водитель ошибочно получает клиентский таб-бар
(Publish вместо Queue)**. Это АРТЕФАКТ прогона, а не баг продукта
(проверено build 38, 2026-07-18: с локальным backend водитель корректно
получает 5 вкладок Feed/MyWork/**Queue**/Chats/Profile).

**Поэтому Metro для Maestro ВСЕГДА поднимать так:**

```bash
EXPO_PUBLIC_API_URL=http://127.0.0.1:8001 npx expo start --port 8082
```

(iOS-симулятор достаёт хост по `127.0.0.1`.)

## Предпосылки прогона

```bash
# 1) локальный backend
cd backend && uvicorn main:app --host 127.0.0.1 --port 8001   # QA_AGENT_TOKEN в .env

# 2) Metro, смотрящий в локальный backend
EXPO_PUBLIC_API_URL=http://127.0.0.1:8001 npx expo start --port 8082

# 3) окружение для Maestro (токен НЕ хардкодить)
export MAESTRO_QA_AGENT_TOKEN="$(grep -E '^QA_AGENT_TOKEN=' backend/.env | cut -d= -f2-)"
export MAESTRO_BACKEND_BASE="http://127.0.0.1:8001/api/v1"

# 4) чистый вход: сбросить Keychain (иначе восстановится прошлая сессия и
#    QA-экран входа не покажется → qa-debug-submit не найдётся)
xcrun simctl terminate booted host.exp.Exponent
xcrun simctl keychain booted reset

# 5) прогон (устройство указывать явно, если booted несколько)
maestro --device <UDID> test qa/maestro/driver-canon-tabs.yaml
```

## Диалог фоновой геолокации (build 38)

На входе в MainTabs у водителя всплывает нативный запрос
`locationBackground` («Experience needs permissions… Allow?») — это новая
фоновая геолокация. Он перекрывает таб-бар и роняет assert'ы. Новые флоу
build 38 снимают его блоком `when: visible "Allow" → tapOn "Allow"`; в старые
флоу при необходимости добавить такой же блок сразу после `qa-login.yaml`.

## Что НЕ автоматизируется на симуляторе (только 📱 устройство)

- Запись/воспроизведение голосовых (нет реального микрофона).
- Камера/галерея (native image picker не мокается).
- Фоновый GPS в движении (симулятор эмулирует ненадёжно).
- Пуши на локскрин / deep-link по тапу / бейдж иконки.

Эти пункты — в ручном чек-листе `qa/CHAT_QA_MASTER.md` и
`qa/PUSH_DEVICE_TEST.md`.
