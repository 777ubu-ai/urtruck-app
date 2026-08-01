import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:share_plus/share_plus.dart';
import '../../../core/api/api_client.dart';
import '../../../core/storage/auth_storage.dart';
import '../../../core/widgets/profile_link.dart';
import '../../../core/widgets/trust_badge.dart';
import '../../auth/presentation/phone_screen.dart';
import '../../../l10n/app_localizations.dart';
import '../../../core/events/post_events.dart';
import '../../create_post/presentation/create_post_screen.dart';
import '../../factories/presentation/interesting_factories.dart';
import '../../feed/presentation/hashtag_screen.dart';
import '../../feed/presentation/post_detail_screen.dart';
import '../data/profile_repository.dart';
import 'edit_profile_screen.dart';
import 'follow_list_screen.dart';
import 'profile_highlights.dart';
import 'saves_screen.dart';
import 'settings_screen.dart';

/// Экран своего профиля. Структура строго повторяет профиль соцсети и
/// менять порядок блоков нельзя:
///
///   1. Шапка — аватар слева, три счётчика справа (публикации, подписчики,
///      подписки). Это единственное место со статистикой на экране.
///   2. Описание — имя, категория, текст «о себе», специализация тегами,
///      локация и контактные ссылки.
///   3. Кнопки «Редактировать профиль» и «Поделиться профилем» — под
///      описанием, не над ним.
///   4. «Интересные заводы» — карусель рекомендаций. Она же место платного
///      размещения: заводы, которые платят за показ, встанут сюда.
///   5. «Актуальное» — карусель кружков (собственные stories).
///   6. Вкладки контента, переключающие сетку.
///   7. Сетка превью 3 в ряд во всю ширину.
///
/// В шапке экрана слева «плюс» (создать публикацию или историю), справа
/// «три полоски» с меню: настройки, сохранённое, реферальный код, выход.
class ProfileScreen extends StatefulWidget {
  const ProfileScreen({super.key});

