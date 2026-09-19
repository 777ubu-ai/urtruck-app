import React, { useEffect, useState } from 'react';
import { Image, NativeModules, Platform, StatusBar as NativeStatusBar, StyleSheet, View } from 'react-native';
// Android 12+ всегда рисует native splash как иконку, поэтому большой poster
// нельзя передавать в системный SplashScreen API. После короткого native фона
// этот полноэкранный React Native слой становится единственным branded launch.
const isAndroid = Platform.OS === 'android';
const { UrTruckSystemBars } = NativeModules;

export default function AndroidBrandedLaunchSplash({ children }) {
  const [visible, setVisible] = useState(isAndroid);

  useEffect(() => {
    if (!isAndroid) return undefined;

    NativeStatusBar.setHidden(visible, 'none');
    UrTruckSystemBars?.setLaunchMode(visible);
    return () => {
      NativeStatusBar.setHidden(false, 'none');
      UrTruckSystemBars?.setLaunchMode(false);
    };
  }, [visible]);

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
            onError={() => setVisible(false)}
            onLoadEnd={() => requestAnimationFrame(() => setVisible(false))}
            resizeMode="contain"
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
