import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';

export default function SplashScreen({ navigation }) {
  const truckX = useRef(new Animated.Value(300)).current;
  const titleOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(truckX, { toValue: 0, duration: 1500, useNativeDriver: true }).start();
    Animated.timing(titleOpacity, { toValue: 1, duration: 800, delay: 1200, useNativeDriver: true }).start();
    // Через 2.5 сек — переходим на онбординг (гостю — сразу в Main через AuthProvider)
    const timer = setTimeout(() => navigation.replace('Onboarding'), 2500);
    return () => clearTimeout(timer);
  }, []);

  return (
    <View style={s.container}>
      <Animated.Text style={[s.truck, { transform: [{ translateX: truckX }] }]}>🚛</Animated.Text>
      <Animated.View style={[s.titleWrap, { opacity: titleOpacity }]}>
        <Text style={s.title}>UrTruck</Text>
        <Text style={s.subtitle}>FTL Market</Text>
      </Animated.View>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0f1a', alignItems: 'center', justifyContent: 'center' },
  truck: { fontSize: 60, marginBottom: 20 },
  titleWrap: { alignItems: 'center' },
  title: { color: '#FAFAF9', fontSize: 36, fontWeight: '900', letterSpacing: -1 },
  subtitle: { color: '#78716C', fontSize: 14, marginTop: 6 },
});
