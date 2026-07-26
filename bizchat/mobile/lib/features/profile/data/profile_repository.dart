import 'package:dio/dio.dart';
import '../../../core/api/api_client.dart';
import '../../../core/currency/currency_repository.dart';
import '../../../core/i18n/locale_notifier.dart';

/// Профиль текущего юзера. Зеркалит DTO из `GET /api/v1/users/me`.
class MyProfile {
  MyProfile({
    required this.id,
    required this.phone,
    required this.type,
    required this.name,
    required this.avatarUrl,
    required this.language,
    required this.currency,
    required this.countryCode,
    required this.city,
    required this.referralCode,
    required this.bonusPoints,
    required this.verified,
    required this.factory,
    required this.pushEnabled,
    required this.notificationPrefs,
    this.postsCount = 0,
    this.followersCount = 0,
    this.followingCount = 0,
    this.quietHoursStart,
    this.quietHoursEnd,
  });

  final String id;
  final String phone;
  final String type; // 'buyer' | 'factory'
  final String? name;
  final String? avatarUrl;
  final String language;
  final String currency;
  final String? countryCode;
  final String? city;
  final String referralCode;
  /// Счётчики для шапки профиля (публикации / подписчики / подписки).
  final int postsCount;
  final int followersCount;
  final int followingCount;
  final int bonusPoints;
  final bool verified;
  final FactoryProfile? factory;
  final bool pushEnabled;
  final NotificationPrefs notificationPrefs;
  /// HH:MM начало тихого часа (push не доставляется). null = выключено.
  final String? quietHoursStart;
  final String? quietHoursEnd;

  bool get isFactory => type == 'factory';

  /// Копия профиля с обновлёнными полями push-настроек. Удобно для
  /// optimistic UI в SettingsScreen без полного ре-фетча /users/me.
  MyProfile copyWithPushPrefs({
    bool? pushEnabled,
    NotificationPrefs? notificationPrefs,
  }) {
    return MyProfile(
      id: id,
      phone: phone,
      type: type,
      name: name,
      avatarUrl: avatarUrl,
      language: language,
      currency: currency,
      countryCode: countryCode,
      city: city,
      referralCode: referralCode,
      bonusPoints: bonusPoints,
      verified: verified,
      factory: factory,
      // Счётчики шапки нужно переносить явно: без них после смены
      // push-настроек профиль перерисовывался с нулями.
      postsCount: postsCount,
      followersCount: followersCount,
      followingCount: followingCount,
      pushEnabled: pushEnabled ?? this.pushEnabled,
      notificationPrefs: notificationPrefs ?? this.notificationPrefs,
      quietHoursStart: quietHoursStart,
      quietHoursEnd: quietHoursEnd,
    );
  }

  /// Копия с новыми quiet hours.
  MyProfile copyWithQuietHours({String? start, String? end}) {
    return MyProfile(
      id: id,
      phone: phone,
      type: type,
      name: name,
      avatarUrl: avatarUrl,
      language: language,
      currency: currency,
      countryCode: countryCode,
      city: city,
      referralCode: referralCode,
      bonusPoints: bonusPoints,
      verified: verified,
      factory: factory,
      postsCount: postsCount,
      followersCount: followersCount,
      followingCount: followingCount,
      pushEnabled: pushEnabled,
      notificationPrefs: notificationPrefs,
      quietHoursStart: start,
      quietHoursEnd: end,
    );
  }

  factory MyProfile.fromJson(Map<String, dynamic> json) {
    return MyProfile(
      id: json['id'] as String,
      phone: json['phone'] as String,
      type: json['type'] as String,
      name: json['name'] as String?,
      avatarUrl: json['avatarUrl'] as String?,
      language: json['language'] as String? ?? 'ru',
      currency: json['currency'] as String? ?? 'USD',
      countryCode: json['countryCode'] as String?,
      city: json['city'] as String?,
      referralCode: json['referralCode'] as String? ?? '',
      bonusPoints: json['bonusPoints'] as int? ?? 0,
      verified: json['verified'] as bool? ?? false,
      postsCount: json['postsCount'] as int? ?? 0,
      followersCount: json['followersCount'] as int? ?? 0,
      followingCount: json['followingCount'] as int? ?? 0,
      factory: json['factory'] != null
          ? FactoryProfile.fromJson(
              (json['factory'] as Map).cast<String, dynamic>())
          : null,
      // Дефолты для старых юзеров, у которых эти поля ещё не пришли от бэка.
      pushEnabled: json['pushEnabled'] as bool? ?? true,
      notificationPrefs: json['notificationPrefs'] is Map
          ? NotificationPrefs.fromJson(
              (json['notificationPrefs'] as Map).cast<String, dynamic>())
          : const NotificationPrefs.defaults(),
      quietHoursStart: json['quietHoursStart'] as String?,
      quietHoursEnd: json['quietHoursEnd'] as String?,
    );
  }
}

