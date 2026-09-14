// «экономия $380» — маленький зелёный бейдж рядом с ценой. Работает как
// социальное доказательство скидки (паттерн Yandex Go / inDrive). Показываем
// ТОЛЬКО когда предложение ниже прайса листинга: экономия должна быть
// положительной. При равной или большей цене — не рендерим ничего
// (не «удорожание» и не «-$0»).

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useI18n } from '../../utils/useI18n';
import { formatPrice } from '../../utils/normalizers';

const SUCCESS_GREEN = '#168759';
const SUCCESS_BG = 'rgba(34, 197, 94, 0.14)';

export default function PriceSavingsBadge({ listingPrice, bidPrice, currency = 'USD' }) {
  const { t } = useI18n();
  if (listingPrice == null || bidPrice == null) return null;
  const savings = Number(listingPrice) - Number(bidPrice);
  if (!(savings > 0)) return null;
  // §15 i18n P2 fix: was a hardcoded Russian "экономия" label plus a
  // Russian-locale-specific number-grouping call, shown as-is to ZH/KK/EN
  // users. `price_savings_badge` is localized in all 4 locales; amount
  // formatting reuses the same formatPrice() every other price in the app
  // goes through (locale-neutral space grouping, not Russian-locale-specific).
  const amount = formatPrice(savings, currency, t);
  return (
    <View style={s.badge}>
      <Text style={s.text}>{t('price_savings_badge').replace('{amount}', amount)}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: SUCCESS_BG,
    marginTop: 4,
  },
  text: { color: SUCCESS_GREEN, fontSize: 11, fontWeight: '800', letterSpacing: 0.2 },
});
