import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../../../core/theme/theme_notifier.dart';
import '../../../l10n/app_localizations.dart';
import '../../legal/presentation/legal_screen.dart';
import '../data/profile_repository.dart';

/// Экран настроек. Заглушки для notifications/privacy + блок «О приложении»
/// (версия, контакты). Главное здесь — селектор языка интерфейса с
/// hot-switch (через PATCH /users/me и LocaleNotifier).
class SettingsScreen extends StatefulWidget {
  const SettingsScreen({super.key, required this.profile});
  final MyProfile profile;

  @override
  State<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends State<SettingsScreen> {
  final _repo = ProfileRepository();
  late String _currentLanguage;
  bool _changingLanguage = false;

  // Локальная копия профиля — синхронизируется с серверным состоянием после
  // каждого успешного PATCH. При ошибке делаем rollback к предыдущему снимку.
  late MyProfile _profile;
  // Флаги «идёт запрос» на отдельные категории — блокируют повторные тапы
  // по конкретному toggle, пока PATCH в полёте. Master и granular — независимы.
  bool _pushMasterBusy = false;
  final Set<String> _prefsBusy = <String>{};

  static const _appVersion = '0.1.0 (MVP)';
  static const _supportEmail = 'support@bizchat.app';
  static const _supportedLanguages = ['ru', 'en', 'zh'];

  @override
  void initState() {
    super.initState();
    _currentLanguage = widget.profile.language;
    _profile = widget.profile;
  }

  /// Переключатель master toggle `pushEnabled`. Optimistic: сразу меняем
  /// локальный state, параллельно шлём PATCH. При ошибке откатываем на prev
  /// и показываем SnackBar.
  Future<void> _togglePushMaster(bool newValue) async {
    if (_pushMasterBusy) return;
    final prev = _profile;
    setState(() {
      _profile = _profile.copyWithPushPrefs(pushEnabled: newValue);
      _pushMasterBusy = true;
    });
    try {
      final updated = await _repo.updateMe(pushEnabled: newValue);
      if (!mounted) return;
      setState(() => _profile = updated);
    } catch (e) {
      if (!mounted) return;
      setState(() => _profile = prev);
      final l = AppLocalizations.of(context)!;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(l.settingsPushUpdateError)),
      );
    } finally {
      if (mounted) setState(() => _pushMasterBusy = false);
    }
  }

  /// Переключатель granular preference. `key` — имя поля в
  /// `NotificationPrefs` (likes/comments/messages/reviews/groupBuy).
  /// Шлём partial PATCH — только изменённый ключ.
  Future<void> _togglePref(String key, bool newValue) async {
    if (_prefsBusy.contains(key)) return;
    final prev = _profile;
    final prefs = _profile.notificationPrefs;
    final nextPrefs = switch (key) {
      'likes' => prefs.copyWith(likes: newValue),
      'comments' => prefs.copyWith(comments: newValue),
      'messages' => prefs.copyWith(messages: newValue),
      'reviews' => prefs.copyWith(reviews: newValue),
      'groupBuy' => prefs.copyWith(groupBuy: newValue),
      _ => prefs,
    };
    setState(() {
      _profile = _profile.copyWithPushPrefs(notificationPrefs: nextPrefs);
      _prefsBusy.add(key);
    });
    try {
      final updated = await _repo.updateMe(
        notificationPrefsPatch: {key: newValue},
      );
      if (!mounted) return;
      setState(() => _profile = updated);
    } catch (e) {
      if (!mounted) return;
      setState(() => _profile = prev);
      final l = AppLocalizations.of(context)!;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(l.settingsPushUpdateError)),
      );
    } finally {
      if (mounted) setState(() => _prefsBusy.remove(key));
    }
  }

  Future<void> _changeLanguage(String code) async {
    if (_changingLanguage || code == _currentLanguage) return;
    setState(() {
      _changingLanguage = true;
      _currentLanguage = code; // оптимистично — UI переключается мгновенно
    });
    try {
      // updateMe внутри сам вызовет LocaleNotifier.setFromCode → весь app
      // перерисуется с новой локалью.
      await _repo.updateMe(language: code);
    } catch (e) {
      if (!mounted) return;
      // Откатываем при ошибке
      setState(() => _currentLanguage = widget.profile.language);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(e.toString().replaceFirst('Exception: ', ''))),
      );
    } finally {
      if (mounted) setState(() => _changingLanguage = false);
    }
  }

  String _languageLabel(String code, AppLocalizations l) {
    switch (code) {
      case 'ru':
        return l.settingsLanguageRu;
      case 'en':
        return l.settingsLanguageEn;
      case 'zh':
        return l.settingsLanguageZh;
      default:
        return code.toUpperCase();
    }
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final l = AppLocalizations.of(context)!;
    return Scaffold(
      appBar: AppBar(title: Text(l.settingsTitle)),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          _SectionHeader(l.settingsAccount),
          const SizedBox(height: 8),
          Card(
            child: Column(
              children: [
                ListTile(
                  leading: const Icon(Icons.phone_outlined),
                  title: Text(l.settingsPhone),
                  subtitle: Text(_profile.phone),
                ),
                const Divider(height: 1, indent: 56),
                // Язык — главная новая фича: ChoiceChip-переключатель
                // прямо в одной плитке.
                Padding(
                  padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          const Icon(Icons.language_outlined),
                          const SizedBox(width: 16),
                          Text(
                            l.profileLanguage,
                            style: Theme.of(context).textTheme.bodyLarge,
                          ),
                          const Spacer(),
                          if (_changingLanguage)
                            const SizedBox(
                              width: 16,
                              height: 16,
                              child:
                                  CircularProgressIndicator(strokeWidth: 2),
                            ),
                        ],
                      ),
                      const SizedBox(height: 8),
                      Wrap(
                        spacing: 8,
                        children: _supportedLanguages.map((code) {
                          return ChoiceChip(
                            label: Text(_languageLabel(code, l)),
                            selected: _currentLanguage == code,
                            onSelected: _changingLanguage
                                ? null
                                : (_) => _changeLanguage(code),
                          );
                        }).toList(),
                      ),
                    ],
                  ),
                ),
                const Divider(height: 1, indent: 56),
                ListTile(
                  leading: const Icon(Icons.attach_money),
                  title: Text(l.profileCurrency),
                  subtitle: Text(_profile.currency),
                ),
                // Страна и город переехали сюда из профиля: раньше они
                // дублировались отдельной карточкой над меню, теперь данные
                // аккаунта живут в одном месте.
                if (_profile.countryCode != null &&
                    _profile.countryCode!.isNotEmpty) ...[
                  const Divider(height: 1, indent: 56),
                  ListTile(
                    leading: const Icon(Icons.flag_outlined),
                    title: Text(l.profileCountryLabel),
                    subtitle: Text(_profile.countryCode!),
                  ),
                ],
                if (_profile.city != null && _profile.city!.isNotEmpty) ...[
                  const Divider(height: 1, indent: 56),
                  ListTile(
                    leading: const Icon(Icons.location_city_outlined),
                    title: Text(l.profileCityLabel),
                    subtitle: Text(_profile.city!),
                  ),
                ],
                const Divider(height: 1, indent: 56),
                // Dark/Light/System theme toggle
                Padding(
                  padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          const Icon(Icons.brightness_6_outlined),
                          const SizedBox(width: 16),
                          Text(
                            l.settingsTheme,
                            style: Theme.of(context).textTheme.bodyLarge,
                          ),
                        ],
                      ),
                      const SizedBox(height: 8),
                      ValueListenableBuilder<ThemeMode>(
                        valueListenable: ThemeNotifier.instance,
                        builder: (_, mode, __) {
                          return Wrap(
                            spacing: 8,
                            children: [
                              ChoiceChip(
                                label: Text(l.settingsThemeLight),
                                selected: mode == ThemeMode.light,
                                onSelected: (_) => ThemeNotifier.instance
                                    .setMode(ThemeMode.light),
                              ),
                              ChoiceChip(
                                label: Text(l.settingsThemeDark),
                                selected: mode == ThemeMode.dark,
                                onSelected: (_) => ThemeNotifier.instance
                                    .setMode(ThemeMode.dark),
                              ),
                              ChoiceChip(
                                label: Text(l.settingsThemeSystem),
                                selected: mode == ThemeMode.system,
                                onSelected: (_) => ThemeNotifier.instance
                                    .setMode(ThemeMode.system),
                              ),
                            ],
                          );
                        },
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 24),
          _SectionHeader(l.settingsNotifications),
          const SizedBox(height: 8),
          Card(
            child: Column(
              children: [
                // Master toggle — выключает push целиком. Когда OFF, granular
                // свитчи скрыты и серверу плевать на их значения.
                SwitchListTile(
                  secondary: const Icon(Icons.notifications_outlined),
                  title: Text(l.settingsPushMaster),
                  value: _profile.pushEnabled,
                  onChanged:
                      _pushMasterBusy ? null : (v) => _togglePushMaster(v),
                ),
                // Granular prefs — показываем только если master=ON.
                if (_profile.pushEnabled) ...[
                  const Divider(height: 1, indent: 56),
                  _PrefTile(
                    icon: Icons.favorite_outline,
                    title: l.settingsNotifLikes,
                    value: _profile.notificationPrefs.likes,
                    busy: _prefsBusy.contains('likes'),
                    onChanged: (v) => _togglePref('likes', v),
                  ),
                  const Divider(height: 1, indent: 56),
                  _PrefTile(
                    icon: Icons.mode_comment_outlined,
                    title: l.settingsNotifComments,
                    value: _profile.notificationPrefs.comments,
                    busy: _prefsBusy.contains('comments'),
                    onChanged: (v) => _togglePref('comments', v),
                  ),
                  const Divider(height: 1, indent: 56),
                  _PrefTile(
                    icon: Icons.chat_bubble_outline,
                    title: l.settingsNotifMessages,
                    value: _profile.notificationPrefs.messages,
                    busy: _prefsBusy.contains('messages'),
                    onChanged: (v) => _togglePref('messages', v),
                  ),
                  const Divider(height: 1, indent: 56),
                  _PrefTile(
                    icon: Icons.star_outline,
                    title: l.settingsNotifReviews,
                    value: _profile.notificationPrefs.reviews,
                    busy: _prefsBusy.contains('reviews'),
                    onChanged: (v) => _togglePref('reviews', v),
                  ),
                  const Divider(height: 1, indent: 56),
                  _PrefTile(
                    icon: Icons.groups_outlined,
                    title: l.settingsNotifGroupBuy,
                    value: _profile.notificationPrefs.groupBuy,
                    busy: _prefsBusy.contains('groupBuy'),
                    onChanged: (v) => _togglePref('groupBuy', v),
                  ),
                ],
                const Divider(height: 1, indent: 56),
                // Quiet hours — реальный TimePicker (backend проверяет окно
                // в push.service.isInQuietHours).
                _QuietHoursTile(
                  profile: _profile,
                  onChanged: (start, end) async {
                    final updated = start == null
                        ? await _repo.updateMe(clearQuietHours: true)
                        : await _repo.updateMe(
                            quietHoursStart: start,
                            quietHoursEnd: end,
                          );
                    if (mounted) setState(() => _profile = updated);
                  },
                ),
              ],
            ),
          ),
          const SizedBox(height: 24),
          _SectionHeader(l.settingsPrivacy),
          const SizedBox(height: 8),
          Card(
            child: ListTile(
              leading: const Icon(Icons.lock_outline),
              title: Text(l.settingsBlocked),
              trailing: const Icon(Icons.chevron_right),
              onTap: () {},
            ),
          ),
          const SizedBox(height: 24),
          _SectionHeader(l.settingsAbout),
          const SizedBox(height: 8),
          Card(
            child: Column(
              children: [
                ListTile(
                  leading: const Icon(Icons.info_outline),
                  title: Text(l.settingsVersion),
                  subtitle: const Text(_appVersion),
                ),
                const Divider(height: 1, indent: 56),
                ListTile(
                  leading: const Icon(Icons.email_outlined),
                  title: Text(l.settingsContactSupport),
                  subtitle: const Text(_supportEmail),
                  trailing: const Icon(Icons.copy, size: 18),
                  onTap: () {
                    Clipboard.setData(
                        const ClipboardData(text: _supportEmail));
                    ScaffoldMessenger.of(context).showSnackBar(
                      SnackBar(
                        content: Text(l.commonCopied),
                        duration: const Duration(seconds: 1),
                      ),
                    );
                  },
                ),
                const Divider(height: 1, indent: 56),
                ListTile(
                  leading: const Icon(Icons.description_outlined),
                  title: Text(l.settingsTermsOfService),
                  trailing: const Icon(Icons.chevron_right),
                  onTap: () => Navigator.of(context).push(
                    MaterialPageRoute(
                        builder: (_) => termsOfServiceScreen()),
                  ),
                ),
                const Divider(height: 1, indent: 56),
                ListTile(
                  leading: const Icon(Icons.privacy_tip_outlined),
                  title: Text(l.settingsPrivacyPolicy),
                  trailing: const Icon(Icons.chevron_right),
                  onTap: () => Navigator.of(context).push(
                    MaterialPageRoute(
                        builder: (_) => privacyPolicyScreen()),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 32),
          Center(
            child: Text(
              'SourceHub © 2026',
              style: TextStyle(
                color: scheme.onSurfaceVariant,
                fontSize: 12,
              ),
            ),
          ),
          const SizedBox(height: 16),
        ],
      ),
    );
  }
}

