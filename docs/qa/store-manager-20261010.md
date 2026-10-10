# UrTruck — менеджеру Google Play, 10.10.2026

## Кандидат
- Версия 1.0.9; package com.urtruck.app.
- Замороженный source SHA 7ee5e9087a6e4afda648c93123a33c8d5403a498.
- Android workflow https://github.com/777ubu-ai/urtruck-app/actions/runs/38051833715
- Android run SUCCESS; новый production draft versionCode **213798673**, status **draft** подтверждён свежим API.
- AAB SHA-256 `db4473b090ac1696433c0f11d83b57d8c327e45bfad4eb289d3901a23bcfb740`.
- AAB artifact https://github.com/777ubu-ai/urtruck-app/actions/runs/38051833715/artifacts/11669832493
- Native 16KB: 48 ELF проверены, 0 failures; AAB ZIP alignment gate PASS, Firebase resources / package / code gates PASS.
- Release notes RU заполнены и повторно прочитаны: https://github.com/777ubu-ai/urtruck-app/actions/runs/38053507984 . Этот metadata-only run не пересобирает приложение и не публикует его.
- Свежий production baseline: 1.0.9 (213702394), status completed. 1.0.7 (209578495) — beta. Console declarations/Publishing overview не подтверждены; нельзя обещать одну кнопку до их проверки.
- Старые 213660672 /213702394 /213720253 не выбирать вместо нового кандидата.
- Новый кандидат включает все предыдущие fixes #506–514, Android MapKit 4.19/16KB, ownership #516, safe-area и vehicle units #517. Backend mine поле требует серверной поддержки; обновление сервера этим заданием не выполнено.

## Финальные действия в Console
1. Открыть production release/draft и выбрать новый подтверждённый versionCode ниже. Проверить, что App Bundle Explorer не показывает 16KB blocker, package/version правильные, новый AAB есть в release.
2. App content: сверить Background location + FGS location declarations, actual Android demo-video, privacy policy и listing. Не отключать GPS permissions; приложение запрашивает фоновые координаты только после Start trip/disclosure.
3. App access: проверить действующий reviewer login и полный доступ по ранее сохранённым приватным инструкциям. Не размещать пароль/OTP в публичных release notes.
4. Publishing overview: прочитать фактические blocking errors, завершить отсутствующие формы и затем нажать предложенную Console отправку на review/публикацию. Название кнопки и необходимость отдельного rollout зависят от текущего состояния review/managed publishing.
5. Сохранить скриншот выбранного номера и результата отправки. Отдельно подтвердить Google review, rollout и публичную загрузку на телефон.

## Release notes RU
Улучшена обработка документов в чате. Улучшены уведомления, счётчики непрочитанного и поле ввода сообщений. Исправлены сохранение машины и единицы измерения. Обновлена совместимость карты на Android.

## Ограничения
Полный независимый аудит ещё NO-GO: новые patch physical acceptance, все real auth flows, full deal FSM/security matrix не завершены. Владелец разрешил обновление и сообщил о GPS 30 минут/push; эти сообщения не подменяются новым автоматическим PASS.
Фактические Console declarations и Publishing overview автоматически не проверены. Одной финальной кнопкой это станет только после проверки страниц выше.

## iOS
- Сборка: https://github.com/777ubu-ai/urtruck-app/actions/runs/38051831925 ; подтверждён 1.0.9 (97), bundle com.urtruck.app, production APNs/host; upload SUCCESS 12:45:25 UTC. ASC build 97 VALID, выбран для версии 1.0.9; releaseType AFTER_APPROVAL.
- Текущая версия 1.0.9 PREPARE_FOR_SUBMISSION; выбран build 97 (726f808c-f6ca-41a9-bc68-5d086fae3353). Предыдущая review submission bea2c456-d49f-4894-ab2b-afb5a316e64e имеет UNRESOLVED_ISSUES. Публичная версия 1.0.7 READY_FOR_SALE. Повторная App Review submission пока не выполнена.
- Нужен текст нового rejection Apple. Вход через cloud browser остановлен automatic approval review; API key позволяет проверить версии/загрузку, но в выполненных запросах текст отказа не получен.
