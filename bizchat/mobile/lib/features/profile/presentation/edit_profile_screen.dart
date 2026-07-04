import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import '../../../l10n/app_localizations.dart';
import '../../create_post/data/create_post_repository.dart';
import '../data/profile_repository.dart';

/// Форма редактирования профиля. Все поля заполняются исходными значениями
/// и юзер меняет что хочет. После сохранения возвращает обновлённый
/// `MyProfile` через Navigator.pop, чтобы родитель (ProfileScreen) сразу
/// освежил данные без повторного fetch.
class EditProfileScreen extends StatefulWidget {
  const EditProfileScreen({super.key, required this.initial});

  final MyProfile initial;

  @override
  State<EditProfileScreen> createState() => _EditProfileScreenState();
}

class _EditProfileScreenState extends State<EditProfileScreen> {
  final _repo = ProfileRepository();
  final _uploadsRepo = CreatePostRepository();
  final _picker = ImagePicker();
  final _formKey = GlobalKey<FormState>();

  late final TextEditingController _nameCtrl;
  late final TextEditingController _companyCtrl;
  late final TextEditingController _cityCtrl;
  late String _language;
  late String _currency;
  late String? _countryCode;
  late String? _avatarUrl;

  bool _saving = false;
  bool _uploadingAvatar = false;

  static const _languages = ['ru', 'en', 'zh', 'kk'];
  static const _currencies = ['USD', 'EUR', 'CNY', 'KZT', 'RUB'];

  @override
  void initState() {
    super.initState();
    final p = widget.initial;
    _nameCtrl = TextEditingController(text: p.name ?? '');
    _companyCtrl =
        TextEditingController(text: p.factory?.companyName ?? '');
    _cityCtrl = TextEditingController(text: p.city ?? '');
    _language = p.language;
    _currency = p.currency;
    _countryCode = p.countryCode;
    _avatarUrl = p.avatarUrl;
  }

  @override
  void dispose() {
    _nameCtrl.dispose();
    _companyCtrl.dispose();
    _cityCtrl.dispose();
    super.dispose();
  }

  Future<void> _pickAvatar() async {
    try {
      final picked = await _picker.pickImage(
        source: ImageSource.gallery,
        maxWidth: 1024,
        imageQuality: 85,
      );
      if (picked == null) return;
      setState(() => _uploadingAvatar = true);
      final bytes = await picked.readAsBytes();
      final result = await _uploadsRepo.uploadImages([
        (filename: picked.name, bytes: bytes),
      ]);
      if (!mounted) return;
      if (result.isNotEmpty) {
        setState(() => _avatarUrl = result.first.url);
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(AppLocalizations.of(context)!
                .editProfileAvatarUploadError(e.toString())),
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _uploadingAvatar = false);
    }
  }

