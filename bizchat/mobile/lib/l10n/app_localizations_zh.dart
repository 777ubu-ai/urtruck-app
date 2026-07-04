// ignore: unused_import
import 'package:intl/intl.dart' as intl;
import 'app_localizations.dart';

// ignore_for_file: type=lint

/// The translations for Chinese (`zh`).
class AppLocalizationsZh extends AppLocalizations {
  AppLocalizationsZh([String locale = 'zh']) : super(locale);

  @override
  String get appTitle => 'Biz Chat';

  @override
  String get navHome => '首页';

  @override
  String get navSearch => '搜索';

  @override
  String get navCreate => '发布';

  @override
  String get navChats => '消息';

  @override
  String get navProfile => '我的';

  @override
  String get commonOk => '确定';

  @override
  String get commonCancel => '取消';

  @override
  String get commonSave => '保存';

  @override
  String get commonDelete => '删除';

  @override
  String get commonRetry => '重试';

  @override
  String get commonClose => '关闭';

  @override
  String get commonContinue => '继续';

  @override
  String get commonLoading => '加载中…';

  @override
  String get commonError => '错误';

  @override
  String get commonBack => '返回';

  @override
  String get commonOpen => '打开';

  @override
  String get commonShare => '分享';

  @override
  String get commonCopy => '复制';

  @override
  String get commonCopied => '已复制';

  @override
  String get commonNo => '否';

  @override
  String get authPhoneTitle => '登录';

  @override
  String get authPhoneHint => '手机号';

  @override
  String get authPhoneSubtitle => '我们将通过短信发送验证码';

  @override
  String get authPhoneSendCode => '发送验证码';

  @override
  String get authCodeTitle => '输入验证码';

  @override
  String get authCodeHint => '6位验证码';

  @override
  String authCodeSubtitle(String phone) {
    return '请输入发送至 $phone 的验证码';
  }

  @override
  String get authCodeResend => '重新发送';

  @override
  String authCodeResendIn(int seconds) {
    return '$seconds 秒后可重发';
  }

  @override
  String get authRoleTitle => '您是?';

  @override
  String get authRoleBuyer => '买家';

  @override
  String get authRoleBuyerDesc => '我想从工厂采购';

  @override
  String get authRoleFactory => '工厂';

  @override
  String get authRoleFactoryDesc => '我生产并希望销售';

  @override
  String get authRolePickToContinue => '请选择账户类型以继续';

  @override
  String get authRolePickRole => '请选择账户类型';

  @override
  String get authRoleNewCodeHint => '请输入新的短信验证码';

  @override
  String get authRoleCodeRequired => '请输入短信验证码(我们已发送新的)';

  @override
  String get authRoleFinishButton => '完成注册';

  @override
  String get authCodeTooShort => '请输入短信验证码';

  @override
  String get feedAll => '全部';

  @override
  String get feedFollowing => '关注';

  @override
  String get feedHotDeals => '促销';

  @override
  String get feedEmptyTitle => '暂无帖子';

  @override
  String get feedEmptySubtitle => '下拉刷新';

  @override
  String get feedLoadError => '加载失败';

  @override
  String feedTrustScore(int score) {
    return '信誉分: $score';
  }

  @override
  String feedMoq(int moq) {
    return '起订量 $moq 件';
  }

  @override
  String feedShippingDays(int days) {
    return '发货 $days 天';
  }

  @override
  String get postWriteToFactory => '联系工厂';

  @override
  String get postPriceSheetTitle => '价格';

  @override
  String get postDescription => '描述';

  @override
  String get postTranslate => '翻译';

  @override
  String get postShowOriginal => '显示原文';

  @override
  String get postLikedSnack => '已点赞';

  @override
  String get postUnlikedSnack => '已取消点赞';

  @override
  String get postSavedSnack => '已收藏';

  @override
  String get postUnsavedSnack => '已取消收藏';

  @override
  String get postShareLinkCopied => '链接已复制';

  @override
  String get postOwnPostMsg => '这是您自己的帖子';

  @override
  String get postFactoryNotFound => '未找到工厂';

