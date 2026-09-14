import React, { useEffect, useRef, useState } from 'react';
import { Image, Platform, StatusBar as NativeStatusBar, StyleSheet, View } from 'react-native';
// Android 12+ всегда рисует native splash как иконку, поэтому большой poster
// нельзя передавать в системный SplashScreen API. После короткого native фона
// этот полноэкранный React Native слой становится единственным branded launch.
const isAndroid = Platform.OS === 'android';

export default function AndroidBrandedLaunchSplash({ children }) {
  const [visible, setVisible] = useState(isAndroid);
  const [imageReady, setImageReady] = useState(!isAndroid);
  const dismissTimerRef = useRef(null);

  useEffect(() => {
    if (!isAndroid) return undefined;

    NativeStatusBar.setHidden(visible, 'fade');
    return () => {
      NativeStatusBar.setHidden(false, 'fade');
    };
  }, [visible]);

  useEffect(() => () => {
    if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
  }, []);

  useEffect(() => {
    if (!isAndroid || !imageReady) return undefined;

    // Ждём decode именно нового poster. До него остаётся только короткий
    // тёмный native фон, а после — полноценный branded frame без старого
    // Expo artwork и без пустого промежуточного экрана.
    dismissTimerRef.current = setTimeout(() => setVisible(false), 850);
    return undefined;
  }, [imageReady]);

  if (!isAndroid) return children;

  return (
    <View style={styles.root}>
      {children}
      {visible && (
        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          pointerEvents="none"
          style={styles.overlay}
          testID="android-branded-launch-splash"
        >
          <Image
            onError={() => setImageReady(true)}
            onLoadEnd={() => setImageReady(true)}
            resizeMode="cover"
            source={require('../../assets/splash/urtruck-splash-fullscreen.png')}
            style={styles.image}
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#070B14',
    elevation: 1000,
    zIndex: 1000,
  },
  image: StyleSheet.absoluteFillObject,
});
