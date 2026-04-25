import React, { useEffect, useRef } from 'react';
import { StatusBar } from 'expo-status-bar';
import { Platform } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider } from './src/utils/ThemeContext';
import { AuthProvider } from './src/utils/AuthContext';
import { ToastProvider } from './src/components/Toast';
import OfflineBanner from './src/components/OfflineBanner';
// VerificationStatusBanner removed — after OTP users get full access
// import VerificationStatusBanner from './src/components/VerificationStatusBanner';
import ErrorBoundary from './src/components/ErrorBoundary';
import UpdateBanner from './src/components/UpdateBanner';
import AppNavigator from './src/navigation/AppNavigator';

export default function App() {
  const navRef = useRef();

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof navigator === 'undefined') return;
    const handler = (event) => {
      if (event.data?.type === 'notification' && event.data.url) {
        const url = event.data.url;
        try {
          if (url.startsWith('/') && navRef.current) {
            const screen = url.replace('/', '').split('?')[0] || 'Main';
            navRef.current.navigate(screen);
          }
        } catch {}
      }
    };
    navigator.serviceWorker?.addEventListener('message', handler);
    return () => navigator.serviceWorker?.removeEventListener('message', handler);
  }, []);

  return (
    <ErrorBoundary>
    <ThemeProvider>
      <AuthProvider>
        <SafeAreaProvider>
          <ToastProvider>
            <OfflineBanner />
            <UpdateBanner />
            <NavigationContainer ref={navRef}>
              <StatusBar style="light" />
              <AppNavigator />
            </NavigationContainer>
          </ToastProvider>
        </SafeAreaProvider>
      </AuthProvider>
    </ThemeProvider>
    </ErrorBoundary>
  );
}
