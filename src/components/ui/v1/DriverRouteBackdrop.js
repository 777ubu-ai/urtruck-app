import React from 'react';
import { View, StyleSheet } from 'react-native';
import { useDriverCeramicColors } from '../../../theme/designV1';

// Decorative route traces only. It deliberately has no interaction or map
// state; product route/map behavior remains owned by the existing screens.
export default function DriverRouteBackdrop() {
  const colors = useDriverCeramicColors();
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <View style={[styles.line, styles.lineOne, { backgroundColor: colors.routeLine }]} />
      <View style={[styles.line, styles.lineTwo, { backgroundColor: colors.routeLine }]} />
      <View style={[styles.line, styles.lineThree, { backgroundColor: colors.routeLine }]} />
      <View style={[styles.node, styles.nodeOne, { backgroundColor: colors.routeLine }]} />
      <View style={[styles.node, styles.nodeTwo, { backgroundColor: colors.routeLine }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  line: {
    position: 'absolute',
    height: 1,
    opacity: 0.68,
  },
  lineOne: { width: '118%', top: '22%', left: '-8%', transform: [{ rotate: '-13deg' }] },
  lineTwo: { width: '115%', top: '57%', left: '-5%', transform: [{ rotate: '9deg' }] },
  lineThree: { width: '105%', top: '82%', left: '3%', transform: [{ rotate: '-6deg' }] },
  node: {
    position: 'absolute',
    width: 6,
    height: 6,
    borderRadius: 3,
    opacity: 0.9,
  },
  nodeOne: { top: '21%', left: '23%' },
  nodeTwo: { top: '56%', right: '19%' },
});