class _SectionHeader extends StatelessWidget {
  const _SectionHeader(this.text);
  final String text;
  @override
  Widget build(BuildContext context) {
    return Text(
      text,
      style: Theme.of(context).textTheme.titleSmall?.copyWith(
            color: Theme.of(context).colorScheme.onSurfaceVariant,
            fontWeight: FontWeight.w600,
          ),
    );
  }
}

/// Granular push-preference переключатель. Обёртка над `SwitchListTile`
/// с busy-индикатором — пока PATCH в полёте, свитч disabled и справа
/// крутится маленький спиннер вместо нормального thumb.
class _PrefTile extends StatelessWidget {
  const _PrefTile({
    required this.icon,
    required this.title,
    required this.value,
    required this.busy,
    required this.onChanged,
  });

  final IconData icon;
  final String title;
  final bool value;
  final bool busy;
  final ValueChanged<bool> onChanged;

  @override
  Widget build(BuildContext context) {
    return SwitchListTile(
      secondary: Icon(icon),
      title: Text(title),
      value: value,
      onChanged: busy ? null : onChanged,
    );
  }
}

/// Тихие часы — TimePicker для start и end. Если оба null — тумблер выкл.
class _QuietHoursTile extends StatelessWidget {
  const _QuietHoursTile({required this.profile, required this.onChanged});
  final MyProfile profile;
  /// (start, end) или (null, null) для отключения.
  final Future<void> Function(String? start, String? end) onChanged;