/// Granular preferences для push-уведомлений. Зеркалит jsonb-поле
/// `users.notification_prefs` на бэке. Все флаги по умолчанию `true` —
/// юзер получает всё, пока явно не отключит отдельную категорию.
class NotificationPrefs {
  const NotificationPrefs({
    required this.likes,
    required this.comments,
    required this.messages,
    required this.reviews,
    required this.groupBuy,
  });

  /// Дефолтные настройки для старых юзеров без `notification_prefs` в БД.
  const NotificationPrefs.defaults()
      : likes = true,
        comments = true,
        messages = true,
        reviews = true,
        groupBuy = true;

  final bool likes;
  final bool comments;
  final bool messages;
  final bool reviews;
  final bool groupBuy;

  NotificationPrefs copyWith({
    bool? likes,
    bool? comments,
    bool? messages,
    bool? reviews,
    bool? groupBuy,
  }) {
    return NotificationPrefs(
      likes: likes ?? this.likes,
      comments: comments ?? this.comments,
      messages: messages ?? this.messages,
      reviews: reviews ?? this.reviews,
      groupBuy: groupBuy ?? this.groupBuy,
    );
  }

  factory NotificationPrefs.fromJson(Map<String, dynamic> json) {
    return NotificationPrefs(
      likes: json['likes'] as bool? ?? true,
      comments: json['comments'] as bool? ?? true,
      messages: json['messages'] as bool? ?? true,
      reviews: json['reviews'] as bool? ?? true,
      groupBuy: json['groupBuy'] as bool? ?? true,
    );
  }

  Map<String, dynamic> toJson() => {
        'likes': likes,
        'comments': comments,
        'messages': messages,
        'reviews': reviews,
        'groupBuy': groupBuy,
      };
}

class FactoryProfile {
  FactoryProfile({
    required this.companyName,
    this.description,
    this.website,
    this.whatsapp,
    required this.hashtags,
    required this.trustScore,
    required this.verifiedAt,
    required this.totalProducts,
    required this.totalDeals,
    required this.avgRating,
    required this.reviewsCount,
  });

  final String companyName;
  /// «О себе» завода — многострочное описание для витрины.
  final String? description;
  final String? website;
  final String? whatsapp;
  final List<String> hashtags;
  final int trustScore;
  final DateTime? verifiedAt;
  final int totalProducts;
  final int totalDeals;
  final double avgRating;
  final int reviewsCount;

  factory FactoryProfile.fromJson(Map<String, dynamic> json) {
    return FactoryProfile(
      companyName: json['companyName'] as String? ?? 'Завод',
      description: json['description'] as String?,
      website: json['website'] as String?,
      whatsapp: json['whatsapp'] as String?,
      hashtags: (json['hashtags'] as List?)?.cast<String>() ?? const [],
      trustScore: json['trustScore'] as int? ?? 50,
      verifiedAt: json['verifiedAt'] != null
          ? DateTime.tryParse(json['verifiedAt'] as String)
          : null,
      totalProducts: json['totalProducts'] as int? ?? 0,
      totalDeals: json['totalDeals'] as int? ?? 0,
      avgRating: (json['avgRating'] as num?)?.toDouble() ?? 0.0,
      reviewsCount: json['reviewsCount'] as int? ?? 0,
    );
  }
}

/// Подписчик/подписка — компактная карточка юзера для списков.
class FollowUser {
  FollowUser({
    required this.id,
    required this.type,
    required this.name,
    required this.avatarUrl,
    required this.companyName,
    required this.followedAt,
  });

  final String id;
  final String type;
  final String? name;
  final String? avatarUrl;
  final String? companyName;
  final DateTime followedAt;

  String get displayName {
    if (companyName != null && companyName!.isNotEmpty) return companyName!;
    if (name != null && name!.isNotEmpty) return name!;
    return type == 'factory' ? 'Завод' : 'Байер';
  }

