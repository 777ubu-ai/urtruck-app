import 'package:dio/dio.dart';
import '../../../core/api/api_client.dart';

/// Автор group of stories — обычно завод.
class StoryAuthor {
  StoryAuthor({
    required this.id,
    required this.name,
    required this.avatarUrl,
    required this.companyName,
    required this.type,
  });

  final String id;
  final String? name;
  final String? avatarUrl;
  final String? companyName;
  final String type;

  String get displayName {
    if (companyName != null && companyName!.isNotEmpty) return companyName!;
    if (name != null && name!.isNotEmpty) return name!;
    return type == 'factory' ? 'Завод' : 'Байер';
  }

  factory StoryAuthor.fromJson(Map<String, dynamic> json) {
    return StoryAuthor(
      id: json['id'] as String,
      name: json['name'] as String?,
      avatarUrl: json['avatarUrl'] as String?,
      companyName: json['companyName'] as String?,
      type: json['type'] as String? ?? 'factory',
    );
  }
}

/// Одна story.
class StoryItem {
  StoryItem({
    required this.id,
    required this.mediaUrl,
    required this.mediaType,
    required this.thumbnailUrl,
    required this.caption,
    required this.viewCount,
    required this.createdAt,
    required this.expiresAt,
  });

  final String id;
  final String mediaUrl;
  final String mediaType; // 'image' | 'video'
  final String? thumbnailUrl;
  final String? caption;
  final int viewCount;
  final DateTime createdAt;
  final DateTime expiresAt;

  factory StoryItem.fromJson(Map<String, dynamic> json) {
    return StoryItem(
      id: json['id'] as String,
      mediaUrl: json['mediaUrl'] as String,
      mediaType: json['mediaType'] as String? ?? 'image',
      thumbnailUrl: json['thumbnailUrl'] as String?,
      caption: json['caption'] as String?,
      viewCount: (json['viewCount'] as num?)?.toInt() ?? 0,
      createdAt: DateTime.parse(json['createdAt'] as String),
      expiresAt: DateTime.parse(json['expiresAt'] as String),
    );
  }
}

/// Группа stories одного автора — отображается одним кругом в ring-виджете.
class StoryGroup {
  StoryGroup({required this.author, required this.stories});
  final StoryAuthor author;
  final List<StoryItem> stories;

  factory StoryGroup.fromJson(Map<String, dynamic> json) {
    final rawStories = json['stories'];
    return StoryGroup(
      author: StoryAuthor.fromJson(
          (json['user'] as Map).cast<String, dynamic>()),
      stories: rawStories is List
          ? rawStories
              .map((e) => StoryItem.fromJson((e as Map).cast<String, dynamic>()))
              .toList()
          : const [],
    );
  }
}

class StoriesRepository {
  StoriesRepository({ApiClient? api}) : _api = api ?? ApiClient.instance;
  final ApiClient _api;

  /// GET /stories — список активных, сгруппированных по автору.
  Future<List<StoryGroup>> loadGroups() async {
    try {
      final res = await _api.dio.get('/stories');
      if (res.statusCode != 200) {
        // 4xx (например 401 на истёкшем токене) не кидают DioException из-за
        // validateStatus, поэтому ловим вручную и не ломаем UI.
        return const [];
      }
      final data = (res.data as Map).cast<String, dynamic>();
      final rawData = data['data'];
      if (rawData is! List) return const [];
      return rawData
          .map((e) => StoryGroup.fromJson((e as Map).cast<String, dynamic>()))
          .toList();
    } on DioException catch (e) {
      throw Exception('Не удалось загрузить stories: ${e.message}');
    }
  }

  /// POST /stories/:id/view — fire-and-forget счётчик просмотров.
  Future<void> markViewed(String storyId) async {
    try {
      await _api.dio.post('/stories/$storyId/view');
    } on DioException catch (_) {/* не критично */}
  }

  /// POST /stories — создать story (factory only).
  Future<StoryItem> createStory({
    required String mediaUrl,
    String? caption,
  }) async {
    try {
      final res = await _api.dio.post(
        '/stories',
        data: {
          'mediaUrl': mediaUrl,
          if (caption != null && caption.isNotEmpty) 'caption': caption,
        },
      );
      return StoryItem.fromJson((res.data as Map).cast<String, dynamic>());
    } on DioException catch (e) {
      final data = e.response?.data;
      if (data is Map && data['message'] != null) {
        throw Exception(data['message'].toString());
      }
      throw Exception('Не удалось создать story: ${e.message}');
    }
  }
}
