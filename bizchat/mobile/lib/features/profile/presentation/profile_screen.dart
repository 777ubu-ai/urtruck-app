import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../../../core/api/api_client.dart';
import '../../../core/storage/auth_storage.dart';
import '../../../core/widgets/trust_badge.dart';
import '../../auth/presentation/phone_screen.dart';
import '../../../l10n/app_localizations.dart';
import '../../feed/presentation/hashtag_screen.dart';
import '../../feed/presentation/post_detail_screen.dart';
import '../data/profile_repository.dart';
import 'edit_profile_screen.dart';
import 'follow_list_screen.dart';
import 'saves_screen.dart';
import 'settings_screen.dart';

/// Экран профиля. Загружает `/users/me` при первом открытии и показывает:
/// - аватар (заглушка из инициала, если нет URL)
/// - имя/телефон, тип (Байер/Завод)
/// - языковые/валютные настройки
/// - реферальный код
/// - для заводов — название компании, Trust Score, хэштеги
/// - кнопку Logout
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
        actions: [
          if (_profile != null)
            IconButton(
              icon: const Icon(Icons.edit_outlined),
              tooltip: l.profileEditTooltip,
              onPressed: () async {
                final updated = await Navigator.of(context).push<MyProfile>(
                  MaterialPageRoute(
                    builder: (_) => EditProfileScreen(initial: _profile!),
                  ),
                );
                if (updated != null && mounted) {
                  setState(() => _profile = updated);
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(
                      content: Text(l.profileUpdatedSnack),
                      duration: const Duration(seconds: 1),
                    ),
                  );
                }
              },
            ),
          IconButton(
            icon: const Icon(Icons.refresh),
            tooltip: l.profileRefreshTooltip,
            onPressed: _load,
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
        padding: const EdgeInsets.all(16),
        children: [
          _ProfileHeader(profile: p),
          const SizedBox(height: 16),
          // S2-03: карточки статистики
          if (p.factory != null)
            _StatsCards(factory: p.factory!),
          if (p.factory != null) const SizedBox(height: 16),
          if (p.factory != null) ...[
            _FactoryCard(factory: p.factory!),
            const SizedBox(height: 16),
            // Posts grid — только для factory, потому что только заводы публикуют посты
            _UserPostsGrid(userId: p.id),
            const SizedBox(height: 16),
          ],
          _SettingsCard(profile: p),
          const SizedBox(height: 16),
          Card(
            child: Column(
              children: [
                ListTile(
                  leading: const Icon(Icons.people_outline),
                  title: Text(l.profileFollowers),
                  trailing: const Icon(Icons.chevron_right),
                  onTap: () {
                    Navigator.of(context).push(
                      MaterialPageRoute(
                        builder: (_) => FollowListScreen(
                          userId: p.id,
                          mode: FollowListMode.followers,
                        ),
                      ),
                    );
                  },
                ),
                const Divider(height: 1, indent: 56),
                ListTile(
                  leading: const Icon(Icons.person_add_outlined),
                  title: Text(l.profileFollowing),
                  trailing: const Icon(Icons.chevron_right),
                  onTap: () {
                    Navigator.of(context).push(
                      MaterialPageRoute(
                        builder: (_) => FollowListScreen(
                          userId: p.id,
                          mode: FollowListMode.following,
                        ),
                      ),
                    );
                  },
                ),
                const Divider(height: 1, indent: 56),
                ListTile(
                  leading: const Icon(Icons.bookmark_outline),
                  title: Text(l.profileMySaves),
                  trailing: const Icon(Icons.chevron_right),
                  onTap: () {
                    Navigator.of(context).push(
                      MaterialPageRoute(
                        builder: (_) => const SavesScreen(),
                      ),
                    );
                  },
                ),
                const Divider(height: 1, indent: 56),
                ListTile(
                  leading: const Icon(Icons.settings_outlined),
                  title: Text(l.profileSettings),
                  trailing: const Icon(Icons.chevron_right),
                  onTap: () {
                    Navigator.of(context).push(
                      MaterialPageRoute(
                        builder: (_) => SettingsScreen(profile: p),
                      ),
                    );
                  },
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),
          _ReferralCard(code: p.referralCode, onCopy: _copyReferral),
          const SizedBox(height: 24),
          FilledButton.icon(
            onPressed: _logout,
            icon: const Icon(Icons.logout),
            label: Text(l.profileLogout),
            style: FilledButton.styleFrom(
              backgroundColor: Theme.of(context).colorScheme.errorContainer,
              foregroundColor: Theme.of(context).colorScheme.onErrorContainer,
              minimumSize: const Size.fromHeight(48),
            ),
          ),
          const SizedBox(height: 32),
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
                  _CountStat(
                    value: profile.postsCount,
                    label: 'публикации',
                  ),
                  _CountStat(
                    value: profile.followersCount,
                    label: 'подписчики',
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
                    label: 'подписки',
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
        Text(
          profile.phone,
          style: TextStyle(fontSize: 13.5, color: scheme.onSurfaceVariant),
        ),
      ],
    );
  }
}

/// Счётчик в шапке профиля: крупная цифра, под ней подпись.
/// Числа от тысячи сокращаем (5 018 → 5 018, 12500 → 12,5 тыс.).
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

class _FactoryCard extends StatelessWidget {
  const _FactoryCard({required this.factory});
  final FactoryProfile factory;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final l = AppLocalizations.of(context)!;
    final trustColor = factory.trustScore >= 90
        ? Colors.green
        : factory.trustScore >= 70
            ? Colors.orange
            : Colors.grey;
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Text(l.profileAboutFactory,
                    style: Theme.of(context).textTheme.titleMedium?.copyWith(
                          fontWeight: FontWeight.w700,
                        )),
                const Spacer(),
                // Живой статус вместо «Trust Score: 0».
                TrustBadge(score: factory.trustScore, compact: false),
              ],
            ),
            const SizedBox(height: 14),
            // Три метрики плитками — читается с одного взгляда.
            Row(
              children: [
                Expanded(
                  child: _StatTile(
                    icon: Icons.inventory_2_rounded,
                    value: '${factory.totalProducts}',
                    label: 'Товаров',
                    accent: const Color(0xFF0B66FF),
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: _StatTile(
                    icon: Icons.handshake_rounded,
                    value: '${factory.totalDeals}',
                    label: 'Сделок',
                    accent: const Color(0xFF0F9D58),
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: _StatTile(
                    icon: Icons.shield_rounded,
                    value: factory.trustScore > 0
                        ? '${factory.trustScore}'
                        : '—',
                    label: 'Рейтинг',
                    accent: trustColor,
                  ),
                ),
              ],
            ),
            if (factory.hashtags.isNotEmpty) ...[
              const SizedBox(height: 12),
              Wrap(
                spacing: 6,
                children: factory.hashtags
                    .map((tag) => ActionChip(
                          label: Text('#$tag'),
                          visualDensity: VisualDensity.compact,
                          padding: EdgeInsets.zero,
                          onPressed: () {
                            Navigator.of(context).push(
                              MaterialPageRoute(
                                builder: (_) => HashtagScreen(tag: tag),
                              ),
                            );
                          },
                        ))
                    .toList(),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _SettingsCard extends StatelessWidget {
  const _SettingsCard({required this.profile});
  final MyProfile profile;

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context)!;
    return Card(
      child: Column(
        children: [
          ListTile(
            leading: const Icon(Icons.language),
            title: Text(l.profileLanguageLabel),
            trailing: Text(profile.language.toUpperCase()),
          ),
          const Divider(height: 1),
          ListTile(
            leading: const Icon(Icons.attach_money),
            title: Text(l.profileCurrencyLabel),
            trailing: Text(profile.currency),
          ),
          if (profile.countryCode != null) ...[
            const Divider(height: 1),
            ListTile(
              leading: const Icon(Icons.flag_outlined),
              title: Text(l.profileCountryLabel),
              trailing: Text(profile.countryCode!),
            ),
          ],
          if (profile.city != null) ...[
            const Divider(height: 1),
            ListTile(
              leading: const Icon(Icons.location_city),
              title: Text(l.profileCityLabel),
              trailing: Text(profile.city!),
            ),
          ],
        ],
      ),
    );
  }
}

class _ReferralCard extends StatelessWidget {
  const _ReferralCard({required this.code, required this.onCopy});
  final String code;
  final void Function(String) onCopy;

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context)!;
    return Card(
      child: ListTile(
        leading: const Icon(Icons.card_giftcard),
        title: Text(l.profileReferralCodeLabel),
        subtitle: Text(code,
            style: const TextStyle(
              fontFamily: 'monospace',
              fontSize: 16,
              fontWeight: FontWeight.w700,
            )),
        trailing: IconButton(
          icon: const Icon(Icons.copy),
          tooltip: l.profileReferralCopyTooltip,
          onPressed: () => onCopy(code),
        ),
      ),
    );
  }
}

/// Instagram-style 3-колоночный grid превью постов завода. Загружает
/// `/users/:id/posts` при первом монтировании. Тап на превью → детальный
/// экран поста.
class _UserPostsGrid extends StatefulWidget {
  const _UserPostsGrid({required this.userId});
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

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final l = AppLocalizations.of(context)!;
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                Icon(Icons.grid_view_outlined,
                    size: 18, color: scheme.onSurfaceVariant),
                const SizedBox(width: 8),
                Text(
                  l.profileMyPosts,
                  style: Theme.of(context).textTheme.titleMedium?.copyWith(
                        fontWeight: FontWeight.w700,
                      ),
                ),
                const Spacer(),
                if (_posts.isNotEmpty)
                  Text(
                    '${_posts.length}',
                    style: Theme.of(context).textTheme.bodySmall?.copyWith(
                          color: scheme.onSurfaceVariant,
                        ),
                  ),
              ],
            ),
            const SizedBox(height: 12),
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
                    TextButton(
                      onPressed: _load,
                      child: Text(l.commonRetry),
                    ),
                  ],
                ),
              )
            else if (_posts.isEmpty)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 24),
                child: Column(
                  children: [
                    Icon(Icons.add_box_outlined,
                        size: 48, color: scheme.onSurfaceVariant),
                    const SizedBox(height: 8),
                    Text(
                      l.profileNoPostsYet,
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
                gridDelegate:
                    const SliverGridDelegateWithFixedCrossAxisCount(
                  crossAxisCount: 3,
                  crossAxisSpacing: 4,
                  mainAxisSpacing: 4,
                ),
                itemCount: _posts.length,
                itemBuilder: (_, i) => _PostThumbnail(post: _posts[i]),
              ),
          ],
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
            borderRadius: BorderRadius.circular(12),
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
              child: Text(
                '${post.priceAmount} ${post.priceCurrency}',
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                  color: Colors.white,
                  fontSize: 12.5,
                  fontWeight: FontWeight.w800,
                  letterSpacing: -0.2,
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// S2-03: карточки статистики для factory — товары/сделки/рейтинг/trust.
class _StatsCards extends StatelessWidget {
  const _StatsCards({required this.factory});
  final FactoryProfile factory;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final cards = [
      (
        Icons.inventory_2_rounded,
        factory.totalProducts.toString(),
        'Товары',
        Colors.blue,
      ),
      (
        Icons.handshake_rounded,
        factory.totalDeals.toString(),
        'Сделки',
        Colors.green,
      ),
      (
        Icons.star_rounded,
        factory.avgRating > 0
            ? factory.avgRating.toStringAsFixed(1)
            : '—',
        factory.reviewsCount > 0
            ? '${factory.reviewsCount} отз.'
            : 'Рейтинг',
        Colors.amber,
      ),
      (
        Icons.verified_rounded,
        factory.trustScore.toString(),
        'Trust',
        factory.trustScore >= 90
            ? Colors.green
            : factory.trustScore >= 70
                ? Colors.orange
                : Colors.grey,
      ),
    ];
    return Row(
      children: cards
          .map((c) => Expanded(
                child: Padding(
                  padding: EdgeInsets.only(
                      right: c == cards.last ? 0 : 8),
                  child: Container(
                    padding: const EdgeInsets.symmetric(
                        vertical: 16, horizontal: 8),
                    decoration: BoxDecoration(
                      color: scheme.surfaceContainerLow,
                      borderRadius: BorderRadius.circular(16),
                      border: Border.all(
                        color: scheme.outlineVariant.withValues(alpha: 0.4),
                        width: 1,
                      ),
                    ),
                    child: Column(
                      children: [
                        Icon(c.$1, color: c.$4, size: 28),
                        const SizedBox(height: 6),
                        Text(
                          c.$2,
                          style: Theme.of(context)
                              .textTheme
                              .titleLarge
                              ?.copyWith(fontWeight: FontWeight.w800),
                        ),
                        Text(
                          c.$3,
                          style: Theme.of(context)
                              .textTheme
                              .bodySmall
                              ?.copyWith(color: scheme.onSurfaceVariant),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ],
                    ),
                  ),
                ),
              ))
          .toList(),
    );
  }
}

/// Плитка метрики завода (товары / сделки / рейтинг).
/// Заменяет строчку мелкого текста — цифра читается сразу, а нулевое
/// значение не выглядит поломкой благодаря спокойной подаче.
class _StatTile extends StatelessWidget {
  const _StatTile({
    required this.icon,
    required this.value,
    required this.label,
    required this.accent,
  });

  final IconData icon;
  final String value;
  final String label;
  final Color accent;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 10),
      decoration: BoxDecoration(
        color: scheme.surfaceContainerHighest.withValues(alpha: 0.6),
        borderRadius: BorderRadius.circular(16),
      ),
      child: Column(
        children: [
          Icon(icon, size: 18, color: accent),
          const SizedBox(height: 6),
          Text(
            value,
            style: const TextStyle(
              fontSize: 20,
              fontWeight: FontWeight.w800,
              letterSpacing: -0.5,
              height: 1.1,
            ),
          ),
          const SizedBox(height: 2),
          Text(
            label,
            style: TextStyle(
              fontSize: 11.5,
              fontWeight: FontWeight.w600,
              color: scheme.onSurfaceVariant,
            ),
          ),
        ],
      ),
    );
  }
}
