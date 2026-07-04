import 'package:flutter/material.dart';
import 'currency_repository.dart';

/// Виджет «приписки» к цене с конвертацией в валюту юзера.
/// Если конвертация невозможна (валюта совпадает, курсы не загружены,
/// сумма не парсится) — возвращает пустой `SizedBox.shrink()` чтобы
/// не ломать layout родителя.
///
/// Пример:
/// ```dart
/// Row(children: [
///   Text('${post.priceAmount} ${post.priceCurrency}'), // "10 USD"
///   ConvertedPriceText(amount: post.priceAmount, fromCurrency: post.priceCurrency),
/// ])
/// ```
/// Результат для юзера с currency=KZT: `10 USD ~4900 ₸`
class ConvertedPriceText extends StatelessWidget {
  const ConvertedPriceText({
    super.key,
    required this.amount,
    required this.fromCurrency,
    this.style,
    this.prefix = ' ',
  });

  final String amount;
  final String fromCurrency;
  final TextStyle? style;
  final String prefix;

  @override
  Widget build(BuildContext context) {
    final repo = CurrencyRepository.instance;
    final converted = repo.formatConverted(
      amount: amount,
      fromCurrency: fromCurrency,
      targetCurrency: repo.currentUserCurrency,
    );
    if (converted == null) return const SizedBox.shrink();
    final defaultStyle =
        Theme.of(context).textTheme.bodySmall?.copyWith(
              color: Theme.of(context).colorScheme.onSurfaceVariant,
            );
    return Text(
      '$prefix$converted',
      style: style ?? defaultStyle,
    );
  }
}
