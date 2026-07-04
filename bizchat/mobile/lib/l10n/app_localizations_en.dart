// ignore: unused_import
import 'package:intl/intl.dart' as intl;
import 'app_localizations.dart';

// ignore_for_file: type=lint

/// The translations for English (`en`).
class AppLocalizationsEn extends AppLocalizations {
  AppLocalizationsEn([String locale = 'en']) : super(locale);

  @override
  String get appTitle => 'Biz Chat';

  @override
  String get navHome => 'Home';

  @override
  String get navSearch => 'Search';

  @override
  String get navCreate => 'Create';

  @override
  String get navChats => 'Chats';

  @override
  String get navProfile => 'Profile';

  @override
  String get commonOk => 'OK';

  @override
  String get commonCancel => 'Cancel';

  @override
  String get commonSave => 'Save';

  @override
  String get commonDelete => 'Delete';

  @override
  String get commonRetry => 'Retry';

  @override
  String get commonClose => 'Close';

  @override
  String get commonContinue => 'Continue';

  @override
  String get commonLoading => 'Loading…';

  @override
  String get commonError => 'Error';

  @override
  String get commonBack => 'Back';

  @override
  String get commonOpen => 'Open';

  @override
  String get commonShare => 'Share';

  @override
  String get commonCopy => 'Copy';

  @override
  String get commonCopied => 'Copied';

  @override
  String get commonNo => 'No';

  @override
  String get authPhoneTitle => 'Sign in';

  @override
  String get authPhoneHint => 'Phone number';

  @override
  String get authPhoneSubtitle => 'We\'ll send a confirmation code via SMS';

  @override
  String get authPhoneSendCode => 'Send code';

  @override
  String get authCodeTitle => 'Enter code';

  @override
  String get authCodeHint => '6-digit code';

  @override
  String authCodeSubtitle(String phone) {
    return 'Enter the code we sent to $phone';
  }

  @override
  String get authCodeResend => 'Resend';

  @override
  String authCodeResendIn(int seconds) {
    return 'Resend in ${seconds}s';
  }

  @override
  String get authRoleTitle => 'Who are you?';

  @override
  String get authRoleBuyer => 'Buyer';

  @override
  String get authRoleBuyerDesc => 'I want to buy from factories';

  @override
  String get authRoleFactory => 'Factory';

  @override
  String get authRoleFactoryDesc => 'I produce and want to sell';

  @override
  String get authRolePickToContinue => 'Pick an account type to continue';

  @override
  String get authRolePickRole => 'Pick an account type';

  @override
  String get authRoleNewCodeHint => 'Enter the new SMS code';

  @override
  String get authRoleCodeRequired => 'Enter the SMS code (we sent a new one)';

  @override
  String get authRoleFinishButton => 'Finish sign-up';

  @override
  String get authCodeTooShort => 'Enter the SMS code';

  @override
  String get feedAll => 'All';

  @override
  String get feedFollowing => 'Following';

  @override
  String get feedHotDeals => 'Hot deals';

  @override
  String get feedEmptyTitle => 'No posts yet';

  @override
  String get feedEmptySubtitle => 'Pull down to refresh';

  @override
  String get feedLoadError => 'Failed to load feed';

  @override
  String feedTrustScore(int score) {
    return 'Trust Score: $score';
  }

  @override
  String feedMoq(int moq) {
    return 'MOQ $moq pcs';
  }

  @override
  String feedShippingDays(int days) {
    return 'Shipping $days days';
  }

  @override
  String get postWriteToFactory => 'Message factory';

  @override
  String get postPriceSheetTitle => 'Price';

  @override
  String get postDescription => 'Description';

  @override
  String get postTranslate => 'Translate';

  @override
  String get postShowOriginal => 'Show original';

  @override
  String get postLikedSnack => 'Liked';

  @override
  String get postUnlikedSnack => 'Unliked';

  @override
  String get postSavedSnack => 'Saved to bookmarks';

