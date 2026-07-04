import 'package:flutter/material.dart';
import 'package:video_player/video_player.dart';
import '../api/api_client.dart';

/// Плеер видео для отображения внутри ленты и detail screen.
///
/// Авто-инициализация через `networkUrl`. UI:
///   - тап по видео → play / pause
///   - mute-кнопка в правом нижнем углу
///   - индикатор прогресса в bottom (тонкая полоска)
///   - центральная иконка play если на паузе
///   - бейдж длительности в правом верхнем углу
///
/// `autoplay` по умолчанию false — видео не запускается само (для performance
/// в ленте). На detail screen можно передать `autoplay: true`.
///
/// `loop` управляет зацикливанием (TikTok-style).
class VideoMediaPlayer extends StatefulWidget {
  const VideoMediaPlayer({
    super.key,
    required this.mediaUrl,
    this.autoplay = false,
    this.loop = true,
    this.muted = true,
    this.fit = BoxFit.contain,
  });

  final String mediaUrl;
  final bool autoplay;
  final bool loop;
  final bool muted;
  final BoxFit fit;

  @override
  State<VideoMediaPlayer> createState() => _VideoMediaPlayerState();
}

class _VideoMediaPlayerState extends State<VideoMediaPlayer> {
  VideoPlayerController? _controller;
  bool _initFailed = false;
  late bool _muted;

  @override
  void initState() {
    super.initState();
    _muted = widget.muted;
    _init();
  }

  Future<void> _init() async {
    final url = ApiClient.resolveMediaUrl(widget.mediaUrl);
    try {
      final controller = VideoPlayerController.networkUrl(Uri.parse(url));
      await controller.initialize();
      if (!mounted) {
        await controller.dispose();
        return;
      }
      controller.setLooping(widget.loop);
      await controller.setVolume(_muted ? 0 : 1);
      setState(() => _controller = controller);
      if (widget.autoplay) {
        await controller.play();
      }
    } catch (_) {
      if (mounted) setState(() => _initFailed = true);
    }
  }

  @override
  void dispose() {
    _controller?.dispose();
    super.dispose();
  }

  void _togglePlayPause() {
    final c = _controller;
    if (c == null) return;
    setState(() {
      if (c.value.isPlaying) {
        c.pause();
      } else {
        c.play();
      }
    });
  }

  Future<void> _toggleMute() async {
    final c = _controller;
    if (c == null) return;
    final next = !_muted;
    await c.setVolume(next ? 0 : 1);
    if (mounted) setState(() => _muted = next);
  }

  static String _formatDuration(Duration d) {
    final m = d.inMinutes.toString().padLeft(2, '0');
    final s = (d.inSeconds % 60).toString().padLeft(2, '0');
    return '$m:$s';
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;

    if (_initFailed) {
      return Container(
        color: scheme.surfaceContainerHighest,
        alignment: Alignment.center,
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.videocam_off,
                size: 48, color: scheme.onSurfaceVariant),
            const SizedBox(height: 8),
            Text(
              'Видео не загрузилось',
              style: TextStyle(color: scheme.onSurfaceVariant),
            ),
          ],
        ),
      );
    }

    final controller = _controller;
    if (controller == null || !controller.value.isInitialized) {
      return Container(
        color: scheme.surfaceContainerHighest,
        alignment: Alignment.center,
        child: const SizedBox(
          width: 28,
          height: 28,
          child: CircularProgressIndicator(strokeWidth: 2),
        ),
      );
    }

    final isPlaying = controller.value.isPlaying;
    final aspect = controller.value.aspectRatio;

    return GestureDetector(
      onTap: _togglePlayPause,
      child: Stack(
        fit: StackFit.expand,
        children: [
          // Видео — внутри AspectRatio для сохранения пропорций
          Container(
            color: Colors.black,
            child: Center(
              child: AspectRatio(
                aspectRatio: aspect,
                child: VideoPlayer(controller),
              ),
            ),
          ),
          // Центральная иконка play (только когда пауза)
          if (!isPlaying)
            const Center(
              child: DecoratedBox(
                decoration: BoxDecoration(
                  color: Colors.black54,
                  shape: BoxShape.circle,
                ),
                child: Padding(
                  padding: EdgeInsets.all(12),
                  child: Icon(Icons.play_arrow,
                      color: Colors.white, size: 36),
                ),
              ),
            ),
          // Длительность в верхнем правом углу
          Positioned(
            top: 8,
            right: 8,
            child: Container(
              padding:
                  const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
              decoration: BoxDecoration(
                color: Colors.black54,
                borderRadius: BorderRadius.circular(4),
              ),
              child: Text(
                _formatDuration(controller.value.duration),
                style: const TextStyle(
                  color: Colors.white,
                  fontSize: 11,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
          ),
          // Mute-кнопка
          Positioned(
            bottom: 12,
            right: 8,
            child: GestureDetector(
              onTap: _toggleMute,
              child: Container(
                padding: const EdgeInsets.all(6),
                decoration: const BoxDecoration(
                  color: Colors.black54,
                  shape: BoxShape.circle,
                ),
                child: Icon(
                  _muted ? Icons.volume_off : Icons.volume_up,
                  color: Colors.white,
                  size: 18,
                ),
              ),
            ),
          ),
          // Тонкая полоска прогресса внизу
          Positioned(
            left: 0,
            right: 0,
            bottom: 0,
            child: VideoProgressIndicator(
              controller,
              allowScrubbing: true,
              padding: EdgeInsets.zero,
              colors: VideoProgressColors(
                playedColor: scheme.primary,
                bufferedColor: Colors.white24,
                backgroundColor: Colors.white12,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
