# Push: событие видно снаружи, но не находится внутри — 9 октября 2026

## PRE-FLIGHT
Branch fix/push-inbox-reachability-20261009 от cda3bc8; база включает ночной b6167e6b и отдельный cooldown PR #509. Known-good: владелец подтверждает iPhone push/badge; установленная на его iPhone версия и серверный SHA UNKNOWN. Scope: одна menu entry ProfileScreen, контрактный тест и этот отчёт. Защищены 4 вкладки/3 категории сделок, отсутствие колокольчика в шапке, размеры и дизайн флагов/карточек, AI/APNs/FCM, unread formula/read APIs, авторизация, GPS, production runtime и данные устройств. Rollback: откатить отдельный commit, runtime не менялся.

## Причина и граница доказательства
Владелец прислал badge 13 и вкладки Предложения/В работе/Архив без понятного непрочитанного события. Production read-only для известного водителя Карго Федя: 13 unread notifications (reminder=10, no_bids=3), unread deal-chat messages=0. Число совпадает со снимком, но фактический session ID iPhone не проверен, поэтому соответствие аккаунта снимка является гипотезой. Напоминания имеют URL /; no_bids имеют /trips/ID. Серверный dashboard уже содержит unread_count и message preview; проблема отсутствия этих колонок не воспроизводится.

В исходниках существующий NotificationsScreen показывает durable entries и умеет read/read-all + обновление badge. Его маршрут зарегистрирован для обеих ролей, но единственный вход из App.js — deep link /notifications. Menu entry Profile отсутствует. Deals показывает только bids/deals, поэтому generic reminders невозможно найти оттуда. Это доказанный разрыв доступности существующей ленты, а не дефект доставки APNs.

## Архитектурное решение в рамках нового запроса владельца
Владелец 09.10 явно просит довести возможность найти полученный push внутри приложения. Прежний тест запрещал пункт Notifications в Profile; этот запрет теперь конфликтует с требуемой доступностью напоминаний. Восстановлен один авторизованный menu entry «Уведомления» через существующий локализованный ключ. Нет нового таба/счётчика/Profile read-all/колокольчика в шапке. Сделки и чаты продолжают использовать прежние маршруты. NotificationsScreen и backend не переписаны.

Graphify AST-only выполнен перед изменением: 10646 узлов, 23568 связей. SQL parser не установлен для 19 файлов, два Gradle syntax warnings; эти области не изменяются. Проверены HeaderMenuButton → Profile, обе Stack регистрации Notifications, menu handler и API-auth. Сгенерированный graphify-out удалён после анализа.

## Acceptance
Путь ☰ → Уведомления должен показать напоминания и события с иконки. Открытие Profile само по себе не читает их. Тап по событию читает его и открывает его URL, «Прочитать всё» остаётся явным действием. Нужны физические iPhone/Android проверки доставки, меню, unread/badge и account switch. Старые / напоминания видны в ленте; для них отдельной сделки не существует. Нельзя обещать, что значок 13 станет 0 до реального чтения/серверного подтверждения.

## Push infrastructure
Сначала закрыть доступность/маршрутизацию/counters и provider receipts. APNs/FCM остаются транспортом; новый сервер или внешний broker не исправляет скрытую ленту. Решение о новом сервисе принимается по замерам потерь/latency/errors/retries, а не по величине badge. Полная physical acceptance остаётся OPEN.

## Проверки кандидата
37/37 targeted frontend cases PASS: menu reachability, push/deep-link contracts, GPS action propagation, room-scoped read cleanup, retries/cold-start и сохранение чужих уведомлений. Это source/static/callback проверки, не физическая приёмка. git diff --check PASS. Lint PASS: 483 active JavaScript files; локальный лог сохранён. Изменён один menu item; новый native build с этим source ещё не запущен.


## Production provider telemetry — 2026-10-09, 14:35 Almaty

Read-only inspection found 579 APNs failed attempts with `provider_not_configured` in the preceding 24 hours; these are attempts, not a count of unique lost messages. The last failure was 2026-10-09 04:00:05 UTC (09:00 Almaty). Later APNs `chat.message` sends were accepted at 05:23:13–16 UTC. No device delivery receipt was present for these APNs rows. Pending/processing/retry outbox rows were absent at inspection.

The running production API has all four required APNs environment values present; only booleans were inspected. Its process started on October 8 at 20:30:27 UTC. The QA2 process uses a separate database, so it has not been established as the cause. The historical failure source remains unresolved. No production configuration was changed or restarted during this inspection; no secrets or OTP values were copied into this report.

Android validation run 37911102249 and iOS candidate run 37910804163 were still building at the latest check. The Android validation source contains the MapKit compatibility changes; the combined final branch additionally includes OTP cooldown and notification-menu fixes and has not yet completed a native Android build. Public publication is not complete.