  @override
  String postReviewsLink(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count 条评价',
      zero: '暂无评价',
    );
    return '$_temp0';
  }

  @override
  String get searchHint => '搜索标签、工厂、商品…';

  @override
  String get searchIdleHint => '开始输入以搜索';

  @override
  String get searchTooShort => '请至少输入 2 个字符';

  @override
  String get searchNoResults => '未找到结果';

  @override
  String get searchFilters => '筛选';

  @override
  String get searchFiltersPriceUsd => '价格 (USD)';

  @override
  String get searchFiltersFrom => '从';

  @override
  String get searchFiltersTo => '至';

  @override
  String get searchFiltersMoqMax => '最大起订量';

  @override
  String get searchFiltersCountry => '国家';

  @override
  String get searchFiltersCountryAll => '全部';

  @override
  String get searchFiltersHotDeal => '仅促销';

  @override
  String get searchFiltersReset => '重置';

  @override
  String get searchFiltersApply => '应用';

  @override
  String get chatTitle => '消息';

  @override
  String get chatNoMessages => '暂无消息';

  @override
  String get chatStartHint => '发送第一条消息 — 讨论价格、起订量、发货';

  @override
  String get chatInputHint => '消息…';

  @override
  String get chatNoChats => '暂无聊天';

  @override
  String get chatNoChatsHint => '打开帖子并点击「联系工厂」开始聊天';

  @override
  String get chatPartnerBuyer => '买家';

  @override
  String get chatPartnerFactory => '工厂';

  @override
  String get profileTitle => '我的';

  @override
  String get profileLogout => '退出登录';

  @override
  String get profileEdit => '编辑资料';

  @override
  String get profileFollowers => '粉丝';

  @override
  String get profileFollowing => '关注';

  @override
  String get profileMySaves => '我的收藏';

  @override
  String get profileSettings => '设置';

  @override
  String get profileReferralCode => '推荐码';

  @override
  String get profileLanguage => '语言';

  @override
  String get profileCurrency => '货币';

  @override
  String get settingsTitle => '设置';

  @override
  String get settingsAccount => '账户';

  @override
  String get settingsPhone => '手机号';

  @override
  String get settingsLanguageRu => 'Русский';

  @override
  String get settingsLanguageEn => 'English';

  @override
  String get settingsLanguageZh => '中文';

  @override
  String get settingsNotifications => '通知';

  @override
  String get settingsPushNotifications => '推送通知';

  @override
  String get settingsPushMaster => '所有推送通知';

  @override
  String get settingsNotifLikes => '点赞';

  @override
  String get settingsNotifComments => '评论';

  @override
  String get settingsNotifMessages => '消息';

  @override
  String get settingsNotifReviews => '评价';

  @override
  String get settingsNotifGroupBuy => '团购';

  @override
  String get settingsPushUpdateError => '更新失败';

  @override
  String get settingsQuietHours => '免打扰时段';

  @override
  String get settingsPrivacy => '隐私';

  @override
  String get settingsBlocked => '已屏蔽用户';

  @override
  String get settingsAbout => '关于';

  @override
  String get settingsVersion => '版本';

  @override
  String get settingsContactSupport => '联系客服';

  @override
  String get settingsTermsOfService => '服务条款';

  @override
  String get settingsPrivacyPolicy => '隐私政策';

  @override
  String get notificationsTitle => '通知';

  @override
  String get notificationsMarkAllRead => '全部标为已读';

  @override
  String get notificationsEmpty => '暂无通知';

  @override
  String reviewsTitle(String factoryName) {
    return '$factoryName 的评价';
  }

  @override
  String get reviewsWrite => '写评价';

  @override
  String get reviewsEmpty => '暂无评价';

  @override
  String get reviewsRating => '评分';

  @override
  String get reviewsComment => '评论';

  @override
  String get reviewsBeFirst => '成为第一个评价此工厂的人';

  @override
  String get reviewsNewTitle => '新评价';

  @override
  String get reviewsEditTitle => '编辑评价';

  @override
  String get reviewsCommentHint => '分享您的体验 — 质量、发货、包装、沟通';

  @override
  String get reviewsPublish => '发布评价';

  @override
  String get reviewsSaveChanges => '保存更改';

  @override
  String get reviewsPublished => '评价已发布';

  @override
  String get reviewsUpdated => '评价已更新';

  @override
  String get postDetailTitle => '商品';

  @override
  String get postPriceLabel => '价格';

  @override
  String postSpecsMoq(int moq) {
    return '起订量: $moq 件';
  }

  @override
  String postSpecsShipping(int days) {
    return '发货: $days 天';
  }

  @override
  String get postSpecsStockInStock => '现货';

  @override
  String get postSpecsStockOutOfStock => '无货';

  @override
  String get postSpecsStockOnDemand => '按订单生产';

  @override
  String get postPriceTiers => '批量价格';

  @override
  String postPriceTierFromQty(int qty) {
    return '$qty 件起';
  }

  @override
  String get postCommentsTitle => '评论';

  @override
  String get postCommentInputHint => '写评论…';

  @override
  String get postCommentSend => '发送';

  @override
  String get postNoComments => '暂无评论';

  @override
  String get postFirstComment => '成为第一个评论的人';

  @override
  String postFollowed(String factory) {
    return '已关注 $factory';
  }

  @override
  String postUnfollowed(String factory) {
    return '已取消关注 $factory';
  }

  @override
  String get postFollow => '关注';

  @override
  String get postUnfollow => '取消关注';

  @override
  String get postDelete => '删除帖子';

  @override
  String get postDeleteConfirm => '删除此帖子?';

  @override
  String get postDeleteConfirmBody => '此操作无法撤销。';

  @override
  String get postDeleted => '帖子已删除';

  @override
  String postDeletedWithTitle(String title) {
    return '帖子「$title」已删除';
  }

  @override
  String postLikeError(String error) {
    return '点赞失败: $error';
  }

  @override
  String postUnlikeError(String error) {
    return '取消点赞失败: $error';
  }

  @override
  String postSaveError(String error) {
    return '保存失败: $error';
  }

  @override
  String get groupBuyTitle => '团购';

  @override
  String groupBuyProgress(int current, int target) {
    return '$current / $target 件';
  }

  @override
  String groupBuyParticipants(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count 位参与者',
      zero: '暂无参与者',
    );
    return '$_temp0';
  }

  @override
  String groupBuyDeadline(String date) {
    return '截止: $date';
  }

  @override
  String get groupBuyJoin => '参与';

  @override
  String get groupBuyLeave => '退出';

  @override
  String get groupBuyEdit => '修改订单';

  @override
  String get groupBuyGoalReached => '已达标! 🎉';

  @override
  String get groupBuyExpired => '已过期';

  @override
  String get groupBuyJoinSheetTitle => '参与团购';

  @override
  String get groupBuyQuantity => '数量';

  @override
  String get groupBuyEstimatedTotal => '预计总价';

  @override
  String get groupBuyOwnPost => '这是您自己的团购';

  @override
  String groupBuyJoinedSnack(int qty, int total) {
    return '您已参与: $qty 件。已集: $total';
  }

  @override
  String get groupBuyLeaveConfirmTitle => '取消参与?';

  @override
  String get groupBuyLeaveConfirmBody => '您的订单将被删除。您可以稍后再次加入。';

  @override
  String get groupBuyLeaveConfirmAction => '取消';

  @override
  String get createPostTitle => '新帖子';

  @override
  String get createPostType => '帖子类型';

  @override
  String get createPostTypeProduct => '商品';

  @override
  String get createPostTypeReel => '短视频';

  @override
  String get createPostTypeHotDeal => '促销';

  @override
  String get createPostTypeGroupBuy => '团购';

  @override
  String get createPostMedia => '媒体';

  @override
  String get createPostAddPhoto => '图片';

  @override
  String get createPostAddVideo => '视频';

  @override
  String get createPostName => '标题';

  @override
  String get createPostNameHint => '简短清晰的商品名称';

  @override
  String get createPostDescription => '描述';

  @override
  String get createPostDescriptionHint => '材料、特点、包装、定制选项';

  @override
  String get createPostPrice => '价格';

  @override
  String get createPostPriceCurrency => '货币';

  @override
  String get createPostMoq => '最小起订量';

  @override
  String get createPostShippingDays => '发货天数';

  @override
  String get createPostStockStatus => '库存状态';

  @override
  String get createPostHashtagsLabel => '标签';

  @override
  String get createPostHashtagHint => '标签 (不带 #)';

  @override
  String get createPostAddHashtag => '添加';

  @override
  String get createPostHashtagMaxLimit => '最多 20 个标签';

  @override
  String get createPostHashtagDuplicate => '已添加';

  @override
  String get createPostPublish => '发布';

  @override
  String get createPostPublished => '帖子已发布!';

  @override
  String get createPostError => '发布失败';

  @override
  String get createPostNoMedia => '请至少添加一张图片或视频';

  @override
  String get createPostFactoryOnly => '只有工厂可以发布帖子';

  @override
  String get editProfileTitle => '编辑资料';

  @override
  String get editProfileAvatar => '头像';

  @override
  String get editProfilePickAvatar => '选择照片';

  @override
  String get editProfileName => '您的姓名';

  @override
  String get editProfileCompanyName => '公司名称';

  @override
  String get editProfileCountry => '国家';

  @override
  String get editProfileCity => '城市';

  @override
  String get editProfileSaved => '资料已更新';

  @override
  String hashtagScreenTitle(String tag) {
    return '#$tag 的帖子';
  }

  @override
  String get hashtagEmpty => '暂无此标签的帖子';

  @override
  String get hashtagBeFirst => '成为第一个使用此标签的人';

  @override
  String get savesTitle => '我的收藏';

  @override
  String get savesEmpty => '暂无收藏';

  @override
  String get savesEmptyHint => '点击任意帖子上的收藏图标即可保存到此';

  @override
  String savesLoadError(String error) {
    return '加载收藏失败: $error';
  }

  @override
  String savesLoadErrorHttp(int code) {
    return '加载收藏失败 (HTTP $code)';
  }

  @override
  String get countryNameKZ => '🇰🇿 哈萨克斯坦';

  @override
  String get countryNameRU => '🇷🇺 俄罗斯';

  @override
  String get countryNameCN => '🇨🇳 中国';

  @override
  String get countryNameUZ => '🇺🇿 乌兹别克斯坦';

  @override
  String get countryNameKG => '🇰🇬 吉尔吉斯斯坦';

  @override
  String get countryNameBY => '🇧🇾 白俄罗斯';

  @override
  String get countryNameTR => '🇹🇷 土耳其';

  @override
  String get followersTitle => '粉丝';

  @override
  String get followingTitle => '关注';

  @override
  String get followNoFollowers => '暂无粉丝';

  @override
  String get followNoFollowing => '暂无关注';

  @override
  String publicProfileFollowers(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count 位粉丝',
      zero: '0 位粉丝',
    );
    return '$_temp0';
  }

  @override
  String get publicProfilePosts => '帖子';

  @override
  String get publicProfileNoPosts => '暂无帖子';

  @override
  String get publicProfileAboutFactory => '工厂介绍';

  @override
  String get publicProfileTrustScore => '信誉分';

  @override
  String publicProfileTotalProducts(int count) {
    return '商品: $count';
  }

  @override
  String publicProfileTotalDeals(int count) {
    return '成交: $count';
  }

  @override
  String notifLikeText(String actor) {
    return '$actor 点赞了您的帖子';
  }

  @override
  String notifCommentText(String actor) {
    return '$actor 评论了您的帖子';
  }

  @override
  String notifMessageText(String actor) {
    return '$actor 发送了消息';
  }

  @override
  String notifReviewText(String actor) {
    return '$actor 留下了评价';
  }

  @override
  String get notifGroupBuyCompletedText => '团购成功完成!';

  @override
  String get commonJustNow => '刚刚';

  @override
  String commonMinutesShort(int count) {
    return '$count 分钟';
  }

  @override
  String commonHoursShort(int count) {
    return '$count 小时';
  }

  @override
  String commonDaysShort(int count) {
    return '$count 天';
  }

  @override
  String get commonExpired => '已过期';

  @override
  String get commonLessThanMinute => '<1 分钟';

  @override
  String get commentsSheetEmptyTitle => '暂无评论';

  @override
  String get commentsSheetEmptySubtitle => '成为第一个提问工厂的人。';

  @override
  String get groupBuyStatusCollecting => '正在拼团';

  @override
  String groupBuyDealText(int target, String price, String currency) {
    return '达到 $target 件时价格降至 $price $currency/件';
  }

  @override
  String get groupBuyCollected => '已集';

  @override
  String get groupBuyParticipantsLabel => '参与者';

  @override
  String get groupBuyRemaining => '剩余';

  @override
  String groupBuyParticipating(int qty) {
    return '您已参与: $qty 件';
  }

  @override
  String get groupBuyEditMyOrder => '修改';

  @override
  String get groupBuyLeaveShort => '取消';

  @override
  String groupBuyJoinWithRemaining(int count) {
    return '参与 · 剩余 $count 件';
  }

  @override
  String get groupBuyJoinSheetTitleLong => '您的团购订单';

  @override
  String get groupBuyJoinSheetSubtitle => '请输入您希望订购的数量';

  @override
  String get groupBuyJoinSheetEstimated => '预计:';

  @override
  String get groupBuyJoinSheetConfirm => '确认';

  @override
  String get reelsTitle => 'Reels';

  @override
  String get reelsEmptyTitle => '暂无视频';

  @override
  String get reelsEmptySubtitle => '工厂尚未发布视频。\n请稍后再来。';

  @override
  String get reelsMore => '详情';

  @override
  String publicProfileReviewsCountPlural(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count 条评价',
      zero: '暂无评价',
    );
    return '$_temp0';
  }

  @override
  String publicProfileReviewsSeeAll(String count) {
    return '$count — 查看全部';
  }

  @override
  String get publicProfileNoReviewsTitle => '暂无评价';

  @override
  String get publicProfileGetFirstReview => '获取第一条评价';

  @override
  String get publicProfileBeFirstReviewer => '成为第一个留评价的人';

  @override
  String get publicProfileFollowersLabel => '粉丝';

  @override
  String get publicProfileFollowingLabel => '关注';

  @override
  String get createPostMediaTitle => '商品媒体(最多10)';

  @override
  String createPostMediaCount(int count) {
    return '$count/10 媒体';
  }

  @override
  String get createPostMediaMaxReached => '最多 10 个媒体';

  @override
  String get createPostVideoTooLarge => '视频不得超过 50 MB';

  @override
  String createPostPickPhotosError(String error) {
    return '选择照片失败: $error';
  }

  @override
  String createPostPickVideoError(String error) {
    return '选择视频失败: $error';
  }

  @override
  String createPostPublishedWithTitle(String title) {
    return '帖子「$title」已发布';
  }

  @override
  String get createPostNoMediaSnack => '请至少添加一张照片';

  @override
  String get createPostTitleRequired => '标题 *';

  @override
  String get createPostTitleHintExample => '例如:纯棉宽松 T 恤';

  @override
  String get createPostTitleTooShort => '至少 3 个字符';

  @override
  String get createPostDescriptionHintExample => '材料、规格、认证…';

  @override
  String get createPostPriceRequired => '价格 *';

  @override
  String get createPostPriceHintExample => '4.50';

  @override
  String get createPostFieldRequired => '必填';

  @override
  String get createPostFieldInvalid => '无效';

  @override
  String get createPostMoqLabel => '起订量(最小批量)';

  @override
  String get createPostMoqMin => '≥ 1';

  @override
  String get createPostShippingLabel => '发货(天)';

  @override
  String get createPostShippingMin => '≥ 0';

  @override
  String get createPostStockInStock => '现货';

  @override
  String get createPostStockPreOrder => '预订';

  @override
  String get createPostStockOutOfStock => '无货';

  @override
  String get createPostCurrencyRequired => '货币 *';

  @override
  String get createPostHashtagInvalidChars => '标签只能包含字母、数字、_ 和 -';

  @override
  String get createPostHashtagHintExample => 'tshirt, wholesale, cotton…';

  @override
  String get editProfileNameLabel => '姓名';

  @override
  String get editProfileNameHint => '您的姓名?';

  @override
  String get editProfileCompanyRequiredLabel => '公司名称 *';

  @override
  String get editProfileCompanyHint => 'Guangzhou Apparel Co.';

  @override
  String get editProfileCompanyRequiredError => '工厂必填';

  @override
  String get editProfileLanguageLabel => '语言';

  @override
  String get editProfileCurrencyLabel => '货币';

  @override
  String get editProfileCountryLabel => '国家';

  @override
  String get editProfileCityLabel => '城市';

  @override
  String get editProfileCityHint => '阿拉木图';

  @override
  String editProfileAvatarUploadError(String error) {
    return '上传头像失败: $error';
  }

  @override
  String reviewsListTitle(String factoryName) {
    return '$factoryName 的评价';
  }

  @override
  String get reviewsListFabWrite => '写评价';

  @override
  String get reviewsListEmptyTitle => '暂无评价';

  @override
  String get reviewsListBeFirstLong => '成为第一个为此工厂留评价的人。';

  @override
  String get profileLogoutConfirmTitle => '退出登录?';

  @override
  String get profileLogoutConfirmBody => '会话将结束,您需要通过短信重新登录。';

  @override
  String get profileLogoutConfirmAction => '退出';

  @override
  String get profileEditTooltip => '编辑';

  @override
  String get profileRefreshTooltip => '刷新';

  @override
  String get profileReferralCopyTooltip => '复制';

  @override
  String profileReferralCopied(String code) {
    return '推荐码 $code 已复制';
  }

  @override
  String get profileLoadError => '加载资料失败';

  @override
  String get profileUpdatedSnack => '资料已更新';

  @override
  String get profileNoName => '未命名';

  @override
  String get profileAboutFactory => '工厂介绍';

  @override
  String profileFactoryTotalProducts(int count) {
    return '商品: $count';
  }

  @override
  String profileFactoryTotalDeals(int count) {
    return '成交: $count';
  }

  @override
  String profileFactoryTrustScore(int score) {
    return '信誉分: $score';
  }

  @override
  String get profileLanguageLabel => '语言';

  @override
  String get profileCurrencyLabel => '货币';

  @override
  String get profileCountryLabel => '国家';

  @override
  String get profileCityLabel => '城市';

  @override
  String get profileReferralCodeLabel => '推荐码';

  @override
  String get profileMyPosts => '我的商品';

  @override
  String get profileNoPostsYet => '暂无帖子';

  @override
  String feedLikesCount(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count 个赞',
      zero: '0 个赞',
    );
    return '$_temp0';
  }

  @override
  String feedMoqShort(int moq) {
    return '起订量: $moq 件';
  }

  @override
  String feedShippingDaysShort(int days) {
    return '$days 天';
  }

  @override
  String feedPriceSheetLine(int moq, int days) {
    return '起订量: $moq 件 • 发货: $days 天';
  }

  @override
  String feedSaveError(String error) {
    return '保存失败: $error';
  }

  @override
  String feedLikeErrorLike(String error) {
    return '点赞失败: $error';
  }

  @override
  String feedLikeErrorUnlike(String error) {
    return '取消点赞失败: $error';
  }

  @override
  String get feedCannotDetermineFactory => '无法确定工厂';

  @override
  String feedShareLinkCopied(String url) {
    return '链接已复制: $url';
  }

  @override
  String get feedEmptyFollowingTitle => '暂无关注的帖子';

  @override
  String get feedEmptyFollowingBody => '请在「全部」标签中关注工厂,他们的帖子将显示在此处。';

  @override
  String get feedEmptyHotDealTitle => '暂无促销';

  @override
  String get feedEmptyHotDealBody => '工厂尚未发布促销活动。请稍后再试 — 或尝试「全部」标签。';

  @override
  String get feedEmptyGenericTitle => '动态为空';

  @override
  String get feedEmptyGenericBody => '尚无工厂发布的帖子。\n下拉刷新。';

  @override
  String get feedRealtimeConnected => '实时连接已建立';

  @override
  String get feedRealtimeConnecting => '连接中…';

  @override
  String get feedRealtimeError => '连接错误,正在重试';

  @override
  String get feedRealtimeDisconnected => '无实时连接';

  @override
  String get feedReelsTooltip => 'Reels';

  @override
  String get feedNotificationsTooltip => '通知';

  @override
  String get searchHintTooltipClear => '清除';

  @override
  String get searchResetFiltersTooltip => '重置筛选';

  @override
  String get searchIdleTitle => '搜索商品';

  @override
  String get searchIdleBody => '输入名称、标签(#tshirt)或工厂品牌 — 至少 2 个字符。';

  @override
  String searchNoResultsBody(String query) {
    return '「$query」没有结果。请尝试其他关键词或标签。';
  }

  @override
  String get searchFiltersHotShort => '🔥 促销';

  @override
  String get chatErrorRetry => '重试';

  @override
  String get chatNoMessagesShort => '暂无消息';

  @override
  String get chatYouPrefix => '您:';

  @override
  String get chatTimeNow => '刚刚';

  @override
  String chatTimeMinutesShort(int count) {
    return '$count 分';
  }

  @override
  String chatTimeDaysShort(int count) {
    return '$count 天';
  }

  @override
  String notifActorLiked(String actor, String ref) {
    return '$actor 点赞了$ref';
  }

  @override
  String notifActorCommented(String actor, String ref) {
    return '$actor 评论了$ref';
  }

  @override
  String notifActorMessage(String actor) {
    return '$actor 发来了消息';
  }

  @override
  String notifActorReview(String actor) {
    return '$actor 留下了评价';
  }

  @override
  String notifGroupBuyCompletedWithRef(String ref) {
    return '团购成功完成!$ref';
  }

  @override
  String get notifYourPostRef => '您的帖子';

  @override
  String notifPostRef(String title) {
    return '「$title」';
  }

  @override
  String get notifTimeJustNow => '刚刚';

  @override
  String notifTimeMinutesAgo(int count) {
    return '$count 分钟前';
  }

  @override
  String notifTimeHoursAgo(int count) {
    return '$count 小时前';
  }

  @override
  String notifTimeDaysAgo(int count) {
    return '$count 天前';
  }

  @override
  String get storyAddLabel => '添加';

  @override
  String get storyPublishedSnack => '故事已发布';

  @override
  String get storyPhotoUploadError => '上传照片失败';

  @override
  String get storyTimeJustNow => '刚刚';

  @override
  String storyTimeMinutesShort(int count) {
    return '$count 分钟';
  }

  @override
  String storyTimeHoursShort(int count) {
    return '$count 小时';
  }

  @override
  String storyTimeDaysShort(int count) {
    return '$count 天';
  }

  @override
  String get authPhoneInvalidFormat => '请输入 +79991234567 格式的电话号码';

  @override
  String get postDetailSavedTooltip => '已收藏';

  @override
  String get postDetailSaveTooltip => '收藏';

  @override
  String get onboardingSkip => '跳过';

  @override
  String get onboardingNext => '下一步';

  @override
  String get onboardingGetStarted => '立即开始';

  @override
  String get feedPriceOnRequest => '价格面议';

  @override
  String get settingsQuietHoursOff => '关闭';

  @override
  String get postMenuReport => '举报';

  @override
  String get postMenuBlock => '屏蔽用户';

  @override
  String get blockUserConfirmTitle => '屏蔽用户？';

  @override
  String get blockUserConfirmBody => '他的帖子和消息将不再对您可见。您可以稍后在设置中取消屏蔽。';

  @override
  String get blockUserAction => '屏蔽';

  @override
  String get blockUserDone => '用户已屏蔽';

  @override
  String get reportTitle => '举报内容';

  @override
  String get reportSubtitle => '选择原因。我们的团队将审核举报。';

  @override
  String get reportDescriptionLabel => '附加详情（可选）';

  @override
  String get reportDescriptionHint => '描述问题所在';

  @override
  String get reportSubmit => '发送举报';

  @override
  String get reportSent => '举报已发送，谢谢！';

  @override
  String get searchHistoryTitle => '最近搜索';

  @override
  String get searchHistoryClear => '清除';

  @override
  String get settingsTheme => '主题';

  @override
  String get settingsThemeLight => '浅色';

  @override
  String get settingsThemeDark => '深色';

  @override
  String get settingsThemeSystem => '跟随系统';

  @override
  String get createPostCamera => '拍照';

  @override
  String get createPostVideoWrongFormat => '不支持此视频格式，请选择MP4文件。';

  @override
  String createPostVideoTooBig(String size) {
    return '视频太大（$size MB）。最大30 MB，请选择更短的视频。';
  }

  @override
  String get settingsComingSoon => '即将推出';

  @override
  String get onboardingTitle1 => '直连中国工厂';

  @override
  String get onboardingSubtitle1 => '去除中间商 — 直接从认证制造商采购电子产品、服装和商品';

  @override
  String get onboardingTitle2 => '安全交易与团购';

  @override
  String get onboardingSubtitle2 => '与其他买家联合下单 — 享受工厂价和更优运费';

  @override
  String get onboardingTitle3 => '即时联系工厂';

  @override
  String get onboardingSubtitle3 => '议价、索要样品、追踪发货 — 全部一站完成';

  @override
  String get onboardingTitle4 => '准备好了吗？';

  @override
  String get onboardingSubtitle4 => '30秒手机号注册 — 无需邮箱、无需文件';
}
