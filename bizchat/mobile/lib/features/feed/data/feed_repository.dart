import 'package:dio/dio.dart';
import '../../../core/api/api_client.dart';

/// Один ценовой тир (от какого количества — какая цена за штуку).
class PriceTier {
  PriceTier({required this.quantity, required this.price});
  final int quantity;
  final String price; // numeric с бэка приходит как число или строка — храним строкой для точности

  factory PriceTier.fromJson(Map<String, dynamic> json) {
    return PriceTier(
      quantity: (json['quantity'] as num).toInt(),
      price: json['price'].toString(),
    );
  }
}

/// Состояние групповой закупки. Присутствует только у постов с type='group_buy'.
class GroupBuyState {
  GroupBuyState({
    required this.targetQuantity,
    required this.currentQuantity,
    required this.participantCount,
    required this.deadline,
    required this.unitPrice,
    required this.isGoalReached,
    required this.isActive,
    required this.myOrderQuantity,
  });

  final int targetQuantity;
  final int currentQuantity;
  final int participantCount;
  final DateTime? deadline;
  final String? unitPrice; // цена за штуку при достижении threshold
  final bool isGoalReached;
  final bool isActive; // deadline не истёк И цель не достигнута
  final int myOrderQuantity; // 0 если не участвует

  bool get isPastDeadline =>
      deadline != null && DateTime.now().isAfter(deadline!);

  /// Процент заполнения 0..1 для прогресс-бара.
  double get progress {
    if (targetQuantity <= 0) return 0;
    return (currentQuantity / targetQuantity).clamp(0.0, 1.0);
  }

  GroupBuyState copyWith({
    int? currentQuantity,
    int? participantCount,
    int? myOrderQuantity,
    bool? isGoalReached,
  }) {
    return GroupBuyState(
      targetQuantity: targetQuantity,
      currentQuantity: currentQuantity ?? this.currentQuantity,
      participantCount: participantCount ?? this.participantCount,
      deadline: deadline,
      unitPrice: unitPrice,
      isGoalReached: isGoalReached ?? this.isGoalReached,
      isActive: isActive,
      myOrderQuantity: myOrderQuantity ?? this.myOrderQuantity,
    );
  }

  factory GroupBuyState.fromJson(Map<String, dynamic> json) {
    return GroupBuyState(
      targetQuantity: (json['targetQuantity'] as num).toInt(),
      currentQuantity: (json['currentQuantity'] as num?)?.toInt() ?? 0,
      participantCount:
          (json['participantCount'] as num?)?.toInt() ?? 0,
      deadline: json['deadline'] != null
          ? DateTime.tryParse(json['deadline'] as String)
          : null,
      unitPrice: json['unitPrice']?.toString(),
      isGoalReached: json['isGoalReached'] as bool? ?? false,
      isActive: json['isActive'] as bool? ?? false,
      myOrderQuantity: (json['myOrderQuantity'] as num?)?.toInt() ?? 0,
    );
  }
}

/// Результат join/leave group buy — свежие счётчики.
class GroupBuyResult {
  GroupBuyResult({
    required this.joined,
    required this.myQuantity,
    required this.currentQuantity,
    required this.participantCount,
    required this.isGoalReached,
  });
  final bool joined;
  final int myQuantity;
  final int currentQuantity;
  final int participantCount;
  final bool isGoalReached;

  factory GroupBuyResult.fromJson(Map<String, dynamic> json) {
    return GroupBuyResult(
      joined: json['joined'] as bool,
      myQuantity: (json['myQuantity'] as num?)?.toInt() ?? 0,
      currentQuantity: (json['currentQuantity'] as num?)?.toInt() ?? 0,
      participantCount: (json['participantCount'] as num?)?.toInt() ?? 0,
      isGoalReached: json['isGoalReached'] as bool? ?? false,
    );
  }
}

/// Модель поста для ленты. Плоская — ровно то что приходит от бэка.
class FeedPost {
  FeedPost({
    required this.id,
    required this.title,
    required this.description,
    required this.hashtags,
    required this.media,
    required this.priceAmount,
    required this.priceCurrency,
    required this.priceTiers,
    required this.moq,
    required this.shippingDays,
    required this.stockStatus,
    required this.likesCount,
    required this.commentsCount,
    required this.sharesCount,
    required this.viewsCount,
    required this.factoryName,
    required this.factoryUserId,
    required this.trustScore,
    required this.factoryAvgRating,
    required this.factoryReviewsCount,
    required this.isLikedByMe,
    required this.isSavedByMe,
    required this.isHotDeal,
    required this.discountPercent,
    required this.type,
    required this.groupBuy,
  });

