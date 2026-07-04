import 'package:dio/dio.dart';
import '../../../core/api/api_client.dart';

/// Клиент для эндпоинтов модерации (блокировка + жалобы).
class ModerationRepository {
  ModerationRepository({ApiClient? api}) : _api = api ?? ApiClient.instance;
  final ApiClient _api;

  /// Заблокировать юзера. Идемпотентно.
  Future<void> blockUser(String userId) async {
    try {
      await _api.dio.post('/users/$userId/block');
    } on DioException catch (e) {
      throw Exception(_msg(e, 'Не удалось заблокировать'));
    }
  }

  Future<void> unblockUser(String userId) async {
    try {
      await _api.dio.delete('/users/$userId/block');
    } on DioException catch (e) {
      throw Exception(_msg(e, 'Не удалось разблокировать'));
    }
  }

  /// Подать жалобу. targetType: 'post' | 'user' | 'message' | 'comment'.
  /// reason: 'spam' | 'inappropriate' | 'fraud' | 'fake' | 'offensive' | 'other'.
  Future<void> report({
    required String targetType,
    required String targetId,
    required String reason,
    String? description,
  }) async {
    try {
      await _api.dio.post('/reports', data: {
        'targetType': targetType,
        'targetId': targetId,
        'reason': reason,
        if (description != null && description.isNotEmpty)
          'description': description,
      });
    } on DioException catch (e) {
      throw Exception(_msg(e, 'Не удалось отправить жалобу'));
    }
  }

  String _msg(DioException e, String fallback) {
    final data = e.response?.data;
    if (data is Map && data['message'] != null) {
      final m = data['message'];
      if (m is String) return m;
      if (m is List && m.isNotEmpty) return m.first.toString();
    }
    return '$fallback: ${e.message}';
  }
}
