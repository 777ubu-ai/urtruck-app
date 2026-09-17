import React from 'react';
import { View, StyleSheet } from 'react-native';
import { DRIVER_CERAMIC } from '../../../theme/designV1';

// Decorative route traces only. It deliberately has no interaction or map
// state; product route/map behavior remains owned by the existing screens.
export default function DriverRouteBackdrop() {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <View style={[styles.line, styles.lineOne]} />
      <View style={[styles.line, styles.lineTwo]} />
      <View style={[styles.line, styles.lineThree]} />
      <View style={[styles.node, styles.nodeOne]} />
      <View style={[styles.node, styles.nodeTwo]} />
    </View>
  );
}

const styles = StyleSheet.create({
  line: {
    position: 'absolute',
    height: 1,
    backgroundColor: DRIVER_CERAMIC.routeLine,
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
    backgroundColor: DRIVER_CERAMIC.routeLine,
    opacity: 0.9,
  },
  nodeOne: { top: '21%', left: '23%' },
  nodeTwo: { top: '56%', right: '19%' },
});
