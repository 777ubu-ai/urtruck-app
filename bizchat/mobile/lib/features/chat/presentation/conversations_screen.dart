import 'dart:async';
import 'package:flutter/material.dart';
import '../../../core/realtime/realtime_service.dart';
import '../../../core/widgets/loading_skeleton.dart';
import '../../../l10n/app_localizations.dart';
import '../data/chat_repository.dart';
import 'conversation_screen.dart';

/// Список бесед текущего юзера. Живёт во вкладке «Чаты» MainShell.
///
/// Polling: каждые 5 сек обновляем список (лёгкий запрос — одна страница
/// бесед без сообщений). Показывает unread badge у каждой беседы.
class ConversationsScreen extends StatefulWidget {
  const ConversationsScreen({super.key});

  @override
  State<ConversationsScreen> createState() => _ConversationsScreenState();
}

class _ConversationsScreenState extends State<ConversationsScreen> {
  final _repo = ChatRepository();
  List<ConversationItem> _items = [];
  bool _loading = false;
  String? _error;
  StreamSubscription<Map<String, dynamic>>? _wsSub;

  @override
  void initState() {
    super.initState();
    _load();
    // Подписка на WebSocket message:new — при новом сообщении в любой беседе
    // обновляем lastMessage/unread inline без re-fetch всего списка.
    // Заменяет polling каждые 5 сек — экономим трафик и батарею.
    _wsSub = RealtimeService.instance.messageStream.listen(_onWsMessage);
    RealtimeService.instance.connect();
  }

  @override
  void dispose() {
    _wsSub?.cancel();
    super.dispose();
  }

  void _onWsMessage(Map<String, dynamic> data) {
    if (!mounted) return;
    final convId = data['conversationId'] as String?;
    if (convId == null) return;
    final text = data['text'] as String? ?? '';
    final isMine = data['isMine'] as bool? ?? false;
    final createdAtRaw = data['createdAt'] as String?;
    final createdAt = createdAtRaw != null
        ? DateTime.tryParse(createdAtRaw) ?? DateTime.now()
        : DateTime.now();

    setState(() {
      final idx = _items.indexWhere((c) => c.id == convId);
      if (idx >= 0) {
        // Существующая беседа — обновляем lastMessage и инкрементируем unread
        // если сообщение от собеседника.
        final old = _items[idx];
        _items[idx] = ConversationItem(
          id: old.id,
          other: old.other,
          lastMessageText: text,
          lastMessageAt: createdAt,
          lastMessageIsMine: isMine,
          unreadCount: isMine ? old.unreadCount : old.unreadCount + 1,
          createdAt: old.createdAt,
        );
        // Поднимаем беседу наверх списка (последняя активность)
        if (idx > 0) {
          final updated = _items.removeAt(idx);
          _items.insert(0, updated);
        }
      } else {
        // Новая беседа — нужен полный refetch чтобы получить инфу о собеседнике.
        // Делаем тихо без показа спиннера.
        _silentReload();
      }
    });
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final items = await _repo.listConversations();
      if (!mounted) return;
      setState(() {
        _items = items;
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.toString().replaceFirst('Exception: ', '');
        _loading = false;
      });
    }
  }

  /// Тихий перезапрос без спиннера — для polling. Если упал, не показываем
  /// ошибку, чтобы не моргало.
  Future<void> _silentReload() async {
    if (_loading || !mounted) return;
    try {
      final items = await _repo.listConversations();
      if (!mounted) return;
      setState(() => _items = items);
    } catch (_) {/* polling упал — следующая попытка через 5 сек */}
  }

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context)!;
    return Scaffold(
      appBar: AppBar(
        title: Text(
          l.chatTitle,
          style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 22),
        ),
      ),
      body: RefreshIndicator(
        onRefresh: _load,
        child: _buildBody(),
      ),
    );
  }

  Widget _buildBody() {
    final l = AppLocalizations.of(context)!;
    if (_loading && _items.isEmpty) {
      return const CompactListSkeleton();
    }
    if (_error != null && _items.isEmpty) {
      return ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        children: [
          const SizedBox(height: 120),
          Icon(Icons.error_outline,
              size: 64, color: Theme.of(context).colorScheme.error),
          const SizedBox(height: 12),
          Center(child: Text(_error!)),
          const SizedBox(height: 12),
          Center(
            child: FilledButton.tonal(
              onPressed: _load,
              child: Text(l.commonRetry),
            ),
          ),
        ],
      );
    }
    if (_items.isEmpty) {
      return const _EmptyChats();
    }
    return ListView.separated(
      itemCount: _items.length,
      separatorBuilder: (_, __) => const Divider(height: 1, indent: 76),
      itemBuilder: (_, i) => _ConversationTile(
        item: _items[i],
        onTap: () async {
          await Navigator.of(context).push(
            MaterialPageRoute(
              builder: (_) => ConversationScreen(
                conversationId: _items[i].id,
                partnerName: _items[i].other.name,
                partnerType: _items[i].other.type,
              ),
            ),
          );
          // После возврата — перезапрос, чтобы сбросить unread в списке
          await _load();
        },
      ),
    );
  }
}