  @override
  State<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends State<ProfileScreen> {
  final _repo = ProfileRepository();
  MyProfile? _profile;
  String? _error;
  bool _loading = false;

  /// Нужен, чтобы «плюс» в шапке мог открыть тот же поток создания истории,
  /// что и кружок «Новое» в ряду «Актуальное».
  final _highlightsKey = GlobalKey<ProfileHighlightsState>();

  /// Смена ключа пересоздаёт сетку товаров — так она перечитывает список
  /// после публикации, не открывая своё состояние наружу.
  Key _gridKey = UniqueKey();

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final profile = await _repo.loadMe();
      if (!mounted) return;
      setState(() {
        _profile = profile;
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

  Future<void> _logout() async {
    final l = AppLocalizations.of(context)!;
    final confirm = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: Text(l.profileLogoutConfirmTitle),
        content: Text(l.profileLogoutConfirmBody),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: Text(l.commonCancel),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: Text(l.profileLogoutConfirmAction),
          ),
        ],
      ),
    );
    if (confirm != true) return;
    await AuthStorage.instance.clear();
    if (!mounted) return;
    Navigator.of(context).pushAndRemoveUntil(
      MaterialPageRoute(builder: (_) => const PhoneScreen()),
      (_) => false,
    );
  }

  /// Меню за «тремя полосками» — выезжающая снизу панель, как в соцсетях:
  /// список пунктов, каждый открывает свой экран. Отдельной страницы-меню
  /// нет, панель ложится поверх профиля.
  ///
  /// Здесь НЕТ «Подписчиков»/«Подписок» — они кликабельны прямо в шапке
  /// профиля. Языка/валюты/страны тоже нет — это экран «Настройки»,
  /// единственное место, где они редактируются.
  void _openMenu(MyProfile p) {
    final l = AppLocalizations.of(context)!;
    showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      builder: (sheetContext) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              leading: const Icon(Icons.settings_outlined),
              title: Text(l.profileSettings),
              onTap: () {
                Navigator.pop(sheetContext);
                Navigator.of(context).push(
                  MaterialPageRoute(
                    builder: (_) => SettingsScreen(profile: p),
                  ),
                );
              },
            ),
            ListTile(
              leading: const Icon(Icons.bookmark_outline),
              title: Text(l.profileMySaves),
              onTap: () {
                Navigator.pop(sheetContext);
                Navigator.of(context).push(
                  MaterialPageRoute(builder: (_) => const SavesScreen()),
                );
              },
            ),
            ListTile(
              leading: const Icon(Icons.card_giftcard),
              title: Text(l.profileReferralCodeLabel),
              subtitle: Text(
                p.referralCode,
                style: const TextStyle(
                  fontFamily: 'monospace',
                  fontWeight: FontWeight.w700,
                ),
              ),
              trailing: const Icon(Icons.copy, size: 20),
              onTap: () {
                Navigator.pop(sheetContext);
                _copyReferral(p.referralCode);
              },
            ),
            const Divider(height: 1),
            ListTile(
              leading: Icon(Icons.logout,
                  color: Theme.of(context).colorScheme.error),
              title: Text(
                l.profileLogout,
                style: TextStyle(color: Theme.of(context).colorScheme.error),
              ),
              onTap: () {
                Navigator.pop(sheetContext);
                _logout();
              },
            ),
          ],
        ),
      ),
    );
  }

  /// Панель «Создать» с «плюса» слева вверху.
  ///
  /// В списке только то, что приложение действительно умеет: публикация и
  /// история. Reels и эфиров у нас нет — пункты, ведущие в никуда, сюда не
  /// добавляем.
  void _openCreateSheet() {
    final l = AppLocalizations.of(context)!;
    showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      builder: (sheetContext) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Padding(
              padding: const EdgeInsets.only(bottom: 4),
              child: Text(
                l.createSheetTitle,
                style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w700),
              ),
            ),
            ListTile(
              leading: const Icon(Icons.grid_on_rounded),
              title: Text(l.createSheetPost),
              onTap: () {
                Navigator.pop(sheetContext);
                Navigator.of(context).push(
                  MaterialPageRoute(
                    builder: (_) => CreatePostScreen(
                      onPostCreated: () {
                        // Свежий товар должен появиться и в сетке профиля,
                        // и в ленте на соседней вкладке.
                        PostEvents.instance.notifyCreated();
                        _load();
                        setState(() => _gridKey = UniqueKey());
                      },
                    ),
                  ),
                );
              },
            ),
            ListTile(
              leading: const Icon(Icons.add_circle_outline),
              title: Text(l.createSheetStory),
              onTap: () {
                Navigator.pop(sheetContext);
                // Истории добавляются кружком «Новое» в ряду «Актуальное» —
                // ведём туда же, чтобы не дублировать поток загрузки.
                _highlightsKey.currentState?.createStory();
              },
            ),
          ],
        ),
      ),
    );
  }

  void _copyReferral(String code) {
    final l = AppLocalizations.of(context)!;
    Clipboard.setData(ClipboardData(text: code));
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(l.profileReferralCopied(code)),
        duration: const Duration(seconds: 1),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context)!;
    return Scaffold(
      appBar: AppBar(
        title: Text(
          l.profileTitle,
          style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 22),
        ),
        // Слева вверху — «плюс»: создание публикации или истории.
        // Справа — «три полоски» с меню. Ровно как в референсе.
        leading: _profile == null
            ? null
            : IconButton(
                icon: const Icon(Icons.add, size: 28),
                tooltip: l.createSheetTitle,
                onPressed: _openCreateSheet,
              ),
        actions: [
          if (_profile != null)
            IconButton(
              icon: const Icon(Icons.menu_rounded),
              tooltip: l.profileMenuTooltip,
              onPressed: () => _openMenu(_profile!),
            ),
        ],
      ),
      body: _buildBody(),
    );
  }

  Widget _buildBody() {
    final l = AppLocalizations.of(context)!;
    if (_loading && _profile == null) {
      return const Center(child: CircularProgressIndicator());
    }
    if (_error != null && _profile == null) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(Icons.error_outline,
                  size: 64, color: Theme.of(context).colorScheme.error),
              const SizedBox(height: 16),
              Text(
                l.profileLoadError,
                textAlign: TextAlign.center,
                style: Theme.of(context).textTheme.titleLarge,
              ),
              const SizedBox(height: 8),
              Text(_error!, textAlign: TextAlign.center),
              const SizedBox(height: 16),
              FilledButton.tonal(
                onPressed: _load,
                child: Text(l.commonRetry),
              ),
            ],
          ),
        ),
      );
    }
    final p = _profile!;
    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        padding: EdgeInsets.zero,
        // Порядок блоков жёстко зафиксирован и повторяет профиль соцсети:
        //   1) шапка: аватар + три счётчика
        //   2) описание: имя, категория, текст, ссылки и контакты
        //   3) кнопки «Редактировать профиль» и «Поделиться» — под описанием
        //   4) «Актуальное» — карусель кружков
        //   5) вкладки контента
        //   6) сетка превью во всю ширину
        // Ничего между этими блоками не вставляем.
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 0),
            child: _ProfileHeader(profile: p),
          ),
          const SizedBox(height: 14),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: Row(
              children: [
                Expanded(
                  child: _ProfileActionButton(
                    label: l.profileEditProfile,
                    onTap: () async {
                      final updated =
                          await Navigator.of(context).push<MyProfile>(
                        MaterialPageRoute(
                          builder: (_) => EditProfileScreen(initial: p),
                        ),
                      );
                      if (updated != null && mounted) {
                        setState(() => _profile = updated);
                      }
                    },
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: _ProfileActionButton(
                    label: l.profileShareProfile,
                    onTap: () => Share.share(
                      'SourceHub — ${p.factory?.companyName ?? p.name ?? "профиль"}\n'
                      'https://biz-chat.net/app/',
                    ),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 18),
          // Блок рекомендаций — ровно там же, где он стоит в референсе:
          // под кнопками действий и над «Актуальным». Он же будущее место
          // платного размещения заводов.
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: InterestingFactories(excludeUserId: p.id),
          ),
          const SizedBox(height: 16),
          ProfileHighlights(
            key: _highlightsKey,
            userId: p.id,
            canCreate: p.isFactory,
          ),
          const SizedBox(height: 4),
          _UserPostsGrid(key: _gridKey, userId: p.id),
          const SizedBox(height: 24),
        ],
      ),
    );
  }
}

