import 'dart:async';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import '../../../core/api/api_client.dart';
import '../../../core/storage/auth_storage.dart';
import '../../../l10n/app_localizations.dart';
import '../../create_post/data/create_post_repository.dart';
import '../data/stories_repository.dart';
import 'stories_viewer_screen.dart';

/// Горизонтальная лента-кольцо stories — отображается в самом верху главного
/// фида ленты. Каждый круг = автор с активными stories. Тап → fullscreen
/// viewer (см. `StoriesViewerScreen`).
///
/// Загружает /stories при первом монтировании. Polling не делает —
/// stories редко меняются, лента обновляется при возврате с viewer'а.
class StoriesRing extends StatefulWidget {
  const StoriesRing({super.key});

  @override
  State<StoriesRing> createState() => _StoriesRingState();
}

class _StoriesRingState extends State<StoriesRing> {
  final _repo = StoriesRepository();
  final _uploadsRepo = CreatePostRepository();
  final _picker = ImagePicker();
  List<StoryGroup> _groups = const [];
  bool _loading = false;
  bool _isFactory = false;
  bool _creating = false;

  @override
  void initState() {
    super.initState();
    _load();
    _loadUserType();
  }

  Future<void> _loadUserType() async {
    try {
      final type = await AuthStorage.instance.readUserType();
      if (mounted && type == 'factory') {
        setState(() => _isFactory = true);
      }
    } catch (_) {/* нет сессии — кнопка создания не покажется */}
  }

  /// Тап на кнопку «+» — выбор фото и создание story.
  Future<void> _createStory() async {
    if (_creating) return;
    // Снимаем тексты ДО await'ов, чтобы не обращаться к `context`
    // через async gap (анализатор ругается на use_build_context_synchronously).
    final l = AppLocalizations.of(context)!;
    final uploadError = l.storyPhotoUploadError;
    final publishedSnack = l.storyPublishedSnack;
    try {
      final picked = await _picker.pickImage(
        source: ImageSource.gallery,
        maxWidth: 1080,
        imageQuality: 85,
      );
      if (picked == null) return;
      setState(() => _creating = true);

      // Загружаем фото
      final bytes = await picked.readAsBytes();
      final uploaded = await _uploadsRepo.uploadImages([
        (filename: picked.name, bytes: bytes),
      ]);
      if (uploaded.isEmpty) {
        throw Exception(uploadError);
      }

      // Создаём story (без caption — простейший flow для MVP)
      await _repo.createStory(mediaUrl: uploaded.first.url);

      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(publishedSnack),
          duration: const Duration(seconds: 2),
        ),
      );
      // Освежаем ring чтобы новая story появилась
      await _load();
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(e.toString().replaceFirst('Exception: ', '')),
          duration: const Duration(seconds: 3),
        ),
      );
    } finally {
      if (mounted) setState(() => _creating = false);
    }
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
    });
    try {
      final groups = await _repo.loadGroups();
      if (!mounted) return;
      setState(() {
        _groups = groups;
        _loading = false;
      });
    } catch (_) {
      // Stories — best-effort: тихо игнорируем ошибку загрузки.
      // Полоска просто не покажется, лента продолжит работать.
      if (!mounted) return;
      setState(() => _loading = false);
    }
  }

  Future<void> _openViewer(int groupIndex) async {
    await Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => StoriesViewerScreen(
          groups: _groups,
          initialGroupIndex: groupIndex,
        ),
      ),
    );
    // На возврате — освежаем (могли появиться новые stories или истечь старые)
    _load();
  }

  @override
  Widget build(BuildContext context) {
    if (_loading && _groups.isEmpty && !_isFactory) {
      return const SizedBox(
        height: 100,
        child: Center(
          child: SizedBox(
            width: 20,
            height: 20,
            child: CircularProgressIndicator(strokeWidth: 2),
          ),
        ),
      );
    }
    // Если нет stories и юзер не factory — ничего не рисуем (лента сразу
    // с постов). Если factory — всё равно показываем кнопку «+» чтобы он
    // мог создать первую story.
    if (_groups.isEmpty && !_isFactory) {
      return const SizedBox.shrink();
    }
    // +1 пункт в начале для кнопки «+» (только для factory)
    final extraStart = _isFactory ? 1 : 0;
    return SizedBox(
      height: 110,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        itemCount: _groups.length + extraStart,
        separatorBuilder: (_, __) => const SizedBox(width: 4),
        itemBuilder: (_, i) {
          if (extraStart == 1 && i == 0) {
            return _AddStoryCircle(
              creating: _creating,
              onTap: _createStory,
            );
          }
          final groupIdx = i - extraStart;
          return _StoryCircle(
            group: _groups[groupIdx],
            onTap: () => _openViewer(groupIdx),
          );
        },
      ),
    );
  }
}

