import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:intl/intl.dart' as intl;

import 'app_localizations_en.dart';
import 'app_localizations_ru.dart';
import 'app_localizations_zh.dart';

// ignore_for_file: type=lint

/// Callers can lookup localized strings with an instance of AppLocalizations
/// returned by `AppLocalizations.of(context)`.
///
/// Applications need to include `AppLocalizations.delegate()` in their app's
/// `localizationDelegates` list, and the locales they support in the app's
/// `supportedLocales` list. For example:
///
/// ```dart
/// import 'l10n/app_localizations.dart';
///
/// return MaterialApp(
///   localizationsDelegates: AppLocalizations.localizationsDelegates,
///   supportedLocales: AppLocalizations.supportedLocales,
///   home: MyApplicationHome(),
/// );
/// ```
///
/// ## Update pubspec.yaml
///
/// Please make sure to update your pubspec.yaml to include the following
/// packages:
///
/// ```yaml
/// dependencies:
///   # Internationalization support.
///   flutter_localizations:
///     sdk: flutter
///   intl: any # Use the pinned version from flutter_localizations
///
///   # Rest of dependencies
/// ```
///
/// ## iOS Applications
///
/// iOS applications define key application metadata, including supported
/// locales, in an Info.plist file that is built into the application bundle.
/// To configure the locales supported by your app, you’ll need to edit this
/// file.
///
/// First, open your project’s ios/Runner.xcworkspace Xcode workspace file.
/// Then, in the Project Navigator, open the Info.plist file under the Runner
/// project’s Runner folder.
///
/// Next, select the Information Property List item, select Add Item from the
/// Editor menu, then select Localizations from the pop-up menu.
///
/// Select and expand the newly-created Localizations item then, for each
/// locale your application supports, add a new item and select the locale
/// you wish to add from the pop-up menu in the Value field. This list should
/// be consistent with the languages listed in the AppLocalizations.supportedLocales
/// property.
abstract class AppLocalizations {
  AppLocalizations(String locale)
    : localeName = intl.Intl.canonicalizedLocale(locale.toString());

  final String localeName;

  static AppLocalizations? of(BuildContext context) {
    return Localizations.of<AppLocalizations>(context, AppLocalizations);
  }

  static const LocalizationsDelegate<AppLocalizations> delegate =
      _AppLocalizationsDelegate();

  /// A list of this localizations delegate along with the default localizations
  /// delegates.
  ///
  /// Returns a list of localizations delegates containing this delegate along with
  /// GlobalMaterialLocalizations.delegate, GlobalCupertinoLocalizations.delegate,
  /// and GlobalWidgetsLocalizations.delegate.
  ///
  /// Additional delegates can be added by appending to this list in
  /// MaterialApp. This list does not have to be used at all if a custom list
  /// of delegates is preferred or required.
  static const List<LocalizationsDelegate<dynamic>> localizationsDelegates =
      <LocalizationsDelegate<dynamic>>[
        delegate,
        GlobalMaterialLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
      ];

  /// A list of this localizations delegate's supported locales.
  static const List<Locale> supportedLocales = <Locale>[
    Locale('en'),
    Locale('ru'),
    Locale('zh'),
  ];

  /// No description provided for @appTitle.
  ///
  /// In en, this message translates to:
  /// **'Biz Chat'**
  String get appTitle;

  /// No description provided for @navHome.
  ///
  /// In en, this message translates to:
  /// **'Home'**
  String get navHome;

  /// No description provided for @navSearch.
  ///
  /// In en, this message translates to:
  /// **'Search'**
  String get navSearch;

  /// No description provided for @navCreate.
  ///
  /// In en, this message translates to:
  /// **'Create'**
  String get navCreate;

  /// No description provided for @navChats.
  ///
  /// In en, this message translates to:
  /// **'Chats'**
  String get navChats;

  /// No description provided for @navProfile.
  ///
  /// In en, this message translates to:
  /// **'Profile'**
  String get navProfile;

  /// No description provided for @commonOk.
  ///
  /// In en, this message translates to:
  /// **'OK'**
  String get commonOk;

  /// No description provided for @commonCancel.
  ///
  /// In en, this message translates to:
  /// **'Cancel'**
  String get commonCancel;

  /// No description provided for @commonSave.
  ///
  /// In en, this message translates to:
  /// **'Save'**
  String get commonSave;

  /// No description provided for @commonDelete.
  ///
  /// In en, this message translates to:
  /// **'Delete'**
  String get commonDelete;

  /// No description provided for @commonRetry.
  ///
  /// In en, this message translates to:
  /// **'Retry'**
  String get commonRetry;

  /// No description provided for @commonClose.
  ///
  /// In en, this message translates to:
  /// **'Close'**
  String get commonClose;

  /// No description provided for @commonContinue.
  ///
  /// In en, this message translates to:
  /// **'Continue'**
  String get commonContinue;

  /// No description provided for @commonLoading.
  ///
  /// In en, this message translates to:
  /// **'Loading…'**
  String get commonLoading;

  /// No description provided for @commonError.
  ///
  /// In en, this message translates to:
  /// **'Error'**
  String get commonError;

  /// No description provided for @commonBack.
  ///
  /// In en, this message translates to:
  /// **'Back'**
  String get commonBack;

  /// No description provided for @commonOpen.
  ///
  /// In en, this message translates to:
  /// **'Open'**
  String get commonOpen;

  /// No description provided for @commonShare.
  ///
  /// In en, this message translates to:
  /// **'Share'**
  String get commonShare;

  /// No description provided for @commonCopy.
  ///
  /// In en, this message translates to:
  /// **'Copy'**
  String get commonCopy;

  /// No description provided for @commonCopied.
  ///
  /// In en, this message translates to:
  /// **'Copied'**
  String get commonCopied;

  /// No description provided for @commonNo.
  ///
  /// In en, this message translates to:
  /// **'No'**
  String get commonNo;

  /// No description provided for @authPhoneTitle.
  ///
  /// In en, this message translates to:
  /// **'Sign in'**
  String get authPhoneTitle;

  /// No description provided for @authPhoneHint.
  ///
  /// In en, this message translates to:
  /// **'Phone number'**
  String get authPhoneHint;

  /// No description provided for @authPhoneSubtitle.
  ///
  /// In en, this message translates to:
  /// **'We\'ll send a confirmation code via SMS'**
  String get authPhoneSubtitle;

  /// No description provided for @authPhoneSendCode.
  ///
  /// In en, this message translates to:
  /// **'Send code'**
  String get authPhoneSendCode;

  /// No description provided for @authCodeTitle.
  ///
  /// In en, this message translates to:
  /// **'Enter code'**
  String get authCodeTitle;

  /// No description provided for @authCodeHint.
  ///
  /// In en, this message translates to:
  /// **'6-digit code'**
  String get authCodeHint;

  /// No description provided for @authCodeSubtitle.
  ///
  /// In en, this message translates to:
  /// **'Enter the code we sent to {phone}'**
  String authCodeSubtitle(String phone);

  /// No description provided for @authCodeResend.
  ///
  /// In en, this message translates to:
  /// **'Resend'**
  String get authCodeResend;

  /// No description provided for @authCodeResendIn.
  ///
  /// In en, this message translates to:
  /// **'Resend in {seconds}s'**
  String authCodeResendIn(int seconds);

  /// No description provided for @authRoleTitle.
  ///
  /// In en, this message translates to:
  /// **'Who are you?'**
  String get authRoleTitle;

  /// No description provided for @authRoleBuyer.
  ///
  /// In en, this message translates to:
  /// **'Buyer'**
  String get authRoleBuyer;

  /// No description provided for @authRoleBuyerDesc.
  ///
  /// In en, this message translates to:
  /// **'I want to buy from factories'**
  String get authRoleBuyerDesc;

  /// No description provided for @authRoleFactory.
  ///
  /// In en, this message translates to:
  /// **'Factory'**
  String get authRoleFactory;

  /// No description provided for @authRoleFactoryDesc.
  ///
  /// In en, this message translates to:
  /// **'I produce and want to sell'**
  String get authRoleFactoryDesc;

  /// No description provided for @authRolePickToContinue.
  ///
  /// In en, this message translates to:
  /// **'Pick an account type to continue'**
  String get authRolePickToContinue;

  /// No description provided for @authRolePickRole.
  ///
  /// In en, this message translates to:
  /// **'Pick an account type'**
  String get authRolePickRole;

  /// No description provided for @authRoleNewCodeHint.
  ///
  /// In en, this message translates to:
  /// **'Enter the new SMS code'**
  String get authRoleNewCodeHint;

  /// No description provided for @authRoleCodeRequired.
  ///
  /// In en, this message translates to:
  /// **'Enter the SMS code (we sent a new one)'**
  String get authRoleCodeRequired;

  /// No description provided for @authRoleFinishButton.
  ///
  /// In en, this message translates to:
  /// **'Finish sign-up'**
  String get authRoleFinishButton;

  /// No description provided for @authCodeTooShort.
  ///
  /// In en, this message translates to:
  /// **'Enter the SMS code'**
  String get authCodeTooShort;

