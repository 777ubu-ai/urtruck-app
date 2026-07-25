import React from 'react';
import { View, Text, Animated } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useState, useEffect } from 'react';
import { useI18n } from '../utils/useI18n';
import { useTheme } from '../utils/ThemeContext';
import { useAuth } from '../utils/AuthContext';
import { getChats, subscribe, getUnreadNotifications } from '../utils/store';
import { marketAPI } from '../utils/marketAPI';
import useDealLocationBroadcast from '../hooks/useDealLocationBroadcast';
import BottomNav from '../components/ui/v1/BottomNav';

import HowItWorksScreen from '../screens/HowItWorksScreen';
import AboutScreen from '../screens/AboutScreen';
import RoleScreen from '../screens/RoleScreen';
import PremiumRegisterScreen from '../screens/registration/PremiumRegisterScreen';
import PremiumOtpScreen from '../screens/registration/PremiumOtpScreen';
import PremiumProfileScreen from '../screens/registration/PremiumProfileScreen';
import TruckParamsScreen from '../screens/registration/TruckParamsScreen';
import VehicleDocsScreen from '../screens/registration/VehicleDocsScreen';
import IdentityStepScreen from '../screens/registration/IdentityStepScreen';
import CitizenshipScreen from '../screens/registration/CitizenshipScreen';
import PremiumLoginScreen from '../screens/registration/PremiumLoginScreen';
import FeedScreen from '../screens/FeedScreen';
import CargoDetail from '../screens/CargoDetail';
import TrackTruckScreen from '../screens/TrackTruckScreen';
import DriverDetail from '../screens/DriverDetail';
import ChatScreen from '../screens/ChatScreen';
import WalletScreen from '../screens/WalletScreen';
import ProfileScreen from '../screens/ProfileScreen';
import ReviewsScreen from '../screens/ReviewsScreen';
import FavoritesScreen from '../screens/FavoritesScreen';
import ChatsListScreen from '../screens/ChatsListScreen';
import ArchiveScreen from '../screens/ArchiveScreen';
import MyTripsScreen from '../screens/MyTripsScreen';
import BlacklistScreen from '../screens/BlacklistScreen';
import EducationScreen from '../screens/EducationScreen';
import PushFilterScreen from '../screens/PushFilterScreen';
import QueueScreen from '../screens/QueueScreen';
import TrackedPlatesScreen from '../screens/TrackedPlatesScreen';
import NotificationsScreen from '../screens/NotificationsScreen';
import StatsScreen from '../screens/StatsScreen';
import EditProfileScreen from '../screens/EditProfileScreen';
import CargoRuqsatInfoScreen from '../screens/CargoRuqsatInfoScreen';
import SecurityScreen from '../screens/SecurityScreen';
import TripDetail from '../screens/TripDetail';
import EditTripScreen from '../screens/EditTripScreen';
import CreateTripScreen from '../screens/CreateTripScreen';
import CreateCargoScreen from '../screens/CreateCargoScreen';
import DesignPreviewScreen, { qaDesignMode } from '../screens/DesignPreviewScreen';
// RC2 onboarding v2 — light-style flow:
//   OnboardingV2 → PhoneV2 → OtpV2 → (если новый/без role) RoleV2 →
//   ProfileV2 → Main. (Если existing user + role — после OtpV2 сразу Main.)
//   CountryPicker — модал-bottom-sheet для выбора страны на PhoneV2.
import OnboardingV2Screen from '../screens/onboarding/OnboardingV2Screen';
import PhoneV2Screen from '../screens/onboarding/PhoneV2Screen';
import CountryPickerSheet from '../screens/onboarding/CountryPickerSheet';
import OtpV2Screen from '../screens/onboarding/OtpV2Screen';
import RoleScreenV2 from '../screens/onboarding/RoleScreenV2';
import ProfileV2Screen from '../screens/onboarding/ProfileV2Screen';

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
  const { theme } = useTheme();
  const role = session?.user?.role || route?.params?.role || 'client';
  const isDriver = role === 'driver';
  const [, setTick] = useState(0);

  useEffect(() => {
    const unsub = subscribe(() => setTick(n => n + 1));
    return unsub;
  }, []);

  // Авто-трансляция геопозиции водителя по активным сделкам — на уровне
  // всего приложения (любой экран, пока приложение открыто), а не только
  // «Мои рейсы». Водитель ничего не нажимает: как только сделка «в работе»,
  // его позиция уходит на сервер (после разового разрешения на локацию).
  // Клиент видит машину на «Где машина».
  const [inWorkDealIds, setInWorkDealIds] = useState([]);
  useEffect(() => {
    if (!isDriver) { setInWorkDealIds([]); return; }
    let alive = true;
    const IN_WORK = ['accepted', 'in_progress', 'picked_up', 'at_border'];
    const fetchIds = async () => {
      try {
        const d = await marketAPI.myDashboard();
        const ids = (d?.my_deals || [])
          .filter((x) => IN_WORK.includes(x.status))
          .map((x) => x.id)
          .filter(Boolean);
        if (alive) setInWorkDealIds(ids);
      } catch { /* тихо */ }
    };
    fetchIds();
    const iv = setInterval(fetchIds, 60000);
    return () => { alive = false; clearInterval(iv); };
  }, [isDriver]);
  useDealLocationBroadcast(inWorkDealIds);

  // Канон таб-баров (мастер-ТЗ §2.2–2.3).
  //   Водитель (5): Грузы (Feed) · Рейсы (MyWork) · Очередь (Queue, центр) ·
  //     Чат (Chats, с бейджем непрочитанного) · Профиль. Кнопка «Разместить»
  //     живёт ВНУТРИ «Рейсы», а не отдельной вкладкой (§2.2.2). Чат всегда
  //     на панели — критичный инструмент биржи (§2.4).
  //   Клиент (5, приказ 2026-06-13): Грузы (MyWork) · Машины (Feed) ·
  //     «+» Создать (Publish, центр) · Чат (Chats, с бейджем) · Профиль.
  //     Чат добавлен — без переписки нет доверия грузоотправителя к бирже.
  // BottomNav красит неон по роли: driver #00E676, client #FF8400.
  return (
    <Tab.Navigator
      screenOptions={{ headerShown: false }}
      // Без sceneContainerStyle React Navigation красит фон сцены белым
      // (DefaultTheme), и в тёмной теме он просвечивал снизу через
      // прозрачную обёртку плавающего таб-бара → «белая полоса внизу».
      // Привязываем фон сцены к теме.
      sceneContainerStyle={{ backgroundColor: theme.bg }}
      tabBar={(props) => <BottomNav {...props} />}
    >
      {isDriver ? (
        <>
          <Tab.Screen name="Feed" component={FeedScreen} initialParams={{ role }} />
          <Tab.Screen name="MyWork" component={MyTripsScreen} initialParams={{ role }} />
          <Tab.Screen name="Queue" component={QueueScreen} initialParams={{ role }} />
          <Tab.Screen name="Chats" component={ChatsListScreen} initialParams={{ role }} />
          {/* «Дела» — единый инбокс всей активности (ставки, статусы сделок,
              уведомления). Заменил вкладку Profile: профиль переехал наверх
              под ☰ (top-right), а живая работа спустилась в таб-бар. */}
          <Tab.Screen name="Deals" component={NotificationsScreen} initialParams={{ role }} />
        </>
      ) : (
        <>
          <Tab.Screen name="MyWork" component={MyTripsScreen} initialParams={{ role }} />
          <Tab.Screen name="Feed" component={FeedScreen} initialParams={{ role }} />
          <Tab.Screen name="Publish" component={PublishStub} initialParams={{ role }} />
          <Tab.Screen name="Chats" component={ChatsListScreen} initialParams={{ role }} />
          <Tab.Screen name="Deals" component={NotificationsScreen} initialParams={{ role }} />
        </>
      )}
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
        {/* RC2 onboarding v2 (inDrive-style) — превью в qaPreview */}
        <Stack.Screen name="OnboardingV2" component={OnboardingV2Screen} />
        <Stack.Screen name="PhoneV2" component={PhoneV2Screen} />
        <Stack.Screen
          name="CountryPicker"
          component={CountryPickerSheet}
          options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
        />
        <Stack.Screen name="OtpV2" component={OtpV2Screen} />
        <Stack.Screen name="RoleV2" component={RoleScreenV2} />
        <Stack.Screen name="ProfileV2" component={ProfileV2Screen} />
        {/* Legacy экраны — оставлены только для qaPreview-галереи. */}
        {/* Premium flow */}
        <Stack.Screen name="Auth" component={PremiumLoginScreen} />
        <Stack.Screen name="Login" component={PremiumLoginScreen} />
        <Stack.Screen name="Reg" component={PremiumRegisterScreen} />
        <Stack.Screen name="RegOtp" component={PremiumOtpScreen} />
        <Stack.Screen name="RegProfile" component={PremiumProfileScreen} />
        <Stack.Screen name="Main" component={MainTabs} />
        <Stack.Screen name="Profile" component={ProfileScreen} />
        <Stack.Screen name="CargoDetail" component={CargoDetail} />
        <Stack.Screen name="DriverDetail" component={DriverDetail} />
        <Stack.Screen name="Chat" component={ChatScreen} />
        <Stack.Screen name="ChatsList" component={ChatsListScreen} />
        <Stack.Screen name="MyTripsList" component={MyTripsScreen} />
        <Stack.Screen name="EditProfile" component={EditProfileScreen} />
        <Stack.Screen name="CargoRuqsatInfo" component={CargoRuqsatInfoScreen} />
        <Stack.Screen name="TripDetail" component={TripDetail} />
        <Stack.Screen name="EditTrip" component={EditTripScreen} />
        <Stack.Screen name="CreateTrip" component={CreateTripScreen} />
        <Stack.Screen name="CreateCargo" component={CreateCargoScreen} />
        <Stack.Screen name="TrackTruck" component={TrackTruckScreen} />
        <Stack.Screen name="TruckParams" component={TruckParamsScreen} />
        <Stack.Screen name="VehicleDocs" component={VehicleDocsScreen} />
      </Stack.Navigator>
    );
  }

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {!hasToken || !session || !hasRole ? (
        // Нет токена / нет сессии / нет роли → inDrive-style onboarding.
        // RC2 batch 1: первый экран = OnboardingV2 (3-слайдовая карусель +
        // CTA "Продолжить по номеру"). Старый RoleScreen остаётся в стеке
        // как fallback для legacy deeplink и переключения роли изнутри.
        <>
          <Stack.Screen name="OnboardingV2" component={OnboardingV2Screen} />
          <Stack.Screen name="PhoneV2" component={PhoneV2Screen} />
          <Stack.Screen
            name="CountryPicker"
            component={CountryPickerSheet}
            options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
          />
          <Stack.Screen name="OtpV2" component={OtpV2Screen} />
          <Stack.Screen name="RoleV2" component={RoleScreenV2} />
          <Stack.Screen name="ProfileV2" component={ProfileV2Screen} />
          <Stack.Screen name="Role" component={RoleScreen} />
          <Stack.Screen name="Auth" component={PremiumLoginScreen} />
          <Stack.Screen name="Login" component={PremiumLoginScreen} />
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
          {/* Профиль теперь открывается из ☰ (top-right) как отдельный экран
              стека, а не как вкладка таб-бара (её занял «Дела»). */}
          <Stack.Screen name="Profile" component={ProfileScreen} />
          <Stack.Screen name="CargoDetail" component={CargoDetail} />
          <Stack.Screen name="DriverDetail" component={DriverDetail} />
          <Stack.Screen name="Chat" component={ChatScreen} />
          <Stack.Screen name="Reviews" component={ReviewsScreen} />
          <Stack.Screen name="Favorites" component={FavoritesScreen} />
          <Stack.Screen name="ChatsList" component={ChatsListScreen} />
          <Stack.Screen name="Archive" component={ArchiveScreen} />
          <Stack.Screen name="MyTripsList" component={MyTripsScreen} />
          <Stack.Screen name="Blacklist" component={BlacklistScreen} />
          <Stack.Screen name="Education" component={EducationScreen} />
          <Stack.Screen name="PushFilter" component={PushFilterScreen} />
          <Stack.Screen name="Queue" component={QueueScreen} />
          <Stack.Screen name="TrackedPlates" component={TrackedPlatesScreen} />
          <Stack.Screen name="Notifications" component={NotificationsScreen} />
          <Stack.Screen name="Stats" component={StatsScreen} />
          <Stack.Screen name="EditProfile" component={EditProfileScreen} />
          <Stack.Screen name="CargoRuqsatInfo" component={CargoRuqsatInfoScreen} />
          <Stack.Screen name="Security" component={SecurityScreen} />
          <Stack.Screen name="TripDetail" component={TripDetail} />
          <Stack.Screen name="EditTrip" component={EditTripScreen} />
          <Stack.Screen name="CreateTrip" component={CreateTripScreen} />
          <Stack.Screen name="CreateCargo" component={CreateCargoScreen} />
          <Stack.Screen name="TrackTruck" component={TrackTruckScreen} />
        <Stack.Screen name="Citizenship" component={CitizenshipScreen} />
        <Stack.Screen name="Identity" component={IdentityStepScreen} />
        <Stack.Screen name="TruckParams" component={TruckParamsScreen} />
        <Stack.Screen name="VehicleDocs" component={VehicleDocsScreen} />
          {/* КАНОНИЧЕСКИЙ PRO-flow верификации водителя:
              Security → Identity → Selfie → VehicleDocs → VehiclePhotos →
              TruckParams → submit.
              Это 5 честных шагов (PR-V9 вынес фото авто+кабины в отдельный
              шаг VehiclePhotos; см. TOTAL_STEPS=5 во всех пяти экранах).

              Reg/RegOtp/RegProfile (Premium) ниже — это ОБЩИЙ профиль
              (имя + город), а НЕ документная верификация. Оставлены как legacy
              вход из ProfileScreen/RoleScreen (карандаш профиля, «Получить
              статус PRO»); физически не удаляем. Раньше эти экраны жили только в
              pre-auth стеке, поэтому навигация из ProfileScreen падала
              (route not handled). LegacyReg/LegacyAuth/SignUp смонтированы
              только в qaPreview-галерее и в проде недостижимы. */}
          <Stack.Screen name="Reg" component={PremiumRegisterScreen} />
          <Stack.Screen name="RegOtp" component={PremiumOtpScreen} />
          <Stack.Screen name="RegProfile" component={PremiumProfileScreen} />
          {/* Legacy route — Wallet was a tab in v0/v1.0 but the v1 design
              doesn't surface it in the bottom navigation. It stays reachable
              by navigation.navigate('Wallet') so any in-app deep link or
              future monetization feature can still open it. */}
          <Stack.Screen name="Wallet" component={WalletScreen} />
          <Stack.Screen name="HowItWorks" component={HowItWorksScreen} />
          <Stack.Screen name="About" component={AboutScreen} />
        </>
      )}
    </Stack.Navigator>
  );
}
