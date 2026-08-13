import React, { useEffect, useRef } from 'react';
import { TouchableOpacity, Text, View, Animated, StyleSheet, Platform } from 'react-native';

// Кнопка с shimmer-эффектом и градиентом
export default function ShimmerButton({ onPress, children, style, textStyle, colors = ['#FF8400', '#EF4444'], disabled }) {
  const shimmer = useRef(new Animated.Value(-1)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(shimmer, { toValue: 1, duration: 2200, useNativeDriver: false })
    );
    loop.start();
    return () => loop.stop();
  }, []);

  const translateX = shimmer.interpolate({ inputRange: [-1, 1], outputRange: [-200, 400] });

  if (Platform.OS === 'web') {
    return (
      <TouchableOpacity
        onPress={onPress}
        disabled={disabled}
        style={[
          s.btnWeb,
          {
            backgroundImage: `linear-gradient(135deg, ${colors[0]}, ${colors[1]})`,
            boxShadow: `0 8px 24px ${colors[0]}44`,
            opacity: disabled ? 0.5 : 1,
          },
          style,
        ]}
      >
        <View style={s.shimmerWebWrap}>
          <View style={s.shimmerWebOverlay} />
        </View>
        <Text style={[s.text, textStyle]}>{children}</Text>
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity onPress={onPress} disabled={disabled} style={[s.btn, { backgroundColor: colors[0], opacity: disabled ? 0.5 : 1 }, style]}>
      <Animated.View style={[s.shimmer, { transform: [{ translateX }] }]} />
      <Text style={[s.text, textStyle]}>{children}</Text>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  btn: {
    paddingVertical: 16, paddingHorizontal: 24,
    borderRadius: 14, overflow: 'hidden',
    alignItems: 'center', justifyContent: 'center',
    position: 'relative',
  },
  btnWeb: {
    paddingVertical: 16, paddingHorizontal: 24,
    borderRadius: 14, overflow: 'hidden',
    alignItems: 'center', justifyContent: 'center',
    position: 'relative',
    border: 0, cursor: 'pointer',
  },
  text: { color: '#fff', fontSize: 16, fontWeight: '800', zIndex: 2 },
  shimmer: {
    position: 'absolute', top: 0, bottom: 0, width: 80,
    backgroundColor: 'rgba(255,255,255,0.3)',
    transform: [{ skewX: '-20deg' }],
  },
  shimmerWebWrap: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, overflow: 'hidden' },
  shimmerWebOverlay: Platform.OS === 'web' ? {
    position: 'absolute', top: 0, left: '-100%', height: '100%', width: '60%',
    background: 'linear-gradient(120deg, transparent 0%, rgba(255,255,255,0.5) 50%, transparent 100%)',
    animation: 'shimmer 2.5s infinite',
  } : {},
});

// CSS keyframes injection (web only)
if (Platform.OS === 'web' && typeof document !== 'undefined' && !document.getElementById('shimmer-style')) {
  const style = document.createElement('style');
  style.id = 'shimmer-style';
  style.textContent = `@keyframes shimmer { 0% { left: -100%; } 100% { left: 200%; } }`;
  document.head.appendChild(style);
}
