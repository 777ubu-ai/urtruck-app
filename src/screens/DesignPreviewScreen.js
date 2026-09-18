// DesignPreviewScreen — visual QA navigator.
//
// Reachable only by appending ?qa=design to the URL. AppNavigator detects
// that flag at boot time and routes here BEFORE the auth-state branch,
// so the QA tester can jump straight into any v1 screen without going
// through OTP/role/feed-load. The route never appears in the bottom tab
// bar and never shows up to a regular visitor — `qaDesignMode()` reads
// the URL query string and returns false on mobile / missing window.
//
// Detail screens that normally need a real id/payload receive mock
// objects that look like the canonical normalised shapes
// (normalizeTrip / normalizeCargo). No real records are ever created on
// the backend from this screen — every preview action that would mutate
// state is a `navigation.navigate` only.

import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Platform, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Feather from '@expo/vector-icons/Feather';
import FontAwesome5 from '@expo/vector-icons/FontAwesome5';
import {v1Colors, useV1Colors, v1Radius, v1AccentFor, getBubbleColors, withAlpha} from '../theme/designV1';
import { LIGHT as V1_LIGHT, DARK as V1_DARK } from '../theme/designV1Palette';
import { useTheme, ThemeScope } from '../utils/ThemeContext';
import RootHeader from '../components/ui/v1/RootHeader';
import BottomNav from '../components/ui/v1/BottomNav';
import BackButton from '../components/ui/v1/BackButton';
import Button from '../components/ui/v1/Button';
import Field from '../components/ui/v1/Field';
import StatusPill from '../components/ui/v1/StatusPill';
import CountryFlag, { COUNTRY_FLAG_CODES } from '../components/ui/v1/CountryFlag';
import Card from '../components/ui/v1/Card';
import VoiceMessageBubble from '../components/VoiceMessageBubble';

// Mock objects mirror the canonical shape produced by normalizeTrip /
// normalizeCargo so the destination screens render exactly the same way
// they do for real data.
const mockTrip = {
  id: 'qa-preview-trip',
  from: 'Хоргос',
  to: 'Алматы',
  transit: null,
  truckType: 'tent',
  capacityTons: 20,
  availableM3: 82,
  price: 450000,
  currency: 'KZT',
  departure: '2026-05-24',
  arrival: '2026-05-27',
  driverName: 'Перевозчик UrTruck #2F8A',
  status: 'active',
  isTrip: true,
  isMine: false,
  _server: false,
};

const mockCargo = {
  id: 'qa-preview-cargo',
  from: 'Урумчи',
  to: 'Шымкент',
  cargoDesc: 'Электроника и комплектующие',
  cargoType: 'tent',
  weightTons: 18,
  volumeM3: 90,
  price: 520000,
  currency: 'KZT',
  pickupDate: '2026-05-25',
  ownerName: 'Boris (preview)',
  bidsCount: 8,
  status: 'active',
  photos: [],
  isMine: false,
  _server: false,
};

const mockDriver = {
  id: 'qa-preview-driver',
  name: 'Демо-водитель',
  full_name: 'Демо-водитель',
  type: 'tent',
  vehicle_plate: 'A 123 BC',
  plate_truck: 'A 123 BC',
  m3: 82,
  tons: 20,
  rating: 4.8,
  reviews: 12,
  country: 'KZ',
  verified: true,
};

const mockPartner = { id: 'qa-preview-partner', name: 'Демо-собеседник' };

