import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Animated, Easing, Dimensions, Platform } from 'react-native';

// Премиум-минималистичный сплеш: матовый антрацит #121212, белый
// геометричный текст «UrTruck», изумрудный неон-пульс (#00E676)
// пробегает по буквам слева направо, тонкий прогресс-бар снизу,
// плавный fade-out перед навигацией. Без SVG/gradient-зависимостей,
// чтобы оставаться лёгким и одинаково работать на iOS/Android/web.

const BG = '#121212';
const TEXT = '#FFFFFF';
const NEON = '#00E676';

const LOGO_FONT_SIZE = 44;
// Эмпирическая ширина «UrTruck» при выбранном кегле/letterSpacing.
// Используется только для расчёта длины пробега неон-полосы.
const LOGO_WIDTH_APPROX = 220;

export default function SplashScreen({ navigation }) {
  const containerOpacity = useRef(new Animated.Value(1)).current;
  const sweepX = useRef(new Animated.Value(-60)).current;
  const progress = useRef(new Animated.Value(0)).current;
  const [logoWidth, setLogoWidth] = useState(LOGO_WIDTH_APPROX);
  const screenWidth = Dimensions.get('window').width;

  useEffect(() => {
    // Неон-пульс по буквам — бесконечный цикл, легко прерывается на размонтировании.
    const sweep = Animated.loop(
      Animated.sequence([
        Animated.timing(sweepX, {
          toValue: logoWidth + 60,
          duration: 1600,
          easing: Easing.inOut(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.delay(250),
        Animated.timing(sweepX, { toValue: -60, duration: 0, useNativeDriver: true }),
      ]),
    );
    sweep.start();

    // Прогресс-бар: один проход за 2.2с от 0 до 1.
    Animated.timing(progress, {
      toValue: 1,
      duration: 2200,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();

    // Через 2.5с — fade-out 280мс и переход. Любой ранний unmount гасит loop.
    const timer = setTimeout(() => {
      Animated.timing(containerOpacity, {
        toValue: 0,
        duration: 280,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }).start(() => navigation.replace('OnboardingV2'));
    }, 2500);

    return () => {
      sweep.stop();
      clearTimeout(timer);
    };
  }, [logoWidth]);

  const progressWidth = progress.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  return (
    <Animated.View style={[s.container, { opacity: containerOpacity }]}>
      <View style={s.center}>
        <View
          style={[s.logoMask, { width: logoWidth || LOGO_WIDTH_APPROX }]}
          onLayout={(e) => {
            const w = e.nativeEvent.layout.width;
            if (w && Math.abs(w - logoWidth) > 1) setLogoWidth(w);
          }}
        >
          <Text
            style={s.logoText}
            onLayout={(e) => {
              const w = e.nativeEvent.layout.width;
              if (w && Math.abs(w - logoWidth) > 1) setLogoWidth(w);
            }}
          >
            UrTruck
          </Text>
          {/* Неон-полоса: тонкий вертикальный «лазерный» сегмент со свечением,
              скользит по тексту, формируя пульс. overflow:hidden родителя
              обрезает её строго по ширине логотипа. */}
          <Animated.View
            pointerEvents="none"
            style={[
              s.sweep,
              {
                transform: [{ translateX: sweepX }],
              },
            ]}
          />
        </View>
      </View>

      <View style={[s.progressWrap, { width: Math.min(screenWidth * 0.5, 220) }]}>
        <View style={s.progressTrack} />
        <Animated.View style={[s.progressFill, { width: progressWidth }]} />
      </View>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BG,
    alignItems: 'center',
    justifyContent: 'center',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoMask: {
    height: LOGO_FONT_SIZE + 8,
    overflow: 'hidden',
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  logoText: {
    color: TEXT,
    fontSize: LOGO_FONT_SIZE,
    fontWeight: '800',
    letterSpacing: 2,
    // Слегка поднимаем оптическую плотность за счёт системного моноширинного-like
    // веса; кастомные шрифты не подключаем, чтобы не тянуть ассеты.
    ...Platform.select({
      ios: { fontFamily: 'Helvetica Neue' },
      android: { fontFamily: 'sans-serif-medium' },
      default: {},
    }),
  },
  sweep: {
    position: 'absolute',
    top: -8,
    bottom: -8,
    left: 0,
    width: 14,
    backgroundColor: NEON,
    opacity: 0.85,
    borderRadius: 6,
    // Свечение реализуется shadow (iOS) + elevation (Android).
    // На web shadow* не работает на View, но контраст 14px полосы по тексту
    // даёт читаемый «лазер» даже без свечения.
    shadowColor: NEON,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 18,
    elevation: 10,
  },
  progressWrap: {
    position: 'absolute',
    bottom: '18%',
    height: 2,
    borderRadius: 1,
    overflow: 'hidden',
  },
  progressTrack: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 1,
  },
  progressFill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: NEON,
    borderRadius: 1,
    shadowColor: NEON,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.7,
    shadowRadius: 6,
  },
});
