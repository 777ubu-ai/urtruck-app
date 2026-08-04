// contactPartner — единая логика «позвонить контрагенту» (WhatsApp/Telegram/
// звонок), вынесена из ChatScreen.js (05.08.2026, п.6/17 ТЗ) — теперь нужна
// не только в самом чате, но и на CargoDetail/TripDetail для secondary-кнопки
// «Позвонить», которая видна ТОЛЬКО после accept (номер до сделки не отдаёт
// и backend — см. get_deal() в marketplace.py, counterparty_phone гейтится
// участием в сделке).
//
// wa.me требует только цифры (без +); tel: — с плюсом. На web Alert-выбор не
// поддерживается — сразу открываем WhatsApp (для китайского направления он
// нужнее).
import { Alert, Linking, Platform } from 'react-native';

export function openContactPartner(rawPhone, t) {
  const phone = String(rawPhone || '').replace(/[^\d+]/g, '');
  if (!phone) return;
  const waNumber = phone.replace(/[^\d]/g, '');
  const openWa = () => Linking.openURL(`https://wa.me/${waNumber}`).catch(() => {});
  // Telegram открывается по номеру: tg://resolve?phone= (мобильные),
  // с фолбэком на https://t.me/+<номер> для web/если приложение не стоит.
  // Viber убран по решению владельца (не используем). WeChat по номеру
  // открыть нельзя — у него нет deep-link на чат по телефону.
  const openTg = () =>
    Linking.openURL(`tg://resolve?phone=${waNumber}`)
      .catch(() => Linking.openURL(`https://t.me/+${waNumber}`).catch(() => {}));
  const openTel = () => Linking.openURL(`tel:${phone}`).catch(() => {});
  if (Platform.OS === 'web') { openWa(); return; }
  Alert.alert(t('contact_choose_title'), phone, [
    { text: t('contact_whatsapp'), onPress: openWa },
    { text: t('contact_telegram'), onPress: openTg },
    { text: t('contact_call'), onPress: openTel },
    { text: t('contact_cancel'), style: 'cancel' },
  ]);
}