class _ProfileHeader extends StatelessWidget {
  const _ProfileHeader({required this.profile});
  final MyProfile profile;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final l = AppLocalizations.of(context)!;
    final displayName = profile.name?.isNotEmpty == true
        ? profile.name!
        : (profile.factory?.companyName ?? l.profileNoName);
    final bio = profile.factory?.description;
    final site = profile.factory?.website;
    final whatsapp = profile.factory?.whatsapp;
    final address = profile.factory?.address;
    final tags = profile.factory?.hashtags ?? const <String>[];
    final country = profile.countryCode?.trim() ?? '';
    final town = profile.city?.trim() ?? '';
    final location = country.isNotEmpty && town.isNotEmpty
        ? l.profileLocationLine(country, town)
        : (country.isNotEmpty ? country : town);
    // Шапка в духе профилей соцсетей: аватар и три счётчика в одну строку,
    // ниже — имя с описанием, ниже — кнопки действий на всю ширину.
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            FactoryAvatar(
              name: displayName,
              imageUrl: profile.avatarUrl != null
                  ? ApiClient.resolveMediaUrl(profile.avatarUrl!)
                  : null,
              size: 86,
            ),
            const SizedBox(width: 20),
            Expanded(
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceAround,
                children: [
                  // Единственное место со статистикой. Число публикаций
                  // приходит тем же запросом, что и сетка ниже, поэтому
                  // разойтись с ней не может.
                  _CountStat(
                    value: profile.postsCount,
                    label: l.profileWordPosts(profile.postsCount),
                  ),
                  _CountStat(
                    value: profile.followersCount,
                    label: l.profileWordFollowers(profile.followersCount),
                    onTap: () => Navigator.of(context).push(
                      MaterialPageRoute(
                        builder: (_) => FollowListScreen(
                          userId: profile.id,
                          mode: FollowListMode.followers,
                        ),
                      ),
                    ),
                  ),
                  _CountStat(
                    value: profile.followingCount,
                    label: l.profileWordFollowing(profile.followingCount),
                    onTap: () => Navigator.of(context).push(
                      MaterialPageRoute(
                        builder: (_) => FollowListScreen(
                          userId: profile.id,
                          mode: FollowListMode.following,
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
        const SizedBox(height: 12),
        Row(
          children: [
            Flexible(
              child: Text(
                displayName,
                style: const TextStyle(
                  fontSize: 15,
                  fontWeight: FontWeight.w700,
                  letterSpacing: -0.2,
                ),
                overflow: TextOverflow.ellipsis,
              ),
            ),
            if (profile.verified) ...[
              const SizedBox(width: 5),
              const Icon(Icons.verified_rounded,
                  size: 16, color: Color(0xFF0B66FF)),
            ],
          ],
        ),
        const SizedBox(height: 2),
        Text(
          profile.isFactory ? l.chatPartnerFactory : l.chatPartnerBuyer,
          style: TextStyle(fontSize: 13.5, color: scheme.onSurfaceVariant),
        ),
        // «О себе» завода — то, ради чего покупатель и открывает профиль:
        // что производят, условия опта, гарантии. Отдельного блока
        // «О заводе» больше нет — весь этот текст живёт здесь, в описании.
        if (bio != null && bio.isNotEmpty) ...[
          const SizedBox(height: 6),
          Text(
            bio,
            style: const TextStyle(fontSize: 13.5, height: 1.35),
          ),
        ],
        // Специализация — тегами прямо в описании.
        if (tags.isNotEmpty) ...[
          const SizedBox(height: 6),
          Wrap(
            spacing: 6,
            runSpacing: 2,
            children: [
              for (final tag in tags)
                InkWell(
                  onTap: () => Navigator.of(context).push(
                    MaterialPageRoute(builder: (_) => HashtagScreen(tag: tag)),
                  ),
                  child: Text(
                    '#$tag',
                    style: const TextStyle(
                      fontSize: 13.5,
                      fontWeight: FontWeight.w600,
                      color: Color(0xFF0B66FF),
                    ),
                  ),
                ),
            ],
          ),
        ],
        // Где находится производство — строкой контакта, а не отдельным блоком.
        if (location.isNotEmpty) ...[
          const SizedBox(height: 4),
          Row(
            children: [
              Icon(Icons.place_outlined,
                  size: 14, color: scheme.onSurfaceVariant),
              const SizedBox(width: 5),
              Flexible(
                child: Text(
                  location,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                      fontSize: 13.5, color: scheme.onSurfaceVariant),
                ),
              ),
            ],
          ),
        ],
        // Точный адрес (этаж/ряд/секция) — отдельной строкой от города и
        // страны выше: это разные уровни детализации.
        if (address != null && address.isNotEmpty) ...[
          const SizedBox(height: 2),
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Icon(Icons.storefront_outlined,
                  size: 14, color: scheme.onSurfaceVariant),
              const SizedBox(width: 5),
              Expanded(
                child: Text(
                  address,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                      fontSize: 13.5, color: scheme.onSurfaceVariant),
                ),
              ),
            ],
          ),
        ],
        // Контакты кликабельными строками.
        // Номер входа здесь не показываем: это телефон аккаунта, он может
        // быть страны, отличной от страны завода, и покупателю бесполезен.
        // Он остаётся в «Настройки → Аккаунт». Контакт завода — WhatsApp
        // (китайский номер вписывается в редактировании профиля) и сайт.
        if (whatsapp != null && whatsapp.isNotEmpty)
          ProfileLink(
            icon: Icons.chat_rounded,
            text: 'wa.me/$whatsapp',
            url: 'https://wa.me/${whatsapp.replaceAll(RegExp(r'[^0-9]'), '')}',
          ),
        if (site != null && site.isNotEmpty)
          ProfileLink(
            icon: Icons.link_rounded,
            text: site,
            url: site.startsWith('http') ? site : 'https://$site',
          ),
      ],
    );
  }
}