class _ConversationTile extends StatelessWidget {
  const _ConversationTile({required this.item, required this.onTap});
  final ConversationItem item;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final l = AppLocalizations.of(context)!;
    final isFactory = item.other.type == 'factory';
    final initial = item.other.name.isNotEmpty
        ? item.other.name[0].toUpperCase()
        : '?';
    final lastText = item.lastMessageText ?? l.chatNoMessagesShort;
    return ListTile(
      onTap: onTap,
      leading: CircleAvatar(
        radius: 24,
        backgroundColor: isFactory
            ? scheme.tertiaryContainer
            : scheme.secondaryContainer,
        child: Text(
          initial,
          style: TextStyle(
            fontWeight: FontWeight.w700,
            color: isFactory
                ? scheme.onTertiaryContainer
                : scheme.onSecondaryContainer,
          ),
        ),
      ),
      title: Row(
        children: [
          Expanded(
            child: Text(
              item.other.name,
              style: const TextStyle(fontWeight: FontWeight.w700),
              overflow: TextOverflow.ellipsis,
            ),
          ),
          if (item.lastMessageAt != null)
            Text(
              _formatTime(item.lastMessageAt!, l),
              style: Theme.of(context).textTheme.bodySmall?.copyWith(
                    color: scheme.onSurfaceVariant,
                  ),
            ),
        ],
      ),
      subtitle: Row(
        children: [
          if (item.lastMessageIsMine)
            Padding(
              padding: const EdgeInsets.only(right: 4),
              child: Text(
                l.chatYouPrefix,
                style: Theme.of(context).textTheme.bodySmall?.copyWith(
                      color: scheme.onSurfaceVariant,
                    ),
              ),
            ),
          Expanded(
            child: Text(
              lastText,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: Theme.of(context).textTheme.bodySmall?.copyWith(
                    color: item.unreadCount > 0
                        ? scheme.onSurface
                        : scheme.onSurfaceVariant,
                    fontWeight: item.unreadCount > 0
                        ? FontWeight.w600
                        : FontWeight.normal,
                  ),
            ),
          ),
          if (item.unreadCount > 0) ...[
            const SizedBox(width: 8),
            Container(
              padding: const EdgeInsets.symmetric(
                  horizontal: 8, vertical: 2),
              decoration: BoxDecoration(
                color: scheme.primary,
                borderRadius: BorderRadius.circular(12),
              ),
              constraints: const BoxConstraints(minWidth: 20),
              child: Text(
                '${item.unreadCount}',
                textAlign: TextAlign.center,
                style: TextStyle(
                  color: scheme.onPrimary,
                  fontSize: 11,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }

  String _formatTime(DateTime dt, AppLocalizations l) {
    final now = DateTime.now();
    final diff = now.difference(dt);
    if (diff.inMinutes < 1) return l.chatTimeNow;
    if (diff.inHours < 1) return l.chatTimeMinutesShort(diff.inMinutes);
    if (now.year == dt.year &&
        now.month == dt.month &&
        now.day == dt.day) {
      return '${dt.hour.toString().padLeft(2, '0')}:'
          '${dt.minute.toString().padLeft(2, '0')}';
    }
    if (diff.inDays < 7) return l.chatTimeDaysShort(diff.inDays);
    return '${dt.day.toString().padLeft(2, '0')}.'
        '${dt.month.toString().padLeft(2, '0')}';
  }
}

class _EmptyChats extends StatelessWidget {
  const _EmptyChats();
  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final l = AppLocalizations.of(context)!;
    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      children: [
        const SizedBox(height: 120),
        Icon(Icons.chat_bubble_outline,
            size: 96, color: scheme.onSurfaceVariant),
        const SizedBox(height: 16),
        Text(
          l.chatNoChats,
          textAlign: TextAlign.center,
          style: Theme.of(context).textTheme.headlineSmall,
        ),
        const SizedBox(height: 8),
        Text(
          l.chatNoChatsHint,
          textAlign: TextAlign.center,
          style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                color: scheme.onSurfaceVariant,
              ),
        ),
      ],
    );
  }
}
