import 'package:dio/dio.dart';
import '../../../core/api/api_client.dart';

/// Краткая инфо о собеседнике в списке бесед.
class ChatPartner {
  ChatPartner({
    required this.id,
    required this.name,
    required this.avatarUrl,
    required this.type,
  });

  final String id;
  final String name; // 'Без имени' если null
  final String? avatarUrl;
  final String type; // 'buyer' | 'factory'

  factory ChatPartner.fromJson(Map<String, dynamic> json) {
    return ChatPartner(
      id: json['id'] as String,
      name: json['name'] as String? ?? 'Без имени',
      avatarUrl: json['avatarUrl'] as String?,
      type: json['type'] as String? ?? 'buyer',
    );
  }
}

/// Беседа в списке.
class ConversationItem {
  ConversationItem({
    required this.id,
    required this.other,
    required this.lastMessageText,
    required this.lastMessageAt,
    required this.lastMessageIsMine,
    required this.unreadCount,
    required this.createdAt,
  });

  final String id;
  final ChatPartner other;
  final String? lastMessageText;
  final DateTime? lastMessageAt;
  final bool lastMessageIsMine;
  final int unreadCount;
  final DateTime createdAt;

  factory ConversationItem.fromJson(Map<String, dynamic> json) {
    final last = json['lastMessage'] as Map?;
    return ConversationItem(
      id: json['id'] as String,
      other: ChatPartner.fromJson((json['other'] as Map).cast<String, dynamic>()),
      lastMessageText: last?['text'] as String?,
      lastMessageAt: last?['createdAt'] != null
          ? DateTime.tryParse(last!['createdAt'] as String)
          : null,
      lastMessageIsMine: (last?['isMine'] as bool?) ?? false,
      unreadCount: json['unreadCount'] as int? ?? 0,
      createdAt: DateTime.parse(json['createdAt'] as String),
    );
  }
}

/// Одно сообщение в беседе.
class ChatMessage {
  ChatMessage({
    required this.id,
    required this.text,
    required this.createdAt,
    required this.isMine,
    required this.readAt,
  });

  final String id;
  final String text;
  final DateTime createdAt;
  final bool isMine;
  final DateTime? readAt;

  factory ChatMessage.fromJson(Map<String, dynamic> json) {
    return ChatMessage(
      id: json['id'] as String,
      text: json['text'] as String,
      createdAt: DateTime.parse(json['createdAt'] as String),
      isMine: json['isMine'] as bool? ?? false,
      readAt: json['readAt'] != null
          ? DateTime.tryParse(json['readAt'] as String)
          : null,
    );
  }
}

class MessagesPage {
  MessagesPage({
    required this.items,
    required this.nextCursor,
    required this.hasMore,
  });

  final List<ChatMessage> items;
  final String? nextCursor;
  final bool hasMore;
}

class ChatRepository {
  ChatRepository({ApiClient? api}) : _api = api ?? ApiClient.instance;
  final ApiClient _api;

  /// GET /conversations — список бесед текущего юзера.
  Future<List<ConversationItem>> listConversations() async {
    try {
      final res = await _api.dio.get('/conversations');
      if (res.statusCode != 200) {
        throw Exception('Не удалось загрузить чаты (HTTP ${res.statusCode})');
      }
      final data = (res.data as Map).cast<String, dynamic>();
      final rawData = data['data'];
      if (rawData is! List) return const [];
      return rawData
          .map((e) =>
              ConversationItem.fromJson((e as Map).cast<String, dynamic>()))
          .toList();
    } on DioException catch (e) {
      throw Exception('Не удалось загрузить чаты: ${e.message}');
    }
  }

  /// POST /conversations — найти существующую беседу с юзером или создать новую.
  Future<ConversationItem> findOrCreate(String partnerUserId) async {
    try {
      final res = await _api.dio.post(
        '/conversations',
        data: {'participantUserId': partnerUserId},
      );
      return ConversationItem.fromJson(
          (res.data as Map).cast<String, dynamic>());
    } on DioException catch (e) {
      final data = e.response?.data;
      if (data is Map && data['message'] != null) {
        throw Exception(data['message'].toString());
      }
      throw Exception('Не удалось открыть чат: ${e.message}');
    }
  }

  /// GET /conversations/:id/messages — страница сообщений (DESC по дате).
  Future<MessagesPage> loadMessages(
    String conversationId, {
    String? cursor,
    int limit = 50,
  }) async {
    try {
      final res = await _api.dio.get(
        '/conversations/$conversationId/messages',
        queryParameters: {
          'limit': limit.toString(),
          if (cursor != null) 'cursor': cursor,
        },
      );
      if (res.statusCode != 200) {
        throw Exception(
            'Не удалось загрузить сообщения (HTTP ${res.statusCode})');
      }
      final data = (res.data as Map).cast<String, dynamic>();
      final rawData = data['data'];
      if (rawData is! List) {
        return MessagesPage(items: const [], nextCursor: null, hasMore: false);
      }
      final items = rawData
          .map((e) => ChatMessage.fromJson((e as Map).cast<String, dynamic>()))
          .toList();
      final meta = (data['meta'] as Map?)?.cast<String, dynamic>() ?? const {};
      return MessagesPage(
        items: items,
        nextCursor: meta['nextCursor'] as String?,
        hasMore: meta['hasMore'] as bool? ?? false,
      );
    } on DioException catch (e) {
      throw Exception('Не удалось загрузить сообщения: ${e.message}');
    }
  }

  /// POST /conversations/:id/messages — отправить сообщение.
  Future<ChatMessage> sendMessage(
    String conversationId,
    String text,
  ) async {
    try {
      final res = await _api.dio.post(
        '/conversations/$conversationId/messages',
        data: {'text': text},
      );
      return ChatMessage.fromJson((res.data as Map).cast<String, dynamic>());
    } on DioException catch (e) {
      final data = e.response?.data;
      if (data is Map && data['message'] != null) {
        throw Exception(data['message'].toString());
      }
      throw Exception('Не удалось отправить: ${e.message}');
    }
  }

  /// PATCH /conversations/:id/read — пометить непрочитанные как прочитанные.
  Future<void> markAsRead(String conversationId) async {
    try {
      await _api.dio.patch('/conversations/$conversationId/read');
    } on DioException catch (_) {/* read marker некритичен */}
  }

  /// Суммарное число непрочитанных сообщений для badge на вкладке Чаты.
  /// Не отдельный endpoint — просто суммируем unread из conversations list.
  Future<int> getTotalUnreadCount() async {
    try {
      final list = await listConversations();
      return list.fold<int>(0, (sum, c) => sum + c.unreadCount);
    } catch (_) {
      return 0;
    }
  }
}
