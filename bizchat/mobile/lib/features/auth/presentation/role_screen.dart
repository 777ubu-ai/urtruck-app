import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../../../l10n/app_localizations.dart';
import '../data/auth_repository.dart';
import '../../feed/presentation/feed_screen.dart';

/// Третий шаг — только для новых пользователей: выбор типа аккаунта.
///
/// **Почему экран снова просит код?**
/// Backend (`auth.service.ts` -> `verifySmsCode`) удаляет запись `SmsCode`
/// из БД сразу после успешной проверки хэша, ДО проверки `dto.type`. Это
/// значит что когда первый verify (без type) проходит — код «сгорает» даже
/// если бэк потом кидает `BadRequestException('нужен type')`. Поэтому
/// фронт не может просто подставить тот же код при повторном запросе с
/// `type` — бэк его не найдёт.
///
/// Решение: `CodeScreen` перед переходом сюда вызывает `sendSmsCode`
/// (auto-resend), и пользователь вводит свежий код уже здесь. Мы дополнительно
/// делаем auto-resend при mount экрана как защиту от race-condition (если
/// пользователь ушёл назад и вернулся).
///
/// Blueprint §14.1, шаг 2.
class RoleScreen extends StatefulWidget {
  const RoleScreen({super.key, required this.phone, required this.code});
  final String phone;
  /// SMS-код уже введён на CodeScreen — повторный ввод не нужен.
  final String code;

  @override
  State<RoleScreen> createState() => _RoleScreenState();
}

class _RoleScreenState extends State<RoleScreen> {
  final _repo = AuthRepository();
  final _cityCtrl = TextEditingController();
  String? _selectedRole;
  String? _countryCode;
  bool _loading = false;
  String? _error;

  @override
  void dispose() {
    _cityCtrl.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final l = AppLocalizations.of(context)!;
    if (_selectedRole == null) {
      setState(() => _error = l.authRolePickRole);
      return;
    }
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      await _repo.verifySmsCode(
        phone: widget.phone,
        code: widget.code,
        type: _selectedRole,
        countryCode: _countryCode,
        city: _cityCtrl.text.trim().isEmpty ? null : _cityCtrl.text.trim(),
      );
      if (!mounted) return;
      Navigator.of(context).pushAndRemoveUntil(
        MaterialPageRoute(builder: (_) => const FeedScreen()),
        (_) => false,
      );
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = e.toString().replaceFirst('Exception: ', ''));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context)!;
    return Scaffold(
      appBar: AppBar(title: Text(l.authRoleTitle)),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const SizedBox(height: 8),
              Text(
                l.authRoleTitle,
                style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                      fontWeight: FontWeight.w600,
                    ),
              ),
              const SizedBox(height: 8),
              Text(
                l.authRolePickToContinue,
                style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                      color: Theme.of(context).colorScheme.onSurfaceVariant,
                    ),
              ),
              const SizedBox(height: 24),
              _RoleCard(
                icon: Icons.shopping_bag_outlined,
                title: l.authRoleBuyer,
                subtitle: l.authRoleBuyerDesc,
                selected: _selectedRole == 'buyer',
                onTap: () => setState(() => _selectedRole = 'buyer'),
              ),
              const SizedBox(height: 12),
              _RoleCard(
                icon: Icons.factory_outlined,
                title: l.authRoleFactory,
                subtitle: l.authRoleFactoryDesc,
                selected: _selectedRole == 'factory',
                onTap: () => setState(() => _selectedRole = 'factory'),
              ),
              const SizedBox(height: 20),
              // S2-01: Страна + город при регистрации
              DropdownButtonFormField<String?>(
                initialValue: _countryCode,
                decoration: InputDecoration(
                  labelText: l.editProfileCountryLabel,
                  border: const OutlineInputBorder(),
                  prefixIcon: const Icon(Icons.public),
                ),
                items: [
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
              TextField(
                controller: _cityCtrl,
                decoration: InputDecoration(
                  labelText: l.editProfileCityLabel,
                  hintText: l.editProfileCityHint,
                  border: const OutlineInputBorder(),
                  prefixIcon: const Icon(Icons.location_city),
                ),
              ),
              if (_error != null) ...[
                const SizedBox(height: 12),
                Text(
                  _error!,
                  style: TextStyle(
                    color: Theme.of(context).colorScheme.error,
                    fontSize: 14,
                  ),
                  textAlign: TextAlign.center,
                ),
              ],
              const SizedBox(height: 24),
              FilledButton(
                onPressed: _loading ? null : _submit,
                child: _loading
                    ? const SizedBox(
                        width: 22,
                        height: 22,
                        child: CircularProgressIndicator(
                          strokeWidth: 2.5,
                          color: Colors.white,
                        ),
                      )
                    : Text(l.authRoleFinishButton),
              ),
              const SizedBox(height: 16),
            ],
          ),
        ),
      ),
    );
  }
}

class _RoleCard extends StatelessWidget {
  const _RoleCard({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.selected,
    required this.onTap,
  });

  final IconData icon;
  final String title;
  final String subtitle;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Material(
      color:
          selected ? scheme.primaryContainer : scheme.surfaceContainerLow,
      borderRadius: BorderRadius.circular(16),
      child: InkWell(
        borderRadius: BorderRadius.circular(16),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Row(
            children: [
              CircleAvatar(
                backgroundColor:
                    selected ? scheme.primary : scheme.surfaceContainerHighest,
                foregroundColor:
                    selected ? scheme.onPrimary : scheme.onSurface,
                child: Icon(icon),
              ),
              const SizedBox(width: 16),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      title,
                      style:
                          Theme.of(context).textTheme.titleMedium?.copyWith(
                                fontWeight: FontWeight.w600,
                              ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      subtitle,
                      style: Theme.of(context).textTheme.bodySmall?.copyWith(
                            color: scheme.onSurfaceVariant,
                          ),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              if (selected)
                Icon(Icons.check_circle, color: scheme.primary)
              else
                Icon(Icons.radio_button_unchecked,
                    color: scheme.onSurfaceVariant),
            ],
          ),
        ),
      ),
    );
  }
}
