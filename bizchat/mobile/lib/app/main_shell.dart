import 'dart:async';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/material.dart';
import '../core/realtime/realtime_service.dart';
import '../features/chat/data/chat_repository.dart';
import '../features/chat/presentation/conversations_screen.dart';
import '../features/create_post/presentation/create_post_screen.dart';
import '../features/feed/presentation/feed_screen.dart';
import '../features/notifications/presentation/notifications_screen.dart';
import '../features/profile/presentation/profile_screen.dart';
import '../features/search/presentation/search_screen.dart';
import '../firebase_options.dart';
import '../l10n/app_localizations.dart';

/// Главный shell после авторизации.
///
/// `IndexedStack` сохраняет состояние каждой вкладки между переключениями
/// (Blueprint §1.1: «не теряем позицию в ленте при переходе в профиль»).
/// 5 вкладок согласно Blueprint:
///   🏠 Главная (лента) — реализована
///   🔍 Поиск — реализован (по хэштегам, title, description)
///   ➕ Создать — реализован (форма + upload фото)
///   💬 Чаты — заглушка (Фаза 1, Direct)
///   👤 Профиль — реализован
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
      // Открываем вкладку чатов (index=4 после добавления Hot Deals tab).
      setState(() => _index = 4);
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
    super.dispose();
  }

  /// После публикации нового поста: переключаемся на ленту и принудительно
  /// пересоздаём её через смену ключа — это чище, чем прокидывать стрим/колбэк
  /// через несколько слоёв.
  void _onPostCreated() {
    setState(() {
      _feedKey = UniqueKey();
      _index = 0; // вкладка «Главная»
    });
  }

  @override
  Widget build(BuildContext context) {
    // Собираем вкладки здесь, а не в const static — потому что FeedScreen
    // получает динамический key и CreatePostScreen получает колбэк.
    final tabs = <Widget>[
      FeedScreen(key: _feedKey),
      const FeedScreen(
        initialFilter: 'hot_deal',
        hideFilterTabs: true,
      ),
      const SearchScreen(),
      CreatePostScreen(onPostCreated: _onPostCreated),
      const ConversationsScreen(),
      const ProfileScreen(),
    ];

    final l = AppLocalizations.of(context)!;
    return Scaffold(
      body: IndexedStack(index: _index, children: tabs),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _index,
        onDestinationSelected: (i) => setState(() => _index = i),
        destinations: [
          NavigationDestination(
            icon: const Icon(Icons.home_outlined),
            selectedIcon: const Icon(Icons.home),
            label: l.navHome,
          ),
          const NavigationDestination(
            icon: Icon(Icons.local_fire_department_outlined),
            selectedIcon: Icon(Icons.local_fire_department, color: Colors.red),
            label: 'Акции',
          ),
          NavigationDestination(
            icon: const Icon(Icons.search_outlined),
            selectedIcon: const Icon(Icons.search),
            label: l.navSearch,
          ),
          NavigationDestination(
            icon: const Icon(Icons.add_box_outlined),
            selectedIcon: const Icon(Icons.add_box),
            label: l.navCreate,
          ),
          NavigationDestination(
            icon: _ChatsIconWithBadge(
              icon: Icons.chat_bubble_outline,
              unread: _unreadChats,
            ),
            selectedIcon: _ChatsIconWithBadge(
              icon: Icons.chat_bubble,
              unread: _unreadChats,
            ),
            label: l.navChats,
          ),
          NavigationDestination(
            icon: const Icon(Icons.person_outline),
            selectedIcon: const Icon(Icons.person),
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