  TimeOfDay _parseTime(String hhmm, {TimeOfDay? fallback}) {
    final parts = hhmm.split(':');
    if (parts.length != 2) return fallback ?? const TimeOfDay(hour: 22, minute: 0);
    final h = int.tryParse(parts[0]) ?? 22;
    final m = int.tryParse(parts[1]) ?? 0;
    return TimeOfDay(hour: h, minute: m);
  }

  String _format(TimeOfDay t) =>
      '${t.hour.toString().padLeft(2, '0')}:${t.minute.toString().padLeft(2, '0')}';

  Future<void> _pickStart(BuildContext context) async {
    final picked = await showTimePicker(
      context: context,
      initialTime: _parseTime(profile.quietHoursStart ?? '22:00'),
    );
    if (picked == null) return;
    await onChanged(_format(picked), profile.quietHoursEnd ?? '08:00');
  }

  Future<void> _pickEnd(BuildContext context) async {
    final picked = await showTimePicker(
      context: context,
      initialTime: _parseTime(profile.quietHoursEnd ?? '08:00'),
    );
    if (picked == null) return;
    await onChanged(profile.quietHoursStart ?? '22:00', _format(picked));
  }

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context)!;
    final scheme = Theme.of(context).colorScheme;
    final enabled =
        profile.quietHoursStart != null && profile.quietHoursEnd != null;
    return Column(
      children: [
        SwitchListTile(
          secondary: const Icon(Icons.bedtime_outlined),
          title: Text(l.settingsQuietHours),
          subtitle: enabled
              ? Text('${profile.quietHoursStart} — ${profile.quietHoursEnd}')
              : Text(
                  l.settingsQuietHoursOff,
                  style: TextStyle(color: scheme.onSurfaceVariant),
                ),
          value: enabled,
          onChanged: (v) async {
            if (v) {
              await onChanged('22:00', '08:00');
            } else {
              await onChanged(null, null);
            }
          },
        ),
        if (enabled)
          Padding(
            padding: const EdgeInsets.fromLTRB(56, 0, 16, 12),
            child: Row(
              children: [
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed: () => _pickStart(context),
                    icon: const Icon(Icons.nightlight_outlined, size: 18),
                    label: Text(profile.quietHoursStart ?? '22:00'),
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed: () => _pickEnd(context),
                    icon: const Icon(Icons.wb_sunny_outlined, size: 18),
                    label: Text(profile.quietHoursEnd ?? '08:00'),
                  ),
                ),
              ],
            ),
          ),
      ],
    );
  }
}
