import 'package:flutter/material.dart';
import '../../../l10n/app_localizations.dart';
import '../data/moderation_repository.dart';

/// Диалог выбора причины жалобы. Возвращает true если жалоба отправлена.
Future<bool> showReportDialog(
  BuildContext context, {
  required String targetType,
  required String targetId,
}) async {
  return await showModalBottomSheet<bool>(
        context: context,
        showDragHandle: true,
        isScrollControlled: true,
        builder: (_) => _ReportSheet(
          targetType: targetType,
          targetId: targetId,
        ),
      ) ??
      false;
}

class _ReportSheet extends StatefulWidget {
  const _ReportSheet({required this.targetType, required this.targetId});
  final String targetType;
  final String targetId;

  @override
  State<_ReportSheet> createState() => _ReportSheetState();
}

class _ReportSheetState extends State<_ReportSheet> {
  final _repo = ModerationRepository();
  final _descCtrl = TextEditingController();
  String? _selectedReason;
  bool _submitting = false;

  @override
  void dispose() {
    _descCtrl.dispose();
    super.dispose();
  }

  static const _reasons = [
    ('spam', Icons.block, 'Спам'),
    ('inappropriate', Icons.warning_amber, 'Неприемлемый контент'),
    ('fraud', Icons.report_problem, 'Мошенничество'),
    ('fake', Icons.error_outline, 'Подделка'),
    ('offensive', Icons.flag_outlined, 'Оскорбления'),
    ('other', Icons.more_horiz, 'Другое'),
  ];

  Future<void> _submit() async {
    if (_selectedReason == null || _submitting) return;
    setState(() => _submitting = true);
    try {
      await _repo.report(
        targetType: widget.targetType,
        targetId: widget.targetId,
        reason: _selectedReason!,
        description: _descCtrl.text.trim().isEmpty ? null : _descCtrl.text.trim(),
      );
      if (!mounted) return;
      Navigator.of(context).pop(true);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(AppLocalizations.of(context)!.reportSent)),
      );
    } catch (e) {
      if (!mounted) return;
      setState(() => _submitting = false);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(e.toString().replaceFirst('Exception: ', ''))),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context)!;
    return Padding(
      padding: EdgeInsets.only(
        bottom: MediaQuery.of(context).viewInsets.bottom,
      ),
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              l.reportTitle,
              style: Theme.of(context).textTheme.titleLarge?.copyWith(
                    fontWeight: FontWeight.w700,
                  ),
            ),
            const SizedBox(height: 8),
            Text(
              l.reportSubtitle,
              style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                    color: Theme.of(context).colorScheme.onSurfaceVariant,
                  ),
            ),
            const SizedBox(height: 16),
            ..._reasons.map((r) {
              final selected = _selectedReason == r.$1;
              return RadioListTile<String>(
                value: r.$1,
                groupValue: _selectedReason,
                onChanged: (v) => setState(() => _selectedReason = v),
                title: Row(
                  children: [
                    Icon(r.$2, size: 20),
                    const SizedBox(width: 12),
                    Text(r.$3),
                  ],
                ),
                contentPadding: EdgeInsets.zero,
                selected: selected,
              );
            }),
            const SizedBox(height: 12),
            TextField(
              controller: _descCtrl,
              maxLines: 3,
              maxLength: 500,
              decoration: InputDecoration(
                labelText: l.reportDescriptionLabel,
                hintText: l.reportDescriptionHint,
                border: const OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 16),
            Row(
              children: [
                Expanded(
                  child: TextButton(
                    onPressed: _submitting
                        ? null
                        : () => Navigator.of(context).pop(false),
                    child: Text(l.commonCancel),
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: FilledButton.icon(
                    onPressed: _selectedReason == null || _submitting
                        ? null
                        : _submit,
                    icon: _submitting
                        ? const SizedBox(
                            width: 18,
                            height: 18,
                            child: CircularProgressIndicator(
                              strokeWidth: 2,
                              color: Colors.white,
                            ),
                          )
                        : const Icon(Icons.send),
                    label: Text(l.reportSubmit),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
