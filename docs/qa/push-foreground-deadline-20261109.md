# Foreground push: ограничить ожидание локальной проверки дублей

## PRE-FLIGHT
Branch fix/push-foreground-deadline-20261109, base3e1c845461a91c8c21531183c2259bb256c13588. Push runtime исходника129/a2258821 совпадает с base. Known-good: provider acceptance есть; полного physicalPASS на новом кандидате нет. Scope:pushRuntime.js и тесты; защищены API, registry, auth, background policy, чат/FSM и данные. Проверки:runtime/dedup/native registration contracts+lint. Rollback:revert одного коммита; миграций и deploy нет.

## Серверный срез
09.11.2026 11:09UTC/16:09Алматы:за24ч APNs312sent/2invalid_token;FCM18sent. Это подтверждение принятия шлюзом, не показа. Последнее bid.created15:19Алматы skipped_no_devices:только iOS-токены1.0.9 disabled/logout от09.10; вручную их включать нельзя. Bid.rejected15:49Алматы sent/APNs; у получателя iOS1.0.15active. Совпадение конкретного аккаунта со скриншотом не установлено. Receipt/opened у просмотренных20доставок null, физический показ не доказан.

## Дефект и исправление
Foreground handler await claimPushEvent; тот ждёт storage.get/set без ограничения. Зависание локального I/O удерживает решение о баннере. Установленный expo-notifications57.0.20/src/NotificationsHandler.ts задаёт3сек на решение; также https://docs.expo.dev/push-notifications/receiving-notifications/ . Введён бюджет1000ms на claim, ошибка/истечение допускает баннер; подтверждённыйfalse подавляет. ACK уже вынесен из criticalpath. Сам claim продолжает завершение; исходный in-memory dedup резервирует ключ до первогоawait. При недоступном persistentcache между запусками возможен повтор; предпочтение показу явно вместо потери уведомления. Нет обещания hard realtime при блокировке JSthread.

До исправления runtime-тесты зависшегоclaim и rejectionFAIL. После42/42 runtime/contract/dedup/native registrationPASS; lint637PASS; diffcheckPASS. Физическая приёмкаNOT RUN:iPhone disconnected. Нового nativebuild, повторной отправки реальным людям, установки и productiondeploy нет. Полный исходный инцидент не закрыт: зависимость от foreground/фонового режима, разрешений/Focus и точного получателя требует устройства.
