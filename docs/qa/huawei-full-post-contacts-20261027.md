# Полный исходный пост и контакты — Huawei / QA2

## PRE-FLIGHT

- Branch: `fix/telegram-full-post-contacts-20261027`; base SHA `80b5d3b1beaef5944cb8841df64d6d86b4ce5c87`.
- Known-good: Huawei `GRL_AL10`, `com.urtruck.app.qa2`, `1.0.9-qa2` / `214494471`; текущая проверка показала раскрытие серверного `original_text`. Полнота текста до исправления FAIL. Production SHA UNKNOWN.
- Scope: парсер, importer adapter, сохранение `original_text`, версии повторного разбора, адресные backend-тесты. UI и бинарник не меняются. Graphify AST выполнен; generated graph удалён.
- Protected: production, исходный Telegram, бизнес-данные, авторизация, чат, сделки, GPS.
- Checks: source↔card read-only audit; parser→adapter→HTTP importer→public API regression; длинный Unicode source; удаления/скрытия; физическое раскрытие Huawei после QA2 deploy.
- Rollback: отдельный commit; штатный QA2 code backup и возврат к base SHA. Перед восстановлением карточек скрипт сохраняет приватный JSONL `before`/`after` с правами 0600; точечный обратный импорт `before` после проверки отсутствия новых правок. Исходная Telegram-БД открывается только read-only. Скрипт по умолчанию dry-run, допускает только QA2 и существующие active identity.

## Подтверждённая причина

Read-only sample 500 свежих active-карточек: 194 короче исходного поста; 138 без card contacts; у 20 из них phone parser находит телефон в полном source. Пример source `2105859576/315155`: source 1295 символов, первые блоки 116–127, общий телефон перед строкой `Telegram, WhatsApp` отброшен из предыдущих маршрутов. Сбор QA2 фактически `incoming`; owned collector в runtime не включён.

## Изменение

Разбор полей и классификация используют локальный блок. Полный неизменённый пост передаётся в `source_text`; DAL сохраняет его в существующем `original_text`, который уже раскрывается старым Huawei и iPhone. Контакт перед завершающей строкой платформ остаётся общим footer. При source deletion полный текст тоже удаляется из payload. БД-схема не меняется. Штатный importer сохраняет ID, закладки, исходную дату/expiry и hidden/closed состояния.

## Проверки и rollout

Результаты CI, QA2 восстановления и физической проверки дополняются по мере выполнения.

- Целевые backend проверки: **145 passed**, 3 существующих deprecation warnings. Проверена цепочка parser → durable adapter → HTTP importer → public API: оба маршрута остаются active с локальной ценой и полным исходником. Некорректный/слишком длинный source_text отклоняется; 20 000 Unicode-символов проходят adapter без обрезки. Повтор удаления source не оставляет контакты в source_text.