  final String id;
  final String title;
  final String? description;
  final List<String> hashtags;
  final List<Map<String, dynamic>> media;
  final String priceAmount;
  final String priceCurrency;
  final List<PriceTier> priceTiers;
  final int moq;
  final int shippingDays;
  final String stockStatus;
  final int likesCount;
  final int commentsCount;
  final int sharesCount;
  final int viewsCount;
  final String factoryName;
  final String? factoryUserId; // owner — для проверки прав на удаление
  final int trustScore;
  final double factoryAvgRating;
  final int factoryReviewsCount;
  final bool isLikedByMe;
  final bool isSavedByMe;
  final bool isHotDeal;
  final int discountPercent;
  final String type; // 'product' | 'reel' | 'hot_deal' | 'group_buy'
  final GroupBuyState? groupBuy; // null для не-group_buy постов

  /// Возвращает копию с изменёнными счётчиками — для оптимистичных
  /// апдейтов (лайк, новый коммент, bookmark, share, group buy) без
  /// перезагрузки ленты.
  FeedPost copyWith({
    int? likesCount,
    int? commentsCount,
    int? sharesCount,
    int? viewsCount,
    bool? isLikedByMe,
    bool? isSavedByMe,
    GroupBuyState? groupBuy,
  }) {
    return FeedPost(
      id: id,
      title: title,
      description: description,
      hashtags: hashtags,
      media: media,
      priceAmount: priceAmount,
      priceCurrency: priceCurrency,
      priceTiers: priceTiers,
      moq: moq,
      shippingDays: shippingDays,
      stockStatus: stockStatus,
      likesCount: likesCount ?? this.likesCount,
      commentsCount: commentsCount ?? this.commentsCount,
      sharesCount: sharesCount ?? this.sharesCount,
      viewsCount: viewsCount ?? this.viewsCount,
      factoryName: factoryName,
      factoryUserId: factoryUserId,
      trustScore: trustScore,
      factoryAvgRating: factoryAvgRating,
      factoryReviewsCount: factoryReviewsCount,
      isLikedByMe: isLikedByMe ?? this.isLikedByMe,
      isSavedByMe: isSavedByMe ?? this.isSavedByMe,
      isHotDeal: isHotDeal,
      discountPercent: discountPercent,
      type: type,
      groupBuy: groupBuy ?? this.groupBuy,
    );
  }

  factory FeedPost.fromJson(Map<String, dynamic> json) {
    final price = (json['price'] as Map).cast<String, dynamic>();
    final counters = (json['counters'] as Map).cast<String, dynamic>();
    final factory = json['factory'] as Map?;
    return FeedPost(
      id: json['id'] as String,
      title: json['title'] as String,
      description: json['description'] as String?,
      hashtags: (json['hashtags'] as List?)?.cast<String>() ?? const [],
      media: (json['media'] as List?)
              ?.map((e) => (e as Map).cast<String, dynamic>())
              .toList() ??
          const [],
      priceAmount: price['amount'].toString(),
      priceCurrency: price['currency'] as String,
      priceTiers: (price['tiers'] as List?)
              ?.map((e) => PriceTier.fromJson((e as Map).cast<String, dynamic>()))
              .toList() ??
          const [],
      moq: json['moq'] as int? ?? 1,
      shippingDays: json['shippingDays'] as int? ?? 7,
      stockStatus: json['stockStatus'] as String? ?? 'in_stock',
      likesCount: counters['likes'] as int? ?? 0,
      commentsCount: counters['comments'] as int? ?? 0,
      sharesCount: counters['shares'] as int? ?? 0,
      viewsCount: counters['views'] as int? ?? 0,
      factoryName: factory?['companyName'] as String? ?? 'Завод',
      factoryUserId: factory?['userId'] as String?,
      trustScore: factory?['trustScore'] as int? ?? 50,
      factoryAvgRating: (factory?['avgRating'] as num?)?.toDouble() ?? 0.0,
      factoryReviewsCount: factory?['reviewsCount'] as int? ?? 0,
      isLikedByMe: json['isLikedByMe'] as bool? ?? false,
      isSavedByMe: json['isSavedByMe'] as bool? ?? false,
      isHotDeal: json['isHotDeal'] as bool? ?? false,
      discountPercent: json['discountPercent'] as int? ?? 0,
      type: json['type'] as String? ?? 'product',
      groupBuy: json['groupBuy'] != null
          ? GroupBuyState.fromJson(
              (json['groupBuy'] as Map).cast<String, dynamic>())
          : null,
    );
  }
}

