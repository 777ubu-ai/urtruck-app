import 'dart:async';
import 'package:flutter/material.dart';
import '../../../core/api/api_client.dart';
import '../../../core/widgets/trust_badge.dart';
import '../../../l10n/app_localizations.dart';
import '../../profile/presentation/public_profile_screen.dart';
import '../data/factories_repository.dart';

/// Полный каталог заводов — то, куда ведёт «Все» из карусели в профиле.
///
/// Поиск по названию, переключатель «только проверенные» и постраничная
/// подгрузка. Сюда же будет уходить импорт китайских заводов, поэтому
/// список рассчитан на большой объём: грузим порциями по мере прокрутки,
/// а не разом.
class FactoriesScreen extends StatefulWidget {
  const FactoriesScreen({super.key});

  @override
  State<FactoriesScreen> createState() => _FactoriesScreenState();
}

class _FactoriesScreenState extends State<FactoriesScreen> {
  static const _pageSize = 20;

  final _repo = FactoriesRepository();
  final _controller = ScrollController();
  final _searchController = TextEditingController();

  final List<FactoryCard> _items = [];
  bool _loading = false;
  bool _hasMore = true;
  bool _verifiedOnly = false;
  String _query = '';
  String? _error;
  Timer? _debounce;

  @override
  void initState() {
    super.initState();
    _controller.addListener(_onScroll);
    _loadMore(reset: true);
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _controller.dispose();
    _searchController.dispose();
    super.dispose();
  }

  void _onScroll() {
    if (!_controller.hasClients || _loading || !_hasMore) return;
    final pos = _controller.position;
    if (pos.pixels >= pos.maxScrollExtent - 400) _loadMore();
  }

  /// Поиск с задержкой: не дёргаем сервер на каждую букву.
  void _onQueryChanged(String value) {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 350), () {
      if (!mounted) return;
      setState(() => _query = value);
      _loadMore(reset: true);
    });
  }

  Future<void> _loadMore({bool reset = false}) async {
    if (_loading) return;
    setState(() {
      _loading = true;
      if (reset) _error = null;
    });
    try {
      final page = await _repo.list(
        query: _query,
        verifiedOnly: _verifiedOnly,
        limit: _pageSize,
        offset: reset ? 0 : _items.length,
      );
      if (!mounted) return;
      setState(() {
        if (reset) _items.clear();
        _items.addAll(page.items);
        _hasMore = page.hasMore;
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.toString().replaceFirst('Exception: ', '');
        _loading = false;
        _hasMore = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context)!;
    final scheme = Theme.of(context).colorScheme;
    return Scaffold(
      appBar: AppBar(title: Text(l.factoriesTitle)),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 8),
            child: TextField(
              controller: _searchController,
              onChanged: _onQueryChanged,
              textInputAction: TextInputAction.search,
              decoration: InputDecoration(
                hintText: l.factoriesSearchHint,
                prefixIcon: const Icon(Icons.search),
                isDense: true,
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                ),
              ),
            ),
          ),
          Align(
            alignment: Alignment.centerLeft,
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: FilterChip(
                label: Text(l.factoriesVerifiedOnly),
                selected: _verifiedOnly,
                onSelected: (v) {
                  setState(() => _verifiedOnly = v);
                  _loadMore(reset: true);
                },
              ),
            ),
          ),
          const SizedBox(height: 8),
          Expanded(
            child: _error != null && _items.isEmpty
                ? _CenteredMessage(
                    icon: Icons.error_outline,
                    text: _error!,
                    actionLabel: l.commonRetry,
                    onAction: () => _loadMore(reset: true),
                  )
                : _items.isEmpty && !_loading
                    ? _CenteredMessage(
                        icon: Icons.factory_outlined,
                        text: l.factoriesEmpty,
                      )
                    : ListView.separated(
                        controller: _controller,
                        itemCount: _items.length + (_hasMore ? 1 : 0),
                        separatorBuilder: (_, _) =>
                            Divider(height: 1, color: scheme.outlineVariant),
                        itemBuilder: (_, i) {
                          if (i >= _items.length) {
                            return const Padding(
                              padding: EdgeInsets.all(16),
                              child: Center(
                                child: SizedBox(
                                  width: 22,
                                  height: 22,
                                  child:
                                      CircularProgressIndicator(strokeWidth: 2),
                                ),
                              ),
                            );
                          }
                          return _FactoryRow(factory: _items[i]);
                        },
                      ),
          ),
        ],
      ),
    );
  }
}

/// Строка каталога: логотип, название, город, статус доверия.
class _FactoryRow extends StatelessWidget {
  const _FactoryRow({required this.factory});
  final FactoryCard factory;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final l = AppLocalizations.of(context)!;
    final place = [factory.city, factory.countryCode]
        .whereType<String>()
        .where((e) => e.isNotEmpty)
        .join(' · ');
    return ListTile(
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
      leading: FactoryAvatar(
        name: factory.companyName,
        imageUrl: factory.avatarUrl != null
            ? ApiClient.resolveMediaUrl(factory.avatarUrl!)
            : null,
        size: 52,
      ),
      title: Text(
        factory.companyName,
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
        style: const TextStyle(fontWeight: FontWeight.w700),
      ),
      subtitle: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Краткое «что за завод» — на списке из тысяч строк это то, по
          // чему покупатель вообще решает, тапать или листать дальше.
          if (factory.description != null &&
              factory.description!.isNotEmpty)
            Text(
              factory.description!,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(fontSize: 12.5),
            ),
          Text(
            [
              if (place.isNotEmpty) place,
              l.profileWordPosts(factory.totalProducts),
            ].join(' · '),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(color: scheme.onSurfaceVariant, fontSize: 12.5),
          ),
        ],
      ),
      trailing: TrustBadge(
        score: factory.trustScore,
        verified: factory.verified,
      ),
      onTap: () => Navigator.of(context).push(
        MaterialPageRoute(
          builder: (_) => PublicProfileScreen(userId: factory.userId),
        ),
      ),
    );
  }
}

class _CenteredMessage extends StatelessWidget {
  const _CenteredMessage({
    required this.icon,
    required this.text,
    this.actionLabel,
    this.onAction,
  });

  final IconData icon;
  final String text;
  final String? actionLabel;
  final VoidCallback? onAction;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 56, color: scheme.onSurfaceVariant),
            const SizedBox(height: 12),
            Text(text, textAlign: TextAlign.center),
            if (actionLabel != null && onAction != null) ...[
              const SizedBox(height: 12),
              FilledButton.tonal(onPressed: onAction, child: Text(actionLabel!)),
            ],
          ],
        ),
      ),
    );
  }
}
