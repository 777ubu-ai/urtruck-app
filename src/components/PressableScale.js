import React, { useRef } from 'react';
import { Animated, TouchableWithoutFeedback } from 'react-native';

// Кнопка с micro-interaction: при нажатии scale 0.97
export default function PressableScale({ children, onPress, style, scaleTo = 0.97, disabled, ...rest }) {
  const scale = useRef(new Animated.Value(1)).current;

  const onPressIn = () => {
    Animated.spring(scale, { toValue: scaleTo, useNativeDriver: true, friction: 8, tension: 120 }).start();
  };
  const onPressOut = () => {
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, friction: 6, tension: 80 }).start();
  };

  return (
    <TouchableWithoutFeedback onPress={onPress} onPressIn={onPressIn} onPressOut={onPressOut} disabled={disabled} {...rest}>
      <Animated.View style={[style, { transform: [{ scale }] }]}>
        {children}
      </Animated.View>
    </TouchableWithoutFeedback>
  );
}