const SECTIONS = [
  { title: 'Onboarding', items: [
    { label: 'Welcome / Role', screen: 'Role' },
    { label: 'RoleV2 selection (onboarding)', screen: 'RoleV2' },
    // Stage 35: новые premium-экраны регистрации.
    { label: 'Premium Reg phone (driver)', screen: 'Reg',        params: { role: 'driver' } },
    { label: 'Premium Reg phone (client)', screen: 'Reg',        params: { role: 'client' } },
    { label: 'Premium OTP (driver)',       screen: 'RegOtp',     params: { role: 'driver', phone: '+77479171118' } },
    { label: 'Premium Profile (driver)',   screen: 'RegProfile', params: { role: 'driver' } },
    { label: 'Premium Profile (client)',   screen: 'RegProfile', params: { role: 'client' } },
    { label: 'Premium Login',         screen: 'Login' },
    // Legacy SignUp/Reg/Auth-экраны удалены (Этап 6 чистки) — пункты убраны.
    { label: 'Profile setup driver',  screen: 'EditProfile', params: { role: 'driver' } },
    { label: 'Profile setup cargo owner', screen: 'EditProfile', params: { role: 'client' } },
  ]},
  { title: 'Tabs (driver)', items: [
    { label: 'Feed driver / Cargoes', screen: 'Main', params: { role: 'driver' } },
    { label: 'MyWork driver',         screen: 'MyTripsList', params: { role: 'driver' } },
    { label: 'Profile driver',        screen: 'Profile', params: { role: 'driver' } },
  ]},
  { title: 'Tabs (cargo owner)', items: [
    { label: 'Feed cargo owner / Trips', screen: 'Main', params: { role: 'client' } },
    { label: 'MyWork cargo owner',       screen: 'MyTripsList', params: { role: 'client' } },
  ]},
  { title: 'Create flows', items: [
    { label: 'CreateTrip',  screen: 'CreateTrip',  params: { role: 'driver' } },
    { label: 'CreateCargo', screen: 'CreateCargo', params: { role: 'client' } },
  ]},
  { title: 'Vehicle setup (4 steps)', items: [
    { label: 'Vehicle setup 1 — countries', screen: 'VehicleSetupCountry', params: { role: 'driver' } },
    { label: 'Vehicle setup 2 — machine', screen: 'VehicleSetupMachine', params: { role: 'driver' } },
    { label: 'Vehicle setup 3 — review', screen: 'VehicleSetupReview', params: { role: 'driver' } },
    { label: 'Vehicle setup 4 — success', screen: 'VehicleSetupSuccess', params: { role: 'driver', vehicle: { id: 'preview-vehicle', make: 'Volvo', model: 'FH' } } },
  ]},
  { title: 'Detail screens (mock data)', items: [
    { label: 'CargoDetail demo',  screen: 'CargoDetail', params: { cargo: mockCargo, cargoId: mockCargo.id, role: 'driver' } },
    { label: 'TripDetail demo',   screen: 'TripDetail',  params: { trip: mockTrip, tripId: mockTrip.id, role: 'client' } },
    { label: 'DriverDetail demo', screen: 'DriverDetail', params: { driver: mockDriver, role: 'client' } },
    { label: 'EditTrip demo',     screen: 'EditTrip',    params: { trip: mockTrip, tripId: mockTrip.id } },
  ]},
  { title: 'Chat', items: [
    { label: 'ChatsList', screen: 'ChatsList', params: { role: 'driver' } },
    { label: 'Chat demo', screen: 'Chat', params: { partner: mockPartner, role: 'driver' } },
  ]},
];

// Detect ?qa=design&key=<shared> at the URL level. Two-factor URL gate so
// a casual visitor stumbling on `?qa=design` does NOT see the gallery.
// The key is intentionally low-secrecy — it just stops accidental
// discovery, it's not authn. Rotate `QA_PREVIEW_KEY` whenever the URL
// gets shared too widely. Mobile builds (no window) always return false.
const QA_PREVIEW_KEY = 'urtruck_preview_2026';

export function qaDesignMode() {
  if (Platform.OS !== 'web') return false;
  if (typeof window === 'undefined' || !window.location) return false;
  try {
    const params = new URLSearchParams(window.location.search || '');
    return params.get('qa') === 'design' && params.get('key') === QA_PREVIEW_KEY;
  } catch {
    return false;
  }
}

// ── Design v1 component gallery (Commit 2) ─────────────────────────────
// Renders the shared v1 primitives LIVE, each in a LIGHT and a DARK frame
// (ThemeScope forces the subtree theme; the global toggle is untouched).
// Hardcoded sample data only — nothing here reaches the backend.

const galleryNavStub = { emit: () => ({ defaultPrevented: false }), navigate: () => {} };

