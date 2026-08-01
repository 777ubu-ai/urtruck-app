import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'app/main_shell.dart';
import 'app/theme.dart';
import 'core/currency/currency_repository.dart';
import 'core/i18n/locale_notifier.dart';
import 'core/theme/theme_notifier.dart';
import 'core/realtime/realtime_service.dart';
import 'core/storage/auth_storage.dart';
import 'features/auth/presentation/phone_screen.dart';
import 'features/onboarding/presentation/onboarding_screen.dart';
import 'features/profile/data/profile_repository.dart';
import 'features/push/services/push_service.dart';
import 'l10n/app_localizations.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  // VAPID key для web push. Передавать через --dart-define, иначе на web
  // FCM не сможет получить токен. Без этого ключа push на web disabled,
  // на мобильных работает без него.
  const vapidKey = String.fromEnvironment('PUSH_VAPID_KEY');
  if (vapidKey.isNotEmpty) {
    PushService.instance.setWebVapidKey(vapidKey);
  }
  // Инициализируем Firebase до runApp. Если firebase_options.dart не настроен
  // (placeholder) — функция тихо выходит, приложение продолжает работать
  // без push.
  await PushService.instance.initFirebase();
  // Подгружаем курсы валют. Не блокируем — если backend упал, fetch упадёт
  // тихо, UI не покажет конвертацию (как до этой фичи). Запускаем без await,
  // чтобы splash не висел на cold start.
  // ignore: unawaited_futures
  CurrencyRepository.instance.load();
  runApp(const SourceHubApp());
}

class SourceHubApp extends StatelessWidget {
  const SourceHubApp({super.key});

  @override
  Widget build(BuildContext context) {
    // Перерисовываем всё дерево когда LocaleNotifier меняется — это даёт
    // hot-switch языка без перезапуска приложения. ValueListenableBuilder
    // подписывается на ValueNotifier<Locale> и rebuild'ит MaterialApp с
    // новым `locale`, что триггерит regenerate всех `AppLocalizations.of`.
    return ValueListenableBuilder<Locale>(
      valueListenable: LocaleNotifier.instance,
      builder: (_, locale, __) {
        return ValueListenableBuilder<ThemeMode>(
          valueListenable: ThemeNotifier.instance,
          builder: (_, themeMode, __) {
            return MaterialApp(
              title: 'SourceHub',
              debugShowCheckedModeBanner: false,
              theme: SourceHubTheme.light(),
              darkTheme: SourceHubTheme.dark(),
              themeMode: themeMode,
              locale: locale,
              supportedLocales: LocaleNotifier.supportedLocales,
              localizationsDelegates: const [
                AppLocalizations.delegate,
                GlobalMaterialLocalizations.delegate,
                GlobalWidgetsLocalizations.delegate,
                GlobalCupertinoLocalizations.delegate,
              ],
              home: const _AuthGate(),
            );
          },
        );
      },
    );
  }
}

/// Проверяет сессию при старте и отправляет на ленту или на экран телефона.
class _AuthGate extends StatefulWidget {
  const _AuthGate();

  @override
  State<_AuthGate> createState() => _AuthGateState();
}

class _AuthGateState extends State<_AuthGate> {
  bool? _hasSession;
  bool _onboardingDone = false;

  @override
  void initState() {
    super.initState();
    _check();
  }

  Future<void> _check() async {
    bool has;
    bool onboardingDone;
    try {
      has = await AuthStorage.instance.hasSession();
      onboardingDone = await AuthStorage.instance.isOnboardingCompleted();
    } catch (_) {
      // Если storage упал — считаем что сессии нет, чтоб не зависнуть на splash.
      has = false;
      onboardingDone = false;
    }
    if (!mounted) return;
    setState(() {
      _hasSession = has;
      _onboardingDone = onboardingDone;
    });
    // Если есть сессия — сразу поднимаем WebSocket для real-time обновлений
    // (новые сообщения + push уведомления на колокольчик).
    if (has) {
      RealtimeService.instance.connect();
      // Активируем FCM для уже залогиненного юзера. Это безопасно
      // вызывать даже если Firebase не настроен — внутри есть guard.
      // Не await — не блокируем UI на разрешении нотификаций.
      // ignore: unawaited_futures
      PushService.instance.activateForUser();
      // Подтягиваем профиль чтобы установить локаль/валюту в синглтоны.
      // Best-effort: если упало, остаёмся с дефолтным русским языком.
      // ignore: unawaited_futures
      ProfileRepository().loadMe().then((profile) {
        LocaleNotifier.instance.setFromCode(profile.language);
      }).catchError((_) {});
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_hasSession == null) {
      return const Scaffold(
        body: Center(child: CircularProgressIndicator()),
      );
    }
    if (_hasSession!) {
      return const MainShell();
    }
    // Не залогинены — показываем onboarding если ещё не проходили,
    // иначе сразу phone screen.
    return _onboardingDone ? const PhoneScreen() : const OnboardingScreen();
  }
}