  /// No description provided for @feedAll.
  ///
  /// In en, this message translates to:
  /// **'All'**
  String get feedAll;

  /// No description provided for @feedFollowing.
  ///
  /// In en, this message translates to:
  /// **'Following'**
  String get feedFollowing;

  /// No description provided for @feedHotDeals.
  ///
  /// In en, this message translates to:
  /// **'Hot deals'**
  String get feedHotDeals;

  /// No description provided for @feedEmptyTitle.
  ///
  /// In en, this message translates to:
  /// **'No posts yet'**
  String get feedEmptyTitle;

  /// No description provided for @feedEmptySubtitle.
  ///
  /// In en, this message translates to:
  /// **'Pull down to refresh'**
  String get feedEmptySubtitle;

  /// No description provided for @feedLoadError.
  ///
  /// In en, this message translates to:
  /// **'Failed to load feed'**
  String get feedLoadError;

  /// No description provided for @feedTrustScore.
  ///
  /// In en, this message translates to:
  /// **'Trust Score: {score}'**
  String feedTrustScore(int score);

  /// No description provided for @feedMoq.
  ///
  /// In en, this message translates to:
  /// **'MOQ {moq} pcs'**
  String feedMoq(int moq);

  /// No description provided for @feedShippingDays.
  ///
  /// In en, this message translates to:
  /// **'Shipping {days} days'**
  String feedShippingDays(int days);

  /// No description provided for @postWriteToFactory.
  ///
  /// In en, this message translates to:
  /// **'Message factory'**
  String get postWriteToFactory;

  /// No description provided for @postPriceSheetTitle.
  ///
  /// In en, this message translates to:
  /// **'Price'**
  String get postPriceSheetTitle;

  /// No description provided for @postDescription.
  ///
  /// In en, this message translates to:
  /// **'Description'**
  String get postDescription;

  /// No description provided for @postTranslate.
  ///
  /// In en, this message translates to:
  /// **'Translate'**
  String get postTranslate;

  /// No description provided for @postShowOriginal.
  ///
  /// In en, this message translates to:
  /// **'Show original'**
  String get postShowOriginal;

  /// No description provided for @postLikedSnack.
  ///
  /// In en, this message translates to:
  /// **'Liked'**
  String get postLikedSnack;

  /// No description provided for @postUnlikedSnack.
  ///
  /// In en, this message translates to:
  /// **'Unliked'**
  String get postUnlikedSnack;

  /// No description provided for @postSavedSnack.
  ///
  /// In en, this message translates to:
  /// **'Saved to bookmarks'**
  String get postSavedSnack;

  /// No description provided for @postUnsavedSnack.
  ///
  /// In en, this message translates to:
  /// **'Removed from bookmarks'**
  String get postUnsavedSnack;

  /// No description provided for @postShareLinkCopied.
  ///
  /// In en, this message translates to:
  /// **'Link copied'**
  String get postShareLinkCopied;

  /// No description provided for @postOwnPostMsg.
  ///
  /// In en, this message translates to:
  /// **'This is your own post'**
  String get postOwnPostMsg;

  /// No description provided for @postFactoryNotFound.
  ///
  /// In en, this message translates to:
  /// **'Factory not found'**
  String get postFactoryNotFound;

  /// No description provided for @postReviewsLink.
  ///
  /// In en, this message translates to:
  /// **'{count, plural, =0{No reviews} =1{1 review} other{{count} reviews}}'**
  String postReviewsLink(int count);

  /// No description provided for @searchHint.
  ///
  /// In en, this message translates to:
  /// **'Search by hashtags, factories, items…'**
  String get searchHint;

  /// No description provided for @searchIdleHint.
  ///
  /// In en, this message translates to:
  /// **'Start typing to search posts'**
  String get searchIdleHint;

  /// No description provided for @searchTooShort.
  ///
  /// In en, this message translates to:
  /// **'Type at least 2 characters'**
  String get searchTooShort;

  /// No description provided for @searchNoResults.
  ///
  /// In en, this message translates to:
  /// **'Nothing found'**
  String get searchNoResults;

  /// No description provided for @searchFilters.
  ///
  /// In en, this message translates to:
  /// **'Filters'**
  String get searchFilters;

  /// No description provided for @searchFiltersPriceUsd.
  ///
  /// In en, this message translates to:
  /// **'Price (USD)'**
  String get searchFiltersPriceUsd;

  /// No description provided for @searchFiltersFrom.
  ///
  /// In en, this message translates to:
  /// **'From'**
  String get searchFiltersFrom;

  /// No description provided for @searchFiltersTo.
  ///
  /// In en, this message translates to:
  /// **'To'**
  String get searchFiltersTo;

  /// No description provided for @searchFiltersMoqMax.
  ///
  /// In en, this message translates to:
  /// **'Max MOQ'**
  String get searchFiltersMoqMax;

  /// No description provided for @searchFiltersCountry.
  ///
  /// In en, this message translates to:
  /// **'Country'**
  String get searchFiltersCountry;

  /// No description provided for @searchFiltersCountryAll.
  ///
  /// In en, this message translates to:
  /// **'All'**
  String get searchFiltersCountryAll;

  /// No description provided for @searchFiltersHotDeal.
  ///
  /// In en, this message translates to:
  /// **'Hot deals only'**
  String get searchFiltersHotDeal;

  /// No description provided for @searchFiltersReset.
  ///
  /// In en, this message translates to:
  /// **'Reset'**
  String get searchFiltersReset;

  /// No description provided for @searchFiltersApply.
  ///
  /// In en, this message translates to:
  /// **'Apply'**
  String get searchFiltersApply;

  /// No description provided for @chatTitle.
  ///
  /// In en, this message translates to:
  /// **'Messages'**
  String get chatTitle;

  /// No description provided for @chatNoMessages.
  ///
  /// In en, this message translates to:
  /// **'No messages'**
  String get chatNoMessages;

  /// No description provided for @chatStartHint.
  ///
  /// In en, this message translates to:
  /// **'Send the first message — discuss prices, MOQ, shipping'**
  String get chatStartHint;

  /// No description provided for @chatInputHint.
  ///
  /// In en, this message translates to:
  /// **'Message…'**
  String get chatInputHint;

  /// No description provided for @chatNoChats.
  ///
  /// In en, this message translates to:
  /// **'No chats yet'**
  String get chatNoChats;

  /// No description provided for @chatNoChatsHint.
  ///
  /// In en, this message translates to:
  /// **'Open a post and tap «Message factory» to start'**
  String get chatNoChatsHint;

  /// No description provided for @chatPartnerBuyer.
  ///
  /// In en, this message translates to:
  /// **'Buyer'**
  String get chatPartnerBuyer;

  /// No description provided for @chatPartnerFactory.
  ///
  /// In en, this message translates to:
  /// **'Factory'**
  String get chatPartnerFactory;

  /// No description provided for @profileTitle.
  ///
  /// In en, this message translates to:
  /// **'Profile'**
  String get profileTitle;

  /// No description provided for @profileLogout.
  ///
  /// In en, this message translates to:
  /// **'Log out'**
  String get profileLogout;

  /// No description provided for @profileEdit.
  ///
  /// In en, this message translates to:
  /// **'Edit profile'**
  String get profileEdit;

  /// No description provided for @profileFollowers.
  ///
  /// In en, this message translates to:
  /// **'Followers'**
  String get profileFollowers;

  /// No description provided for @profileFollowing.
  ///
  /// In en, this message translates to:
  /// **'Following'**
  String get profileFollowing;

  /// No description provided for @profileMySaves.
  ///
  /// In en, this message translates to:
  /// **'My bookmarks'**
  String get profileMySaves;

  /// No description provided for @profileSettings.
  ///
  /// In en, this message translates to:
  /// **'Settings'**
  String get profileSettings;

  /// No description provided for @profileReferralCode.
  ///
  /// In en, this message translates to:
  /// **'Referral code'**
  String get profileReferralCode;

  /// No description provided for @profileLanguage.
  ///
  /// In en, this message translates to:
  /// **'Language'**
  String get profileLanguage;

  /// No description provided for @profileCurrency.
  ///
  /// In en, this message translates to:
  /// **'Currency'**
  String get profileCurrency;

  /// No description provided for @settingsTitle.
  ///
  /// In en, this message translates to:
  /// **'Settings'**
  String get settingsTitle;

  /// No description provided for @settingsAccount.
  ///
  /// In en, this message translates to:
  /// **'Account'**
  String get settingsAccount;

  /// No description provided for @settingsPhone.
  ///
  /// In en, this message translates to:
  /// **'Phone'**
  String get settingsPhone;

  /// No description provided for @settingsLanguageRu.
  ///
  /// In en, this message translates to:
  /// **'Russian'**
  String get settingsLanguageRu;

  /// No description provided for @settingsLanguageEn.
  ///
  /// In en, this message translates to:
  /// **'English'**
  String get settingsLanguageEn;

  /// No description provided for @settingsLanguageZh.
  ///
  /// In en, this message translates to:
  /// **'中文'**
  String get settingsLanguageZh;

  /// No description provided for @settingsNotifications.
  ///
  /// In en, this message translates to:
  /// **'Notifications'**
  String get settingsNotifications;

