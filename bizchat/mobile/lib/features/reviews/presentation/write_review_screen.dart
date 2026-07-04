import 'package:flutter/material.dart';
import '../../../l10n/app_localizations.dart';
import '../data/review_repository.dart';

/// Форма создания/редактирования отзыва. Если у юзера уже есть отзыв
/// на этот завод — предзаполняется существующими значениями (UPSERT поведение).
///
/// MVP: photos picker не подключён — на бэке поле есть, на фронте можно
/// добавить позже через `image_picker` и upload в `/uploads/images`.
class WriteReviewScreen extends StatefulWidget {
  const WriteReviewScreen({
    super.key,
    required this.factoryId,
    required this.factoryName,
  });

  final String factoryId;
  final String factoryName;

  @override
  State<WriteReviewScreen> createState() => _WriteReviewScreenState();
}

class _WriteReviewScreenState extends State<WriteReviewScreen> {
  final _repo = ReviewRepository();
  final _textCtrl = TextEditingController();
  int _rating = 5;
  bool _loading = false;
  bool _initialLoading = true;
  bool _existing = false;

  @override
  void initState() {
    super.initState();
    _loadExisting();
  }

  Future<void> _loadExisting() async {
    final existing = await _repo.loadMyReview(widget.factoryId);
    if (!mounted) return;
    setState(() {
      if (existing != null) {
        _existing = true;
        _rating = (existing['rating'] as num).toInt();
        _textCtrl.text = (existing['text'] as String?) ?? '';
      }
      _initialLoading = false;
    });
  }

  @override
  void dispose() {
    _textCtrl.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (_loading) return;
    setState(() => _loading = true);
    try {
      await _repo.upsert(
        factoryId: widget.factoryId,
        rating: _rating,
        text: _textCtrl.text.trim().isEmpty ? null : _textCtrl.text.trim(),
      );
      if (!mounted) return;
      final l = AppLocalizations.of(context)!;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(_existing ? l.reviewsUpdated : l.reviewsPublished),
          duration: const Duration(seconds: 2),
        ),
      );
      Navigator.of(context).pop(true);
    } catch (e) {
      if (!mounted) return;
      setState(() => _loading = false);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(e.toString().replaceFirst('Exception: ', ''))),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context)!;
    return Scaffold(
      appBar: AppBar(
        title: Text(_existing ? l.reviewsEditTitle : l.reviewsNewTitle),
      ),
      body: _initialLoading
          ? const Center(child: CircularProgressIndicator())
          : SingleChildScrollView(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    widget.factoryName,
                    style: Theme.of(context).textTheme.titleLarge?.copyWith(
                          fontWeight: FontWeight.w700,
                        ),
                  ),
                  const SizedBox(height: 24),
                  Text(l.reviewsRating,
                      style: Theme.of(context).textTheme.titleMedium),
                  const SizedBox(height: 8),
                  _RatingPicker(
                    value: _rating,
                    onChanged: (v) => setState(() => _rating = v),
                  ),
                  const SizedBox(height: 24),
                  Text(l.reviewsComment,
                      style: Theme.of(context).textTheme.titleMedium),
                  const SizedBox(height: 8),
                  TextField(
                    controller: _textCtrl,
                    maxLines: 6,
                    maxLength: 2000,
                    decoration: InputDecoration(
                      hintText: l.reviewsCommentHint,
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(12),
                      ),
                    ),
                  ),
                  const SizedBox(height: 24),
                  SizedBox(
                    width: double.infinity,
                    child: FilledButton.icon(
                      onPressed: _loading ? null : _submit,
                      icon: _loading
                          ? const SizedBox(
                              width: 18,
                              height: 18,
                              child: CircularProgressIndicator(strokeWidth: 2),
                            )
                          : const Icon(Icons.send),
                      label: Text(
                        _existing ? l.reviewsSaveChanges : l.reviewsPublish,
                      ),
                      style: FilledButton.styleFrom(
                        minimumSize: const Size.fromHeight(48),
                      ),
                    ),
                  ),
                ],
              ),
            ),
    );
  }
}

class _RatingPicker extends StatelessWidget {
  const _RatingPicker({required this.value, required this.onChanged});
  final int value;
  final ValueChanged<int> onChanged;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.center,
      children: List.generate(5, (i) {
        final star = i + 1;
        final filled = star <= value;
        return IconButton(
          iconSize: 40,
          onPressed: () => onChanged(star),
          icon: Icon(
            filled ? Icons.star : Icons.star_border,
            color: filled ? Colors.amber : Colors.grey,
          ),
        );
      }),
    );
  }
}
