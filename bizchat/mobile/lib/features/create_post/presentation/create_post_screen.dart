import 'dart:io';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:image_cropper/image_cropper.dart';
import 'package:image_picker/image_picker.dart';
import '../../../l10n/app_localizations.dart';
import '../../feed/data/feed_repository.dart';
import '../data/create_post_repository.dart';

/// Экран создания поста. Живёт во вкладке «Создать» MainShell.
///
/// Доступен только заводам — для байеров бэк вернёт 403, обрабатываем
/// этот случай с понятным сообщением.
///
/// Flow:
///   1. Пользователь добавляет фото (image_picker, до 10 шт)
///   2. Заполняет форму: title, description, price, currency, MOQ, hashtags
///   3. Тап «Опубликовать» → upload фото → создание поста → сброс формы,
///      показ snackbar'а со ссылкой «открыть» (переход на детальный экран)
class CreatePostScreen extends StatefulWidget {
  const CreatePostScreen({super.key, this.onPostCreated});

  /// Вызывается после успешного создания — родитель (MainShell) может
  /// переключить вкладку на ленту и показать свежий пост.
  final VoidCallback? onPostCreated;

  @override
  State<CreatePostScreen> createState() => _CreatePostScreenState();
}

class _CreatePostScreenState extends State<CreatePostScreen> {
  final _repo = CreatePostRepository();
  final _formKey = GlobalKey<FormState>();
  final _picker = ImagePicker();

  // Form controllers
  final _titleCtrl = TextEditingController();
  final _descCtrl = TextEditingController();
  final _priceCtrl = TextEditingController();
  final _moqCtrl = TextEditingController(text: '1');
  final _shippingCtrl = TextEditingController(text: '7');
  final _hashtagCtrl = TextEditingController();

  // Form state
  String _currency = 'USD';
  String _stockStatus = 'in_stock';
  final List<String> _hashtags = [];
  // Локально хранимые выбранные файлы — байты + имя + тип ('image' | 'video').
  // Тип проставляется при выборе чтобы превью знало как рендерить (Image.memory
  // для картинок, иконка плёнки для видео).
  final List<({String filename, Uint8List bytes, String type})> _pickedFiles =
      [];
  bool _submitting = false;
  double _uploadProgress = 0.0; // 0..1 прогресс загрузки медиа

  static const _currencies = ['USD', 'EUR', 'CNY', 'KZT', 'RUB'];
  // Локализуемые метки для stock status берём в `_buildStockDropdown` через
  // AppLocalizations; сами значения (ключи) — static константы.
  static const _stockOptionKeys = ['in_stock', 'pre_order', 'out_of_stock'];

  @override
  void dispose() {
    _titleCtrl.dispose();
    _descCtrl.dispose();
    _priceCtrl.dispose();
    _moqCtrl.dispose();
    _shippingCtrl.dispose();
    _hashtagCtrl.dispose();
    super.dispose();
  }

  /// Кроп фото в 1:1 (квадрат) — единый формат для красивой ленты.
  /// На web cropImage не поддерживается — пропускаем кроп, берём как есть.
  Future<Uint8List?> _cropImage(XFile file) async {
    if (kIsWeb) return file.readAsBytes();
    try {
      final scheme = Theme.of(context).colorScheme;
      final cropped = await ImageCropper().cropImage(
        sourcePath: file.path,
        aspectRatio: const CropAspectRatio(ratioX: 1, ratioY: 1),
        compressQuality: 85,
        maxWidth: 1080,
        maxHeight: 1080,
        uiSettings: [
          AndroidUiSettings(
            toolbarTitle: 'Обрезка фото',
            toolbarColor: scheme.surface,
            toolbarWidgetColor: scheme.onSurface,
            activeControlsWidgetColor: scheme.primary,
            lockAspectRatio: true,
            hideBottomControls: false,
          ),
          IOSUiSettings(
            title: 'Обрезка фото',
            aspectRatioLockEnabled: true,
            resetAspectRatioEnabled: false,
          ),
        ],
      );
      if (cropped == null) return null; // пользователь отменил
      return File(cropped.path).readAsBytes();
    } catch (_) {
      // Если кроппер не сработал (нет native activity на некоторых ROM) —
      // возвращаем оригинал.
      return file.readAsBytes();
    }
  }