  /// No description provided for @settingsPushNotifications.
  ///
  /// In en, this message translates to:
  /// **'Push notifications'**
  String get settingsPushNotifications;

  /// No description provided for @settingsPushMaster.
  ///
  /// In en, this message translates to:
  /// **'All push notifications'**
  String get settingsPushMaster;

  /// No description provided for @settingsNotifLikes.
  ///
  /// In en, this message translates to:
  /// **'Likes'**
  String get settingsNotifLikes;

  /// No description provided for @settingsNotifComments.
  ///
  /// In en, this message translates to:
  /// **'Comments'**
  String get settingsNotifComments;

  /// No description provided for @settingsNotifMessages.
  ///
  /// In en, this message translates to:
  /// **'Messages'**
  String get settingsNotifMessages;

  /// No description provided for @settingsNotifReviews.
  ///
  /// In en, this message translates to:
  /// **'Reviews'**
  String get settingsNotifReviews;

  /// No description provided for @settingsNotifGroupBuy.
  ///
  /// In en, this message translates to:
  /// **'Group buys'**
  String get settingsNotifGroupBuy;

  /// No description provided for @settingsPushUpdateError.
  ///
  /// In en, this message translates to:
  /// **'Failed to update'**
  String get settingsPushUpdateError;

  /// No description provided for @settingsQuietHours.
  ///
  /// In en, this message translates to:
  /// **'Quiet hours'**
  String get settingsQuietHours;

  /// No description provided for @settingsPrivacy.
  ///
  /// In en, this message translates to:
  /// **'Privacy'**
  String get settingsPrivacy;

  /// No description provided for @settingsBlocked.
  ///
  /// In en, this message translates to:
  /// **'Blocked users'**
  String get settingsBlocked;

  /// No description provided for @settingsAbout.
  ///
  /// In en, this message translates to:
  /// **'About'**
  String get settingsAbout;

  /// No description provided for @settingsVersion.
  ///
  /// In en, this message translates to:
  /// **'Version'**
  String get settingsVersion;

  /// No description provided for @settingsContactSupport.
  ///
  /// In en, this message translates to:
  /// **'Contact support'**
  String get settingsContactSupport;

  /// No description provided for @settingsTermsOfService.
  ///
  /// In en, this message translates to:
  /// **'Terms of service'**
  String get settingsTermsOfService;

  /// No description provided for @settingsPrivacyPolicy.
  ///
  /// In en, this message translates to:
  /// **'Privacy policy'**
  String get settingsPrivacyPolicy;

  /// No description provided for @notificationsTitle.
  ///
  /// In en, this message translates to:
  /// **'Notifications'**
  String get notificationsTitle;

  /// No description provided for @notificationsMarkAllRead.
  ///
  /// In en, this message translates to:
  /// **'Mark all read'**
  String get notificationsMarkAllRead;

  /// No description provided for @notificationsEmpty.
  ///
  /// In en, this message translates to:
  /// **'No notifications'**
  String get notificationsEmpty;

  /// No description provided for @reviewsTitle.
  ///
  /// In en, this message translates to:
  /// **'Reviews about {factoryName}'**
  String reviewsTitle(String factoryName);

  /// No description provided for @reviewsWrite.
  ///
  /// In en, this message translates to:
  /// **'Write a review'**
  String get reviewsWrite;

  /// No description provided for @reviewsEmpty.
  ///
  /// In en, this message translates to:
  /// **'No reviews yet'**
  String get reviewsEmpty;

  /// No description provided for @reviewsRating.
  ///
  /// In en, this message translates to:
  /// **'Rating'**
  String get reviewsRating;

  /// No description provided for @reviewsComment.
  ///
  /// In en, this message translates to:
  /// **'Comment'**
  String get reviewsComment;

  /// No description provided for @reviewsBeFirst.
  ///
  /// In en, this message translates to:
  /// **'Be the first to review this factory'**
  String get reviewsBeFirst;

  /// No description provided for @reviewsNewTitle.
  ///
  /// In en, this message translates to:
  /// **'New review'**
  String get reviewsNewTitle;

  /// No description provided for @reviewsEditTitle.
  ///
  /// In en, this message translates to:
  /// **'Edit review'**
  String get reviewsEditTitle;

  /// No description provided for @reviewsCommentHint.
  ///
  /// In en, this message translates to:
  /// **'Tell about your experience — quality, shipping, packaging, communication'**
  String get reviewsCommentHint;

  /// No description provided for @reviewsPublish.
  ///
  /// In en, this message translates to:
  /// **'Publish review'**
  String get reviewsPublish;

  /// No description provided for @reviewsSaveChanges.
  ///
  /// In en, this message translates to:
  /// **'Save changes'**
  String get reviewsSaveChanges;

  /// No description provided for @reviewsPublished.
  ///
  /// In en, this message translates to:
  /// **'Review published'**
  String get reviewsPublished;

  /// No description provided for @reviewsUpdated.
  ///
  /// In en, this message translates to:
  /// **'Review updated'**
  String get reviewsUpdated;

  /// No description provided for @postDetailTitle.
  ///
  /// In en, this message translates to:
  /// **'Product'**
  String get postDetailTitle;

  /// No description provided for @postPriceLabel.
  ///
  /// In en, this message translates to:
  /// **'Price'**
  String get postPriceLabel;

  /// No description provided for @postSpecsMoq.
  ///
  /// In en, this message translates to:
  /// **'Min order: {moq} pcs'**
  String postSpecsMoq(int moq);

  /// No description provided for @postSpecsShipping.
  ///
  /// In en, this message translates to:
  /// **'Shipping: {days} days'**
  String postSpecsShipping(int days);

  /// No description provided for @postSpecsStockInStock.
  ///
  /// In en, this message translates to:
  /// **'In stock'**
  String get postSpecsStockInStock;

  /// No description provided for @postSpecsStockOutOfStock.
  ///
  /// In en, this message translates to:
  /// **'Out of stock'**
  String get postSpecsStockOutOfStock;

  /// No description provided for @postSpecsStockOnDemand.
  ///
  /// In en, this message translates to:
  /// **'On demand'**
  String get postSpecsStockOnDemand;

  /// No description provided for @postPriceTiers.
  ///
  /// In en, this message translates to:
  /// **'Volume pricing'**
  String get postPriceTiers;

  /// No description provided for @postPriceTierFromQty.
  ///
  /// In en, this message translates to:
  /// **'from {qty} pcs'**
  String postPriceTierFromQty(int qty);

  /// No description provided for @postCommentsTitle.
  ///
  /// In en, this message translates to:
  /// **'Comments'**
  String get postCommentsTitle;

  /// No description provided for @postCommentInputHint.
  ///
  /// In en, this message translates to:
  /// **'Write a comment…'**
  String get postCommentInputHint;

  /// No description provided for @postCommentSend.
  ///
  /// In en, this message translates to:
  /// **'Send'**
  String get postCommentSend;

  /// No description provided for @postNoComments.
  ///
  /// In en, this message translates to:
  /// **'No comments yet'**
  String get postNoComments;

  /// No description provided for @postFirstComment.
  ///
  /// In en, this message translates to:
  /// **'Be the first to comment'**
  String get postFirstComment;

  /// No description provided for @postFollowed.
  ///
  /// In en, this message translates to:
  /// **'Following {factory}'**
  String postFollowed(String factory);

  /// No description provided for @postUnfollowed.
  ///
  /// In en, this message translates to:
  /// **'Unfollowed {factory}'**
  String postUnfollowed(String factory);

  /// No description provided for @postFollow.
  ///
  /// In en, this message translates to:
  /// **'Follow'**
  String get postFollow;

  /// No description provided for @postUnfollow.
  ///
  /// In en, this message translates to:
  /// **'Unfollow'**
  String get postUnfollow;

  /// No description provided for @postDelete.
  ///
  /// In en, this message translates to:
  /// **'Delete post'**
  String get postDelete;

  /// No description provided for @postDeleteConfirm.
  ///
  /// In en, this message translates to:
  /// **'Delete this post?'**
  String get postDeleteConfirm;

  /// No description provided for @postDeleteConfirmBody.
  ///
  /// In en, this message translates to:
  /// **'This action cannot be undone.'**
  String get postDeleteConfirmBody;

  /// No description provided for @postDeleted.
  ///
  /// In en, this message translates to:
  /// **'Post deleted'**
  String get postDeleted;

  /// No description provided for @postDeletedWithTitle.
  ///
  /// In en, this message translates to:
  /// **'Post «{title}» deleted'**
  String postDeletedWithTitle(String title);

  /// No description provided for @postLikeError.
  ///
  /// In en, this message translates to:
  /// **'Failed to like: {error}'**
  String postLikeError(String error);

  /// No description provided for @postUnlikeError.
  ///
  /// In en, this message translates to:
  /// **'Failed to unlike: {error}'**
  String postUnlikeError(String error);

  /// No description provided for @postSaveError.
  ///
  /// In en, this message translates to:
  /// **'Failed to save: {error}'**
  String postSaveError(String error);

  /// No description provided for @groupBuyTitle.
  ///
  /// In en, this message translates to:
  /// **'Group buy'**
  String get groupBuyTitle;

