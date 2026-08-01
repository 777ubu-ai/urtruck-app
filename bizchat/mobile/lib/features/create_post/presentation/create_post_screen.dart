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
  // Локализуемые метки для stock status берём в `_buildStockChips` через
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

  /// Единое оформление полей: заполненная «таблетка» без рамки, скруглённая,
  /// без счётчика символов под каждым полем — счётчики раньше стояли под
  /// каждым вводом и превращали форму в таблицу цифр.
  InputDecoration _dec({
    required String label,
    String? hint,
    Widget? suffix,
    String? prefixText,
  }) {
    final scheme = Theme.of(context).colorScheme;
    return InputDecoration(
      labelText: label,
      hintText: hint,
      prefixText: prefixText,
      suffixIcon: suffix,
      counterText: '',
      filled: true,
      fillColor: scheme.surfaceContainerHighest.withValues(alpha: 0.5),
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: BorderSide.none,
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: BorderSide.none,
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: BorderSide(color: scheme.primary, width: 1.6),
      ),
      errorBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: BorderSide(color: scheme.error, width: 1.2),
      ),
      focusedErrorBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: BorderSide(color: scheme.error, width: 1.6),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context)!;
    final scheme = Theme.of(context).colorScheme;
    return Scaffold(
      appBar: AppBar(
        title: Text(
          l.createPostTitle,
          style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 20),
        ),
        scrolledUnderElevation: 0,
      ),
      // Кнопка публикации закреплена внизу и отделена тонкой линией: при
      // длинной форме видно, что список продолжается под ней.
      bottomNavigationBar: Container(
        decoration: BoxDecoration(
          color: scheme.surface,
          border: Border(
            top: BorderSide(color: scheme.outlineVariant, width: 0.5),
          ),
        ),
        child: SafeArea(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 10, 16, 12),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                if (_submitting)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 10),
                    child: ClipRRect(
                      borderRadius: BorderRadius.circular(8),
                      child: LinearProgressIndicator(
                        value: _uploadProgress,
                        minHeight: 5,
                      ),
                    ),
                  ),
                SizedBox(
                  height: 54,
                  child: FilledButton(
                    onPressed: _submitting ? null : _submit,
                    style: FilledButton.styleFrom(
                      minimumSize: const Size(double.infinity, 54),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(16),
                      ),
                    ),
                    child: _submitting
                        ? Row(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              const SizedBox(
                                width: 18,
                                height: 18,
                                child: CircularProgressIndicator(
                                  strokeWidth: 2.4,
                                  color: Colors.white,
                                ),
                              ),
                              const SizedBox(width: 10),
                              Text(
                                l.createPostUploading,
                                style: const TextStyle(
                                  fontSize: 16,
                                  fontWeight: FontWeight.w700,
                                ),
                              ),
                            ],
                          )
                        : Text(
                            l.createPostPublish,
                            style: const TextStyle(
                              fontSize: 16.5,
                              fontWeight: FontWeight.w700,
                              letterSpacing: 0.2,
                            ),
                          ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
      body: Form(
        key: _formKey,
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
          children: [
            // Форма разбита на смысловые блоки: медиа, о товаре, условия,
            // теги. Раньше это был один сплошной столбец полей, в котором
            // непонятно, где заканчивается одно и начинается другое.
            _FormSection(
              title: l.createPostSectionMedia,
              subtitle: l.createPostSectionMediaHint,
              child: _buildMediaSection(),
            ),
            const SizedBox(height: 14),
            _FormSection(
              title: l.createPostSectionAbout,
              child: Column(
                children: [
                  _buildTitleField(),
                  const SizedBox(height: 12),
                  _buildDescriptionField(),
                ],
              ),
            ),
            const SizedBox(height: 14),
            _FormSection(
              title: l.createPostSectionTerms,
              child: Column(
                children: [
                  _buildPriceRow(),
                  const SizedBox(height: 12),
                  _buildSpecsRow(),
                  const SizedBox(height: 14),
                  _buildStockChips(),
                ],
              ),
            ),
            const SizedBox(height: 14),
            _FormSection(
              title: l.createPostSectionTags,
              subtitle: l.createPostSectionTagsHint,
              child: _buildHashtagsSection(),
            ),
            const SizedBox(height: 14),
            // Раскрывающийся блок «Дополнительно» — как у Ерасыла:
            // Категория / Место / Кому видно. Данные пока не отправляются
            // на сервер (готовим слот на бэке отдельным изменением),
            // но интерфейс уже правильный.
            _CollapsibleSection(title: l.createDetailsSection),
          ],
        ),
      ),
    );
  }

  Widget _buildMediaSection() {
    final scheme = Theme.of(context).colorScheme;
    final l = AppLocalizations.of(context)!;

    // Пока ничего не выбрано — крупная зона с тремя понятными действиями,
    // а не три одинаковых серых квадрата непонятного назначения.
    if (_pickedFiles.isEmpty) {
      return Column(
        children: [
          Row(
            children: [
              Expanded(
                child: _MediaAction(
                  icon: Icons.photo_library_rounded,
                  label: l.createPostAddPhoto,
                  onTap: _pickImages,
                  primary: true,
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: _MediaAction(
                  icon: Icons.photo_camera_rounded,
                  label: l.createPostCamera,
                  onTap: _takePhoto,
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: _MediaAction(
                  icon: Icons.videocam_rounded,
                  label: l.createPostAddVideo,
                  onTap: _pickVideo,
                ),
              ),
            ],
          ),
        ],
      );
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SizedBox(
          height: 108,
          // Горизонтальный ReorderableListView: тап-и-держи любую плитку —
          // и тащим на новое место. Первое фото — обложка (подписано).
          child: ReorderableListView.builder(
            scrollDirection: Axis.horizontal,
            padding: EdgeInsets.zero,
            buildDefaultDragHandles: false,
            proxyDecorator: (child, _, _) => Material(
              elevation: 6,
              color: Colors.transparent,
              borderRadius: BorderRadius.circular(14),
              child: child,
            ),
            onReorder: (oldI, newI) {
              setState(() {
                final ni = newI > oldI ? newI - 1 : newI;
                final item = _pickedFiles.removeAt(oldI);
                _pickedFiles.insert(ni, item);
              });
            },
            itemCount: _pickedFiles.length + 1,
            itemBuilder: (_, i) {
              if (i == _pickedFiles.length) {
                // Кнопка «Ещё» не участвует в переупорядочивании — но
                // ReorderableListView требует key у всех детей.
                return Padding(
                  key: const ValueKey('add_more'),
                  padding: const EdgeInsets.only(right: 10),
                  child: _MediaAction(
                    icon: Icons.add_rounded,
                    label: l.createPostAddMore,
                    onTap: _pickImages,
                    width: 84,
                    height: 104,
                  ),
                );
              }
              final f = _pickedFiles[i];
              final isVideo = f.type == 'video';
              return Padding(
                key: ValueKey('media_$i'),
                padding: const EdgeInsets.only(right: 10),
                child: ReorderableDelayedDragStartListener(
                  index: i,
                  child: SizedBox(
                    width: 84,
                    child: Stack(
                      children: [
                        ClipRRect(
                          borderRadius: BorderRadius.circular(14),
                          child: SizedBox(
                            width: 84,
                            height: 104,
                            child: isVideo
                                ? Container(
                                    color: scheme.surfaceContainerHighest,
                                    alignment: Alignment.center,
                                    child: Icon(
                                      Icons.play_circle_fill_rounded,
                                      size: 34,
                                      color: scheme.onSurfaceVariant,
                                    ),
                                  )
                                : Image.memory(f.bytes, fit: BoxFit.cover),
                          ),
                        ),
                        if (i == 0)
                          Positioned(
                            left: 0,
                            right: 0,
                            bottom: 0,
                            child: Container(
                              padding:
                                  const EdgeInsets.symmetric(vertical: 3),
                              decoration: const BoxDecoration(
                                color: Colors.black54,
                                borderRadius: BorderRadius.vertical(
                                  bottom: Radius.circular(14),
                                ),
                              ),
                              child: Text(
                                l.createPostCover,
                                textAlign: TextAlign.center,
                                style: const TextStyle(
                                  color: Colors.white,
                                  fontSize: 10.5,
                                  fontWeight: FontWeight.w700,
                                ),
                              ),
                            ),
                          ),
                        Positioned(
                          top: 4,
                          right: 4,
                          child: InkWell(
                            onTap: () => _removeImage(i),
                            borderRadius: BorderRadius.circular(20),
                            child: Container(
                              decoration: const BoxDecoration(
                                color: Colors.black54,
                                shape: BoxShape.circle,
                              ),
                              padding: const EdgeInsets.all(4),
                              child: const Icon(Icons.close,
                                  color: Colors.white, size: 14),
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              );
            },
          ),
        ),
        const SizedBox(height: 8),
        // Подсказка «перетащите, чтобы изменить порядок» — как в мокапе.
        // Показывается только если больше одного файла, иначе бессмысленно.
        if (_pickedFiles.length > 1)
          Row(
            children: [
              Icon(Icons.drag_indicator,
                  size: 14, color: scheme.onSurfaceVariant),
              const SizedBox(width: 4),
              Text(
                l.createDragToReorder,
                style: TextStyle(
                    fontSize: 12, color: scheme.onSurfaceVariant),
              ),
            ],
          ),
        const SizedBox(height: 6),
        Row(
          children: [
            _MediaChip(icon: Icons.photo_camera_rounded, onTap: _takePhoto),
            const SizedBox(width: 8),
            _MediaChip(icon: Icons.videocam_rounded, onTap: _pickVideo),
            const Spacer(),
            Text(
              l.createPostMediaCount(_pickedFiles.length),
              style: TextStyle(fontSize: 12.5, color: scheme.onSurfaceVariant),
            ),
          ],
        ),
      ],
    );
  }

  Widget _buildTitleField() {
    final l = AppLocalizations.of(context)!;
    return TextFormField(
      controller: _titleCtrl,
      maxLength: 256,
      textCapitalization: TextCapitalization.sentences,
      decoration: _dec(
        label: l.createPostName,
        hint: l.createPostTitleHintExample,
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
      maxLines: 5,
      minLines: 3,
      textCapitalization: TextCapitalization.sentences,
      decoration: _dec(
        label: l.createPostDescription,
        hint: l.createPostDescriptionHintExample,
      ),
    );
  }

  Widget _buildPriceRow() {
    final l = AppLocalizations.of(context)!;
    final scheme = Theme.of(context).colorScheme;
    // Валюта — компактным выбором внутри поля цены, а не отдельной коробкой
    // рядом: это одно значение, и разрывать его на два блока незачем.
    return TextFormField(
      controller: _priceCtrl,
      keyboardType: const TextInputType.numberWithOptions(decimal: true),
      inputFormatters: [
        FilteringTextInputFormatter.allow(RegExp(r'[0-9.,]')),
      ],
      decoration: _dec(
        label: l.createPostPrice,
        hint: l.createPostPriceHintExample,
        suffix: Padding(
          padding: const EdgeInsets.only(right: 8),
          child: DropdownButtonHideUnderline(
            child: DropdownButton<String>(
              value: _currency,
              borderRadius: BorderRadius.circular(14),
              style: TextStyle(
                fontSize: 15,
                fontWeight: FontWeight.w700,
                color: scheme.onSurface,
              ),
              items: _currencies
                  .map((c) => DropdownMenuItem(value: c, child: Text(c)))
                  .toList(),
              onChanged: (v) {
                if (v != null) setState(() => _currency = v);
              },
            ),
          ),
        ),
      ),
      validator: (v) {
        final t = (v ?? '').replaceAll(',', '.').trim();
        if (t.isEmpty) return l.createPostFieldRequired;
        final n = double.tryParse(t);
        if (n == null || n < 0) return l.createPostFieldInvalid;
        return null;
      },
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
            decoration: _dec(label: l.createPostMoqLabel),
            validator: (v) {
              final n = int.tryParse((v ?? '').trim());
              if (n == null || n < 1) return l.createPostMoqMin;
              return null;
            },
          ),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: TextFormField(
            controller: _shippingCtrl,
            keyboardType: TextInputType.number,
            inputFormatters: [FilteringTextInputFormatter.digitsOnly],
            decoration: _dec(label: l.createPostShippingLabel),
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

  /// Наличие — тремя переключателями вместо выпадающего списка: вариантов
  /// всего три, и открывать ради них меню незачем.
  Widget _buildStockChips() {
    final l = AppLocalizations.of(context)!;
    final scheme = Theme.of(context).colorScheme;
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

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.only(left: 4, bottom: 8),
          child: Text(
            l.createPostStockStatus,
            style: TextStyle(fontSize: 13, color: scheme.onSurfaceVariant),
          ),
        ),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: _stockOptionKeys.map((key) {
            return ChoiceChip(
              label: Text(labelFor(key)),
              selected: _stockStatus == key,
              onSelected: (_) => setState(() => _stockStatus = key),
            );
          }).toList(),
        ),
      ],
    );
  }

  Widget _buildHashtagsSection() {
    final l = AppLocalizations.of(context)!;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        TextField(
          controller: _hashtagCtrl,
          decoration: _dec(
            label: l.createPostHashtagsLabel,
            hint: l.createPostHashtagHintExample,
            prefixText: '#',
            suffix: IconButton(
              icon: const Icon(Icons.add_rounded),
              onPressed: _addHashtag,
            ),
          ),
          textInputAction: TextInputAction.done,
          onSubmitted: (_) => _addHashtag(),
        ),
        if (_hashtags.isNotEmpty) ...[
          const SizedBox(height: 10),
          Wrap(
            spacing: 6,
            runSpacing: 6,
            children: _hashtags
                .map((tag) => Chip(
                      label: Text('#$tag'),
                      onDeleted: () => _removeHashtag(tag),
                      deleteIcon: const Icon(Icons.close, size: 15),
                      visualDensity: VisualDensity.compact,
                    ))
                .toList(),
          ),
        ],
      ],
    );
  }
}

/// Блок формы: заголовок, необязательная подсказка и содержимое в карточке.
/// Разбивка на блоки — главное, чего не хватало форме: без неё поля идут
/// сплошным списком и экран выглядит как анкета.
class _FormSection extends StatelessWidget {
  const _FormSection({
    required this.title,
    required this.child,
    this.subtitle,
  });

  final String title;
  final String? subtitle;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Container(
      padding: const EdgeInsets.fromLTRB(14, 14, 14, 16),
      decoration: BoxDecoration(
        color: scheme.surface,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: scheme.outlineVariant, width: 0.8),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            title,
            style: const TextStyle(
              fontSize: 15.5,
              fontWeight: FontWeight.w700,
              letterSpacing: -0.2,
            ),
          ),
          if (subtitle != null) ...[
            const SizedBox(height: 2),
            Text(
              subtitle!,
              style: TextStyle(fontSize: 12.5, color: scheme.onSurfaceVariant),
            ),
          ],
          const SizedBox(height: 14),
          child,
        ],
      ),
    );
  }
}

