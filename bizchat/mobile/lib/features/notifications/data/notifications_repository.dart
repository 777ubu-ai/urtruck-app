import 'package:dio/dio.dart';
import '../../../core/api/api_client.dart';

/// Тип уведомления — должен совпадать с enum на бэке.
enum NotifType { like, comment, message, review, groupBuyCompleted, unknown }

NotifType _parseType(String? raw) {
  switch (raw) {
    case 'like':
      return NotifType.like;
    case 'comment':
      return NotifType.comment;
    case 'message':
      return NotifType.message;
    case 'review':
      return NotifType.review;
    case 'group_buy_completed':
      return NotifType.groupBuyCompleted;
    default:
      return NotifType.unknown;
  }
}

class NotifPostInfo {
  NotifPostInfo({required this.id, this.title, this.thumbnailUrl});
  final String id;
  final String? title;
  final String? thumbnailUrl;
}

/// Одно уведомление с денормализованными данными для отображения.
class AppNotification {
  AppNotification({
    required this.id,
    required this.type,
    required this.actorId,
    required this.actorName,
    required this.post,
    required this.conversationId,
    required this.preview,
    required this.readAt,
    required this.createdAt,
  });

  final String id;
  final NotifType type;
  final String actorId;
  final String actorName;
  final NotifPostInfo? post;
  final String? conversationId;
  final String? preview;
  final DateTime? readAt;
  final DateTime createdAt;

  bool get isRead => readAt != null;

  factory AppNotification.fromJson(Map<String, dynamic> json) {
    final actor = (json['actor'] as Map).cast<String, dynamic>();
    final postRaw = json['post'] as Map?;
    return AppNotification(
      id: json['id'] as String,
      type: _parseType(json['type'] as String?),
      actorId: actor['id'] as String,
      actorName: actor['name'] as String? ?? 'Кто-то',
      post: postRaw != null
          ? NotifPostInfo(
              id: postRaw['id'] as String,
              title: postRaw['title'] as String?,
              thumbnailUrl: postRaw['thumbnailUrl'] as String?,
            )
          : null,
      conversationId: json['conversationId'] as String?,
      preview: json['preview'] as String?,
      readAt: json['readAt'] != null
          ? DateTime.tryParse(json['readAt'] as String)
          : null,
      createdAt: DateTime.parse(json['createdAt'] as String),
    );
  }
}

class NotificationsPage {
  NotificationsPage({
    required this.items,
    required this.nextCursor,
    required this.hasMore,
  });

  final List<AppNotification> items;
  final String? nextCursor;
  final bool hasMore;
}

class NotificationsRepository {
  NotificationsRepository({ApiClient? api}) : _api = api ?? ApiClient.instance;
  final ApiClient _api;

  Future<NotificationsPage> loadPage({
    String? cursor,
    int limit = 20,
  }) async {
    try {
      final res = await _api.dio.get(
        '/notifications',
        queryParameters: {
          'limit': limit.toString(),
          if (cursor != null) 'cursor': cursor,
        },
      );
      if (res.statusCode != 200) {
        throw Exception(
            'Не удалось загрузить уведомления (HTTP ${res.statusCode})');
      }
      final data = (res.data as Map).cast<String, dynamic>();
      final rawData = data['data'];
      if (rawData is! List) {
        return NotificationsPage(
            items: const [], nextCursor: null, hasMore: false);
      }
      final items = rawData
          .map((e) =>
              AppNotification.fromJson((e as Map).cast<String, dynamic>()))
          .toList();
      final meta = (data['meta'] as Map?)?.cast<String, dynamic>() ?? const {};
      return NotificationsPage(
        items: items,
        nextCursor: meta['nextCursor'] as String?,
        hasMore: meta['hasMore'] as bool? ?? false,
      );
    } on DioException catch (e) {
      throw Exception('Не удалось загрузить уведомления: ${e.message}');
    }
  }

  /// Лёгкий запрос для бейджа на колокольчике.
  Future<int> getUnreadCount() async {
    try {
      final res = await _api.dio.get('/notifications/unread-count');
      // 4xx (401 при истёкшем токене, 429 от throttler) не кидают exception
      // из-за validateStatus — проверяем вручную.
      if (res.statusCode != 200) return 0;
      final raw = res.data;
      if (raw is! Map) return 0;
      return (raw['count'] as num?)?.toInt() ?? 0;
    } on DioException catch (_) {
      return 0; // лёгкая фоновая операция — не падаем
    } catch (_) {
      return 0;
    }
  }

  Future<void> markAsRead(String notificationId) async {
    try {
      await _api.dio.patch('/notifications/$notificationId/read');
    } on DioException catch (_) {/* read marker некритичен */}
  }

  Future<void> markAllAsRead() async {
    try {
      await _api.dio.patch('/notifications/read-all');
    } on DioException catch (_) {/* read marker некритичен */}
  }
}
