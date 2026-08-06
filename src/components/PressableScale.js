import React, { useRef } from 'react';
import { Animated, Pressable, StyleSheet } from 'react-native';

// Кнопка с micro-interaction: при нажатии scale 0.97
export default function PressableScale({ children, onPress, style, scaleTo = 0.97, disabled, accessibilityLabel, ...rest }) {
  const scale = useRef(new Animated.Value(1)).current;

  const onPressIn = () => {
    Animated.spring(scale, { toValue: scaleTo, useNativeDriver: true, friction: 8, tension: 120 }).start();
  };
  const onPressOut = () => {
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, friction: 6, tension: 80 }).start();
  };

  return (
    <Pressable
      onPress={onPress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: !!disabled }}
      hitSlop={4}
      style={styles.pressable}
      {...rest}
    >
      <Animated.View style={[style, disabled && styles.disabled, { transform: [{ scale }] }]}>
        {children}
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pressable: { maxWidth: '100%' },
  disabled: { opacity: 0.55 },
});