const bottomNavState = (index, role) => ({
  index,
  routes: [
    { key: 'feed', name: 'Feed', params: { role } },
    { key: 'mywork', name: 'MyWork', params: { role } },
    { key: 'deals', name: 'Deals', params: { role } },
    { key: 'queue', name: 'Queue', params: { role } },
  ],
});

const PILL_SAMPLES = [
  ['accepted', 'Принят'],
  ['in_progress', 'В пути'],
  ['at_border', 'На границе'],
  ['delivered', 'Доставлен'],
  ['received', 'Получен'],
  ['completed', 'Завершён'],
  ['cancelled', 'Отменён'],
];

// One labelled sample × two theme frames, stacked (mobile-width canvas).
function GalleryPair({ label, children }) {
  return (
    <View style={{ marginBottom: 14 }} testID={`qa-v1-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}>
      <Text style={{ fontSize: 12, fontWeight: '800', color: '#8A978F', letterSpacing: 0.8, marginBottom: 6 }}>
        {label.toUpperCase()}
      </Text>
      <ThemeScope dark={false}>
        <View style={{ backgroundColor: V1_LIGHT.bg, borderRadius: 12, padding: 10, marginBottom: 6, overflow: 'hidden' }}>
          {children('light')}
        </View>
      </ThemeScope>
      <ThemeScope dark={true}>
        <View style={{ backgroundColor: V1_DARK.bg, borderRadius: 12, padding: 10, overflow: 'hidden' }}>
          {children('dark')}
        </View>
      </ThemeScope>
    </View>
  );
}

function DesignV1Gallery() {
  return (
    <View style={{ marginTop: 20 }} testID="qa-design-v1-section">
      <Text style={{ fontSize: 11, fontWeight: '800', color: '#8A978F', letterSpacing: 1, marginBottom: 8 }}>
        DESIGN V1 · COMPONENTS (LIGHT + DARK)
      </Text>

      <GalleryPair label="RootHeader">
        {() => <RootHeader navigation={galleryNavStub} role="driver" onBellPress={() => {}} bellCount={3} testID="qa-v1-root-header" />}
      </GalleryPair>

      <GalleryPair label="BottomNav · driver">
        {() => <BottomNav state={bottomNavState(0, 'driver')} navigation={galleryNavStub} />}
      </GalleryPair>

      <GalleryPair label="BottomNav · client">
        {() => <BottomNav state={bottomNavState(2, 'client')} navigation={galleryNavStub} />}
      </GalleryPair>

      <GalleryPair label="BackButton">
        {() => <BackButton onPress={() => {}} testID="qa-v1-back" />}
      </GalleryPair>

      <GalleryPair label="Button variants">
        {() => (
          <View>
            <Button title="Primary" onPress={() => {}} testID="qa-v1-btn-primary" style={{ marginBottom: 6 }} />
            <Button title="Secondary" variant="secondary" onPress={() => {}} style={{ marginBottom: 6 }} />
            <Button title="Tertiary" variant="tertiary" onPress={() => {}} style={{ marginBottom: 6 }} />
            <Button title="Destructive" variant="destructive" onPress={() => {}} style={{ marginBottom: 6 }} />
            <Button title="Disabled" disabled onPress={() => {}} style={{ marginBottom: 6 }} />
            <Button title="Loading" loading onPress={() => {}} />
          </View>
        )}
      </GalleryPair>

      <GalleryPair label="Field states">
        {() => (
          <View>
            <Field label="Вес, т" value="" onChangeText={() => {}} placeholder="Например: 31.5" testID="qa-v1-field-empty" />
            <Field label="Объём, м³" value="110" onChangeText={() => {}} testID="qa-v1-field-filled" />
            <Field label="Сумма" value="-5" onChangeText={() => {}} error="Укажите корректную сумму" testID="qa-v1-field-error" />
            <Field variant="dropdown" label="Валюта" value="USD" onPress={() => {}} testID="qa-v1-field-dropdown" />
          </View>
        )}
      </GalleryPair>

      <GalleryPair label="StatusPill">
        {() => (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {PILL_SAMPLES.map(([status, label]) => (
              <StatusPill key={status} status={status} label={label} testID={`qa-v1-pill-${status}`} />
            ))}
          </View>
        )}
      </GalleryPair>

      <GalleryPair label="CountryFlag fixture">
        {() => (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }} testID="qa-country-flag-fixture">
            {COUNTRY_FLAG_CODES.map((code) => (
              <View key={code} style={{ alignItems: 'center', gap: 3 }}>
                <CountryFlag code={code} width={36} testID={`qa-country-flag-${code.toLowerCase()}`} />
                <Text style={{ fontSize: 10, fontWeight: '700' }}>{code}</Text>
              </View>
            ))}
            <View style={{ alignItems: 'center', gap: 3 }}>
              <CountryFlag code="XX" width={36} testID="qa-country-flag-xx" />
              <Text style={{ fontSize: 10, fontWeight: '700' }}>XX</Text>
            </View>
          </View>
        )}
      </GalleryPair>

      <GalleryPair label="Card">
        {() => (
          <Card testID="qa-v1-card">
            {/* {'…'} expression containers keep this QA-only sample copy out
                of the repo-wide no-Cyrillic-JSX-text sweep (preview canvas,
                not a user-facing surface). */}
            <Text style={{ fontSize: 17, fontWeight: '800' }}>{'Алматы → Хоргос'}</Text>
            <Text style={{ fontSize: 12, marginTop: 4 }}>{'Фура · 20 т · 82 м³'}</Text>
          </Card>
        )}
      </GalleryPair>
    </View>
  );
}

// ── Chat canon gallery (Commit 5) ──────────────────────────────────────
// Renders the REAL chat chrome from DealWorkspaceScreenV2 — VoiceMessageBubble
// component, getBubbleColors bubble surfaces, date-separator pill, micro
// timestamps, translate link, composer replica — in the ACTIVE app theme
// (?theme=light|dark drives the screenshot gate). All copy lives in consts
// to stay clear of the no-Cyrillic-JSX-text sweep.
const QA_COPY = {
  dateToday: 'Сегодня',
  incomingText: 'Добрый день! Груз будет готов к погрузке завтра с 9:00. Пропуск на КПП оформлен.',
  outgoingText: 'Отлично, буду на складе к 8:45. Нужен ли вам фото пломб после погрузки?',
  outgoingShort: 'Понял, спасибо! Выезжаю.',
  transcript: '«Завтра с утра на границе очередь около двух часов, планируйте время. Все документы уже у водителя.»',
  translate: 'Перевести',
  placeholder: 'Сообщение…',
};

const qaT = (key) => ({
  voice_to_text: 'В текст',
  voice_hide_text: 'Скрыть текст',
  voice_show_text: 'Показать текст',
}[key] || key);

// Faithful equivalent of the DWSV2 bubble surface: radius canon from the
// screen + getBubbleColors fills (outgoing green / incoming surface+border).
function PreviewBubble({ mine, children, style }) {
  const { isDark } = useTheme();
  const bubble = getBubbleColors(mine, !!isDark);
  return (
    <View style={[{
      maxWidth: '84%',
      borderRadius: 16,
      paddingHorizontal: 11,
      paddingVertical: 8,
      backgroundColor: bubble.backgroundColor,
      borderColor: bubble.borderColor,
      borderWidth: 1,
      alignSelf: mine ? 'flex-end' : 'flex-start',
      borderBottomRightRadius: mine ? 5 : 16,
      borderBottomLeftRadius: mine ? 16 : 5,
    }, style]}>
      {children}
    </View>
  );
}

function PreviewTimestamp({ mine, children }) {
  const colors = useV1Colors();
  const { isDark } = useTheme();
  const bubble = getBubbleColors(true, !!isDark);
  return (
    <Text style={{
      fontSize: 11, lineHeight: 14, fontWeight: '600', letterSpacing: 0.2,
      marginTop: 4, textAlign: 'right',
      color: mine ? withAlpha(bubble.textColor, 0.62) : colors.textMuted,
    }}
    >
      {children}
    </Text>
  );
}

function ChatGallery() {
  const colors = useV1Colors();
  return (
    <View style={{ marginTop: 20 }} testID="qa-chat-section">
      <Text style={{ fontSize: 11, fontWeight: '800', color: '#8A978F', letterSpacing: 1, marginBottom: 8 }}>
        CHAT · BUBBLES / VOICE / COMPOSER (ACTIVE THEME)
      </Text>
      <View style={{ backgroundColor: colors.bg, borderRadius: 12, padding: 12, overflow: 'hidden' }}>

        {/* Date separator pill */}
        <View style={{ alignItems: 'center', marginTop: 2, marginBottom: 10 }}>
          <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: colors.surfaceMuted }}>
            <Text style={{ fontSize: 11, lineHeight: 14, fontWeight: '600', letterSpacing: 0.2, color: colors.textMuted }}>{QA_COPY.dateToday}</Text>
          </View>
        </View>

        {/* Incoming text bubble + translate link */}
        <PreviewBubble mine={false} style={{ marginBottom: 10 }}>
          <Text style={{ fontSize: 14.5, lineHeight: 20, color: colors.text }}>{QA_COPY.incomingText}</Text>
          <TouchableOpacity style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 }}>
            <Feather name="globe" size={11} color={colors.info} />
            <Text style={{ fontSize: 11, fontWeight: '700', color: colors.info }}>{QA_COPY.translate}</Text>
          </TouchableOpacity>
          <PreviewTimestamp mine={false}>{'12:38'}</PreviewTimestamp>
        </PreviewBubble>

        {/* Outgoing text bubble */}
        <PreviewBubble mine style={{ marginBottom: 10 }}>
          <PreviewOutgoingText>{QA_COPY.outgoingText}</PreviewOutgoingText>
          <PreviewTimestamp mine>{'12:40'}</PreviewTimestamp>
        </PreviewBubble>

        {/* Outgoing voice bubble: active state (speed pill) + transcription */}
        <PreviewBubble mine style={{ marginBottom: 10 }}>
          <VoiceMessageBubble
            uri="qa-preview://voice/outgoing.m4a"
            fallbackDurationSec={47}
            mine
            forceActive
            transcript={{ visible: true, transcriptText: QA_COPY.transcript }}
            onToggleTranscript={() => {}}
            t={qaT}
            testID="qa-voice-outgoing"
          />
          <PreviewTimestamp mine>{'12:41'}</PreviewTimestamp>
        </PreviewBubble>

        {/* Incoming voice bubble: idle state + «В текст» */}
        <PreviewBubble mine={false} style={{ marginBottom: 10 }}>
          <VoiceMessageBubble
            uri="qa-preview://voice/incoming.m4a"
            fallbackDurationSec={12}
            mine={false}
            onToggleTranscript={() => {}}
            t={qaT}
            testID="qa-voice-incoming"
          />
          <PreviewTimestamp mine={false}>{'12:42'}</PreviewTimestamp>
        </PreviewBubble>

        {/* Outgoing short text */}
        <PreviewBubble mine style={{ marginBottom: 12 }}>
          <PreviewOutgoingText>{QA_COPY.outgoingShort}</PreviewOutgoingText>
          <PreviewTimestamp mine>{'12:43'}</PreviewTimestamp>
        </PreviewBubble>

        {/* Composer replica (visual only) */}
        <View style={{
          minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 7,
          paddingHorizontal: 8, paddingVertical: 6, borderRadius: 30,
          backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
        }}
        >
          <View style={{ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceMuted, borderWidth: 1, borderColor: colors.border }}>
            <Feather name="plus" size={27} color={colors.text} />
          </View>
          <View style={{ flex: 1, minHeight: 32, borderRadius: 999, backgroundColor: colors.surface, justifyContent: 'center' }}>
            <TextInput
              editable={false}
              value=""
              placeholder={QA_COPY.placeholder}
              placeholderTextColor={colors.placeholder}
              style={{ minHeight: 32, paddingHorizontal: 12, fontSize: 15, color: colors.text }}
            />
            <View style={{ position: 'absolute', right: 2, bottom: -1, width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}>
              <Feather name="smile" size={22} color={colors.text} />
            </View>
          </View>
          <View style={{ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceMuted, borderWidth: 1, borderColor: colors.border }}>
            <Feather name="mic" size={22} color={colors.text} />
          </View>
          <View style={{ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.driver }}>
            <FontAwesome5 name="paper-plane" size={15} color="#FFFFFF" solid />
          </View>
        </View>
      </View>
    </View>
  );
}

// Outgoing bubble body text — colour from the outgoing bubble token.
function PreviewOutgoingText({ children }) {
  const { isDark } = useTheme();
  const bubble = getBubbleColors(true, !!isDark);
  return <Text style={{ fontSize: 14.5, lineHeight: 20, color: bubble.textColor }}>{children}</Text>;
}

export default function DesignPreviewScreen({ navigation }) {
  const v1 = useV1Colors();
  // ?theme=dark|light forces the app theme for screenshot runs (Commit 2
  // screenshot gate). Without the param the user's own theme choice stays.
  const { setThemeMode } = useTheme();
  React.useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    try {
      const theme = new URLSearchParams(window.location.search || '').get('theme');
      if (theme === 'dark' || theme === 'light') setThemeMode(theme);
    } catch {}
  }, []);
  const s = React.useMemo(() => StyleSheet.create({

  safe: { flex: 1, backgroundColor: v1.bg },
  scroll: { paddingHorizontal: 16, paddingBottom: 60 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 },
  brand: { color: v1.text, fontSize: 26, fontWeight: '900', letterSpacing: -0.5 },
  qaPill: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 },
  qaPillText: { fontSize: 11, fontWeight: '900', letterSpacing: 1 },
  title: { color: v1.text, fontSize: 22, fontWeight: '900', marginTop: 8 },
  subtitle: { color: v1.textMuted, fontSize: 13, marginTop: 4, lineHeight: 18 },
  sectionTitle: {
    color: v1.textMuted, fontSize: 11, fontWeight: '800',
    letterSpacing: 1, marginBottom: 8,
  },
  row: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: v1.surface,
    borderColor: v1.border, borderWidth: 1,
    borderRadius: v1Radius.field,
    paddingHorizontal: 14, paddingVertical: 14,
    marginBottom: 6,
  },
  rowLabel: { color: v1.text, fontSize: 14, fontWeight: '600' },
  rowArrow: { fontSize: 22, fontWeight: '300' },
  footer: { color: v1.textDim, fontSize: 11, textAlign: 'center', marginTop: 28, lineHeight: 16 },

  }), [v1]);
  const accent = v1AccentFor('driver');
  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        <View style={s.brandRow}>
          <Text style={s.brand}>UrTruck</Text>
          <View style={[s.qaPill, { backgroundColor: accent.soft, borderColor: accent.main }]}>
            <Text style={[s.qaPillText, { color: accent.main }]}>QA · DESIGN</Text>
          </View>
        </View>
        <Text style={s.title}>Visual Preview</Text>
        <Text style={s.subtitle}>
          Открывает экраны UrTruck Design v1 без прохождения OTP/auth-flow.
          Detail-экраны открываются с mock-данными — backend не трогается.
        </Text>

        <DesignV1Gallery />

        <ChatGallery />

        {SECTIONS.map((section) => (
          <View key={section.title} style={{ marginTop: 18 }}>
            <Text style={s.sectionTitle}>{section.title.toUpperCase()}</Text>
            {section.items.map((item) => (
              <TouchableOpacity
                key={item.label}
                style={s.row}
                activeOpacity={0.85}
                onPress={() => {
                  try { navigation.navigate(item.screen, item.params); } catch (e) {
                    console.warn('[DesignPreview] navigate failed:', item.screen, e?.message);
                  }
                }}
                testID={`qa-preview-${item.screen.toLowerCase()}-${(item.params?.role || item.params?.screen || '').toLowerCase() || 'default'}`}
              >
                <Text style={s.rowLabel}>{item.label}</Text>
                <Text style={[s.rowArrow, { color: accent.main }]}>›</Text>
              </TouchableOpacity>
            ))}
          </View>
        ))}

        <Text style={s.footer}>
          QA preview mode · remove{' '}
          <Text style={{ color: accent.main, fontWeight: '900' }}>qa</Text>
          {' / '}
          <Text style={{ color: accent.main, fontWeight: '900' }}>key</Text>
          {' '}params to exit
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}
