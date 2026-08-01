import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import '../../../core/api/api_client.dart';
import '../../../core/widgets/profile_link.dart';
import '../../../core/widgets/trust_badge.dart';
import '../../../l10n/app_localizations.dart';
import '../../feed/presentation/hashtag_screen.dart';
import '../../feed/presentation/post_detail_screen.dart';
import '../../reviews/presentation/reviews_list_screen.dart';
import '../data/profile_repository.dart';
import 'follow_list_screen.dart';

/// Публичный профиль завода — то, что видит покупатель, открывая чужую
/// карточку. Структура по мокапу SourceHub (Ерасыл):
///
///   1. Cover-баннер + аватар, наложенный на его нижнюю границу.
///   2. Кнопки Contact / Follow крупные и рядом.
///   3. Название + галочка + локация + «Established YYYY».
///   4. Плашка «Verified Factory» (если проверен).
///   5. Четыре счётчика: Followers, Posts, Profile views (7d), Rating.
///   6. Короткое описание + «... more».
///   7. Структурированная сетка полей: Factory Type / Main Products /
///      Certifications / Export Markets / Total Employees / MOQ.
///   8. Пять вкладок: Posts / Products / About / Certificates / Reviews.
class PublicProfileScreen extends StatefulWidget {
  const PublicProfileScreen({super.key, required this.userId});
  final String userId;

  @override
  State<PublicProfileScreen> createState() => _PublicProfileScreenState();
}

