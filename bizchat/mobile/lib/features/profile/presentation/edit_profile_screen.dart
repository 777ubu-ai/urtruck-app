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
  late final TextEditingController _descriptionCtrl;
  late final TextEditingController _websiteCtrl;
  late final TextEditingController _whatsappCtrl;
  late final TextEditingController _addressCtrl;
  late final TextEditingController _mainProductsCtrl;
  late final TextEditingController _certificationsCtrl;
  late final TextEditingController _exportMarketsCtrl;
  late final TextEditingController _totalEmployeesCtrl;
  late final TextEditingController _establishedCtrl;
  String? _factoryType;
  String? _coverUrl;
  bool _uploadingCover = false;
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
    _descriptionCtrl =
        TextEditingController(text: p.factory?.description ?? '');
    _websiteCtrl = TextEditingController(text: p.factory?.website ?? '');
    _whatsappCtrl = TextEditingController(text: p.factory?.whatsapp ?? '');
    _addressCtrl = TextEditingController(text: p.factory?.address ?? '');
    _mainProductsCtrl = TextEditingController(
      text: (p.factory?.mainProducts ?? const []).join(', '),
    );
    _certificationsCtrl = TextEditingController(
      text: (p.factory?.certifications ?? const []).join(', '),
    );
    _exportMarketsCtrl = TextEditingController(
      text: (p.factory?.exportMarkets ?? const []).join(', '),
    );
    _totalEmployeesCtrl =
        TextEditingController(text: p.factory?.totalEmployees ?? '');
    _establishedCtrl = TextEditingController(
      text: p.factory?.establishedYear?.toString() ?? '',
    );
    _factoryType = p.factory?.factoryType;
    _coverUrl = p.factory?.coverUrl;
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
    _descriptionCtrl.dispose();
    _websiteCtrl.dispose();
    _whatsappCtrl.dispose();
    _addressCtrl.dispose();
    _mainProductsCtrl.dispose();
    _certificationsCtrl.dispose();
    _exportMarketsCtrl.dispose();
    _totalEmployeesCtrl.dispose();
    _establishedCtrl.dispose();
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

  Future<void> _pickCover() async {
    try {
      final picked = await _picker.pickImage(
        source: ImageSource.gallery,
        maxWidth: 1600,
        imageQuality: 85,
      );
      if (picked == null) return;
      setState(() => _uploadingCover = true);
      final bytes = await picked.readAsBytes();
      final result = await _uploadsRepo.uploadImages([
        (filename: picked.name, bytes: bytes),
      ]);
      if (!mounted) return;
      if (result.isNotEmpty) {
        setState(() => _coverUrl = result.first.url);
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
      if (mounted) setState(() => _uploadingCover = false);
    }
  }

  /// Строки, разделённые запятой, — в чистый список без пустых элементов.
  List<String> _splitCsv(String raw) => raw
      .split(',')
      .map((s) => s.trim())
      .where((s) => s.isNotEmpty)
      .toList(growable: false);

  Future<void> _save() async {
    if (_saving) return;
    if (!_formKey.currentState!.validate()) return;
    setState(() => _saving = true);
    try {
      final isFactory = widget.initial.isFactory;
      final updated = await _repo.updateMe(
        name: _nameCtrl.text.trim(),
        companyName: isFactory ? _companyCtrl.text.trim() : null,
        city: _cityCtrl.text.trim(),
        language: _language,
        currency: _currency,
        countryCode: _countryCode,
        avatarUrl: _avatarUrl ?? '',
        description: isFactory ? _descriptionCtrl.text.trim() : null,
        website: isFactory ? _websiteCtrl.text.trim() : null,
        whatsapp: isFactory ? _whatsappCtrl.text.trim() : null,
        address: isFactory ? _addressCtrl.text.trim() : null,
        coverUrl: isFactory ? (_coverUrl ?? '') : null,
        factoryType: isFactory ? (_factoryType ?? '') : null,
        mainProducts:
            isFactory ? _splitCsv(_mainProductsCtrl.text) : null,
        certifications:
            isFactory ? _splitCsv(_certificationsCtrl.text) : null,
        exportMarkets:
            isFactory ? _splitCsv(_exportMarketsCtrl.text) : null,
        totalEmployees:
            isFactory ? _totalEmployeesCtrl.text.trim() : null,
        establishedYear: isFactory
            ? int.tryParse(_establishedCtrl.text.trim())
            : null,
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
              // «О заводе» — то, что покупатель видит первым делом на
              // витрине. Раньше поля для этого в форме не было вообще, хотя
              // сервер его давно принимал — заполнить бренд мог только
              // напрямую в базе.
              TextFormField(
                controller: _descriptionCtrl,
                maxLength: 2000,
                maxLines: 5,
                minLines: 3,
                decoration: InputDecoration(
                  labelText: l.editProfileDescriptionLabel,
                  border: const OutlineInputBorder(),
                  hintText: l.editProfileDescriptionHint,
                  alignLabelWithHint: true,
                ),
              ),
              const SizedBox(height: 12),
              TextFormField(
                controller: _addressCtrl,
                maxLength: 1024,
                maxLines: 2,
                minLines: 1,
                decoration: InputDecoration(
                  labelText: l.editProfileAddressLabel,
                  border: const OutlineInputBorder(),
                  hintText: l.editProfileAddressHint,
                ),
              ),
              const SizedBox(height: 12),
              TextFormField(
                controller: _whatsappCtrl,
                keyboardType: TextInputType.phone,
                decoration: InputDecoration(
                  labelText: l.editProfileWhatsappLabel,
                  border: const OutlineInputBorder(),
                  hintText: l.editProfileWhatsappHint,
                  prefixIcon: const Icon(Icons.chat_rounded),
                ),
              ),
              const SizedBox(height: 12),
              TextFormField(
                controller: _websiteCtrl,
                keyboardType: TextInputType.url,
                decoration: InputDecoration(
                  labelText: l.editProfileWebsiteLabel,
                  border: const OutlineInputBorder(),
                  hintText: l.editProfileWebsiteHint,
                  prefixIcon: const Icon(Icons.link_rounded),
                ),
              ),
              const SizedBox(height: 20),
              // Обложка магазина — крупный баннер вверху страницы завода.
              _CoverPicker(
                coverUrl: _coverUrl,
                uploading: _uploadingCover,
                onPick: _pickCover,
                onClear: () => setState(() => _coverUrl = ''),
                resolve: _resolveAvatar,
                labelPick: l.editProfileCoverPick,
                labelTitle: l.editProfileCoverLabel,
              ),
              const SizedBox(height: 12),
              DropdownButtonFormField<String>(
                initialValue: _factoryType,
                decoration: InputDecoration(
                  labelText: l.editProfileFactoryTypeLabel,
                  border: const OutlineInputBorder(),
                ),
                items: [
                  DropdownMenuItem(
                    value: 'manufacturer',
                    child: Text(l.editProfileFactoryTypeManufacturer),
                  ),
                  DropdownMenuItem(
                    value: 'trading',
                    child: Text(l.editProfileFactoryTypeTrading),
                  ),
                  DropdownMenuItem(
                    value: 'both',
                    child: Text(l.editProfileFactoryTypeBoth),
                  ),
                ],
                onChanged: (v) => setState(() => _factoryType = v),
              ),
              const SizedBox(height: 12),
              TextFormField(
                controller: _mainProductsCtrl,
                maxLines: 2,
                minLines: 1,
                decoration: InputDecoration(
                  labelText: l.editProfileMainProductsLabel,
                  border: const OutlineInputBorder(),
                  hintText: l.editProfileMainProductsHint,
                ),
              ),
              const SizedBox(height: 12),
              TextFormField(
                controller: _certificationsCtrl,
                maxLines: 2,
                minLines: 1,
                decoration: InputDecoration(
                  labelText: l.editProfileCertificationsLabel,
                  border: const OutlineInputBorder(),
                  hintText: l.editProfileCertificationsHint,
                ),
              ),
              const SizedBox(height: 12),
              TextFormField(
                controller: _exportMarketsCtrl,
                maxLines: 2,
                minLines: 1,
                decoration: InputDecoration(
                  labelText: l.editProfileExportMarketsLabel,
                  border: const OutlineInputBorder(),
                  hintText: l.editProfileExportMarketsHint,
                ),
              ),
              const SizedBox(height: 12),
              Row(
                children: [
                  Expanded(
                    child: TextFormField(
                      controller: _totalEmployeesCtrl,
                      decoration: InputDecoration(
                        labelText: l.editProfileTotalEmployeesLabel,
                        border: const OutlineInputBorder(),
                        hintText: l.editProfileTotalEmployeesHint,
                      ),
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: TextFormField(
                      controller: _establishedCtrl,
                      keyboardType: TextInputType.number,
                      decoration: InputDecoration(
                        labelText: l.editProfileEstablishedYearLabel,
                        border: const OutlineInputBorder(),
                        hintText: l.editProfileEstablishedYearHint,
                      ),
                    ),
                  ),
                ],
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

/// Виджет выбора обложки магазина: пустое место кнопкой «выбрать», либо
/// уже загруженная картинка с overlay-контролами (заменить / убрать).
class _CoverPicker extends StatelessWidget {
  const _CoverPicker({
    required this.coverUrl,
    required this.uploading,
    required this.onPick,
    required this.onClear,
    required this.resolve,
    required this.labelPick,
    required this.labelTitle,
  });

  final String? coverUrl;
  final bool uploading;
  final VoidCallback onPick;
  final VoidCallback onClear;
  final String Function(String) resolve;
  final String labelPick;
  final String labelTitle;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final has = coverUrl != null && coverUrl!.isNotEmpty;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.only(left: 4, bottom: 6),
          child: Text(labelTitle,
              style: TextStyle(
                fontSize: 13,
                color: scheme.onSurfaceVariant,
              )),
        ),
        InkWell(
          onTap: uploading ? null : onPick,
          borderRadius: BorderRadius.circular(14),
          child: ClipRRect(
            borderRadius: BorderRadius.circular(14),
            child: Container(
              width: double.infinity,
              height: 130,
              color: scheme.surfaceContainerHighest,
              child: has
                  ? Stack(
                      fit: StackFit.expand,
                      children: [
                        Image.network(resolve(coverUrl!), fit: BoxFit.cover),
                        if (uploading)
                          Container(
                            color: Colors.black38,
                            alignment: Alignment.center,
                            child: const CircularProgressIndicator(
                              strokeWidth: 2.5,
                              color: Colors.white,
                            ),
                          ),
                        Positioned(
                          top: 8,
                          right: 8,
                          child: InkWell(
                            onTap: onClear,
                            borderRadius: BorderRadius.circular(20),
                            child: Container(
                              padding: const EdgeInsets.all(6),
                              decoration: const BoxDecoration(
                                color: Colors.black54,
                                shape: BoxShape.circle,
                              ),
                              child: const Icon(Icons.close,
                                  size: 16, color: Colors.white),
                            ),
                          ),
                        ),
                      ],
                    )
                  : Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Icon(Icons.photo_camera_rounded,
                            size: 28, color: scheme.onSurfaceVariant),
                        const SizedBox(height: 6),
                        Text(
                          labelPick,
                          style: TextStyle(
                            fontSize: 13,
                            fontWeight: FontWeight.w600,
                            color: scheme.onSurfaceVariant,
                          ),
                        ),
                      ],
                    ),
            ),
          ),
        ),
      ],
    );
  }
}