  /// No description provided for @groupBuyProgress.
  ///
  /// In en, this message translates to:
  /// **'{current} / {target} pcs'**
  String groupBuyProgress(int current, int target);

  /// No description provided for @groupBuyParticipants.
  ///
  /// In en, this message translates to:
  /// **'{count, plural, =0{No participants} =1{1 participant} other{{count} participants}}'**
  String groupBuyParticipants(int count);

  /// No description provided for @groupBuyDeadline.
  ///
  /// In en, this message translates to:
  /// **'Deadline: {date}'**
  String groupBuyDeadline(String date);

  /// No description provided for @groupBuyJoin.
  ///
  /// In en, this message translates to:
  /// **'Join'**
  String get groupBuyJoin;

  /// No description provided for @groupBuyLeave.
  ///
  /// In en, this message translates to:
  /// **'Leave'**
  String get groupBuyLeave;

  /// No description provided for @groupBuyEdit.
  ///
  /// In en, this message translates to:
  /// **'Edit my order'**
  String get groupBuyEdit;

  /// No description provided for @groupBuyGoalReached.
  ///
  /// In en, this message translates to:
  /// **'Goal reached! 🎉'**
  String get groupBuyGoalReached;

  /// No description provided for @groupBuyExpired.
  ///
  /// In en, this message translates to:
  /// **'Deadline passed'**
  String get groupBuyExpired;

  /// No description provided for @groupBuyJoinSheetTitle.
  ///
  /// In en, this message translates to:
  /// **'Join group buy'**
  String get groupBuyJoinSheetTitle;

  /// No description provided for @groupBuyQuantity.
  ///
  /// In en, this message translates to:
  /// **'Quantity'**
  String get groupBuyQuantity;

  /// No description provided for @groupBuyEstimatedTotal.
  ///
  /// In en, this message translates to:
  /// **'Estimated total'**
  String get groupBuyEstimatedTotal;

  /// No description provided for @groupBuyOwnPost.
  ///
  /// In en, this message translates to:
  /// **'This is your own group buy'**
  String get groupBuyOwnPost;

  /// No description provided for @groupBuyJoinedSnack.
  ///
  /// In en, this message translates to:
  /// **'You\'re in: {qty} pcs. Collected: {total}'**
  String groupBuyJoinedSnack(int qty, int total);

  /// No description provided for @groupBuyLeaveConfirmTitle.
  ///
  /// In en, this message translates to:
  /// **'Cancel participation?'**
  String get groupBuyLeaveConfirmTitle;

  /// No description provided for @groupBuyLeaveConfirmBody.
  ///
  /// In en, this message translates to:
  /// **'Your order will be removed. You can join again later.'**
  String get groupBuyLeaveConfirmBody;

  /// No description provided for @groupBuyLeaveConfirmAction.
  ///
  /// In en, this message translates to:
  /// **'Cancel'**
  String get groupBuyLeaveConfirmAction;

  /// No description provided for @createPostTitle.
  ///
  /// In en, this message translates to:
  /// **'New post'**
  String get createPostTitle;

  /// No description provided for @createPostType.
  ///
  /// In en, this message translates to:
  /// **'Post type'**
  String get createPostType;

  /// No description provided for @createPostTypeProduct.
  ///
  /// In en, this message translates to:
  /// **'Product'**
  String get createPostTypeProduct;

  /// No description provided for @createPostTypeReel.
  ///
  /// In en, this message translates to:
  /// **'Reel'**
  String get createPostTypeReel;

  /// No description provided for @createPostTypeHotDeal.
  ///
  /// In en, this message translates to:
  /// **'Hot deal'**
  String get createPostTypeHotDeal;

  /// No description provided for @createPostTypeGroupBuy.
  ///
  /// In en, this message translates to:
  /// **'Group buy'**
  String get createPostTypeGroupBuy;

  /// No description provided for @createPostMedia.
  ///
  /// In en, this message translates to:
  /// **'Media'**
  String get createPostMedia;

  /// No description provided for @createPostAddPhoto.
  ///
  /// In en, this message translates to:
  /// **'Photo'**
  String get createPostAddPhoto;

  /// No description provided for @createPostAddVideo.
  ///
  /// In en, this message translates to:
  /// **'Video'**
  String get createPostAddVideo;

  /// No description provided for @createPostName.
  ///
  /// In en, this message translates to:
  /// **'Title'**
  String get createPostName;

  /// No description provided for @createPostNameHint.
  ///
  /// In en, this message translates to:
  /// **'Short and clear product name'**
  String get createPostNameHint;

  /// No description provided for @createPostDescription.
  ///
  /// In en, this message translates to:
  /// **'Description'**
  String get createPostDescription;

  /// No description provided for @createPostDescriptionHint.
  ///
  /// In en, this message translates to:
  /// **'Materials, features, packaging, customization options'**
  String get createPostDescriptionHint;

  /// No description provided for @createPostPrice.
  ///
  /// In en, this message translates to:
  /// **'Price'**
  String get createPostPrice;

  /// No description provided for @createPostPriceCurrency.
  ///
  /// In en, this message translates to:
  /// **'Currency'**
  String get createPostPriceCurrency;

  /// No description provided for @createPostMoq.
  ///
  /// In en, this message translates to:
  /// **'Minimum order quantity'**
  String get createPostMoq;

  /// No description provided for @createPostShippingDays.
  ///
  /// In en, this message translates to:
  /// **'Shipping days'**
  String get createPostShippingDays;

  /// No description provided for @createPostStockStatus.
  ///
  /// In en, this message translates to:
  /// **'Stock status'**
  String get createPostStockStatus;

  /// No description provided for @createPostHashtagsLabel.
  ///
  /// In en, this message translates to:
  /// **'Hashtags'**
  String get createPostHashtagsLabel;

  /// No description provided for @createPostHashtagHint.
  ///
  /// In en, this message translates to:
  /// **'tag (without #)'**
  String get createPostHashtagHint;

  /// No description provided for @createPostAddHashtag.
  ///
  /// In en, this message translates to:
  /// **'Add'**
  String get createPostAddHashtag;

  /// No description provided for @createPostHashtagMaxLimit.
  ///
  /// In en, this message translates to:
  /// **'Maximum 20 hashtags'**
  String get createPostHashtagMaxLimit;

  /// No description provided for @createPostHashtagDuplicate.
  ///
  /// In en, this message translates to:
  /// **'Already added'**
  String get createPostHashtagDuplicate;

  /// No description provided for @createPostPublish.
  ///
  /// In en, this message translates to:
  /// **'Publish'**
  String get createPostPublish;

  /// No description provided for @createPostPublished.
  ///
  /// In en, this message translates to:
  /// **'Post published!'**
  String get createPostPublished;

  /// No description provided for @createPostError.
  ///
  /// In en, this message translates to:
  /// **'Failed to publish'**
  String get createPostError;

  /// No description provided for @createPostNoMedia.
  ///
  /// In en, this message translates to:
  /// **'Add at least one photo or video'**
  String get createPostNoMedia;

  /// No description provided for @createPostFactoryOnly.
  ///
  /// In en, this message translates to:
  /// **'Only factories can publish posts'**
  String get createPostFactoryOnly;

  /// No description provided for @editProfileTitle.
  ///
  /// In en, this message translates to:
  /// **'Edit profile'**
  String get editProfileTitle;

  /// No description provided for @editProfileAvatar.
  ///
  /// In en, this message translates to:
  /// **'Avatar'**
  String get editProfileAvatar;

  /// No description provided for @editProfilePickAvatar.
  ///
  /// In en, this message translates to:
  /// **'Choose photo'**
  String get editProfilePickAvatar;

  /// No description provided for @editProfileName.
  ///
  /// In en, this message translates to:
  /// **'Your name'**
  String get editProfileName;

  /// No description provided for @editProfileCompanyName.
  ///
  /// In en, this message translates to:
  /// **'Company name'**
  String get editProfileCompanyName;

  /// No description provided for @editProfileCountry.
  ///
  /// In en, this message translates to:
  /// **'Country'**
  String get editProfileCountry;

  /// No description provided for @editProfileCity.
  ///
  /// In en, this message translates to:
  /// **'City'**
  String get editProfileCity;

  /// No description provided for @editProfileSaved.
  ///
  /// In en, this message translates to:
  /// **'Profile updated'**
  String get editProfileSaved;

  /// No description provided for @hashtagScreenTitle.
  ///
  /// In en, this message translates to:
  /// **'Posts with #{tag}'**
  String hashtagScreenTitle(String tag);

  /// No description provided for @hashtagEmpty.
  ///
  /// In en, this message translates to:
  /// **'No posts with this hashtag'**
  String get hashtagEmpty;

  /// No description provided for @hashtagBeFirst.
  ///
  /// In en, this message translates to:
  /// **'Be the first to post with this hashtag'**
  String get hashtagBeFirst;

  /// No description provided for @savesTitle.
  ///
  /// In en, this message translates to:
  /// **'My bookmarks'**
  String get savesTitle;

  /// No description provided for @savesEmpty.
  ///
  /// In en, this message translates to:
  /// **'No bookmarks yet'**
  String get savesEmpty;

