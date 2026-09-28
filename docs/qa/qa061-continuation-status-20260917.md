# QA061 — точка продолжения

17.09.2026, 12:59 UTC. Release verdict: BLOCKED.

Исправления чата сохранены в этой ветке: 2be57c5df8a5e52a5f9f80ad13278154fd5f159d. Исправлены сообщения под клавиатурой и локализация системного превью сделки.

Проверки: frontend 694/694, backend 865/865, lint, i18n и web build PASS. Это не physical acceptance.

QA061 build: https://github.com/777ubu-ai/urtruck-app/actions/runs/35223340060 . Последний подтверждённый статус: Gradle in_progress; Firebase и MapKit build configuration прошли. Artifact не получен, установка не выполнялась.

Remote Desktop Commander перестал отвечать. Команда обновления API была запущена до потери связи; её итог не получен. После восстановления сначала проверить результат и фактическое состояние сервиса. Не повторять deploy вслепую и не объявлять его завершённым.

После получения APK проверить manifest и подпись, обновить приложение с сохранением данных, повторить keyboard/history/preview на устройствах. Далее: новые реальные voice 55–60 секунд в обе стороны, RU↔ZH, relaunch/cache без повторного provider call, native push и слышимый звук. Доставка уведомления и запись Android о звуковом сигнале не заменяют проверку слышимости.

Текущие данные приложения и QA evidence сохраняются. Общий Android/iOS release acceptance остаётся открытым.
