# iPhone APNs blocker и физическая проверка composer — 09.10.2026

## PRE-FLIGHT
- Branch: fix/route-country-list-20261008; source HEAD: 4bad5b48375fee3d3fd5ef493d8b19fc6a549657; рабочее дерево перед проверкой чистое.
- Scope: read-only диагностика production APNs для нового груза serik, ответ Huawei через UI, измерение поля ввода на Huawei. Бизнес-код и runtime не менялись.
- Known-good: прежний Android push/cleanup относится к 213640023; новая нативная badge-приёмка всё ещё не завершена. Исторический PASS не переносится на iPhone.
- Devices: Huawei com.urtruck.app 213640023; OPPO 213645294; iPhone 1.0.9 (91) по переданному состоянию владельца, USB unavailable.
- Checks: серверные SELECT в SQLite mode=ro, только наличие настроек в env/PM2, существующий EAS APNs credential, реальные UI-сообщения и composer 1–5 строк.
- Rollback: runtime не менялся; собственный тестовый черновик удалён через UI, чужие черновики и сообщения не удалялись. Документ откатывается отдельным revert.

## Новая тестовая комната
- Cargo: a0697b13-7429-4a08-9e5f-e20ba71efaa1; владелец serik.
- Маршрут Хоргос → Нур Жолы → Москва, 15 т, 120 м³, 8888 USD.
- С Huawei отправлена одна ставка 8888 USD; владелец принял её на iPhone.
- Room: c7e06448-4bd8-487b-8002-c0ca92d70b66.
- На Huawei физически видны два сообщения владельца. Через UI отправлены английский контрольный текст (1440) и русский ответ (1441): «Привет! Это Huawei. Как дела? Загрузка завтра в 10:00, стоимость 8888 долларов.»
- Получение этих ответов на iPhone пока не подтверждено владельцем.

## Подтверждённый P1: APNs production не настроен
- iPhone владельца зарегистрирован: platform=ios, provider=apns, enabled=1, app_version=1.0.9.
- Отправки нового предложения и обоих ответов получают error_code=provider_not_configured; Apple delivery не состоялась. Внутренний badge на скриншотах владельца не доказывает native push.
- Все APNS_KEY_ID, APNS_TEAM_ID, APNS_BUNDLE_ID, APNS_AUTH_KEY_P8 отсутствуют в production .env и эффективном PM2-окружении.
- Существующий APNs-ключ найден в EAS @urtruck/urtruck, связан с этим проектом и com.urtruck.app. Приватный P-256 формат проверен. Приём ключа Apple пока не проверен.
- Ключ подготовлен только в приватном временном файле на Mac (директория 0700, файл 0600); секрет не попал в GitHub или отчёт.
- Production APNs/config/restart НЕ выполнялись: отдельное разрешение владельца ещё требуется.
- План применения: проверить прежний env SHA256 5546bb03b85a892872c325fe53e50560bd6a94018756ddc3203c0441d4765822; сделать приватный backup .env и APNs env процесса; добавить только APNs-конфигурацию для production com.urtruck.app; перезапустить только urtruck-security-api; проверить health, неизменность AI-патчей, новое событие через Huawei и ответ APNs; не публиковать сборки.
- Rollback применения: восстановить сохранённый .env и прежние эффективные APNs значения процесса, перезапустить только API и повторить health. Точный backup path зафиксировать при применении.

## Composer: подтверждено на Huawei, iPhone OPEN
| Строк при наборе | Высота поля, px |
| --- | --- |
| 1 | 130 |
| 2 | 187 |
| 3 | 245 |
| 4 | 299 |
| 5 | 299 |
Вставка четырёх строк также показывает все четыре строки. На пятой высота ограничена; визуальное поведение внутренней прокрутки на iPhone требует проверки. Тестовый текст не отправлялся, после проверки поле пустое.
Владелец сообщает ограничение двумя строками на iPhone. Приложенный screenshot показывает однострочный активный черновик, поэтому не позволяет установить причину. Не менять код по догадке. Нужен screenshot/видео поля с 1–5 строками ДО отправки на iPhone; OPPO composer в этом прогоне не проверен.
Evidence на Mac: /private/tmp/urtruck-ios-huawei-20261009 (XML/PNG для ответа, вставки и последовательного набора). Эти временные доказательства не являются долговременным acceptance-архивом.

## Защищённое состояние
Production chat.py SHA256 80619b090b46559587ceb6d3722c1cd308cbd44345d24e4748f7e1fe6ecef080, notifications.py 235871e8dc7ba05d4f43b7e5deb9b52f96bc13ce7797edaa8a37050f6f7ee084, push_gateway.py cbda81eb8a8e5b9c62a617fb5010c9af5577643da1b8543da498d4ce846afe56 совпадают с сохранёнными патчами.
Новых сборок, deploy, merge, изменения исходников, удаления данных или обхода Huawei ID не выполнялось. Полный release gate остаётся BLOCKED.