  /// No description provided for @savesEmptyHint.
  ///
  /// In en, this message translates to:
  /// **'Tap the bookmark icon on any post to save it here'**
  String get savesEmptyHint;

  /// No description provided for @savesLoadError.
  ///
  /// In en, this message translates to:
  /// **'Failed to load bookmarks: {error}'**
  String savesLoadError(String error);

  /// No description provided for @savesLoadErrorHttp.
  ///
  /// In en, this message translates to:
  /// **'Failed to load bookmarks (HTTP {code})'**
  String savesLoadErrorHttp(int code);

  /// No description provided for @countryNameKZ.
  ///
  /// In en, this message translates to:
  /// **'🇰🇿 Kazakhstan'**
  String get countryNameKZ;

  /// No description provided for @countryNameRU.
  ///
  /// In en, this message translates to:
  /// **'🇷🇺 Russia'**
  String get countryNameRU;

  /// No description provided for @countryNameCN.
  ///
  /// In en, this message translates to:
  /// **'🇨🇳 China'**
  String get countryNameCN;

  /// No description provided for @countryNameUZ.
  ///
  /// In en, this message translates to:
  /// **'🇺🇿 Uzbekistan'**
  String get countryNameUZ;

  /// No description provided for @countryNameKG.
  ///
  /// In en, this message translates to:
  /// **'🇰🇬 Kyrgyzstan'**
  String get countryNameKG;

  /// No description provided for @countryNameBY.
  ///
  /// In en, this message translates to:
  /// **'🇧🇾 Belarus'**
  String get countryNameBY;

  /// No description provided for @countryNameTR.
  ///
  /// In en, this message translates to:
  /// **'🇹🇷 Turkey'**
  String get countryNameTR;

  /// No description provided for @followersTitle.
  ///
  /// In en, this message translates to:
  /// **'Followers'**
  String get followersTitle;

  /// No description provided for @followingTitle.
  ///
  /// In en, this message translates to:
  /// **'Following'**
  String get followingTitle;

  /// No description provided for @followNoFollowers.
  ///
  /// In en, this message translates to:
  /// **'No followers yet'**
  String get followNoFollowers;

  /// No description provided for @followNoFollowing.
  ///
  /// In en, this message translates to:
  /// **'Not following anyone yet'**
  String get followNoFollowing;

  /// No description provided for @publicProfileFollowers.
  ///
  /// In en, this message translates to:
  /// **'{count, plural, =0{0 followers} =1{1 follower} other{{count} followers}}'**
  String publicProfileFollowers(int count);

  /// No description provided for @publicProfilePosts.
  ///
  /// In en, this message translates to:
  /// **'Posts'**
  String get publicProfilePosts;

  /// No description provided for @publicProfileNoPosts.
  ///
  /// In en, this message translates to:
  /// **'No posts yet'**
  String get publicProfileNoPosts;

  /// No description provided for @publicProfileAboutFactory.
  ///
  /// In en, this message translates to:
  /// **'About factory'**
  String get publicProfileAboutFactory;

  /// No description provided for @publicProfileTrustScore.
  ///
  /// In en, this message translates to:
  /// **'Trust Score'**
  String get publicProfileTrustScore;

  /// No description provided for @publicProfileTotalProducts.
  ///
  /// In en, this message translates to:
  /// **'Products: {count}'**
  String publicProfileTotalProducts(int count);

  /// No description provided for @publicProfileTotalDeals.
  ///
  /// In en, this message translates to:
  /// **'Deals: {count}'**
  String publicProfileTotalDeals(int count);

  /// No description provided for @notifLikeText.
  ///
  /// In en, this message translates to:
  /// **'{actor} liked your post'**
  String notifLikeText(String actor);

  /// No description provided for @notifCommentText.
  ///
  /// In en, this message translates to:
  /// **'{actor} commented on your post'**
  String notifCommentText(String actor);

  /// No description provided for @notifMessageText.
  ///
  /// In en, this message translates to:
  /// **'{actor} sent you a message'**
  String notifMessageText(String actor);

  /// No description provided for @notifReviewText.
  ///
  /// In en, this message translates to:
  /// **'{actor} left a review'**
  String notifReviewText(String actor);

  /// No description provided for @notifGroupBuyCompletedText.
  ///
  /// In en, this message translates to:
  /// **'Group buy successfully collected!'**
  String get notifGroupBuyCompletedText;

  /// No description provided for @commonJustNow.
  ///
  /// In en, this message translates to:
  /// **'just now'**
  String get commonJustNow;

  /// No description provided for @commonMinutesShort.
  ///
  /// In en, this message translates to:
  /// **'{count}m'**
  String commonMinutesShort(int count);

  /// No description provided for @commonHoursShort.
  ///
  /// In en, this message translates to:
  /// **'{count}h'**
  String commonHoursShort(int count);

  /// No description provided for @commonDaysShort.
  ///
  /// In en, this message translates to:
  /// **'{count}d'**
  String commonDaysShort(int count);

  /// No description provided for @commonExpired.
  ///
  /// In en, this message translates to:
  /// **'expired'**
  String get commonExpired;

  /// No description provided for @commonLessThanMinute.
  ///
  /// In en, this message translates to:
  /// **'<1m'**
  String get commonLessThanMinute;

  /// No description provided for @commentsSheetEmptyTitle.
  ///
  /// In en, this message translates to:
  /// **'No comments yet'**
  String get commentsSheetEmptyTitle;

  /// No description provided for @commentsSheetEmptySubtitle.
  ///
  /// In en, this message translates to:
  /// **'Be the first — ask the factory a question.'**
  String get commentsSheetEmptySubtitle;

  /// No description provided for @groupBuyStatusCollecting.
  ///
  /// In en, this message translates to:
  /// **'Group forming'**
  String get groupBuyStatusCollecting;

  /// No description provided for @groupBuyDealText.
  ///
  /// In en, this message translates to:
  /// **'At {target} pcs price drops to {price} {currency}/pc'**
  String groupBuyDealText(int target, String price, String currency);

  /// No description provided for @groupBuyCollected.
  ///
  /// In en, this message translates to:
  /// **'Collected'**
  String get groupBuyCollected;

  /// No description provided for @groupBuyParticipantsLabel.
  ///
  /// In en, this message translates to:
  /// **'Participants'**
  String get groupBuyParticipantsLabel;

  /// No description provided for @groupBuyRemaining.
  ///
  /// In en, this message translates to:
  /// **'Left'**
  String get groupBuyRemaining;

  /// No description provided for @groupBuyParticipating.
  ///
  /// In en, this message translates to:
  /// **'You\'re in: {qty} pcs'**
  String groupBuyParticipating(int qty);

  /// No description provided for @groupBuyEditMyOrder.
  ///
  /// In en, this message translates to:
  /// **'Edit'**
  String get groupBuyEditMyOrder;

  /// No description provided for @groupBuyLeaveShort.
  ///
  /// In en, this message translates to:
  /// **'Cancel'**
  String get groupBuyLeaveShort;

  /// No description provided for @groupBuyJoinWithRemaining.
  ///
  /// In en, this message translates to:
  /// **'Join · {count} pcs left'**
  String groupBuyJoinWithRemaining(int count);

  /// No description provided for @groupBuyJoinSheetTitleLong.
  ///
  /// In en, this message translates to:
  /// **'Your group order'**
  String get groupBuyJoinSheetTitleLong;

  /// No description provided for @groupBuyJoinSheetSubtitle.
  ///
  /// In en, this message translates to:
  /// **'How many pieces do you want to order'**
  String get groupBuyJoinSheetSubtitle;

  /// No description provided for @groupBuyJoinSheetEstimated.
  ///
  /// In en, this message translates to:
  /// **'Estimated:'**
  String get groupBuyJoinSheetEstimated;

  /// No description provided for @groupBuyJoinSheetConfirm.
  ///
  /// In en, this message translates to:
  /// **'Confirm'**
  String get groupBuyJoinSheetConfirm;

  /// No description provided for @reelsTitle.
  ///
  /// In en, this message translates to:
  /// **'Reels'**
  String get reelsTitle;

  /// No description provided for @reelsEmptyTitle.
  ///
  /// In en, this message translates to:
  /// **'No reels yet'**
  String get reelsEmptyTitle;

  /// No description provided for @reelsEmptySubtitle.
  ///
  /// In en, this message translates to:
  /// **'Factories haven\'t posted any videos.\nCheck back later.'**
  String get reelsEmptySubtitle;

  /// No description provided for @reelsMore.
  ///
  /// In en, this message translates to:
  /// **'More'**
  String get reelsMore;

  /// No description provided for @publicProfileReviewsCountPlural.
  ///
  /// In en, this message translates to:
  /// **'{count, plural, =0{no reviews} =1{1 review} other{{count} reviews}}'**
  String publicProfileReviewsCountPlural(int count);

  /// No description provided for @publicProfileReviewsSeeAll.
  ///
  /// In en, this message translates to:
  /// **'{count} — see all'**
  String publicProfileReviewsSeeAll(String count);

