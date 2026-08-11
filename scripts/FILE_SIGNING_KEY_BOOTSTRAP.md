# Admin bootstrap: production FILE_SIGNING_KEY

Отдельный operational bootstrap (НЕ обход merge-gate #169). Цель: вывести
manual `workflow_dispatch` на default-ветку, чтобы можно было безопасно
установить `FILE_SIGNING_KEY` на production через существующий deploy-контур.

## Файлы
- `.github/workflows/set-file-signing-key.yml` — manual-only workflow.
- `scripts/deploy-ssh.sh` — резолвер SSH (key-preferred, pass-fallback).
- `scripts/signing_smoke.py` — доказательство подписи на сервере (без вывода значения).
- `qa/utils/signingKeyWorkflowGuard.js` — статический guard workflow.

## Threat model
- Ключ **генерируется на сервере** внутри SSH-сессии — не транзитит через runner,
  не попадает в logs/artifacts/GitHub Secrets.
- **Идемпотентно без перезаписи**: существующий ключ не трогается (не инвалидирует
  выданные signed-URL).
- `.env` не печатается; бэкап перед изменением; atomic `mv`; `unset KEY`.
- workflow_dispatch-only; никакого push/PR-триггера.
- Тот же контур доступа, что и обычный деплой → новой поверхности нет.

## Как запустить (после merge этого admin PR на main)
Actions → **Set FILE_SIGNING_KEY (one-shot, prod)** → Run workflow.
GREEN = `FILE_SIGNING_KEY_PRESENT=yes` + `SIGNING_SMOKE=ok` (legit/tampered/expired).
Значение секрета нигде не выводится.

## Rollback
Workflow делает `cp .env .env.bak.<ts>` до изменения. Откат: восстановить бэкап
и `pm2 restart urtruck-security-api`. Т.к. установка идемпотентна и не перезаписывает
существующий ключ — повторный запуск безопасен.

## Почему merge ДО #169 безопасен
Ни одного runtime/product изменения: только manual admin-workflow + вспомогательные
скрипты. Прод-код не меняется; workflow сам ничего не запускает без ручного dispatch.
Наоборот, установка ключа ДО деплоя #169 (fail-closed) предотвращает 500 на
document-эндпоинтах после выкладки.
