# UrTruck QA auth strategy

Цель документа — зафиксировать, как именно Maestro/Playwright обходят
OTP/SMS-барьер для глубоких QA-сценариев, и почему этот обход
**не ослабляет** production-аутентификацию.

## Текущая архитектура OTP (cheat sheet)

| Слой | Файл | Поведение |
| --- | --- | --- |
| Frontend Phone | `src/screens/onboarding/PhoneV2Screen.js` | `regAPI.sendCode(phone, 'whatsapp')` |
| Frontend OTP   | `src/screens/onboarding/OtpV2Screen.js`   | `regAPI.verifyCode(phone, code)` → `ur_reg_token`, `ur_verification_level` |
| AuthContext    | `src/utils/AuthContext.js`                | `signIn(phone, level, token)` + `setRole(role)` + `refreshLevel()` |
| Backend send   | `backend/api/auth_otp.py:43`              | unified `/api/auth/send-otp` |
| Backend verify | `backend/api/auth_otp.py:95`              | unified `/api/auth/verify-otp` |
| OTP service    | `backend/services/otp_service.py`         | fallback WhatsApp → Telegram → SMS, MOCK когда credentials пусты |
| Хранение       | SQLite `verification_codes`               | TTL 5 мин, 5 попыток |
| Rate limit     | `backend/services/rate_limit.py`          | 1/60s send, 5/10мин verify |

## Existing safety guards

| Guard | Где | Что делает |
| --- | --- | --- |
| `URTRUCK_ENV=production → BETA_MODE=false` | `backend/config.py:19–21` | дефолт production отключает universal-bypass |
| `enforce_production_env()` | `backend/services/env_check.py:55–58,103` | если в prod `BETA_MODE=true` — процесс падает с явным сообщением |
| `X-QA-Agent-Token` гард | `backend/api/qa.py:67–72` | 503 если `QA_AGENT_TOKEN` env пуст, 403 при несовпадении |
| `agent-*` phone marker | `backend/api/qa.py:50–53` | актеры идут в БД с phone `"agent-serik"`/`"agent-boris"`/`"agent-auditor"` — это не E.164, не пересекается с реальными пользователями |
| Public feed filter | `backend/marketplace.py` (Stage 21) | строки с подстрокой `"qa"` в имени/описании — скрыты из публичной ленты |
| Sentry PII | `backend/main.py:30` | `send_default_pii=False` — IIN/имена не уезжают в Sentry |

## QA path (Maestro + Playwright)

```
┌────────────────────────────────────────────────┐
│ Maestro flow (driver-auth.yaml)               │
│                                                │
│   runScript: _lib/ensure-actor.js              │
│      ├── reads MAESTRO_QA_AGENT_TOKEN          │
│      ├── reads MAESTRO_BACKEND_BASE (loopback) │
│      └── POST /api/v1/qa/ensure-actor          │
│           X-QA-Agent-Token: $QA_AGENT_TOKEN    │
│           { "actor": "serik" }                 │
│      → output.token                            │
│                                                │
│   tapOn id: qa-debug-token                     │
│   inputText: ${output.token}                   │
│   tapOn id: qa-debug-submit                    │
│      └── AuthContext.signIn('qa-actor', 3, t)  │
│            + refreshLevel() (роль из backend)  │
│            + setRole(role)                     │
│      → hasToken + session + hasRole all true   │
│      → AppNavigator switches to Main           │
└────────────────────────────────────────────────┘
```

Реальный путь auth (`PhoneV2 → OtpV2`) **не тронут** этим механизмом.
В коде остаются те же вызовы `regAPI.sendCode` / `regAPI.verifyCode`.

## Frontend QA hook

Файл: `src/screens/onboarding/OnboardingV2Screen.js`.
Гард: `EXPO_PUBLIC_QA_HOOKS=1` плюс обычный dev/Expo Go режим
(`__DEV__` и не `standalone`) либо standalone QA2 режим с дополнительным
`EXPO_PUBLIC_QA2_STANDALONE=1`.

Что хук делает:
- рендерит `<TextInput testID="qa-debug-token">` + `<Pressable testID="qa-debug-submit">` в самом низу онбординга.
- на submit зовёт **существующий** `signIn(phone, level, token)` из `AuthContext` — никаких новых auth-методов.
- `refreshLevel()` дёргает `/register/me` и из ответа берёт реальную роль (`driver`/`client`/`auditor`); никакого захардкоженного verified-статуса.
- ошибки показывает в `<Text testID="qa-debug-error">` без логирования токена.

Что хук **не делает**:
- не пишет токен в `console.log` / Sentry / любой prod-логгер;
- не создаёт universal OTP bypass — без валидного backend-токена ничего не происходит;
- не отрисовывается в production/TestFlight standalone-сборке;
- в standalone QA2 отрисовывается только в отдельной QA lane с explicit opt-in;
- не меняет существующее поведение phone/OTP-флоу.

В production backend `_require_agent_token` безусловно отклоняет
`/api/v1/qa/ensure-actor` (`404`), даже если `QA_AGENT_TOKEN` случайно задан.
В production APK флаг `EXPO_PUBLIC_QA2_STANDALONE` не задаётся. Поэтому
знание QA token не создаёт production login bypass.

