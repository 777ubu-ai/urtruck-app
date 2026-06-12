# P2-7 — Rate-limit на POST /cargos: отчёт о gap

**Дата:** 2026-06-12 · **Метод:** `scripts/stress_cargos_ratelimit.sh` + ревью кода.
**Вывод:** ⚠️ **GAP подтверждён** — на `POST /api/v1/market/cargos` нет троттлинга. Backend по задаче **не правим**, только документируем.

## 1. Эмпирика

Зонд (без Authorization → 401 ещё до бизнес-логики, **в БД ничего не создаётся**):

| Запросов | Цель | Результат |
|---|---|---|
| 100 | `https://urtruck.kz/security/api/v1/market/cargos` | `401 ×100`, **429 — 0** |
| 150 | то же (выше дефолтного порога 120/мин) | `401 ×150`, **429 — 0** |

429 не встретился ни разу, в т.ч. выше порога 120 запросов — значит лимит не срабатывает.

## 2. Подтверждение на уровне кода

- `backend/api/marketplace.py:336` — `create_cargo(body, user=Depends(require_level(1)))`. Зависимостей-троттлеров нет (только проверка уровня доступа).
- `backend/api/middleware.py:18` — функция `rate_limit(request, limit=120, window=60)` (120 req/min/IP через Redis) **существует**, но:
  - не подключена как глобальный middleware (в `main.py` навешаны только `CORSMiddleware`, `MetricsMiddleware`, `SecurityHeadersMiddleware` — `rate_limit` среди них нет);
  - работает только при поднятом Redis (`REDIS_OK`), иначе молча `return`.
- Точечные лимитеры из `backend/api/rate_limit.py` (`limit_otp_send`, `limit_otp_verify`, `limit_guest_create`) применены к OTP и `/register/guest` (`registration.py:79`), но **НЕ** к marketplace-эндпоинтам.
- `backend/cgr/client.py` обрабатывает 429 — это про **исходящие** запросы к CGR, к нашему endpoint отношения не имеет.

**Итог:** инфраструктура для лимитов в проекте есть, но к write-эндпоинтам маркетплейса (`/cargos`, по аналогии вероятно `/trips`, `/bids`) не применена.

## 3. Риск

- Severity: **P2** (для пилота некритично — endpoint под auth-гейтом, аноним создать груз не может; спам возможен только авторизованным пользователем).
- Вектор: авторизованный аккаунт может массово постить грузы (засорение ленты, нагрузка на SQLite-writes).

## 4. Рекомендация (вне рамок текущей задачи — только фиксация)

Минимальный фикс, когда дойдут руки (НЕ в этой ветке):
1. Применить существующий лимитер к write-эндпоинтам, напр. в `create_cargo`/`create_trip`/`createBid` добавить зависимость на `rate_limit` (per-user, не per-IP — ключ от `user["id"]`), порог ~10–20 публикаций/мин.
2. Либо навесить `rate_limit` глобальным middleware в `main.py` (но тогда нужен гарантированно живой Redis + аккуратный порог, чтобы не бить легитимный трафик ленты).
3. Воспроизводить регресс этим же скриптом: `scripts/stress_cargos_ratelimit.sh <url> <N>` → ожидать `RESULT: ✅` после фикса.

## 5. Как перепроверить

```bash
scripts/stress_cargos_ratelimit.sh                                   # прод, 100
scripts/stress_cargos_ratelimit.sh https://urtruck.kz/security/api/v1/market/cargos 150
# Безопасно: без токена все запросы = 401, грузы не создаются.
```