/// Кнопка «+» в начале StoriesRing — только для factory. Запускает image
/// picker и создаёт story через repository.
class _AddStoryCircle extends StatelessWidget {
  const _AddStoryCircle({required this.creating, required this.onTap});
  final bool creating;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return InkWell(
      onTap: creating ? null : onTap,
      borderRadius: BorderRadius.circular(40),
      child: SizedBox(
        width: 76,
        child: Column(
          children: [
            // Фирменный градиентный кружок вместо плоского серого —
            // задаёт «живой» тон всей ленте с первого экрана.
            Container(
              width: 64,
              height: 64,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                gradient: const LinearGradient(
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                  colors: [Color(0xFF0B66FF), Color(0xFF00C2FF)],
                ),
                boxShadow: [
                  BoxShadow(
                    color: const Color(0xFF0B66FF).withValues(alpha: 0.28),
                    blurRadius: 12,
                    offset: const Offset(0, 4),
                  ),
                ],
              ),
              child: Center(
                child: creating
                    ? const SizedBox(
                        width: 20,
                        height: 20,
                        child: CircularProgressIndicator(
                          strokeWidth: 2,
                          valueColor:
                              AlwaysStoppedAnimation<Color>(Colors.white),
                        ),
                      )
                    : const Icon(Icons.add_rounded,
                        size: 30, color: Colors.white),
              ),
            ),
            const SizedBox(height: 6),
            Text(
              AppLocalizations.of(context)!.storyAddLabel,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              textAlign: TextAlign.center,
              style: TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w600,
                color: scheme.onSurface,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _StoryCircle extends StatelessWidget {
  const _StoryCircle({required this.group, required this.onTap});
  final StoryGroup group;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final author = group.author;
    final initial = author.displayName.isNotEmpty
        ? author.displayName[0].toUpperCase()
        : '?';
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(40),
      child: SizedBox(
        width: 76,
        child: Column(
          children: [
            Container(
              width: 64,
              height: 64,
              padding: const EdgeInsets.all(2.5),
              decoration: BoxDecoration(
                gradient: const LinearGradient(
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                  colors: [
                    Color(0xFFFFA000),
                    Color(0xFFE91E63),
                    Color(0xFF9C27B0),
                  ],
                ),
                shape: BoxShape.circle,
              ),
              child: Container(
                padding: const EdgeInsets.all(2),
                decoration: BoxDecoration(
                  color: Theme.of(context).colorScheme.surface,
                  shape: BoxShape.circle,
                ),
                child: CircleAvatar(
                  backgroundColor: scheme.primaryContainer,
                  backgroundImage: author.avatarUrl != null
                      ? NetworkImage(
                          ApiClient.resolveMediaUrl(author.avatarUrl!))
                      : null,
                  child: author.avatarUrl == null
                      ? Text(
                          initial,
                          style: TextStyle(
                            fontWeight: FontWeight.w700,
                            color: scheme.onPrimaryContainer,
                          ),
                        )
                      : null,
                ),
              ),
            ),
            const SizedBox(height: 4),
            Text(
              author.displayName,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.bodySmall,
            ),
          ],
        ),
      ),
    );
  }
}
