# UrTruck Push Live Checklist

Дата: 2026-08-26  
Цель: собрать device proof для `driver` и `shipper` без двусмысленности.

## Devices

- Device A: Android, store-delivered build
- Device B: iPhone, TestFlight/App Store build

Перед началом зафиксировать:

- device model
- OS version
- app version / build
- role (`driver` / `shipper`)
- user id
- notification permission = granted
- native registration active
- production/source SHA

## Screenshot set per critical event

Для каждого события сохранить:

1. sender action screen
2. system push banner / lock-screen notification
3. app screen after tap
4. bell/in-app notification row
5. badge before open
6. badge after read

Рекомендуемое имя файла:

`{platform}_{senderRole}_to_{recipientRole}_{event}_{state}_{timestamp}.png`

Пример:

`ios_driver_to_shipper_offer_background_2026-08-26T21-15-00.png`

## Required matrix

| Sender | Event | Recipient | Foreground | Background | Cold start | Tap destination | Bell row | Badge +1 | Badge clears | Screenshot set | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|
| driver | offer / `bid_created` | shipper | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | BLOCKED_EXTERNAL |
| shipper | counteroffer / `bid_countered` | driver | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | BLOCKED_EXTERNAL |
| shipper | accept / `bid_accepted` or `deal_created` | driver | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | BLOCKED_EXTERNAL |
| driver | chat message / `chat_message` | shipper | ☐ | ☐ | ☐ | ☐ | n/a (chat source) | ☐ | ☐ | ☐ | BLOCKED_EXTERNAL |
| driver | attachment / `chat_attachment` | shipper | ☐ | ☐ | ☐ | ☐ | n/a (chat source) | ☐ | ☐ | ☐ | BLOCKED_EXTERNAL |
| shipper | chat message / `chat_message` | driver | ☐ | ☐ | ☐ | ☐ | n/a (chat source) | ☐ | ☐ | ☐ | BLOCKED_EXTERNAL |
| shipper | attachment / `chat_attachment` | driver | ☐ | ☐ | ☐ | ☐ | n/a (chat source) | ☐ | ☐ | ☐ | BLOCKED_EXTERNAL |
| shipper | GPS request / `tracking_request` | driver | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | BLOCKED_EXTERNAL |
| driver | GPS approved / `tracking_approved` | shipper | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | BLOCKED_EXTERNAL |
| driver | GPS declined / `tracking_declined` | shipper | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | BLOCKED_EXTERNAL |
| driver | trip started / `deal_status=in_progress` | shipper | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | BLOCKED_EXTERNAL |
| driver | delivered / `deal_status=delivered` | shipper | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | BLOCKED_EXTERNAL |
| shipper | received / `deal_status=received` | driver | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | BLOCKED_EXTERNAL |
| system | completed / `deal_status=completed` | other party | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | BLOCKED_EXTERNAL |
| system | cancelled / `deal_status=cancelled` | other party | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | BLOCKED_EXTERNAL |

## Deep-link acceptance

После tap notification должен открываться:

- `bid_created` → карточка груза/рейса с конкретной ставкой
- `bid_accepted` / `deal_created` → карточка заказа / сделки
- `chat_message` / `chat_attachment` → правильная room / deal chat
- `tracking_*` → сделка с `action=tracking`
- `deal_status=*` → правильная карточка заказа / сделки

## Bell / in-app acceptance

Для business notifications (`bid_*`, `deal_*`, `tracking_*`) проверить:

- запись есть в колокольчике;
- открытие правильного экрана помечает её прочитанной;
- чужие notifications не появляются у другого пользователя.

## Badge acceptance

Проверить отдельно:

- unread event → badge +1;
- повторный одинаковый event не даёт duplicate +1;
- открытие нужной сущности уменьшает только релевантный unread;
- logout/login не переносит badge между пользователями.

## Artifact ledger

В отчёт приложить:

- screenshot paths
- video paths
- event timestamp
- backend `push_log` reference, если доступен
- PASS / FAIL / BLOCKED_EXTERNAL
