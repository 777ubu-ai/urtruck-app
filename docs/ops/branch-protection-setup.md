# Issue #278: Настройка защиты ветки main

> **Кто выполняет:** владелец репозитория (admin) в GitHub UI  
> **Зачем:** прямой push в main не должен быть нормальным способом релиза.
> Все изменения идут через PR → CI → merge.

## Шаги

### 1. Перейти в Settings → Branches → Branch protection rules → Add rule

**Branch name pattern:** `main`

### 2. Включить следующие настройки

| Настройка | Значение |
|---|---|
| ✅ Require a pull request before merging | |
| &nbsp;&nbsp;&nbsp;Required approvals | 1 (или 0 для команды из 1 человека) |
| ✅ Require status checks to pass before merging | |
| &nbsp;&nbsp;&nbsp;Require branches to be up to date | ✅ |
| ✅ Do not allow bypassing the above settings | (даже admin идёт через PR) |
| ✅ Block force pushes | |
| ✅ Restrict deletions | |

### 3. Добавить обязательные CI-проверки (status checks)

В поле «Search for status checks» добавить **все четыре**:

```
Backend tests                   ← pr-quality-gate.yml
Frontend tests and build        ← pr-quality-gate.yml
QA Center quick gate            ← qa-center.yml
Maestro flow contract           ← qa-center.yml
```

> **Важно:** проверки появятся в списке только после того, как хотя бы один PR
> с этими workflow уже прошёл. Если список пуст — создайте тестовый PR,
> дождитесь прогона CI, затем вернитесь в настройки.

### 4. Рекомендуемые дополнительные настройки

| Настройка | Комментарий |
|---|---|
| Require conversation resolution | Все комментарии ревью закрыты перед merge |
| Require linear history | Squash-merge, чистая история |
| Allow auto-merge | Удобно для зелёных PR |

### 5. Существующий CI-пайплайн после merge

```
push main → UrTruck Deploy (release-gate)
                ↓ (on success)
         UrTruck Secure Production Deploy
              (environment: production)
```

Deploy срабатывает автоматически при merge в main. Отдельная кнопка
`workflow_dispatch` позволяет запустить его вручную.

## Проверка

После настройки попробуйте `git push origin main` напрямую — должен быть
отклонён с ошибкой `protected branch hook declined`.

## Что НЕ нужно делать

- Не добавлять `full-qa-audit` в обязательные — он слишком тяжёлый для каждого PR
- Не отключать `cancel-in-progress` в PR workflows — это экономит CI-минуты
- Не давать bypass никому, включая admin, на этапе пилота
