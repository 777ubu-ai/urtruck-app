// ignore: unused_import
import 'package:intl/intl.dart' as intl;
import 'app_localizations.dart';

// ignore_for_file: type=lint

/// The translations for Russian (`ru`).
class AppLocalizationsRu extends AppLocalizations {
  AppLocalizationsRu([String locale = 'ru']) : super(locale);

  @override
  String get appTitle => 'Biz Chat';

  @override
  String get navHome => 'Главная';

  @override
  String get navSearch => 'Поиск';

  @override
  String get navCreate => 'Создать';

  @override
  String get navChats => 'Чаты';

  @override
  String get navProfile => 'Профиль';

  @override
  String get commonOk => 'ОК';

  @override
  String get commonCancel => 'Отмена';

  @override
  String get commonSave => 'Сохранить';

  @override
  String get commonDelete => 'Удалить';

  @override
  String get commonRetry => 'Повторить';

  @override
  String get commonClose => 'Закрыть';

  @override
  String get commonContinue => 'Продолжить';

  @override
  String get commonLoading => 'Загрузка…';

  @override
  String get commonError => 'Ошибка';

  @override
  String get commonBack => 'Назад';

  @override
  String get commonOpen => 'Открыть';

  @override
  String get commonShare => 'Поделиться';

  @override
  String get commonCopy => 'Копировать';

  @override
  String get commonCopied => 'Скопировано';

  @override
  String get commonNo => 'Нет';

  @override
  String get authPhoneTitle => 'Вход';

  @override
  String get authPhoneHint => 'Номер телефона';

  @override
  String get authPhoneSubtitle => 'Отправим код подтверждения по SMS';

  @override
  String get authPhoneSendCode => 'Отправить код';

  @override
  String get authCodeTitle => 'Введите код';

  @override
  String get authCodeHint => '6-значный код';

  @override
  String authCodeSubtitle(String phone) {
    return 'Введите код, отправленный на $phone';
  }

  @override
  String get authCodeResend => 'Отправить ещё раз';

  @override
  String authCodeResendIn(int seconds) {
    return 'Повторно через $seconds сек';
  }

  @override
  String get authRoleTitle => 'Кто вы?';

  @override
  String get authRoleBuyer => 'Байер';

  @override
  String get authRoleBuyerDesc => 'Хочу покупать у заводов';

  @override
  String get authRoleFactory => 'Завод';

  @override
  String get authRoleFactoryDesc => 'Произвожу и хочу продавать';

  @override
  String get authRolePickToContinue => 'Выбери тип аккаунта чтобы продолжить';

  @override
  String get authRolePickRole => 'Выбери тип аккаунта';

  @override
  String get authRoleNewCodeHint => 'Введите код из новой SMS';

  @override
  String get authRoleCodeRequired => 'Введите код из SMS (мы отправили новый)';

  @override
  String get authRoleFinishButton => 'Завершить регистрацию';

  @override
  String get authCodeTooShort => 'Введите код из SMS';

  @override
  String get feedAll => 'Все';

  @override
  String get feedFollowing => 'Подписки';

  @override
  String get feedHotDeals => 'Акции';

  @override
  String get feedEmptyTitle => 'Постов пока нет';

  @override
  String get feedEmptySubtitle => 'Потяните вниз, чтобы обновить';

  @override
  String get feedLoadError => 'Не удалось загрузить ленту';

  @override
  String feedTrustScore(int score) {
    return 'Trust Score: $score';
  }

  @override
  String feedMoq(int moq) {
    return 'MOQ $moq шт';
  }

  @override
  String feedShippingDays(int days) {
    return 'Доставка $days дней';
  }

  @override
  String get postWriteToFactory => 'Написать заводу';

  @override
  String get postPriceSheetTitle => 'Цена';

  @override
  String get postDescription => 'Описание';

  @override
  String get postTranslate => 'Перевести';

  @override
  String get postShowOriginal => 'Показать оригинал';

  @override
  String get postLikedSnack => 'Понравилось';

  @override
  String get postUnlikedSnack => 'Лайк снят';

  @override
  String get postSavedSnack => 'Сохранено в закладки';

  @override
  String get postUnsavedSnack => 'Убрано из закладок';