  Future<void> _save() async {
    if (_saving) return;
    if (!_formKey.currentState!.validate()) return;
    setState(() => _saving = true);
    try {
      final updated = await _repo.updateMe(
        name: _nameCtrl.text.trim(),
        companyName: widget.initial.isFactory
            ? _companyCtrl.text.trim()
            : null,
        city: _cityCtrl.text.trim(),
        language: _language,
        currency: _currency,
        countryCode: _countryCode,
        avatarUrl: _avatarUrl ?? '',
      );
      if (!mounted) return;
      Navigator.of(context).pop(updated);
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(e.toString().replaceFirst('Exception: ', '')),
        ),
      );
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context)!;
    return Scaffold(
      appBar: AppBar(title: Text(l.editProfileTitle)),
      bottomNavigationBar: SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
          child: FilledButton.icon(
            onPressed: _saving ? null : _save,
            icon: _saving
                ? const SizedBox(
                    width: 20,
                    height: 20,
                    child: CircularProgressIndicator(
                      strokeWidth: 2.5,
                      color: Colors.white,
                    ),
                  )
                : const Icon(Icons.check_rounded, size: 22),
            label: Text(
              _saving ? l.commonLoading : l.commonSave,
              style: const TextStyle(
                fontSize: 17,
                fontWeight: FontWeight.w700,
              ),
            ),
            style: FilledButton.styleFrom(
              minimumSize: const Size(double.infinity, 56),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(16),
              ),
            ),
          ),
        ),
      ),
      body: Form(
        key: _formKey,
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            _buildAvatarSection(),
            const SizedBox(height: 16),
            TextFormField(
              controller: _nameCtrl,
              maxLength: 128,
              decoration: InputDecoration(
                labelText: l.editProfileNameLabel,
                border: const OutlineInputBorder(),
                hintText: l.editProfileNameHint,
              ),
            ),
            const SizedBox(height: 12),
            if (widget.initial.isFactory) ...[
              TextFormField(
                controller: _companyCtrl,
                maxLength: 256,
                decoration: InputDecoration(
                  labelText: l.editProfileCompanyRequiredLabel,
                  border: const OutlineInputBorder(),
                  hintText: l.editProfileCompanyHint,
                ),
                validator: (v) {
                  final t = (v ?? '').trim();
                  if (t.isEmpty) return l.editProfileCompanyRequiredError;
                  return null;
                },
              ),
              const SizedBox(height: 12),
            ],
            DropdownButtonFormField<String>(
              initialValue: _language,
              decoration: InputDecoration(
                labelText: l.editProfileLanguageLabel,
                border: const OutlineInputBorder(),
              ),
              items: _languages
                  .map((lang) => DropdownMenuItem(
                        value: lang,
                        child: Text(lang.toUpperCase()),
                      ))
                  .toList(),
              onChanged: (v) {
                if (v != null) setState(() => _language = v);
              },
            ),
            const SizedBox(height: 12),
            DropdownButtonFormField<String>(
              initialValue: _currency,
              decoration: InputDecoration(
                labelText: l.editProfileCurrencyLabel,
                border: const OutlineInputBorder(),
              ),
              items: _currencies
                  .map((c) => DropdownMenuItem(value: c, child: Text(c)))
                  .toList(),
              onChanged: (v) {
                if (v != null) setState(() => _currency = v);
              },
            ),
            const SizedBox(height: 12),
            DropdownButtonFormField<String?>(
              initialValue: _countryCode,
              decoration: InputDecoration(
                labelText: l.editProfileCountryLabel,
                border: const OutlineInputBorder(),
              ),
              items: [
                const DropdownMenuItem(value: null, child: Text('—')),
                DropdownMenuItem(value: 'KZ', child: Text(l.countryNameKZ)),
                DropdownMenuItem(value: 'RU', child: Text(l.countryNameRU)),
                DropdownMenuItem(value: 'CN', child: Text(l.countryNameCN)),
                DropdownMenuItem(value: 'UZ', child: Text(l.countryNameUZ)),
                DropdownMenuItem(value: 'KG', child: Text(l.countryNameKG)),
                DropdownMenuItem(value: 'BY', child: Text(l.countryNameBY)),
                DropdownMenuItem(value: 'TR', child: Text(l.countryNameTR)),
              ],
              onChanged: (v) => setState(() => _countryCode = v),
            ),
            const SizedBox(height: 12),
            TextFormField(
              controller: _cityCtrl,
              maxLength: 128,
              decoration: InputDecoration(
                labelText: l.editProfileCityLabel,
                border: const OutlineInputBorder(),
                hintText: l.editProfileCityHint,
              ),
            ),
            const SizedBox(height: 24),
          ],
        ),
      ),
    );
  }

  Widget _buildAvatarSection() {
    final scheme = Theme.of(context).colorScheme;
    final displayInitial = (widget.initial.name?.isNotEmpty == true
            ? widget.initial.name!
            : widget.initial.factory?.companyName ?? '?')[0]
        .toUpperCase();
    return Center(
      child: Stack(
        children: [
          CircleAvatar(
            radius: 48,
            backgroundColor: scheme.primaryContainer,
            backgroundImage: _avatarUrl != null && _avatarUrl!.isNotEmpty
                ? NetworkImage(_resolveAvatar(_avatarUrl!))
                : null,
            child: _avatarUrl == null || _avatarUrl!.isEmpty
                ? Text(
                    displayInitial,
                    style: TextStyle(
                      fontSize: 36,
                      fontWeight: FontWeight.w700,
                      color: scheme.onPrimaryContainer,
                    ),
                  )
                : null,
          ),
          Positioned(
            right: 0,
            bottom: 0,
            child: Material(
              color: scheme.primary,
              shape: const CircleBorder(),
              child: InkWell(
                customBorder: const CircleBorder(),
                onTap: _uploadingAvatar ? null : _pickAvatar,
                child: Padding(
                  padding: const EdgeInsets.all(8),
                  child: _uploadingAvatar
                      ? SizedBox(
                          width: 16,
                          height: 16,
                          child: CircularProgressIndicator(
                            strokeWidth: 2,
                            color: scheme.onPrimary,
                          ),
                        )
                      : Icon(Icons.camera_alt,
                          size: 16, color: scheme.onPrimary),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  String _resolveAvatar(String url) {
    if (url.startsWith('http://') || url.startsWith('https://')) return url;
    // Используем тот же helper что и для media — в ApiClient.
    // Импорт прямой делать не хочется (циклические зависимости риски), используем repo.
    return _uploadsRepo.baseStaticUrl + url;
  }
}
