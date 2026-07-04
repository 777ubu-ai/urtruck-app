import 'dart:async';
import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import '../../../core/api/api_client.dart';
import '../../../core/currency/converted_price_text.dart';
import '../../../core/storage/auth_storage.dart';
import '../../../core/widgets/loading_skeleton.dart';
import '../../../l10n/app_localizations.dart';
import '../../feed/data/feed_repository.dart';
import '../../feed/presentation/post_detail_screen.dart';

/// Экран поиска. Живёт во вкладке «Поиск» MainShell.
///
/// Поведение:
///   - TextField сверху с иконкой поиска и кнопкой очистки
///   - Debounce 350 мс после последнего нажатия — чтобы не дёргать бэк на
///     каждый символ
///   - Минимальная длина запроса 2 символа (совпадает с логикой бэка)
///   - Infinite scroll с курсорной пагинацией
///   - Компактные `_SearchResultTile` (80×80 превью + текст + хэштеги)
///   - 4 состояния: idle (пусто при первом открытии), loading, no-results, ошибка
///
/// Повторное открытие вкладки сохраняет состояние через `IndexedStack` в MainShell.
class SearchScreen extends StatefulWidget {
  const SearchScreen({super.key});

  @override
  State<SearchScreen> createState() => _SearchScreenState();
}

class _SearchScreenState extends State<SearchScreen> {
  final _repo = FeedRepository();
  final _textController = TextEditingController();
  final _scrollController = ScrollController();
  final _focusNode = FocusNode();

  Timer? _debounce;
  String _query = '';
  final List<FeedPost> _items = [];
  String? _nextCursor;
  bool _hasMore = true;
  bool _loading = false;
  String? _error;

  // Активные фильтры. Любое изменение → перезапрос с нуля.
  double? _minPrice;
  double? _maxPrice;
  int? _maxMoq;
  String? _countryCode;
  bool _hotDealOnly = false;

  bool get _hasActiveFilters =>
      _minPrice != null ||
      _maxPrice != null ||
      _maxMoq != null ||
      _countryCode != null ||
      _hotDealOnly;

  @override
  void initState() {
    super.initState();
    _scrollController.addListener(() {
      if (_scrollController.position.pixels >=
          _scrollController.position.maxScrollExtent - 300) {
        if (!_loading && _hasMore && _query.length >= 2) {
          _loadMore();
        }
      }
    });
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _textController.dispose();
    _scrollController.dispose();
    _focusNode.dispose();
    super.dispose();
  }