  factory FollowUser.fromJson(Map<String, dynamic> json) {
    return FollowUser(
      id: json['id'] as String,
      type: json['type'] as String,
      name: json['name'] as String?,
      avatarUrl: json['avatarUrl'] as String?,
      companyName: json['companyName'] as String?,
      followedAt: DateTime.parse(json['followedAt'] as String),
    );
  }
}

/// Компактная превью-карточка поста для grid'а на профиле.
/// Минимум полей — нам нужны только thumbnail и метаданные для navigation.
class UserPostPreview {
  UserPostPreview({
    required this.id,
    required this.title,
    required this.thumbnailUrl,
    required this.priceAmount,
    required this.priceCurrency,
    required this.likesCount,
    required this.viewsCount,
    required this.isHotDeal,
    required this.hasVideo,
  });

  final String id;
  final String title;
  final String? thumbnailUrl;
  final String priceAmount;
  final String priceCurrency;
  final int likesCount;
  final int viewsCount;
  final bool isHotDeal;

  /// Есть ли среди медиа видео — по этому признаку пост попадает во
  /// вкладку с видео на профиле.
  final bool hasVideo;

  factory UserPostPreview.fromJson(Map<String, dynamic> json) {
    final media = (json['media'] as List?) ?? const [];
    String? thumb;
    if (media.isNotEmpty) {
      final first = media.first;
      if (first is Map) thumb = first['url'] as String?;
    }
    final hasVideo = media.any(
      (m) => m is Map && (m['type'] as String?) == 'video',
    );
    return UserPostPreview(
      id: json['id'] as String,
      title: json['title'] as String? ?? '',
      thumbnailUrl: thumb,
      priceAmount: (json['priceAmount'] ?? '').toString(),
      priceCurrency: json['priceCurrency'] as String? ?? '',
      likesCount: (json['likesCount'] as num?)?.toInt() ?? 0,
      viewsCount: (json['viewsCount'] as num?)?.toInt() ?? 0,
      isHotDeal: json['isHotDeal'] as bool? ?? false,
      hasVideo: hasVideo,
    );
  }
}

/// Публичный профиль чужого юзера (для экрана «профиль завода»).
class PublicProfile {
  PublicProfile({
    required this.id,
    required this.type,
    required this.name,
    required this.avatarUrl,
    required this.countryCode,
    required this.city,
    required this.factoryCompanyName,
    required this.factoryHashtags,
    required this.factoryTrustScore,
    required this.factoryTotalProducts,
    required this.factoryTotalDeals,
    required this.factoryAvgRating,
    required this.factoryReviewsCount,
    required this.followersCount,
    required this.followingCount,
    required this.isFollowing,
    required this.isMe,
  });

  final String id;
  final String type;
  final String? name;
  final String? avatarUrl;
  final String? countryCode;
  final String? city;
  final String? factoryCompanyName;
  final List<String> factoryHashtags;
  final int? factoryTrustScore;
  final int? factoryTotalProducts;
  final int? factoryTotalDeals;
  final double factoryAvgRating;
  final int factoryReviewsCount;
  final int followersCount;
  final int followingCount;
  final bool isFollowing;
  final bool isMe;

  bool get isFactory => type == 'factory';

  /// Отображаемое имя: name → companyName → fallback.
  String get displayName {
    if (name != null && name!.isNotEmpty) return name!;
    if (factoryCompanyName != null && factoryCompanyName!.isNotEmpty) {
      return factoryCompanyName!;
    }
    return isFactory ? 'Завод' : 'Байер';
  }

  factory PublicProfile.fromJson(Map<String, dynamic> json) {
    final factory = json['factory'] as Map?;
    return PublicProfile(
      id: json['id'] as String,
      type: json['type'] as String,
      name: json['name'] as String?,
      avatarUrl: json['avatarUrl'] as String?,
      countryCode: json['countryCode'] as String?,
      city: json['city'] as String?,
      factoryCompanyName: factory?['companyName'] as String?,
      factoryHashtags:
          (factory?['hashtags'] as List?)?.cast<String>() ?? const [],
      factoryTrustScore: factory?['trustScore'] as int?,
      factoryTotalProducts: factory?['totalProducts'] as int?,
      factoryTotalDeals: factory?['totalDeals'] as int?,
      factoryAvgRating: (factory?['avgRating'] as num?)?.toDouble() ?? 0.0,
      factoryReviewsCount: factory?['reviewsCount'] as int? ?? 0,
      followersCount: json['followersCount'] as int? ?? 0,
      followingCount: json['followingCount'] as int? ?? 0,
      isFollowing: json['isFollowing'] as bool? ?? false,
      isMe: json['isMe'] as bool? ?? false,
    );
  }
}

