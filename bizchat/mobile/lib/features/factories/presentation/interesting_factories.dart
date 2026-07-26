import 'package:flutter/material.dart';
import '../../../core/api/api_client.dart';
import '../../../core/widgets/trust_badge.dart';
import '../../../l10n/app_localizations.dart';
import '../../profile/presentation/public_profile_screen.dart';
import '../data/factories_repository.dart';
import 'factories_screen.dart';

/// Карусель «Интересные заводы» — витрина поставщиков в профиле.
///
/// Тот же блок, что «интересные аккаунты» в соцсетях, но вместо людей —
/// фабрики: логотип, название, город и статус доверия; тап открывает
/// публичный профиль, «Все» — полный каталог. Карточку можно скрыть
/// крестиком, как в референсе.
///
/// Это же место — будущий рекламный слот: сюда встанут заводы с платным
/// размещением. Порядок карточек сейчас задаётся сортировкой каталога
/// (`sort`), и когда появится оплата, приоритет будет проставляться здесь
/// же — блок для этого и держим отдельным виджетом.
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
    final l = AppLocalizations.of(context)!;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(2, 4, 2, 10),
          child: Row(
            children: [
              Text(
                l.factoriesInteresting,
                style: TextStyle(
                  fontSize: 15,
                  fontWeight: FontWeight.w700,
                  letterSpacing: -0.2,
                  color: scheme.onSurface,
                ),
              ),
              const Spacer(),
              InkWell(
                onTap: () => Navigator.of(context).push(
                  MaterialPageRoute(builder: (_) => const FactoriesScreen()),
                ),
                child: Padding(
                  padding: const EdgeInsets.symmetric(
                      horizontal: 4, vertical: 2),
                  child: Text(
                    l.factoriesSeeAll,
                    style: const TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.w600,
                      color: Color(0xFF0B66FF),
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
        SizedBox(
          height: 196,
          child: ListView.separated(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: 2),
            itemCount: _items.length,
            separatorBuilder: (_, _) => const SizedBox(width: 10),
            itemBuilder: (_, i) => _FactoryMiniCard(
              factory: _items[i],
              onDismiss: () => setState(() => _items.removeAt(i)),
            ),
          ),
        ),
      ],
    );
  }
}

class _FactoryMiniCard extends StatelessWidget {
  const _FactoryMiniCard({required this.factory, required this.onDismiss});
  final FactoryCard factory;

  /// Скрыть карточку — крестик в углу, как в блоке рекомендаций соцсети.
  /// Скрытие локальное, до следующего открытия профиля.
  final VoidCallback onDismiss;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final l = AppLocalizations.of(context)!;
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
        padding: const EdgeInsets.fromLTRB(12, 8, 12, 14),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: scheme.outlineVariant),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Align(
              alignment: Alignment.centerRight,
              child: InkWell(
                onTap: onDismiss,
                borderRadius: BorderRadius.circular(20),
                child: Padding(
                  padding: const EdgeInsets.all(2),
                  child: Icon(Icons.close,
                      size: 16, color: scheme.onSurfaceVariant),
                ),
              ),
            ),
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
                  : '${factory.totalProducts} ${l.profileWordPosts(factory.totalProducts)}',
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