  /// Принимаем новое значение из поля. Стартуем новый debounce-таймер —
  /// только когда он сработает, действительно дёргаем бэк.
  void _onTextChanged(String value) {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 350), () {
      _applyQuery(value);
    });
    // Обновляем UI чтобы перерисовать suffixIcon (clear/loader)
    setState(() {});
  }

  void _applyQuery(String value) {
    final trimmed = value.trim();
    if (trimmed == _query) return; // не дёргаем если ничего не изменилось

    setState(() {
      _query = trimmed;
      _items.clear();
      _nextCursor = null;
      _hasMore = true;
      _error = null;
    });

    if (trimmed.length < 2) {
      // Слишком короткий — просто показываем idle-состояние, ничего не грузим.
      return;
    }

    // UX-3: сохраняем запрос в историю
    AuthStorage.instance.addSearchHistory(trimmed);
    _loadMore();
  }

  Future<void> _loadMore() async {
    if (_loading || _query.length < 2) return;
    setState(() {
      _loading = true;
      _error = null;
    });
    final queryAtStart = _query;
    try {
      final page = await _repo.searchPosts(
        _query,
        cursor: _nextCursor,
        minPrice: _minPrice,
        maxPrice: _maxPrice,
        maxMoq: _maxMoq,
        countryCode: _countryCode,
        hotDealOnly: _hotDealOnly,
      );
      if (!mounted) return;
      // Защита: если пока шла сетевая операция, пользователь успел изменить
      // запрос — игнорируем результат, чтобы не засорять чужой запрос.
      if (queryAtStart != _query) return;
      setState(() {
        _items.addAll(page.items);
        _nextCursor = page.nextCursor;
        _hasMore = page.hasMore;
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      if (queryAtStart != _query) return;
      setState(() {
        _error = e.toString().replaceFirst('Exception: ', '');
        _loading = false;
      });
    }
  }

  void _clearQuery() {
    _debounce?.cancel();
    _textController.clear();
    setState(() {
      _query = '';
      _items.clear();
      _nextCursor = null;
      _hasMore = true;
      _error = null;
    });
    _focusNode.requestFocus();
  }

  /// Перезапустить поиск с текущими фильтрами и query (если есть).
  void _refetchWithFilters() {
    setState(() {
      _items.clear();
      _nextCursor = null;
      _hasMore = true;
      _error = null;
    });
    if (_query.length >= 2) _loadMore();
  }

  Future<void> _openFiltersSheet() async {
    final result = await showModalBottomSheet<_SearchFilters>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (_) => _SearchFiltersSheet(
        initial: _SearchFilters(
          minPrice: _minPrice,
          maxPrice: _maxPrice,
          maxMoq: _maxMoq,
          countryCode: _countryCode,
          hotDealOnly: _hotDealOnly,
        ),
      ),
    );
    if (result == null || !mounted) return;
    setState(() {
      _minPrice = result.minPrice;
      _maxPrice = result.maxPrice;
      _maxMoq = result.maxMoq;
      _countryCode = result.countryCode;
      _hotDealOnly = result.hotDealOnly;
    });
    _refetchWithFilters();
  }

  void _resetFilters() {
    setState(() {
      _minPrice = null;
      _maxPrice = null;
      _maxMoq = null;
      _countryCode = null;
      _hotDealOnly = false;
    });
    _refetchWithFilters();
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final l = AppLocalizations.of(context)!;
    return Scaffold(
      appBar: AppBar(
        titleSpacing: 12,
        title: TextField(
          controller: _textController,
          focusNode: _focusNode,
          onChanged: _onTextChanged,
          textInputAction: TextInputAction.search,
          onSubmitted: (_) {
            _debounce?.cancel();
            _applyQuery(_textController.text);
          },
          decoration: InputDecoration(
            hintText: l.searchHint,
            prefixIcon: const Icon(Icons.search),
            suffixIcon: _textController.text.isNotEmpty
                ? IconButton(
                    icon: const Icon(Icons.close),
                    tooltip: l.searchHintTooltipClear,
                    onPressed: _clearQuery,
                  )
                : null,
            border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(24),
              borderSide: BorderSide.none,
            ),
            filled: true,
            fillColor: scheme.surfaceContainerHighest,
            contentPadding:
                const EdgeInsets.symmetric(horizontal: 8, vertical: 0),
            isDense: true,
          ),
        ),
        actions: [
          // Кнопка фильтров с индикатором активности
          Stack(
            alignment: Alignment.center,
            children: [
              IconButton(
                icon: const Icon(Icons.tune),
                tooltip: AppLocalizations.of(context)!.searchFilters,
                onPressed: _openFiltersSheet,
              ),
              if (_hasActiveFilters)
                Positioned(
                  right: 10,
                  top: 10,
                  child: Container(
                    width: 8,
                    height: 8,
                    decoration: BoxDecoration(
                      color: scheme.primary,
                      shape: BoxShape.circle,
                    ),
                  ),
                ),
            ],
          ),
        ],
      ),
      body: Column(
        children: [
          if (_hasActiveFilters)
            _ActiveFiltersBar(
              minPrice: _minPrice,
              maxPrice: _maxPrice,
              maxMoq: _maxMoq,
              countryCode: _countryCode,
              hotDealOnly: _hotDealOnly,
              onClear: _resetFilters,
            ),
          Expanded(child: _buildBody()),
        ],
      ),
    );
  }

  Widget _buildBody() {
    // 1. Пустое поле — idle-подсказка с историей поиска
    if (_query.length < 2) {
      return _IdleHint(
        onTapHistory: (q) {
          _textController.text = q;
          _applyQuery(q);
        },
      );
    }
    // 2. Первая загрузка без результатов
    if (_items.isEmpty && _loading) {
      return const CompactListSkeleton();
    }
    // 3. Ошибка без результатов
    if (_items.isEmpty && _error != null) {
      return _ErrorBlock(error: _error!, onRetry: _loadMore);
    }
    // 4. Запрос был, ответ пустой
    if (_items.isEmpty) {
      return _NoResults(query: _query);
    }
    // 5. Есть результаты
    return ListView.separated(
      controller: _scrollController,
      padding: const EdgeInsets.symmetric(vertical: 4),
      itemCount: _items.length + (_hasMore ? 1 : 0),
      separatorBuilder: (_, __) => const Divider(height: 1, indent: 104),
      itemBuilder: (context, i) {
        if (i >= _items.length) {
          return const Padding(
            padding: EdgeInsets.all(16),
            child: Center(child: CircularProgressIndicator()),
          );
        }
        return _SearchResultTile(
          post: _items[i],
          onTap: () async {
            await Navigator.of(context).push(
              MaterialPageRoute(
                builder: (_) => PostDetailScreen(
                  postId: _items[i].id,
                  initial: _items[i],
                ),
              ),
            );
          },
        );
      },
    );
  }
}

