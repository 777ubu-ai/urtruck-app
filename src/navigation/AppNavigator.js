import { sessionRole } from '../utils/publicationSession';
import DriverExpensesScreen from '../screens/DriverExpensesScreen';
import { onboardingNavKey } from '../utils/onboardingNavKey';
import React from 'react';
import { View, Text, Animated, AppState } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useEffect } from 'react';
import { useI18n } from '../utils/useI18n';
import { useTheme } from '../utils/ThemeContext';
import { useAuth } from '../utils/AuthContext';
import { FOREGROUND_LOCATION_ONLY, stopBackgroundTracking } from '../utils/backgroundLocation';
import { marketAPI } from '../utils/marketAPI';
import { storage } from '../utils/storage';
import BottomNav from '../components/ui/v1/BottomNav';
import ExternalFreightFeedScreen from '../screens/ExternalFreightFeedScreen';
import { EXTERNAL_FREIGHT_ENABLED } from '../utils/externalFreightFeed';
import withExternalFeedFirstVisit from '../components/externalFreight/withExternalFeedFirstVisit';

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
import VehicleSetupCountryScreen from '../screens/vehicle/VehicleSetupCountryScreen';
import VehicleSetupMachineScreen from '../screens/vehicle/VehicleSetupMachineScreen';
import VehicleSetupReviewScreen from '../screens/vehicle/VehicleSetupReviewScreen';
import VehicleSetupSuccessScreen from '../screens/vehicle/VehicleSetupSuccessScreen';
import VehicleChooserScreen from '../screens/vehicle/VehicleChooserScreen';
import PremiumLoginScreen from '../screens/registration/PremiumLoginScreen';
import FeedScreen from '../screens/FeedScreen';
import CargoFeedScreen from '../screens/CargoFeedScreen';
import CargoDetailV2 from '../screens/CargoDetailV2';
import DriverDetail from '../screens/DriverDetail';
import ChatScreenV2 from '../screens/ChatScreenV2';
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
import TripDetailV2 from '../screens/TripDetailV2';
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

// Chat is a single workspace window. Entry points may identify the same
// conversation by deal, room, or partner, and may arrive while another root
// screen is focused. A stable route key makes every Chat navigation return to
// this one stack entry; ChatScreenV2 resolves the latest params on reuse.
function chatRouteId() {
  return 'chat-workspace';
}

// (Стаб центральной «+»-вкладки удалён 26.07.2026: у клиента размещение груза
// переехало кнопкой внутрь «Мои грузы», вкладки Publish больше нет.)

function MainTabs({ route }) {
  const { session } = useAuth();
  const { theme } = useTheme();
  const role = sessionRole(session, route?.params?.role) || 'client';
  const isDriver = role === 'driver';

  // Login/tabs never request a position. Only remove a persisted legacy task.
  useEffect(() => {
    if (!FOREGROUND_LOCATION_ONLY) return undefined;
    const stop = () => { stopBackgroundTracking(); };
    stop();
    const sub = AppState.addEventListener('change', state => { if (state !== 'active') stop(); });
    return () => { sub?.remove?.(); stop(); };
  }, []);

  // A driver updating mid-trip may still have a continuous-mode server row.
  // Switch only that authenticated driver's active deals, without requesting
  // location. Old servers omit the capability and remain untouched.
  useEffect(() => {
    if (!FOREGROUND_LOCATION_ONLY || session?.user?.role !== 'driver') return undefined;
    let alive = true;
    let busy = false;
    let generation = 0;
    const sync = async () => {
      if (!alive || busy || AppState.currentState !== 'active') return;
      busy = true;
      const epoch = generation;
      const isCurrent = () => alive && epoch === generation && AppState.currentState === 'active';
      try {
        const token = await storage.get('ur_reg_token');
        if (!token || !isCurrent()) return;
        const sameSession = async () => {
          const currentToken = await storage.get('ur_reg_token');
          return isCurrent() && currentToken === token;
        };
        const result = await marketAPI.activeTrackingDeals();
        if (!isCurrent() || result?.ok === false || result?.snapshot_location_supported !== true
            || !Array.isArray(result.deal_ids) || !await sameSession()) return;
        for (const id of result.deal_ids) {
          if (!isCurrent() || !await sameSession()) return;
          await marketAPI.activateSnapshotTracking(id);
        }
      } catch { /* A later foreground entry retries; no GPS is started. */ }
      finally {
        busy = false;
        // Resume may arrive while an obsolete request is still finishing.
        if (alive && epoch !== generation && AppState.currentState === 'active') sync();
      }
    };
    sync();
    const sub = AppState.addEventListener('change', state => {
      generation += 1;
      if (state === 'active') sync();
    });
    return () => { alive = false; generation += 1; sub?.remove?.(); };
  }, [session?.user?.id, session?.user?.role]);

  // Канон таб-баров (приказ владельца 2026-07-26, обе волны).
  // Обе роли живут по одной логике: «Сделки» = единый инбокс (ставки сверху,
  // переписки ниже; торг и чат — ВНУТРИ комнаты сделки). Отдельных вкладок
  // «Чаты» и «Разместить» нет ни у кого: чат внутри сделки, размещение —
  // кнопкой внутри «моего меню» (Рейсы/Грузы, §2.2.2).
  //   Обе роли (4): рабочий каталог · своя работа · Сделки · Граница.
  //   Queue — электронная очередь/граница; Profile остаётся только в верхнем
  //   меню и stack-навигации, чтобы не дублировать его в bottom bar.
  // BottomNav красит акцент по роли: driver #168759 (icon+label); client —
  // pill #FF8400, а icon/label #D26D00 (контрастная пара, см. BottomNav
  // ROLE_ACCENT / LABEL_ACCENT).
  return (
    <Tab.Navigator
      key={`${session?.user?.id || 'guest'}:${role}`}
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
          <Tab.Screen name="Feed" component={CargoFeedScreen} initialParams={{ role }} />
          <Tab.Screen name="MyWork" component={MyTripsScreen} initialParams={{ role }} />
          <Tab.Screen name="Deals" component={ChatsListScreen} initialParams={{ role }} />
          <Tab.Screen name="Queue" component={QueueScreen} initialParams={{ role }} />
        </>
      ) : (
        <>
          <Tab.Screen name="MyWork" component={MyTripsScreen} initialParams={{ role }} />
          <Tab.Screen name="Feed" component={FeedScreen} initialParams={{ role }} />
          <Tab.Screen name="Deals" component={ChatsListScreen} initialParams={{ role }} />
          <Tab.Screen name="Queue" component={QueueScreen} initialParams={{ role }} />
        </>
      )}
    </Tab.Navigator>
  );
}

