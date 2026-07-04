import 'dart:async';
import 'package:flutter/material.dart';
import '../../../core/realtime/realtime_service.dart';
import '../../../l10n/app_localizations.dart';
import '../../call/presentation/call_screen.dart';
import '../data/chat_repository.dart';

/// Экран отдельной беседы. Открывается:
///   1. Из списка чатов (вкладка «Чаты»)
///   2. По кнопке «Написать заводу» с детального экрана поста
///
/// Polling: каждые 3 секунды дёргаем GET /messages чтобы подтянуть новые
/// сообщения от собеседника. В prod заменим на WebSocket (Blueprint §стек).
class ConversationScreen extends StatefulWidget {
  const ConversationScreen({
    super.key,
    required this.conversationId,
    required this.partnerName,
    this.partnerType,
  });

  final String conversationId;
  final String partnerName;
  final String? partnerType; // 'buyer' | 'factory' — для бейджа

  @override
  State<ConversationScreen> createState() => _ConversationScreenState();
}

class _ConversationScreenState extends State<ConversationScreen> {
  final _repo = ChatRepository();
  final _textController = TextEditingController();
  final _scrollController = ScrollController();

  final List<ChatMessage> _messages = []; // храним в порядке DESC (новые в начале)
  String? _olderCursor;
  bool _hasMoreOlder = true;
  bool _loadingInitial = false;
  bool _loadingMore = false;
  bool _sending = false;
  String? _error;
  StreamSubscription<Map<String, dynamic>>? _wsSub;

  @override
  void initState() {
    super.initState();
    _loadInitial();
    _scrollController.addListener(_onScroll);
    // Подписка на WebSocket: слушаем message:new и фильтруем по conversationId.
    // Это заменяет polling на real-time push.
    _wsSub = RealtimeService.instance.messageStream.listen(_onWsMessage);
    // На всякий случай убеждаемся что WS подключён (если юзер зашёл на экран
    // через push-нотификацию сразу после старта приложения).
    RealtimeService.instance.connect();
  }

  @override
  void dispose() {
    _wsSub?.cancel();
    _textController.dispose();
    _scrollController.dispose();
    super.dispose();
  }

  void _onWsMessage(Map<String, dynamic> data) {
    if (!mounted) return;
    final convId = data['conversationId'] as String?;
    if (convId != widget.conversationId) return;
    final id = data['id'] as String?;
    if (id == null) return;
    // Защита от дубликатов (могут прийти и от своего emit'а и от чужого)
    if (_messages.any((m) => m.id == id)) return;
    final isMine = data['isMine'] as bool? ?? false;
    setState(() {
      _messages.insert(
        0,
        ChatMessage(
          id: id,
          text: data['text'] as String? ?? '',
          createdAt: DateTime.tryParse(data['createdAt'] as String? ?? '') ??
              DateTime.now(),
          isMine: isMine,
          readAt: data['readAt'] != null
              ? DateTime.tryParse(data['readAt'] as String)
              : null,
        ),
      );
    });
    // Юзер находится на экране беседы → сразу помечаем чужое сообщение
    // как прочитанное. Это нужно чтобы badge на колокольчике и unread-counter
    // в списке бесед обнулились без задержки.
    if (!isMine) {
      // ignore: unawaited_futures
      _repo.markAsRead(widget.conversationId);
    }
  }

  void _onScroll() {
    // Обратный список: maxScrollExtent — это «верх» в DESC порядке, т.е. старые
    if (_scrollController.position.pixels >=
        _scrollController.position.maxScrollExtent - 200) {
      if (!_loadingMore && _hasMoreOlder) _loadOlder();
    }
  }

