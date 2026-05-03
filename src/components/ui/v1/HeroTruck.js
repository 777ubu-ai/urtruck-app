// HeroTruck — branded illustration block. Re-uses `assets/hero.jpg` since
// the project doesn't ship a separate neon-CGI render yet. Kept lightweight
// so it doesn't dominate dense screens (registration, OTP).

import React from 'react';
import { View, Image, StyleSheet } from 'react-native';

const HERO = require('../../../../assets/hero.jpg');

export default function HeroTruck({ size = 'md' }) {
  const dims = size === 'lg' ? { height: 200 } : size === 'sm' ? { height: 110 } : { height: 150 };
  return (
    <View style={[s.wrap, dims]}>
      <Image source={HERO} style={s.img} resizeMode="cover" />
      <View style={s.overlay} />
    </View>
  );
}

const s = StyleSheet.create({
  wrap: {
    width: '100%',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 8,
  },
  img: {
    width: '100%',
    height: '100%',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
});
