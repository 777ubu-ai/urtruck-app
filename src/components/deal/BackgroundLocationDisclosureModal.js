import React, { useMemo } from 'react';
import { Modal, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { useTheme } from '../../utils/ThemeContext';

const COPY = {
  RU: {
    title: 'Разрешить GPS-отслеживание?',
    intro: 'UrTruck будет получать точное местоположение автомобиля во время активного рейса и передавать его грузоотправителю, чтобы он видел движение груза на карте.',
    background: 'Данные о местоположении используются и в фоновом режиме — когда приложение свёрнуто, не отображается на экране или экран телефона выключен.',
    stop: 'Передача GPS прекращается после завершения или отмены рейса.',
    continue: 'Согласен и продолжить',
    notNow: 'Не согласен',
    settingsTitle: Platform.OS === 'web' ? 'Разрешите геолокацию в браузере' : 'Разрешите геолокацию всегда',
    settingsBody: Platform.OS === 'web'
      ? 'Чтобы открыть карту рейса, разрешите UrTruck доступ к местоположению для этого сайта в настройках браузера.'
      : 'Android уже разрешил геолокацию при использовании приложения. Для GPS активного рейса теперь разрешите UrTruck доступ к местоположению «Всегда».',
    settingsHint: Platform.OS === 'android'
      ? 'Нажмите «Открыть настройки» → Геолокация → Разрешить в любом режиме. Затем вернитесь в UrTruck.'
      : Platform.OS === 'web'
        ? 'Откройте настройки сайта в браузере, разрешите «Местоположение», вернитесь в UrTruck и нажмите «Проверить ещё раз».'
        : 'В настройках разрешите доступ к геолокации.',
    openSettings: 'Открыть настройки',
    checkAgain: 'Проверить ещё раз',
  },
  EN: {
    title: 'Allow GPS tracking?',
    intro: 'During an active trip, UrTruck will access the vehicle’s precise location and share it with the shipper so they can follow the cargo on the map.',
    background: 'Location data is also used in the background when the app is minimized, not visible on screen, or the phone screen is off.',
    stop: 'GPS sharing stops when the trip is completed or cancelled.',
    continue: 'Agree and continue',
    notNow: 'Do not agree',
    settingsTitle: Platform.OS === 'web' ? 'Allow location in your browser' : 'Allow location all the time',
    settingsBody: Platform.OS === 'web'
      ? 'To open the trip map, allow location access for this site in your browser settings.'
      : 'Android has allowed location while using the app. For active-trip GPS, now allow UrTruck location access “all the time”.',
    settingsHint: Platform.OS === 'android'
      ? 'Tap “Open settings” → Location → Allow all the time, then return to UrTruck.'
      : Platform.OS === 'web'
        ? 'Open this site’s browser permissions, allow Location, return to UrTruck, then tap “Check again”.'
        : 'Allow location access in settings.',
    openSettings: 'Open settings',
    checkAgain: 'Check again',
  },
  ZH: {
    title: '允许 GPS 跟踪吗？',
    intro: '在运输进行期间，UrTruck 会获取车辆的精确位置并共享给货主，以便货主在地图上查看货物运输进度。',
    background: '应用最小化、未显示在屏幕上或手机熄屏时，位置数据仍可能在后台使用。',
    stop: '运输完成或取消后将停止共享 GPS。',
    continue: '同意并继续',
    notNow: '不同意',
    settingsTitle: Platform.OS === 'web' ? '请在浏览器中允许位置权限' : '始终允许位置权限',
    settingsBody: Platform.OS === 'web'
      ? '要打开运输地图，请在浏览器的网站权限中允许 UrTruck 使用位置。'
      : 'Android 已允许“使用应用期间”访问位置。为了运输期间持续 GPS 跟踪，请继续允许 UrTruck “始终”访问位置。',
    settingsHint: Platform.OS === 'android'
      ? '点击“打开设置” → 位置 → 始终允许，然后返回 UrTruck。'
      : Platform.OS === 'web'
        ? '打开浏览器的网站权限，允许“位置”，返回 UrTruck 后点击“再次检查”。'
        : '请在设置中允许位置访问。',
    openSettings: '打开设置',
    checkAgain: '再次检查',
  },
  KK: {
    title: 'GPS бақылауға рұқсат бересіз бе?',
    intro: 'Белсенді рейс кезінде UrTruck көліктің нақты орналасқан жерін алып, жүк иесіне береді, сонда ол жүктің қозғалысын картадан көре алады.',
    background: 'Қолданба жиналғанда, экранда көрінбегенде немесе телефон экраны өшкенде де геолокация деректері фондық режимде пайдаланылуы мүмкін.',
    stop: 'Рейс аяқталған немесе тоқтатылған кезде GPS беру тоқтайды.',
    continue: 'Келісемін және жалғастыру',
    notNow: 'Келіспеймін',
    settingsTitle: Platform.OS === 'web' ? 'Браузерде геолокацияға рұқсат беріңіз' : 'Геолокацияға әрқашан рұқсат беріңіз',
    settingsBody: Platform.OS === 'web'
      ? 'Рейс картасын ашу үшін браузердегі осы сайттың геолокация рұқсатын қосыңыз.'
      : 'Android қолданбаны пайдалану кезінде геолокацияға рұқсат берді. Белсенді рейстің GPS бақылауы үшін UrTruck-қа «Әрқашан» рұқсат беріңіз.',
    settingsHint: Platform.OS === 'android'
      ? '«Баптауларды ашу» → Геолокация → Әрқашан рұқсат беру, содан кейін UrTruck-қа оралыңыз.'
      : Platform.OS === 'web'
        ? 'Браузердегі сайт рұқсаттарын ашып, геолокацияны қосыңыз, UrTruck-қа оралып «Қайта тексеру» батырмасын басыңыз.'
        : 'Баптауларда геолокацияға рұқсат беріңіз.',
    openSettings: 'Баптауларды ашу',
    checkAgain: 'Қайта тексеру',
  },
};

function InfoRow({ icon, iconColor, iconBackground, children }) {
  const { theme } = useTheme();
  const s = useMemo(() => makeStyles(theme), [theme]);
  return (
    <View style={s.infoRow}>
      <View style={[s.infoIcon, { backgroundColor: iconBackground }]}>
        <Feather name={icon} size={19} color={iconColor} />
      </View>
      <Text style={s.infoText}>{children}</Text>
    </View>
  );
}

export default function BackgroundLocationDisclosureModal({
  visible,
  lang = 'RU',
  mode = 'disclosure',
  busy = false,
  onContinue,
  onCancel,
  onOpenSettings,
  onCheckAgain,
}) {
  const { theme } = useTheme();
  const s = useMemo(() => makeStyles(theme), [theme]);
  const ui = COPY[lang] || COPY.RU;
  const settingsMode = mode === 'settings';
  const canOpenNativeSettings = Platform.OS !== 'web';

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={s.backdrop} testID="background-location-disclosure">
        <View style={s.card}>
          <View style={s.heroIcon}>
            <Feather name="map-pin" size={38} color="#1264E6" />
          </View>

          <Text style={s.title}>{settingsMode ? ui.settingsTitle : ui.title}</Text>

          {settingsMode ? (
            <>
              <Text style={s.intro}>{ui.settingsBody}</Text>
              <InfoRow icon="settings" iconColor="#1264E6" iconBackground="rgba(18,100,230,0.12)">
                {ui.settingsHint}
              </InfoRow>
              {canOpenNativeSettings ? (
                <TouchableOpacity
                  style={[s.primary, busy && s.disabled]}
                  onPress={onOpenSettings}
                  disabled={busy}
                  testID="background-location-open-settings"
                >
                  <Feather name="settings" size={19} color="#FFFFFF" />
                  <Text style={s.primaryText}>{ui.openSettings}</Text>
                </TouchableOpacity>
              ) : null}
              <TouchableOpacity
                style={[s.secondary, !canOpenNativeSettings && s.webCheckAgain]}
                onPress={onCheckAgain}
                disabled={busy}
                testID="background-location-check-again"
              >
                <Text style={s.secondaryText}>{busy ? '…' : ui.checkAgain}</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <Text style={s.intro}>{ui.intro}</Text>

              <View style={s.infoGroup}>
                <InfoRow icon="crosshair" iconColor="#1264E6" iconBackground="rgba(18,100,230,0.12)">
                  {ui.background}
                </InfoRow>
                <InfoRow icon="shield" iconColor="#1DBB72" iconBackground="rgba(29,187,114,0.14)">
                  {ui.stop}
                </InfoRow>
              </View>

              <TouchableOpacity
                style={[s.primary, busy && s.disabled]}
                onPress={onContinue}
                disabled={busy}
                testID="background-location-disclosure-continue"
              >
                <Feather name="map-pin" size={20} color="#FFFFFF" />
                <Text style={s.primaryText}>{busy ? '…' : ui.continue}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={s.secondary}
                onPress={onCancel}
                disabled={busy}
                testID="background-location-disclosure-cancel"
              >
                <Text style={s.secondaryText}>{ui.notNow}</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

// P1 theme-consistency: this modal is reachable mid deal-flow (Start trip),
// so a light-only card here is exactly the "white modal on a dark screen"
// case the audit called out. The blue primary CTA and its icon tints stay
// semantic (this is the OS-location-permission color language on both iOS
// and Android) — only surfaces/text/border follow ThemeContext.
const makeStyles = (theme) => StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: theme.overlay,
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  card: {
    width: '100%',
    maxWidth: 520,
    alignSelf: 'center',
    backgroundColor: theme.surface,
    borderRadius: 28,
    paddingHorizontal: 24,
    paddingTop: 30,
    paddingBottom: 20,
    shadowColor: theme.shadow,
    shadowOpacity: 0.20,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 14 },
    elevation: 16,
  },
  heroIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(18,100,230,0.12)',
  },
  title: {
    marginTop: 22,
    textAlign: 'center',
    fontSize: 27,
    lineHeight: 33,
    fontWeight: '900',
    color: theme.text,
    letterSpacing: -0.35,
  },
  intro: {
    marginTop: 18,
    fontSize: 16,
    lineHeight: 24,
    fontWeight: '500',
    color: theme.textSecondary,
  },
  infoGroup: {
    marginTop: 18,
    gap: 18,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
  },
  infoIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoText: {
    flex: 1,
    paddingTop: 1,
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '500',
    color: theme.textSecondary,
  },
  primary: {
    marginTop: 26,
    minHeight: 58,
    borderRadius: 17,
    backgroundColor: '#0B5FE4',
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
    shadowColor: '#0B5FE4',
    shadowOpacity: 0.24,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  disabled: { opacity: 0.58 },
  primaryText: {
    color: '#FFFFFF',
    fontSize: 16,
    lineHeight: 21,
    fontWeight: '900',
    textAlign: 'center',
  },
  secondary: {
    minHeight: 54,
    marginTop: 12,
    borderRadius: 17,
    borderWidth: 1.5,
    borderColor: theme.border,
    backgroundColor: theme.surface,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  webCheckAgain: { marginTop: 26 },
  secondaryText: {
    color: theme.text,
    fontSize: 16,
    lineHeight: 21,
    fontWeight: '900',
  },
});