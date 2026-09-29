# QA2 RC 9.5 — план доказательств на двух Xiaomi

Статус документа: подготовка. Не является доказательством физического PASS.

## Границы

- Целевой контур: только QA2, пакет `com.urtruck.app.qa2`.
- Устройства: Xiaomi A (грузоотправитель, RU) и Xiaomi B (водитель, ZH).
- Исключено: `main`, production, OPPO и `com.urtruck.protest`.
- Установка допускается только через `adb -s <serial> install -r`; `uninstall`,
  очистка данных, удаление аккаунтов и БД запрещены.
- Начало физического прогона: только после независимого APPROVED всех исходных
  PR, успешного Quality Gate итогового candidate SHA, QA2 deploy того же SHA,
  валидной FCM readiness и новой APK с `versionCode > 211040089`.

## Идентификация кандидата

Для каждого результата записывать: UTC-время, итоговый integration SHA, build
run и artifact ID, SHA-256 ZIP и APK, package, versionName, versionCode,
targetSdk, signing certificate, runtime SHA Web/Backend/AI. Указывать отдельно
APK, установленную на каждом Xiaomi, включая SHA-256 `base.apk`.

Имена файлов: `<utc>_<device>_<block>_<step>.<ext>`.
Пример: `20260929T182300Z_xiaomi-a_push_background_offer.png`.

## До установки

1. Сверить Web/Backend/AI SHA с итоговым candidate и `/health`, `/api/version`.
2. Проверить QA2 FCM: проект, package, provider=FCM, `gateway.ready=true`,
   отдельные токены двух Xiaomi. Не выводить и не сохранять `QA_AGENT_TOKEN`.
3. В защищённом QA2 процессе read-only зафиксировать `MAX(push_outbox.id)` как
   `cutoff_id`. После него допускаются только новые явно созданные события.
   Worker/drain старых строк до cutoff запрещён.
4. Зафиксировать `routing.provider`, конфигурацию реального поставщика и CGR
   ответы для Хоргос/Нур Жолы, Достык/Алашанькоу, Бахты/Бакту. `none`, 404 и
   503 не маскировать: это BLOCKED или FAIL.

## Матрица физического прогона

| Блок | Xiaomi A (RU) | Xiaomi B (ZH) | Артефакты |
| --- | --- | --- | --- |
| Установка/запуск | identity, launch, первый экран | identity, launch, первый экран | screenshot, package dump, APK SHA |
| Сделка | создать/принять/received/review | feed/bid/start/delivered/review | IDs, HTTP-коды, видео |
| Чат | RU, EN, PDF/JPG, offline retry | ZH, voice, playback | screenshots, API timings |
| Текстовый перевод | кнопка, cache, relaunch | кнопка, cache, relaunch | origin+translation, latency CSV |
| Голос | playback/translation результата | 2 RU и 2 ZH записи 8–12 с | recording, transcript, STT/translation latency |
| Push | foreground/background/killed/locked | foreground/background/killed/locked | system screenshot, redacted delivery log |
| GPS/карта | проверка видимости точки | 30 мин background/offline FIFO/GPS OFF→ON | screen recording, timestamps |
| Граница | статус и локаль | действие водителя и polling | HTTP evidence, screenshots |
| Документы | receive/open/retry | send/open/retry | file name, MIME, HTTP evidence |
| FSM | негативные клиентские действия | негативные водительские действия | response/status evidence |

## Реестр latency

Для каждого текстового перевода: `message_id`, направление, request UTC,
response UTC, latency_ms, cached, HTTP code, result status. По завершении
считать median, p95 и max; отсутствие результата или spinner более 10 секунд
— FAIL.

Для голоса дополнительно: `audio_duration_s`, upload_ms, stt_ms,
translation_ms, total_ms, provider/model, transcript и translation. Секреты,
access tokens, номера телефонов и содержимое bearer-токенов не включать.

## FCM redacted delivery log

Для нового события после `cutoff_id`: `outbox_id`, `event_id`, тип события,
получательская роль, Xiaomi A/B, provider, status, accepted UTC, delivered UTC,
latency_ms, deeplink target и duplicate=false. Токены заменять на
`<redacted:last4>`. Старые outbox ID не запускать и не включать в deliverable.

## Условия завершения

PASS не переносится с другого SHA, APK или устройства. Если независимый review,
CI, runtime SHA, FCM, routing либо CGR не подтверждены, общий вывод остаётся
`QA2 BLOCKED`; любой неизвестный результат — `UNKNOWN`, а не PASS.
