import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated } from 'react-native';
import { useTheme } from '../utils/ThemeContext';

export default function Skeleton({ width = '100%', height = 16, borderRadius = 8, style }) {
  const { theme } = useTheme();
  const opacity = useRef(new Animated.Value(0.5)).current;

  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(opacity, { toValue: 1, duration: 800, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 0.5, duration: 800, useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, []);

  return <Animated.View style={[{ width, height, borderRadius, backgroundColor: theme.border, opacity }, style]} />;
}

export const SkeletonCard = () => {
  const { theme } = useTheme();
  return (
    <View style={[s.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
      <View style={s.row}>
        <Skeleton width={48} height={48} borderRadius={24} />
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Skeleton width="60%" height={14} />
          <View style={{ height: 6 }} />
          <Skeleton width="40%" height={11} />
          <View style={{ height: 8 }} />
          <View style={{ flexDirection: 'row', gap: 6 }}>
            <Skeleton width={50} height={18} borderRadius={9} />
            <Skeleton width={70} height={18} borderRadius={9} />
          </View>
        </View>
        <Skeleton width={50} height={20} borderRadius={4} />
      </View>
    </View>
  );
};

const s = StyleSheet.create({
  card: { borderRadius: 16, padding: 16, borderWidth: 1, marginBottom: 10 },
  row: { flexDirection: 'row', alignItems: 'center' },
});
