# CGR_DISCOVERY.md — Разведка cgr.qoldau.kz (этап 1 ТЗ-CGR-001 v1.1)

**Статус:** ⚠️ **ЗАГОТОВКА — требуется ручная разведка Сергеем.**
**Причина:** автоматическая разведка из облачного окружения Claude Code (не-KZ IP, anti-bot пул) заблокирована — все 6 целевых URL вернули **HTTP 403 Forbidden**.

```
Tested URLs:
  https://cgr.qoldau.kz/robots.txt                              → 403
  https://cgr.qoldau.kz/ru/start                                → 403
  https://cgr.qoldau.kz/ru/registry/scoreboard                  → 403
  https://cgr.qoldau.kz/ru/registry/public-list                 → 403
  https://cgr.qoldau.kz/ru/registry/wa-history/list?flStatus=Active → 403
  https://cgr.qoldau.kz/ru/information/blocked-users            → 403
```

**Что это значит:**
1. Парсер из бэкенда UrTruck (с production VPS `185.22.65.11` — KZ IP) **скорее всего** не получит 403. Этот блок — реакция на не-KZ-IP, не на user-agent. Проверим первым же запросом из staging.
2. Сергей должен выполнить разведку **локально** в браузере с DevTools (`Cmd+Opt+I` → Network), либо `curl --resolve` через KZ-прокси, либо с VPS через SSH.

**Дедлайн заполнения:** до начала этапа 2 ТЗ (схема БД). Этот файл — **обязательное предусловие** для парсеров (`backend/cgr/parsers.py`).

---

## Шаблон для заполнения

Заполняй пункты 1.1-1.6. Удали `[TODO]` после ответа. Если поле отсутствует — напиши `n/a`. Сохраняй сырые ответы CGR в `backend/tests/cgr/fixtures/` (HTML/JSON), они станут основой unit-тестов парсеров.

---

### 1.1. Онлайн-табло `/ru/registry/scoreboard`

**Рендеринг (SSR / AJAX / гибрид):** [TODO]

**Если AJAX:**
- Endpoint URL: [TODO]
- Method: [TODO] (`GET` / `POST`)
- Headers (особенно `Accept`, `X-Requested-With`, кастомные): [TODO]
- Формат ответа: [TODO] (`application/json` / `text/html` / `application/xml`)
- Пример ответа (короткий, без чужих ПДн): [TODO — сохранить в fixtures/scoreboard_response.json]

**Если SSR:**
- CSS-селектор строки таблицы / карточки: [TODO]
- Поля в строке (название + селектор):
  - Имя ПП: [TODO]
  - Очередь: [TODO]
  - Время ожидания: [TODO]
  - Направление (in/out): [TODO]

**Реальные имена 8+ погранпереходов как пишет CGR (важно для seed `border_checkpoints`):**

| Code (наш) | Name CGR (ru) | Name CGR (kz) | Name CGR (cn) | Comment |
|---|---|---|---|---|
| khorgos  | [TODO] | [TODO] | [TODO] | KZ↔CN |
| dostyk   | [TODO] | [TODO] | [TODO] | KZ↔CN |
| kolzhat  | [TODO] | [TODO] | [TODO] | KZ↔CN (может писаться «Калжат» или «Кольжат») |
| bakhty   | [TODO] | [TODO] | [TODO] | KZ↔CN |
| sagarchin| [TODO] | [TODO] | [TODO] | KZ↔RU |
| zhaysan  | [TODO] | [TODO] | [TODO] | KZ↔RU |
| zhibek   | [TODO] | [TODO] | [TODO] | KZ↔UZ (Жибек Жолы) |
| korday   | [TODO] | [TODO] | [TODO] | KZ↔KG |
| (доп.)   | [TODO] | [TODO] | [TODO] | если CGR публикует больше |

**Заметка из памяти Бахитжана:** в коде сейчас 8 переходов. По его памяти должны быть ещё Кайрак (KZ-RU), Черняевка (KZ-UZ), Карасу (KZ-KG) — проверить, есть ли они у CGR.

---