class FeedPage {
  FeedPage({required this.items, required this.nextCursor, required this.hasMore});
  final List<FeedPost> items;
  final String? nextCursor;
  final bool hasMore;
}

/// Результат успешного like/unlike — нужны актуальные данные, чтобы UI
/// не разъезжался с бэком (например если уже было лайкнуто).
class LikeResult {
  LikeResult({required this.liked, required this.likesCount});
  final bool liked;
  final int likesCount;
}

/// Результат save/unsave. Без счётчика, т.к. для сохранений его не ведём.
class SaveResult {
  SaveResult({required this.saved});
  final bool saved;
}

/// Результат POST /share — актуальный счётчик с бэка.
class ShareResult {
  ShareResult({required this.sharesCount});
  final int sharesCount;
}

/// Простой in-memory кэш первой страницы фида с TTL.
/// Глобальный, чтобы повторные открытия экрана (например после возврата с
/// post_detail) показывали ленту мгновенно. Pull-to-refresh передаёт
/// `forceRefresh: true` чтобы обойти кэш.
class _FeedCache {
  static final Map<String, _CachedPage> _entries = {};
  static const _ttl = Duration(seconds: 30);

  static String _key(String filter, int limit) => '$filter:$limit';

  static FeedPage? get(String filter, int limit) {
    final entry = _entries[_key(filter, limit)];
    if (entry == null) return null;
    if (DateTime.now().difference(entry.cachedAt) > _ttl) {
      _entries.remove(_key(filter, limit));
      return null;
    }
    return entry.page;
  }

  static void put(String filter, int limit, FeedPage page) {
    _entries[_key(filter, limit)] = _CachedPage(page, DateTime.now());
  }

  static void invalidate() => _entries.clear();
}

class _CachedPage {
  _CachedPage(this.page, this.cachedAt);
  final FeedPage page;
  final DateTime cachedAt;
}

class FeedRepository {
  FeedRepository({ApiClient? api}) : _api = api ?? ApiClient.instance;
  final ApiClient _api;

  /// Сбросить in-memory кэш первой страницы (после создания/удаления поста).
  static void invalidateFeedCache() => _FeedCache.invalidate();

  /// Загрузить посты по хэштегу. Точное (case-insensitive) совпадение.
  Future<FeedPage> loadByHashtag(
    String tag, {
    String? cursor,
    int limit = 20,
  }) async {
    try {
      final res = await _api.dio.get(
        '/posts/hashtag/$tag',
        queryParameters: {
          'limit': limit.toString(),
          if (cursor != null) 'cursor': cursor,
        },
      );
      // validateStatus в ApiClient пропускает 4xx → проверяем вручную,
      // иначе на 401/429/404 res.data будет error-объектом без ключа 'data'
      // и `data['data'] as List` упадёт с null is not subtype.
      if (res.statusCode != 200) {
        throw Exception('Не удалось загрузить хэштег (HTTP ${res.statusCode})');
      }
      final data = (res.data as Map).cast<String, dynamic>();
      final rawData = data['data'];
      if (rawData is! List) {
        // Сервер вернул не-список — отдаём пустую страницу, UI покажет empty.
        return FeedPage(items: const [], nextCursor: null, hasMore: false);
      }
      final items = rawData
          .map((e) => FeedPost.fromJson((e as Map).cast<String, dynamic>()))
          .toList();
      final meta = (data['meta'] as Map?)?.cast<String, dynamic>() ?? const {};
      return FeedPage(
        items: items,
        nextCursor: meta['nextCursor'] as String?,
        hasMore: meta['hasMore'] as bool? ?? false,
      );
    } on DioException catch (e) {
      throw Exception('Не удалось загрузить хэштег: ${e.message}');
    }
  }