/// Компактная карточка результата. Прямоугольник 80×80 слева, текст справа.
class _SearchResultTile extends StatelessWidget {
  const _SearchResultTile({required this.post, required this.onTap});
  final FeedPost post;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final rawUrl =
        post.media.isNotEmpty ? post.media.first['url'] as String? : null;
    final firstMediaUrl =
        rawUrl != null ? ApiClient.resolveMediaUrl(rawUrl) : null;

    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(12, 10, 12, 10),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Превью
            ClipRRect(
              borderRadius: BorderRadius.circular(8),
              child: SizedBox(
                width: 80,
                height: 80,
                child: firstMediaUrl != null
                    ? CachedNetworkImage(
                        imageUrl: firstMediaUrl,
                        fit: BoxFit.cover,
                        placeholder: (_, __) =>
                            Container(color: scheme.surfaceContainerHighest),
                        errorWidget: (_, __, ___) => Container(
                          color: scheme.surfaceContainerHighest,
                          child: Icon(Icons.broken_image,
                              color: scheme.onSurfaceVariant),
                        ),
                      )
                    : Container(
                        color: scheme.surfaceContainerHighest,
                        child: Icon(Icons.image,
                            color: scheme.onSurfaceVariant),
                      ),
              ),
            ),
            const SizedBox(width: 12),
            // Текст
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    post.title,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                          fontWeight: FontWeight.w600,
                          height: 1.25,
                        ),
                  ),
                  const SizedBox(height: 2),
                  Row(
                    children: [
                      Icon(Icons.storefront_outlined,
                          size: 14, color: scheme.onSurfaceVariant),
                      const SizedBox(width: 4),
                      Flexible(
                        child: Text(
                          post.factoryName,
                          overflow: TextOverflow.ellipsis,
                          style:
                              Theme.of(context).textTheme.bodySmall?.copyWith(
                                    color: scheme.onSurfaceVariant,
                                  ),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 4),
                  Row(
                    children: [
                      Text(
                        '${post.priceAmount} ${post.priceCurrency}',
                        style:
                            Theme.of(context).textTheme.bodyMedium?.copyWith(
                                  fontWeight: FontWeight.w700,
                                ),
                      ),
                      const SizedBox(width: 8),
                      Icon(Icons.inventory_2_outlined,
                          size: 12, color: scheme.onSurfaceVariant),
                      const SizedBox(width: 2),
                      Text(
                        'MOQ ${post.moq}',
                        style:
                            Theme.of(context).textTheme.bodySmall?.copyWith(
                                  color: scheme.onSurfaceVariant,
                                ),
                      ),
                    ],
                  ),
                  // Конвертация цены — отдельной строкой чтобы не ломать Row layout
                  ConvertedPriceText(
                    amount: post.priceAmount,
                    fromCurrency: post.priceCurrency,
                    prefix: '',
                  ),
                  if (post.hashtags.isNotEmpty) ...[
                    const SizedBox(height: 4),
                    Wrap(
                      spacing: 4,
                      runSpacing: 0,
                      children: post.hashtags
                          .take(3)
                          .map((tag) => Text(
                                '#$tag',
                                style: Theme.of(context)
                                    .textTheme
                                    .bodySmall
                                    ?.copyWith(
                                      color: scheme.primary,
                                      fontWeight: FontWeight.w500,
                                    ),
                              ))
                          .toList(),
                    ),
                  ],
                ],
              ),
            ),
            // Индикатор хот-дила
            if (post.isHotDeal) ...[
              const SizedBox(width: 8),
              Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                decoration: BoxDecoration(
                  color: Colors.red,
                  borderRadius: BorderRadius.circular(4),
                ),
                child: const Text(
                  '🔥',
                  style: TextStyle(fontSize: 12),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _IdleHint extends StatefulWidget {
  const _IdleHint({this.onTapHistory});
  final ValueChanged<String>? onTapHistory;

  @override
  State<_IdleHint> createState() => _IdleHintState();
}

class _IdleHintState extends State<_IdleHint> {
  List<String> _history = const [];

  @override
  void initState() {
    super.initState();
    _loadHistory();
  }

  Future<void> _loadHistory() async {
    final items = await AuthStorage.instance.readSearchHistory();
    if (mounted) setState(() => _history = items);
  }

  Future<void> _clear() async {
    await AuthStorage.instance.clearSearchHistory();
    if (mounted) setState(() => _history = const []);
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final l = AppLocalizations.of(context)!;
    return ListView(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 24),
      children: [
        if (_history.isNotEmpty) ...[
          Row(
            children: [
              Text(
                l.searchHistoryTitle,
                style: Theme.of(context).textTheme.titleMedium?.copyWith(
                      fontWeight: FontWeight.w700,
                    ),
              ),
              const Spacer(),
              TextButton(
                onPressed: _clear,
                child: Text(l.searchHistoryClear),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: _history
                .map((q) => ActionChip(
                      avatar: const Icon(Icons.history, size: 16),
                      label: Text(q),
                      onPressed: () => widget.onTapHistory?.call(q),
                    ))
                .toList(),
          ),
          const SizedBox(height: 32),
        ],
        Icon(Icons.search, size: 96, color: scheme.onSurfaceVariant),
        const SizedBox(height: 16),
        Text(
          l.searchIdleTitle,
          style: Theme.of(context).textTheme.headlineSmall,
          textAlign: TextAlign.center,
        ),
        const SizedBox(height: 8),
        Text(
          l.searchIdleBody,
          textAlign: TextAlign.center,
          style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                color: scheme.onSurfaceVariant,
              ),
        ),
      ],
    );
  }
}

class _NoResults extends StatelessWidget {
  const _NoResults({required this.query});
  final String query;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.search_off,
                size: 96, color: scheme.onSurfaceVariant),
            const SizedBox(height: 16),
            Text(
              AppLocalizations.of(context)!.searchNoResults,
              style: Theme.of(context).textTheme.headlineSmall,
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 8),
            Text(
              AppLocalizations.of(context)!.searchNoResultsBody(query),
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                    color: scheme.onSurfaceVariant,
                  ),
            ),
          ],
        ),
      ),
    );
  }
}