const FirstVisitMainTabs = withExternalFeedFirstVisit(MainTabs);

// Реактивная навигация на основе auth state
export default function AppNavigator() {
  const { session, hasToken, loading, verificationLevel } = useAuth();
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
        <Stack.Screen name="Favorites" component={FavoritesScreen} />
        <Stack.Screen name="CargoDetail" component={CargoDetailV2} />
        <Stack.Screen name="DriverDetail" component={DriverDetail} />
        <Stack.Screen name="Chat" component={ChatScreenV2} getId={chatRouteId} options={{ gestureEnabled: false }} />
        <Stack.Screen name="ChatsList" component={ChatsListScreen} />
        <Stack.Screen name="MyTripsList" component={MyTripsScreen} />
        <Stack.Screen name="EditProfile" component={EditProfileScreen} />
        <Stack.Screen name="CargoRuqsatInfo" component={CargoRuqsatInfoScreen} />
        <Stack.Screen name="TripDetail" component={TripDetailV2} />
        <Stack.Screen name="EditTrip" component={EditTripScreen} />
        <Stack.Screen name="CreateTrip" component={CreateTripScreen} />
        <Stack.Screen name="CreateCargo" component={CreateCargoScreen} />
        <Stack.Screen name="VehicleSetupCountry" component={VehicleSetupCountryScreen} />
        <Stack.Screen name="VehicleSetupMachine" component={VehicleSetupMachineScreen} />
        <Stack.Screen name="VehicleSetupReview" component={VehicleSetupReviewScreen} />
        <Stack.Screen name="VehicleSetupSuccess" component={VehicleSetupSuccessScreen} />
        <Stack.Screen name="VehicleChooser" component={VehicleChooserScreen} />
        <Stack.Screen name="DriverExpenses" component={DriverExpensesScreen} />
        <Stack.Screen name="TruckParams" component={TruckParamsScreen} />
        <Stack.Screen name="VehicleDocs" component={VehicleDocsScreen} />
      </Stack.Navigator>
    );
  }

  // BUG FIX (logout не выкидывал на экран входа): React Navigation не
  // сбрасывает свой ВНУТРЕННИЙ state (текущий route/индекс) сам по себе,
  // когда меняется набор <Stack.Screen> — если пользователь был на
  // "глубоком" экране (например Profile, который есть ТОЛЬКО в
  // авторизованном наборе), после logout Navigator пытался остаться на
  // маршруте "Profile", которого в новом (неавторизованном) наборе экранов
  // нет — итог: завис на старом кадре, hasToken/session при этом уже
  // корректно false (см. [NAV DIAG] лог). Main и onboarding имеют разные
  // key, поэтому logout сбрасывает стек. Guest → verified без роли сохраняет
  // тот же onboarding navigator: иначе reset из завершившегося OTP попадает
  // в уже размонтированный стек. Cold start подтверждённого аккаунта без роли открывает RoleV2.
  const navKey = onboardingNavKey({ hasToken, session, hasRole, verificationLevel });

  return (
    <Stack.Navigator
      key={navKey === 'main' ? `main:${session?.user?.id || 'guest'}` : (navKey === 'norole' ? 'guest' : navKey)}
      initialRouteName={navKey === 'norole' ? 'RoleV2' : (navKey === 'main' ? 'Main' : 'OnboardingV2')}
      screenOptions={{ headerShown: false }}
    >
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
          {/* Профиль доступен и гостю (☰ в шапке) — показывает
              ограниченный вид с приглашением зарегистрироваться. Без этой
              регистрации маршрута navigate('Profile') у гостя не срабатывал. */}
          <Stack.Screen name="Profile" component={ProfileScreen} />
          <Stack.Screen name="CargoDetail" component={CargoDetailV2} />
          <Stack.Screen name="TripDetail" component={TripDetailV2} />
          <Stack.Screen name="DriverDetail" component={DriverDetail} />
          <Stack.Screen name="Chat" component={ChatScreenV2} getId={chatRouteId} options={{ gestureEnabled: false }} />
          <Stack.Screen name="Notifications" component={NotificationsScreen} />
          <Stack.Screen name="VehicleSetupCountry" component={VehicleSetupCountryScreen} />
          <Stack.Screen name="VehicleSetupMachine" component={VehicleSetupMachineScreen} />
          <Stack.Screen name="VehicleSetupReview" component={VehicleSetupReviewScreen} />
          <Stack.Screen name="VehicleSetupSuccess" component={VehicleSetupSuccessScreen} />
          <Stack.Screen name="VehicleChooser" component={VehicleChooserScreen} />
          <Stack.Screen name="DriverExpenses" component={DriverExpensesScreen} />
        </>
      ) : (
        // Полностью в приложении
        <>
          <Stack.Screen name="Main" component={FirstVisitMainTabs} />
          {/* Профиль теперь открывается из ☰ (top-right) как отдельный экран
              стека, а не как вкладка таб-бара (её занял «Дела»). */}
          <Stack.Screen name="Profile" component={ProfileScreen} />
          {EXTERNAL_FREIGHT_ENABLED && (sessionRole(session) === 'driver' || sessionRole(session) === 'client') ? <Stack.Screen name="ExternalFreightFeed" component={ExternalFreightFeedScreen} /> : null}
          <Stack.Screen name="CargoDetail" component={CargoDetailV2} />
          <Stack.Screen name="DriverDetail" component={DriverDetail} />
          <Stack.Screen name="Chat" component={ChatScreenV2} getId={chatRouteId} options={{ gestureEnabled: false }} />
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
          <Stack.Screen name="CountryPicker" component={CountryPickerSheet} options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
          <Stack.Screen name="CargoRuqsatInfo" component={CargoRuqsatInfoScreen} />
          <Stack.Screen name="Security" component={SecurityScreen} />
          <Stack.Screen name="TripDetail" component={TripDetailV2} />
          <Stack.Screen name="EditTrip" component={EditTripScreen} />
          <Stack.Screen name="CreateTrip" component={CreateTripScreen} />
          <Stack.Screen name="CreateCargo" component={CreateCargoScreen} />
          <Stack.Screen name="VehicleSetupCountry" component={VehicleSetupCountryScreen} />
          <Stack.Screen name="VehicleSetupMachine" component={VehicleSetupMachineScreen} />
          <Stack.Screen name="VehicleSetupReview" component={VehicleSetupReviewScreen} />
          <Stack.Screen name="VehicleSetupSuccess" component={VehicleSetupSuccessScreen} />
          <Stack.Screen name="VehicleChooser" component={VehicleChooserScreen} />
          <Stack.Screen name="DriverExpenses" component={DriverExpensesScreen} />
        <Stack.Screen name="Citizenship" component={CitizenshipScreen} />
        <Stack.Screen name="Identity" component={IdentityStepScreen} />
        <Stack.Screen name="TruckParams" component={TruckParamsScreen} />
        <Stack.Screen name="VehicleDocs" component={VehicleDocsScreen} />
          {/* КАНОНИЧЕСКИЙ PRO-flow верификации водителя (4 шага):
              Citizenship 1 → Identity 2 → VehicleDocs 3 → TruckParams 4 →
              submit. TOTAL_STEPS=4 во всех четырёх экранах. Legacy-экраны
              SelfieStepScreen/VehiclePhotosScreen удалены (Commit 8) — не
              были смонтированы и ниоткуда не импортировались.

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