Для standalone QA2 workflow обязан получить `QA2_API_URL` из secret store.
Production URL отклоняется до Gradle-сборки; QA2 не должен случайно обращаться
к production backend.

## Secret handling

| Где | Что | Правило |
| --- | --- | --- |
| Backend `.env` | `QA_AGENT_TOKEN=<openssl rand -hex 32>` | НЕ коммитить, ротировать при подозрении |
| Mac dev box | `export MAESTRO_QA_AGENT_TOKEN=$QA_AGENT_TOKEN` | задаётся локально перед `maestro test ...` |
| CI | secret env var в GitHub Actions | прокидывается через `env:` в шаге, не через `with:` |
| Repo | — | static-gate `release_static_gate.sh` падает, если строка `QA_AGENT_TOKEN=<not-empty>` или формат токена обнаружены в `src/` или `qa/maestro/*.yaml` |

`qa/maestro/_lib/ensure-actor.{sh,js}` тоже **не содержат** токен —
читают исключительно из env.

## Threat model

| # | Угроза | Митигация |
| --- | --- | --- |
| T1 | `QA_AGENT_TOKEN` утёк в репо | static-gate сканит src/ и qa/maestro/ перед merge |
| T2 | Dev-хук попал в prod-бандл | двойной гард `__DEV__` + `appOwnership !== 'standalone'` + static-gate проверяет, что `qa-debug-submit` обёрнут в `QA_HOOK_ALLOWED` |
| T3 | `BETA_MODE=true` случайно в prod | `enforce_production_env()` в `backend/services/env_check.py` падает на старте процесса |
| T4 | Maestro flow запущен против prod backend | `_lib/ensure-actor.{sh,js}` deny-by-default для `urtruck.kz`/`185.22.65.11`/`prod*`, нужен явный `*ALLOW_REMOTE*=1` |
| T5 | QA-актер засветился в публичной ленте | phone-маркер `agent-*` (не E.164) + filter подстроки `"qa"` в public feed |
| T6 | `/api/v1/qa/ensure-actor` доступен прод-юзеру без токена | 503 без `QA_AGENT_TOKEN` env, 403 при mismatch — обычный пользователь не может его использовать |
| T7 | Утечка реальных PII через QA-логи | hook не логирует токен/телефон; `_lib/ensure-actor.sh` пишет только статус и первые 200 байт ответа при 4xx — без token |

## Forbidden production behavior

- ❌ `BETA_MODE=true` в production env (`URTRUCK_ENV=production`).
- ❌ `QA_AGENT_TOKEN` задан в production env (endpoint безопасен и без этого, но политика — «не задавать»).
- ❌ Хардкод `QA_AGENT_TOKEN` или production-токена в репо.
- ❌ Maestro flow напрямую против `https://urtruck.kz` без явной выкатки на staging.
- ❌ Раскрытие dev-хука в release-сборке (`__DEV__===false` или `standalone`).
- ❌ Логирование OTP-кодов в обычный prod-логгер (только masked в MOCK-логах).

## Manual iPhone-only (что не покрывается)

- камера / галерея / `expo-image-picker` загрузка фото (реальный flow OCR);
- TestFlight build behaviour и реальный production-бандл;
- push (`expo-notifications` в Expo Go SDK 52 урезан);
- реальные Apple permissions (NSCamera / NSPhoto / NSMicrophone);
- `urtruck://` deeplink из системы (Expo Go использует `exp://`);
- OTP с реальным SMS-провайдером (тестируется только handshake до `phone-v2-cta`).

## Static gates

`scripts/release_static_gate.sh` дополнен тремя проверками
(см. PR `test/maestro-qa-auth-path`):

1. `QA_AGENT_TOKEN` не должен встречаться как литерал в `src/` или `qa/maestro/*.yaml`.
2. В `src/screens/onboarding/OnboardingV2Screen.js` идентификатор `qa-debug-submit` обязан жить под `QA_HOOK_ALLOWED` или внутри функции `QaLoginHook`.
3. `qa/maestro/*-auth.yaml` не должны содержать дефолт `urtruck.kz` / `185.22.65.11` в `env:`.

## Реальный путь использования

Локальный backend, который изоморфен production по эндпоинтам:

```bash
cd backend
export URTRUCK_ENV=development
export QA_AGENT_TOKEN="$(openssl rand -hex 32)"
DB_PATH="$PWD/database/security.db" \
  STORAGE_LOCAL_ROOT="$PWD/storage" \
  STORAGE_LOCAL_PUBLIC_BASE="/storage" \
  python -m uvicorn main:app --host 0.0.0.0 --port 8001 &
cd ..

curl -s -X POST http://127.0.0.1:8001/api/v1/qa/ensure-actor \
  -H "X-QA-Agent-Token: $QA_AGENT_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"actor":"serik"}' | python3 -m json.tool
```

Ожидаемый ответ:
```json
{
  "ok": true,
  "actor": "serik",
  "user_id": "agent-serik",
  "role": "driver",
  "token": "<bearer>",
  "verification_level": 3
}
```

`phone` тут **не** реальный — это `agent-serik`. Маркер живёт в БД
исключительно как технический идентификатор актера.
