import React from 'react';
import { Modal, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Feather from '@expo/vector-icons/Feather';

const COPY = {
  RU: {
    title: 'Отслеживать рейс',
    intro: 'Во время активного рейса UrTruck передаёт местоположение автомобиля грузоотправителю, чтобы он видел движение груза на карте.',
    background: 'Передача может продолжаться, когда приложение свёрнуто или экран выключен, через системный сервис активного рейса.',
    stop: 'Передача прекращается после завершения или отмены рейса.',
    continue: 'Разрешить и начать рейс',
    notNow: 'Не сейчас',
    settingsTitle: Platform.OS === 'web' ? 'Разрешите геолокацию в браузере' : 'Разрешите геолокацию для рейса',
    settingsBody: Platform.OS === 'web'
      ? 'Чтобы начать рейс, разрешите UrTruck доступ к местоположению для этого сайта в настройках браузера.'
      : 'Чтобы начать рейс и передавать положение машины во время перевозки, разрешите UrTruck доступ к геолокации «Всегда».',
    settingsHint: Platform.OS === 'android'
      ? 'Откройте настройки UrTruck → Разрешения → Геолокация → Разрешить всегда. На Android сначала может появиться «При использовании приложения» — выберите его, затем включите «Всегда» в настройках.'
      : Platform.OS === 'web'
        ? 'Откройте настройки сайта в браузере, разрешите «Местоположение», вернитесь в UrTruck и нажмите «Проверить ещё раз».'
        : 'В настройках разрешите доступ к геолокации.',
    openSettings: 'Открыть настройки',
    checkAgain: 'Проверить ещё раз',
  },
  EN: {
    title: 'Track trip',
    intro: 'During an active trip, UrTruck shares the vehicle location with the shipper so they can follow the cargo on the map.',
    background: 'Sharing can continue while the app is minimized or the screen is off through the active-trip system service.',
    stop: 'Location sharing stops when the trip is completed or cancelled.',
    continue: 'Allow and start trip',
    notNow: 'Not now',
    settingsTitle: Platform.OS === 'web' ? 'Allow location in your browser' : 'Allow trip location',
    settingsBody: Platform.OS === 'web'
      ? 'To start the trip, allow location access for this site in your browser settings.'
      : 'To start the trip and share the vehicle position during transport, allow UrTruck location access “all the time”.',
    settingsHint: Platform.OS === 'android'
      ? 'Open UrTruck settings → Permissions → Location → Allow all the time. Android may first show “While using the app”; choose it, then enable “All the time” in settings.'
      : Platform.OS === 'web'
        ? 'Open this site’s browser permissions, allow Location, return to UrTruck, then tap “Check again”.'
        : 'Allow location access in settings.',
    openSettings: 'Open settings',
    checkAgain: 'Check again',
  },
  ZH: {
    title: '追踪运输',
    intro: '运输进行期间，UrTruck 会向货主共享车辆位置，以便货主在地图上查看货物运输进度。',
    background: '应用最小化或屏幕关闭后，可通过运输期间的系统服务继续共享位置。',
    stop: '运输完成或取消后将停止共享位置。',
    continue: '允许并开始运输',
    notNow: '暂不',
    settingsTitle: Platform.OS === 'web' ? '请在浏览器中允许位置权限' : '允许运输位置权限',
    settingsBody: Platform.OS === 'web'
      ? '要开始运输，请在浏览器的网站权限中允许 UrTruck 使用位置。'
      : '为了开始运输并在运输期间共享车辆位置，请允许 UrTruck 始终访问位置。',
    settingsHint: Platform.OS === 'android'
      ? '打开 UrTruck 设置 → 权限 → 位置 → 始终允许。Android 可能先显示“使用应用期间”；请先选择它，再到设置中开启“始终允许”。'
      : Platform.OS === 'web'
        ? '打开浏览器的网站权限，允许“位置”，返回 UrTruck 后点击“再次检查”。'
        : '请在设置中允许位置访问。',
    openSettings: '打开设置',
    checkAgain: '再次检查',
  },
  KK: {
    title: 'Рейсті бақылау',
    intro: 'Белсенді рейс кезінде UrTruck жүк иесі картадан жүктің қозғалысын көруі үшін көліктің геолокациясын береді.',
    background: 'Қолданба жиналғанда немесе экран өшкенде, рейстің жүйелік қызметі арқылы геолокация беру жалғаса алады.',
    stop: 'Рейс аяқталған немесе тоқтатылған кезде геолокация беру тоқтайды.',
    continue: 'Рұқсат беру және рейсті бастау',
    notNow: 'Қазір емес',
    settingsTitle: Platform.OS === 'web' ? 'Браузерде геолокацияға рұқсат беріңіз' : 'Рейс геолокациясына рұқсат беріңіз',
    settingsBody: Platform.OS === 'web'
      ? 'Рейсті бастау үшін браузердегі осы сайттың геолокация рұқсатын қосыңыз.'
      : 'Рейсті бастау және тасымал кезінде көліктің орнын беру үшін UrTruck-қа геолокацияға «Әрқашан» рұқсат беріңіз.',
    settingsHint: Platform.OS === 'android'
      ? 'UrTruck баптаулары → Рұқсаттар → Геолокация → Әрқашан рұқсат беру. Android алдымен «Қолдану кезінде» көрсетуі мүмкін; оны таңдап, кейін баптауда «Әрқашан» қосыңыз.'
      : Platform.OS === 'web'
        ? 'Браузердегі сайт рұқсаттарын ашып, геолокацияны қосыңыз, UrTruck-қа оралып «Қайта тексеру» батырмасын басыңыз.'
        : 'Баптауларда геолокацияға рұқсат беріңіз.',
    openSettings: 'Баптауларды ашу',
    checkAgain: 'Қайта тексеру',
  },
};

function InfoRow({ icon, iconColor, iconBackground, children }) {
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
              <InfoRow icon="settings" iconColor="#1264E6" iconBackground="#EDF4FF">
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
                <InfoRow icon="crosshair" iconColor="#1264E6" iconBackground="#EDF4FF">
                  {ui.background}
                </InfoRow>
                <InfoRow icon="shield" iconColor="#1DBB72" iconBackground="#ECFAF3">
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

const s = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(9, 14, 20, 0.60)',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  card: {
    width: '100%',
    maxWidth: 520,
    alignSelf: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 28,
    paddingHorizontal: 24,
    paddingTop: 30,
    paddingBottom: 20,
    shadowColor: '#000000',
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
    backgroundColor: '#F2F6FC',
  },
  title: {
    marginTop: 22,
    textAlign: 'center',
    fontSize: 27,
    lineHeight: 33,
    fontWeight: '900',
    color: '#10151D',
    letterSpacing: -0.35,
  },
  intro: {
    marginTop: 18,
    fontSize: 16,
    lineHeight: 24,
    fontWeight: '500',
    color: '#27313D',
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
    color: '#2B3440',
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
    borderColor: '#D8DDE5',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  webCheckAgain: { marginTop: 26 },
  secondaryText: {
    color: '#111820',
    fontSize: 16,
    lineHeight: 21,
    fontWeight: '900',
  },
});