class _ErrorBlock extends StatelessWidget {
  const _ErrorBlock({required this.error, required this.onRetry});
  final String error;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.error_outline,
                size: 64, color: Theme.of(context).colorScheme.error),
            const SizedBox(height: 12),
            Text(error, textAlign: TextAlign.center),
            const SizedBox(height: 12),
            FilledButton.tonal(
              onPressed: onRetry,
              child: Text(AppLocalizations.of(context)!.commonRetry),
            ),
          ],
        ),
      ),
    );
  }
}

/// Композитный объект значений всех фильтров. Возвращается из bottom sheet'а.
class _SearchFilters {
  _SearchFilters({
    this.minPrice,
    this.maxPrice,
    this.maxMoq,
    this.countryCode,
    this.hotDealOnly = false,
  });

  final double? minPrice;
  final double? maxPrice;
  final int? maxMoq;
  final String? countryCode;
  final bool hotDealOnly;
}

/// Bottom sheet с формой фильтров. Возвращает `_SearchFilters` через
/// Navigator.pop, либо null если юзер закрыл без сохранения.
class _SearchFiltersSheet extends StatefulWidget {
  const _SearchFiltersSheet({required this.initial});
  final _SearchFilters initial;

  @override
  State<_SearchFiltersSheet> createState() => _SearchFiltersSheetState();
}

