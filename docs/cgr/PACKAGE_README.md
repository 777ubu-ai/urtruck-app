# CGR Integration Package — для Claude Code CLI

**Дата:** 28 мая 2026
**Версия:** v1.1
**Адресат:** Claude Code CLI на маке Бахитжана
**Назначение:** документация для разработки модуля интеграции UrTruck ↔ CarGoRuqsat (Поток А)

---

## ЧТО В ПАКЕТЕ

| Файл | Назначение |
|------|------------|
| `ARCHITECTURE_NOTES.md` | **Читать первым.** Контекст, принципы, решения, анти-скоп |
| `TZ-CGR-001-v1.1.md` | Основное ТЗ — что и как делать (14 дней работы) |
| `QA_CHECKLIST_CGR-v1.1.md` | Чеклист приёмки для Перизат и Данияра с proof-of-fix |

---

## КУДА ПОЛОЖИТЬ В РЕПОЗИТОРИИ

После создания ветки `feature/cgr-stream-a` сложить файлы в `docs/cgr/`:

```bash
mkdir -p docs/cgr
cp /path/to/package/ARCHITECTURE_NOTES.md docs/cgr/
cp /path/to/package/TZ-CGR-001-v1.1.md docs/cgr/
cp /path/to/package/QA_CHECKLIST_CGR-v1.1.md docs/cgr/QA_CHECKLIST_CGR.md
git add docs/cgr/
git commit -m "docs(cgr): add TZ v1.1, QA checklist, architecture notes for Stream A"
```

---

## КАК ИСПОЛЬЗОВАТЬ

### Шаг 1 (день 0): мерж веток
- Сделать PR из `claude/epic-goodall-7dR7Z` в `main`
- Бахитжан синхронизирует локальную копию
- Создать ветку `feature/cgr-stream-a` от свежего `main`
- Положить эти три файла в `docs/cgr/`, закоммитить

### Шаг 2 (день 1): разведка
- Прочитать `ARCHITECTURE_NOTES.md` целиком
- Прочитать раздел 1 в `TZ-CGR-001-v1.1.md`
- Выполнить разведку cgr.qoldau.kz (6 пунктов)
- Создать `docs/cgr/CGR_DISCOVERY.md` с результатами
- **Не писать продакшен-код, пока разведка не закончена**

### Шаг 3 (день 2): подготовка фундамента
- Установить пакеты: `sentry-sdk[fastapi]`, `tenacity`, `pydantic-settings`, `beautifulsoup4`, `lxml`
- Создать `backend/database/schemas/cgr_schema.sql`
- Добавить `init_cgr_schema()` в `backend/database/init_schemas.py`
- Сделать seed `border_checkpoints` из захардкоженного `BORDERS`
- Удалить хардкод `BORDERS = [...]` из `backend/services/border_service.py`
- Создать каркас `backend/cgr/`

### Шаг 4-13: реализация по плану в разделе 8 ТЗ

### Шаг 14: QA по чеклисту
- Перизат проверяет все 10 разделов чеклиста
- Без подписи не релизим

---

## ВАЖНО

**Перед тем как начать что-то делать:**
1. Прочитать `ARCHITECTURE_NOTES.md` целиком (это 10 решений и анти-скоп)
2. Подтвердить Бахитжану через сессию claude.ai, что вопросов нет
3. Только потом приступать к Шагу 2

**Если возник вопрос «можно ли вот так?»** — сначала проверить раздел «АНТИ-СКОП» в `ARCHITECTURE_NOTES.md`. Если ответа нет — эскалировать.

**Все запросы к CGR:**
- Только GET к публичным URL
- User-Agent честный: `UrTruck/1.0 (+https://urtruck.kz; partner-integration)`
- С IP 185.22.65.11 (наш VPS), без прокси
- С rate limit'ом по результатам разведки
