import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import '../../../core/api/api_client.dart';
import '../../create_post/data/create_post_repository.dart';
import '../../stories/data/stories_repository.dart';
import '../../stories/presentation/stories_viewer_screen.dart';

/// Ряд «Актуальное» в профиле — горизонтальная лента кружков.
///
/// Показывает собственные активные stories владельца профиля: каждый кружок
/// открывает полноэкранный просмотр. Первым кружком у заводов идёт «Новое» —
/// выбор фото и публикация story, тот же поток, что и в ленте.
///
/// Это не заглушка: кружки строятся из настоящих stories пользователя.
/// Если stories нет и создавать их нельзя (покупатель), ряд не рисуется —
/// пустая полоса кружков-пустышек только занимала бы место.
class ProfileHighlights extends StatefulWidget {
  const ProfileHighlights({
    super.key,
    required this.userId,
    required this.canCreate,
  });

  /// Чей профиль открыт — чьи stories показываем.
  final String userId;

  /// Можно ли добавлять новые (свой профиль + тип «завод»).
  final bool canCreate;

  @override
  ProfileHighlightsState createState() => ProfileHighlightsState();
}

class ProfileHighlightsState extends State<ProfileHighlights> {
  final _repo = StoriesRepository();
  final _uploads = CreatePostRepository();
  final _picker = ImagePicker();

  List<StoryGroup> _groups = const [];
  StoryGroup? _mine;
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final groups = await _repo.loadGroups();
      if (!mounted) return;
      StoryGroup? mine;
      for (final g in groups) {
        if (g.author.id == widget.userId) {
          mine = g;
          break;
        }
      }
      setState(() {
        _groups = groups;
        _mine = mine;
      });
    } catch (_) {
      // Ряд «Актуальное» — не критичная часть экрана: при ошибке просто
      // не показываем его, профиль продолжает работать.
    }
  }

  Future<void> _openViewer() async {
    final mine = _mine;
    if (mine == null) return;
    final index = _groups.indexOf(mine);
    await Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => StoriesViewerScreen(
          groups: _groups,
          initialGroupIndex: index < 0 ? 0 : index,
        ),
      ),
    );
    if (mounted) _load();
  }

  /// Публичный вход — панель «Создать» с «плюса» в шапке профиля ведёт
  /// сюда, чтобы поток загрузки истории был один на весь экран.
  Future<void> createStory() => _create();

  Future<void> _create() async {
    if (_busy) return;
    final messenger = ScaffoldMessenger.of(context);
    try {
      final picked = await _picker.pickImage(
        source: ImageSource.gallery,
        maxWidth: 1080,
        imageQuality: 85,
      );
      if (picked == null) return;
      setState(() => _busy = true);
      final bytes = await picked.readAsBytes();
      final uploaded = await _uploads.uploadImages([
        (filename: picked.name, bytes: bytes),
      ]);
      if (uploaded.isEmpty) throw Exception('Не удалось загрузить фото');
      await _repo.createStory(mediaUrl: uploaded.first.url);
      await _load();
    } catch (e) {
      messenger.showSnackBar(
        SnackBar(
          content: Text(e.toString().replaceFirst('Exception: ', '')),
          duration: const Duration(seconds: 3),
        ),
      );
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final stories = _mine?.stories ?? const <StoryItem>[];
    if (stories.isEmpty && !widget.canCreate) return const SizedBox.shrink();

    return SizedBox(
      height: 98,
      child: ListView(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 12),
        children: [
          if (widget.canCreate)
            _HighlightCircle(
              label: 'Новое',
              busy: _busy,
              onTap: _create,
            ),
          for (final s in stories)
            _HighlightCircle(
              label: s.caption?.isNotEmpty == true ? s.caption! : 'Актуальное',
              imageUrl: ApiClient.resolveMediaUrl(s.mediaUrl),
              onTap: _openViewer,
            ),
        ],
      ),
    );
  }
}

/// Кружок «Актуального»: обводка + подпись под ним.
class _HighlightCircle extends StatelessWidget {
  const _HighlightCircle({
    required this.label,
    required this.onTap,
    this.imageUrl,
    this.busy = false,
  });

  final String label;
  final VoidCallback onTap;
  final String? imageUrl;
  final bool busy;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 6),
      child: InkWell(
        onTap: busy ? null : onTap,
        borderRadius: BorderRadius.circular(40),
        child: SizedBox(
          width: 74,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 64,
                height: 64,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: scheme.surfaceContainerHighest,
                  border: Border.all(color: scheme.outlineVariant, width: 1),
                  image: imageUrl != null
                      ? DecorationImage(
                          image: NetworkImage(imageUrl!),
                          fit: BoxFit.cover,
                        )
                      : null,
                ),
                alignment: Alignment.center,
                child: busy
                    ? const SizedBox(
                        width: 18,
                        height: 18,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : (imageUrl == null
                        ? Icon(Icons.add, size: 26, color: scheme.onSurface)
                        : null),
              ),
              const SizedBox(height: 5),
              Text(
                label,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                textAlign: TextAlign.center,
                style: const TextStyle(fontSize: 12),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
