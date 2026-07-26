import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import '../../../core/api/api_client.dart';
import '../../../l10n/app_localizations.dart';
import '../../feed/presentation/hashtag_screen.dart';
import '../../feed/presentation/post_detail_screen.dart';
import '../../reviews/presentation/reviews_list_screen.dart';
import '../data/profile_repository.dart';
import 'follow_list_screen.dart';

/// Публичный профиль чужого юзера. Показывает аватар, имя, тип, страну,
/// для завода — компанию/Trust Score/хэштеги, follow-кнопку, счётчики
/// подписчиков/подписок (тапаются → FollowListScreen) и сетку постов.
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

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context)!;
    return Scaffold(
      appBar: AppBar(
        title: Text(_profile?.displayName ?? l.profileTitle),
      ),
      body: _buildBody(),
    );
  }

  Widget _buildBody() {
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
              FilledButton.tonal(
                onPressed: _load,
                child: Text(AppLocalizations.of(context)!.commonRetry),
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
        padding: const EdgeInsets.symmetric(vertical: 16),
        children: [
          _buildHeader(p),
          const SizedBox(height: 16),
          _buildStats(p),
          if (p.isFactory) ...[
            const SizedBox(height: 16),
            _buildRatingCard(p),
            const SizedBox(height: 16),
            _buildFactoryCard(p),
          ],
          const SizedBox(height: 16),
          _buildPostsGrid(),
        ],
      ),
    );
  }

  Widget _buildHeader(PublicProfile p) {
    final scheme = Theme.of(context).colorScheme;
    final l = AppLocalizations.of(context)!;
    final avatarUrl =
        p.avatarUrl != null ? ApiClient.resolveMediaUrl(p.avatarUrl!) : null;
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: Row(
        children: [
          CircleAvatar(
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
                      fontSize: 28,
                      color: scheme.onSurfaceVariant,
                      fontWeight: FontWeight.w600,
                    ),
                  )
                : null,
          ),
          const SizedBox(width: 16),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  p.displayName,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: Theme.of(context).textTheme.titleLarge?.copyWith(
                        fontWeight: FontWeight.w700,
                      ),
                ),
                const SizedBox(height: 4),
                Text(
                  p.isFactory ? l.authRoleFactory : l.authRoleBuyer,
                  style: TextStyle(color: scheme.onSurfaceVariant),
                ),
                if (p.city != null || p.countryCode != null) ...[
                  const SizedBox(height: 4),
                  Text(
                    [
                      if (p.city != null) p.city!,
                      if (p.countryCode != null) p.countryCode!,
                    ].join(', '),
                    style: TextStyle(
                      color: scheme.onSurfaceVariant,
                      fontSize: 13,
                    ),
                  ),
                ],
                if (!p.isMe) ...[
                  const SizedBox(height: 8),
                  SizedBox(
                    height: 36,
                    child: p.isFollowing
                        ? OutlinedButton(
                            onPressed: _followInFlight ? null : _toggleFollow,
                            child: Text(l.postUnfollow),
                          )
                        : FilledButton(
                            onPressed: _followInFlight ? null : _toggleFollow,
                            child: Text(l.postFollow),
                          ),
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildStats(PublicProfile p) {
    final l = AppLocalizations.of(context)!;
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: Row(
        children: [
          // Товары — только у заводов. Число живое (тот же счёт, что и сетка
          // ниже), поэтому разойтись с самой сеткой не может.
          if (p.isFactory) ...[
            Expanded(
              child: _StatTile(
                label: l.profileWordProducts(p.factoryTotalProducts ?? 0),
                value: '${p.factoryTotalProducts ?? 0}',
              ),
            ),
            const SizedBox(width: 12),
          ],
          Expanded(
            child: _StatTile(
              label: l.publicProfileFollowersLabel,
              value: p.followersCount.toString(),
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
          ),
          const SizedBox(width: 12),
          Expanded(
            child: _StatTile(
              label: l.publicProfileFollowingLabel,
              value: p.followingCount.toString(),
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
          ),
        ],
      ),
    );
  }

  Widget _buildRatingCard(PublicProfile p) {
    final scheme = Theme.of(context).colorScheme;
    final l = AppLocalizations.of(context)!;
    final rating = p.factoryAvgRating;
    final count = p.factoryReviewsCount;
    final hasReviews = count > 0;
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: Card(
        child: InkWell(
          borderRadius: BorderRadius.circular(12),
          onTap: () {
            Navigator.of(context).push(
              MaterialPageRoute(
                builder: (_) => ReviewsListScreen(
                  factoryId: p.id,
                  factoryName: p.displayName,
                  canWriteReview: !p.isMe,
                ),
              ),
            );
          },
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Row(
              children: [
                Icon(Icons.star, color: Colors.amber, size: 32),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(
                        hasReviews
                            ? rating.toStringAsFixed(1)
                            : l.publicProfileNoReviewsTitle,
                        style: Theme.of(context)
                            .textTheme
                            .headlineSmall
                            ?.copyWith(fontWeight: FontWeight.w700),
                      ),
                      if (hasReviews)
                        Text(
                          l.publicProfileReviewsSeeAll(
                            l.publicProfileReviewsCountPlural(count),
                          ),
                          style: TextStyle(
                            color: scheme.onSurfaceVariant,
                            fontSize: 13,
                          ),
                        )
                      else
                        Text(
                          p.isMe
                              ? l.publicProfileGetFirstReview
                              : l.publicProfileBeFirstReviewer,
                          style: TextStyle(
                            color: scheme.onSurfaceVariant,
                            fontSize: 13,
                          ),
                        ),
                    ],
                  ),
                ),
                const Icon(Icons.chevron_right),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildFactoryCard(PublicProfile p) {
    final scheme = Theme.of(context).colorScheme;
    final l = AppLocalizations.of(context)!;
    final score = p.factoryTrustScore ?? 50;
    final trustColor = score >= 90
        ? Colors.green
        : score >= 70
            ? Colors.orange
            : Colors.grey;
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: Card(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(l.publicProfileAboutFactory,
                  style: Theme.of(context).textTheme.titleMedium?.copyWith(
                        fontWeight: FontWeight.w700,
                      )),
              const SizedBox(height: 12),
              Row(
                children: [
                  Icon(Icons.verified, size: 18, color: trustColor),
                  const SizedBox(width: 8),
                  Text(l.feedTrustScore(score)),
                ],
              ),
              const SizedBox(height: 8),
              Row(
                children: [
                  Icon(Icons.inventory_2_outlined,
                      size: 18, color: scheme.onSurfaceVariant),
                  const SizedBox(width: 8),
                  Text(l.publicProfileTotalProducts(p.factoryTotalProducts ?? 0)),
                  const SizedBox(width: 16),
                  Icon(Icons.handshake_outlined,
                      size: 18, color: scheme.onSurfaceVariant),
                  const SizedBox(width: 8),
                  Text(l.publicProfileTotalDeals(p.factoryTotalDeals ?? 0)),
                ],
              ),
              if (p.factoryHashtags.isNotEmpty) ...[
                const SizedBox(height: 12),
                Wrap(
                  spacing: 6,
                  children: p.factoryHashtags
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
      ),
    );
  }

  Widget _buildPostsGrid() {
    final posts = _posts ?? const [];
    final scheme = Theme.of(context).colorScheme;
    final l = AppLocalizations.of(context)!;
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            l.publicProfilePosts,
            style: Theme.of(context).textTheme.titleMedium?.copyWith(
                  fontWeight: FontWeight.w700,
                ),
          ),
          const SizedBox(height: 12),
          if (posts.isEmpty)
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(24),
              alignment: Alignment.center,
              child: Text(
                l.publicProfileNoPosts,
                style: TextStyle(color: scheme.onSurfaceVariant),
              ),
            )
          else
            GridView.builder(
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                crossAxisCount: 3,
                mainAxisSpacing: 4,
                crossAxisSpacing: 4,
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
                      ClipRRect(
                        borderRadius: BorderRadius.circular(4),
                        child: url != null
                            ? CachedNetworkImage(
                                imageUrl: url,
                                fit: BoxFit.cover,
                                placeholder: (_, __) => Container(
                                    color: scheme.surfaceContainerHighest),
                                errorWidget: (_, __, ___) => Container(
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
                      ),
                      if (post.isHotDeal)
                        Positioned(
                          top: 4,
                          right: 4,
                          child: Container(
                            padding: const EdgeInsets.symmetric(
                                horizontal: 6, vertical: 2),
                            decoration: BoxDecoration(
                              color: Colors.red,
                              borderRadius: BorderRadius.circular(8),
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
            ),
        ],
      ),
    );
  }
}

class _StatTile extends StatelessWidget {
  const _StatTile({
    required this.label,
    required this.value,
    this.onTap,
  });
  final String label;
  final String value;

  /// null — плитка не кликабельна (товары открываются из сетки ниже).
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(12),
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 12),
        decoration: BoxDecoration(
          color: scheme.surfaceContainerHighest,
          borderRadius: BorderRadius.circular(12),
        ),
        child: Column(
          children: [
            Text(
              value,
              style: Theme.of(context).textTheme.titleLarge?.copyWith(
                    fontWeight: FontWeight.w700,
                  ),
            ),
            const SizedBox(height: 2),
            Text(
              label,
              style: TextStyle(
                color: scheme.onSurfaceVariant,
                fontSize: 12,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