class _PublicProfileScreenState extends State<PublicProfileScreen> {
  final _repo = ProfileRepository();
  PublicProfile? _profile;
  List<UserPostPreview>? _posts;
  String? _error;
  bool _loading = false;
  bool _followInFlight = false;

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
      final profile = await _repo.loadPublicProfile(widget.userId);
      final posts = await _repo.loadUserPosts(widget.userId);
      if (!mounted) return;
      setState(() {
        _profile = profile;
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

  Future<void> _toggleFollow() async {
    final p = _profile;
    if (p == null || _followInFlight || p.isMe) return;
    final was = p.isFollowing;
    setState(() {
      _followInFlight = true;
      _profile = PublicProfile(
        id: p.id,
        type: p.type,
        name: p.name,
        avatarUrl: p.avatarUrl,
        countryCode: p.countryCode,
        city: p.city,
        factoryCompanyName: p.factoryCompanyName,
        factoryDescription: p.factoryDescription,
        factoryWebsite: p.factoryWebsite,
        factoryWhatsapp: p.factoryWhatsapp,
        factoryAddress: p.factoryAddress,
        factoryCoverUrl: p.factoryCoverUrl,
        factoryType: p.factoryType,
        factoryMainProducts: p.factoryMainProducts,
        factoryCertifications: p.factoryCertifications,
        factoryExportMarkets: p.factoryExportMarkets,
        factoryTotalEmployees: p.factoryTotalEmployees,
        factoryEstablishedYear: p.factoryEstablishedYear,
        factoryHashtags: p.factoryHashtags,
        factoryTrustScore: p.factoryTrustScore,
        factoryTotalProducts: p.factoryTotalProducts,
        factoryTotalDeals: p.factoryTotalDeals,
        factoryAvgRating: p.factoryAvgRating,
        factoryReviewsCount: p.factoryReviewsCount,
        followersCount: p.followersCount + (was ? -1 : 1),
        followingCount: p.followingCount,
        isFollowing: !was,
        isMe: p.isMe,
      );
    });
    try {
      if (was) {
        await _repo.unfollow(p.id);
      } else {
        await _repo.follow(p.id);
      }
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _profile = p; // откат
      });
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(e.toString().replaceFirst('Exception: ', ''))),
      );
    } finally {
      if (mounted) setState(() => _followInFlight = false);
    }
  }

  void _openChat() {
    // Пока чат с заводом открывается через список диалогов из ленты;
    // из публичного профиля ведём туда же. Дальше здесь появится прямой
    // deep-link на conversation с этим userId.
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(AppLocalizations.of(context)!.postContact),
        duration: const Duration(seconds: 1),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context)!;
    return Scaffold(
      body: _buildBody(l),
    );
  }

  Widget _buildBody(AppLocalizations l) {
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
              const SizedBox(height: 12),
              Text(_error!, textAlign: TextAlign.center),
              const SizedBox(height: 12),
              FilledButton.tonal(onPressed: _load, child: Text(l.commonRetry)),
            ],
          ),
        ),
      );
    }
    final p = _profile!;
    return DefaultTabController(
      length: p.isFactory ? 5 : 1,
      child: NestedScrollView(
        headerSliverBuilder: (_, _) => [
          SliverToBoxAdapter(child: _buildHead(p, l)),
        ],
        body: p.isFactory ? _FactoryTabs(profile: p, posts: _posts ?? const [])
                          : _PostsGrid(posts: _posts ?? const []),
      ),
    );
  }

  Widget _buildHead(PublicProfile p, AppLocalizations l) {
    final scheme = Theme.of(context).colorScheme;
    final coverUrl = p.factoryCoverUrl != null
        ? ApiClient.resolveMediaUrl(p.factoryCoverUrl!)
        : null;
    final avatarUrl =
        p.avatarUrl != null ? ApiClient.resolveMediaUrl(p.avatarUrl!) : null;
    final place = [
      if (p.city != null && p.city!.isNotEmpty) p.city!,
      if (p.countryCode != null && p.countryCode!.isNotEmpty) p.countryCode!,
    ].join(', ');

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // Cover + аватар, наложенный на его нижнюю границу
        Stack(
          clipBehavior: Clip.none,
          children: [
            SizedBox(
              width: double.infinity,
              height: 156,
              child: coverUrl != null
                  ? CachedNetworkImage(
                      imageUrl: coverUrl,
                      fit: BoxFit.cover,
                      placeholder: (_, _) =>
                          Container(color: scheme.surfaceContainerHighest),
                      errorWidget: (_, _, _) =>
                          Container(color: scheme.surfaceContainerHighest),
                    )
                  : Container(
                      color: scheme.surfaceContainerHighest,
                    ),
            ),
            // Кнопка «назад» + share
            Positioned(
              top: MediaQuery.of(context).padding.top + 4,
              left: 8,
              right: 8,
              child: Row(
                children: [
                  _CircleIconButton(
                    icon: Icons.arrow_back_rounded,
                    onTap: () => Navigator.of(context).pop(),
                  ),
                  const Spacer(),
                  _CircleIconButton(
                    icon: Icons.ios_share_rounded,
                    onTap: () {},
                  ),
                  const SizedBox(width: 6),
                  _CircleIconButton(icon: Icons.more_horiz, onTap: () {}),
                ],
              ),
            ),
            // Аватар
            Positioned(
              left: 16,
              bottom: -34,
              child: Container(
                padding: const EdgeInsets.all(3),
                decoration: BoxDecoration(
                  color: scheme.surface,
                  shape: BoxShape.circle,
                ),
                child: CircleAvatar(
                  radius: 40,
                  backgroundColor: scheme.surfaceContainerHighest,
                  backgroundImage: avatarUrl != null
                      ? CachedNetworkImageProvider(avatarUrl)
                      : null,
                  child: avatarUrl == null
                      ? Text(
                          p.displayName.isNotEmpty
                              ? p.displayName[0].toUpperCase()
                              : '?',
                          style: TextStyle(
                            fontSize: 30,
                            color: scheme.onSurfaceVariant,
                            fontWeight: FontWeight.w700,
                          ),
                        )
                      : null,
                ),
              ),
            ),
            // Кнопки Contact / Follow справа от аватара, поверх cover'а снизу
            if (!p.isMe)
              Positioned(
                right: 16,
                bottom: -18,
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    FilledButton.icon(
                      onPressed: _openChat,
                      icon: const Icon(Icons.chat_rounded, size: 16),
                      label: Text(l.postContact),
                      style: FilledButton.styleFrom(
                        minimumSize: const Size(0, 36),
                        padding:
                            const EdgeInsets.symmetric(horizontal: 14),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(999),
                        ),
                      ),
                    ),
                    const SizedBox(width: 6),
                    OutlinedButton.icon(
                      onPressed: _followInFlight ? null : _toggleFollow,
                      icon: Icon(
                        p.isFollowing
                            ? Icons.person_remove_outlined
                            : Icons.person_add_alt_1_rounded,
                        size: 16,
                      ),
                      label: Text(
                          p.isFollowing ? l.postUnfollow : l.postFollow),
                      style: OutlinedButton.styleFrom(
                        minimumSize: const Size(0, 36),
                        padding:
                            const EdgeInsets.symmetric(horizontal: 14),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(999),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
          ],
        ),
        const SizedBox(height: 48),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Flexible(
                    child: Text(
                      p.displayName,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        fontSize: 22,
                        fontWeight: FontWeight.w800,
                        letterSpacing: -0.3,
                      ),
                    ),
                  ),
                  if (p.factoryTrustScore != null &&
                      p.factoryTrustScore! > 0) ...[
                    const SizedBox(width: 6),
                    Icon(Icons.verified_rounded,
                        size: 20, color: scheme.primary),
                  ],
                ],
              ),
              const SizedBox(height: 4),
              Row(
                children: [
                  if (place.isNotEmpty) ...[
                    Icon(Icons.place_outlined,
                        size: 14, color: scheme.onSurfaceVariant),
                    const SizedBox(width: 4),
                    Text(
                      place,
                      style: TextStyle(
                          color: scheme.onSurfaceVariant, fontSize: 13),
                    ),
                  ],
                  if (place.isNotEmpty && p.factoryEstablishedYear != null)
                    Text('  ·  ',
                        style: TextStyle(color: scheme.onSurfaceVariant)),
                  if (p.factoryEstablishedYear != null)
                    Text(
                      l.factoryEstablished(p.factoryEstablishedYear!),
                      style: TextStyle(
                          color: scheme.onSurfaceVariant, fontSize: 13),
                    ),
                ],
              ),
              if (p.factoryTrustScore != null &&
                  p.factoryTrustScore! > 0) ...[
                const SizedBox(height: 8),
                Container(
                  padding: const EdgeInsets.symmetric(
                      horizontal: 10, vertical: 5),
                  decoration: BoxDecoration(
                    color: scheme.primary.withValues(alpha: 0.12),
                    borderRadius: BorderRadius.circular(999),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(Icons.check_circle_rounded,
                          size: 14, color: scheme.primary),
                      const SizedBox(width: 5),
                      Text(
                        l.factoryVerifiedFactory,
                        style: TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.w700,
                          color: scheme.primary,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
              const SizedBox(height: 14),
              _StatsRow(profile: p, onFollowersTap: () {
                Navigator.of(context).push(
                  MaterialPageRoute(
                    builder: (_) => FollowListScreen(
                      userId: p.id,
                      mode: FollowListMode.followers,
                    ),
                  ),
                );
              }),
              if (p.factoryDescription != null &&
                  p.factoryDescription!.isNotEmpty) ...[
                const SizedBox(height: 14),
                Text(
                  p.factoryDescription!,
                  maxLines: 3,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(fontSize: 13.5, height: 1.4),
                ),
              ],
              const SizedBox(height: 12),
              _FactsGrid(profile: p, l: l),
              const SizedBox(height: 12),
              if ((p.factoryWhatsapp != null &&
                      p.factoryWhatsapp!.isNotEmpty) ||
                  (p.factoryWebsite != null && p.factoryWebsite!.isNotEmpty))
                Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    if (p.factoryWhatsapp != null &&
                        p.factoryWhatsapp!.isNotEmpty)
                      ProfileLink(
                        icon: Icons.chat_rounded,
                        text: 'wa.me/${p.factoryWhatsapp}',
                        url:
                            'https://wa.me/${p.factoryWhatsapp!.replaceAll(RegExp(r'[^0-9]'), '')}',
                      ),
                    if (p.factoryWebsite != null &&
                        p.factoryWebsite!.isNotEmpty)
                      ProfileLink(
                        icon: Icons.link_rounded,
                        text: p.factoryWebsite!,
                        url: p.factoryWebsite!.startsWith('http')
                            ? p.factoryWebsite!
                            : 'https://${p.factoryWebsite!}',
                      ),
                  ],
                ),
              const SizedBox(height: 8),
            ],
          ),
        ),
      ],
    );
  }
}

