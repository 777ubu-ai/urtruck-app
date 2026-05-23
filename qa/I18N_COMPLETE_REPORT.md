# i18n Completion Report — 2026-05-23 ~07:00 UTC

**Branch:** `claude/fix-feedscreen-mycargo-render`
**Commits this session:** 2
  - `31727d5` chore(i18n): salvage overnight edits — 33 new keys in RU + KK
  - `cc6864e` i18n: complete EN + ZH translations — 31 keys per locale

## Coverage table

| Locale | Before (e3e222c) | After (cc6864e) | Added |
|---|---|---|---|
| RU | 1016 | **1047** | +31 |
| KK | 1016 | **1047** | +31 |
| ZH | 1016 | **1047** | +31 |
| EN | 1016 | **1047** | +31 |

`qa:i18n` after `cc6864e`: **all 4 locales × 1047 keys, 0 missing**.

## What was added

33 ключа (комментарий говорил «33» в RU/KK salvage — два из них (`thanks_for_review`, `delete`) уже существовали в EN/ZH под другими именами; парсер их подхватил, поэтому фактических пропусков было 31, что и закрыли).

Покрытые экраны / компоненты:
- `OfflineBanner` — «Нет интернета · работаем из кэша»
- `NotificationsScreen` — заголовок + «Прочитать все» + empty state
- `StatsScreen` — заголовок leaderboard + «балл»
- `AboutScreen` — заголовок + 3 раздела
- `CargoDetail` — payment-pending банка + thanks-for-review
- `WalletScreen` — fx rates section + offline cached warning
- `TrackScreen` — 9 ключей GPS controls + request flow
- `QueueScreen` — border queues title + stats labels + no-data
- `RatingModal` — toast + placeholder
- `DatePicker` — placeholder ДД.ММ.ГГГГ
- `CargoDetail` — delete-cargo Alert + кнопка «Удалить»

## Top-10 ZH terms used (для проверки носителем языка)

| RU термин | Использовал | Альтернатива (отвергнута) |
|---|---|---|
| Груз | 货物 | 货 (слишком коротко) |
| Рейс | 行程 | 飞行 (про самолёты, неверно) |
| Водитель | 司机 | 驾驶员 (формально, но длинно) |
| Грузоотправитель | 货主 | 托运人 (юр. формальный) |
| Маршрут | 路线 | 线路 (про связь) |
| Пункт пропуска / Граница | 边境口岸 | 关口 (старое) |
| Предложить цену | 报价 | 出价 (аукционное) |
| Принять / Отклонить | 接受 / 拒绝 | 同意 / 不同意 (более слабое) |
| Чат | 聊天 | 对话 (диалог формально) |
| Опубликовать | 发布 | 上传 (про файлы) |
| Уведомления | 通知 | 提示 (hint, слабее) |

## Verification

```
$ node /tmp/i18n_audit.js
=== Key counts ===
RU: 1047 keys
KK: 1047 keys
ZH: 1047 keys
EN: 1047 keys

=== Missing vs RU ===
EN: 0 keys missing
KK: 0 keys missing
ZH: 0 keys missing

=== Orphans ===
EN/KK/ZH: 0 orphans each
```

```
$ npm run qa:i18n
[i18n] RU: 1047 keys; missing at call sites: 0
[i18n] EN: 1047 keys; missing at call sites: 0
[i18n] KK: 1047 keys; missing at call sites: 0
[i18n] ZH: 1047 keys; missing at call sites: 0
[i18n] OK
```

```
$ npm run build:web
Exported: dist  (exit 0)
```

## Что НЕ сделано (вне scope этой узкой задачи)

- **Hardcoded строки в JSX** (54 случая в 13 файлах) — это **отдельная задача**. Сейчас закрыт только словарь; чтобы текст реально появился — нужно заменить literal `<Text>Уведомления</Text>` на `<Text>{t('notifications_title')}</Text>` в каждом из 13 файлов.
- **Translate-in-chat backend** — отдельная задача
- **Audit `placeholder=`/`title=`/`Alert.alert` hardcoded** — то же
- **Длинные KZ строки в кнопках BottomNav** — visual regression check на устройстве (`Менің рейстерім` длинее `Мои рейсы`); фикс через `numberOfLines={1}` + `flexShrink: 1` если упрётся в реальный экран
- **Шрифт fallback для CJK** — на TestFlight 14 проверить визуально, что иероглифы рендерятся без квадратиков

## Test plan для владельца (утром)

1. Откой TestFlight build 14 на iPhone с системным RU → UI на RU.
2. Поменяй системный язык iPhone на 中文 (Simplified) → перезайди в app → UI должен переключиться на ZH автоматически.
3. Profile / Settings → переключатель языка (4 опции) → выбери EN → весь UI на EN.
4. Проверь что новые ключи реально видны:
   - В Settings → About → заголовок «About» (или «О проекте» / «Жоба туралы» / «关于项目»)
   - Notifications → пустой список → «No notifications» / «Нет уведомлений» / «Хабарламалар жоқ» / «暂无通知»
   - Wallet → «Exchange rates» / «Курсы валют» / «Валюта бағамдары» / «汇率»
5. Если какие-то экраны всё ещё на русском при выбранном EN/ZH/KK — это **hardcoded literal**, не пропуск ключа (см. отдельную задачу по grep'у hardcoded строк).
