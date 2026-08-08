# DEPLOY SSH HARDENING + SECRET ROTATION (STEP 4, 08.08.2026)

## Что уже сделано в репозитории (repo-side, DONE)

- `deploy.yml` больше не хардкодит `sshpass`/`StrictHostKeyChecking=no` в вызовах —
  все 4 шага (backup, deploy, verify, deploy backend) делегируют в
  `scripts/deploy-ssh.sh`.
- `scripts/deploy-ssh.sh` — резолвер аутентификации:
  - **key-режим** (если задан секрет `SERVER_SSH_KEY`): `ssh -i <key>` с
    **пиннингом host-key** (`UserKnownHostsFile` из `SERVER_SSH_KNOWN_HOSTS`,
    иначе `ssh-keyscan`), `StrictHostKeyChecking=yes`;
  - **fallback pass-режим** (если `SERVER_SSH_KEY` пуст): текущий sshpass-путь
    **байт-в-байт** — поведение сегодня не меняется.
- `deploy.yml` env всех шагов уже пробрасывает `SERVER_SSH_KEY` и
  `SERVER_SSH_KNOWN_HOSTS` (пустые, пока не заданы секреты).
- `concurrency` + `permissions: contents:read` на workflow.

Проверка построения команд без сервера (секреты не печатаются):
```bash
DRY_RUN=1 SERVER_HOST=h SERVER_USER=u SERVER_PASS=p scripts/deploy-ssh.sh ssh "echo hi"   # → sshpass ... (как сейчас)
DRY_RUN=1 SERVER_HOST=h SERVER_USER=u SERVER_SSH_KEY=k scripts/deploy-ssh.sh ssh "echo hi" # → ssh -i ... StrictHostKeyChecking=yes
```

## Как включить key-режим (EXTERNAL — нужен доступ к серверу + GitHub Secrets)

Новый flow **inert**, пока владелец не выполнит эти шаги. Включение НЕ вслепую:

```bash
# 1) Сгенерировать dedicated deploy key (на своей машине; приватный НЕ коммитить):
ssh-keygen -t ed25519 -C "urtruck-deploy" -f urtruck_deploy -N ""

# 2) Добавить ПУБЛИЧНЫЙ ключ на сервер в authorized_keys deploy-пользователя:
ssh-copy-id -i urtruck_deploy.pub "$SERVER_USER@185.22.65.11"
#   (или вручную дописать содержимое urtruck_deploy.pub в ~/.ssh/authorized_keys)

# 3) Зафиксировать host-key сервера для пиннинга (кладётся в секрет):
ssh-keyscan -H 185.22.65.11

# 4) Добавить GitHub Secrets (Settings → Secrets → Actions):
#    SERVER_SSH_KEY          = содержимое приватного urtruck_deploy
#    SERVER_SSH_KNOWN_HOSTS  = вывод ssh-keyscan из шага 3
#    (после этого deploy.yml автоматически перейдёт в key-режим — код менять не надо)

# 5) Прогнать один деплой (push в main / workflow_dispatch), убедиться в логах,
#    что резолвер вывел MODE=key, деплой и health-check прошли.

# 6) ТОЛЬКО после успешного key-деплоя — отключить пароль на сервере:
#    sudo sed -i 's/^#\?PasswordAuthentication.*/PasswordAuthentication no/' /etc/sshd_config
#    sudo systemctl reload ssh
#    затем удалить секрет SERVER_PASS из GitHub.
```

## Обязательный SECRET ROTATION LIST (EXTERNAL)

Ротировать (значения нигде не печатать):

| Секрет | Причина | Приоритет |
|---|---|---|
| `SERVER_PASS` (пароль VPS) | был в git открытым текстом (вырезан в этом PR) + доступен deploy-джобам Biz Chat | 🔴 немедленно |
| Аварийный/консольный пароль VPS | лежал в `SERVER_ACCESS.md` открытым текстом (вырезан) | 🔴 немедленно |
| `ANDROID_KEYSTORE_*` (upload key) | старый keystore извлекаем из истории git | 🔴 (после Play Console reset, см. RELEASE_SIGNING.md) |
| SMS/OTP (`MOBIZON_API_KEY` и пр.) | были в env deploy-джоб Biz Chat (POTENTIALLY EXPOSED) | 🟠 |
| `PLAY_SERVICE_ACCOUNT_JSON`, прочие repo secrets | были доступны 43 прогонам Biz Chat workflow (POTENTIALLY EXPOSED, own-account) | 🟠 |

Инцидент Biz Chat (STEP 4 req 4): 6 workflow, 43 прогона (26.07 + 01.08), все
`push` под аккаунтом владельца `777ubu-ai` с ветки `claude/biz-chat-inquiry-6v7qi2`.
Стороннего доступа НЕТ (нет `pull_request_target`/fork/внешнего actor). Но джобы
были deploy-типа с доступом к repo secrets → ротация обязательна как
предосторожность. Доп.: удалить ветку `claude/biz-chat-inquiry-6v7qi2`.

Ротацию НЕ считать выполненной без подтверждения смены значений на сервере/в Secrets.