/// Крупная кнопка добавления медиа: иконка над подписью.
class _MediaAction extends StatelessWidget {
  const _MediaAction({
    required this.icon,
    required this.label,
    required this.onTap,
    this.primary = false,
    this.width,
    this.height = 96,
  });

  final IconData icon;
  final String label;
  final VoidCallback onTap;

  /// Основное действие подсвечено — с него начинают в большинстве случаев.
  final bool primary;
  final double? width;
  final double height;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final fg = primary ? scheme.primary : scheme.onSurfaceVariant;
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(14),
      child: Container(
        width: width,
        height: height,
        decoration: BoxDecoration(
          color: primary
              ? scheme.primary.withValues(alpha: 0.08)
              : scheme.surfaceContainerHighest.withValues(alpha: 0.5),
          borderRadius: BorderRadius.circular(14),
          border: Border.all(
            color: primary
                ? scheme.primary.withValues(alpha: 0.35)
                : scheme.outlineVariant,
          ),
        ),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(icon, size: 26, color: fg),
            const SizedBox(height: 6),
            Text(
              label,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(
                fontSize: 12.5,
                fontWeight: FontWeight.w600,
                color: fg,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Компактная круглая кнопка (камера/видео), когда медиа уже выбрано.
class _MediaChip extends StatelessWidget {
  const _MediaChip({required this.icon, required this.onTap});
  final IconData icon;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(20),
      child: Container(
        width: 36,
        height: 36,
        decoration: BoxDecoration(
          color: scheme.surfaceContainerHighest.withValues(alpha: 0.6),
          shape: BoxShape.circle,
        ),
        child: Icon(icon, size: 19, color: scheme.onSurfaceVariant),
      ),
    );
  }
}

/// Блок «Дополнительно» — раскрывающаяся секция с полями Category /
/// Location / Who can see this по мокапу SourceHub. Пока значения
/// декоративные (public — по умолчанию, изменение сохраняется только в
/// UI), но структура готова: когда добавим на бэке category/location/
/// visibility, останется прокинуть три значения в submit().
class _CollapsibleSection extends StatefulWidget {
  const _CollapsibleSection({required this.title});
  final String title;

  @override
  State<_CollapsibleSection> createState() => _CollapsibleSectionState();
}

class _CollapsibleSectionState extends State<_CollapsibleSection> {
  bool _open = false;

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context)!;
    final scheme = Theme.of(context).colorScheme;
    return Container(
      decoration: BoxDecoration(
        color: scheme.surface,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: scheme.outlineVariant, width: 0.8),
      ),
      child: Column(
        children: [
          InkWell(
            borderRadius: BorderRadius.circular(20),
            onTap: () => setState(() => _open = !_open),
            child: Padding(
              padding: const EdgeInsets.fromLTRB(14, 16, 12, 16),
              child: Row(
                children: [
                  Text(
                    widget.title,
                    style: const TextStyle(
                      fontSize: 15.5,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  const Spacer(),
                  Icon(_open ? Icons.expand_less : Icons.expand_more,
                      color: scheme.onSurfaceVariant),
                ],
              ),
            ),
          ),
          if (_open) ...[
            const Divider(height: 1),
            _DetailsRow(
              icon: Icons.category_outlined,
              label: l.createFieldCategory,
              trailing: 'Select',
              onTap: () {},
            ),
            const Divider(height: 1, indent: 48),
            _DetailsRow(
              icon: Icons.place_outlined,
              label: l.createFieldLocation,
              trailing: 'Select',
              onTap: () {},
            ),
            const Divider(height: 1, indent: 48),
            _DetailsRow(
              icon: Icons.public_rounded,
              label: l.createFieldVisibility,
              trailing: l.createVisibilityPublic,
              onTap: () {},
            ),
            const SizedBox(height: 6),
          ],
        ],
      ),
    );
  }
}

class _DetailsRow extends StatelessWidget {
  const _DetailsRow({
    required this.icon,
    required this.label,
    required this.trailing,
    required this.onTap,
  });

  final IconData icon;
  final String label;
  final String trailing;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
        child: Row(
          children: [
            Icon(icon, size: 20, color: scheme.onSurfaceVariant),
            const SizedBox(width: 14),
            Text(
              label,
              style: const TextStyle(
                  fontSize: 14, fontWeight: FontWeight.w600),
            ),
            const Spacer(),
            Text(
              trailing,
              style: TextStyle(
                fontSize: 13.5,
                color: scheme.onSurfaceVariant,
              ),
            ),
            const SizedBox(width: 4),
            Icon(Icons.chevron_right,
                size: 20, color: scheme.onSurfaceVariant),
          ],
        ),
      ),
    );
  }
}
