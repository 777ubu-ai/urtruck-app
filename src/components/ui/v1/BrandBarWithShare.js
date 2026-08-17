// BrandBarWithShare — compact child-screen navigation.
// Child/detail screens must not repeat the global UrTruck wordmark: it consumes
// valuable mobile height and competes with the actual route/deal title. Keep
// only the back action and an optional right-side action.

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { useV1Colors } from '../../../theme/designV1';

export default function BrandBarWithShare({ onBack, onShare, accent, rightTestID, rightIcon, rightSlot }) {
  const colors = useV1Colors();
  const arrowColor = accent || colors.driver;
  return (
    <View style={s.row} testID="compact-child-header">
      {onBack ? (
        <TouchableOpacity
          onPress={onBack}
          style={s.backHit}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityLabel="Back"
          testID="brand-back"
        >
          <Feather name="chevron-left" size={28} color={arrowColor} />
        </TouchableOpacity>
      ) : (
        <View style={s.backHit} />
      )}

      <View style={s.flex} />

      {rightSlot ? (
        rightSlot
      ) : onShare ? (
        <TouchableOpacity
          onPress={onShare}
          style={s.rightBtn}
          testID={rightTestID}
          accessibilityLabel="Share"
        >
          {rightIcon ? (
            <Text style={[s.rightIcon, { color: colors.text }]}>{rightIcon}</Text>
          ) : (
            <Feather name="share-2" size={18} color={colors.text} />
          )}
        </TouchableOpacity>
      ) : (
        <View style={s.rightBtn} />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  row: {
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 2,
  },
  backHit: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  flex: { flex: 1 },
  rightBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  rightIcon: { fontSize: 18 },
});
