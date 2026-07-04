import 'package:cached_network_image/cached_network_image.dart';
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import '../../../core/api/api_client.dart';
import '../../../core/currency/converted_price_text.dart';
import '../../../core/widgets/loading_skeleton.dart';
import '../../../l10n/app_localizations.dart';
import '../../feed/data/feed_repository.dart';
import '../../feed/presentation/post_detail_screen.dart';

/// Экран «Мои сохранения». Открывается из профиля. Показывает все посты,
/// которые юзер сохранил в закладки, отсортированные по `post_saves.created_at DESC`
/// (последние сохранённые сверху).
///
/// Использует тот же визуал что и SearchScreen — компактные tile (80×80
/// превью + текст), потому что экраны со списком одинаковые по сути.
class SavesScreen extends StatefulWidget {
  const SavesScreen({super.key});

  @override
  State<SavesScreen> createState() => _SavesScreenState();
}

class _SavesScreenState extends State<SavesScreen> {
  final _api = ApiClient.instance;
  final _scrollController = ScrollController();
  final List<FeedPost> _items = [];
  String? _nextCursor;
  bool _hasMore = true;
  bool _loading = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _loadMore();
    _scrollController.addListener(() {
      if (_scrollController.position.pixels >=
          _scrollController.position.maxScrollExtent - 300) {
        if (!_loading && _hasMore) _loadMore();
      }
    });
  }

  @override
  void dispose() {
    _scrollController.dispose();
    super.dispose();
  }

  Future<void> _loadMore() async {
    if (_loading) return;
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final res = await _api.dio.get(
        '/users/me/saves',
        queryParameters: {
          'limit': '20',
          if (_nextCursor != null) 'cursor': _nextCursor,
        },
      );
      if (res.statusCode != 200) {
        if (!mounted) return;
        final l = AppLocalizations.of(context)!;
        throw Exception(l.savesLoadErrorHttp(res.statusCode ?? 0));
      }
      final data = (res.data as Map).cast<String, dynamic>();
      final rawData = data['data'];
      final items = rawData is List
          ? rawData
              .map((e) => FeedPost.fromJson((e as Map).cast<String, dynamic>()))
              .toList()
          : <FeedPost>[];
      final meta = (data['meta'] as Map?)?.cast<String, dynamic>() ?? const {};
      if (!mounted) return;
      setState(() {
        _items.addAll(items);
        _nextCursor = meta['nextCursor'] as String?;
        _hasMore = meta['hasMore'] as bool? ?? false;
        _loading = false;
      });
    } on DioException catch (e) {
      if (!mounted) return;
      final l = AppLocalizations.of(context)!;
      setState(() {
        _error = l.savesLoadError(e.message ?? '');
        _loading = false;
      });
    } catch (e) {
      // Остальные ошибки (включая наши Exception из проверки statusCode).
      if (!mounted) return;
      setState(() {
        _error = e.toString().replaceFirst('Exception: ', '');
        _loading = false;
      });
    }
  }

  Future<void> _refresh() async {
    setState(() {
      _items.clear();
      _nextCursor = null;
      _hasMore = true;
      _error = null;
    });
    await _loadMore();
  }

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context)!;
    return Scaffold(
      appBar: AppBar(
        title: Text(l.savesTitle),
      ),
      body: RefreshIndicator(
        onRefresh: _refresh,
        child: _buildBody(),
      ),
    );
  }

  Widget _buildBody() {
    if (_items.isEmpty && _loading) {
      return const CompactListSkeleton();
    }
    if (_items.isEmpty && _error != null) {
      return _ErrorView(error: _error!, onRetry: _loadMore);
    }
    if (_items.isEmpty) {
      return const _EmptySavesView();
    }
    return ListView.separated(
      controller: _scrollController,
      padding: const EdgeInsets.symmetric(vertical: 4),
      itemCount: _items.length + (_hasMore ? 1 : 0),
      separatorBuilder: (_, __) => const Divider(height: 1, indent: 104),
      itemBuilder: (_, i) {
        if (i >= _items.length) {
          return const Padding(
            padding: EdgeInsets.all(16),
            child: Center(child: CircularProgressIndicator()),
          );
        }
        return _SavedPostTile(
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
            // После возврата перезагружаем — пользователь мог снять save и
            // тогда пост должен исчезнуть из списка.
            await _refresh();
          },
        );
      },
    );
  }
}

class _SavedPostTile extends StatelessWidget {
  const _SavedPostTile({required this.post, required this.onTap});
  final FeedPost post;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final rawUrl =
        post.media.isNotEmpty ? post.media.first['url'] as String? : null;
    final imageUrl =
        rawUrl != null ? ApiClient.resolveMediaUrl(rawUrl) : null;
    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(12, 10, 12, 10),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            ClipRRect(
              borderRadius: BorderRadius.circular(8),
              child: SizedBox(
                width: 80,
                height: 80,
                child: imageUrl != null
                    ? CachedNetworkImage(
                        imageUrl: imageUrl,
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
                  Text(
                    '${post.priceAmount} ${post.priceCurrency}',
                    style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                          fontWeight: FontWeight.w700,
                        ),
                  ),
                  ConvertedPriceText(
                    amount: post.priceAmount,
                    fromCurrency: post.priceCurrency,
                    prefix: '',
                  ),
                ],
              ),
            ),
            Icon(Icons.bookmark, color: scheme.primary),
          ],
        ),
      ),
    );
  }
}

class _EmptySavesView extends StatelessWidget {
  const _EmptySavesView();
  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final l = AppLocalizations.of(context)!;
    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      children: [
        const SizedBox(height: 120),
        Icon(Icons.bookmark_border,
            size: 96, color: scheme.onSurfaceVariant),
        const SizedBox(height: 16),
        Text(
          l.savesEmpty,
          textAlign: TextAlign.center,
          style: Theme.of(context).textTheme.titleLarge,
        ),
        const SizedBox(height: 8),
        Text(
          l.savesEmptyHint,
          textAlign: TextAlign.center,
          style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                color: scheme.onSurfaceVariant,
              ),
        ),
      ],
    );
  }
}

class _ErrorView extends StatelessWidget {
  const _ErrorView({required this.error, required this.onRetry});
  final String error;
  final VoidCallback onRetry;
  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context)!;
    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      children: [
        const SizedBox(height: 120),
        Icon(Icons.error_outline,
            size: 64, color: Theme.of(context).colorScheme.error),
        const SizedBox(height: 12),
        Text(error,
            textAlign: TextAlign.center,
            style: Theme.of(context).textTheme.bodyMedium),
        const SizedBox(height: 16),
        Center(
          child: FilledButton.tonal(
            onPressed: onRetry,
            child: Text(l.commonRetry),
          ),
        ),
      ],
    );
  }
}