### 1.2. Реестр бронирований `/ru/registry/public-list`

**Формат страницы:** [TODO] (HTML table / JSON / гибрид)

**Публично доступные поля по каждой брони:**
- Номер брони: [TODO] (формат: пример + regex)
- ГРНЗ (гос. номер ТС): [TODO]
- Дата создания: [TODO]
- Статус: [TODO] (список возможных значений)
- ПП: [TODO]
- **ФИО водителя:** [TODO — да/нет, если да — фиксируем как PII]
- **ИИН водителя:** [TODO — да/нет]

**Поиск по номеру брони:**
- URL-параметр: [TODO] (например, `?booking=XXX` или `?q=XXX`)
- Пример URL: [TODO]

**Пример реальной брони (без ПДн третьих лиц — придумать тест-номер):** [TODO]

**Regex валидации формата номера на бэкенде:** [TODO — например, `^\d{3}-[A-Z]{3}-\d{4}$`]

---

### 1.3. АТС в зоне ожидания `/ru/registry/wa-history/list?flStatus=Active`

**Поля:**
- ГРНЗ: [TODO]
- Время прибытия в зону: [TODO]
- Ожидаемое время выезда: [TODO]
- Позиция в очереди: [TODO]
- Другое: [TODO]

**Поиск по ГРНЗ:** [TODO] (есть/нет URL-параметра)

**Пагинация:** [TODO] (offset-based / cursor / нет)

---

### 1.4. Заблокированные пользователи `/ru/information/blocked-users` 🔴 КРИТИЧНО для PII

**Какие поля публикуются (отметить ✅/❌):**
- [ ] ИИН (12 цифр)
- [ ] ФИО полное
- [ ] ФИО маскированное (например, «И*** И. И.»)
- [ ] ГРНЗ
- [ ] БИН компании (12 цифр)
- [ ] Дата блокировки
- [ ] Причина блокировки
- [ ] Срок блокировки
- [ ] Другое: [TODO]

**Формат страницы:** [TODO] (HTML table / JSON)

**Сколько записей на первой странице:** [TODO]

**Есть ли пагинация:** [TODO]

**Алгоритм матчинга (определяется по факту):**
- Если опубликован ИИН → точный матчинг по `SHA256(ИИН + CGR_IIN_SALT) == iin_hash`
- Если опубликован ГРНЗ → точный по нормализованному номеру
- Если только ФИО → fuzzy через SQLite `LIKE` + Левенштейн на коротком списке

---

### 1.5. robots.txt и Terms of Service

**robots.txt (сырое содержимое):**
```
[TODO — вставить полностью]
```

**Terms of Service:**
- URL: [TODO] (обычно внизу `/ru/start`)
- Цитата релевантного пункта про парсинг / автоматический доступ / редистрибуцию: [TODO]
- Вердикт: 🟢 разрешено / 🟡 серая зона / 🔴 явно запрещено

**Если 🔴 — остановиться и эскалировать тех. лиду.** Парсинг при явном запрете — основание для иска и блокирует Поток Б (Smart Bridge).

---

### 1.6. Rate limit

**Метод тестирования:** последовательные `curl --max-time 5` запросы с интервалами 1с / 0.5с / 0.2с

**Найденный порог 429:** [TODO] (запросов/мин до первого 429)

**Рабочий порог в `cgr_settings.rate_limit_requests_per_min`:** [TODO] (= порог / 2)

**Header `Retry-After` в ответе 429:** [TODO] (присутствует / нет, секунд)

---

## После заполнения

1. Сохранить сырые ответы CGR в `backend/tests/cgr/fixtures/` (3-5 файлов)
2. Обновить `backend/cgr/parsers.py` — заменить TODO-заглушки на реальные парсеры
3. Обновить `backend/cgr/schemas.py` — Pydantic-модели с точными полями
4. Обновить `backend/cgr/settings.py` → `rate_limit_requests_per_min` по результату 1.6
5. Закоммитить разведку: `git commit -m "discovery(cgr): заполнен CGR_DISCOVERY.md"`
6. Только после этого — продолжать день 2+ плана ТЗ