class ProfileRepository {
  ProfileRepository({ApiClient? api}) : _api = api ?? ApiClient.instance;
  final ApiClient _api;

  /// GET /users/:id — публичный профиль юзера. Возвращает счётчики подписок
  /// и флаг `isFollowing` если запрос авторизован.
  Future<PublicProfile> loadPublicProfile(String userId) async {
    try {
      final res = await _api.dio.get('/users/$userId');
      if (res.statusCode != 200) {
        throw Exception(
            'Не удалось загрузить профиль (HTTP ${res.statusCode})');
      }
      return PublicProfile.fromJson(
          (res.data as Map).cast<String, dynamic>());
    } on DioException catch (e) {
      throw Exception('Не удалось загрузить профиль: ${e.message}');
    }
  }

  /// GET /users/:id/followers — список подписчиков. Курсорная пагинация.
  Future<List<FollowUser>> loadFollowers(String userId) async {
    try {
      final res = await _api.dio.get('/users/$userId/followers');
      if (res.statusCode != 200) {
        throw Exception(
            'Не удалось загрузить подписчиков (HTTP ${res.statusCode})');
      }
      final data = (res.data as Map).cast<String, dynamic>();
      final rawData = data['data'];
      if (rawData is! List) return const [];
      return rawData
          .map((e) => FollowUser.fromJson((e as Map).cast<String, dynamic>()))
          .toList();
    } on DioException catch (e) {
      throw Exception('Не удалось загрузить подписчиков: ${e.message}');
    }
  }

  /// GET /users/:id/following — список тех, на кого подписан этот юзер.
  Future<List<FollowUser>> loadFollowing(String userId) async {
    try {
      final res = await _api.dio.get('/users/$userId/following');
      if (res.statusCode != 200) {
        throw Exception(
            'Не удалось загрузить подписки (HTTP ${res.statusCode})');
      }
      final data = (res.data as Map).cast<String, dynamic>();
      final rawData = data['data'];
      if (rawData is! List) return const [];
      return rawData
          .map((e) => FollowUser.fromJson((e as Map).cast<String, dynamic>()))
          .toList();
    } on DioException catch (e) {
      throw Exception('Не удалось загрузить подписки: ${e.message}');
    }
  }

  /// GET /users/:id/posts — посты конкретного юзера для grid'а на профиле.
  Future<List<UserPostPreview>> loadUserPosts(
    String userId, {
    String? cursor,
    int limit = 30,
  }) async {
    try {
      final res = await _api.dio.get(
        '/users/$userId/posts',
        queryParameters: {
          'limit': limit.toString(),
          if (cursor != null) 'cursor': cursor,
        },
      );
      if (res.statusCode != 200) {
        throw Exception('Не удалось загрузить посты (HTTP ${res.statusCode})');
      }
      final data = (res.data as Map).cast<String, dynamic>();
      final rawData = data['data'];
      if (rawData is! List) return const [];
      return rawData
          .map((e) =>
              UserPostPreview.fromJson((e as Map).cast<String, dynamic>()))
          .toList();
    } on DioException catch (e) {
      throw Exception('Не удалось загрузить посты: ${e.message}');
    }
  }

  Future<void> follow(String userId) async {
    try {
      await _api.dio.post('/users/$userId/follow');
    } on DioException catch (e) {
      final data = e.response?.data;
      if (data is Map && data['message'] != null) {
        throw Exception(data['message'].toString());
      }
      throw Exception('Не удалось подписаться: ${e.message}');
    }
  }

  Future<void> unfollow(String userId) async {
    try {
      await _api.dio.delete('/users/$userId/follow');
    } on DioException catch (_) {/* unfollow — best-effort */}
  }

  /// POST /trust-score/recalc/:userId — ручной триггер пересчёта Trust Score
  /// для конкретного завода. В prod это будет cron раз в сутки.
  Future<int?> recalcTrustScore(String userId) async {
    try {
      final res = await _api.dio.post('/trust-score/recalc/$userId');
      if (res.statusCode != 200) return null;
      final data = (res.data as Map).cast<String, dynamic>();
      return data['score'] as int?;
    } on DioException catch (_) {
      return null;
    }
  }