  @override
  String get postShareLinkCopied => 'Ссылка скопирована';

  @override
  String get postOwnPostMsg => 'Это твой собственный пост';

  @override
  String get postFactoryNotFound => 'Завод не найден';

  @override
  String postReviewsLink(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count отзыва',
      many: '$count отзывов',
      few: '$count отзыва',
      one: '1 отзыв',
      zero: 'Нет отзывов',
    );
    return '$_temp0';
  }

  @override
  String get searchHint => 'Поиск по хэштегам, заводам, товарам…';

  @override
  String get searchIdleHint => 'Начните вводить запрос для поиска';

  @override
  String get searchTooShort => 'Введите минимум 2 символа';

  @override
  String get searchNoResults => 'Ничего не найдено';

  @override
  String get searchFilters => 'Фильтры';

  @override
  String get searchFiltersPriceUsd => 'Цена (USD)';

  @override
  String get searchFiltersFrom => 'От';

  @override
  String get searchFiltersTo => 'До';

  @override
  String get searchFiltersMoqMax => 'Минимальная партия';

  @override
  String get searchFiltersCountry => 'Страна';

  @override
  String get searchFiltersCountryAll => 'Все';

  @override
  String get searchFiltersHotDeal => 'Только акции';

  @override
  String get searchFiltersReset => 'Сбросить';

  @override
  String get searchFiltersApply => 'Применить';

  @override
  String get chatTitle => 'Сообщения';

  @override
  String get chatNoMessages => 'Нет сообщений';

  @override
  String get chatStartHint => 'Напишите первым — обсудите цены, MOQ, отгрузку';

  @override
  String get chatInputHint => 'Сообщение…';

  @override
  String get chatNoChats => 'Нет чатов';

  @override
  String get chatNoChatsHint =>
      'Откройте пост и нажмите «Написать заводу», чтобы начать';

  @override
  String get chatPartnerBuyer => 'Байер';

  @override
  String get chatPartnerFactory => 'Завод';

  @override
  String get profileTitle => 'Профиль';

  @override
  String get profileLogout => 'Выйти из аккаунта';

  @override
  String get profileEdit => 'Редактировать профиль';

  @override
  String get profileFollowers => 'Подписчики';

  @override
  String get profileFollowing => 'Подписки';

  @override
  String get profileMySaves => 'Мои сохранения';

  @override
  String get profileSettings => 'Настройки';

  @override
  String get profileReferralCode => 'Реферальный код';

  @override
  String get profileLanguage => 'Язык';

  @override
  String get profileCurrency => 'Валюта';

  @override
  String get settingsTitle => 'Настройки';

  @override
  String get settingsAccount => 'Аккаунт';

  @override
  String get settingsPhone => 'Телефон';

  @override
  String get settingsLanguageRu => 'Русский';

  @override
  String get settingsLanguageEn => 'English';

  @override
  String get settingsLanguageZh => '中文';

  @override
  String get settingsNotifications => 'Уведомления';

  @override
  String get settingsPushNotifications => 'Push-уведомления';

  @override
  String get settingsPushMaster => 'Все push-уведомления';

  @override
  String get settingsNotifLikes => 'Лайки';

  @override
  String get settingsNotifComments => 'Комментарии';

  @override
  String get settingsNotifMessages => 'Сообщения';

  @override
  String get settingsNotifReviews => 'Отзывы';

  @override
  String get settingsNotifGroupBuy => 'Групповые закупки';

  @override
  String get settingsPushUpdateError => 'Не удалось обновить';

  @override
  String get settingsQuietHours => 'Тихие часы';

  @override
  String get settingsPrivacy => 'Приватность';

  @override
  String get settingsBlocked => 'Заблокированные';

  @override
  String get settingsAbout => 'О приложении';

  @override
  String get settingsVersion => 'Версия';

  @override
  String get settingsContactSupport => 'Связаться с поддержкой';

  @override
  String get settingsTermsOfService => 'Условия использования';

  @override
  String get settingsPrivacyPolicy => 'Политика конфиденциальности';

  @override
  String get notificationsTitle => 'Уведомления';

  @override
  String get notificationsMarkAllRead => 'Прочитать все';

  @override
  String get notificationsEmpty => 'Уведомлений нет';

  @override
  String reviewsTitle(String factoryName) {
    return 'Отзывы о $factoryName';
  }

  @override
  String get reviewsWrite => 'Написать отзыв';

  @override
  String get reviewsEmpty => 'Отзывов пока нет';

  @override
  String get reviewsRating => 'Оценка';

  @override
  String get reviewsComment => 'Комментарий';

  @override
  String get reviewsBeFirst => 'Будьте первым кто оставит отзыв об этом заводе';

  @override
  String get reviewsNewTitle => 'Новый отзыв';

  @override
  String get reviewsEditTitle => 'Изменить отзыв';

  @override
  String get reviewsCommentHint =>
      'Расскажите о своём опыте — качество, сроки, упаковка, общение';

  @override
  String get reviewsPublish => 'Опубликовать отзыв';

  @override
  String get reviewsSaveChanges => 'Сохранить изменения';

  @override
  String get reviewsPublished => 'Отзыв опубликован';

  @override
  String get reviewsUpdated => 'Отзыв обновлён';

  @override
  String get postDetailTitle => 'Товар';

  @override
  String get postPriceLabel => 'Цена';

  @override
  String postSpecsMoq(int moq) {
    return 'Минимальная партия: $moq шт';
  }

  @override
  String postSpecsShipping(int days) {
    return 'Доставка: $days дней';
  }

  @override
  String get postSpecsStockInStock => 'В наличии';

  @override
  String get postSpecsStockOutOfStock => 'Нет в наличии';

  @override
  String get postSpecsStockOnDemand => 'Под заказ';

  @override
  String get postPriceTiers => 'Цены по объёмам';

  @override
  String postPriceTierFromQty(int qty) {
    return 'от $qty шт';
  }

  @override
  String get postCommentsTitle => 'Комментарии';

  @override
  String get postCommentInputHint => 'Напишите комментарий…';

  @override
  String get postCommentSend => 'Отправить';

  @override
  String get postNoComments => 'Комментариев пока нет';

  @override
  String get postFirstComment => 'Будьте первым';

  @override
  String postFollowed(String factory) {
    return 'Подписался на $factory';
  }

  @override
  String postUnfollowed(String factory) {
    return 'Отписался от $factory';
  }

  @override
  String get postFollow => 'Подписаться';

  @override
  String get postUnfollow => 'Отписаться';

  @override
  String get postDelete => 'Удалить пост';

  @override
  String get postDeleteConfirm => 'Удалить этот пост?';

  @override
  String get postDeleteConfirmBody => 'Это действие нельзя отменить.';

  @override
  String get postDeleted => 'Пост удалён';

  @override
  String postDeletedWithTitle(String title) {
    return 'Пост «$title» удалён';
  }

  @override
  String postLikeError(String error) {
    return 'Не удалось лайкнуть: $error';
  }

  @override
  String postUnlikeError(String error) {
    return 'Не удалось снять лайк: $error';
  }

  @override
  String postSaveError(String error) {
    return 'Не удалось сохранить: $error';
  }

  @override
  String get groupBuyTitle => 'Групповая закупка';

  @override
  String groupBuyProgress(int current, int target) {
    return '$current / $target шт';
  }

  @override
  String groupBuyParticipants(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count участника',
      many: '$count участников',
      few: '$count участника',
      one: '1 участник',
      zero: 'Нет участников',
    );
    return '$_temp0';
  }

  @override
  String groupBuyDeadline(String date) {
    return 'До $date';
  }

  @override
  String get groupBuyJoin => 'Присоединиться';

  @override
  String get groupBuyLeave => 'Отменить заявку';

  @override
  String get groupBuyEdit => 'Изменить заявку';

  @override
  String get groupBuyGoalReached => 'Цель достигнута! 🎉';

  @override
  String get groupBuyExpired => 'Срок истёк';

  @override
  String get groupBuyJoinSheetTitle => 'Присоединиться к закупке';

  @override
  String get groupBuyQuantity => 'Количество';

  @override
  String get groupBuyEstimatedTotal => 'Сумма';

  @override
  String get groupBuyOwnPost => 'Это ваша собственная закупка';

  @override
  String groupBuyJoinedSnack(int qty, int total) {
    return 'Вы в закупке: $qty шт. Набрано: $total';
  }

  @override
  String get groupBuyLeaveConfirmTitle => 'Отменить участие?';

  @override
  String get groupBuyLeaveConfirmBody =>
      'Ваша заявка будет удалена. Сможете присоединиться снова позже.';

  @override
  String get groupBuyLeaveConfirmAction => 'Отменить';

  @override
  String get createPostTitle => 'Новый пост';

  @override
  String get createPostType => 'Тип поста';

  @override
  String get createPostTypeProduct => 'Товар';

  @override
  String get createPostTypeReel => 'Reel';

  @override
  String get createPostTypeHotDeal => 'Акция';

  @override
  String get createPostTypeGroupBuy => 'Групповая закупка';

  @override
  String get createPostMedia => 'Медиа';

  @override
  String get createPostAddPhoto => 'Фото';

  @override
  String get createPostAddVideo => 'Видео';

  @override
  String get createPostName => 'Название';

  @override
  String get createPostNameHint => 'Короткое и понятное название товара';

  @override
  String get createPostDescription => 'Описание';

  @override
  String get createPostDescriptionHint =>
      'Материалы, особенности, упаковка, варианты кастомизации';

  @override
  String get createPostPrice => 'Цена';

  @override
  String get createPostPriceCurrency => 'Валюта';

  @override
  String get createPostMoq => 'Минимальная партия';

  @override
  String get createPostShippingDays => 'Срок доставки (дней)';

  @override
  String get createPostStockStatus => 'Наличие';

  @override
  String get createPostHashtagsLabel => 'Хэштеги';

  @override
  String get createPostHashtagHint => 'тег (без #)';

  @override
  String get createPostAddHashtag => 'Добавить';

  @override
  String get createPostHashtagMaxLimit => 'Максимум 20 хэштегов';

  @override
  String get createPostHashtagDuplicate => 'Уже добавлен';

  @override
  String get createPostPublish => 'Опубликовать';

  @override
  String get createPostPublished => 'Пост опубликован!';

  @override
  String get createPostError => 'Не удалось опубликовать';

  @override
  String get createPostNoMedia => 'Добавьте хотя бы одно фото или видео';

  @override
  String get createPostFactoryOnly => 'Только заводы могут публиковать посты';

  @override
  String get editProfileTitle => 'Редактировать профиль';

  @override
  String get editProfileAvatar => 'Аватар';

  @override
  String get editProfilePickAvatar => 'Выбрать фото';

  @override
  String get editProfileName => 'Ваше имя';

  @override
  String get editProfileCompanyName => 'Название компании';

  @override
  String get editProfileCountry => 'Страна';

  @override
  String get editProfileCity => 'Город';

  @override
  String get editProfileSaved => 'Профиль обновлён';

  @override
  String hashtagScreenTitle(String tag) {
    return 'Посты с #$tag';
  }

  @override
  String get hashtagEmpty => 'Нет постов с этим хэштегом';

  @override
  String get hashtagBeFirst =>
      'Будьте первым — добавьте этот хэштег к своему посту';

  @override
  String get savesTitle => 'Мои сохранения';

  @override
  String get savesEmpty => 'Сохранений пока нет';

  @override
  String get savesEmptyHint =>
      'Нажмите на иконку закладки на любом посте, чтобы сохранить его здесь';

  @override
  String savesLoadError(String error) {
    return 'Не удалось загрузить сохранения: $error';
  }

  @override
  String savesLoadErrorHttp(int code) {
    return 'Не удалось загрузить сохранения (HTTP $code)';
  }

  @override
  String get countryNameKZ => '🇰🇿 Казахстан';

  @override
  String get countryNameRU => '🇷🇺 Россия';

  @override
  String get countryNameCN => '🇨🇳 Китай';

  @override
  String get countryNameUZ => '🇺🇿 Узбекистан';

  @override
  String get countryNameKG => '🇰🇬 Кыргызстан';

  @override
  String get countryNameBY => '🇧🇾 Беларусь';

  @override
  String get countryNameTR => '🇹🇷 Турция';

  @override
  String get followersTitle => 'Подписчики';

  @override
  String get followingTitle => 'Подписки';

  @override
  String get followNoFollowers => 'Подписчиков пока нет';

  @override
  String get followNoFollowing => 'Подписок пока нет';

  @override
  String publicProfileFollowers(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count подписчика',
      many: '$count подписчиков',
      few: '$count подписчика',
      one: '1 подписчик',
      zero: '0 подписчиков',
    );
    return '$_temp0';
  }

  @override
  String get publicProfilePosts => 'Посты';

  @override
  String get publicProfileNoPosts => 'Постов пока нет';

  @override
  String get publicProfileAboutFactory => 'О заводе';

  @override
  String get publicProfileTrustScore => 'Trust Score';

  @override
  String publicProfileTotalProducts(int count) {
    return 'Товаров: $count';
  }

  @override
  String publicProfileTotalDeals(int count) {
    return 'Сделок: $count';
  }

  @override
  String notifLikeText(String actor) {
    return '$actor лайкнул ваш пост';
  }

  @override
  String notifCommentText(String actor) {
    return '$actor оставил комментарий';
  }

  @override
  String notifMessageText(String actor) {
    return '$actor прислал сообщение';
  }

  @override
  String notifReviewText(String actor) {
    return '$actor оставил отзыв';
  }

  @override
  String get notifGroupBuyCompletedText => 'Закупка успешно собрана!';

  @override
  String get commonJustNow => 'только что';

  @override
  String commonMinutesShort(int count) {
    return '$count мин';
  }

  @override
  String commonHoursShort(int count) {
    return '$count ч';
  }

  @override
  String commonDaysShort(int count) {
    return '$count дн';
  }

  @override
  String get commonExpired => 'истёк';

  @override
  String get commonLessThanMinute => '<1 мин';

  @override
  String get commentsSheetEmptyTitle => 'Пока нет комментариев';

  @override
  String get commentsSheetEmptySubtitle => 'Будь первым — задай вопрос заводу.';

  @override
  String get groupBuyStatusCollecting => 'Группа собирается';

  @override
  String groupBuyDealText(int target, String price, String currency) {
    return 'При $target шт цена упадёт до $price $currency/шт';
  }

  @override
  String get groupBuyCollected => 'Набрано';

  @override
  String get groupBuyParticipantsLabel => 'Участников';

  @override
  String get groupBuyRemaining => 'Осталось';

  @override
  String groupBuyParticipating(int qty) {
    return 'Вы участвуете: $qty шт';
  }

  @override
  String get groupBuyEditMyOrder => 'Изменить';

  @override
  String get groupBuyLeaveShort => 'Отменить';

  @override
  String groupBuyJoinWithRemaining(int count) {
    return 'Присоединиться · осталось $count шт';
  }

  @override
  String get groupBuyJoinSheetTitleLong => 'Ваше участие в закупке';

  @override
  String get groupBuyJoinSheetSubtitle =>
      'Укажите сколько штук готовы заказать';

  @override
  String get groupBuyJoinSheetEstimated => 'Ориентировочно:';

  @override
  String get groupBuyJoinSheetConfirm => 'Подтвердить';

  @override
  String get reelsTitle => 'Reels';

  @override
  String get reelsEmptyTitle => 'Пока нет reels';

  @override
  String get reelsEmptySubtitle =>
      'Заводы ещё не публиковали видео.\nЗагляни позже.';

  @override
  String get reelsMore => 'Подробнее';

  @override
  String publicProfileReviewsCountPlural(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count отзыва',
      many: '$count отзывов',
      few: '$count отзыва',
      one: '1 отзыв',
      zero: 'нет отзывов',
    );
    return '$_temp0';
  }

  @override
  String publicProfileReviewsSeeAll(String count) {
    return '$count — посмотреть все';
  }

  @override
  String get publicProfileNoReviewsTitle => 'Нет отзывов';

  @override
  String get publicProfileGetFirstReview => 'Получите первый отзыв';

  @override
  String get publicProfileBeFirstReviewer => 'Будьте первым кто оставит отзыв';

  @override
  String get publicProfileFollowersLabel => 'Подписчики';

  @override
  String get publicProfileFollowingLabel => 'Подписки';

  @override
  String get createPostMediaTitle => 'Медиа товара (до 10)';

  @override
  String createPostMediaCount(int count) {
    return '$count/10 медиа';
  }

  @override
  String get createPostMediaMaxReached => 'Максимум 10 медиа';

  @override
  String get createPostVideoTooLarge => 'Видео должно быть не более 50 МБ';

  @override
  String createPostPickPhotosError(String error) {
    return 'Не удалось выбрать фото: $error';
  }

  @override
  String createPostPickVideoError(String error) {
    return 'Не удалось выбрать видео: $error';
  }

  @override
  String createPostPublishedWithTitle(String title) {
    return 'Пост «$title» опубликован';
  }

  @override
  String get createPostNoMediaSnack => 'Добавь хотя бы одно фото';

  @override
  String get createPostTitleRequired => 'Название *';

  @override
  String get createPostTitleHintExample =>
      'Например, Хлопковые футболки оверсайз';

  @override
  String get createPostTitleTooShort => 'Минимум 3 символа';

  @override
  String get createPostDescriptionHintExample =>
      'Материал, характеристики, сертификаты…';

  @override
  String get createPostPriceRequired => 'Цена *';

  @override
  String get createPostPriceHintExample => '4.50';

  @override
  String get createPostFieldRequired => 'Обязательно';

  @override
  String get createPostFieldInvalid => 'Неверно';

  @override
  String get createPostMoqLabel => 'MOQ (мин. партия)';

  @override
  String get createPostMoqMin => '≥ 1';

  @override
  String get createPostShippingLabel => 'Отгрузка (дн)';

  @override
  String get createPostShippingMin => '≥ 0';

  @override
  String get createPostStockInStock => 'В наличии';

  @override
  String get createPostStockPreOrder => 'Предзаказ';

  @override
  String get createPostStockOutOfStock => 'Нет в наличии';

  @override
  String get createPostCurrencyRequired => 'Валюта *';

  @override
  String get createPostHashtagInvalidChars =>
      'Хэштег может содержать только буквы, цифры, _ и -';

  @override
  String get createPostHashtagHintExample => 'tshirt, wholesale, cotton…';

  @override
  String get editProfileNameLabel => 'Имя';

  @override
  String get editProfileNameHint => 'Как тебя зовут?';

  @override
  String get editProfileCompanyRequiredLabel => 'Название компании *';

  @override
  String get editProfileCompanyHint => 'Guangzhou Apparel Co.';

  @override
  String get editProfileCompanyRequiredError => 'Обязательно для заводов';

  @override
  String get editProfileLanguageLabel => 'Язык';

  @override
  String get editProfileCurrencyLabel => 'Валюта';

  @override
  String get editProfileCountryLabel => 'Страна';

  @override
  String get editProfileCityLabel => 'Город';

  @override
  String get editProfileCityHint => 'Алматы';

  @override
  String editProfileAvatarUploadError(String error) {
    return 'Не удалось загрузить аватар: $error';
  }

  @override
  String reviewsListTitle(String factoryName) {
    return 'Отзывы о $factoryName';
  }

  @override
  String get reviewsListFabWrite => 'Написать отзыв';

  @override
  String get reviewsListEmptyTitle => 'Отзывов пока нет';

  @override
  String get reviewsListBeFirstLong =>
      'Будь первым, кто оставит отзыв об этом заводе.';

  @override
  String get profileLogoutConfirmTitle => 'Выйти из аккаунта?';

  @override
  String get profileLogoutConfirmBody =>
      'Сессия будет завершена, придётся снова войти по SMS.';

  @override
  String get profileLogoutConfirmAction => 'Выйти';

  @override
  String get profileEditTooltip => 'Редактировать';

  @override
  String get profileRefreshTooltip => 'Обновить';

  @override
  String get profileReferralCopyTooltip => 'Скопировать';

  @override
  String profileReferralCopied(String code) {
    return 'Реферальный код $code скопирован';
  }

  @override
  String get profileLoadError => 'Не удалось загрузить профиль';

  @override
  String get profileUpdatedSnack => 'Профиль обновлён';

  @override
  String get profileNoName => 'Без имени';

  @override
  String get profileAboutFactory => 'О заводе';

  @override
  String profileFactoryTotalProducts(int count) {
    return 'Товаров: $count';
  }

  @override
  String profileFactoryTotalDeals(int count) {
    return 'Сделок: $count';
  }

  @override
  String profileFactoryTrustScore(int score) {
    return 'Trust Score: $score';
  }

  @override
  String get profileLanguageLabel => 'Язык';

  @override
  String get profileCurrencyLabel => 'Валюта';

  @override
  String get profileCountryLabel => 'Страна';

  @override
  String get profileCityLabel => 'Город';

  @override
  String get profileReferralCodeLabel => 'Реферальный код';

  @override
  String get profileMyPosts => 'Мои товары';

  @override
  String get profileNoPostsYet => 'Пока нет постов';

  @override
  String feedLikesCount(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count лайка',
      many: '$count лайков',
      few: '$count лайка',
      one: '1 лайк',
      zero: '0 лайков',
    );
    return '$_temp0';
  }

  @override
  String feedMoqShort(int moq) {
    return 'MOQ: $moq шт';
  }

  @override
  String feedShippingDaysShort(int days) {
    return '$days дней';
  }

  @override
  String feedPriceSheetLine(int moq, int days) {
    return 'MOQ: $moq шт • Отгрузка: $days дней';
  }

  @override
  String feedSaveError(String error) {
    return 'Не удалось сохранить: $error';
  }

  @override
  String feedLikeErrorLike(String error) {
    return 'Не удалось лайкнуть: $error';
  }

  @override
  String feedLikeErrorUnlike(String error) {
    return 'Не удалось снять лайк: $error';
  }

  @override
  String get feedCannotDetermineFactory => 'Не удалось определить завод';

  @override
  String feedShareLinkCopied(String url) {
    return 'Ссылка скопирована: $url';
  }

  @override
  String get feedEmptyFollowingTitle => 'Нет постов от подписок';

  @override
  String get feedEmptyFollowingBody =>
      'Подпишись на заводы в ленте «Все», и их посты появятся здесь.';

  @override
  String get feedEmptyHotDealTitle => 'Акций пока нет';

  @override
  String get feedEmptyHotDealBody =>
      'Заводы ещё не объявили Hot Deal. Загляни позже — или попробуй вкладку «Все».';

  @override
  String get feedEmptyGenericTitle => 'Лента пустая';

  @override
  String get feedEmptyGenericBody =>
      'Пока нет постов от заводов.\nПотяни вниз чтобы обновить.';

  @override
  String get feedRealtimeConnected => 'Real-time подключён';

  @override
  String get feedRealtimeConnecting => 'Подключаемся…';

  @override
  String get feedRealtimeError => 'Ошибка соединения, пробую снова';

  @override
  String get feedRealtimeDisconnected => 'Нет real-time соединения';

  @override
  String get feedReelsTooltip => 'Reels';

  @override
  String get feedNotificationsTooltip => 'Уведомления';

  @override
  String get searchHintTooltipClear => 'Очистить';

  @override
  String get searchResetFiltersTooltip => 'Сбросить фильтры';

  @override
  String get searchIdleTitle => 'Поиск товаров';

  @override
  String get searchIdleBody =>
      'Введите название, хэштег (#tshirt) или бренд завода — минимум 2 символа.';

  @override
  String searchNoResultsBody(String query) {
    return 'По запросу «$query» нет результатов. Попробуй другие слова или хэштеги.';
  }

  @override
  String get searchFiltersHotShort => '🔥 Акции';

  @override
  String get chatErrorRetry => 'Повторить';

  @override
  String get chatNoMessagesShort => 'Нет сообщений';

  @override
  String get chatYouPrefix => 'Вы:';

  @override
  String get chatTimeNow => 'сейчас';

  @override
  String chatTimeMinutesShort(int count) {
    return '$count мин';
  }

  @override
  String chatTimeDaysShort(int count) {
    return '$count дн';
  }

  @override
  String notifActorLiked(String actor, String ref) {
    return '$actor лайкнул$ref';
  }

  @override
  String notifActorCommented(String actor, String ref) {
    return '$actor прокомментировал$ref';
  }

  @override
  String notifActorMessage(String actor) {
    return '$actor прислал сообщение';
  }

  @override
  String notifActorReview(String actor) {
    return '$actor оставил отзыв';
  }

  @override
  String notifGroupBuyCompletedWithRef(String ref) {
    return 'Закупка успешно собрана!$ref';
  }

  @override
  String get notifYourPostRef => ' твой пост';

  @override
  String notifPostRef(String title) {
    return ' «$title»';
  }

  @override
  String get notifTimeJustNow => 'только что';

  @override
  String notifTimeMinutesAgo(int count) {
    return '$count мин назад';
  }

  @override
  String notifTimeHoursAgo(int count) {
    return '$count ч назад';
  }

  @override
  String notifTimeDaysAgo(int count) {
    return '$count дн назад';
  }

  @override
  String get storyAddLabel => 'Добавить';

  @override
  String get storyPublishedSnack => 'История опубликована';

  @override
  String get storyPhotoUploadError => 'Не удалось загрузить фото';

  @override
  String get storyTimeJustNow => 'только что';

  @override
  String storyTimeMinutesShort(int count) {
    return '$count мин';
  }

  @override
  String storyTimeHoursShort(int count) {
    return '$count ч';
  }

  @override
  String storyTimeDaysShort(int count) {
    return '$count дн';
  }

  @override
  String get authPhoneInvalidFormat => 'Введите телефон в формате +79991234567';

  @override
  String get postDetailSavedTooltip => 'В закладках';

  @override
  String get postDetailSaveTooltip => 'Сохранить';

  @override
  String get onboardingSkip => 'Пропустить';

  @override
  String get onboardingNext => 'Дальше';

  @override
  String get onboardingGetStarted => 'Начать';

  @override
  String get feedPriceOnRequest => 'Цена по запросу';

  @override
  String get settingsQuietHoursOff => 'Выключено';

  @override
  String get postMenuReport => 'Пожаловаться';

  @override
  String get postMenuBlock => 'Заблокировать';

  @override
  String get blockUserConfirmTitle => 'Заблокировать?';

  @override
  String get blockUserConfirmBody =>
      'Его посты и сообщения больше не будут видны вам. Можно разблокировать позже в Настройках.';

  @override
  String get blockUserAction => 'Заблокировать';

  @override
  String get blockUserDone => 'Пользователь заблокирован';

  @override
  String get reportTitle => 'Пожаловаться';

  @override
  String get reportSubtitle =>
      'Выберите причину. Наша команда рассмотрит жалобу.';

  @override
  String get reportDescriptionLabel => 'Подробности (необязательно)';

  @override
  String get reportDescriptionHint => 'Опишите что не так';

  @override
  String get reportSubmit => 'Отправить';

  @override
  String get reportSent => 'Жалоба отправлена. Спасибо!';

  @override
  String get searchHistoryTitle => 'Недавние запросы';

  @override
  String get searchHistoryClear => 'Очистить';

  @override
  String get settingsTheme => 'Тема';

  @override
  String get settingsThemeLight => 'Светлая';

  @override
  String get settingsThemeDark => 'Тёмная';

  @override
  String get settingsThemeSystem => 'Системная';

  @override
  String get createPostCamera => 'Камера';

  @override
  String get createPostVideoWrongFormat =>
      'Формат видео не поддерживается. Выберите MP4 файл.';

  @override
  String createPostVideoTooBig(String size) {
    return 'Видео слишком большое ($size МБ). Максимум — 30 МБ. Выберите более короткое видео.';
  }

  @override
  String get settingsComingSoon => 'Скоро будет';

  @override
  String get onboardingTitle1 => 'Напрямую от заводов Китая';

  @override
  String get onboardingSubtitle1 =>
      'Без посредников — электроника, одежда и товары прямо от проверенных производителей';

  @override
  String get onboardingTitle2 => 'Безопасные сделки и групповые закупки';

  @override
  String get onboardingSubtitle2 =>
      'Объединяйтесь с другими покупателями ради лучшей цены и доставки';

  @override
  String get onboardingTitle3 => 'Общайся с заводами мгновенно';

  @override
  String get onboardingSubtitle3 =>
      'Договаривайся о цене, проси образцы и отслеживай отгрузки — всё в одном месте';

  @override
  String get onboardingTitle4 => 'Готовы начать?';

  @override
  String get onboardingSubtitle4 =>
      'Регистрация за 30 секунд по номеру телефона — без email и документов';
}
