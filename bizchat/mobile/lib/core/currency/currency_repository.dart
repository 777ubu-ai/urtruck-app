import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import '../api/api_client.dart';

/// Singleton с курсами валют. Грузится один раз при старте приложения
/// и кешируется в памяти. На фронте мы делаем тысячи конвертаций (каждая
/// карточка в ленте), в БД ходить через API на каждую — нерационально.
///
/// Все курсы относительно USD. Конвертация X→Y = `(amount / rate[X]) * rate[Y]`.
class CurrencyRepository {
  CurrencyRepository._();
  static final CurrencyRepository instance = CurrencyRepository._();

  /// Map валюта → курс относительно USD. Например `{"USD": 1, "RUB": 92.5, ...}`.
  Map<String, double> _rates = const {};
  DateTime? _loadedAt;
  bool _loading = false;

  /// Валюта текущего юзера для авто-конвертации UI. Заполняется
  /// `ProfileRepository.loadMe` (и при логине). До первой загрузки = 'USD',
  /// что означает «не показывать конвертацию» (X→X = пустая строка).
  String _currentUserCurrency = 'USD';
  String get currentUserCurrency => _currentUserCurrency;
  set currentUserCurrency(String value) {
    _currentUserCurrency = value.toUpperCase();
  }

  /// Доступные коды валют (для UI селектора при необходимости).
  List<String> get availableCurrencies => _rates.keys.toList()..sort();

  /// Загрузить курсы с бэка. Идемпотентно: повторный вызов в течение TTL
  /// (1 час) не делает новый запрос. Безопасно вызывать на старте приложения
  /// и при логине.
  Future<void> load({bool force = false}) async {
    if (_loading) return;
    if (!force && _loadedAt != null) {
      final age = DateTime.now().difference(_loadedAt!);
      if (age < const Duration(hours: 1)) return; // ещё свежий кеш
    }
    _loading = true;
    try {
      final res = await ApiClient.instance.dio.get('/currency/rates');
      final data = (res.data as Map).cast<String, dynamic>();
      final ratesMap = (data['rates'] as Map).cast<String, dynamic>();
      _rates = ratesMap.map((k, v) => MapEntry(k, (v as num).toDouble()));
      _loadedAt = DateTime.now();
      debugPrint(
          '[CurrencyRepository] Loaded ${_rates.length} rates: $_rates');
    } on DioException catch (e) {
      debugPrint('[CurrencyRepository] Load failed: ${e.message}');
      // Не падаем — оставляем старый кеш или пустой Map. UI просто не покажет
      // конвертацию, что лучше чем падение приложения.
    } finally {
      _loading = false;
    }
  }

  /// Конвертировать сумму. Возвращает `null` если одна из валют неизвестна
  /// или ещё не загружены курсы — UI должен фолбэчить на показ оригинальной
  /// валюты без конвертации.
  double? convert({
    required double amount,
    required String from,
    required String to,
  }) {
    if (from == to) return amount;
    if (_rates.isEmpty) return null;
    final fromRate = _rates[from.toUpperCase()];
    final toRate = _rates[to.toUpperCase()];
    if (fromRate == null || toRate == null) return null;
    if (fromRate == 0) return null;
    // X → USD → Y
    final inUsd = amount / fromRate;
    return inUsd * toRate;
  }

  /// Удобный helper для UI: «$10 (~4900 ₸)». Возвращает строку или null
  /// если конвертация невозможна. `targetCurrency` — обычно валюта
  /// текущего юзера из `MyProfile.currency`.
  String? formatConverted({
    required String amount,
    required String fromCurrency,
    required String targetCurrency,
  }) {
    if (fromCurrency.toUpperCase() == targetCurrency.toUpperCase()) return null;
    final parsed = double.tryParse(amount);
    if (parsed == null) return null;
    final converted = convert(
      amount: parsed,
      from: fromCurrency,
      to: targetCurrency,
    );
    if (converted == null) return null;
    return '~${_formatAmount(converted)} ${_currencySymbol(targetCurrency)}';
  }

  String _formatAmount(double value) {
    // Округление: для маленьких сумм 2 знака, для крупных — без дробной части.
    if (value < 100) return value.toStringAsFixed(2);
    if (value < 10000) return value.toStringAsFixed(0);
    // Группировка тысяч пробелом для читаемости (1 234 567).
    final s = value.toStringAsFixed(0);
    final buf = StringBuffer();
    for (var i = 0; i < s.length; i++) {
      if (i > 0 && (s.length - i) % 3 == 0) buf.write(' ');
      buf.write(s[i]);
    }
    return buf.toString();
  }

  String _currencySymbol(String code) {
    switch (code.toUpperCase()) {
      case 'USD':
        return '\$';
      case 'EUR':
        return '€';
      case 'RUB':
        return '₽';
      case 'KZT':
        return '₸';
      case 'CNY':
        return '¥';
      case 'KGS':
        return 'с'; // сом
      case 'UZS':
        return 'сум';
      case 'BYN':
        return 'Br';
      case 'TJS':
        return 'смн';
      case 'AZN':
        return '₼';
      default:
        return code;
    }
  }
}
