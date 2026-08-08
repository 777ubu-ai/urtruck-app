// «экономия $380» — маленький зелёный бейдж рядом с ценой. Работает как
// социальное доказательство скидки (паттерн Yandex Go / inDrive). Показываем
// ТОЛЬКО когда предложение ниже прайса листинга: экономия должна быть
// положительной. При равной или большей цене — не рендерим ничего
// (не «удорожание» и не «-$0»).

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

const SUCCESS_GREEN = '#168A5B';
const SUCCESS_BG = 'rgba(34, 197, 94, 0.14)';

export default function PriceSavingsBadge({ listingPrice, bidPrice, currency = 'USD' }) {
  if (listingPrice == null || bidPrice == null) return null;
  const savings = Number(listingPrice) - Number(bidPrice);
  if (!(savings > 0)) return null;
  const cur = currency === 'USD' ? '$' : currency === 'EUR' ? '€' : (currency + ' ');
  return (
    <View style={s.badge}>
      <Text style={s.text}>↓ экономия {cur}{savings.toLocaleString('ru-RU')}</Text>
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
