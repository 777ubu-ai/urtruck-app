import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import '../../../core/api/api_client.dart';
import '../../../core/widgets/loading_skeleton.dart';
import '../../../l10n/app_localizations.dart';
import '../data/profile_repository.dart';
import 'public_profile_screen.dart';

/// Экран со списком подписчиков или подписок конкретного юзера.
/// Один и тот же виджет используется для обоих режимов — отличается только
/// заголовок и метод репозитория.
class FollowListScreen extends StatefulWidget {
  const FollowListScreen({
    super.key,
    required this.userId,
    required this.mode,
    this.title,
  });

  final String userId;
  final FollowListMode mode;
  final String? title;

  @override
  State<FollowListScreen> createState() => _FollowListScreenState();
}

enum FollowListMode { followers, following }

class _FollowListScreenState extends State<FollowListScreen> {
  final _repo = ProfileRepository();
  List<FollowUser>? _items;
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
      final list = widget.mode == FollowListMode.followers
          ? await _repo.loadFollowers(widget.userId)
          : await _repo.loadFollowing(widget.userId);
      if (!mounted) return;
      setState(() {
        _items = list;
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

  String _resolveTitle(AppLocalizations l) {
    if (widget.title != null) return widget.title!;
    return widget.mode == FollowListMode.followers
        ? l.followersTitle
        : l.followingTitle;
  }

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context)!;
    return Scaffold(
      appBar: AppBar(title: Text(_resolveTitle(l))),
      body: _buildBody(l),
    );
  }

  Widget _buildBody(AppLocalizations l) {
    if (_loading && _items == null) {
      return ListView.separated(
        itemCount: 8,
        separatorBuilder: (_, __) => const Divider(height: 1, indent: 72),
        itemBuilder: (_, __) => const Padding(
          padding: EdgeInsets.symmetric(horizontal: 12, vertical: 8),
          child: CompactPostTileSkeleton(),
        ),
      );
    }
    if (_error != null && _items == null) {
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
                child: Text(l.commonRetry),
              ),
            ],
          ),
        ),
      );
    }
    final items = _items ?? const [];
    if (items.isEmpty) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(
                widget.mode == FollowListMode.followers
                    ? Icons.people_outline
                    : Icons.person_add_outlined,
                size: 96,
                color: Theme.of(context).colorScheme.onSurfaceVariant,
              ),
              const SizedBox(height: 16),
              Text(
                widget.mode == FollowListMode.followers
                    ? l.followNoFollowers
                    : l.followNoFollowing,
                textAlign: TextAlign.center,
                style: Theme.of(context).textTheme.titleLarge,
              ),
            ],
          ),
        ),
      );
    }
    return RefreshIndicator(
      onRefresh: _load,
      child: ListView.separated(
        itemCount: items.length,
        separatorBuilder: (_, __) => const Divider(height: 1, indent: 72),
        itemBuilder: (_, i) => _FollowUserTile(user: items[i]),
      ),
    );
  }
}

class _FollowUserTile extends StatelessWidget {
  const _FollowUserTile({required this.user});
  final FollowUser user;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final l = AppLocalizations.of(context)!;
    final avatarUrl =
        user.avatarUrl != null ? ApiClient.resolveMediaUrl(user.avatarUrl!) : null;
    return ListTile(
      leading: CircleAvatar(
        radius: 24,
        backgroundColor: scheme.surfaceContainerHighest,
        backgroundImage:
            avatarUrl != null ? CachedNetworkImageProvider(avatarUrl) : null,
        child: avatarUrl == null
            ? Text(
                user.displayName.isNotEmpty
                    ? user.displayName[0].toUpperCase()
                    : '?',
                style: TextStyle(
                  color: scheme.onSurfaceVariant,
                  fontWeight: FontWeight.w600,
                ),
              )
            : null,
      ),
      title: Text(
        user.displayName,
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
      ),
      subtitle: Text(
        user.type == 'factory' ? l.chatPartnerFactory : l.chatPartnerBuyer,
        style: TextStyle(color: scheme.onSurfaceVariant),
      ),
      trailing: const Icon(Icons.chevron_right),
      onTap: () {
        Navigator.of(context).push(
          MaterialPageRoute(
            builder: (_) => PublicProfileScreen(userId: user.id),
          ),
        );
      },
    );
  }
}
