# Simulator + local backend — push/deal lifecycle verification (28.08.2026)

Полный цикл сделки (bid→accept→chat→trip_started→delivered→received)
прогнан живьём в iOS Simulator (Expo Go) против локального backend
(порт 8001, немоканный код marketplace.py/chat.py/notifications.py/
push_sender.py). 6/6 чекпоинтов push/notification PASS на двух осях:
(A) backend-truth — curl к /api/v1/notifications, /api/v1/push/info
(B) UI-truth — бейджи/статусы в самом приложении
(C) системный push-баннер — не проверялось: Expo Go SDK 52 не поддерживает
реальный push-баннер (документированное ограничение), это не баг продукта.

Также подтверждён живьём P0-2 fix (auto-visible route preview,
DealWorkspaceScreenV2).

Побочные находки (не баги продукта):
- EXPO_PUBLIC_YANDEX_MAPS_JS_API_KEY отсутствует локально →
  full-screen карта не крашится, но тайлы не грузятся.
- Native iOS confirm-диалоги не матчатся Maestro tapOn по regex —
  сработал тап по координатам.

ЭТО НЕ физическое устройство и НЕ production. Статус PR #313 остаётся
BLOCKED BY OWNER ACTION до реальной проверки на телефоне.
