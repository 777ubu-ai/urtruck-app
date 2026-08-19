import React from 'react';
import { Modal, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Feather from '@expo/vector-icons/Feather';

const COPY = {
  RU: {
    title: 'Геолокация во время рейса',
    body: 'UrTruck использует геолокацию водителя только во время активного рейса, чтобы грузоотправитель видел текущее положение машины и ход доставки. На Android передача может продолжаться, когда приложение свёрнуто или экран выключен, через системный сервис с постоянным уведомлением.',
    note: 'Передача геолокации прекращается после завершения или отмены рейса. UrTruck не просит доступ «Разрешить всегда».',
    continue: 'Разрешить',
    notNow: 'Не сейчас',
    settingsTitle: 'Разрешите геолокацию для рейса',
    settingsBody: 'Чтобы передавать положение машины во время активного рейса, разрешите UrTruck доступ к местоположению в настройках приложения.',
    settingsHint: Platform.OS === 'android' ? 'В настройках включите доступ к местоположению для UrTruck. Во время активного рейса Android показывает постоянное системное уведомление.' : 'В настройках разрешите доступ к геолокации.',
    openSettings: 'Открыть настройки',
    checkAgain: 'Проверить ещё раз',
  },
  EN: {
    title: 'Location during a trip',
    body: 'UrTruck uses the driver’s location only during an active trip so the shipper can see the vehicle’s current position and delivery progress. On Android, sharing can continue while the app is minimized or the screen is off through a system foreground service with a persistent notification.',
    note: 'Location sharing stops when the trip is completed or cancelled. UrTruck does not ask for “Allow all the time” access on Android.',
    continue: 'Allow',
    notNow: 'Not now',
    settingsTitle: 'Allow trip location',
    settingsBody: 'To share the vehicle position during an active trip, allow UrTruck to access location in the app settings.',
    settingsHint: Platform.OS === 'android' ? 'Enable location access for UrTruck. Android shows a persistent system notification while active-trip location sharing is running.' : 'Allow location access in settings.',
    openSettings: 'Open settings',
    checkAgain: 'Check again',
  },
  ZH: {
    title: '运输期间的位置权限',
    body: 'UrTruck 仅在运输进行期间使用司机的位置，以便货主查看车辆当前位置和运输进度。在 Android 上，应用最小化或屏幕关闭后，可通过带有持续系统通知的前台服务继续共享位置。',
    note: '运输完成或取消后将停止共享位置。UrTruck 在 Android 上不会请求“始终允许”位置权限。',
    continue: '允许',
    notNow: '暂不',
    settingsTitle: '允许运输位置权限',
    settingsBody: '为了在运输期间共享车辆位置，请在应用设置中允许 UrTruck 使用位置。',
    settingsHint: Platform.OS === 'android' ? '请为 UrTruck 开启位置权限。运输期间的位置共享运行时，Android 会显示持续的系统通知。' : '请在设置中允许位置访问。',
    openSettings: '打开设置',
    checkAgain: '再次检查',
  },
  KK: {
    title: 'Рейс кезіндегі геолокация',
    body: 'UrTruck жүргізушінің геолокациясын тек белсенді рейс кезінде пайдаланады, сонда жүк иесі көліктің ағымдағы орнын және жеткізу барысын көре алады. Android-та қолданба жиналғанда немесе экран өшкенде, тұрақты жүйелік хабарламасы бар foreground service арқылы геолокация беру жалғаса алады.',
    note: 'Рейс аяқталған немесе тоқтатылған кезде геолокация беру тоқтайды. UrTruck Android-та «Әрқашан рұқсат беру» қолжетімділігін сұрамайды.',
    continue: 'Рұқсат беру',
    notNow: 'Қазір емес',
    settingsTitle: 'Рейс геолокациясына рұқсат беріңіз',
    settingsBody: 'Белсенді рейс кезінде көліктің орнын беру үшін қолданба баптауларында UrTruck-қа геолокацияға рұқсат беріңіз.',
    settingsHint: Platform.OS === 'android' ? 'UrTruck үшін геолокация рұқсатын қосыңыз. Белсенді рейс кезінде Android тұрақты жүйелік хабарлама көрсетеді.' : 'Баптауларда геолокацияға рұқсат беріңіз.',
    openSettings: 'Баптауларды ашу',
    checkAgain: 'Қайта тексеру',
  },
};

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

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={s.backdrop} testID="background-location-disclosure">
        <View style={s.card}>
          <View style={s.iconWrap}>
            <Feather name="map-pin" size={26} color="#168759" />
          </View>
          <Text style={s.title}>{settingsMode ? ui.settingsTitle : ui.title}</Text>
          <Text style={s.body}>{settingsMode ? ui.settingsBody : ui.body}</Text>
          <View style={s.noteBox}>
            <Feather name={settingsMode ? 'settings' : 'shield'} size={16} color="#168759" />
            <Text style={s.note}>{settingsMode ? ui.settingsHint : ui.note}</Text>
          </View>

          {settingsMode ? (
            <>
              <TouchableOpacity style={[s.primary, busy && s.disabled]} onPress={onOpenSettings} disabled={busy} testID="background-location-open-settings">
                <Text style={s.primaryText}>{ui.openSettings}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.secondary} onPress={onCheckAgain} disabled={busy} testID="background-location-check-again">
                <Text style={s.secondaryText}>{busy ? '…' : ui.checkAgain}</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <TouchableOpacity style={[s.primary, busy && s.disabled]} onPress={onContinue} disabled={busy} testID="background-location-disclosure-continue">
                <Text style={s.primaryText}>{busy ? '…' : ui.continue}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.secondary} onPress={onCancel} disabled={busy} testID="background-location-disclosure-cancel">
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
    backgroundColor: 'rgba(8,18,13,0.52)',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 22,
    paddingBottom: 16,
    shadowColor: '#000000',
    shadowOpacity: 0.18,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 10 },
    elevation: 14,
  },
  iconWrap: {
    width: 52,
    height: 52,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E9F6EF',
    marginBottom: 14,
  },
  title: { fontSize: 21, lineHeight: 27, fontWeight: '900', color: '#14221C' },
  body: { marginTop: 10, fontSize: 14.5, lineHeight: 21, fontWeight: '600', color: '#3F4E46' },
  noteBox: {
    marginTop: 14,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 9,
    paddingHorizontal: 12,
    paddingVertical: 11,
    borderRadius: 14,
    backgroundColor: '#F2F8F5',
  },
  note: { flex: 1, fontSize: 12.5, lineHeight: 18, fontWeight: '700', color: '#42544B' },
  primary: {
    marginTop: 18,
    minHeight: 52,
    borderRadius: 16,
    backgroundColor: '#168759',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  disabled: { opacity: 0.6 },
  primaryText: { color: '#FFFFFF', fontSize: 15.5, fontWeight: '900' },
  secondary: { minHeight: 46, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  secondaryText: { color: '#52645A', fontSize: 14, fontWeight: '800' },
});