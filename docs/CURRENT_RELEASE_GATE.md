# UrTruck — release-gate: статус на конец Track B (2026-09-08)

> Справочный чеклист, не замена самому финальному инженерному спринту.
> Отражает только то, что Track B (product/frontend architecture) реально
> проверил и может подтвердить фактами. Backend/CI-инфраструктура (Track A)
> и security/QA-forensics (Track C) — их собственная зона, статусы здесь
> помечены как непроверенные Track B, а не как PASS/FAIL.

## Легенда
- ✅ проверено Track B, реально проходит (команда указана)
- ⚠️ проверено Track B, честно проваливается — решение за владельцем
- ◻️ вне зоны Track B — нужен статус от Track A/C, не проверялось здесь

## Frontend/product (Track B)

| Проверка | Статус | Команда |
|---|---|---|
| Юнит-тесты сделки/FSM (мигрированы с мёртвого кода) | ✅ 23/23 | `node --test tests/frontend/rc1_deal_fsm_static.mjs tests/frontend/rc1_deal_fsm_static.test.mjs tests/frontend/test_deal_room_auto_map.mjs tests/frontend/test_map_chat_integration.mjs tests/frontend/test_shipper_inprogress_auto_map.mjs tests/frontend/test_vehicle_weight_routing.mjs` |
| `tests/frontend/` полный набор (глоб находит 47 из известных ~74+ файлов — см. остаток ниже) | ✅ 47/47 | `node --test tests/frontend/` |
| Доп. deal-related файлы вне глоба | ✅ 24/24 | `node --test tests/frontend/task2_driver_unified.test.mjs tests/frontend/test_deal_workspace.mjs` |
| `tests/unit/` (theme resolve, deal status order) | ✅ | `node tests/unit/dealStatusOrder.test.mjs && node tests/unit/themeResolve.test.mjs` |
| i18n симметрия/raw-key (существующий инструмент, не новый) | ✅ 0 пропусков | `node qa/utils/i18nSmoke.js` |
| ZH/KK product-rule (не откатываться на RU) | ✅ | `node qa/utils/zhLocalizationSmoke.js` |
| Theme WCAG-контраст | ⚠️ **4 честных FAIL** (см. `CURRENT_ENGINEERING_CANON.md` п.2) | `node qa/utils/themeContrastSmoke.js` |
| Admin XSS regression | ✅ 17/17 | `cd backend && python -m pytest tests/test_admin_xss_escaping.py` |
| Синтакс-чек изменённых JSX-файлов | ✅ babel parse OK | см. коммиты Track B |

**Важно:** `node --test tests/frontend/` без явного списка файлов
находит только 47 из значительно большего числа файлов в этой директории.
Это НЕ протестировано Track B как проблема CI (это зона Track A / A3 —
"test file → workflow → runs automatically Y/N"), но флагуется здесь как
факт, который Track A должен явно учесть при построении test inventory.

## ⚠️ Требует решения владельца перед релизом

1. **4 WCAG-контраста, честно проваливающиеся** — `#E06D00`/`#EF4444`/`#3478D4`/`#FF8400`
   не проходят свои пороги в реальных местах использования (детали —
   `CURRENT_ENGINEERING_CANON.md` п.2). Не исправлено намеренно: замена
   брендовых hex — не инженерное решение, а дизайн-решение.
2. **Осиротевший маршрут `TrackTruck`** — оставить, удалить или
   переиспользовать (`CURRENT_PRODUCT_CANON.md` п.2.2).
3. **Недостижимая кнопка звонка** в `DealWorkspaceScreenV2.js` — добавить
   вход в call-menu, либо явно удалить неиспользуемый modal
   (`CURRENT_PRODUCT_CANON.md` п.3).
4. **7 живых экранов с параллельными COPY-словарями** — консолидировать в
   `i18n.js` или явно принять как постоянный паттерн
   (`CURRENT_ENGINEERING_CANON.md` п.5).

## ◻️ Вне зоны Track B — статус от других треков

Backend unit/integration/security, CI workflow coverage, P0/P1 auto-fail
gate, npm/pip audit, Android keystore rotation, off-site backup + schedule,
production smoke, physical QA (Android×2 + iPhone), security/IDOR gate —
всё из разделов 6-10 мастер-спека, не принадлежащее Track B. См. отчёты
Codex (Track A) и Kimi (Track C) для их статуса.

## Что Track B НЕ делал (по правилам спринта)

- Не мержил в `main`, не деплоил, не трогал production credentials/signing.
- Не удалял ни один файл, помеченный как мёртвый (только задокументировал).
- Не менял хардкод-цвета, чтобы искусственно "починить" WCAG FAIL.
- Не мигрировал 7 живых COPY-словарей в центральный `i18n.js` (риск
  крупной миграции за один коммит — сознательно только заинвентаризировано).