class _CountStat extends StatelessWidget {
  const _CountStat({required this.value, required this.label, this.onTap});

  final int value;
  final String label;
  final VoidCallback? onTap;

  static String _format(int v) {
    if (v < 1000) return '$v';
    if (v < 100000) {
      // 5018 → «5 018» (разделитель тысяч пробелом)
      return v.toString().replaceAllMapped(
            RegExp(r'(\d)(?=(\d{3})+$)'),
            (m) => '${m[1]} ',
          );
    }
    return '${(v / 1000).toStringAsFixed(0)} тыс.';
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(10),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 4),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              _format(value),
              style: const TextStyle(
                fontSize: 18,
                fontWeight: FontWeight.w800,
                letterSpacing: -0.4,
                height: 1.15,
              ),
            ),
            const SizedBox(height: 1),
            Text(
              label,
              style: TextStyle(
                fontSize: 12.5,
                color: scheme.onSurfaceVariant,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Instagram-style 3-колоночный grid превью постов завода. Загружает
/// `/users/:id/posts` при первом монтировании. Тап на превью → детальный
/// экран поста.
class _UserPostsGrid extends StatefulWidget {
  const _UserPostsGrid({super.key, required this.userId});
  final String userId;

  @override
  State<_UserPostsGrid> createState() => _UserPostsGridState();
}

class _UserPostsGridState extends State<_UserPostsGrid> {
  final _repo = ProfileRepository();
  List<UserPostPreview> _posts = const [];
  bool _loading = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final posts = await _repo.loadUserPosts(widget.userId);
      if (!mounted) return;
      setState(() {
        _posts = posts;
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

  /// Выбранная вкладка: 0 — сетка публикаций, 1 — видео.
  int _tab = 0;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final l = AppLocalizations.of(context)!;
    // Вкладка «отмеченные» не рисуется: отметок на товарах в приложении нет,
    // а вкладка, которая никогда не может ничего показать, только вводит в
    // заблуждение. Появится функция — появится и третья вкладка.
    final visible = _tab == 0
        ? _posts
        : _posts.where((p) => p.hasVideo).toList(growable: false);

    // Сетка во всю ширину экрана, без карточки и отступов: плитки стыкуются
    // друг с другом и продолжаются вниз.
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Container(
          decoration: BoxDecoration(
            border: Border(
              top: BorderSide(color: scheme.outlineVariant, width: 0.5),
            ),
          ),
          child: Row(
            children: [
              Expanded(
                child: _GridTab(
                  icon: Icons.grid_on_rounded,
                  tooltip: l.profileTabGrid,
                  selected: _tab == 0,
                  onTap: () => setState(() => _tab = 0),
                ),
              ),
              Expanded(
                child: _GridTab(
                  icon: Icons.slideshow_outlined,
                  tooltip: l.profileTabVideo,
                  selected: _tab == 1,
                  onTap: () => setState(() => _tab = 1),
                ),
              ),
            ],
          ),
        ),
        if (_loading && _posts.isEmpty)
          const Padding(
            padding: EdgeInsets.all(24),
            child: Center(child: CircularProgressIndicator()),
          )
        else if (_error != null && _posts.isEmpty)
          Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              children: [
                Text(_error!, textAlign: TextAlign.center),
                const SizedBox(height: 8),
                TextButton(onPressed: _load, child: Text(l.commonRetry)),
              ],
            ),
          )
        else if (visible.isEmpty)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 32),
            child: Column(
              children: [
                Icon(
                  _tab == 0 ? Icons.add_box_outlined : Icons.slideshow_outlined,
                  size: 48,
                  color: scheme.onSurfaceVariant,
                ),
                const SizedBox(height: 8),
                Text(
                  _tab == 0 ? l.profileNoPostsYet : l.profileNoVideosYet,
                  style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                        color: scheme.onSurfaceVariant,
                      ),
                ),
              ],
            ),
          )
        else
          GridView.builder(
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
              crossAxisCount: 3,
              crossAxisSpacing: 1.5,
              mainAxisSpacing: 1.5,
            ),
            itemCount: visible.length,
            itemBuilder: (_, i) => _PostThumbnail(post: visible[i]),
          ),
      ],
    );
  }
}