  /// Загрузить страницу reels — постов с видео-медиа. Курсорная пагинация.
  Future<FeedPage> loadReels({String? cursor, int limit = 20}) async {
    try {
      final res = await _api.dio.get(
        '/posts/reels',
        queryParameters: {
          'limit': limit.toString(),
          if (cursor != null) 'cursor': cursor,
        },
      );
      // validateStatus в ApiClient пропускает 4xx → проверяем вручную.
      if (res.statusCode != 200) {
        throw Exception('Не удалось загрузить reels (HTTP ${res.statusCode})');
      }
      final data = (res.data as Map).cast<String, dynamic>();
      final rawData = data['data'];
      if (rawData is! List) {
        return FeedPage(items: const [], nextCursor: null, hasMore: false);
      }
      final items = rawData
          .map((e) => FeedPost.fromJson((e as Map).cast<String, dynamic>()))
          .toList();
      final meta = (data['meta'] as Map?)?.cast<String, dynamic>() ?? const {};
      return FeedPage(
        items: items,
        nextCursor: meta['nextCursor'] as String?,
        hasMore: meta['hasMore'] as bool? ?? false,
      );
    } on DioException catch (e) {
      throw Exception('Не удалось загрузить reels: ${e.message}');
    }
  }

  /// Загрузить один пост по id для экрана детали.
  Future<FeedPost> loadPost(String id) async {
    try {
      final res = await _api.dio.get('/posts/$id');
      if (res.statusCode == 404) {
        throw Exception('Пост не найден');
      }
      if (res.statusCode != 200) {
        throw Exception('Ошибка загрузки поста (HTTP ${res.statusCode})');
      }
      return FeedPost.fromJson((res.data as Map).cast<String, dynamic>());
    } on DioException catch (e) {
      throw Exception('Не удалось загрузить пост: ${e.message}');
    }
  }

  /// Поиск постов по запросу. Бэк ищет по трём критериям (OR): точный
  /// хэштег, title ILIKE, description ILIKE. Запрос <2 символов → пусто.
  ///
  /// Опциональные фильтры: minPrice/maxPrice (в USD), maxMoq, countryCode
  /// (2-буквенный код страны factory), hotDealOnly. Применяются как AND.
  Future<FeedPage> searchPosts(
    String query, {
    String? cursor,
    int limit = 20,
    double? minPrice,
    double? maxPrice,
    int? maxMoq,
    String? countryCode,
    bool hotDealOnly = false,
  }) async {
    try {
      final res = await _api.dio.get(
        '/posts/search',
        queryParameters: {
          'q': query,
          'limit': limit.toString(),
          if (cursor != null) 'cursor': cursor,
          if (minPrice != null) 'minPrice': minPrice.toString(),
          if (maxPrice != null) 'maxPrice': maxPrice.toString(),
          if (maxMoq != null) 'maxMoq': maxMoq.toString(),
          if (countryCode != null && countryCode.isNotEmpty)
            'countryCode': countryCode,
          if (hotDealOnly) 'hotDealOnly': 'true',
        },
      );
      if (res.statusCode != 200) {
        throw Exception('Ошибка поиска (HTTP ${res.statusCode})');
      }
      final data = (res.data as Map).cast<String, dynamic>();
      final rawData = data['data'];
      if (rawData is! List) {
        return FeedPage(items: const [], nextCursor: null, hasMore: false);
      }
      final items = rawData
          .map((e) => FeedPost.fromJson((e as Map).cast<String, dynamic>()))
          .toList();
      final meta = (data['meta'] as Map?)?.cast<String, dynamic>() ?? const {};
      return FeedPage(
        items: items,
        nextCursor: meta['nextCursor'] as String?,
        hasMore: meta['hasMore'] as bool? ?? false,
      );
    } on DioException catch (e) {
      throw Exception('Не удалось выполнить поиск: ${e.message}');
    }
  }

  Future<FeedPage> loadFeed({
    String? cursor,
    int limit = 20,
    String filter = 'all', // 'all' | 'following'
    bool forceRefresh = false,
  }) async {
    // In-memory кэш только для первой страницы (cursor == null) и без
    // forceRefresh. TTL 30 секунд — компромисс между свежестью и скоростью
    // повторного открытия экрана. Pull-to-refresh передаёт forceRefresh=true.
    if (cursor == null && !forceRefresh) {
      final cached = _FeedCache.get(filter, limit);
      if (cached != null) return cached;
    }
    try {
      final res = await _api.dio.get(
        '/posts/feed',
        queryParameters: {
          'limit': limit.toString(),
          'filter': filter,
          if (cursor != null) 'cursor': cursor,
        },
      );
      // validateStatus в ApiClient пропускает 4xx без исключения →
      // 401/429/404 вернутся обычным Response. Проверяем statusCode
      // до парсинга, иначе `data['data'] as List` упадёт на null.
      if (res.statusCode != 200) {
        throw Exception('Не удалось загрузить ленту (HTTP ${res.statusCode})');
      }
      final data = (res.data as Map).cast<String, dynamic>();
      final rawData = data['data'];
      if (rawData is! List) {
        // Не-список вместо массива постов — отдаём пустую страницу.
        return FeedPage(items: const [], nextCursor: null, hasMore: false);
      }
      final items = rawData
          .map((e) => FeedPost.fromJson((e as Map).cast<String, dynamic>()))
          .toList();
      final meta = (data['meta'] as Map?)?.cast<String, dynamic>() ?? const {};
      final page = FeedPage(
        items: items,
        nextCursor: meta['nextCursor'] as String?,
        hasMore: meta['hasMore'] as bool? ?? false,
      );
      // Кэшируем только первую страницу, чтобы pagination не накопилась.
      if (cursor == null) {
        _FeedCache.put(filter, limit, page);
      }
      return page;
    } on DioException catch (e) {
      throw Exception('Не удалось загрузить ленту: ${e.message}');
    }
  }

