import React, { useMemo } from 'react';
import { Linking, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import * as Clipboard from 'expo-clipboard';
import { useI18n } from '../../utils/useI18n';
import { useTheme } from '../../utils/ThemeContext';
import { useToast } from '../../components/Toast';

export const CARRIER_COPY = {
  RU: { title: 'Перевозчики', open: 'Контакты перевозчиков', availability: 'Доступность уточняйте', type: 'Контакт перевозчика', driver: 'Контакт водителя', unknownName: 'Перевозчик', search: 'Компания, город или тип транспорта', find: 'Найти', copy: 'Копировать телефон', copied: 'Телефон скопирован', call: 'Позвонить', source: 'Источник', total: 'Контактов', empty: 'Контактов по запросу нет', error: 'Не удалось загрузить контакты', retry: 'Повторить', back: 'Назад к объявлениям', phoneError: 'Не удалось открыть звонок', copyError: 'Не удалось скопировать телефон', note: 'Контакты перевозчиков. Наличие свободной машины уточняйте по телефону.' },
  KK: { title: 'Тасымалдаушылар', open: 'Тасымалдаушы байланыстары', availability: 'Қолжетімділігін нақтылаңыз', type: 'Тасымалдаушы байланысы', driver: 'Жүргізуші байланысы', unknownName: 'Тасымалдаушы', search: 'Компания, қала немесе көлік түрі', find: 'Іздеу', copy: 'Телефонды көшіру', copied: 'Телефон көшірілді', call: 'Қоңырау шалу', source: 'Дереккөз', total: 'Байланыстар', empty: 'Сұрау бойынша байланыс жоқ', error: 'Байланыстар жүктелмеді', retry: 'Қайталау', back: 'Хабарландыруларға қайту', phoneError: 'Қоңырау ашылмады', copyError: 'Телефон көшірілмеді', note: 'Тасымалдаушылардың байланыстары. Бос көлік бар-жоғын телефон арқылы нақтылаңыз.' },
  ZH: { title: '承运商', open: '承运商联系方式', availability: '请确认车辆是否可用', type: '承运商联系方式', driver: '司机联系方式', unknownName: '承运商', search: '公司、城市或车型', find: '搜索', copy: '复制电话', copied: '电话已复制', call: '拨打电话', source: '来源', total: '联系方式', empty: '没有符合条件的联系方式', error: '无法加载联系方式', retry: '重试', back: '返回信息列表', phoneError: '无法拨打电话', copyError: '无法复制电话', note: '承运商联系方式。请致电确认是否有空车。' },
  EN: { title: 'Carriers', open: 'Carrier contacts', availability: 'Confirm availability', type: 'Carrier contact', driver: 'Driver contact', unknownName: 'Carrier', search: 'Company, city or vehicle type', find: 'Search', copy: 'Copy phone', copied: 'Phone copied', call: 'Call', source: 'Source', total: 'Contacts', empty: 'No matching contacts', error: 'Could not load contacts', retry: 'Retry', back: 'Back to listings', phoneError: 'Could not open the call', copyError: 'Could not copy the phone', note: 'Carrier contacts. Call to confirm whether a truck is available.' },
};

export default function CarrierContactCard({ item }) {
  const { lang, sp } = useI18n();
  const { theme } = useTheme();
  const { toast } = useToast();
  const l = CARRIER_COPY[lang] || CARRIER_COPY.EN;
  const styles = useMemo(() => makeStyles(theme, sp), [theme, lang]);
  const copy = async value => {
    try { await Clipboard.setStringAsync(value); toast(l.copied, 'success'); }
    catch { toast(l.copyError, 'error'); }
  };
  const call = async value => {
    try { await Linking.openURL(`tel:${value}`); }
    catch { toast(l.phoneError, 'error'); }
  };
  return <View style={styles.card} testID="carrier-directory-card">
    <Text style={styles.type}>{item.record_type === 'carrier' ? l.type : l.driver}</Text>
    <Text style={styles.name}>{item.name || l.unknownName}</Text>
    <Text style={styles.meta}>{[item.city, item.country, item.transport_type].filter(Boolean).join(' · ')}</Text>
    <Text style={styles.availability}>{l.availability}</Text>
    {item.phones.map(phone => <View key={phone} style={styles.phoneRow}>
      <TouchableOpacity style={styles.phoneButton} accessibilityRole="button" accessibilityLabel={`${l.call} ${phone}`} onPress={() => call(phone)}>
        <Feather name="phone" size={17} color="#168759" /><Text selectable style={styles.phone}>{phone}</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.copy} accessibilityRole="button" accessibilityLabel={l.copy} onPress={() => copy(phone)}><Feather name="copy" size={18} color={theme.text} /></TouchableOpacity>
    </View>)}
    {item.sources.length ? <Text style={styles.meta}>{l.source}: {item.sources.join(', ')}</Text> : null}
  </View>;
}

function makeStyles(theme, sp) {
  return StyleSheet.create({
    card: { backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border, borderRadius: 18, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 7, gap: 3 },
    type: { fontSize: sp(11), lineHeight: sp(16), color: theme.textMuted }, name: { color: theme.text, fontSize: sp(15), lineHeight: sp(20), fontWeight: '700' }, meta: { color: theme.textMuted, fontSize: sp(12), lineHeight: sp(17), flexShrink: 1 },
    availability: { color: theme.text, fontSize: sp(12), lineHeight: sp(17) }, phoneRow: { flexDirection: 'row', alignItems: 'center', gap: 8 }, phoneButton: { flex: 1, minWidth: 0, minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8 }, phone: { color: '#168759', fontSize: sp(13), lineHeight: sp(18), flexShrink: 1 },
    copy: { minHeight: 44, width: 44, alignItems: 'center', justifyContent: 'center' },
  });
}