  /// No description provided for @publicProfileNoReviewsTitle.
  ///
  /// In en, this message translates to:
  /// **'No reviews'**
  String get publicProfileNoReviewsTitle;

  /// No description provided for @publicProfileGetFirstReview.
  ///
  /// In en, this message translates to:
  /// **'Get your first review'**
  String get publicProfileGetFirstReview;

  /// No description provided for @publicProfileBeFirstReviewer.
  ///
  /// In en, this message translates to:
  /// **'Be the first to leave a review'**
  String get publicProfileBeFirstReviewer;

  /// No description provided for @publicProfileFollowersLabel.
  ///
  /// In en, this message translates to:
  /// **'Followers'**
  String get publicProfileFollowersLabel;

  /// No description provided for @publicProfileFollowingLabel.
  ///
  /// In en, this message translates to:
  /// **'Following'**
  String get publicProfileFollowingLabel;

  /// No description provided for @createPostMediaTitle.
  ///
  /// In en, this message translates to:
  /// **'Product media (up to 10)'**
  String get createPostMediaTitle;

  /// No description provided for @createPostMediaCount.
  ///
  /// In en, this message translates to:
  /// **'{count}/10 media'**
  String createPostMediaCount(int count);

  /// No description provided for @createPostMediaMaxReached.
  ///
  /// In en, this message translates to:
  /// **'Up to 10 media'**
  String get createPostMediaMaxReached;

  /// No description provided for @createPostVideoTooLarge.
  ///
  /// In en, this message translates to:
  /// **'Video must be under 50 MB'**
  String get createPostVideoTooLarge;

  /// No description provided for @createPostPickPhotosError.
  ///
  /// In en, this message translates to:
  /// **'Failed to pick photo: {error}'**
  String createPostPickPhotosError(String error);

  /// No description provided for @createPostPickVideoError.
  ///
  /// In en, this message translates to:
  /// **'Failed to pick video: {error}'**
  String createPostPickVideoError(String error);

  /// No description provided for @createPostPublishedWithTitle.
  ///
  /// In en, this message translates to:
  /// **'Post «{title}» published'**
  String createPostPublishedWithTitle(String title);

  /// No description provided for @createPostNoMediaSnack.
  ///
  /// In en, this message translates to:
  /// **'Add at least one photo'**
  String get createPostNoMediaSnack;

  /// No description provided for @createPostTitleRequired.
  ///
  /// In en, this message translates to:
  /// **'Title *'**
  String get createPostTitleRequired;

  /// No description provided for @createPostTitleHintExample.
  ///
  /// In en, this message translates to:
  /// **'e.g. Oversize cotton t-shirts'**
  String get createPostTitleHintExample;

  /// No description provided for @createPostTitleTooShort.
  ///
  /// In en, this message translates to:
  /// **'At least 3 characters'**
  String get createPostTitleTooShort;

  /// No description provided for @createPostDescriptionHintExample.
  ///
  /// In en, this message translates to:
  /// **'Materials, specs, certifications…'**
  String get createPostDescriptionHintExample;

  /// No description provided for @createPostPriceRequired.
  ///
  /// In en, this message translates to:
  /// **'Price *'**
  String get createPostPriceRequired;

  /// No description provided for @createPostPriceHintExample.
  ///
  /// In en, this message translates to:
  /// **'4.50'**
  String get createPostPriceHintExample;

  /// No description provided for @createPostFieldRequired.
  ///
  /// In en, this message translates to:
  /// **'Required'**
  String get createPostFieldRequired;

  /// No description provided for @createPostFieldInvalid.
  ///
  /// In en, this message translates to:
  /// **'Invalid'**
  String get createPostFieldInvalid;

  /// No description provided for @createPostMoqLabel.
  ///
  /// In en, this message translates to:
  /// **'MOQ (min. batch)'**
  String get createPostMoqLabel;

  /// No description provided for @createPostMoqMin.
  ///
  /// In en, this message translates to:
  /// **'≥ 1'**
  String get createPostMoqMin;

  /// No description provided for @createPostShippingLabel.
  ///
  /// In en, this message translates to:
  /// **'Shipping (days)'**
  String get createPostShippingLabel;

  /// No description provided for @createPostShippingMin.
  ///
  /// In en, this message translates to:
  /// **'≥ 0'**
  String get createPostShippingMin;

  /// No description provided for @createPostStockInStock.
  ///
  /// In en, this message translates to:
  /// **'In stock'**
  String get createPostStockInStock;

  /// No description provided for @createPostStockPreOrder.
  ///
  /// In en, this message translates to:
  /// **'Pre-order'**
  String get createPostStockPreOrder;

  /// No description provided for @createPostStockOutOfStock.
  ///
  /// In en, this message translates to:
  /// **'Out of stock'**
  String get createPostStockOutOfStock;

  /// No description provided for @createPostCurrencyRequired.
  ///
  /// In en, this message translates to:
  /// **'Currency *'**
  String get createPostCurrencyRequired;

  /// No description provided for @createPostHashtagInvalidChars.
  ///
  /// In en, this message translates to:
  /// **'Hashtag can only contain letters, digits, _ and -'**
  String get createPostHashtagInvalidChars;

  /// No description provided for @createPostHashtagHintExample.
  ///
  /// In en, this message translates to:
  /// **'tshirt, wholesale, cotton…'**
  String get createPostHashtagHintExample;

  /// No description provided for @editProfileNameLabel.
  ///
  /// In en, this message translates to:
  /// **'Name'**
  String get editProfileNameLabel;

  /// No description provided for @editProfileNameHint.
  ///
  /// In en, this message translates to:
  /// **'What\'s your name?'**
  String get editProfileNameHint;

  /// No description provided for @editProfileCompanyRequiredLabel.
  ///
  /// In en, this message translates to:
  /// **'Company name *'**
  String get editProfileCompanyRequiredLabel;

  /// No description provided for @editProfileCompanyHint.
  ///
  /// In en, this message translates to:
  /// **'Guangzhou Apparel Co.'**
  String get editProfileCompanyHint;

  /// No description provided for @editProfileCompanyRequiredError.
  ///
  /// In en, this message translates to:
  /// **'Required for factories'**
  String get editProfileCompanyRequiredError;

  /// No description provided for @editProfileLanguageLabel.
  ///
  /// In en, this message translates to:
  /// **'Language'**
  String get editProfileLanguageLabel;

  /// No description provided for @editProfileCurrencyLabel.
  ///
  /// In en, this message translates to:
  /// **'Currency'**
  String get editProfileCurrencyLabel;

  /// No description provided for @editProfileCountryLabel.
  ///
  /// In en, this message translates to:
  /// **'Country'**
  String get editProfileCountryLabel;

  /// No description provided for @editProfileCityLabel.
  ///
  /// In en, this message translates to:
  /// **'City'**
  String get editProfileCityLabel;

  /// No description provided for @editProfileCityHint.
  ///
  /// In en, this message translates to:
  /// **'Almaty'**
  String get editProfileCityHint;

  /// No description provided for @editProfileAvatarUploadError.
  ///
  /// In en, this message translates to:
  /// **'Failed to upload avatar: {error}'**
  String editProfileAvatarUploadError(String error);

  /// No description provided for @reviewsListTitle.
  ///
  /// In en, this message translates to:
  /// **'Reviews of {factoryName}'**
  String reviewsListTitle(String factoryName);

  /// No description provided for @reviewsListFabWrite.
  ///
  /// In en, this message translates to:
  /// **'Write review'**
  String get reviewsListFabWrite;

  /// No description provided for @reviewsListEmptyTitle.
  ///
  /// In en, this message translates to:
  /// **'No reviews yet'**
  String get reviewsListEmptyTitle;

  /// No description provided for @reviewsListBeFirstLong.
  ///
  /// In en, this message translates to:
  /// **'Be the first to leave a review of this factory.'**
  String get reviewsListBeFirstLong;

  /// No description provided for @profileLogoutConfirmTitle.
  ///
  /// In en, this message translates to:
  /// **'Log out?'**
  String get profileLogoutConfirmTitle;

  /// No description provided for @profileLogoutConfirmBody.
  ///
  /// In en, this message translates to:
  /// **'Your session will end and you will need to sign in via SMS again.'**
  String get profileLogoutConfirmBody;

  /// No description provided for @profileLogoutConfirmAction.
  ///
  /// In en, this message translates to:
  /// **'Log out'**
  String get profileLogoutConfirmAction;

  /// No description provided for @profileEditTooltip.
  ///
  /// In en, this message translates to:
  /// **'Edit'**
  String get profileEditTooltip;

  /// No description provided for @profileRefreshTooltip.
  ///
  /// In en, this message translates to:
  /// **'Refresh'**
  String get profileRefreshTooltip;

  /// No description provided for @profileReferralCopyTooltip.
  ///
  /// In en, this message translates to:
  /// **'Copy'**
  String get profileReferralCopyTooltip;

  /// No description provided for @profileReferralCopied.
  ///
  /// In en, this message translates to:
  /// **'Referral code {code} copied'**
  String profileReferralCopied(String code);

  /// No description provided for @profileLoadError.
  ///
  /// In en, this message translates to:
  /// **'Failed to load profile'**
  String get profileLoadError;