/// Круглая иконка на cover'e (назад / share / more).
class _CircleIconButton extends StatelessWidget {
  const _CircleIconButton({required this.icon, required this.onTap});
  final IconData icon;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(20),
      child: Container(
        width: 36,
        height: 36,
        decoration: const BoxDecoration(
          color: Colors.black45,
          shape: BoxShape.circle,
        ),
        child: Icon(icon, size: 20, color: Colors.white),
      ),
    );
  }
}

/// Ряд из четырёх счётчиков в шапке: Followers, Posts, Profile views, Rating.
class _StatsRow extends StatelessWidget {
  const _StatsRow({required this.profile, required this.onFollowersTap});
  final PublicProfile profile;
  final VoidCallback onFollowersTap;

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context)!;
    return Row(
      children: [
        Expanded(
          child: _Stat(
            value: '${profile.followersCount}',
            label: l.profileWordFollowers(profile.followersCount),
            onTap: onFollowersTap,
          ),
        ),
        Expanded(
          child: _Stat(
            value: '${profile.factoryTotalProducts ?? 0}',
            label: l.profileWordPosts(profile.factoryTotalProducts ?? 0),
          ),
        ),
        Expanded(
          child: _Stat(
            value: '—',
            label: l.factoryStatProfileViews,
          ),
        ),
        Expanded(
          child: _Stat(
            value: profile.factoryAvgRating > 0
                ? profile.factoryAvgRating.toStringAsFixed(1)
                : '—',
            label: l.factoryStatRating,
            starred: true,
          ),
        ),
      ],
    );
  }
}

