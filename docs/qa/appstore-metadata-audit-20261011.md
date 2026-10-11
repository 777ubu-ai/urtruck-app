# UrTruck: проверка заполнения App Store Connect, 11.10.2026

Проверка выполнена по официальному App Store Connect API и авторизованному интерфейсу. Это аудит заполнения; не подтверждение одобрения или полного соответствия приложения всем требованиям Apple.

## Текущий статус

- Версия 1.0.9: PREPARE_FOR_SUBMISSION. Выбран build 97, VALID, APP_STORE_ELIGIBLE; автоматический релиз AFTER_APPROVAL.
- Публичная версия: 1.0.7, Ready for Distribution.
- Открыто замечание 4.8 Login Services. Ответ с просьбой одобрить bug-fix build 97 и обязательством исправить 4.8 в следующем обновлении ранее отправлен; одобрение исключения не подтверждено.
- Исходный код бинарников: 7ee5e9087a6e4afda648c93123a33c8d5403a498. Новая сборка, серверный деплой и новая отправка на review в ходе этой проверки не выполнялись.

## Проверенные поля

| Поле | Факт и граница проверки |
| --- | --- |
| Идентичность | UrTruck, com.urtruck.app, SKU urtruck_001, основной язык ru |
| Описание / keywords / What’s New | Заполнены; обнаруженные точечные расхождения исправлены ниже. Полная достоверность каждого обещания описания физически не перепроверена |
| Copyright | 2026 ALLATAU AED |
| Контакты и демо-доступ | Контактные поля и demoAccountName/demoAccountPassword заполнены, signInRequired=true. Секреты в отчёт не включены; новый UI-прогон демо-входа не выполнялся |
| Скриншоты | 10 APP_IPHONE_65, 1242×2688, все COMPLETE. Полное визуальное соответствие новой сборке не подтверждено |
| iPad | supportsTablet=false в app.json кандидата; отсутствие отдельного iPad-набора само по себе не объявлено ошибкой |
| Support / Privacy URL | https://urtruck.kz/legal/support.html и https://urtruck.kz/legal/privacy.html возвращают HTTP 200, страницы поддержки и политики доступны |
| App Privacy | Опубликована; прочитаны 11 типов данных: Name, Email Address, Phone Number, Precise Location, Emails or Text Messages, Photos or Videos, Audio Data, Other User Content, User ID, Device ID, Crash Data |
| Privacy: цели и связь | Первые 10 типов заявлены для App Functionality и связаны с личностью; Crash Data для App Functionality, в превью не связан с личностью. Tracking в превью не заявлен. Полный аудит сторонних SDK и всех целей обработки не выполнен |
| Возрастная анкета | messagingAndChat=true, userGeneratedContent=false; возраст FOUR_PLUS. Личный чат отдельно определён Apple, поэтому одно наличие вложений не доказывает ошибку UGC. Соответствие публичных грузов/рейсов/отзывов определению широко распространяемого пользовательского контента требует отдельной сверки |
| Export compliance | usesNonExemptEncryption=false заполнено; самостоятельный аудит оснований этого ответа не выполнен |
| Необязательные поля | subtitle, promotionalText, privacyChoicesUrl пустые; не объявлены ошибками только из-за отсутствия |

## Исправления в App Store Connect

1. 07:12:26 UTC: в Notes for Review единственное упоминание выбранной сборки заменено с 1.0.9 (94) на 1.0.9 (97). Повторный GET подтвердил точный результат; демо-реквизиты не изменились.
2. 07:16:37 UTC: в RU-описании «Вкладка „Очередь“» приведена к текущему названию «Граница». В коде BottomNav использует tab_border; русский перевод — «Граница».
3. В той же операции удалены ATI и Della из keywords как названия сторонних сервисов, создающие риск по 2.3.7. Итог: грузоперевозки,фура,Китай,Казахстан,груз,перевозчик,логистика,FTL,Хоргос,СНГ,дальнобой. What’s New не изменён. Результаты подтверждены повторным GET.

Оригинальные значения сохранены в приватных файлах на Mac для обратимого восстановления. Анкета privacy, возраст, export compliance, review-состояние и ответ Apple при этих исправлениях не менялись.

## Что ещё нельзя объявить закрытым

- 4.8: в production auth settings Google включён, Apple выключен; сборка 97 не содержит устранения этой причины. Требуется явное решение Apple по предложенному исключению или рабочий соответствующий вход.
- Полное соответствие всех данных и SDK App Privacy; точность UGC-ответа для публичного пользовательского контента; основания export compliance.
- Визуальная точность всех скриншотов и каждого функционального обещания, новый демо-вход, настройки стран/цены/DSA и полная физическая приёмка build 97.
- Google Play: ранее подтверждён production draft 213798673; публичный rollout не подтверждён. Текущий аудит относится к App Store.

## Официальные требования

- https://developer.apple.com/app-store/review/guidelines/ — 2.1, 2.3, 4.8.
- https://developer.apple.com/help/app-store-connect/manage-app-information/manage-app-privacy/ — фактические данные, сторонние SDK и актуальность декларации.
- https://developer.apple.com/help/app-store-connect/reference/app-information/age-ratings-values-and-definitions/ — отдельные определения Messaging and Chat / User-Generated Content.
- https://developer.apple.com/help/app-store-connect/manage-app-information/overview-of-export-compliance — определение применимых требований к шифрованию.

Вывод: заполнение не было полностью корректным; три точечные ошибки/риска исправлены. Основные privacy-типы заявлены. Утверждать «всё соответствует» и гарантировать прохождение Apple оснований пока нет.
