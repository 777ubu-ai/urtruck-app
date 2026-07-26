import '../../../core/api/api_client.dart';

/// Карточка завода из каталога `/factories`.
class FactoryCard {
  FactoryCard({
    required this.userId,
    required this.companyName,
    this.description,
    this.avatarUrl,
    this.countryCode,
    this.city,
    required this.trustScore,
    required this.verified,
    required this.totalProducts,
    required this.totalDeals,
    required this.avgRating,
    required this.reviewsCount,
  });

  final String userId;
  final String companyName;
  final String? description;
  final String? avatarUrl;
  final String? countryCode;
  final String? city;
  final int trustScore;
  final bool verified;
  final int totalProducts;
  final int totalDeals;
  final double avgRating;
  final int reviewsCount;

  factory FactoryCard.fromJson(Map<String, dynamic> j) => FactoryCard(
        userId: j['userId'] as String,
        companyName: j['companyName'] as String? ?? 'Завод',
        description: j['description'] as String?,
        avatarUrl: j['avatarUrl'] as String?,
        countryCode: j['countryCode'] as String?,
        city: j['city'] as String?,
        trustScore: j['trustScore'] as int? ?? 0,
        verified: j['verified'] as bool? ?? false,
        totalProducts: j['totalProducts'] as int? ?? 0,
        totalDeals: j['totalDeals'] as int? ?? 0,
        avgRating: (j['avgRating'] as num?)?.toDouble() ?? 0,
        reviewsCount: j['reviewsCount'] as int? ?? 0,
      );
}

class FactoriesPage {
  FactoriesPage({required this.items, required this.total, required this.hasMore});
  final List<FactoryCard> items;
  final int total;
  final bool hasMore;
}

/// Каталог заводов — витрина поставщиков.
class FactoriesRepository {
  Future<FactoriesPage> list({
    String? query,
    bool verifiedOnly = false,
    String sort = 'trust',
    int limit = 20,
    int offset = 0,
  }) async {
    final res = await ApiClient.instance.dio.get<Map<String, dynamic>>(
      '/factories',
      queryParameters: {
        if (query != null && query.trim().isNotEmpty) 'q': query.trim(),
        if (verifiedOnly) 'verified': 'true',
        'sort': sort,
        'limit': limit,
        'offset': offset,
      },
    );
    final data = res.data;
    if (data == null || data['items'] is! List) {
      return FactoriesPage(items: const [], total: 0, hasMore: false);
    }
    final items = (data['items'] as List)
        .whereType<Map>()
        .map((e) => FactoryCard.fromJson(e.cast<String, dynamic>()))
        .toList();
    return FactoriesPage(
      items: items,
      total: data['total'] as int? ?? items.length,
      hasMore: data['hasMore'] as bool? ?? false,
    );
  }
}
