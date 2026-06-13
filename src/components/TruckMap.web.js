// TruckMap (web) — react-native-maps на web не работает, поэтому здесь
// лёгкий фолбэк: координаты + эмодзи. Кнопка «Открыть в Картах» — в
// родительском TrackTruckScreen.
import React from 'react';
import { View, Text } from 'react-native';

export default function TruckMap({ lat, lng, title }) {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 }}>
      <Text style={{ fontSize: 44 }}>🚚</Text>
      <Text style={{ fontSize: 16, fontWeight: '800' }}>{title}</Text>
      <Text style={{ fontSize: 13, opacity: 0.7 }}>
        {Number(lat).toFixed(4)}, {Number(lng).toFixed(4)}
      </Text>
    </View>
  );
}