## APNs применён с разрешения владельца — 09.10.2026, 01:30 Алматы
Эта запись обновляет первоначальный APNs BLOCKED выше: владелец отдельно разрешил подключение существующего ключа к production, backup и перезапуск только API.
- Изменены только APNS_KEY_ID, APNS_TEAM_ID, APNS_BUNDLE_ID, APNS_AUTH_KEY_P8, APNS_USE_SANDBOX=false для com.urtruck.app.
- Guarded script: scripts/ops/configure_production_apns.py. Default READ_ONLY, explicit --apply, guard исходного env SHA и трёх source SHA, приватный backup, проверка signing/HTTP2, health и изоляции AI/остальных процессов, автоматический rollback при неуспехе.
- Автотесты изоляции env, запрета другого bundle/sandbox, отказа при изменённом env, read-only режима, восстановления после сбоя restart и защиты rollback: 6/6 PASS.
- Серверный preflight в фактическом runtime venv: signing/HTTP2/protected sources PASS, затем APPLIED.
- Backup: /home/ubuntu/urtruck-apns-recovery-backups/20261008T203025Z, директорий 0700, файлов 0600. Там сохранён и recovery script.
- Перезапущен только urtruck-security-api. Проверки совпадения AI env и PID/restart_time всех остальных PM2-процессов PASS. PM2 state сохранён после health.
- Public system/info HTTP 200. Неавторизованные badge и voice GET HTTP 401 — защита доступа сохранена.
- Новое сообщение 1442 отправлено физически с Huawei в новую комнату serik: «Проверка push после подключения APNs. Huawei на связи. Время загрузки 10:00, стоимость 8888 долларов.»
- Outbox 306: created_at 2026-10-08 20:31:13 UTC, sent_at 20:31:15 UTC, status=sent, last_error=NULL; APNs delivery log 1895 status=sent, error_code=NULL, пустой error response. Это подтверждает приём отправки APNs, а не визуальную доставку iPhone.
- Зарегистрированное устройство iPhone: last_success_at=20:31:15 UTC, failure_count=0. Старые исчерпавшие попытки события 300/304/305 не переотправлялись и не изменялись вручную.
- Worker считает badge непосредственно при отправке; отсутствие сохранённого поля badge в outbox не является доказательством его отсутствия в APS.
- Серверные chat.py/notifications.py/push_gateway.py и AI-настройки сохранены. Сборки/публичный rollout/QA2/данные приложения не изменялись. Временные копии входного APNs-ключа на Mac и сервере удалены; рабочая конфигурация и EAS credential сохранены.

Точный rollback (выполнять только при необходимости, команда не запускалась):
```sh
/home/ubuntu/urtruck-releases/20260917-be134e0b/venv/bin/python /home/ubuntu/urtruck-apns-recovery-backups/20261008T203025Z/configure_production_apns.py --rollback /home/ubuntu/urtruck-apns-recovery-backups/20261008T203025Z
```
Остаётся OPEN: owner-confirmed banner/lockscreen/icon badge, правильная комната и очистка после чтения iPhone; iPhone composer 1–5 строк; финальная Android push/badge matrix. Полный release gate BLOCKED.


## Подтверждение владельца — 09.10.2026, около 01:37 Алматы
- Владелец подтвердил получение push. На IMG_1964.jpeg виден native badge 3 на иконке UrTruck; на IMG_1965.jpeg в чате видны сообщения Huawei, в том числе 1442 после подключения APNs. Это закрывает первое физическое наблюдение получения и наличия badge на iPhone, а не всю push-матрицу.
- Верхний баннер владелец не наблюдал. Проверка lockscreen/баннера при разрешённых настройках, последовательного роста и сброса badge, правильного deeplink, других комнат и дублей остаётся OPEN.
- Новый screenshot composer показывает двухстрочный активный черновик. Владелец требует рост до четырёх строк и внутреннюю прокрутку далее, как на Android; сообщает ограничение двумя строками. Это приоритетный открытый дефект iPhone. Причину и поведение третьей/четвёртой строки нужно воспроизвести; источник ещё не исправлялся.
- В показанном EN→RU переводе Freight 8888 USD передано как «Груз 8888 USD»: проверить смысл стоимости перевозки/фрахта. Числа 10:00 и 8888 сохранены в этом примере; общий semantic PASS не заявляется.
- Подготовлено отдельное подробное задание: docs/qa/night-audit-assignment-20261009.md. Оно задаёт будущий аудит и не является отчётом о выполненном прогоне. Полный release gate по-прежнему BLOCKED.