class _SearchFiltersSheetState extends State<_SearchFiltersSheet> {
  late final TextEditingController _minPriceCtrl;
  late final TextEditingController _maxPriceCtrl;
  late final TextEditingController _maxMoqCtrl;
  String? _countryCode;
  bool _hotDealOnly = false;

  /// Поддерживаемые страны заводов (коды в соответствии с сидами). В Phase 2
  /// подгружать из /countries endpoint'а или из user.countryCode aggregate.
  /// Названия резолвятся через ARB `countryNameXX` в build().
  static const _countryCodes = <String>['CN', 'KZ', 'RU', 'KG', 'UZ'];

  String _countryLabel(AppLocalizations l, String code) {
    switch (code) {
      case 'CN':
        return l.countryNameCN;
      case 'KZ':
        return l.countryNameKZ;
      case 'RU':
        return l.countryNameRU;
      case 'KG':
        return l.countryNameKG;
      case 'UZ':
        return l.countryNameUZ;
      default:
        return code;
    }
  }

  @override
  void initState() {
    super.initState();
    _minPriceCtrl = TextEditingController(
      text: widget.initial.minPrice?.toStringAsFixed(0) ?? '',
    );
    _maxPriceCtrl = TextEditingController(
      text: widget.initial.maxPrice?.toStringAsFixed(0) ?? '',
    );
    _maxMoqCtrl = TextEditingController(
      text: widget.initial.maxMoq?.toString() ?? '',
    );
    _countryCode = widget.initial.countryCode;
    _hotDealOnly = widget.initial.hotDealOnly;
  }

  @override
  void dispose() {
    _minPriceCtrl.dispose();
    _maxPriceCtrl.dispose();
    _maxMoqCtrl.dispose();
    super.dispose();
  }

  void _apply() {
    Navigator.of(context).pop(_SearchFilters(
      minPrice: double.tryParse(_minPriceCtrl.text),
      maxPrice: double.tryParse(_maxPriceCtrl.text),
      maxMoq: int.tryParse(_maxMoqCtrl.text),
      countryCode: _countryCode,
      hotDealOnly: _hotDealOnly,
    ));
  }

