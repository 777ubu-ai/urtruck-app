import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../../../l10n/app_localizations.dart';
import '../data/auth_repository.dart';
import 'role_screen.dart';
import '../../feed/presentation/feed_screen.dart';

/// Экран ввода SMS-кода — второй шаг.
///
/// Логика:
///  1. Пользователь ввёл код
///  2. Сразу пробуем verify без type
///  3. Если бэк ответил что пользователь новый и нужен type → переходим на RoleScreen
///  4. Если верификация успешна — переходим на ленту
class CodeScreen extends StatefulWidget {
  const CodeScreen({super.key, required this.phone});
  final String phone;

  @override
  State<CodeScreen> createState() => _CodeScreenState();
}

class _CodeScreenState extends State<CodeScreen> {
  final _controller = TextEditingController();
  final _repo = AuthRepository();
  bool _loading = false;
  String? _error;

  Future<void> _submit() async {
    final l = AppLocalizations.of(context)!;
    final code = _controller.text.trim();
    if (code.length < 4) {
      setState(() => _error = l.authCodeTooShort);
      return;
    }
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final result = await _repo.verifySmsCode(
        phone: widget.phone,
        code: code,
      );
      if (!mounted) return;

      if (result.isNew) {
        // Пошло через verify БЕЗ type, но бэк всё равно зарегистрировал дефолт
        // (этот кейс не должен возникать при правильной работе бэка, но если вдруг)
      }

      Navigator.of(context).pushAndRemoveUntil(
        MaterialPageRoute(builder: (_) => const FeedScreen()),
        (_) => false,
      );
    } on AuthException catch (e) {
      if (!mounted) return;
      // Если бэк сообщает «нужно указать type» — это новый юзер.
      // Backend теперь НЕ удаляет SMS-код при этой ошибке, поэтому
      // можно повторить verify с тем же кодом + type. Передаём код
      // на RoleScreen чтобы юзер НЕ вводил его второй раз.
      if (e.toString().toLowerCase().contains('type')) {
        if (!mounted) return;
        Navigator.of(context).pushReplacement(MaterialPageRoute(
          builder: (_) => RoleScreen(
            phone: widget.phone,
            code: _controller.text.trim(),
          ),
        ));
        return;
      }
      setState(() => _error = e.toString().replaceFirst('Exception: ', ''));
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = e.toString().replaceFirst('Exception: ', ''));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context)!;
    return Scaffold(
      appBar: AppBar(title: Text(l.authCodeTitle)),
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const SizedBox(height: 32),
              Text(
                l.authCodeSubtitle(widget.phone),
                style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                      color: Theme.of(context).colorScheme.onSurfaceVariant,
                    ),
              ),
              const SizedBox(height: 32),
              TextField(
                controller: _controller,
                keyboardType: TextInputType.number,
                textAlign: TextAlign.center,
                autofocus: true,
                maxLength: 8,
                inputFormatters: [
                  FilteringTextInputFormatter.digitsOnly,
                ],
                style: const TextStyle(
                  fontSize: 28,
                  letterSpacing: 12,
                  fontWeight: FontWeight.w600,
                ),
                decoration: InputDecoration(
                  labelText: l.authCodeHint,
                  counterText: '',
                ),
                onSubmitted: (_) => _submit(),
              ),
              if (_error != null) ...[
                const SizedBox(height: 8),
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
                    : Text(l.commonContinue),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