  /// FEATURE-001: Камера — сфотографировать товар и сразу добавить.
  Future<void> _takePhoto() async {
    try {
      if (_pickedFiles.length >= 10) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text(
                  AppLocalizations.of(context)!.createPostMediaMaxReached),
            ),
          );
        }
        return;
      }
      final picked = await _picker.pickImage(
        source: ImageSource.camera,
        maxWidth: 2048,
        imageQuality: 85,
      );
      if (picked == null) return;
      if (!mounted) return;
      final bytes = await _cropImage(picked);
      if (bytes == null) return;
      _pickedFiles.add((filename: picked.name, bytes: bytes, type: 'image'));
      if (mounted) setState(() {});
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(AppLocalizations.of(context)!
                .createPostPickPhotosError(e.toString())),
          ),
        );
      }
    }
  }

  Future<void> _pickImages() async {
    try {
      final picked = await _picker.pickMultiImage(
        maxWidth: 2048,
        imageQuality: 85,
      );
      if (picked.isEmpty) return;

      // Лимит 10 картинок (с учётом уже добавленных видео)
      final spaceLeft = 10 - _pickedFiles.length;
      if (spaceLeft <= 0) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text(
                  AppLocalizations.of(context)!.createPostMediaMaxReached),
            ),
          );
        }
        return;
      }
      final toAdd = picked.take(spaceLeft);
      for (final x in toAdd) {
        if (!mounted) return;
        // Кроп 1:1 для единого формата ленты. Если юзер отменил кроп —
        // пропускаем это фото.
        final bytes = await _cropImage(x);
        if (bytes == null) continue;
        _pickedFiles
            .add((filename: x.name, bytes: bytes, type: 'image'));
      }
      if (mounted) setState(() {});
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(AppLocalizations.of(context)!
                .createPostPickPhotosError(e.toString())),
          ),
        );
      }
    }
  }

  /// Максимальный размер видео в байтах (30 MB).
  static const _maxVideoBytes = 30 * 1024 * 1024;

  /// Максимальная длительность видео (60 секунд).
  static const _maxVideoDuration = Duration(seconds: 60);

  Future<void> _pickVideo() async {
    try {
      final picked = await _picker.pickVideo(
        source: ImageSource.gallery,
        maxDuration: _maxVideoDuration,
      );
      if (picked == null) return;
      if (_pickedFiles.length >= 10) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text(
                  AppLocalizations.of(context)!.createPostMediaMaxReached),
            ),
          );
        }
        return;
      }

      // Проверка формата — только MP4/MOV (конвертим на сервере в MP4).
      final ext = picked.name.split('.').last.toLowerCase();
      if (!{'mp4', 'mov', 'm4v', 'mpeg'}.contains(ext)) {
        if (mounted) {
          final l = AppLocalizations.of(context)!;
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text(l.createPostVideoWrongFormat),
              duration: const Duration(seconds: 4),
            ),
          );
        }
        return;
      }

      final bytes = await picked.readAsBytes();

      // Проверка размера — 30 MB максимум.
      if (bytes.lengthInBytes > _maxVideoBytes) {
        if (mounted) {
          final l = AppLocalizations.of(context)!;
          final sizeMb = (bytes.lengthInBytes / 1024 / 1024).toStringAsFixed(1);
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text(l.createPostVideoTooBig(sizeMb)),
              duration: const Duration(seconds: 5),
            ),
          );
        }
        return;
      }

      _pickedFiles
          .add((filename: picked.name, bytes: bytes, type: 'video'));
      if (mounted) setState(() {});
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(AppLocalizations.of(context)!
                .createPostPickVideoError(e.toString())),
          ),
        );
      }
    }
  }

  void _removeImage(int index) {
    setState(() => _pickedFiles.removeAt(index));
  }

  void _addHashtag() {
    final l = AppLocalizations.of(context)!;
    final raw = _hashtagCtrl.text.trim().replaceAll(RegExp(r'^#+'), '');
    if (raw.isEmpty) return;
    if (!RegExp(r'^[a-zA-Z0-9_\-\u0400-\u04FF]+$').hasMatch(raw)) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(l.createPostHashtagInvalidChars),
          duration: const Duration(seconds: 2),
        ),
      );
      return;
    }
    if (_hashtags.contains(raw)) {
      _hashtagCtrl.clear();
      return;
    }
    if (_hashtags.length >= 20) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(l.createPostHashtagMaxLimit)),
      );
      return;
    }
    setState(() {
      _hashtags.add(raw);
      _hashtagCtrl.clear();
    });
  }

  void _removeHashtag(String tag) {
    setState(() => _hashtags.remove(tag));
  }

  Future<void> _submit() async {
    if (_submitting) return;
    FocusScope.of(context).unfocus();
    final l = AppLocalizations.of(context)!;

    if (_pickedFiles.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(l.createPostNoMediaSnack)),
      );
      return;
    }
    if (!_formKey.currentState!.validate()) return;

    setState(() {
      _submitting = true;
      _uploadProgress = 0.0;
    });
    try {
      // 1. Загружаем фото/видео → получаем URL'ы с прогрессом.
      final files = _pickedFiles
          .map((f) => (filename: f.filename, bytes: f.bytes))
          .toList();
      // Прогресс считаем по количеству файлов.
      final uploaded = <UploadedImage>[];
      for (var i = 0; i < files.length; i++) {
        final result = await _repo.uploadImages([files[i]]);
        uploaded.addAll(result);
        if (mounted) {
          setState(
              () => _uploadProgress = (i + 1) / files.length);
        }
      }

      // 2. Создаём пост
      final priceAmount = double.parse(_priceCtrl.text.replaceAll(',', '.'));
      final moq = int.parse(_moqCtrl.text);
      final shipping = int.parse(_shippingCtrl.text);
      final draft = NewPostDraft(
        title: _titleCtrl.text.trim(),
        description:
            _descCtrl.text.trim().isEmpty ? null : _descCtrl.text.trim(),
        priceAmount: priceAmount,
        priceCurrency: _currency,
        hashtags: _hashtags,
        moq: moq,
        shippingDays: shipping,
        stockStatus: _stockStatus,
        media: uploaded,
      );
      final created = await _repo.createPost(draft);
      // Сбрасываем кэш ленты — пост свежий, юзер должен его увидеть сразу.
      FeedRepository.invalidateFeedCache();

      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(l.createPostPublishedWithTitle(created.title)),
          duration: const Duration(seconds: 3),
        ),
      );

      // Сбрасываем форму
      _titleCtrl.clear();
      _descCtrl.clear();
      _priceCtrl.clear();
      _moqCtrl.text = '1';
      _shippingCtrl.text = '7';
      _hashtagCtrl.clear();
      setState(() {
        _hashtags.clear();
        _pickedFiles.clear();
        _currency = 'USD';
        _stockStatus = 'in_stock';
      });

      // Уведомляем родителя (MainShell) — он перекинет на ленту.
      widget.onPostCreated?.call();
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(e.toString().replaceFirst('Exception: ', '')),
          duration: const Duration(seconds: 4),
        ),
      );
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context)!;
    return Scaffold(
      appBar: AppBar(
        title: Text(
          l.createPostTitle,
          style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 22),
        ),
      ),
      // Sticky кнопка «Опубликовать» внизу экрана — всегда видна,
      // яркая, крупная. Раньше была маленьким TextButton в AppBar
      // и на Huawei/маленьких экранах пользователи её не замечали.
      bottomNavigationBar: SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              // Прогресс-бар загрузки медиа (виден только при _submitting)
              if (_submitting)
                Padding(
                  padding: const EdgeInsets.only(bottom: 8),
                  child: ClipRRect(
                    borderRadius: BorderRadius.circular(8),
                    child: LinearProgressIndicator(
                      value: _uploadProgress,
                      minHeight: 6,
                    ),
                  ),
                ),
              FilledButton.icon(
            onPressed: _submitting ? null : _submit,
            icon: _submitting
                ? const SizedBox(
                    width: 20,
                    height: 20,
                    child: CircularProgressIndicator(
                      strokeWidth: 2.5,
                      color: Colors.white,
                    ),
                  )
                : const Icon(Icons.publish_rounded, size: 22),
            label: Text(
              _submitting
                  ? l.commonLoading
                  : l.createPostPublish,
              style: const TextStyle(
                fontSize: 17,
                fontWeight: FontWeight.w700,
                letterSpacing: 0.3,
              ),
            ),
            style: FilledButton.styleFrom(
              minimumSize: const Size(double.infinity, 56),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(16),
              ),
            ),
          ),
            ],
          ),
        ),
      ),
      body: Form(
        key: _formKey,
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            _buildMediaSection(),
            const SizedBox(height: 16),
            _buildTitleField(),
            const SizedBox(height: 12),
            _buildDescriptionField(),
            const SizedBox(height: 12),
            _buildPriceRow(),
            const SizedBox(height: 12),
            _buildSpecsRow(),
            const SizedBox(height: 12),
            _buildStockDropdown(),
            const SizedBox(height: 12),
            _buildHashtagsSection(),
            const SizedBox(height: 24),
          ],
        ),
      ),
    );
  }

  Widget _buildMediaSection() {
    final scheme = Theme.of(context).colorScheme;
    final l = AppLocalizations.of(context)!;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          l.createPostMediaTitle,
          style: Theme.of(context).textTheme.titleMedium?.copyWith(
                fontWeight: FontWeight.w700,
              ),
        ),
        const SizedBox(height: 8),
        SizedBox(
          height: 100,
          child: ListView.separated(
            scrollDirection: Axis.horizontal,
            // +3 для кнопок «Фото», «Камера» и «Видео»
            itemCount: _pickedFiles.length + 3,
            separatorBuilder: (_, __) => const SizedBox(width: 8),
            itemBuilder: (_, i) {
              if (i == _pickedFiles.length) {
                return _AddMediaTile(
                  icon: Icons.photo_library_outlined,
                  label: l.createPostAddPhoto,
                  onTap: _pickImages,
                );
              }
              if (i == _pickedFiles.length + 1) {
                // FEATURE-001: кнопка Камера для прямой съёмки
                return _AddMediaTile(
                  icon: Icons.camera_alt_outlined,
                  label: l.createPostCamera,
                  onTap: _takePhoto,
                );
              }
              if (i == _pickedFiles.length + 2) {
                return _AddMediaTile(
                  icon: Icons.videocam_outlined,
                  label: l.createPostAddVideo,
                  onTap: _pickVideo,
                );
              }
              final f = _pickedFiles[i];
              final isVideo = f.type == 'video';
              return Stack(
                children: [
                  ClipRRect(
                    borderRadius: BorderRadius.circular(8),
                    child: SizedBox(
                      width: 100,
                      height: 100,
                      child: isVideo
                          ? Container(
                              color: scheme.surfaceContainerHighest,
                              alignment: Alignment.center,
                              child: Column(
                                mainAxisAlignment: MainAxisAlignment.center,
                                children: [
                                  Icon(Icons.movie,
                                      size: 32,
                                      color: scheme.onSurfaceVariant),
                                  const SizedBox(height: 4),
                                  Text(
                                    l.createPostAddVideo,
                                    style: TextStyle(
                                      fontSize: 10,
                                      color: scheme.onSurfaceVariant,
                                    ),
                                  ),
                                ],
                              ),
                            )
                          : Image.memory(f.bytes, fit: BoxFit.cover),
                    ),
                  ),
                  Positioned(
                    top: 2,
                    right: 2,
                    child: InkWell(
                      onTap: () => _removeImage(i),
                      borderRadius: BorderRadius.circular(12),
                      child: Container(
                        decoration: BoxDecoration(
                          color: Colors.black54,
                          borderRadius: BorderRadius.circular(12),
                        ),
                        padding: const EdgeInsets.all(4),
                        child: const Icon(Icons.close,
                            color: Colors.white, size: 16),
                      ),
                    ),
                  ),
                ],
              );
            },
          ),
        ),
        const SizedBox(height: 4),
        Text(
          l.createPostMediaCount(_pickedFiles.length),
          style: Theme.of(context).textTheme.bodySmall?.copyWith(
                color: scheme.onSurfaceVariant,
              ),
        ),
      ],
    );
  }

  Widget _buildTitleField() {
    final l = AppLocalizations.of(context)!;
    return TextFormField(
      controller: _titleCtrl,
      maxLength: 256,
      decoration: InputDecoration(
        labelText: l.createPostTitleRequired,
        border: const OutlineInputBorder(),
        hintText: l.createPostTitleHintExample,
      ),
      validator: (v) {
        final t = (v ?? '').trim();
        if (t.length < 3) return l.createPostTitleTooShort;
        return null;
      },
    );
  }

  Widget _buildDescriptionField() {
    final l = AppLocalizations.of(context)!;
    return TextFormField(
      controller: _descCtrl,
      maxLength: 5000,
      maxLines: 4,
      minLines: 2,
      decoration: InputDecoration(
        labelText: l.createPostDescription,
        border: const OutlineInputBorder(),
        hintText: l.createPostDescriptionHintExample,
      ),
    );
  }

  Widget _buildPriceRow() {
    final l = AppLocalizations.of(context)!;
    return Row(
      children: [
        Expanded(
          flex: 2,
          child: TextFormField(
            controller: _priceCtrl,
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
            inputFormatters: [
              FilteringTextInputFormatter.allow(RegExp(r'[0-9.,]')),
            ],
            decoration: InputDecoration(
              labelText: l.createPostPriceRequired,
              border: const OutlineInputBorder(),
              hintText: l.createPostPriceHintExample,
            ),
            validator: (v) {
              final t = (v ?? '').replaceAll(',', '.').trim();
              if (t.isEmpty) return l.createPostFieldRequired;
              final n = double.tryParse(t);
              if (n == null || n < 0) return l.createPostFieldInvalid;
              return null;
            },
          ),
        ),
        const SizedBox(width: 8),
        Expanded(
          flex: 1,
          child: DropdownButtonFormField<String>(
            initialValue: _currency,
            decoration: InputDecoration(
              labelText: l.createPostCurrencyRequired,
              border: const OutlineInputBorder(),
            ),
            items: _currencies
                .map((c) => DropdownMenuItem(value: c, child: Text(c)))
                .toList(),
            onChanged: (v) {
              if (v != null) setState(() => _currency = v);
            },
          ),
        ),
      ],
    );
  }

  Widget _buildSpecsRow() {
    final l = AppLocalizations.of(context)!;
    return Row(
      children: [
        Expanded(
          child: TextFormField(
            controller: _moqCtrl,
            keyboardType: TextInputType.number,
            inputFormatters: [FilteringTextInputFormatter.digitsOnly],
            decoration: InputDecoration(
              labelText: l.createPostMoqLabel,
              border: const OutlineInputBorder(),
            ),
            validator: (v) {
              final n = int.tryParse((v ?? '').trim());
              if (n == null || n < 1) return l.createPostMoqMin;
              return null;
            },
          ),
        ),
        const SizedBox(width: 8),
        Expanded(
          child: TextFormField(
            controller: _shippingCtrl,
            keyboardType: TextInputType.number,
            inputFormatters: [FilteringTextInputFormatter.digitsOnly],
            decoration: InputDecoration(
              labelText: l.createPostShippingLabel,
              border: const OutlineInputBorder(),
            ),
            validator: (v) {
              final n = int.tryParse((v ?? '').trim());
              if (n == null || n < 0) return l.createPostShippingMin;
              return null;
            },
          ),
        ),
      ],
    );
  }

  Widget _buildStockDropdown() {
    final l = AppLocalizations.of(context)!;
    String labelFor(String key) {
      switch (key) {
        case 'pre_order':
          return l.createPostStockPreOrder;
        case 'out_of_stock':
          return l.createPostStockOutOfStock;
        case 'in_stock':
        default:
          return l.createPostStockInStock;
      }
    }
    return DropdownButtonFormField<String>(
      initialValue: _stockStatus,
      decoration: InputDecoration(
        labelText: l.createPostStockStatus,
        border: const OutlineInputBorder(),
      ),
      items: _stockOptionKeys
          .map((key) =>
              DropdownMenuItem(value: key, child: Text(labelFor(key))))
          .toList(),
      onChanged: (v) {
        if (v != null) setState(() => _stockStatus = v);
      },
    );
  }

  Widget _buildHashtagsSection() {
    final l = AppLocalizations.of(context)!;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        TextField(
          controller: _hashtagCtrl,
          decoration: InputDecoration(
            labelText: l.createPostHashtagsLabel,
            hintText: l.createPostHashtagHintExample,
            border: const OutlineInputBorder(),
            suffixIcon: IconButton(
              icon: const Icon(Icons.add),
              onPressed: _addHashtag,
            ),
          ),
          textInputAction: TextInputAction.done,
          onSubmitted: (_) => _addHashtag(),
        ),
        const SizedBox(height: 8),
        if (_hashtags.isNotEmpty)
          Wrap(
            spacing: 6,
            runSpacing: 6,
            children: _hashtags
                .map((tag) => Chip(
                      label: Text('#$tag'),
                      onDeleted: () => _removeHashtag(tag),
                      deleteIcon: const Icon(Icons.close, size: 16),
                    ))
                .toList(),
          ),
      ],
    );
  }
}

/// Универсальная плитка «Добавить медиа» — используется и для фото, и для
/// видео в `create_post_screen`. Иконка и подпись настраиваются.
class _AddMediaTile extends StatelessWidget {
  const _AddMediaTile({
    required this.icon,
    required this.label,
    required this.onTap,
  });
  final IconData icon;
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(8),
      child: Container(
        width: 100,
        height: 100,
        decoration: BoxDecoration(
          color: scheme.surfaceContainerHighest,
          borderRadius: BorderRadius.circular(8),
          border: Border.all(
            color: scheme.outlineVariant,
            style: BorderStyle.solid,
            width: 1.5,
          ),
        ),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(icon, size: 32, color: scheme.onSurfaceVariant),
            const SizedBox(height: 4),
            Text(
              label,
              style: Theme.of(context).textTheme.bodySmall?.copyWith(
                    color: scheme.onSurfaceVariant,
                  ),
            ),
          ],
        ),
      ),
    );
  }
}