  /// Поставить лайк. Идемпотентно на бэке — повторный вызов не дублирует.
  Future<LikeResult> likePost(String postId) async {
    final res = await _api.dio.post('/posts/$postId/like');
    final data = res.data as Map<String, dynamic>;
    return LikeResult(
      liked: data['liked'] as bool,
      likesCount: data['likesCount'] as int,
    );
  }

  /// Снять лайк. Идемпотентно.
  Future<LikeResult> unlikePost(String postId) async {
    final res = await _api.dio.delete('/posts/$postId/like');
    final data = res.data as Map<String, dynamic>;
    return LikeResult(
      liked: data['liked'] as bool,
      likesCount: data['likesCount'] as int,
    );
  }

  /// Сохранить пост в закладки. Идемпотентно на бэке.
  Future<SaveResult> savePost(String postId) async {
    final res = await _api.dio.post('/posts/$postId/save');
    final data = res.data as Map<String, dynamic>;
    return SaveResult(saved: data['saved'] as bool);
  }

  /// Удалить из закладок. Идемпотентно.
  Future<SaveResult> unsavePost(String postId) async {
    final res = await _api.dio.delete('/posts/$postId/save');
    final data = res.data as Map<String, dynamic>;
    return SaveResult(saved: data['saved'] as bool);
  }

  /// Присоединиться к group buy или изменить своё количество (UPSERT).
  /// Валидация количества на бэке (≥1, ≤1M).
  Future<GroupBuyResult> joinGroupBuy(String postId, int quantity) async {
    try {
      final res = await _api.dio.post(
        '/posts/$postId/group-buy/join',
        data: {'quantity': quantity},
      );
      return GroupBuyResult.fromJson(
          (res.data as Map).cast<String, dynamic>());
    } on DioException catch (e) {
      final data = e.response?.data;
      if (data is Map && data['message'] != null) {
        throw Exception(data['message'].toString());
      }
      throw Exception('Не удалось присоединиться: ${e.message}');
    }
  }

  /// Отменить своё участие в group buy. Идемпотентно.
  Future<GroupBuyResult> leaveGroupBuy(String postId) async {
    try {
      final res = await _api.dio.delete('/posts/$postId/group-buy/join');
      return GroupBuyResult.fromJson(
          (res.data as Map).cast<String, dynamic>());
    } on DioException catch (e) {
      final data = e.response?.data;
      if (data is Map && data['message'] != null) {
        throw Exception(data['message'].toString());
      }
      throw Exception('Не удалось отменить участие: ${e.message}');
    }
  }

  /// Инкремент счётчика поделившихся. НЕ идемпотентно — каждый вызов +1.
  /// Бэк разрешает даже гостевые вызовы.
  Future<ShareResult> sharePost(String postId) async {
    final res = await _api.dio.post('/posts/$postId/share');
    final data = res.data as Map<String, dynamic>;
    return ShareResult(sharesCount: data['sharesCount'] as int);
  }

  /// Удалить свой пост (только владелец-завод). 204 No Content на успехе,
  /// 403 если пытаешься удалить чужой, 404 если поста уже нет.
  Future<void> deletePost(String postId) async {
    try {
      await _api.dio.delete('/posts/$postId');
    } on DioException catch (e) {
      final data = e.response?.data;
      if (data is Map && data['message'] != null) {
        throw Exception(data['message'].toString());
      }
      throw Exception('Не удалось удалить пост: ${e.message}');
    }
  }
}
