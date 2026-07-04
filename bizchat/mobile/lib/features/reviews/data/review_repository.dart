import 'package:dio/dio.dart';
import '../../../core/api/api_client.dart';

/// Отзыв байера о заводе.
class Review {
  Review({
    required this.id,
    required this.rating,
    required this.text,
    required this.photos,
    required this.isVerified,
    required this.createdAt,
    required this.author,
  });

  final String id;
  final int rating;
  final String? text;
  final List<Map<String, dynamic>> photos;
  final bool isVerified;
  final DateTime createdAt;
  final ReviewAuthor author;

  factory Review.fromJson(Map<String, dynamic> json) {
    final rawPhotos = (json['photos'] as List?) ?? const [];
    return Review(
      id: json['id'] as String,
      rating: (json['rating'] as num).toInt(),
      text: json['text'] as String?,
      photos: rawPhotos
          .map((e) => (e as Map).cast<String, dynamic>())
          .toList(growable: false),
      isVerified: json['isVerified'] as bool? ?? false,
      createdAt: DateTime.parse(json['createdAt'] as String),
      author: ReviewAuthor.fromJson(
          (json['author'] as Map).cast<String, dynamic>()),
    );
  }
}

class ReviewAuthor {
  ReviewAuthor({
    required this.id,
    required this.name,
    required this.avatarUrl,
    required this.type,
  });

  final String id;
  final String name;
  final String? avatarUrl;
  final String type;

  factory ReviewAuthor.fromJson(Map<String, dynamic> json) {
    return ReviewAuthor(
      id: json['id'] as String,
      name: json['name'] as String? ?? 'Аноним',
      avatarUrl: json['avatarUrl'] as String?,
      type: json['type'] as String? ?? 'buyer',
    );
  }
}

/// Страница списка с курсорной пагинацией.
class ReviewsPage {
  ReviewsPage({
    required this.items,
    required this.hasMore,
    required this.nextCursor,
  });
  final List<Review> items;
  final bool hasMore;
  final String? nextCursor;
}

class ReviewRepository {
  ReviewRepository({ApiClient? api}) : _api = api ?? ApiClient.instance;
  final ApiClient _api;

  /// GET /factories/:id/reviews — список отзывов с пагинацией.
  Future<ReviewsPage> loadList(
    String factoryId, {
    String? cursor,
    int limit = 20,
  }) async {
    try {
      final res = await _api.dio.get(
        '/factories/$factoryId/reviews',
        queryParameters: {
          'limit': limit.toString(),
          if (cursor != null) 'cursor': cursor,
        },
      );
      if (res.statusCode != 200) {
        throw Exception(
            'Не удалось загрузить отзывы (HTTP ${res.statusCode})');
      }
      final data = (res.data as Map).cast<String, dynamic>();
      final rawData = data['data'];
      if (rawData is! List) {
        return ReviewsPage(items: const [], hasMore: false, nextCursor: null);
      }
      final items = rawData
          .map((e) => Review.fromJson((e as Map).cast<String, dynamic>()))
          .toList();
      final meta = (data['meta'] as Map?)?.cast<String, dynamic>() ?? const {};
      return ReviewsPage(
        items: items,
        hasMore: meta['hasMore'] as bool? ?? false,
        nextCursor: meta['nextCursor'] as String?,
      );
    } on DioException catch (e) {
      throw Exception('Не удалось загрузить отзывы: ${e.message}');
    }
  }

  /// GET /factories/:id/reviews/me — отзыв текущего юзера на этот завод.
  /// Возвращает null если отзыва ещё нет.
  Future<Map<String, dynamic>?> loadMyReview(String factoryId) async {
    try {
      final res = await _api.dio.get('/factories/$factoryId/reviews/me');
      final data = (res.data as Map).cast<String, dynamic>();
      final review = data['review'];
      if (review == null) return null;
      return (review as Map).cast<String, dynamic>();
    } on DioException catch (_) {
      return null;
    }
  }

  /// POST /factories/:id/reviews — создать или обновить отзыв.
  Future<void> upsert({
    required String factoryId,
    required int rating,
    String? text,
    List<Map<String, String>> photos = const [],
  }) async {
    try {
      await _api.dio.post(
        '/factories/$factoryId/reviews',
        data: {
          'rating': rating,
          if (text != null && text.isNotEmpty) 'text': text,
          if (photos.isNotEmpty) 'photos': photos,
        },
      );
    } on DioException catch (e) {
      final data = e.response?.data;
      if (data is Map && data['message'] != null) {
        throw Exception(data['message'].toString());
      }
      throw Exception('Не удалось сохранить отзыв: ${e.message}');
    }
  }

  /// DELETE /factories/:factoryId/reviews/:reviewId — удалить свой отзыв.
  Future<void> delete({
    required String factoryId,
    required String reviewId,
  }) async {
    try {
      await _api.dio.delete('/factories/$factoryId/reviews/$reviewId');
    } on DioException catch (e) {
      throw Exception('Не удалось удалить отзыв: ${e.message}');
    }
  }
}
