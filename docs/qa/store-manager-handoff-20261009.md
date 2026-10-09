# UrTruck: что готово и что остаётся менеджеру — 9 октября 2026

## Точное состояние
| Канал | Состояние | Действие |
|---|---|---|
| App Store 1.0.9 (94) | WAITING_FOR_REVIEW, AFTER_APPROVAL; повторно проверено API сегодня | Ждать решения Apple. Демонстрационный вход исправлен, server login smoke PASS. Публичная новая версия ещё не подтверждена |
| Новый iOS candidate | Actions 37910804163; source c5be008; guard build >94, ожидаемый 95 | После VALID установить через TestFlight и проверить меню Уведомления, badge/read, cooldown; не выбирать новый build в App Review без проверки |
| Play production | прежний 212912064 completed, 213660672 draft; Console показывает 16 KB blocker | 213660672 не публиковать; дождаться проверенного нового AAB |
| Android MapKit candidate | PR #510, source 33187c1; Actions 37911102249 | Verification-only, Play upload выключен. Нативная компиляция/ELF/ZIP alignment и physical map/GPS ещё pending |
| Push menu fix | PR #511, source c5be008, включает #509 | Код сохранён; 37 targeted checks и lint PASS. На физическом телефоне новый menu entry не подтверждён |

## Google Play — финальный порядок
1. Дождаться SUCCESS Android candidate: уникальный versionCode, host https://urtruck.kz, package com.urtruck.app, manifest/Firebase/FCM и 16 KB ELF/ZIP gates. Первый run 37910166357 FAIL Kotlin bridge, AAB не создан. Повтор старого source отменён. Исправленный run 37911102249 не считать PASS до завершения.
2. Проверить карту, создание маршрута, активный рейс/GPS и push на исправленном кандидате. Android SDK update не переносит исторический PASS на новый APK.
3. Для общей следующей Android версии включить #509/#511 вместе с #510 и всеми ночными фикcами; текущий validation run #510 не включает menu/cooldown. Публичная версия не должна случайно потерять #506–508.
4. Загрузить только verified новый AAB в internal; в App Bundle Explorer убедиться, что 16 KB blocking error отсутствует. Затем выбрать именно его для нового production release/draft. Сохранить номер и SHA.
5. Play Console → App content: Background location declaration и FGS location declaration должны соответствовать фактическому AAB. Privacy policy, disclosure, listing и рабочее Android demo-video сверить с docs/release/google-play-background-location.md. Не удалять GPS permissions ради обхода форм.
6. Проверить app-access инструкции и действующий demo-login. Не публиковать пароль/ключи в публичных release notes.
7. Открыть Publishing overview: устранить оставшиеся blocking errors; проверить список изменений и выбранный track. Только после этого нажать отправку на проверку/публикацию, как предлагает фактический интерфейс. Ответ review и rollout записать отдельно: draft, submitted и public — разные состояния.

## iOS — финальный порядок
Сборка 94 уже отправлена, API подтвердил WAITING_FOR_REVIEW. Не нажимать повторно resubmit и не отменять её только из-за нового TestFlight candidate. Новая сборка с menu/cooldown может стать следующим update после VALID и физической проверки; номер не перезаписывается. Перед заменой review build сохранить текущий статус и причину замены, пройти login/full-access smoke на реальном iPhone/iPad.

## Что исправлено в логике поиска push
На снимке badge=13. У известного driver UID сервер показывает reminder=10 и no_bids=3, unread deal-chat=0. Совпадение с аккаунтом iPhone ещё нужно подтвердить. Существующая лента была недоступна из меню; исправление возвращает путь ☰ → Уведомления без нового таба или колокольчика. Чтение событии и явное read-all используют прежний server API и badge reconciliation. 13 не объявлено тринадцатью чат-сообщениями.

## Доступ к Console
Часть Google Console форм не проверена автоматически: cloud browser переход был отклонён auto-review ранее. Локальный вход менеджера/владельца не переносит cookies в cloud session. Состояние forms и Publishing overview требует фактического просмотра менеджером; API tracks не доказывает готовность этих страниц. Обходов авторизации/блокировки не выполнялось.

## Ссылки
- PR #510: https://github.com/777ubu-ai/urtruck-app/pull/510
- PR #511: https://github.com/777ubu-ai/urtruck-app/pull/511
- Android verification: https://github.com/777ubu-ai/urtruck-app/actions/runs/37911102249
- iOS candidate: https://github.com/777ubu-ai/urtruck-app/actions/runs/37910804163
- App Review: https://appstoreconnect.apple.com/apps/6764504167/distribution/reviewsubmissions

Общий статус PARTIAL/BLOCKED для публичного Google update. 10/10, successful new binary, успешная очистка физического badge или опубликованный новый release не заявляются без evidence.
