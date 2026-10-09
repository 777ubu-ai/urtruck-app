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
37/37 targeted frontend cases PASS: menu reachability, push/deep-link contracts, GPS action propagation, room-scoped read cleanup, retries/cold-start и сохранение чужих уведомлений. Это source/static/callback проверки, не физическая приёмка. git diff --check PASS. Lint результат записан в локальный лог. Изменён один menu item; новый native build с этим source ещё не запущен.