class _Stat extends StatelessWidget {
  const _Stat({
    required this.value,
    required this.label,
    this.onTap,
    this.starred = false,
  });
  final String value;
  final String label;
  final VoidCallback? onTap;
  final bool starred;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(8),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 6),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  value,
                  style: const TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.w800,
                    letterSpacing: -0.3,
                    height: 1.1,
                  ),
                ),
                if (starred && value != '—') ...[
                  const SizedBox(width: 3),
                  const Icon(Icons.star_rounded,
                      size: 14, color: Colors.amber),
                ],
              ],
            ),
            const SizedBox(height: 2),
            Text(
              label,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(
                fontSize: 11.5,
                color: scheme.onSurfaceVariant,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Сетка фактов о заводе в две колонки — как в мокапе:
///     🏭 Factory Type            ✅ Certifications
///        Manufacturer               BSCI, ISO 9001, OEKO-TEX
///     📦 Main Products           🌐 Export Markets
///        Shirts, T-shirts, ...      Europe, North America, ...
///     👥 Total Employees         📏 MOQ
///        260+                       300 pcs per color
class _FactsGrid extends StatelessWidget {
  const _FactsGrid({required this.profile, required this.l});
  final PublicProfile profile;
  final AppLocalizations l;

  String _factoryTypeLabel(String? key) {
    switch (key) {
      case 'manufacturer':
        return l.editProfileFactoryTypeManufacturer;
      case 'trading':
        return l.editProfileFactoryTypeTrading;
      case 'both':
        return l.editProfileFactoryTypeBoth;
      default:
        return '—';
    }
  }

  @override
  Widget build(BuildContext context) {
    final items = <_Fact>[
      if (profile.factoryType != null)
        _Fact(Icons.factory_outlined, l.factoryFieldType,
            _factoryTypeLabel(profile.factoryType)),
      if (profile.factoryCertifications.isNotEmpty)
        _Fact(Icons.verified_outlined, l.factoryFieldCertifications,
            profile.factoryCertifications.join(', ')),
      if (profile.factoryMainProducts.isNotEmpty)
        _Fact(Icons.inventory_2_outlined, l.factoryFieldMainProducts,
            profile.factoryMainProducts.join(', ')),
      if (profile.factoryExportMarkets.isNotEmpty)
        _Fact(Icons.public_outlined, l.factoryFieldExportMarkets,
            profile.factoryExportMarkets.join(', ')),
      if (profile.factoryTotalEmployees != null &&
          profile.factoryTotalEmployees!.isNotEmpty)
        _Fact(Icons.groups_2_outlined, l.factoryFieldTotalEmployees,
            profile.factoryTotalEmployees!),
    ];
    if (items.isEmpty) return const SizedBox.shrink();

    // Раскладываем в 2 колонки построчно.
    final rows = <Widget>[];
    for (var i = 0; i < items.length; i += 2) {
      final left = items[i];
      final right = i + 1 < items.length ? items[i + 1] : null;
      rows.add(Padding(
        padding: const EdgeInsets.only(bottom: 10),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(child: _FactCell(fact: left)),
            const SizedBox(width: 12),
            Expanded(child: right == null ? const SizedBox() : _FactCell(fact: right)),
          ],
        ),
      ));
    }
    return Column(children: rows);
  }
}