  /// No description provided for @profileUpdatedSnack.
  ///
  /// In en, this message translates to:
  /// **'Profile updated'**
  String get profileUpdatedSnack;

  /// No description provided for @profileNoName.
  ///
  /// In en, this message translates to:
  /// **'No name'**
  String get profileNoName;

  /// No description provided for @profileAboutFactory.
  ///
  /// In en, this message translates to:
  /// **'About factory'**
  String get profileAboutFactory;

  /// No description provided for @profileFactoryTotalProducts.
  ///
  /// In en, this message translates to:
  /// **'Products: {count}'**
  String profileFactoryTotalProducts(int count);

  /// No description provided for @profileFactoryTotalDeals.
  ///
  /// In en, this message translates to:
  /// **'Deals: {count}'**
  String profileFactoryTotalDeals(int count);

  /// No description provided for @profileFactoryTrustScore.
  ///
  /// In en, this message translates to:
  /// **'Trust Score: {score}'**
  String profileFactoryTrustScore(int score);

  /// No description provided for @profileLanguageLabel.
  ///
  /// In en, this message translates to:
  /// **'Language'**
  String get profileLanguageLabel;

  /// No description provided for @profileCurrencyLabel.
  ///
  /// In en, this message translates to:
  /// **'Currency'**
  String get profileCurrencyLabel;

  /// No description provided for @profileCountryLabel.
  ///
  /// In en, this message translates to:
  /// **'Country'**
  String get profileCountryLabel;

  /// No description provided for @profileCityLabel.
  ///
  /// In en, this message translates to:
  /// **'City'**
  String get profileCityLabel;

  /// No description provided for @profileReferralCodeLabel.
  ///
  /// In en, this message translates to:
  /// **'Referral code'**
  String get profileReferralCodeLabel;

  /// No description provided for @profileMyPosts.
  ///
  /// In en, this message translates to:
  /// **'My posts'**
  String get profileMyPosts;

  /// No description provided for @profileNoPostsYet.
  ///
  /// In en, this message translates to:
  /// **'No posts yet'**
  String get profileNoPostsYet;

  /// No description provided for @feedLikesCount.
  ///
  /// In en, this message translates to:
  /// **'{count, plural, =0{0 likes} =1{1 like} other{{count} likes}}'**
  String feedLikesCount(int count);

  /// No description provided for @feedMoqShort.
  ///
  /// In en, this message translates to:
  /// **'MOQ: {moq} pcs'**
  String feedMoqShort(int moq);

  /// No description provided for @feedShippingDaysShort.
  ///
  /// In en, this message translates to:
  /// **'{days} days'**
  String feedShippingDaysShort(int days);

  /// No description provided for @feedPriceSheetLine.
  ///
  /// In en, this message translates to:
  /// **'MOQ: {moq} pcs • Shipping: {days} days'**
  String feedPriceSheetLine(int moq, int days);

  /// No description provided for @feedSaveError.
  ///
  /// In en, this message translates to:
  /// **'Failed to save: {error}'**
  String feedSaveError(String error);

  /// No description provided for @feedLikeErrorLike.
  ///
  /// In en, this message translates to:
  /// **'Failed to like: {error}'**
  String feedLikeErrorLike(String error);

  /// No description provided for @feedLikeErrorUnlike.
  ///
  /// In en, this message translates to:
  /// **'Failed to unlike: {error}'**
  String feedLikeErrorUnlike(String error);

  /// No description provided for @feedCannotDetermineFactory.
  ///
  /// In en, this message translates to:
  /// **'Failed to detect factory'**
  String get feedCannotDetermineFactory;

  /// No description provided for @feedShareLinkCopied.
  ///
  /// In en, this message translates to:
  /// **'Link copied: {url}'**
  String feedShareLinkCopied(String url);

  /// No description provided for @feedEmptyFollowingTitle.
  ///
  /// In en, this message translates to:
  /// **'No posts from follows'**
  String get feedEmptyFollowingTitle;

  /// No description provided for @feedEmptyFollowingBody.
  ///
  /// In en, this message translates to:
  /// **'Follow some factories in the «All» tab and their posts will appear here.'**
  String get feedEmptyFollowingBody;

  /// No description provided for @feedEmptyHotDealTitle.
  ///
  /// In en, this message translates to:
  /// **'No deals yet'**
  String get feedEmptyHotDealTitle;

  /// No description provided for @feedEmptyHotDealBody.
  ///
  /// In en, this message translates to:
  /// **'Factories haven\'t announced any Hot Deals. Check back later — or try the «All» tab.'**
  String get feedEmptyHotDealBody;

  /// No description provided for @feedEmptyGenericTitle.
  ///
  /// In en, this message translates to:
  /// **'Feed is empty'**
  String get feedEmptyGenericTitle;

  /// No description provided for @feedEmptyGenericBody.
  ///
  /// In en, this message translates to:
  /// **'No posts from factories yet.\nPull down to refresh.'**
  String get feedEmptyGenericBody;

  /// No description provided for @feedRealtimeConnected.
  ///
  /// In en, this message translates to:
  /// **'Real-time connected'**
  String get feedRealtimeConnected;

  /// No description provided for @feedRealtimeConnecting.
  ///
  /// In en, this message translates to:
  /// **'Connecting…'**
  String get feedRealtimeConnecting;

  /// No description provided for @feedRealtimeError.
  ///
  /// In en, this message translates to:
  /// **'Connection error, retrying'**
  String get feedRealtimeError;

  /// No description provided for @feedRealtimeDisconnected.
  ///
  /// In en, this message translates to:
  /// **'No real-time connection'**
  String get feedRealtimeDisconnected;

  /// No description provided for @feedReelsTooltip.
  ///
  /// In en, this message translates to:
  /// **'Reels'**
  String get feedReelsTooltip;

  /// No description provided for @feedNotificationsTooltip.
  ///
  /// In en, this message translates to:
  /// **'Notifications'**
  String get feedNotificationsTooltip;

  /// No description provided for @searchHintTooltipClear.
  ///
  /// In en, this message translates to:
  /// **'Clear'**
  String get searchHintTooltipClear;

  /// No description provided for @searchResetFiltersTooltip.
  ///
  /// In en, this message translates to:
  /// **'Reset filters'**
  String get searchResetFiltersTooltip;

  /// No description provided for @searchIdleTitle.
  ///
  /// In en, this message translates to:
  /// **'Search products'**
  String get searchIdleTitle;

  /// No description provided for @searchIdleBody.
  ///
  /// In en, this message translates to:
  /// **'Enter a name, hashtag (#tshirt) or factory brand — at least 2 characters.'**
  String get searchIdleBody;

  /// No description provided for @searchNoResultsBody.
  ///
  /// In en, this message translates to:
  /// **'No results for «{query}». Try different words or hashtags.'**
  String searchNoResultsBody(String query);

  /// No description provided for @searchFiltersHotShort.
  ///
  /// In en, this message translates to:
  /// **'🔥 Hot deals'**
  String get searchFiltersHotShort;

  /// No description provided for @chatErrorRetry.
  ///
  /// In en, this message translates to:
  /// **'Retry'**
  String get chatErrorRetry;

  /// No description provided for @chatNoMessagesShort.
  ///
  /// In en, this message translates to:
  /// **'No messages'**
  String get chatNoMessagesShort;

  /// No description provided for @chatYouPrefix.
  ///
  /// In en, this message translates to:
  /// **'You:'**
  String get chatYouPrefix;

  /// No description provided for @chatTimeNow.
  ///
  /// In en, this message translates to:
  /// **'now'**
  String get chatTimeNow;

  /// No description provided for @chatTimeMinutesShort.
  ///
  /// In en, this message translates to:
  /// **'{count}m'**
  String chatTimeMinutesShort(int count);

  /// No description provided for @chatTimeDaysShort.
  ///
  /// In en, this message translates to:
  /// **'{count}d'**
  String chatTimeDaysShort(int count);

  /// No description provided for @notifActorLiked.
  ///
  /// In en, this message translates to:
  /// **'{actor} liked{ref}'**
  String notifActorLiked(String actor, String ref);

  /// No description provided for @notifActorCommented.
  ///
  /// In en, this message translates to:
  /// **'{actor} commented on{ref}'**
  String notifActorCommented(String actor, String ref);

  /// No description provided for @notifActorMessage.
  ///
  /// In en, this message translates to:
  /// **'{actor} sent you a message'**
  String notifActorMessage(String actor);

  /// No description provided for @notifActorReview.
  ///
  /// In en, this message translates to:
  /// **'{actor} left a review'**
  String notifActorReview(String actor);

  /// No description provided for @notifGroupBuyCompletedWithRef.
  ///
  /// In en, this message translates to:
  /// **'Group buy successfully collected!{ref}'**
  String notifGroupBuyCompletedWithRef(String ref);

  /// No description provided for @notifYourPostRef.
  ///
  /// In en, this message translates to:
  /// **' your post'**
  String get notifYourPostRef;

  /// No description provided for @notifPostRef.
  ///
  /// In en, this message translates to:
  /// **' «{title}»'**
  String notifPostRef(String title);

