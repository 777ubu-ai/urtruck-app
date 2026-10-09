# Google Play: Android 16 KB release blocker — 9 октября 2026

## PRE-FLIGHT
Branch fix/android-mapkit-16kb-20261009 от b6167e6bdb1f26acf5cb8a891cc854f71f0ab207. Known-good: app source 0449116f, внутренние сборки iOS 94 / Android 213660672; 16 KB и полная физическая матрица не PASS. Production SHA UNKNOWN. Scope: Android MapKit dependency в существующем patch-package, ELF/ZIP CI gates. Защищены iOS SDK, UI/флаги/страны, AI/APNs, auth, GPS permission-flow, production runtime и данные устройств. Rollback: отказаться от нового кандидата/откатить отдельный commit; не заменять публичный release неподтверждённой сборкой.

## Дефект
Владелец предоставил Play Console: versionCode 213660672 не поддерживает 16 KB pages. Два уже сохранённых AAB проверены без нового скачивания: a33d5a10e74b6f9583c63737ce95e70143f09aa6e650becd4e98a6e3869a308c и 7863735151cad0b4e9e9aaa0e49f5a790c685ab18ce50712206c89dcf6bf887b. Эти SHA не совпадают с последним AAB 47b14277, поэтому их проверка не выдаётся за скан 213660672. В обоих 48 ELF64 библиотек; несовместимы две libmaps-mobile.so (arm64-v8a/x86_64), LOAD alignment 4096. React-native-yamap 4.8.3 фиксирует Android MapKit 4.8.0-full. Официальный changelog Yandex подтверждает добавление Android 16 KB support в 4.19.0.

## Исправление кандидата
Android MapKit 4.8.0-full → 4.19.0-full; bridge, iOS Pod dependency, UI и GPS не переписаны. До upload проверяются ELF64 LOAD alignment/congruence и AAB PAGE_ALIGNMENT_16K через bundletool. Невалидный/пустой ELF archive отклоняется. CI evidence уходит в job summary, а не в unsolicited issue comment.

## Проверки
7 unit cases PASS: 16/64 KB, rejection 4 KB/non-power-of-two/incongruent/truncated, big-endian, archive failure/empty archive. На сохранённом несовместимом AAB gate воспроизводит ровно два FAIL; новая AAB пока не готова. Нужны: patch-package clean install, Kotlin bridge build с новым SDK, весь ELF scan и ZIP config, карта/маршрут/GPS на 4 KB и 16 KB Android. Публичный rollout не выполнен.

## Manager handoff
Не публиковать 213660672: Console сообщает blocking error. После готовности нового AAB проверить отсутствие ошибки 16 KB в App Bundle Explorer, уникальный versionCode, package com.urtruck.app, карту/GPS/push. Проверить Background location + FGS location declarations, privacy policy, listing, demo-video и review-account. Затем выбрать проверенный новый AAB в production draft, открыть обзор публикации и отправить на проверку. Обещать менеджеру одну последнюю кнопку можно лишь после фактической проверки всех требований Console.

Sources: https://developer.android.com/guide/practices/page-sizes ; https://yandex.ru/maps-api/docs/mapkit/versions.html (4.19.0).
Status: FIXED IN SOURCE; BUILD/PHYSICAL/PLAY VALIDATION PENDING.