class _Fact {
  const _Fact(this.icon, this.title, this.value);
  final IconData icon;
  final String title;
  final String value;
}

class _FactCell extends StatelessWidget {
  const _FactCell({required this.fact});
  final _Fact fact;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(fact.icon, size: 16, color: scheme.onSurfaceVariant),
        const SizedBox(width: 8),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                fact.title,
                style: TextStyle(
                  fontSize: 11.5,
                  color: scheme.onSurfaceVariant,
                ),
              ),
              const SizedBox(height: 2),
              Text(
                fact.value,
                style: const TextStyle(
                  fontSize: 12.5,
                  fontWeight: FontWeight.w700,
                  height: 1.25,
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

/// Пять вкладок: Posts / Products / About / Certificates / Reviews.
class _FactoryTabs extends StatelessWidget {
  const _FactoryTabs({required this.profile, required this.posts});
  final PublicProfile profile;
  final List<UserPostPreview> posts;

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context)!;
    final products =
        posts.where((p) => p.type == 'product').toList(growable: false);
    return Column(
      children: [
        TabBar(
          isScrollable: true,
          tabAlignment: TabAlignment.start,
          labelStyle:
              const TextStyle(fontSize: 13.5, fontWeight: FontWeight.w700),
          tabs: [
            Tab(text: l.factoryTabPosts),
            Tab(text: l.factoryTabProducts),
            Tab(text: l.factoryTabAbout),
            Tab(text: l.factoryTabCertificates),
            Tab(text: l.factoryTabReviews),
          ],
        ),
        Expanded(
          child: TabBarView(
            children: [
              _PostsGrid(posts: posts),
              products.isEmpty
                  ? _EmptyTab(text: l.factoryNoProducts)
                  : _PostsGrid(posts: products),
              _AboutTab(profile: profile),
              _CertificatesTab(profile: profile),
              _ReviewsTabPlaceholder(profile: profile),
            ],
          ),
        ),
      ],
    );
  }
}

class _PostsGrid extends StatelessWidget {
  const _PostsGrid({required this.posts});
  final List<UserPostPreview> posts;

  @override
  Widget build(BuildContext context) {
    if (posts.isEmpty) {
      return _EmptyTab(text: AppLocalizations.of(context)!.profileNoPostsYet);
    }
    final scheme = Theme.of(context).colorScheme;
    return GridView.builder(
      padding: const EdgeInsets.only(top: 4),
      gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
        crossAxisCount: 3,
        mainAxisSpacing: 2,
        crossAxisSpacing: 2,
      ),
      itemCount: posts.length,
      itemBuilder: (_, i) {
        final post = posts[i];
        final url = post.thumbnailUrl != null
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
              url != null
                  ? CachedNetworkImage(
                      imageUrl: url,
                      fit: BoxFit.cover,
                      placeholder: (_, _) =>
                          Container(color: scheme.surfaceContainerHighest),
                      errorWidget: (_, _, _) => Container(
                        color: scheme.surfaceContainerHighest,
                        child: Icon(Icons.broken_image,
                            color: scheme.onSurfaceVariant),
                      ),
                    )
                  : Container(
                      color: scheme.surfaceContainerHighest,
                      child: Icon(Icons.image,
                          color: scheme.onSurfaceVariant),
                    ),
              if (post.hasVideo)
                const Positioned(
                  top: 6,
                  right: 6,
                  child: Icon(Icons.play_arrow_rounded,
                      color: Colors.white, size: 22),
                ),
              if (post.isHotDeal)
                Positioned(
                  top: 6,
                  left: 6,
                  child: Container(
                    padding: const EdgeInsets.symmetric(
                        horizontal: 6, vertical: 2),
                    decoration: BoxDecoration(
                      color: Colors.red,
                      borderRadius: BorderRadius.circular(6),
                    ),
                    child: const Text(
                      'HOT',
                      style: TextStyle(
                        color: Colors.white,
                        fontSize: 10,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
                ),
            ],
          ),
        );
      },
    );
  }
}