  /// POST /translate — переводит текст на указанный язык.
  /// Бэк кеширует результаты на серверной стороне.
  Future<String> translate({
    required String text,
    required String targetLang,
    String? sourceLang,
  }) async {
    try {
      final res = await _api.dio.post(
        '/translate',
        data: {
          'text': text,
          'targetLang': targetLang,
          if (sourceLang != null) 'sourceLang': sourceLang,
        },
      );
      final data = (res.data as Map).cast<String, dynamic>();
      return data['translated'] as String;
    } on DioException catch (e) {
      final data = e.response?.data;
      if (data is Map && data['message'] != null) {
        throw Exception(data['message'].toString());
      }
      throw Exception('Не удалось перевести: ${e.message}');
    }
  }

  /// GET /users/me — токен подкладывается auth-интерсептором автоматом.
  Future<MyProfile> loadMe() async {
    try {
      final res = await _api.dio.get('/users/me');
      if (res.statusCode != 200) {
        throw Exception('Не удалось загрузить профиль (HTTP ${res.statusCode})');
      }
      final profile = MyProfile.fromJson((res.data as Map).cast<String, dynamic>());
      // Сохраняем валюту юзера в global currency cache — UI карточек поста
      // использует её для авто-конвертации цен.
      CurrencyRepository.instance.currentUserCurrency = profile.currency;
      // Локаль интерфейса — из профиля. Hot-switch при смене.
      LocaleNotifier.instance.setFromCode(profile.language);
      return profile;
    } on DioException catch (e) {
      throw Exception('Не удалось загрузить профиль: ${e.message}');
    }
  }

  /// PATCH /users/me — частичное обновление профиля. Все поля опциональны;
  /// что не передано — не меняется.
  ///
  /// `notificationPrefsPatch` — частичный merge: фронт шлёт только изменённые
  /// ключи, например `{'likes': false}`. Бэк делает merge с существующим
  /// jsonb, остальные ключи сохраняются без изменений.
  Future<MyProfile> updateMe({
    String? name,
    String? avatarUrl,
    String? language,
    String? currency,
    String? countryCode,
    String? city,
    String? companyName,
    bool? pushEnabled,
    Map<String, bool>? notificationPrefsPatch,
    /// HH:MM или пустая строка/null чтобы отключить.
    String? quietHoursStart,
    String? quietHoursEnd,
    bool clearQuietHours = false,
  }) async {
    final body = <String, dynamic>{};
    if (name != null) body['name'] = name;
    if (avatarUrl != null) body['avatarUrl'] = avatarUrl;
    if (language != null) body['language'] = language;
    if (currency != null) body['currency'] = currency;
    if (countryCode != null) body['countryCode'] = countryCode;
    if (city != null) body['city'] = city;
    if (companyName != null) body['companyName'] = companyName;
    if (pushEnabled != null) body['pushEnabled'] = pushEnabled;
    if (notificationPrefsPatch != null && notificationPrefsPatch.isNotEmpty) {
      body['notificationPrefs'] = notificationPrefsPatch;
    }
    if (clearQuietHours) {
      body['quietHoursStart'] = null;
      body['quietHoursEnd'] = null;
    } else {
      if (quietHoursStart != null) body['quietHoursStart'] = quietHoursStart;
      if (quietHoursEnd != null) body['quietHoursEnd'] = quietHoursEnd;
    }
    try {
      final res = await _api.dio.patch('/users/me', data: body);
      if (res.statusCode != 200) {
        throw Exception('Ошибка сохранения (HTTP ${res.statusCode})');
      }
      final updated =
          MyProfile.fromJson((res.data as Map).cast<String, dynamic>());
      // Если юзер сменил валюту — обновляем global cache, чтобы конвертация
      // в ленте сразу пересчиталась.
      CurrencyRepository.instance.currentUserCurrency = updated.currency;
      // То же для языка интерфейса.
      LocaleNotifier.instance.setFromCode(updated.language);
      return updated;
    } on DioException catch (e) {
      final data = e.response?.data;
      if (data is Map && data['message'] != null) {
        throw Exception(data['message'].toString());
      }
      throw Exception('Не удалось сохранить: ${e.message}');
    }
  }
}
