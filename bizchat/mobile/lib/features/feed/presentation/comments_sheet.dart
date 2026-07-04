import 'package:flutter/material.dart';
import '../../../l10n/app_localizations.dart';
import '../data/comments_repository.dart';

/// Bottom sheet с комментариями к посту.
///
/// Открывается из карточки или экрана детали через `showCommentsSheet()`.
/// Возвращает при закрытии актуальный счётчик комментариев — его нужно
/// синхронизировать в родительском виджете, чтобы не делать лишний запрос
/// к /feed или /:id ради одного числа.
///
/// Использует `DraggableScrollableSheet`: открывается на 70% высоты,
/// тянется до полного экрана.
class CommentsSheet extends StatefulWidget {
  const CommentsSheet({
    super.key,
    required this.postId,
    required this.initialCount,
    this.onCountChanged,
  });

  final String postId;
  final int initialCount;

  /// Вызывается при каждом изменении локального счётчика (после успешной
  /// отправки коммента). Родитель может прямо в реальном времени обновить
  /// своё состояние без ожидания закрытия sheet'а.
  final ValueChanged<int>? onCountChanged;

  @override
  State<CommentsSheet> createState() => _CommentsSheetState();
}

class _CommentsSheetState extends State<CommentsSheet> {
  final _repo = CommentsRepository();
  final _textController = TextEditingController();
  final _scrollController = ScrollController();

  final List<PostCommentItem> _items = [];
  String? _nextCursor;
  bool _hasMore = true;
  bool _loading = false;
  bool _sending = false;
  String? _error;
  late int _count;

  @override
  void initState() {
    super.initState();
    _count = widget.initialCount;
    _loadMore();
    _scrollController.addListener(() {
      if (_scrollController.position.pixels >=
          _scrollController.position.maxScrollExtent - 200) {
        if (!_loading && _hasMore) _loadMore();
      }
    });
  }