class _AboutTab extends StatelessWidget {
  const _AboutTab({required this.profile});
  final PublicProfile profile;

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context)!;
    final scheme = Theme.of(context).colorScheme;
    final desc = profile.factoryDescription;
    final address = profile.factoryAddress;
    if ((desc == null || desc.isEmpty) &&
        (address == null || address.isEmpty) &&
        profile.factoryHashtags.isEmpty) {
      return _EmptyTab(text: l.factoryNoAboutInfo);
    }
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        if (desc != null && desc.isNotEmpty) ...[
          Text(desc, style: const TextStyle(fontSize: 14, height: 1.45)),
          const SizedBox(height: 16),
        ],
        if (address != null && address.isNotEmpty) ...[
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Icon(Icons.storefront_outlined,
                  size: 18, color: scheme.onSurfaceVariant),
              const SizedBox(width: 8),
              Expanded(
                child: Text(address,
                    style: const TextStyle(fontSize: 13.5, height: 1.35)),
              ),
            ],
          ),
          const SizedBox(height: 16),
        ],
        if (profile.factoryHashtags.isNotEmpty)
          Wrap(
            spacing: 6,
            runSpacing: 6,
            children: profile.factoryHashtags
                .map((tag) => ActionChip(
                      label: Text('#$tag'),
                      visualDensity: VisualDensity.compact,
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
    );
  }
}

class _CertificatesTab extends StatelessWidget {
  const _CertificatesTab({required this.profile});
  final PublicProfile profile;

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context)!;
    final scheme = Theme.of(context).colorScheme;
    if (profile.factoryCertifications.isEmpty) {
      return _EmptyTab(text: l.factoryNoCertificates);
    }
    return ListView.separated(
      padding: const EdgeInsets.all(16),
      itemCount: profile.factoryCertifications.length,
      separatorBuilder: (_, _) => const SizedBox(height: 10),
      itemBuilder: (_, i) {
        final cert = profile.factoryCertifications[i];
        return Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
          decoration: BoxDecoration(
            color: scheme.surfaceContainerHighest.withValues(alpha: 0.5),
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: scheme.outlineVariant),
          ),
          child: Row(
            children: [
              Icon(Icons.verified_outlined,
                  color: scheme.primary, size: 22),
              const SizedBox(width: 12),
              Expanded(
                child: Text(
                  cert,
                  style: const TextStyle(
                      fontSize: 14.5, fontWeight: FontWeight.w700),
                ),
              ),
            ],
          ),
        );
      },
    );
  }
}

class _ReviewsTabPlaceholder extends StatelessWidget {
  const _ReviewsTabPlaceholder({required this.profile});
  final PublicProfile profile;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final l = AppLocalizations.of(context)!;
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.reviews_outlined,
                size: 56, color: scheme.onSurfaceVariant),
            const SizedBox(height: 12),
            Text(
              profile.factoryReviewsCount > 0
                  ? '${profile.factoryAvgRating.toStringAsFixed(1)} ★ · ${l.publicProfileReviewsCountPlural(profile.factoryReviewsCount)}'
                  : l.publicProfileNoReviewsTitle,
              style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600),
            ),
            const SizedBox(height: 14),
            FilledButton.tonal(
              onPressed: () {
                Navigator.of(context).push(
                  MaterialPageRoute(
                    builder: (_) => ReviewsListScreen(
                      factoryId: profile.id,
                      factoryName: profile.displayName,
                      canWriteReview: !profile.isMe,
                    ),
                  ),
                );
              },
              child: Text(l.publicProfileReviewsSeeAll(
                  '${profile.factoryReviewsCount}')),
            ),
          ],
        ),
      ),
    );
  }
}

class _EmptyTab extends StatelessWidget {
  const _EmptyTab({required this.text});
  final String text;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Text(
          text,
          textAlign: TextAlign.center,
          style: TextStyle(
            color: Theme.of(context).colorScheme.onSurfaceVariant,
          ),
        ),
      ),
    );
  }
}
