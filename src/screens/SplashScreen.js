import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { v1Colors } from '../theme/designV1';

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
  container: { flex: 1, backgroundColor: v1Colors.bg, alignItems: 'center', justifyContent: 'center' },
  truck: { fontSize: 60, marginBottom: 20 },
  titleWrap: { alignItems: 'center' },
  title: { color: v1Colors.text, fontSize: 36, fontWeight: '900', letterSpacing: -1 },
  subtitle: { color: v1Colors.driver, fontSize: 14, marginTop: 6, fontWeight: '700', letterSpacing: 1 },
});