/// Вкладка над сеткой: иконка с подчёркиванием у активной.
class _GridTab extends StatelessWidget {
  const _GridTab({
    required this.icon,
    required this.tooltip,
    required this.selected,
    required this.onTap,
  });

  final IconData icon;
  final String tooltip;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Tooltip(
      message: tooltip,
      child: InkWell(
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 11),
          decoration: BoxDecoration(
            border: Border(
              bottom: BorderSide(
                color: selected ? scheme.onSurface : Colors.transparent,
                width: 1.5,
              ),
            ),
          ),
          child: Icon(
            icon,
            size: 23,
            color: selected ? scheme.onSurface : scheme.onSurfaceVariant,
          ),
        ),
      ),
    );
  }
}

class _PostThumbnail extends StatelessWidget {
  const _PostThumbnail({required this.post});
  final UserPostPreview post;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final imageUrl = post.thumbnailUrl != null
        ? ApiClient.resolveMediaUrl(post.thumbnailUrl!)
        : null;
    return InkWell(
      onTap: () {
        Navigator.of(context).push(
          MaterialPageRoute(
            builder: (_) => PostDetailScreen(postId: post.id),
          ),
        );
      },
      child: Stack(
        fit: StackFit.expand,
        children: [
          ClipRRect(
            borderRadius: BorderRadius.zero,
            child: imageUrl != null
                ? CachedNetworkImage(
                    imageUrl: imageUrl,
                    fit: BoxFit.cover,
                    placeholder: (_, __) =>
                        Container(color: scheme.surfaceContainerHighest),
                    errorWidget: (_, __, ___) => Container(
                      color: scheme.surfaceContainerHighest,
                      child: Icon(Icons.broken_image,
                          color: scheme.onSurfaceVariant, size: 24),
                    ),
                  )
                : Container(
                    color: scheme.surfaceContainerHighest,
                    child: Icon(Icons.image,
                        color: scheme.onSurfaceVariant, size: 24),
                  ),
          ),
          if (post.isHotDeal)
            Positioned(
              top: 4,
              left: 4,
              child: Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 4, vertical: 2),
                decoration: BoxDecoration(
                  color: Colors.red,
                  borderRadius: BorderRadius.circular(3),
                ),
                child: const Text('🔥', style: TextStyle(fontSize: 9)),
              ),
            ),
          // Градиентная подложка снизу: цена читается на любом фото,
          // включая светлые (раньше белый текст терялся на белом фоне).
          Positioned(
            left: 0,
            right: 0,
            bottom: 0,
            child: Container(
              padding: const EdgeInsets.fromLTRB(7, 14, 7, 6),
              decoration: BoxDecoration(
                borderRadius: const BorderRadius.vertical(
                  bottom: Radius.circular(12),
                ),
                gradient: LinearGradient(
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                  colors: [
                    Colors.transparent,
                    Colors.black.withValues(alpha: 0.72),
                  ],
                ),
              ),
              // Просмотры на плитке — как в сетках соцсетей; цена видна
              // в карточке товара при открытии.
              child: Row(
                children: [
                  const Icon(Icons.visibility_outlined,
                      size: 13, color: Colors.white),
                  const SizedBox(width: 4),
                  Flexible(
                    child: Text(
                      '${post.viewsCount}',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 12.5,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// Кнопка действия под описанием профиля: серая «таблетка» во всю ширину
/// колонки, только текст — без иконки, как в профилях соцсетей.
class _ProfileActionButton extends StatelessWidget {
  const _ProfileActionButton({required this.label, required this.onTap});

  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(10),
      child: Container(
        height: 36,
        alignment: Alignment.center,
        padding: const EdgeInsets.symmetric(horizontal: 8),
        decoration: BoxDecoration(
          color: scheme.surfaceContainerHighest,
          borderRadius: BorderRadius.circular(10),
        ),
        child: Text(
          label,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: TextStyle(
            fontSize: 13.5,
            fontWeight: FontWeight.w600,
            color: scheme.onSurface,
          ),
        ),
      ),
    );
  }
}
