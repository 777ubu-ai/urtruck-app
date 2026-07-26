import 'package:flutter/material.dart';
import '../../../core/api/api_client.dart';
import '../../../core/widgets/trust_badge.dart';
import '../../profile/presentation/public_profile_screen.dart';
import '../data/factories_repository.dart';

/// Карусель «Интересные заводы» — витрина поставщиков в профиле.
///
/// Аналог блока рекомендаций в соцсетях, но вместо людей — фабрики:
/// логотип, название, город и рейтинг, тап открывает публичный профиль.
/// Это главный способ познакомить покупателя с каталогом: до этого заводы
/// можно было найти только случайно, наткнувшись на их товар в ленте.
///
/// Если каталог пуст или недоступен — виджет молча исчезает, не оставляя
/// пустой заголовок на экране.
class InterestingFactories extends StatefulWidget {
  const InterestingFactories({super.key, this.excludeUserId});

  /// Свой профиль в рекомендациях не показываем.
  final String? excludeUserId;

  @override
  State<InterestingFactories> createState() => _InterestingFactoriesState();
}

class _InterestingFactoriesState extends State<InterestingFactories> {
  final _repo = FactoriesRepository();
  List<FactoryCard> _items = const [];
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final page = await _repo.list(limit: 10);
      if (!mounted) return;
      setState(() {
        _items = page.items
            .where((f) => f.userId != widget.excludeUserId)
            .toList();
        _loading = false;
      });
    } catch (_) {
      // Рекомендации — необязательный блок: при ошибке просто не показываем.
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading || _items.isEmpty) return const SizedBox.shrink();
    final scheme = Theme.of(context).colorScheme;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(2, 4, 2, 10),
          child: Text(
            'Интересные заводы',
            style: TextStyle(
              fontSize: 15,
              fontWeight: FontWeight.w700,
              letterSpacing: -0.2,
              color: scheme.onSurface,
            ),
          ),
        ),
        SizedBox(
          height: 196,
          child: ListView.separated(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: 2),
            itemCount: _items.length,
            separatorBuilder: (_, __) => const SizedBox(width: 10),
            itemBuilder: (_, i) => _FactoryMiniCard(factory: _items[i]),
          ),
        ),
      ],
    );
  }
}

class _FactoryMiniCard extends StatelessWidget {
  const _FactoryMiniCard({required this.factory});
  final FactoryCard factory;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final place = [factory.city, factory.countryCode]
        .where((e) => e != null && e.isNotEmpty)
        .join(', ');

    return InkWell(
      borderRadius: BorderRadius.circular(16),
      onTap: () => Navigator.of(context).push(
        MaterialPageRoute(
          builder: (_) => PublicProfileScreen(userId: factory.userId),
        ),
      ),
      child: Container(
        width: 150,
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 14),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: scheme.outlineVariant),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            FactoryAvatar(
              name: factory.companyName,
              imageUrl: factory.avatarUrl != null
                  ? ApiClient.resolveMediaUrl(factory.avatarUrl!)
                  : null,
              size: 66,
            ),
            const SizedBox(height: 9),
            Text(
              factory.companyName,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              textAlign: TextAlign.center,
              style: const TextStyle(
                fontSize: 13.5,
                fontWeight: FontWeight.w700,
                letterSpacing: -0.1,
              ),
            ),
            const SizedBox(height: 2),
            Text(
              place.isNotEmpty
                  ? place
                  : '${factory.totalProducts} товаров',
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(
                fontSize: 12,
                color: scheme.onSurfaceVariant,
              ),
            ),
            const SizedBox(height: 9),
            TrustBadge(score: factory.trustScore, verified: factory.verified),
          ],
        ),
      ),
    );
  }
}
