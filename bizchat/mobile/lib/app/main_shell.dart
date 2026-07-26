import 'dart:async';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/material.dart';
import '../core/events/post_events.dart';
import '../core/realtime/realtime_service.dart';
import '../features/chat/data/chat_repository.dart';
import '../features/chat/presentation/conversations_screen.dart';
import '../features/feed/presentation/feed_screen.dart';
import '../features/notifications/presentation/notifications_screen.dart';
import '../features/profile/presentation/profile_screen.dart';
import '../features/search/presentation/search_screen.dart';
import '../firebase_options.dart';
import '../l10n/app_localizations.dart';

/// Главный shell после авторизации.
///
/// `IndexedStack` сохраняет состояние каждой вкладки между переключениями —
/// позиция в ленте не теряется при переходе в профиль.
///
/// Вкладки:
///   0 🏠 Лента
///   1 🔥 Акции
///   2 🔍 Поиск
///   3 💬 Чаты
///   4 👤 Профиль
///
/// Кнопки «Создать» внизу НЕТ: публикация и история создаются «плюсом» в
/// левом верхнем углу профиля, как в соцсетях. Нижнее меню — только
/// навигация по разделам, без действий.
class MainShell extends StatefulWidget {
  const MainShell({super.key});

  @override
  State<MainShell> createState() => _MainShellState();
}

class _MainShellState extends State<MainShell> {
  int _index = 0;
  // Ключ для FeedScreen — когда меняем, ListView пересоздаётся с нуля
  // и тянет свежую ленту. Используется после публикации нового поста,
  // чтобы пользователь сразу увидел свой пост первым.
  Key _feedKey = UniqueKey();

  StreamSubscription<RemoteMessage>? _onMessageSub;
  StreamSubscription<RemoteMessage>? _onMessageOpenedSub;
  StreamSubscription<Map<String, dynamic>>? _msgWsSub;
  Timer? _chatBadgePoll;
  int _unreadChats = 0;

  @override
  void initState() {
    super.initState();
    _setupPushListeners();
    _setupChatBadge();
    PostEvents.instance.addListener(_onPostCreated);
  }

  /// S2-04: badge на иконке Чатов в bottom navigation — число непрочитанных.
  /// Polling /conversations/unread-count каждые 15 сек + WS для мгновенного
  /// инкремента при приходе message:new.
  void _setupChatBadge() {
    _refreshChatBadge();
    _chatBadgePoll =
        Timer.periodic(const Duration(seconds: 15), (_) => _refreshChatBadge());
    _msgWsSub = RealtimeService.instance.messageStream.listen((data) {
      if (data['_type'] != null) return; // call-events игнорируем
      if (mounted) setState(() => _unreadChats += 1);
    });
  }

  Future<void> _refreshChatBadge() async {
    if (!mounted) return;
    try {
      final count = await ChatRepository().getTotalUnreadCount();
      if (!mounted) return;
      if (count != _unreadChats) setState(() => _unreadChats = count);
    } catch (_) {/* игнорируем сетевые ошибки */}
  }

  /// Подписка на FCM-события. Если Firebase не настроен (placeholder
  /// firebase_options.dart) — мы вообще не трогаем `FirebaseMessaging.instance`,
  /// иначе будет exception. Это безопасный no-op для dev-сборок.
  void _setupPushListeners() {
    if (!DefaultFirebaseOptions.isConfigured) return;
    try {
      _onMessageSub = FirebaseMessaging.onMessage.listen(_onForegroundMessage);
      _onMessageOpenedSub =
          FirebaseMessaging.onMessageOpenedApp.listen(_onMessageOpened);
    } catch (e) {
      debugPrint('[MainShell] FCM listeners setup failed: $e');
    }
  }

