# C6 — BACKUP / DEVOPS FORENSIC (baseline c4501ece, read-only)

Handoff для Codex (CI/deploy — его ownership). В рамках Track C файлы НЕ модифицировались.

## Карта backup-механизмов

| # | Механизм | Файл | Триггер | Куда пишет | Ротация |
|---|---|---|---|---|---|
| B1 | APScheduler db_backup | backend/scheduler/jobs.py:358, backup_job.py | IntervalTrigger(hours=1), in-process | /home/ubuntu/urtruck-security/backups (тот же диск) | 48 файлов (MAX_BACKUPS=48) |
| B2 | Workflow Production Backup | .github/workflows/production-backup.yml | **только workflow_dispatch** (no schedule) | ~/urtruck-backups/$STAMP на самом прод-сервере | 10 сетов (:157-159) |
| B3 | Rollback-snapshot при deploy | secure-production-deploy.yml:120-124 | перед каждым deploy | ~/urtruck-rollback/ | 10 |
| B4 | Pre-deploy backup (ручной) | scripts/deploy-backend-safe.sh:127-140 | ручной | backups/deploy-backend-$TS | **нет** |
| B5 | Frontend tarball (ручной) | scripts/deploy-web-safe.sh:60-67 | ручной | /home/ubuntu/urtruck/frontend_backups | **нет** |

## Ответы на ключевые вопросы спринта

### (1) Off-site destination — НЕТ
Ни в одном workflow/script нет выгрузки наружу (grep rclone|aws s3|s3:|offsite — 0). production-backup.yml выполняет весь бэкап внутри SSH-сессии на прод-сервере; копия остаётся на том же диске, где БД. Supabase Storage (SUPABASE_SERVICE_KEY) — существующий рабочий канал наружу, для бэкапов не задействован.

### (2) Scheduled execution вне процесса — НЕТ
- B1 живёт пока жив процесс FastAPI (start_scheduler из startup, main.py:295-296); PM2-restart/crash/URTRUCK_ENABLE_SCHEDULER=0 → бэкапов нет.
- B2 — только workflow_dispatch.
- В репо нет ни одного systemd unit/.timer/crontab (deploy-backend-safe.sh:21 явно заявляет).

### (3) Failure/age alert — НЕТ
- backup_job.py:67-69 при исключении — только print. При failed quick_check — print + удаление файла (:43-46).
- Нет ничего, что проверяло бы «последний снапшот старше N часов». Узнают при попытке восстановления.

### (4) Health gates — ЕСТЬ, автоматического отката НЕТ
- secure-production-deploy.yml:154-159 remote_health_check.sh fail-closed (24×5 сек, PM2 online ×2); :182-212 публичная проверка (build-info SHA, market API, 401/403).
- НО: rollback-снапшоты B3 создаются, а восстановление нигде не автоматизировано. При failed deploy код уже залит (scp :157), pm2 уже перезапущен — откат ручной.
- deploy-web-safe.sh: rsync --delete (:71), при failed curl -k нет отката.

### (5) Бэкапы в git — риска нет
.gitignore:41-44 (*.sqlite/*.db), :1-8 (.env). Прод-БД вне рабочей копии (config.py:50 → /home/ubuntu/urtruck/backend/database/security.db). Замечание: backend/.venv-trackb/ неигнорируем в рабочей копии — мусор другого трека.

## Failure-сценарии

| Сценарий | Что произойдёт | Доказательство |
|---|---|---|
| Disk full при B1 | исключение → print, return None. **Частичный файл не удаляется**; ротация не выполняется; алерта нет | backup_job.py:29-31,43-46,58-62,67-69 |
| Удаление каталога проекта | погибают код+БД+storage; off-site восстановления нет | production-backup.yml:50 |
| Компрометация сервера | атакант получает БД + .env-копии + nginx/pm2 конфиги в одном месте; umask 077 не спасает от root | production-backup.yml:47,99-110 |
| Crash backend-процесса | часовые бэкапы останавливаются; B2 не запустится сам; никто не уведомлён | jobs.py:358, main.py:295-296 |
| Failed backend deploy | health gate падает, но код уже залит; откат ручной из B3/B4 | secure-production-deploy.yml:124,157 |

## Дополнительные замечания

- Хардкод IP/путей: deploy-backend-safe.sh:36-38, deploy-web-safe.sh:4-7, backup_job.py:11; config.py:50 default DB_PATH ≠ production-backup.yml:33 default BACKEND_DIR (разнобой legacy/new).
- production-backup.yml:42 StrictHostKeyChecking=no + пароль; key-mode с pinned known_hosts есть в deploy-ssh.sh, но backup-workflow его не использует.
- deploy-web-safe.sh:39 NODE_TLS_REJECT_UNAUTHORIZED=0, curl -k (:95,:101) — ослабленная TLS в deploy-пути.
- B2 делает pm2 save --force (:137) — мутация внутри «backup» workflow.

## Remediation-план (на согласование с Codex, до реализации)

1. **Off-site upload для B2**: шаг выгрузки ~/urtruck-backups/<latest> (+SHA256SUMS, с проверкой sha256 после upload) в backup-bucket Supabase Storage (SUPABASE_SERVICE_KEY уже есть) или на второй хост через deploy-ssh.sh-транспорт.
2. **Расписание**: `schedule: cron` (раз/сутки) в production-backup.yml — канал, живущий при любом состоянии backend-процесса; опционально systemd-timer на сервере (prod-состояние — только с владельцем).
3. **Stale-backup alert**: workflow по расписанию — SSH-проверка mtime свежайшего снапшота B1/B2; старше порога (26 ч hourly / 30 ч daily) → exit 1. В backup_job.py — файл-метка последнего успеха.
4. **Disk-full hardening backup_job.py**: удалять частичный dst в except (dst.unlink(missing_ok=True)); cleanup ротации до записи; проверка свободного места.
5. **Авто-откат secure-production-deploy.yml**: при failed health — restore из свежайшего ~/urtruck-rollback/backend/* + pm2 restart до health-pass, либо документированный runbook-шаг.
6. **Ротация B4/B5**; перевод production-backup.yml на key-mode с pinned known_hosts.

## BLOCKED

- Секреты SERVER_HOST/SERVER_PASS, миграция на SERVER_SSH_KEY — нет доступа к repo Settings.
- История запусков production-backup.yml — нет доступа к Actions history.
- Состояние прод-сервера (диск, pm2, URTRUCK_ENABLE_SCHEDULER, наличие backups-каталога) — нет SSH.
- Вне-репозиторные cron/systemd на сервере — не проверяемы.
