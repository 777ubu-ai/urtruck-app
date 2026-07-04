import 'dart:typed_data';
import 'package:dio/dio.dart';
import '../../../core/api/api_client.dart';
import '../../feed/data/feed_repository.dart';

/// Один медиа-элемент готовый к отправке на бэк. На клиенте у нас есть только
/// локальный путь к файлу и байты, после `uploadImages` получаем URL от бэка.
class UploadedImage {
  UploadedImage({
    required this.url,
    required this.type,
    required this.size,
    this.originalName,
  });
  final String url; // относительный, например `/uploads/uuid.jpg`
  final String type; // 'image' | 'video' — определяется backend'ом по mime
  final int size;
  final String? originalName;

  bool get isVideo => type == 'video';

  factory UploadedImage.fromJson(Map<String, dynamic> json) {
    return UploadedImage(
      url: json['url'] as String,
      type: json['type'] as String? ?? 'image',
      size: (json['size'] as num).toInt(),
      originalName: json['originalName'] as String?,
    );
  }

  /// Абсолютный URL для отображения — prepend'им baseUrl из ApiClient
  /// (без `/api/v1`, т.к. статика под `/uploads/`).
  String absoluteUrl(String baseUrlWithoutPrefix) =>
      '$baseUrlWithoutPrefix$url';
}

/// Один ценовой тир для формы создания.
class NewPriceTier {
  NewPriceTier({required this.quantity, required this.price});
  final int quantity;
  final double price;

  Map<String, dynamic> toJson() => {
        'quantity': quantity,
        'price': price,
      };
}

/// DTO формы создания поста.
class NewPostDraft {
  NewPostDraft({
    required this.title,
    this.description,
    required this.priceAmount,
    required this.priceCurrency,
    this.hashtags = const [],
    this.priceTiers = const [],
    this.moq = 1,
    this.shippingDays = 7,
    this.stockStatus = 'in_stock',
    required this.media,
  });

  final String title;
  final String? description;
  final double priceAmount;
  final String priceCurrency;
  final List<String> hashtags;
  final List<NewPriceTier> priceTiers;
  final int moq;
  final int shippingDays;
  final String stockStatus;
  final List<UploadedImage> media;

  Map<String, dynamic> toJson() => {
        'title': title,
        if (description != null && description!.isNotEmpty)
          'description': description,
        'priceAmount': priceAmount,
        'priceCurrency': priceCurrency,
        if (hashtags.isNotEmpty) 'hashtags': hashtags,
        if (priceTiers.isNotEmpty)
          'priceTiers': priceTiers.map((t) => t.toJson()).toList(),
        'moq': moq,
        'shippingDays': shippingDays,
        'stockStatus': stockStatus,
        'media': media
            .map((m) => {
                  'url': m.url,
                  'type': m.type,
                })
            .toList(),
      };
}

/// Репозиторий для экрана создания поста. Отдельный от feed_repository,
/// т.к. публикация поста — это своя фича с собственной логикой (upload + create).
class CreatePostRepository {
  CreatePostRepository({ApiClient? api}) : _api = api ?? ApiClient.instance;
  final ApiClient _api;

  /// Загружает один или несколько файлов на бэк. Принимает уже прочитанные
  /// байты (из `image_picker` возвращаются через `readAsBytes()`) + имя файла.
  /// Возвращает массив `UploadedImage` — url'ы, по которым затем можно
  /// создать пост.
  Future<List<UploadedImage>> uploadImages(
    List<({String filename, Uint8List bytes})> files,
  ) async {
    if (files.isEmpty) return [];
    final formData = FormData();
    for (final f in files) {
      formData.files.add(MapEntry(
        'files',
        MultipartFile.fromBytes(f.bytes, filename: f.filename),
      ));
    }
    try {
      final res = await _api.dio.post(
        '/uploads/images',
        data: formData,
        options: Options(
          headers: {'Content-Type': 'multipart/form-data'},
          // upload может быть долгим — увеличиваем таймаут
          sendTimeout: const Duration(seconds: 60),
          receiveTimeout: const Duration(seconds: 60),
        ),
      );
      if (res.statusCode != 201 && res.statusCode != 200) {
        final msg = res.data is Map && (res.data as Map)['message'] != null
            ? (res.data as Map)['message'].toString()
            : 'HTTP ${res.statusCode}';
        throw Exception(msg);
      }
      final data = (res.data as Map).cast<String, dynamic>();
      final rawFiles = data['files'];
      if (rawFiles is! List) {
        // Неожиданный ответ — защита от null/error-объекта.
        throw Exception('Сервер вернул неожиданный ответ при загрузке файлов');
      }
      return rawFiles
          .map((e) =>
              UploadedImage.fromJson((e as Map).cast<String, dynamic>()))
          .toList();
    } on DioException catch (e) {
      final data = e.response?.data;
      if (data is Map && data['message'] != null) {
        throw Exception(data['message'].toString());
      }
      throw Exception('Не удалось загрузить файлы: ${e.message}');
    }
  }

  /// Создаёт пост на бэке. Должен вызываться ПОСЛЕ `uploadImages` — draft'у
  /// нужны уже полученные `UploadedImage` в `media`.
  Future<FeedPost> createPost(NewPostDraft draft) async {
    try {
      final res = await _api.dio.post('/posts', data: draft.toJson());
      if (res.statusCode != 201 && res.statusCode != 200) {
        final msg = res.data is Map && (res.data as Map)['message'] != null
            ? (res.data as Map)['message'].toString()
            : 'HTTP ${res.statusCode}';
        throw Exception(msg);
      }
      return FeedPost.fromJson((res.data as Map).cast<String, dynamic>());
    } on DioException catch (e) {
      final data = e.response?.data;
      if (data is Map && data['message'] != null) {
        throw Exception(data['message'].toString());
      }
      throw Exception('Не удалось создать пост: ${e.message}');
    }
  }

  /// Префикс для абсолютных URL статики (без `/api/v1`).
  String get baseStaticUrl {
    // ApiClient.dio.options.baseUrl хранит `...:3000/api/v1`. Убираем суффикс.
    final base = _api.dio.options.baseUrl;
    return base.replaceAll('/api/v1', '');
  }
}