  @override
  void dispose() {
    _textController.dispose();
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
      final page = await _repo.loadComments(
        widget.postId,
        cursor: _nextCursor,
      );
      if (!mounted) return;
      setState(() {
        _items.addAll(page.items);
        _nextCursor = page.nextCursor;
        _hasMore = page.hasMore;
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.toString();
        _loading = false;
      });
    }
  }

  Future<void> _send() async {
    final text = _textController.text.trim();
    if (text.isEmpty || _sending) return;
    setState(() => _sending = true);
    try {
      final created = await _repo.createComment(widget.postId, text);
      if (!mounted) return;
      setState(() {
        // Свежий коммент в начало списка (новые сверху)
        _items.insert(0, created);
        _count++;
        _textController.clear();
      });
      widget.onCountChanged?.call(_count);
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(e.toString().replaceFirst('Exception: ', '')),
          duration: const Duration(seconds: 2),
        ),
      );
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return DraggableScrollableSheet(
      initialChildSize: 0.7,
      minChildSize: 0.4,
      maxChildSize: 0.95,
      expand: false,
      builder: (_, scrollController) {
        // Используем переданный контроллер от DraggableScrollableSheet,
        // чтобы потянуть лист вверх работало с тем же скроллом, что и наш список.
        return Column(
          children: [
            // Заголовок
            Container(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
              decoration: BoxDecoration(
                border: Border(
                  bottom: BorderSide(color: scheme.outlineVariant),
                ),
              ),
              child: Row(
                children: [
                  // drag handle
                  Expanded(
                    child: Center(
                      child: Container(
                        width: 36,
                        height: 4,
                        decoration: BoxDecoration(
                          color: scheme.outlineVariant,
                          borderRadius: BorderRadius.circular(2),
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
              child: Row(
                children: [
                  Text(
                    AppLocalizations.of(context)!.postCommentsTitle,
                    style: Theme.of(context).textTheme.titleLarge?.copyWith(
                          fontWeight: FontWeight.w700,
                        ),
                  ),
                  const SizedBox(width: 8),
                  Text(
                    '($_count)',
                    style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                          color: scheme.onSurfaceVariant,
                        ),
                  ),
                ],
              ),
            ),
            // Список комментов или пустое состояние
            Expanded(
              child: _buildList(scrollController),
            ),
            // Разделитель + поле ввода
            Container(
              decoration: BoxDecoration(
                border: Border(
                  top: BorderSide(color: scheme.outlineVariant),
                ),
              ),
              child: SafeArea(
                top: false,
                child: Padding(
                  padding: EdgeInsets.fromLTRB(
                    12,
                    8,
                    12,
                    8 + MediaQuery.of(context).viewInsets.bottom,
                  ),
                  child: Row(
                    children: [
                      Expanded(
                        child: TextField(
                          controller: _textController,
                          enabled: !_sending,
                          maxLines: 4,
                          minLines: 1,
                          textInputAction: TextInputAction.send,
                          onSubmitted: (_) => _send(),
                          decoration: InputDecoration(
                            hintText:
                                AppLocalizations.of(context)!.postCommentInputHint,
                            isDense: true,
                            border: OutlineInputBorder(
                              borderRadius: BorderRadius.circular(20),
                            ),
                            contentPadding: const EdgeInsets.symmetric(
                              horizontal: 16,
                              vertical: 10,
                            ),
                          ),
                        ),
                      ),
                      const SizedBox(width: 8),
                      IconButton.filled(
                        onPressed: _sending ? null : _send,
                        icon: _sending
                            ? const SizedBox(
                                width: 18,
                                height: 18,
                                child: CircularProgressIndicator(
                                  strokeWidth: 2,
                                  color: Colors.white,
                                ),
                              )
                            : const Icon(Icons.send),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ],
        );
      },
    );
  }

  Widget _buildList(ScrollController scrollController) {
    if (_items.isEmpty && _loading) {
      return const Center(child: CircularProgressIndicator());
    }
    if (_items.isEmpty && _error != null) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(Icons.error_outline,
                  size: 48, color: Theme.of(context).colorScheme.error),
              const SizedBox(height: 12),
              Text(_error!, textAlign: TextAlign.center),
              const SizedBox(height: 12),
              FilledButton.tonal(
                onPressed: _loadMore,
                child: Text(AppLocalizations.of(context)!.commonRetry),
              ),
            ],
          ),
        ),
      );
    }
    if (_items.isEmpty) {
      return const _EmptyComments();
    }
    return ListView.separated(
      controller: scrollController,
      padding: const EdgeInsets.symmetric(vertical: 4),
      itemCount: _items.length + (_hasMore ? 1 : 0),
      separatorBuilder: (_, __) => const SizedBox(height: 4),
      itemBuilder: (_, i) {
        if (i >= _items.length) {
          return const Padding(
            padding: EdgeInsets.all(16),
            child: Center(child: CircularProgressIndicator()),
          );
        }
        return _CommentTile(item: _items[i]);
      },
    );
  }
}

class _CommentTile extends StatelessWidget {
  const _CommentTile({required this.item});
  final PostCommentItem item;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final initial =
        item.userName.isNotEmpty ? item.userName[0].toUpperCase() : '?';
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          CircleAvatar(
            radius: 18,
            backgroundColor: item.userType == 'factory'
                ? scheme.tertiaryContainer
                : scheme.secondaryContainer,
            backgroundImage: item.userAvatarUrl != null
                ? NetworkImage(item.userAvatarUrl!)
                : null,
            child: item.userAvatarUrl == null
                ? Text(
                    initial,
                    style: TextStyle(
                      fontWeight: FontWeight.w700,
                      color: item.userType == 'factory'
                          ? scheme.onTertiaryContainer
                          : scheme.onSecondaryContainer,
                    ),
                  )
                : null,
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Flexible(
                      child: Text(
                        item.userName,
                        style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                              fontWeight: FontWeight.w700,
                            ),
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                    const SizedBox(width: 6),
                    Text(
                      _timeAgo(context, item.createdAt),
                      style: Theme.of(context).textTheme.bodySmall?.copyWith(
                            color: scheme.onSurfaceVariant,
                          ),
                    ),
                  ],
                ),
                const SizedBox(height: 2),
                Text(item.text,
                    style: Theme.of(context).textTheme.bodyMedium),
              ],
            ),
          ),
        ],
      ),
    );
  }

  /// Простое «N мин/час/дн назад». Если больше 7 дней — точная дата.
  static String _timeAgo(BuildContext context, DateTime dt) {
    final l = AppLocalizations.of(context)!;
    final diff = DateTime.now().difference(dt);
    if (diff.inSeconds < 60) return l.commonJustNow;
    if (diff.inMinutes < 60) return l.commonMinutesShort(diff.inMinutes);
    if (diff.inHours < 24) return l.commonHoursShort(diff.inHours);
    if (diff.inDays < 7) return l.commonDaysShort(diff.inDays);
    return '${dt.day.toString().padLeft(2, '0')}.'
        '${dt.month.toString().padLeft(2, '0')}.'
        '${dt.year}';
  }
}

class _EmptyComments extends StatelessWidget {
  const _EmptyComments();

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final l = AppLocalizations.of(context)!;
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.mode_comment_outlined,
                size: 64, color: scheme.onSurfaceVariant),
            const SizedBox(height: 12),
            Text(
              l.commentsSheetEmptyTitle,
              style: Theme.of(context).textTheme.titleMedium,
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 4),
            Text(
              l.commentsSheetEmptySubtitle,
              style: Theme.of(context).textTheme.bodySmall?.copyWith(
                    color: scheme.onSurfaceVariant,
                  ),
              textAlign: TextAlign.center,
            ),
          ],
        ),
      ),
    );
  }
}

/// Хелпер для показа sheet'а из любого экрана.
/// `onCountChanged` вызывается каждый раз, когда юзер успешно отправляет
/// коммент — родитель может тут же обновить локальный счётчик в реальном
/// времени, без ожидания закрытия sheet'а.
Future<void> showCommentsSheet(
  BuildContext context, {
  required String postId,
  required int initialCount,
  ValueChanged<int>? onCountChanged,
}) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    showDragHandle: false, // у нас своя ручка внутри
    backgroundColor: Theme.of(context).colorScheme.surface,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
    ),
    builder: (_) => CommentsSheet(
      postId: postId,
      initialCount: initialCount,
      onCountChanged: onCountChanged,
    ),
  );
}
