import 'package:dio/dio.dart';
import '../../../core/api/api_client.dart';

/// Один комментарий. Зеркалит DTO с бэка `GET /posts/:id/comments`.
class PostCommentItem {
  PostCommentItem({
    required this.id,
    required this.text,
    required this.createdAt,
    required this.userName,
    required this.userType,
    required this.userAvatarUrl,
  });

  final String id;
  final String text;
  final DateTime createdAt;
  final String userName; // 'Без имени' если name=null
  final String userType; // 'buyer' | 'factory'
  final String? userAvatarUrl;

  factory PostCommentItem.fromJson(Map<String, dynamic> json) {
    final user = (json['user'] as Map).cast<String, dynamic>();
    return PostCommentItem(
      id: json['id'] as String,
      text: json['text'] as String,
      createdAt: DateTime.parse(json['createdAt'] as String),
      userName: user['name'] as String? ?? 'Без имени',
      userType: user['type'] as String? ?? 'buyer',
      userAvatarUrl: user['avatarUrl'] as String?,
    );
  }
}

class CommentsPage {
  CommentsPage({
    required this.items,
    required this.nextCursor,
    required this.hasMore,
  });

  final List<PostCommentItem> items;
  final String? nextCursor;
  final bool hasMore;
}

class CommentsRepository {
  CommentsRepository({ApiClient? api}) : _api = api ?? ApiClient.instance;
  final ApiClient _api;

  /// Загрузить страницу комментариев. Сначала новые.
  Future<CommentsPage> loadComments(
    String postId, {
    String? cursor,
    int limit = 20,
  }) async {
    try {
      final res = await _api.dio.get(
        '/posts/$postId/comments',
        queryParameters: {
          'limit': limit.toString(),
          if (cursor != null) 'cursor': cursor,
        },
      );
      if (res.statusCode != 200) {
        throw Exception('Ошибка загрузки комментариев (HTTP ${res.statusCode})');
      }
      final data = (res.data as Map).cast<String, dynamic>();
      final rawData = data['data'];
      if (rawData is! List) {
        return CommentsPage(items: const [], nextCursor: null, hasMore: false);
      }
      final items = rawData
          .map((e) =>
              PostCommentItem.fromJson((e as Map).cast<String, dynamic>()))
          .toList();
      final meta = (data['meta'] as Map?)?.cast<String, dynamic>() ?? const {};
      return CommentsPage(
        items: items,
        nextCursor: meta['nextCursor'] as String?,
        hasMore: meta['hasMore'] as bool? ?? false,
      );
    } on DioException catch (e) {
      throw Exception('Не удалось загрузить комментарии: ${e.message}');
    }
  }

  /// Создать новый коммент. Возвращает уже сохранённый объект с реальным id и
  /// createdAt с сервера — фронт использует их вместо оптимистичных заглушек.
  Future<PostCommentItem> createComment(String postId, String text) async {
    try {
      final res = await _api.dio.post(
        '/posts/$postId/comments',
        data: {'text': text},
      );
      if (res.statusCode != 201 && res.statusCode != 200) {
        // ValidationPipe возвращает 400 с {message: [...]}
        final msg = res.data is Map && (res.data as Map)['message'] != null
            ? (res.data as Map)['message'].toString()
            : 'HTTP ${res.statusCode}';
        throw Exception(msg);
      }
      return PostCommentItem.fromJson(
          (res.data as Map).cast<String, dynamic>());
    } on DioException catch (e) {
      final data = e.response?.data;
      if (data is Map && data['message'] != null) {
        throw Exception(data['message'].toString());
      }
      throw Exception('Не удалось отправить комментарий: ${e.message}');
    }
  }
}
