// FadeInUp — появление карточек списка по промпт-дизайну: выезд снизу на
// 10px с затуханием, каскад через delay (index*50мс). Нативный драйвер,
// не блокирует скролл.
// PopIn — пружинное появление статуса/галочки (scale 0.5→1).
import React, { useEffect, useRef } from 'react';
import { Animated } from 'react-native';

export default function FadeInUp({ children, delay = 0, style }) {
  const opacity = useRef(new Animated.Value(0)).current;
  const ty = useRef(new Animated.Value(10)).current;
  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 220, delay, useNativeDriver: true }),
      Animated.timing(ty, { toValue: 0, duration: 220, delay, useNativeDriver: true }),
    ]).start();
  }, []);
  return (
    <Animated.View style={[style, { opacity, transform: [{ translateY: ty }] }]}>
      {children}
    </Animated.View>
  );
}

export function PopIn({ children, style }) {
  const scale = useRef(new Animated.Value(0.5)).current;
  useEffect(() => {
    Animated.spring(scale, { toValue: 1, friction: 5, tension: 140, useNativeDriver: true }).start();
  }, []);
  return (
    <Animated.View style={[style, { transform: [{ scale }] }]}>
      {children}
    </Animated.View>
  );
}
