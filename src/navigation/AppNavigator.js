import React from 'react';
import { View, Text, Animated } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useState, useEffect } from 'react';
import { useI18n } from '../utils/useI18n';
import { useTheme } from '../utils/ThemeContext';
import { useAuth } from '../utils/AuthContext';
import { getChats, subscribe, getUnreadNotifications } from '../utils/store';
import BottomNav from '../components/ui/v1/BottomNav';

import SplashScreen from '../screens/SplashScreen';
import OnboardingScreen from '../screens/OnboardingScreen';
import HowItWorksScreen from '../screens/HowItWorksScreen';
import AboutScreen from '../screens/AboutScreen';
import AuthScreen from '../screens/AuthScreen';
import RoleScreen from '../screens/RoleScreen';
// Stage 35: старый RegScreen и SignUpScreen больше не показываются
// пользователю в основном flow. Импорты сохранены только для qaPreview
// (?qa=design), где галерея макетов всё ещё на них ссылается.
import RegScreen from '../screens/RegScreen';
import SignUpScreen from '../screens/SignUpScreen';
import PremiumRegisterScreen from '../screens/registration/PremiumRegisterScreen';
import PremiumOtpScreen from '../screens/registration/PremiumOtpScreen';
import PremiumProfileScreen from '../screens/registration/PremiumProfileScreen';
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
import CreateTripScreen from '../screens/CreateTripScreen';
import CreateCargoScreen from '../screens/CreateCargoScreen';
import DesignPreviewScreen, { qaDesignMode } from '../screens/DesignPreviewScreen';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

// Placeholder for the central "+" tab. The custom BottomNav intercepts the
// press and navigates to CreateTrip / CreateCargo before this component ever
// mounts, but react-navigation requires every Tab.Screen to have a real
// component reference, so we keep this stub.
function PublishStub() {
  return <View style={{ flex: 1, backgroundColor: '#000' }} />;
}

function MainTabs({ route }) {
  const { session } = useAuth();
  const role = session?.user?.role || route?.params?.role || 'client';
  const [, setTick] = useState(0);

  useEffect(() => {
    const unsub = subscribe(() => setTick(n => n + 1));
    return unsub;
  }, []);

  // 5-tab layout (macros 07/08): Feed / MyWork / Publish (centre) / Chats / Profile.
  // BottomNav is the custom tab-bar; it reads role from AuthContext to swap
  // emerald (driver) and orange (cargo owner) accents at runtime.
  return (
    <Tab.Navigator
      screenOptions={{ headerShown: false }}
      tabBar={(props) => <BottomNav {...props} />}
    >
      <Tab.Screen name="Feed" component={FeedScreen} initialParams={{ role }} />
      <Tab.Screen name="MyWork" component={MyTripsScreen} initialParams={{ role }} />
      <Tab.Screen name="Publish" component={PublishStub} initialParams={{ role }} />
      <Tab.Screen name="Chats" component={ChatsListScreen} initialParams={{ role }} />
      <Tab.Screen name="Profile" component={ProfileScreen} initialParams={{ role }} />
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

  // QA Design Preview: ?qa=design in the URL routes straight into a
  // visual gallery before any auth/session check. Every other route is
  // still mounted so navigate() from the preview works without round-trips.
  // Detection is web-only and falls back to false on mobile / SSR.
  const qaPreview = qaDesignMode();
  if (qaPreview) {
    return (
      <Stack.Navigator initialRouteName="DesignPreview" screenOptions={{ headerShown: false }}>
        <Stack.Screen name="DesignPreview" component={DesignPreviewScreen} />
        <Stack.Screen name="Role" component={RoleScreen} />
        {/* Legacy SignUp/Reg остаются только в qaPreview, чтобы галерея макетов
            могла их открыть. В реальном flow ниже они не зарегистрированы. */}
        <Stack.Screen name="SignUp" component={SignUpScreen} />
        <Stack.Screen name="LegacyReg" component={RegScreen} />
        <Stack.Screen name="Auth" component={AuthScreen} />
        <Stack.Screen name="Reg" component={PremiumRegisterScreen} />
        <Stack.Screen name="RegOtp" component={PremiumOtpScreen} />
        <Stack.Screen name="RegProfile" component={PremiumProfileScreen} />
        <Stack.Screen name="Main" component={MainTabs} />
        <Stack.Screen name="CargoDetail" component={CargoDetail} />
        <Stack.Screen name="DriverDetail" component={DriverDetail} />
        <Stack.Screen name="Chat" component={ChatScreen} />
        <Stack.Screen name="ChatsList" component={ChatsListScreen} />
        <Stack.Screen name="MyTripsList" component={MyTripsScreen} />
        <Stack.Screen name="EditProfile" component={EditProfileScreen} />
        <Stack.Screen name="TripDetail" component={TripDetail} />
        <Stack.Screen name="EditTrip" component={EditTripScreen} />
        <Stack.Screen name="CreateTrip" component={CreateTripScreen} />
        <Stack.Screen name="CreateCargo" component={CreateCargoScreen} />
      </Stack.Navigator>
    );
  }

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {!hasToken || !session || !hasRole ? (
        // Нет токена / нет сессии / нет роли → выбор роли + premium-регистрация.
        // Stage 35: 'Reg' теперь PremiumRegisterScreen (телефон), 'RegOtp' и
        // 'RegProfile' — новые экраны. 'SignUp' (старый duplicate) больше не
        // подключён, чтобы пользователь не мог случайно попасть в legacy UI.
        <>
          <Stack.Screen name="Role" component={RoleScreen} />
          <Stack.Screen name="Auth" component={AuthScreen} />
          <Stack.Screen name="Reg" component={PremiumRegisterScreen} />
          <Stack.Screen name="RegOtp" component={PremiumOtpScreen} />
          <Stack.Screen name="RegProfile" component={PremiumProfileScreen} />
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
          <Stack.Screen name="CreateTrip" component={CreateTripScreen} />
          <Stack.Screen name="CreateCargo" component={CreateCargoScreen} />
          {/* Legacy routes — Track / Wallet were tabs in v0/v1.0 but the
              v1 design doesn't surface them in the bottom navigation.
              They stay reachable by navigation.navigate('Track' | 'Wallet')
              so any in-app deep link or future feature can still open them. */}
          <Stack.Screen name="Track" component={TrackScreen} />
          <Stack.Screen name="Wallet" component={WalletScreen} />
          <Stack.Screen name="HowItWorks" component={HowItWorksScreen} />
          <Stack.Screen name="About" component={AboutScreen} />
        </>
      )}
    </Stack.Navigator>
  );
}
