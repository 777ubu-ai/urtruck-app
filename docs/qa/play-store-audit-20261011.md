# UrTruck — Google Play audit, 11.10.2026

## Фактический статус
Console фактически показывает production 1.0.9 в разделе «Изменения на проверке», «Начать полное внедрение». Одобрение и публичный rollout не подтверждены. Проверка началась 11 октября по модальному предупреждению Console. В этом прогоне не подтверждается отдельное успешное нажатие отправки исходного binary: фиксируется наблюдаемый статус.

Правильный AAB выбран: com.urtruck.app, 1.0.9, versionCode 213798673, target SDK 36. Source frozen 7ee5e9087a6e4afda648c93123a33c8d5403a498. SHA256 db4473b090ac1696433c0f11d83b57d8c327e45bfad4eb289d3901a23bcfb740. Run 38051833715 SUCCESS. Предыдущие успешные build/16KB/Firebase gates не повторялись. Единственное предупреждение preview: нет R8/Proguard mapping; minify release по умолчанию выключен. Это не объявлено исправленным.

## Сохранённые изменения
- Production release сохранён, правильный AAB подтверждён, предыдущий 213702394 исключён из новой версии.
- Managed publishing включён и подтверждён UI. После одобрения финальный live publish остаётся менеджеру.
- Background-location demo URL очищен от посторонних символов: https://youtube.com/shorts/ldNCsHJzfGo . Официальный YouTube oEmbed HTTP 200; само видео в этом прогоне не воспроизведено.
- FGS_LOCATION: user-initiated location sharing; описание фонового GPS прочитано.
- Data safety: добавлены OAuth, голосовые сообщения, device IDs для push. Голос/device IDs: collected, not shared, non-ephemeral, optional, app functionality. GPS изменён с ephemeral/required на non-ephemeral/optional, app functionality. GPS сохраняется в deal_locations, включается пользователем. Crash reports изменены с ephemeral на non-ephemeral: App.js использует Sentry. Остальные ответы не объявлены полностью независимо доказанными.
- RU listing: устранено старое обещание электронной очереди, описаны реальные сделки/чат/вложения/перевод/машина/Граница и фоновый GPS после начала активного рейса. Значок, banner и 7 прежних screenshots не заменялись; актуальность всех старых изображений не подтверждена физической сверкой.
- Privacy URL заменён на https://urtruck.kz/legal/privacy.html ; свежий HTTP 200, раскрытие background GPS присутствует.
- App content: все 12 деклараций заполнены. Прочитаны сводки: без рекламы/ADID, не health, не financial, не government, аудитория 18+, существующие IARC ratings. Наличие заполненных деклараций не равно одобрению Google.

## Блокер reviewer access
Найдены непригодные старые инструкции: номер +7XXXXXXXXXX и получение SMS ревьюером. Подготовлена замена на существующий review email и reusable review OTP без SMS/доступа к inbox. Значения не записаны в отчёт или git.
UI сохранение новых reviewer credentials отклонено automatic approval review: release authorization недостаточно для передачи конкретного приватного email и многоразового login code внешнему Google. Обход не выполнялся. Необходимо явное разрешение владельца передать эти тестовые реквизиты Google Play Review.
Подготовленная форма сохранена в browser handoff, но не отправлена. Старый доступ пока остаётся в Console.

## Pending / границы
Publishing overview подтверждает 4 новые изменения, ещё не отправленные: RU short/full descriptions, privacy URL, Data safety. Открыта отправка: Console предупреждает, что текущая проверка будет отменена и перезапущена. Нажата «Отмена», чтобы после разрешения сохранить reviewer access и дослать все изменения вместе одним перезапуском. Текущая проверка 1.0.9 продолжается; финальный live publish не выполнялся.
Account deletion URL остаётся старым Notion URL; публичная проверка получила HTTP 403, содержимое не подтверждено. Это не доказательство отсутствия страницы или нарушения. Официальная privacy policy содержит право удалить аккаунт/связанные данные, исключение законного хранения и support@urtruck.kz. Полную внешнюю доступность Notion deletion page необходимо подтвердить отдельно.
Backend ownership/mine/read-boundaries/TTN fixes в production этим заданием не выкатывались. Все подготовленные client fixes включены в frozen binary; нельзя обещать, что все серверные исправления уже работают в production.

## Следующее действие
После явного разрешения передать review credentials: сохранить подготовленную App access форму и страницу, проверить Publishing overview и отправить изменения вместе, принять штатное предупреждение перезапуска, подтвердить фактический статус. После Google approval менеджер публикует через managed publishing. Отдельно проверить публичную установку и обмен Android/iPhone.
