# Локальный тест оплаты и лимитов (ветка `payments`)

Payments-роутов (`/api/v1/payments/*`) на проде нет, поэтому покупку Pro и
лимит принятия сделок тестируем на локальном бэкенде. Схема проверена
14.10.2026 на планшете Xiaomi 24091RPADG.

```
Планшет (APK com.urtruck.app) ──► cloudflared-туннель ──► бэкенд :8001 (SQLite security_local.db)
Браузер http://localhost:8090 ──► scripts/e2e-static-proxy.js ──┘
```

## 1. Поднять стенд

```powershell
powershell -ExecutionPolicy Bypass -File scripts\local-payments-stack.ps1
```

Скрипт создаёт `backend\venv` на Python 3.13 (на 3.10 бэкенд падает при
старте), запускает бэкенд, туннель и веб-версию, печатает адрес туннеля.
Логи — `.local-stack/`. Флаги: `-SkipWebBuild`, `-SkipInstall`.

Нужно: Python 3.13 (`py -3.13`), `cloudflared`, Node/npm.

## 2. APK под адрес туннеля

Реальный Google Play Billing работает только в `com.urtruck.app`, подписанном
боевым upload-ключом, — ключ есть лишь в секретах GitHub, поэтому APK
собирается в CI.

Прод-сборка по умолчанию отказывается собираться с API не на `urtruck.kz`
(гард в `app.config.js`). Для теста используется ветка
**`payments-local-test`** = `payments` + два коммита «НЕ МЕРЖИТЬ», снимающие
гард и его тест. Перед сборкой влить в неё свежий `payments`:

```bash
git switch payments-local-test && git merge payments && git push && git switch payments
gh workflow run deploy-play.yml --ref payments-local-test \
  -f submit_to_play=false -f build_installable_apk=false \
  -f api_url=https://<адрес-туннеля>.trycloudflare.com
```

Сборка ~30 мин. Артефакт `UrTruck-universal-apk`:

```bash
gh run download <run-id> -n UrTruck-universal-apk -D <папка>
adb install -r <папка>/UrTruck-universal.apk
```

- Если на планшете стоит версия из Google Play — сначала `adb uninstall com.urtruck.app`
  (подпись другая; вход в аккаунт слетит).
- **Адрес quick-туннеля меняется при каждом запуске cloudflared** → после
  перезапуска стенда APK нужно пересобрать. Пока стенд не перезапускали,
  APK продолжает работать.

## 3. Тест

1. Планшет — один аккаунт (например, водитель), браузер `http://localhost:8090` —
   второй, на **другую** почту/номер.
2. Код входа локальный бэкенд показывает прямо на экране («Тестовый код»).
3. Грузовладелец размещает груз → водитель ставит ставку → принятие.
   Лимит списывается **обеим** сторонам. На 6-м принятии — экран тарифов (402).
4. «☰ → Тарифы и лимиты» → купить Pro → окно Google Play. Аккаунт на планшете
   должен быть в Play Console → Лицензионное тестирование, иначе спишутся деньги.
5. После покупки: лимит 30, кнопка «Управление подпиской».

Проверка покупки на бэкенде без `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` идёт в
MOCK-режиме (любой токен считается оплаченным) — только для dev.

Данные стенда живут в `backend/database/security_local.db` и с продом
(urtruck.kz) не пересекаются.

## После теста

Ветку `payments-local-test` не мержить; когда стенд больше не нужен —
`git push origin --delete payments-local-test`.
