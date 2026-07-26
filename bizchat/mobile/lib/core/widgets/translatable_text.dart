import 'package:flutter/material.dart';
import '../api/api_client.dart';
import '../i18n/locale_notifier.dart';

/// Текст с автоматическим переводом — ключевая механика маркетплейса
/// Китай ↔ СНГ: завод пишет по-китайски, покупатель видит на своём языке.
///
/// Логика:
///   1. Определяем скрипт текста (иероглифы / кириллица / латиница).
///   2. Если текст на другом языке, чем интерфейс — переводим АВТОМАТИЧЕСКИ,
///      без нажатий (как просил владелец: «сразу должен показывать перевод»).
///   3. Под текстом — компактная плашка «Переведено · Оригинал» для
///      возврата к исходнику (как в Instagram/Facebook).
///
/// Перевод кешируется на бэке, поэтому повторный показ мгновенный.
class TranslatableText extends StatefulWidget {
  const TranslatableText({
    super.key,
    required this.text,
    this.style,
    this.maxLines,
    this.overflow,
    this.autoTranslate = true,
  });

  final String text;
  final TextStyle? style;
  final int? maxLines;
  final TextOverflow? overflow;

  /// false — не переводить автоматически, только показать ссылку «Перевести».
  final bool autoTranslate;

  @override
  State<TranslatableText> createState() => _TranslatableTextState();
}

class _TranslatableTextState extends State<TranslatableText> {
  String? _translated;
  bool _showOriginal = false;
  bool _loading = false;
  bool _failed = false;

  /// Язык интерфейса (ru/en/zh/kk) — цель перевода.
  String get _targetLang => LocaleNotifier.instance.value.languageCode;

  @override
  void initState() {
    super.initState();
    if (widget.autoTranslate && _needsTranslation(widget.text, _targetLang)) {
      // Не блокируем первый кадр — перевод подтянется и обновит текст.
      WidgetsBinding.instance.addPostFrameCallback((_) => _translate());
    }
  }

  @override
  void didUpdateWidget(covariant TranslatableText old) {
    super.didUpdateWidget(old);
    if (old.text != widget.text) {
      _translated = null;
      _failed = false;
      if (widget.autoTranslate && _needsTranslation(widget.text, _targetLang)) {
        _translate();
      }
    }
  }

  /// Нужен ли перевод: сравниваем «скрипт» текста с языком интерфейса.
  /// Дёшево и без сетевых вызовов — точного определения языка не требуется,
  /// важно лишь не переводить текст, который и так на языке пользователя.
  static bool _needsTranslation(String text, String targetLang) {
    if (text.trim().isEmpty) return false;
    final hasCjk = RegExp(r'[一-鿿぀-ヿ]').hasMatch(text);
    final hasCyrillic = RegExp(r'[Ѐ-ӿ]').hasMatch(text);

    switch (targetLang) {
      case 'zh':
        // Интерфейс китайский — переводим всё некитайское.
        return !hasCjk && text.length > 2;
      case 'ru':
      case 'kk':
        // Интерфейс русский/казахский — переводим иероглифы.
        // Латиницу не трогаем: бренды и артикулы переводить не нужно.
        return hasCjk;
      case 'en':
        return hasCjk || hasCyrillic;
      default:
        return hasCjk;
    }
  }

  Future<void> _translate() async {
    if (_loading || _translated != null) return;
    setState(() => _loading = true);
    try {
      final res = await ApiClient.instance.dio.post<Map<String, dynamic>>(
        '/translate',
        data: {'text': widget.text, 'targetLang': _targetLang},
      );
      final translated = res.data?['translated'] as String?;
      if (!mounted) return;
      setState(() {
        _translated = translated;
        _loading = false;
        _failed = translated == null;
      });
    } catch (_) {
      if (!mounted) return;
      // Перевод — необязательная надстройка: при сбое просто показываем оригинал.
      setState(() {
        _loading = false;
        _failed = true;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final hasTranslation = _translated != null && _translated!.isNotEmpty;
    final shown =
        hasTranslation && !_showOriginal ? _translated! : widget.text;
    final needs = _needsTranslation(widget.text, _targetLang);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          shown,
          style: widget.style,
          maxLines: widget.maxLines,
          overflow: widget.overflow,
        ),
        // Плашка статуса перевода — только когда он вообще уместен.
        if (needs && !_failed)
          Padding(
            padding: const EdgeInsets.only(top: 3),
            child: _loading
                ? Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      SizedBox(
                        width: 10,
                        height: 10,
                        child: CircularProgressIndicator(
                          strokeWidth: 1.6,
                          color: scheme.onSurfaceVariant,
                        ),
                      ),
                      const SizedBox(width: 6),
                      Text(
                        'Перевод…',
                        style: TextStyle(
                          fontSize: 12.5,
                          color: scheme.onSurfaceVariant,
                        ),
                      ),
                    ],
                  )
                : hasTranslation
                    ? InkWell(
                        onTap: () =>
                            setState(() => _showOriginal = !_showOriginal),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Icon(Icons.translate_rounded,
                                size: 13, color: scheme.onSurfaceVariant),
                            const SizedBox(width: 4),
                            Text(
                              _showOriginal ? 'Показать перевод' : 'Оригинал',
                              style: TextStyle(
                                fontSize: 12.5,
                                fontWeight: FontWeight.w600,
                                color: scheme.onSurfaceVariant,
                              ),
                            ),
                          ],
                        ),
                      )
                    // autoTranslate=false — ручная ссылка «Перевести».
                    : InkWell(
                        onTap: _translate,
                        child: Text(
                          'Перевести',
                          style: TextStyle(
                            fontSize: 12.5,
                            fontWeight: FontWeight.w600,
                            color: scheme.onSurfaceVariant,
                          ),
                        ),
                      ),
          ),
      ],
    );
  }
}
