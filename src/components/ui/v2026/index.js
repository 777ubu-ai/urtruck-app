// Design System 2026 — Skeleton (§40) and barrel exports.
import React from 'react';
import { View, Animated, StyleSheet } from 'react-native';
import { useTokens, radius2026, space2026 } from '../../../theme/tokens2026';

/** Skeleton > spinner whenever screen structure is known (§40).
 *  No infinite shimmer without a state: parent must swap to an explorable
 *  empty/error state when loading stalls. */
export function Skeleton2026({ width = '100%', height = 16, radius = radius2026.sm, circle = false, style }) {
  const t = useTokens();
  const pulse = React.useRef(new Animated.Value(0.55)).current;

  React.useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.55, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  return (
    <Animated.View style={[{
      width, height,
      borderRadius: circle ? height / 2 : radius,
      backgroundColor: t['surface.muted'],
      opacity: pulse,
    }, style]} />
  );
}

export function SkeletonCard2026() {
  return (
    <View style={s.skeletonCard}>
      <Skeleton2026 width="40%" height={18} />
      <Skeleton2026 width="80%" height={14} style={s.skeletonGapMd} />
      <Skeleton2026 width="65%" height={14} style={s.skeletonGapSm} />
      <Skeleton2026 width="30%" height={20} style={s.skeletonGapMd} />
    </View>
  );
}

export { default as Text2026 } from './Text';
export { default as Button2026 } from './Button';
export { default as IconButton2026 } from './IconButton';
export { default as BottomNav2026 } from './BottomNav';
export { default as Card2026 } from './Card';
export { Badge2026, Chip2026 } from './BadgeChip';
export { Avatar2026, Input2026 } from './AvatarInput';
export { Header2026, Tabs2026 } from './HeaderTabs';
export { BottomSheet2026, Modal2026, Toast2026 } from './Overlays';

const s = StyleSheet.create({
  skeletonCard: { borderRadius: radius2026.card, padding: space2026[4] },
  skeletonGapMd: { marginTop: space2026[3] },
  skeletonGapSm: { marginTop: space2026[2] },
});