  Future<void> _loadInitial() async {
    setState(() {
      _loadingInitial = true;
      _error = null;
    });
    try {
      final page = await _repo.loadMessages(widget.conversationId);
      if (!mounted) return;
      setState(() {
        _messages
          ..clear()
          ..addAll(page.items);
        _olderCursor = page.nextCursor;
        _hasMoreOlder = page.hasMore;
        _loadingInitial = false;
      });
      // Помечаем все непрочитанные как прочитанные при открытии экрана.
      // Best-effort — если упало, не страшно (исчезнет при следующем заходе).
      // ignore: unawaited_futures
      _repo.markAsRead(widget.conversationId);
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.toString().replaceFirst('Exception: ', '');
        _loadingInitial = false;
      });
    }
  }

  Future<void> _loadOlder() async {
    if (_loadingMore || !_hasMoreOlder) return;
    setState(() => _loadingMore = true);
    try {
      final page = await _repo.loadMessages(
        widget.conversationId,
        cursor: _olderCursor,
      );
      if (!mounted) return;
      setState(() {
        _messages.addAll(page.items);
        _olderCursor = page.nextCursor;
        _hasMoreOlder = page.hasMore;
        _loadingMore = false;
      });
    } catch (_) {
      if (mounted) setState(() => _loadingMore = false);
    }
  }


  Future<void> _send() async {
    final text = _textController.text.trim();
    if (text.isEmpty || _sending) return;
    setState(() => _sending = true);
    try {
      final msg = await _repo.sendMessage(widget.conversationId, text);
      if (!mounted) return;
      setState(() {
        // Защита от дублей: WebSocket мог уже вставить это сообщение
        // пока ждали API response (race condition).
        if (!_messages.any((m) => m.id == msg.id)) {
          _messages.insert(0, msg);
        }
        _textController.clear();
      });
      // Скроллим вниз (т.к. список reverse — это означает 0)
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (_scrollController.hasClients) {
          _scrollController.animateTo(
            0,
            duration: const Duration(milliseconds: 200),
            curve: Curves.easeOut,
          );
        }
      });
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(e.toString().replaceFirst('Exception: ', '')),
        ),
      );
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final l = AppLocalizations.of(context)!;
    final isFactory = widget.partnerType == 'factory';
    return Scaffold(
      appBar: AppBar(
        titleSpacing: 0,
        title: Row(
          children: [
            CircleAvatar(
              radius: 18,
              backgroundColor: isFactory
                  ? scheme.tertiaryContainer
                  : scheme.secondaryContainer,
              child: Text(
                widget.partnerName.isNotEmpty
                    ? widget.partnerName[0].toUpperCase()
                    : '?',
                style: TextStyle(
                  fontWeight: FontWeight.w700,
                  color: isFactory
                      ? scheme.onTertiaryContainer
                      : scheme.onSecondaryContainer,
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
                    widget.partnerName,
                    style: const TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.w700,
                    ),
                    overflow: TextOverflow.ellipsis,
                  ),
                  Text(
                    isFactory ? l.chatPartnerFactory : l.chatPartnerBuyer,
                    style: Theme.of(context).textTheme.bodySmall?.copyWith(
                          color: scheme.onSurfaceVariant,
                        ),
                  ),
                ],
              ),
            ),
          ],
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.videocam),
            tooltip: 'Видеозвонок',
            onPressed: () {
              Navigator.of(context).push(
                MaterialPageRoute(
                  builder: (_) => CallScreen(
                    conversationId: widget.conversationId,
                    partnerName: widget.partnerName,
                    isIncoming: false,
                  ),
                ),
              );
            },
          ),
        ],
      ),
      body: Column(
        children: [
          Expanded(child: _buildMessagesList()),
          _buildInputBar(),
        ],
      ),
    );
  }

  Widget _buildMessagesList() {
    if (_loadingInitial) {
      return const Center(child: CircularProgressIndicator());
    }
    if (_error != null && _messages.isEmpty) {
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
                onPressed: _loadInitial,
                child: Text(AppLocalizations.of(context)!.commonRetry),
              ),
            ],
          ),
        ),
      );
    }
    if (_messages.isEmpty) {
      return _buildEmptyState();
    }
    return ListView.builder(
      controller: _scrollController,
      reverse: true, // новые сверху в логике, но снизу визуально
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      itemCount: _messages.length + (_hasMoreOlder ? 1 : 0),
      itemBuilder: (_, i) {
        if (i >= _messages.length) {
          return const Padding(
            padding: EdgeInsets.all(16),
            child: Center(child: CircularProgressIndicator()),
          );
        }
        final msg = _messages[i];
        return _MessageBubble(message: msg);
      },
    );
  }

  Widget _buildEmptyState() {
    final scheme = Theme.of(context).colorScheme;
    final l = AppLocalizations.of(context)!;
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.chat_bubble_outline,
                size: 64, color: scheme.onSurfaceVariant),
            const SizedBox(height: 12),
            Text(
              l.chatNoMessages,
              style: Theme.of(context).textTheme.titleMedium,
            ),
            const SizedBox(height: 4),
            Text(
              l.chatStartHint,
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.bodySmall?.copyWith(
                    color: scheme.onSurfaceVariant,
                  ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildInputBar() {
    final scheme = Theme.of(context).colorScheme;
    final l = AppLocalizations.of(context)!;
    return Container(
      decoration: BoxDecoration(
        border: Border(top: BorderSide(color: scheme.outlineVariant)),
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
                    hintText: l.chatInputHint,
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
    );
  }
}

class _MessageBubble extends StatelessWidget {
  const _MessageBubble({required this.message});
  final ChatMessage message;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final isMine = message.isMine;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 3),
      child: Row(
        mainAxisAlignment:
            isMine ? MainAxisAlignment.end : MainAxisAlignment.start,
        children: [
          ConstrainedBox(
            constraints: BoxConstraints(
              maxWidth: MediaQuery.of(context).size.width * 0.75,
            ),
            child: Container(
              padding:
                  const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              decoration: BoxDecoration(
                color: isMine
                    ? scheme.primaryContainer
                    : scheme.surfaceContainerHighest,
                borderRadius: BorderRadius.only(
                  topLeft: const Radius.circular(16),
                  topRight: const Radius.circular(16),
                  bottomLeft: Radius.circular(isMine ? 16 : 4),
                  bottomRight: Radius.circular(isMine ? 4 : 16),
                ),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    message.text,
                    style: TextStyle(
                      color: isMine
                          ? scheme.onPrimaryContainer
                          : scheme.onSurface,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(
                        _formatTime(message.createdAt),
                        style: TextStyle(
                          fontSize: 11,
                          color: isMine
                              ? scheme.onPrimaryContainer
                                  .withValues(alpha: 0.7)
                              : scheme.onSurfaceVariant,
                        ),
                      ),
                      // Галочки прочтения для своих сообщений
                      if (isMine) ...[
                        const SizedBox(width: 4),
                        Icon(
                          message.readAt != null
                              ? Icons.done_all
                              : Icons.done,
                          size: 14,
                          color: message.readAt != null
                              ? Colors.blue
                              : scheme.onPrimaryContainer
                                  .withValues(alpha: 0.7),
                        ),
                      ],
                    ],
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  String _formatTime(DateTime dt) {
    return '${dt.hour.toString().padLeft(2, '0')}:'
        '${dt.minute.toString().padLeft(2, '0')}';
  }
}
