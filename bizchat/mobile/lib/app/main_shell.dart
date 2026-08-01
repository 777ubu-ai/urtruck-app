import 'dart:async';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/material.dart';
import '../core/events/post_events.dart';
import '../features/chat/presentation/conversations_screen.dart';
import '../features/create_post/presentation/create_post_screen.dart';
import '../features/feed/presentation/feed_screen.dart';
import '../features/notifications/presentation/notifications_screen.dart';
import '../features/profile/presentation/profile_screen.dart';
import '../features/profile/presentation/saves_screen.dart';
import '../features/search/presentation/search_screen.dart';
import '../firebase_options.dart';
import '../l10n/app_localizations.dart';

/// Главный shell после авторизации.
///
/// `IndexedStack` сохраняет состояние каждой вкладки между переключениями —
/// позиция в ленте не теряется при переходе в профиль.
///
/// Вкладки — по дизайну руководителя проекта (SourceHub main page):
///   0 🏠 Home
///   1 🔍 Explore
///   2 ➕ Create — центральная зелёная кнопка, открывает поверх экрана
///   3 🔖 Saved
///   4 👤 Profile
///
/// Чаты и уведомления живут в верхней панели главного экрана
/// (иконки-пузырёк и колокольчик), а не в нижнем меню — как в мокапе
/// SourceHub и в Instagram.
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

  @override
  void initState() {
    super.initState();
    _setupPushListeners();
    PostEvents.instance.addListener(_onPostCreated);
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
      // Чаты живут отдельным экраном, доступным иконкой-пузырьком в
      // верхней панели ленты. По пушу открываем их поверх текущего.
      Navigator.of(context).push(
        MaterialPageRoute(
          builder: (_) => const ConversationsScreen(),
        ),
      );
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
    // Create — не полноценная вкладка, а модальный экран поверх текущей.
    // Заменяем его в IndexedStack SizedBox'ом, чтобы у нижнего меню было
    // пять «слотов» в правильном порядке, но при тапе на «+» индекс не
    // менялся — экран открывается через Navigator.push.
    final tabs = <Widget>[
      FeedScreen(key: _feedKey),
      const SearchScreen(),
      const SizedBox.shrink(),
      const SavesScreen(),
      const ProfileScreen(),
    ];

    final l = AppLocalizations.of(context)!;
    final scheme = Theme.of(context).colorScheme;
    return Scaffold(
      body: IndexedStack(index: _index, children: tabs),
      // Нижнее меню строго по мокапу SourceHub: пять пунктов с подписями,
      // подпись активной вкладки — зелёная. «Create» — центральная
      // крупная зелёная кнопка со скругленными углами.
      bottomNavigationBar: NavigationBar(
        selectedIndex: _index,
        onDestinationSelected: _onNavTap,
        height: 72,
        backgroundColor: scheme.surface,
        surfaceTintColor: scheme.surface,
        indicatorColor: Colors.transparent,
        overlayColor: WidgetStateProperty.all(Colors.transparent),
        labelBehavior:
            NavigationDestinationLabelBehavior.onlyShowSelected,
        destinations: [
          NavigationDestination(
            icon: Icon(Icons.home_outlined,
                size: 26, color: scheme.onSurfaceVariant),
            selectedIcon:
                Icon(Icons.home_rounded, size: 26, color: scheme.primary),
            label: l.navHome,
          ),
          NavigationDestination(
            icon: Icon(Icons.search_rounded,
                size: 26, color: scheme.onSurfaceVariant),
            selectedIcon: Icon(Icons.search_rounded,
                size: 26, color: scheme.primary),
            label: l.navExplore,
          ),
          NavigationDestination(
            icon: Container(
              width: 48,
              height: 34,
              alignment: Alignment.center,
              decoration: BoxDecoration(
                color: scheme.primary,
                borderRadius: BorderRadius.circular(10),
              ),
              child:
                  Icon(Icons.add, color: scheme.onPrimary, size: 24),
            ),
            label: l.navCreate,
          ),
          NavigationDestination(
            icon: Icon(Icons.bookmark_outline_rounded,
                size: 26, color: scheme.onSurfaceVariant),
            selectedIcon: Icon(Icons.bookmark_rounded,
                size: 26, color: scheme.primary),
            label: l.navSaved,
          ),
          NavigationDestination(
            icon: Icon(Icons.person_outline_rounded,
                size: 26, color: scheme.onSurfaceVariant),
            selectedIcon: Icon(Icons.person_rounded,
                size: 26, color: scheme.primary),
            label: l.navProfile,
          ),
        ],
      ),
    );
  }

  /// Тап по вкладке нижнего меню. Индекс 2 («+») — не вкладка, а действие:
  /// открываем форму публикации поверх текущего экрана, вкладку не меняем.
  void _onNavTap(int i) {
    if (i == 2) {
      Navigator.of(context).push(
        MaterialPageRoute(
          builder: (_) => CreatePostScreen(onPostCreated: _onPostCreated),
        ),
      );
      return;
    }
    setState(() => _index = i);
  }
}
