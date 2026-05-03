import React from 'react';
import { View, Text, Animated } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useState, useEffect } from 'react';
import { useI18n } from '../utils/useI18n';
import { useTheme } from '../utils/ThemeContext';
import { useAuth } from '../utils/AuthContext';
import { getChats, subscribe, getUnreadNotifications } from '../utils/store';

import SplashScreen from '../screens/SplashScreen';
import OnboardingScreen from '../screens/OnboardingScreen';
import HowItWorksScreen from '../screens/HowItWorksScreen';
import AboutScreen from '../screens/AboutScreen';
import AuthScreen from '../screens/AuthScreen';
import RoleScreen from '../screens/RoleScreen';
import RegScreen from '../screens/RegScreen';
import SignUpScreen from '../screens/SignUpScreen';
import FeedScreen from '../screens/FeedScreen';
import CargoDetail from '../screens/CargoDetail';
import DriverDetail from '../screens/DriverDetail';
import ChatScreen from '../screens/ChatScreen';
import TrackScreen from '../screens/TrackScreen';
import WalletScreen from '../screens/WalletScreen';
import ProfileScreen from '../screens/ProfileScreen';
import ReviewsScreen from '../screens/ReviewsScreen';
import ChatsListScreen from '../screens/ChatsListScreen';
import ArchiveScreen from '../screens/ArchiveScreen';
import MyTripsScreen from '../screens/MyTripsScreen';
import BlacklistScreen from '../screens/BlacklistScreen';
import EducationScreen from '../screens/EducationScreen';
import PushFilterScreen from '../screens/PushFilterScreen';
import QueueScreen from '../screens/QueueScreen';
import NotificationsScreen from '../screens/NotificationsScreen';
import StatsScreen from '../screens/StatsScreen';
import EditProfileScreen from '../screens/EditProfileScreen';
import SecurityScreen from '../screens/SecurityScreen';
import TripDetail from '../screens/TripDetail';
import EditTripScreen from '../screens/EditTripScreen';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

function MainTabs({ route }) {
  const { session } = useAuth();
  const role = session?.user?.role || route?.params?.role || 'client';
  const { t } = useI18n();
  const { theme } = useTheme();
  const [, setTick] = useState(0);

  useEffect(() => {
    const unsub = subscribe(() => setTick(n => n + 1));
    return unsub;
  }, []);

  // Badge disabled — mock store removed, server notifications not yet integrated into tabs

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: 'rgba(10,15,26,0.95)',
          borderTopWidth: 1,
          borderTopColor: 'rgba(255,255,255,0.08)',
          height: 80,
          paddingBottom: 20,
          paddingTop: 12,
        },
        tabBarActiveTintColor: '#22c55e',
        tabBarInactiveTintColor: '#475569',
        tabBarLabelStyle: { fontSize: 10, fontWeight: '600' },
      }}
    >
      <Tab.Screen name="Feed" component={FeedScreen} initialParams={{ role }}
        options={{
          tabBarLabel: role === 'driver' ? t('tab_feed') : t('tab_feed_client'),
          tabBarIcon: ({ color }) => <Text style={{ fontSize: 20, color }}>{role === 'driver' ? '📦' : '🚛'}</Text>,
        }}
      />
      <Tab.Screen name="MyTripsList" component={MyTripsScreen} initialParams={{ role }}
        options={{ tabBarLabel: t('tab_my_work'), tabBarIcon: ({ color }) => <Text style={{ fontSize: 20, color }}>📋</Text> }}
      />
      <Tab.Screen name="Profile" component={ProfileScreen} initialParams={{ role }}
        options={{ tabBarLabel: t('tab_profile'), tabBarIcon: ({ color }) => <Text style={{ fontSize: 20, color }}>👤</Text> }}
      />
    </Tab.Navigator>
  );
}

// Реактивная навигация на основе auth state
export default function AppNavigator() {
  const { session, hasToken, loading } = useAuth();
  const { theme } = useTheme();

  if (loading) {
    return <View style={{ flex: 1, backgroundColor: theme.bg }} />;
  }

  const hasRole = !!session?.user?.role;

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {!hasToken || !session || !hasRole ? (
        // Нет токена / нет сессии / нет роли → выбор роли
        <>
          <Stack.Screen name="Role" component={RoleScreen} />
          <Stack.Screen name="SignUp" component={SignUpScreen} />
          <Stack.Screen name="Auth" component={AuthScreen} />
          <Stack.Screen name="Reg" component={RegScreen} />
          <Stack.Screen name="Main" component={MainTabs} />
          <Stack.Screen name="CargoDetail" component={CargoDetail} />
          <Stack.Screen name="DriverDetail" component={DriverDetail} />
          <Stack.Screen name="Chat" component={ChatScreen} />
        </>
      ) : (
        // Полностью в приложении
        <>
          <Stack.Screen name="Main" component={MainTabs} />
          <Stack.Screen name="CargoDetail" component={CargoDetail} />
          <Stack.Screen name="DriverDetail" component={DriverDetail} />
          <Stack.Screen name="Chat" component={ChatScreen} />
          <Stack.Screen name="Reviews" component={ReviewsScreen} />
          <Stack.Screen name="ChatsList" component={ChatsListScreen} />
          <Stack.Screen name="Archive" component={ArchiveScreen} />
          <Stack.Screen name="MyTripsList" component={MyTripsScreen} />
          <Stack.Screen name="Blacklist" component={BlacklistScreen} />
          <Stack.Screen name="Education" component={EducationScreen} />
          <Stack.Screen name="PushFilter" component={PushFilterScreen} />
          <Stack.Screen name="Queue" component={QueueScreen} />
          <Stack.Screen name="Notifications" component={NotificationsScreen} />
          <Stack.Screen name="Stats" component={StatsScreen} />
          <Stack.Screen name="EditProfile" component={EditProfileScreen} />
          <Stack.Screen name="Security" component={SecurityScreen} />
          <Stack.Screen name="TripDetail" component={TripDetail} />
          <Stack.Screen name="EditTrip" component={EditTripScreen} />
          <Stack.Screen name="HowItWorks" component={HowItWorksScreen} />
          <Stack.Screen name="About" component={AboutScreen} />
        </>
      )}
    </Stack.Navigator>
  );
}
