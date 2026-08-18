import React from 'react';
import { Modal, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Feather from '@expo/vector-icons/Feather';

const COPY = {
  RU: {
    title: 'Геолокация во время рейса',
    body: 'UrTruck собирает данные о местоположении водителя во время активного рейса, в том числе в фоновом режиме и когда приложение закрыто или не используется, чтобы грузоотправитель мог видеть текущее положение машины и ход доставки.',
    note: 'Данные местоположения используются только во время активного рейса. Передача прекращается после завершения или отмены рейса.',
    continue: 'Продолжить',
    notNow: 'Не сейчас',
    settingsTitle: 'Разрешите работу геолокации в фоне',
    settingsBody: 'Чтобы UrTruck продолжал передавать положение машины во время активного рейса, разрешите доступ к местоположению в настройках приложения.',
    settingsHint: Platform.OS === 'android' ? 'В настройках выберите доступ к местоположению «Разрешить всегда», если такой вариант доступен.' : 'В настройках разрешите доступ к геолокации всегда.',
    openSettings: 'Открыть настройки',
    checkAgain: 'Проверить ещё раз',
  },
  EN: {
    title: 'Location during a trip',
    body: 'UrTruck collects the driver’s location during an active trip, including in the background and when the app is closed or not in use, so the shipper can see the vehicle’s current position and delivery progress.',
    note: 'Location data is used only during an active trip. Sharing stops when the trip is completed or cancelled.',
    continue: 'Continue',
    notNow: 'Not now',
    settingsTitle: 'Allow background location',
    settingsBody: 'To keep sharing the vehicle position during an active trip, allow location access in the app settings.',
    settingsHint: 'Choose “Allow all the time” for location if the option is available.',
    openSettings: 'Open settings',
    checkAgain: 'Check again',
  },
  ZH: {
    title: '运输期间的位置权限',
    body: 'UrTruck 会在运输进行期间收集司机的位置数据，包括应用在后台运行、关闭或未使用时，以便货主查看车辆当前位置和运输进度。',
    note: '位置数据仅在运输进行期间使用。运输完成或取消后将停止共享位置。',
    continue: '继续',
    notNow: '暂不',
    settingsTitle: '允许后台位置权限',
    settingsBody: '为了在运输期间持续共享车辆位置，请在应用设置中允许位置访问。',
    settingsHint: '如果系统提供该选项，请选择“始终允许”。',
    openSettings: '打开设置',
    checkAgain: '再次检查',
  },
  KK: {
    title: 'Рейс кезіндегі геолокация',
    body: 'UrTruck белсенді рейс кезінде жүргізушінің орналасқан жері туралы деректерді, соның ішінде қолданба фонда, жабық немесе пайдаланылмай тұрған кезде де жинайды. Бұл жүк иесіне көліктің орнын және жеткізу барысын көруге мүмкіндік береді.',
    note: 'Геолокация тек белсенді рейс кезінде пайдаланылады. Рейс аяқталған немесе тоқтатылған кезде дерек беру тоқтайды.',
    continue: 'Жалғастыру',
    notNow: 'Қазір емес',
    settingsTitle: 'Фондық геолокацияға рұқсат беріңіз',
    settingsBody: 'Белсенді рейс кезінде көліктің орнын беруді жалғастыру үшін қолданба баптауларында геолокацияға рұқсат беріңіз.',
    settingsHint: 'Егер жүйеде болса, «Әрқашан рұқсат беру» нұсқасын таңдаңыз.',
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