  /// No description provided for @notifTimeJustNow.
  ///
  /// In en, this message translates to:
  /// **'just now'**
  String get notifTimeJustNow;

  /// No description provided for @notifTimeMinutesAgo.
  ///
  /// In en, this message translates to:
  /// **'{count}m ago'**
  String notifTimeMinutesAgo(int count);

  /// No description provided for @notifTimeHoursAgo.
  ///
  /// In en, this message translates to:
  /// **'{count}h ago'**
  String notifTimeHoursAgo(int count);

  /// No description provided for @notifTimeDaysAgo.
  ///
  /// In en, this message translates to:
  /// **'{count}d ago'**
  String notifTimeDaysAgo(int count);

  /// No description provided for @storyAddLabel.
  ///
  /// In en, this message translates to:
  /// **'Add'**
  String get storyAddLabel;

  /// No description provided for @storyPublishedSnack.
  ///
  /// In en, this message translates to:
  /// **'Story published'**
  String get storyPublishedSnack;

  /// No description provided for @storyPhotoUploadError.
  ///
  /// In en, this message translates to:
  /// **'Failed to upload photo'**
  String get storyPhotoUploadError;

  /// No description provided for @storyTimeJustNow.
  ///
  /// In en, this message translates to:
  /// **'just now'**
  String get storyTimeJustNow;

  /// No description provided for @storyTimeMinutesShort.
  ///
  /// In en, this message translates to:
  /// **'{count}m'**
  String storyTimeMinutesShort(int count);

  /// No description provided for @storyTimeHoursShort.
  ///
  /// In en, this message translates to:
  /// **'{count}h'**
  String storyTimeHoursShort(int count);

  /// No description provided for @storyTimeDaysShort.
  ///
  /// In en, this message translates to:
  /// **'{count}d'**
  String storyTimeDaysShort(int count);

  /// No description provided for @authPhoneInvalidFormat.
  ///
  /// In en, this message translates to:
  /// **'Enter phone in format +79991234567'**
  String get authPhoneInvalidFormat;

  /// No description provided for @postDetailSavedTooltip.
  ///
  /// In en, this message translates to:
  /// **'Saved'**
  String get postDetailSavedTooltip;

  /// No description provided for @postDetailSaveTooltip.
  ///
  /// In en, this message translates to:
  /// **'Save'**
  String get postDetailSaveTooltip;

  /// No description provided for @onboardingSkip.
  ///
  /// In en, this message translates to:
  /// **'Skip'**
  String get onboardingSkip;

  /// No description provided for @onboardingNext.
  ///
  /// In en, this message translates to:
  /// **'Next'**
  String get onboardingNext;

  /// No description provided for @onboardingGetStarted.
  ///
  /// In en, this message translates to:
  /// **'Get started'**
  String get onboardingGetStarted;

  /// No description provided for @feedPriceOnRequest.
  ///
  /// In en, this message translates to:
  /// **'Price on request'**
  String get feedPriceOnRequest;

  /// No description provided for @settingsQuietHoursOff.
  ///
  /// In en, this message translates to:
  /// **'Off'**
  String get settingsQuietHoursOff;

  /// No description provided for @postMenuReport.
  ///
  /// In en, this message translates to:
  /// **'Report'**
  String get postMenuReport;

  /// No description provided for @postMenuBlock.
  ///
  /// In en, this message translates to:
  /// **'Block user'**
  String get postMenuBlock;

  /// No description provided for @blockUserConfirmTitle.
  ///
  /// In en, this message translates to:
  /// **'Block user?'**
  String get blockUserConfirmTitle;

  /// No description provided for @blockUserConfirmBody.
  ///
  /// In en, this message translates to:
  /// **'Their posts and messages will no longer be visible to you. You can unblock later in Settings.'**
  String get blockUserConfirmBody;

  /// No description provided for @blockUserAction.
  ///
  /// In en, this message translates to:
  /// **'Block'**
  String get blockUserAction;

  /// No description provided for @blockUserDone.
  ///
  /// In en, this message translates to:
  /// **'User blocked'**
  String get blockUserDone;

  /// No description provided for @reportTitle.
  ///
  /// In en, this message translates to:
  /// **'Report content'**
  String get reportTitle;

  /// No description provided for @reportSubtitle.
  ///
  /// In en, this message translates to:
  /// **'Choose a reason. Our team will review the report.'**
  String get reportSubtitle;

  /// No description provided for @reportDescriptionLabel.
  ///
  /// In en, this message translates to:
  /// **'Additional details (optional)'**
  String get reportDescriptionLabel;

  /// No description provided for @reportDescriptionHint.
  ///
  /// In en, this message translates to:
  /// **'Describe what\'s wrong'**
  String get reportDescriptionHint;

  /// No description provided for @reportSubmit.
  ///
  /// In en, this message translates to:
  /// **'Send report'**
  String get reportSubmit;

  /// No description provided for @reportSent.
  ///
  /// In en, this message translates to:
  /// **'Report sent. Thank you!'**
  String get reportSent;

  /// No description provided for @searchHistoryTitle.
  ///
  /// In en, this message translates to:
  /// **'Recent searches'**
  String get searchHistoryTitle;

  /// No description provided for @searchHistoryClear.
  ///
  /// In en, this message translates to:
  /// **'Clear'**
  String get searchHistoryClear;

  /// No description provided for @settingsTheme.
  ///
  /// In en, this message translates to:
  /// **'Theme'**
  String get settingsTheme;

  /// No description provided for @settingsThemeLight.
  ///
  /// In en, this message translates to:
  /// **'Light'**
  String get settingsThemeLight;

  /// No description provided for @settingsThemeDark.
  ///
  /// In en, this message translates to:
  /// **'Dark'**
  String get settingsThemeDark;

  /// No description provided for @settingsThemeSystem.
  ///
  /// In en, this message translates to:
  /// **'System'**
  String get settingsThemeSystem;

  /// No description provided for @createPostCamera.
  ///
  /// In en, this message translates to:
  /// **'Camera'**
  String get createPostCamera;

  /// No description provided for @createPostVideoWrongFormat.
  ///
  /// In en, this message translates to:
  /// **'Video format not supported. Please select an MP4 file.'**
  String get createPostVideoWrongFormat;

  /// No description provided for @createPostVideoTooBig.
  ///
  /// In en, this message translates to:
  /// **'Video is too large ({size} MB). Maximum is 30 MB. Try a shorter video or lower quality.'**
  String createPostVideoTooBig(String size);

  /// No description provided for @settingsComingSoon.
  ///
  /// In en, this message translates to:
  /// **'Coming soon'**
  String get settingsComingSoon;

  /// No description provided for @onboardingTitle1.
  ///
  /// In en, this message translates to:
  /// **'Direct from Chinese factories'**
  String get onboardingTitle1;

  /// No description provided for @onboardingSubtitle1.
  ///
  /// In en, this message translates to:
  /// **'Skip middlemen — buy electronics, fashion and goods straight from verified manufacturers'**
  String get onboardingSubtitle1;

  /// No description provided for @onboardingTitle2.
  ///
  /// In en, this message translates to:
  /// **'Safe deals & group buys'**
  String get onboardingTitle2;

  /// No description provided for @onboardingSubtitle2.
  ///
  /// In en, this message translates to:
  /// **'Combine orders with other buyers to unlock factory pricing and better shipping rates'**
  String get onboardingSubtitle2;

  /// No description provided for @onboardingTitle3.
  ///
  /// In en, this message translates to:
  /// **'Chat with factories instantly'**
  String get onboardingTitle3;

  /// No description provided for @onboardingSubtitle3.
  ///
  /// In en, this message translates to:
  /// **'Negotiate prices, ask for samples and track shipments — all in one place'**
  String get onboardingSubtitle3;

  /// No description provided for @onboardingTitle4.
  ///
  /// In en, this message translates to:
  /// **'Ready to start?'**
  String get onboardingTitle4;

  /// No description provided for @onboardingSubtitle4.
  ///
  /// In en, this message translates to:
  /// **'Sign up in 30 seconds with your phone number — no email, no paperwork'**
  String get onboardingSubtitle4;
}

class _AppLocalizationsDelegate
    extends LocalizationsDelegate<AppLocalizations> {
  const _AppLocalizationsDelegate();

  @override
  Future<AppLocalizations> load(Locale locale) {
    return SynchronousFuture<AppLocalizations>(lookupAppLocalizations(locale));
  }

  @override
  bool isSupported(Locale locale) =>
      <String>['en', 'ru', 'zh'].contains(locale.languageCode);

  @override
  bool shouldReload(_AppLocalizationsDelegate old) => false;
}

AppLocalizations lookupAppLocalizations(Locale locale) {
  // Lookup logic when only language code is specified.
  switch (locale.languageCode) {
    case 'en':
      return AppLocalizationsEn();
    case 'ru':
      return AppLocalizationsRu();
    case 'zh':
      return AppLocalizationsZh();
  }

  throw FlutterError(
    'AppLocalizations.delegate failed to load unsupported locale "$locale". This is likely '
    'an issue with the localizations generation tool. Please file an issue '
    'on GitHub with a reproducible sample app and the gen-l10n configuration '
    'that was used.',
  );
}