  void _reset() {
    setState(() {
      _minPriceCtrl.clear();
      _maxPriceCtrl.clear();
      _maxMoqCtrl.clear();
      _countryCode = null;
      _hotDealOnly = false;
    });
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.fromLTRB(
        20,
        8,
        20,
        20 + MediaQuery.of(context).viewInsets.bottom,
      ),
      child: Builder(
        builder: (context) {
          final l = AppLocalizations.of(context)!;
          return Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                l.searchFilters,
                style: Theme.of(context).textTheme.titleLarge?.copyWith(
                      fontWeight: FontWeight.w700,
                    ),
              ),
              const SizedBox(height: 16),
              Text(l.searchFiltersPriceUsd,
                  style: Theme.of(context).textTheme.titleSmall),
              const SizedBox(height: 8),
              Row(
                children: [
                  Expanded(
                    child: TextField(
                      controller: _minPriceCtrl,
                      keyboardType: TextInputType.number,
                      decoration: InputDecoration(
                        labelText: l.searchFiltersFrom,
                        border: const OutlineInputBorder(),
                        isDense: true,
                      ),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: TextField(
                      controller: _maxPriceCtrl,
                      keyboardType: TextInputType.number,
                      decoration: InputDecoration(
                        labelText: l.searchFiltersTo,
                        border: const OutlineInputBorder(),
                        isDense: true,
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 16),
              Text(l.searchFiltersMoqMax,
                  style: Theme.of(context).textTheme.titleSmall),
              const SizedBox(height: 8),
              TextField(
                controller: _maxMoqCtrl,
                keyboardType: TextInputType.number,
                decoration: const InputDecoration(
                  border: OutlineInputBorder(),
                  isDense: true,
                ),
              ),
              const SizedBox(height: 16),
              Text(l.searchFiltersCountry,
                  style: Theme.of(context).textTheme.titleSmall),
              const SizedBox(height: 8),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  ChoiceChip(
                    label: Text(l.searchFiltersCountryAll),
                    selected: _countryCode == null,
                    onSelected: (_) => setState(() => _countryCode = null),
                  ),
                  ..._countryCodes.map(
                    (code) => ChoiceChip(
                      label: Text(_countryLabel(l, code)),
                      selected: _countryCode == code,
                      onSelected: (_) => setState(() => _countryCode = code),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 16),
              SwitchListTile(
                value: _hotDealOnly,
                onChanged: (v) => setState(() => _hotDealOnly = v),
                title: Text(l.searchFiltersHotDeal),
                secondary: const Icon(Icons.local_fire_department),
                contentPadding: EdgeInsets.zero,
              ),
              const SizedBox(height: 16),
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton(
                      onPressed: _reset,
                      child: Text(l.searchFiltersReset),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: FilledButton(
                      onPressed: _apply,
                      child: Text(l.searchFiltersApply),
                    ),
                  ),
                ],
              ),
            ],
          );
        },
      ),
    );
  }
}

/// Тонкая полоска под AppBar с резюме активных фильтров и кнопкой сброса.
class _ActiveFiltersBar extends StatelessWidget {
  const _ActiveFiltersBar({
    required this.minPrice,
    required this.maxPrice,
    required this.maxMoq,
    required this.countryCode,
    required this.hotDealOnly,
    required this.onClear,
  });
  final double? minPrice;
  final double? maxPrice;
  final int? maxMoq;
  final String? countryCode;
  final bool hotDealOnly;
  final VoidCallback onClear;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final parts = <String>[];
    if (minPrice != null || maxPrice != null) {
      final from = minPrice?.toStringAsFixed(0) ?? '0';
      final to = maxPrice?.toStringAsFixed(0) ?? '∞';
      parts.add('\$$from–$to');
    }
    final l = AppLocalizations.of(context)!;
    if (maxMoq != null) parts.add('MOQ ≤ $maxMoq');
    if (countryCode != null) parts.add(countryCode!);
    if (hotDealOnly) parts.add(l.searchFiltersHotShort);
    return Container(
      color: scheme.surfaceContainerLowest,
      padding: const EdgeInsets.fromLTRB(12, 4, 4, 4),
      child: Row(
        children: [
          const Icon(Icons.filter_alt, size: 16),
          const SizedBox(width: 6),
          Expanded(
            child: Text(
              parts.join(' • '),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: Theme.of(context).textTheme.bodySmall,
            ),
          ),
          IconButton(
            iconSize: 18,
            visualDensity: VisualDensity.compact,
            icon: const Icon(Icons.close),
            tooltip: l.searchResetFiltersTooltip,
            onPressed: onClear,
          ),
        ],
      ),
    );
  }
}
