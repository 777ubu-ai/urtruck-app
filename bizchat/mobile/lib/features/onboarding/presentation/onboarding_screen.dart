import 'package:flutter/material.dart';
import '../../../core/storage/auth_storage.dart';
import '../../../l10n/app_localizations.dart';
import '../../auth/presentation/phone_screen.dart';

/// Welcome onboarding — 4 слайда, показываются один раз для нового
/// пользователя. Флаг `onboardingDone` сохраняется в `AuthStorage`,
/// проверяется в `_AuthGate` (см. main.dart). После «Skip» или «Get started»
/// сразу переходим на `PhoneScreen`.
///
/// Дизайн: PageView с big icon + bold title + subtitle. Кнопка «Skip»
/// в правом верхнем углу. PageIndicator снизу. На последней странице
/// «Skip» меняется на «Get started».
class OnboardingScreen extends StatefulWidget {
  const OnboardingScreen({super.key});

  @override
  State<OnboardingScreen> createState() => _OnboardingScreenState();
}

class _OnboardingScreenState extends State<OnboardingScreen> {
  final _controller = PageController();
  int _page = 0;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<void> _finish() async {
    await AuthStorage.instance.markOnboardingCompleted();
    if (!mounted) return;
    Navigator.of(context).pushReplacement(
      PageRouteBuilder(
        pageBuilder: (_, __, ___) => const PhoneScreen(),
        transitionsBuilder: (_, animation, __, child) {
          return FadeTransition(opacity: animation, child: child);
        },
        transitionDuration: const Duration(milliseconds: 350),
      ),
    );
  }

  void _next() {
    if (_page < _slides.length - 1) {
      _controller.nextPage(
        duration: const Duration(milliseconds: 350),
        curve: Curves.easeOutCubic,
      );
    } else {
      _finish();
    }
  }

  late final List<_OnboardingSlide> _slides = [
    _OnboardingSlide(
      icon: Icons.factory_outlined,
      colors: const [Color(0xFFFFA000), Color(0xFFFF6D00)],
    ),
    _OnboardingSlide(
      icon: Icons.handshake_outlined,
      colors: const [Color(0xFFE91E63), Color(0xFF9C27B0)],
    ),
    _OnboardingSlide(
      icon: Icons.chat_bubble_outline_rounded,
      colors: const [Color(0xFF2196F3), Color(0xFF00BCD4)],
    ),
    _OnboardingSlide(
      icon: Icons.rocket_launch_outlined,
      colors: const [Color(0xFF4CAF50), Color(0xFF00BCD4)],
    ),
  ];

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context)!;
    final titles = <String>[
      l.onboardingTitle1,
      l.onboardingTitle2,
      l.onboardingTitle3,
      l.onboardingTitle4,
    ];
    final subtitles = <String>[
      l.onboardingSubtitle1,
      l.onboardingSubtitle2,
      l.onboardingSubtitle3,
      l.onboardingSubtitle4,
    ];
    final isLast = _page == _slides.length - 1;

    return Scaffold(
      body: SafeArea(
        child: Column(
          children: [
            // Skip кнопка справа сверху
            Align(
              alignment: Alignment.topRight,
              child: Padding(
                padding: const EdgeInsets.all(8),
                child: TextButton(
                  onPressed: _finish,
                  child: Text(l.onboardingSkip),
                ),
              ),
            ),
            // PageView
            Expanded(
              child: PageView.builder(
                controller: _controller,
                onPageChanged: (i) => setState(() => _page = i),
                itemCount: _slides.length,
                itemBuilder: (_, i) {
                  return _SlideView(
                    slide: _slides[i],
                    title: titles[i],
                    subtitle: subtitles[i],
                  );
                },
              ),
            ),
            // Page indicators
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 16),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: List.generate(
                  _slides.length,
                  (i) => AnimatedContainer(
                    duration: const Duration(milliseconds: 300),
                    margin: const EdgeInsets.symmetric(horizontal: 4),
                    width: _page == i ? 28 : 8,
                    height: 8,
                    decoration: BoxDecoration(
                      borderRadius: BorderRadius.circular(4),
                      color: _page == i
                          ? Theme.of(context).colorScheme.primary
                          : Theme.of(context)
                              .colorScheme
                              .onSurface
                              .withValues(alpha: 0.2),
                    ),
                  ),
                ),
              ),
            ),
            // Next / Get started кнопка
            Padding(
              padding: const EdgeInsets.fromLTRB(24, 0, 24, 32),
              child: SizedBox(
                width: double.infinity,
                child: FilledButton(
                  onPressed: _next,
                  style: FilledButton.styleFrom(
                    minimumSize: const Size.fromHeight(56),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(16),
                    ),
                  ),
                  child: AnimatedSwitcher(
                    duration: const Duration(milliseconds: 300),
                    child: Text(
                      isLast ? l.onboardingGetStarted : l.onboardingNext,
                      key: ValueKey<bool>(isLast),
                      style: const TextStyle(
                          fontSize: 17, fontWeight: FontWeight.w600),
                    ),
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _OnboardingSlide {
  const _OnboardingSlide({required this.icon, required this.colors});
  final IconData icon;
  final List<Color> colors;
}

class _SlideView extends StatelessWidget {
  const _SlideView({
    required this.slide,
    required this.title,
    required this.subtitle,
  });

  final _OnboardingSlide slide;
  final String title;
  final String subtitle;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 32),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          // Иконка в круге с градиентом и тенью — современный «glass» look
          Container(
            width: 180,
            height: 180,
            decoration: BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
                colors: slide.colors,
              ),
              shape: BoxShape.circle,
              boxShadow: [
                BoxShadow(
                  color: slide.colors.last.withValues(alpha: 0.35),
                  blurRadius: 32,
                  offset: const Offset(0, 16),
                ),
              ],
            ),
            child: Icon(
              slide.icon,
              size: 96,
              color: Colors.white,
            ),
          ),
          const SizedBox(height: 48),
          Text(
            title,
            textAlign: TextAlign.center,
            style: Theme.of(context).textTheme.headlineMedium?.copyWith(
                  fontWeight: FontWeight.w700,
                  height: 1.2,
                ),
          ),
          const SizedBox(height: 16),
          Text(
            subtitle,
            textAlign: TextAlign.center,
            style: Theme.of(context).textTheme.bodyLarge?.copyWith(
                  color: Theme.of(context).colorScheme.onSurfaceVariant,
                  height: 1.5,
                ),
          ),
        ],
      ),
    );
  }
}