  @override
  String get postUnsavedSnack => 'Removed from bookmarks';

  @override
  String get postShareLinkCopied => 'Link copied';

  @override
  String get postOwnPostMsg => 'This is your own post';

  @override
  String get postFactoryNotFound => 'Factory not found';

  @override
  String postReviewsLink(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count reviews',
      one: '1 review',
      zero: 'No reviews',
    );
    return '$_temp0';
  }

  @override
  String get searchHint => 'Search by hashtags, factories, items…';

  @override
  String get searchIdleHint => 'Start typing to search posts';

  @override
  String get searchTooShort => 'Type at least 2 characters';

  @override
  String get searchNoResults => 'Nothing found';

  @override
  String get searchFilters => 'Filters';

  @override
  String get searchFiltersPriceUsd => 'Price (USD)';

  @override
  String get searchFiltersFrom => 'From';

  @override
  String get searchFiltersTo => 'To';

  @override
  String get searchFiltersMoqMax => 'Max MOQ';

  @override
  String get searchFiltersCountry => 'Country';

  @override
  String get searchFiltersCountryAll => 'All';

  @override
  String get searchFiltersHotDeal => 'Hot deals only';

  @override
  String get searchFiltersReset => 'Reset';

  @override
  String get searchFiltersApply => 'Apply';

  @override
  String get chatTitle => 'Messages';

  @override
  String get chatNoMessages => 'No messages';

  @override
  String get chatStartHint =>
      'Send the first message — discuss prices, MOQ, shipping';

  @override
  String get chatInputHint => 'Message…';

  @override
  String get chatNoChats => 'No chats yet';

  @override
  String get chatNoChatsHint =>
      'Open a post and tap «Message factory» to start';

  @override
  String get chatPartnerBuyer => 'Buyer';

  @override
  String get chatPartnerFactory => 'Factory';

  @override
  String get profileTitle => 'Profile';

  @override
  String get profileLogout => 'Log out';

  @override
  String get profileEdit => 'Edit profile';

  @override
  String get profileFollowers => 'Followers';

  @override
  String get profileFollowing => 'Following';

  @override
  String get profileMySaves => 'My bookmarks';

  @override
  String get profileSettings => 'Settings';

  @override
  String get profileReferralCode => 'Referral code';

  @override
  String get profileLanguage => 'Language';

  @override
  String get profileCurrency => 'Currency';

  @override
  String get settingsTitle => 'Settings';

  @override
  String get settingsAccount => 'Account';

  @override
  String get settingsPhone => 'Phone';

  @override
  String get settingsLanguageRu => 'Russian';

  @override
  String get settingsLanguageEn => 'English';

  @override
  String get settingsLanguageZh => '中文';

  @override
  String get settingsNotifications => 'Notifications';

  @override
  String get settingsPushNotifications => 'Push notifications';

  @override
  String get settingsPushMaster => 'All push notifications';

  @override
  String get settingsNotifLikes => 'Likes';

  @override
  String get settingsNotifComments => 'Comments';

  @override
  String get settingsNotifMessages => 'Messages';

  @override
  String get settingsNotifReviews => 'Reviews';

  @override
  String get settingsNotifGroupBuy => 'Group buys';

  @override
  String get settingsPushUpdateError => 'Failed to update';

  @override
  String get settingsQuietHours => 'Quiet hours';

  @override
  String get settingsPrivacy => 'Privacy';

  @override
  String get settingsBlocked => 'Blocked users';

  @override
  String get settingsAbout => 'About';

  @override
  String get settingsVersion => 'Version';

  @override
  String get settingsContactSupport => 'Contact support';

  @override
  String get settingsTermsOfService => 'Terms of service';

  @override
  String get settingsPrivacyPolicy => 'Privacy policy';

  @override
  String get notificationsTitle => 'Notifications';

  @override
  String get notificationsMarkAllRead => 'Mark all read';

  @override
  String get notificationsEmpty => 'No notifications';

  @override
  String reviewsTitle(String factoryName) {
    return 'Reviews about $factoryName';
  }

  @override
  String get reviewsWrite => 'Write a review';

  @override
  String get reviewsEmpty => 'No reviews yet';

  @override
  String get reviewsRating => 'Rating';

  @override
  String get reviewsComment => 'Comment';

  @override
  String get reviewsBeFirst => 'Be the first to review this factory';

  @override
  String get reviewsNewTitle => 'New review';

  @override
  String get reviewsEditTitle => 'Edit review';

  @override
  String get reviewsCommentHint =>
      'Tell about your experience — quality, shipping, packaging, communication';

  @override
  String get reviewsPublish => 'Publish review';

  @override
  String get reviewsSaveChanges => 'Save changes';

  @override
  String get reviewsPublished => 'Review published';

  @override
  String get reviewsUpdated => 'Review updated';

  @override
  String get postDetailTitle => 'Product';

  @override
  String get postPriceLabel => 'Price';

  @override
  String postSpecsMoq(int moq) {
    return 'Min order: $moq pcs';
  }

  @override
  String postSpecsShipping(int days) {
    return 'Shipping: $days days';
  }

  @override
  String get postSpecsStockInStock => 'In stock';

  @override
  String get postSpecsStockOutOfStock => 'Out of stock';

  @override
  String get postSpecsStockOnDemand => 'On demand';

  @override
  String get postPriceTiers => 'Volume pricing';

  @override
  String postPriceTierFromQty(int qty) {
    return 'from $qty pcs';
  }

  @override
  String get postCommentsTitle => 'Comments';

  @override
  String get postCommentInputHint => 'Write a comment…';

  @override
  String get postCommentSend => 'Send';

  @override
  String get postNoComments => 'No comments yet';

  @override
  String get postFirstComment => 'Be the first to comment';

  @override
  String postFollowed(String factory) {
    return 'Following $factory';
  }

  @override
  String postUnfollowed(String factory) {
    return 'Unfollowed $factory';
  }

  @override
  String get postFollow => 'Follow';

  @override
  String get postUnfollow => 'Unfollow';

  @override
  String get postDelete => 'Delete post';

  @override
  String get postDeleteConfirm => 'Delete this post?';

  @override
  String get postDeleteConfirmBody => 'This action cannot be undone.';

  @override
  String get postDeleted => 'Post deleted';

  @override
  String postDeletedWithTitle(String title) {
    return 'Post «$title» deleted';
  }

  @override
  String postLikeError(String error) {
    return 'Failed to like: $error';
  }

  @override
  String postUnlikeError(String error) {
    return 'Failed to unlike: $error';
  }

  @override
  String postSaveError(String error) {
    return 'Failed to save: $error';
  }

  @override
  String get groupBuyTitle => 'Group buy';

  @override
  String groupBuyProgress(int current, int target) {
    return '$current / $target pcs';
  }

  @override
  String groupBuyParticipants(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count participants',
      one: '1 participant',
      zero: 'No participants',
    );
    return '$_temp0';
  }

  @override
  String groupBuyDeadline(String date) {
    return 'Deadline: $date';
  }

  @override
  String get groupBuyJoin => 'Join';

  @override
  String get groupBuyLeave => 'Leave';

  @override
  String get groupBuyEdit => 'Edit my order';

  @override
  String get groupBuyGoalReached => 'Goal reached! 🎉';

  @override
  String get groupBuyExpired => 'Deadline passed';

  @override
  String get groupBuyJoinSheetTitle => 'Join group buy';

  @override
  String get groupBuyQuantity => 'Quantity';

  @override
  String get groupBuyEstimatedTotal => 'Estimated total';

  @override
  String get groupBuyOwnPost => 'This is your own group buy';

  @override
  String groupBuyJoinedSnack(int qty, int total) {
    return 'You\'re in: $qty pcs. Collected: $total';
  }

  @override
  String get groupBuyLeaveConfirmTitle => 'Cancel participation?';

  @override
  String get groupBuyLeaveConfirmBody =>
      'Your order will be removed. You can join again later.';

  @override
  String get groupBuyLeaveConfirmAction => 'Cancel';

  @override
  String get createPostTitle => 'New post';

  @override
  String get createPostType => 'Post type';

  @override
  String get createPostTypeProduct => 'Product';

  @override
  String get createPostTypeReel => 'Reel';

  @override
  String get createPostTypeHotDeal => 'Hot deal';

  @override
  String get createPostTypeGroupBuy => 'Group buy';

  @override
  String get createPostMedia => 'Media';

  @override
  String get createPostAddPhoto => 'Photo';

  @override
  String get createPostAddVideo => 'Video';

  @override
  String get createPostName => 'Title';

  @override
  String get createPostNameHint => 'Short and clear product name';

  @override
  String get createPostDescription => 'Description';

  @override
  String get createPostDescriptionHint =>
      'Materials, features, packaging, customization options';

  @override
  String get createPostPrice => 'Price';

  @override
  String get createPostPriceCurrency => 'Currency';

  @override
  String get createPostMoq => 'Minimum order quantity';

  @override
  String get createPostShippingDays => 'Shipping days';

  @override
  String get createPostStockStatus => 'Stock status';

  @override
  String get createPostHashtagsLabel => 'Hashtags';

  @override
  String get createPostHashtagHint => 'tag (without #)';

  @override
  String get createPostAddHashtag => 'Add';

  @override
  String get createPostHashtagMaxLimit => 'Maximum 20 hashtags';

  @override
  String get createPostHashtagDuplicate => 'Already added';

  @override
  String get createPostPublish => 'Publish';

  @override
  String get createPostPublished => 'Post published!';

  @override
  String get createPostError => 'Failed to publish';

  @override
  String get createPostNoMedia => 'Add at least one photo or video';

  @override
  String get createPostFactoryOnly => 'Only factories can publish posts';

  @override
  String get editProfileTitle => 'Edit profile';

  @override
  String get editProfileAvatar => 'Avatar';

  @override
  String get editProfilePickAvatar => 'Choose photo';

  @override
  String get editProfileName => 'Your name';

  @override
  String get editProfileCompanyName => 'Company name';

  @override
  String get editProfileCountry => 'Country';

  @override
  String get editProfileCity => 'City';

  @override
  String get editProfileSaved => 'Profile updated';

  @override
  String hashtagScreenTitle(String tag) {
    return 'Posts with #$tag';
  }

  @override
  String get hashtagEmpty => 'No posts with this hashtag';

  @override
  String get hashtagBeFirst => 'Be the first to post with this hashtag';

  @override
  String get savesTitle => 'My bookmarks';

  @override
  String get savesEmpty => 'No bookmarks yet';

  @override
  String get savesEmptyHint =>
      'Tap the bookmark icon on any post to save it here';

  @override
  String savesLoadError(String error) {
    return 'Failed to load bookmarks: $error';
  }

  @override
  String savesLoadErrorHttp(int code) {
    return 'Failed to load bookmarks (HTTP $code)';
  }

  @override
  String get countryNameKZ => '🇰🇿 Kazakhstan';

  @override
  String get countryNameRU => '🇷🇺 Russia';

  @override
  String get countryNameCN => '🇨🇳 China';

  @override
  String get countryNameUZ => '🇺🇿 Uzbekistan';

  @override
  String get countryNameKG => '🇰🇬 Kyrgyzstan';

  @override
  String get countryNameBY => '🇧🇾 Belarus';

  @override
  String get countryNameTR => '🇹🇷 Turkey';

  @override
  String get followersTitle => 'Followers';

  @override
  String get followingTitle => 'Following';

  @override
  String get followNoFollowers => 'No followers yet';

  @override
  String get followNoFollowing => 'Not following anyone yet';

  @override
  String publicProfileFollowers(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count followers',
      one: '1 follower',
      zero: '0 followers',
    );
    return '$_temp0';
  }

  @override
  String get publicProfilePosts => 'Posts';

  @override
  String get publicProfileNoPosts => 'No posts yet';

  @override
  String get publicProfileAboutFactory => 'About factory';

  @override
  String get publicProfileTrustScore => 'Trust Score';

  @override
  String publicProfileTotalProducts(int count) {
    return 'Products: $count';
  }

  @override
  String publicProfileTotalDeals(int count) {
    return 'Deals: $count';
  }

  @override
  String notifLikeText(String actor) {
    return '$actor liked your post';
  }

  @override
  String notifCommentText(String actor) {
    return '$actor commented on your post';
  }

  @override
  String notifMessageText(String actor) {
    return '$actor sent you a message';
  }

  @override
  String notifReviewText(String actor) {
    return '$actor left a review';
  }

  @override
  String get notifGroupBuyCompletedText => 'Group buy successfully collected!';

  @override
  String get commonJustNow => 'just now';

  @override
  String commonMinutesShort(int count) {
    return '${count}m';
  }

  @override
  String commonHoursShort(int count) {
    return '${count}h';
  }

  @override
  String commonDaysShort(int count) {
    return '${count}d';
  }

  @override
  String get commonExpired => 'expired';

  @override
  String get commonLessThanMinute => '<1m';

  @override
  String get commentsSheetEmptyTitle => 'No comments yet';

  @override
  String get commentsSheetEmptySubtitle =>
      'Be the first — ask the factory a question.';

  @override
  String get groupBuyStatusCollecting => 'Group forming';

  @override
  String groupBuyDealText(int target, String price, String currency) {
    return 'At $target pcs price drops to $price $currency/pc';
  }

  @override
  String get groupBuyCollected => 'Collected';

  @override
  String get groupBuyParticipantsLabel => 'Participants';

  @override
  String get groupBuyRemaining => 'Left';

  @override
  String groupBuyParticipating(int qty) {
    return 'You\'re in: $qty pcs';
  }

  @override
  String get groupBuyEditMyOrder => 'Edit';

  @override
  String get groupBuyLeaveShort => 'Cancel';

  @override
  String groupBuyJoinWithRemaining(int count) {
    return 'Join · $count pcs left';
  }

  @override
  String get groupBuyJoinSheetTitleLong => 'Your group order';

  @override
  String get groupBuyJoinSheetSubtitle =>
      'How many pieces do you want to order';

  @override
  String get groupBuyJoinSheetEstimated => 'Estimated:';

  @override
  String get groupBuyJoinSheetConfirm => 'Confirm';

  @override
  String get reelsTitle => 'Reels';

  @override
  String get reelsEmptyTitle => 'No reels yet';

  @override
  String get reelsEmptySubtitle =>
      'Factories haven\'t posted any videos.\nCheck back later.';

  @override
  String get reelsMore => 'More';

  @override
  String publicProfileReviewsCountPlural(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count reviews',
      one: '1 review',
      zero: 'no reviews',
    );
    return '$_temp0';
  }

  @override
  String publicProfileReviewsSeeAll(String count) {
    return '$count — see all';
  }

  @override
  String get publicProfileNoReviewsTitle => 'No reviews';

  @override
  String get publicProfileGetFirstReview => 'Get your first review';

  @override
  String get publicProfileBeFirstReviewer => 'Be the first to leave a review';

  @override
  String get publicProfileFollowersLabel => 'Followers';

  @override
  String get publicProfileFollowingLabel => 'Following';

  @override
  String get createPostMediaTitle => 'Product media (up to 10)';

  @override
  String createPostMediaCount(int count) {
    return '$count/10 media';
  }

  @override
  String get createPostMediaMaxReached => 'Up to 10 media';

  @override
  String get createPostVideoTooLarge => 'Video must be under 50 MB';

  @override
  String createPostPickPhotosError(String error) {
    return 'Failed to pick photo: $error';
  }

  @override
  String createPostPickVideoError(String error) {
    return 'Failed to pick video: $error';
  }

  @override
  String createPostPublishedWithTitle(String title) {
    return 'Post «$title» published';
  }

  @override
  String get createPostNoMediaSnack => 'Add at least one photo';

  @override
  String get createPostTitleRequired => 'Title *';

  @override
  String get createPostTitleHintExample => 'e.g. Oversize cotton t-shirts';

  @override
  String get createPostTitleTooShort => 'At least 3 characters';

  @override
  String get createPostDescriptionHintExample =>
      'Materials, specs, certifications…';

  @override
  String get createPostPriceRequired => 'Price *';

  @override
  String get createPostPriceHintExample => '4.50';

  @override
  String get createPostFieldRequired => 'Required';

  @override
  String get createPostFieldInvalid => 'Invalid';

  @override
  String get createPostMoqLabel => 'MOQ (min. batch)';

  @override
  String get createPostMoqMin => '≥ 1';

  @override
  String get createPostShippingLabel => 'Shipping (days)';

  @override
  String get createPostShippingMin => '≥ 0';

  @override
  String get createPostStockInStock => 'In stock';

  @override
  String get createPostStockPreOrder => 'Pre-order';

  @override
  String get createPostStockOutOfStock => 'Out of stock';

  @override
  String get createPostCurrencyRequired => 'Currency *';

  @override
  String get createPostHashtagInvalidChars =>
      'Hashtag can only contain letters, digits, _ and -';

  @override
  String get createPostHashtagHintExample => 'tshirt, wholesale, cotton…';

  @override
  String get editProfileNameLabel => 'Name';

  @override
  String get editProfileNameHint => 'What\'s your name?';

  @override
  String get editProfileCompanyRequiredLabel => 'Company name *';

  @override
  String get editProfileCompanyHint => 'Guangzhou Apparel Co.';

  @override
  String get editProfileCompanyRequiredError => 'Required for factories';

  @override
  String get editProfileLanguageLabel => 'Language';

  @override
  String get editProfileCurrencyLabel => 'Currency';

  @override
  String get editProfileCountryLabel => 'Country';

  @override
  String get editProfileCityLabel => 'City';

  @override
  String get editProfileCityHint => 'Almaty';

  @override
  String editProfileAvatarUploadError(String error) {
    return 'Failed to upload avatar: $error';
  }

  @override
  String reviewsListTitle(String factoryName) {
    return 'Reviews of $factoryName';
  }

  @override
  String get reviewsListFabWrite => 'Write review';

  @override
  String get reviewsListEmptyTitle => 'No reviews yet';

  @override
  String get reviewsListBeFirstLong =>
      'Be the first to leave a review of this factory.';

  @override
  String get profileLogoutConfirmTitle => 'Log out?';

  @override
  String get profileLogoutConfirmBody =>
      'Your session will end and you will need to sign in via SMS again.';

  @override
  String get profileLogoutConfirmAction => 'Log out';

  @override
  String get profileEditTooltip => 'Edit';

  @override
  String get profileRefreshTooltip => 'Refresh';

  @override
  String get profileReferralCopyTooltip => 'Copy';

  @override
  String profileReferralCopied(String code) {
    return 'Referral code $code copied';
  }

  @override
  String get profileLoadError => 'Failed to load profile';

  @override
  String get profileUpdatedSnack => 'Profile updated';

  @override
  String get profileNoName => 'No name';

  @override
  String get profileAboutFactory => 'About factory';

  @override
  String profileFactoryTotalProducts(int count) {
    return 'Products: $count';
  }

  @override
  String profileFactoryTotalDeals(int count) {
    return 'Deals: $count';
  }

  @override
  String profileFactoryTrustScore(int score) {
    return 'Trust Score: $score';
  }

  @override
  String get profileLanguageLabel => 'Language';

  @override
  String get profileCurrencyLabel => 'Currency';

  @override
  String get profileCountryLabel => 'Country';

  @override
  String get profileCityLabel => 'City';

  @override
  String get profileReferralCodeLabel => 'Referral code';

  @override
  String get profileMyPosts => 'My posts';

  @override
  String get profileNoPostsYet => 'No posts yet';

  @override
  String feedLikesCount(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count likes',
      one: '1 like',
      zero: '0 likes',
    );
    return '$_temp0';
  }

  @override
  String feedMoqShort(int moq) {
    return 'MOQ: $moq pcs';
  }

  @override
  String feedShippingDaysShort(int days) {
    return '$days days';
  }

  @override
  String feedPriceSheetLine(int moq, int days) {
    return 'MOQ: $moq pcs • Shipping: $days days';
  }

  @override
  String feedSaveError(String error) {
    return 'Failed to save: $error';
  }

  @override
  String feedLikeErrorLike(String error) {
    return 'Failed to like: $error';
  }

  @override
  String feedLikeErrorUnlike(String error) {
    return 'Failed to unlike: $error';
  }

  @override
  String get feedCannotDetermineFactory => 'Failed to detect factory';

  @override
  String feedShareLinkCopied(String url) {
    return 'Link copied: $url';
  }

  @override
  String get feedEmptyFollowingTitle => 'No posts from follows';

  @override
  String get feedEmptyFollowingBody =>
      'Follow some factories in the «All» tab and their posts will appear here.';

  @override
  String get feedEmptyHotDealTitle => 'No deals yet';

  @override
  String get feedEmptyHotDealBody =>
      'Factories haven\'t announced any Hot Deals. Check back later — or try the «All» tab.';

  @override
  String get feedEmptyGenericTitle => 'Feed is empty';

  @override
  String get feedEmptyGenericBody =>
      'No posts from factories yet.\nPull down to refresh.';

  @override
  String get feedRealtimeConnected => 'Real-time connected';

  @override
  String get feedRealtimeConnecting => 'Connecting…';

  @override
  String get feedRealtimeError => 'Connection error, retrying';

  @override
  String get feedRealtimeDisconnected => 'No real-time connection';

  @override
  String get feedReelsTooltip => 'Reels';

  @override
  String get feedNotificationsTooltip => 'Notifications';

  @override
  String get searchHintTooltipClear => 'Clear';

  @override
  String get searchResetFiltersTooltip => 'Reset filters';

  @override
  String get searchIdleTitle => 'Search products';

  @override
  String get searchIdleBody =>
      'Enter a name, hashtag (#tshirt) or factory brand — at least 2 characters.';

  @override
  String searchNoResultsBody(String query) {
    return 'No results for «$query». Try different words or hashtags.';
  }

  @override
  String get searchFiltersHotShort => '🔥 Hot deals';

  @override
  String get chatErrorRetry => 'Retry';

  @override
  String get chatNoMessagesShort => 'No messages';

  @override
  String get chatYouPrefix => 'You:';

  @override
  String get chatTimeNow => 'now';

  @override
  String chatTimeMinutesShort(int count) {
    return '${count}m';
  }

  @override
  String chatTimeDaysShort(int count) {
    return '${count}d';
  }

  @override
  String notifActorLiked(String actor, String ref) {
    return '$actor liked$ref';
  }

  @override
  String notifActorCommented(String actor, String ref) {
    return '$actor commented on$ref';
  }

  @override
  String notifActorMessage(String actor) {
    return '$actor sent you a message';
  }

  @override
  String notifActorReview(String actor) {
    return '$actor left a review';
  }

  @override
  String notifGroupBuyCompletedWithRef(String ref) {
    return 'Group buy successfully collected!$ref';
  }

  @override
  String get notifYourPostRef => ' your post';

  @override
  String notifPostRef(String title) {
    return ' «$title»';
  }

  @override
  String get notifTimeJustNow => 'just now';

  @override
  String notifTimeMinutesAgo(int count) {
    return '${count}m ago';
  }

  @override
  String notifTimeHoursAgo(int count) {
    return '${count}h ago';
  }

  @override
  String notifTimeDaysAgo(int count) {
    return '${count}d ago';
  }

  @override
  String get storyAddLabel => 'Add';

  @override
  String get storyPublishedSnack => 'Story published';

  @override
  String get storyPhotoUploadError => 'Failed to upload photo';

  @override
  String get storyTimeJustNow => 'just now';

  @override
  String storyTimeMinutesShort(int count) {
    return '${count}m';
  }

  @override
  String storyTimeHoursShort(int count) {
    return '${count}h';
  }

  @override
  String storyTimeDaysShort(int count) {
    return '${count}d';
  }

  @override
  String get authPhoneInvalidFormat => 'Enter phone in format +79991234567';

  @override
  String get postDetailSavedTooltip => 'Saved';

  @override
  String get postDetailSaveTooltip => 'Save';

  @override
  String get onboardingSkip => 'Skip';

  @override
  String get onboardingNext => 'Next';

  @override
  String get onboardingGetStarted => 'Get started';

  @override
  String get feedPriceOnRequest => 'Price on request';

  @override
  String get settingsQuietHoursOff => 'Off';

  @override
  String get postMenuReport => 'Report';

  @override
  String get postMenuBlock => 'Block user';

  @override
  String get blockUserConfirmTitle => 'Block user?';

  @override
  String get blockUserConfirmBody =>
      'Their posts and messages will no longer be visible to you. You can unblock later in Settings.';

  @override
  String get blockUserAction => 'Block';

  @override
  String get blockUserDone => 'User blocked';

  @override
  String get reportTitle => 'Report content';

  @override
  String get reportSubtitle =>
      'Choose a reason. Our team will review the report.';

  @override
  String get reportDescriptionLabel => 'Additional details (optional)';

  @override
  String get reportDescriptionHint => 'Describe what\'s wrong';

  @override
  String get reportSubmit => 'Send report';

  @override
  String get reportSent => 'Report sent. Thank you!';

  @override
  String get searchHistoryTitle => 'Recent searches';

  @override
  String get searchHistoryClear => 'Clear';

  @override
  String get settingsTheme => 'Theme';

  @override
  String get settingsThemeLight => 'Light';

  @override
  String get settingsThemeDark => 'Dark';

  @override
  String get settingsThemeSystem => 'System';

  @override
  String get createPostCamera => 'Camera';

  @override
  String get createPostVideoWrongFormat =>
      'Video format not supported. Please select an MP4 file.';

  @override
  String createPostVideoTooBig(String size) {
    return 'Video is too large ($size MB). Maximum is 30 MB. Try a shorter video or lower quality.';
  }

  @override
  String get settingsComingSoon => 'Coming soon';

  @override
  String get onboardingTitle1 => 'Direct from Chinese factories';

  @override
  String get onboardingSubtitle1 =>
      'Skip middlemen — buy electronics, fashion and goods straight from verified manufacturers';

  @override
  String get onboardingTitle2 => 'Safe deals & group buys';

  @override
  String get onboardingSubtitle2 =>
      'Combine orders with other buyers to unlock factory pricing and better shipping rates';

  @override
  String get onboardingTitle3 => 'Chat with factories instantly';

  @override
  String get onboardingSubtitle3 =>
      'Negotiate prices, ask for samples and track shipments — all in one place';

  @override
  String get onboardingTitle4 => 'Ready to start?';

  @override
  String get onboardingSubtitle4 =>
      'Sign up in 30 seconds with your phone number — no email, no paperwork';
}