  /// Пуш пришёл когда приложение открыто (foreground). Системного баннера
  /// тут не будет (так задумано FCM), показываем in-app SnackBar с CTA.
  void _onForegroundMessage(RemoteMessage message) {
    if (!mounted) return;
    final notification = message.notification;
    final title = notification?.title ?? 'Уведомление';
    final body = notification?.body ?? '';
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(title,
                style: const TextStyle(fontWeight: FontWeight.w700)),
            if (body.isNotEmpty) Text(body),
          ],
        ),
        action: SnackBarAction(
          label: 'Открыть',
          onPressed: () => _navigateForMessage(message),
        ),
        duration: const Duration(seconds: 4),
      ),
    );
  }

  /// Юзер тапнул системный баннер — приложение восстановилось из background.
  /// Сразу навигируем в нужное место.
  void _onMessageOpened(RemoteMessage message) {
    _navigateForMessage(message);
  }

  /// Deep link на основе data-payload'а. Бэк кладёт `type`/`postId`/
  /// `conversationId` — мы открываем соответствующий экран.
  void _navigateForMessage(RemoteMessage message) {
    if (!mounted) return;
    final data = message.data;
    final type = data['type'] as String?;
    if (type == 'message') {
      // Вкладка чатов. Индекс 3 — после удаления кнопки «Создать» из
      // нижнего меню вкладки сдвинулись на одну влево.
      setState(() => _index = 3);
    } else if (type == 'like' || type == 'comment') {
      // На уведомления о лайках/комментах — открываем экран нотификаций.
      Navigator.of(context).push(
        MaterialPageRoute(
          builder: (_) => const NotificationsScreen(),
        ),
      );
    }
  }

  @override
  void dispose() {
    _onMessageSub?.cancel();
    _onMessageOpenedSub?.cancel();
    _msgWsSub?.cancel();
    _chatBadgePoll?.cancel();
    PostEvents.instance.removeListener(_onPostCreated);
    super.dispose();
  }

  /// Пришло событие о публикации: пересоздаём ленту сменой ключа, чтобы
  /// новый товар оказался в ней сразу. Вкладку НЕ переключаем — форму
  /// открывают из профиля, и выкидывать пользователя из профиля некорректно.
  void _onPostCreated() {
    if (!mounted) return;
    setState(() => _feedKey = UniqueKey());
  }

  @override
  Widget build(BuildContext context) {
    // Собираем вкладки здесь, а не в const static — FeedScreen получает
    // динамический key, чтобы после публикации лента пересоздалась.
    final tabs = <Widget>[
      FeedScreen(key: _feedKey),
      const FeedScreen(
        initialFilter: 'hot_deal',
        hideFilterTabs: true,
      ),
      const SearchScreen(),
      const ConversationsScreen(),
      const ProfileScreen(),
    ];

    final l = AppLocalizations.of(context)!;
    return Scaffold(
      body: IndexedStack(index: _index, children: tabs),
      // Нижнее меню в духе соцсетей: только иконки, без подписей —
      // экран не загромождён, контент занимает больше места.
      bottomNavigationBar: NavigationBar(
        selectedIndex: _index,
        onDestinationSelected: (i) => setState(() => _index = i),
        height: 58,
        labelBehavior: NavigationDestinationLabelBehavior.alwaysHide,
        destinations: [
          NavigationDestination(
            icon: const Icon(Icons.home_outlined, size: 26),
            selectedIcon: const Icon(Icons.home_rounded, size: 26),
            label: l.navHome,
          ),
          const NavigationDestination(
            icon: Icon(Icons.local_fire_department_outlined, size: 26),
            selectedIcon: Icon(Icons.local_fire_department_rounded,
                size: 26, color: Color(0xFFFF3040)),
            label: 'Акции',
          ),
          NavigationDestination(
            icon: const Icon(Icons.search_rounded, size: 26),
            selectedIcon: const Icon(Icons.search_rounded, size: 26),
            label: l.navSearch,
          ),
          NavigationDestination(
            icon: _ChatsIconWithBadge(
              icon: Icons.chat_bubble_outline_rounded,
              unread: _unreadChats,
            ),
            selectedIcon: _ChatsIconWithBadge(
              icon: Icons.chat_bubble_rounded,
              unread: _unreadChats,
            ),
            label: l.navChats,
          ),
          NavigationDestination(
            icon: const Icon(Icons.person_outline_rounded, size: 26),
            selectedIcon: const Icon(Icons.person_rounded, size: 26),
            label: l.navProfile,
          ),
        ],
      ),
    );
  }
}

/// Иконка чатов с красным бейджем непрочитанных (S2-04).
class _ChatsIconWithBadge extends StatelessWidget {
  const _ChatsIconWithBadge({required this.icon, required this.unread});
  final IconData icon;
  final int unread;

  @override
  Widget build(BuildContext context) {
    if (unread <= 0) return Icon(icon);
    return Stack(
      clipBehavior: Clip.none,
      children: [
        Icon(icon),
        Positioned(
          top: -4,
          right: -6,
          child: Container(
            padding:
                const EdgeInsets.symmetric(horizontal: 5, vertical: 1),
            constraints: const BoxConstraints(minWidth: 16),
            decoration: BoxDecoration(
              color: Colors.red,
              borderRadius: BorderRadius.circular(8),
              border: Border.all(color: Colors.white, width: 1),
            ),
            child: Text(
              unread > 99 ? '99+' : '$unread',
              textAlign: TextAlign.center,
              style: const TextStyle(
                color: Colors.white,
                fontSize: 10,
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
        ),
      ],
    );
  }
}

