import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import '../../../core/api/api_client.dart';
import '../../../l10n/app_localizations.dart';
import '../data/stories_repository.dart';

/// Полноэкранный viewer stories с auto-advance таймером.
///
/// Логика:
///   - Принимает массив групп и стартовый индекс группы (на какой пользователь
///     тапнул в ring-виджете)
///   - Показывает stories выбранной группы по очереди, авто-переключение
///     каждые 5 секунд
///   - Прогресс-бары вверху отображают сколько прошло на каждой story
///   - Тап слева → предыдущая, тап справа → следующая, swipe-down → закрыть
///   - На последней story группы — переход к следующей группе (если есть)
///   - Каждый просмотр инкрементит view counter через POST /stories/:id/view
class StoriesViewerScreen extends StatefulWidget {
  const StoriesViewerScreen({
    super.key,
    required this.groups,
    required this.initialGroupIndex,
  });

  final List<StoryGroup> groups;
  final int initialGroupIndex;

  @override
  State<StoriesViewerScreen> createState() => _StoriesViewerScreenState();
}

class _StoriesViewerScreenState extends State<StoriesViewerScreen>
    with SingleTickerProviderStateMixin {
  static const _storyDuration = Duration(seconds: 5);

  final _repo = StoriesRepository();
  late int _groupIndex;
  int _storyIndex = 0;
  late AnimationController _progressController;
  bool _paused = false;

  StoryGroup get _currentGroup => widget.groups[_groupIndex];
  StoryItem get _currentStory => _currentGroup.stories[_storyIndex];

  @override
  void initState() {
    super.initState();
    _groupIndex = widget.initialGroupIndex.clamp(0, widget.groups.length - 1);
    _progressController = AnimationController(
      vsync: this,
      duration: _storyDuration,
    )..addStatusListener((status) {
        if (status == AnimationStatus.completed) {
          _next();
        }
      });
    _startCurrentStory();
  }

  @override
  void dispose() {
    _progressController.dispose();
    super.dispose();
  }

  void _startCurrentStory() {
    _progressController.reset();
    _progressController.forward();
    // Fire-and-forget view counter
    _repo.markViewed(_currentStory.id);
  }

  void _next() {
    final group = _currentGroup;
    if (_storyIndex < group.stories.length - 1) {
      setState(() => _storyIndex++);
      _startCurrentStory();
    } else if (_groupIndex < widget.groups.length - 1) {
      setState(() {
        _groupIndex++;
        _storyIndex = 0;
      });
      _startCurrentStory();
    } else {
      // Закончились все stories — закрываем
      Navigator.of(context).pop();
    }
  }

  void _prev() {
    if (_storyIndex > 0) {
      setState(() => _storyIndex--);
      _startCurrentStory();
    } else if (_groupIndex > 0) {
      setState(() {
        _groupIndex--;
        _storyIndex = widget.groups[_groupIndex].stories.length - 1;
      });
      _startCurrentStory();
    } else {
      // Уже на самой первой — пауза, не закрываем
      _progressController.reset();
      _progressController.forward();
    }
  }

  void _pause() {
    if (_paused) return;
    _progressController.stop();
    setState(() => _paused = true);
  }

  void _resume() {
    if (!_paused) return;
    _progressController.forward();
    setState(() => _paused = false);
  }

  @override
  Widget build(BuildContext context) {
    final story = _currentStory;
    final group = _currentGroup;
    final imageUrl = ApiClient.resolveMediaUrl(story.mediaUrl);
    return Scaffold(
      backgroundColor: Colors.black,
      body: GestureDetector(
        onLongPressStart: (_) => _pause(),
        onLongPressEnd: (_) => _resume(),
        onVerticalDragEnd: (details) {
          // Свайп вниз → закрыть
          if ((details.primaryVelocity ?? 0) > 300) {
            Navigator.of(context).pop();
          }
        },
        child: Stack(
          children: [
            // Медиа на весь экран
            Positioned.fill(
              child: CachedNetworkImage(
                imageUrl: imageUrl,
                fit: BoxFit.contain,
                placeholder: (_, __) => const Center(
                  child: CircularProgressIndicator(color: Colors.white),
                ),
                errorWidget: (_, __, ___) => const Center(
                  child: Icon(Icons.broken_image,
                      color: Colors.white54, size: 64),
                ),
              ),
            ),
            // Тап-зоны для prev / next
            Row(
              children: [
                Expanded(
                  child: GestureDetector(
                    behavior: HitTestBehavior.opaque,
                    onTap: _prev,
                  ),
                ),
                Expanded(
                  child: GestureDetector(
                    behavior: HitTestBehavior.opaque,
                    onTap: _next,
                  ),
                ),
              ],
            ),
            // Topbar: progress bars + author + close
            SafeArea(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(8, 8, 8, 0),
                child: Column(
                  children: [
                    // Progress bars — один сегмент на каждую story в группе
                    Row(
                      children: List.generate(group.stories.length, (i) {
                        return Expanded(
                          child: Padding(
                            padding: const EdgeInsets.symmetric(horizontal: 2),
                            child: ClipRRect(
                              borderRadius: BorderRadius.circular(2),
                              child: SizedBox(
                                height: 3,
                                child: i < _storyIndex
                                    ? Container(color: Colors.white)
                                    : i > _storyIndex
                                        ? Container(
                                            color: Colors.white
                                                .withValues(alpha: 0.4),
                                          )
                                        : AnimatedBuilder(
                                            animation: _progressController,
                                            builder: (_, __) =>
                                                LinearProgressIndicator(
                                              value: _progressController.value,
                                              backgroundColor: Colors.white
                                                  .withValues(alpha: 0.4),
                                              valueColor:
                                                  const AlwaysStoppedAnimation<
                                                      Color>(Colors.white),
                                            ),
                                          ),
                              ),
                            ),
                          ),
                        );
                      }),
                    ),
                    const SizedBox(height: 12),
                    // Заголовок: аватар + название + время + close
                    Row(
                      children: [
                        CircleAvatar(
                          radius: 16,
                          backgroundColor: Colors.white24,
                          backgroundImage: group.author.avatarUrl != null
                              ? NetworkImage(ApiClient.resolveMediaUrl(
                                  group.author.avatarUrl!))
                              : null,
                          child: group.author.avatarUrl == null
                              ? Text(
                                  group.author.displayName.isNotEmpty
                                      ? group.author.displayName[0]
                                          .toUpperCase()
                                      : '?',
                                  style: const TextStyle(
                                    color: Colors.white,
                                    fontWeight: FontWeight.w700,
                                  ),
                                )
                              : null,
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Text(
                                group.author.displayName,
                                style: const TextStyle(
                                  color: Colors.white,
                                  fontWeight: FontWeight.w700,
                                  fontSize: 14,
                                ),
                                overflow: TextOverflow.ellipsis,
                              ),
                              Text(
                                _timeAgo(
                                    story.createdAt,
                                    AppLocalizations.of(context)!),
                                style: const TextStyle(
                                  color: Colors.white70,
                                  fontSize: 11,
                                ),
                              ),
                            ],
                          ),
                        ),
                        IconButton(
                          icon: const Icon(Icons.close, color: Colors.white),
                          onPressed: () => Navigator.of(context).pop(),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ),
            // Caption внизу
            if (story.caption != null && story.caption!.isNotEmpty)
              Positioned(
                left: 16,
                right: 16,
                bottom: 32,
                child: Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: Colors.black.withValues(alpha: 0.5),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Text(
                    story.caption!,
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 14,
                    ),
                    maxLines: 3,
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }

  static String _timeAgo(DateTime dt, AppLocalizations l) {
    final diff = DateTime.now().difference(dt);
    if (diff.inMinutes < 1) return l.storyTimeJustNow;
    if (diff.inMinutes < 60) return l.storyTimeMinutesShort(diff.inMinutes);
    if (diff.inHours < 24) return l.storyTimeHoursShort(diff.inHours);
    return l.storyTimeDaysShort(diff.inDays);
  }
}
