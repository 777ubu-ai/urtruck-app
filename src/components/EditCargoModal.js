// EditCargoModal — правка своего груза (задача A): цена / описание / вес / объём.
// Открывается с карточки «Мои грузы» у грузоотправителя. Сервер блокирует
// правку, если груз уже не active или есть принятая сделка (показываем тост).
import React, { useState } from 'react';
import {
  Modal, View, Text, TextInput, TouchableOpacity, Pressable,
  StyleSheet, KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator,
} from 'react-native';
import { useI18n } from '../utils/useI18n';
import { useTheme } from '../utils/ThemeContext';
import { useToast } from './Toast';
import { marketAPI } from '../utils/marketAPI';
import { CURRENCY_SYMBOLS } from '../utils/normalizers';
import { TRUCK_KEYS } from '../utils/truckConstants';
import Feather from '@expo/vector-icons/Feather';
import DatePicker from './DatePicker';
import { formatDateForDisplay, normalizeDateInput } from '../utils/dateInput';

const PAY_KEYS = ['cashless', 'cash', 'any'];

export default function EditCargoModal({ visible, cargo, onClose, onSaved }) {
  const { t } = useI18n();
  const { theme } = useTheme();
  const { toast } = useToast();
  // Символ валюты — из самого груза (USD→$, EUR→€…), не хардкод ₸.
  // Для legacy-валюты без символа показываем ISO-код, а не чужой '$'.
  const curCode = String(cargo?.currency || 'USD').toUpperCase();
  const curSym = CURRENCY_SYMBOLS[curCode] || curCode;
  const [price, setPrice] = useState(String(cargo?.price ?? ''));
  const [desc, setDesc] = useState(String(cargo?.cargo_desc ?? ''));
  const [weight, setWeight] = useState(cargo?.weight_tons != null ? String(cargo.weight_tons) : '');
  const [volume, setVolume] = useState(cargo?.volume_m3 != null ? String(cargo.volume_m3) : '');
  // 2.10: теперь можно править и тип кузова, и тип оплаты (раньше — только
  // цена/описание/вес/объём, из-за чего груз приходилось удалять и создавать).
  const [truckType, setTruckType] = useState(cargo?.cargo_type || 'tent');
  const [paymentType, setPaymentType] = useState(cargo?.payment_type || '');
  // Дата выезда — чтобы владелец мог «продлить» просроченный груз.
  const [pickupDate, setPickupDate] = useState(cargo?.pickup_date ? formatDateForDisplay(cargo.pickup_date) : '');
  const [saving, setSaving] = useState(false);

  // Пересинхронизация при смене груза (модалка переиспользуется).
  React.useEffect(() => {
    if (visible) {
      setPrice(String(cargo?.price ?? ''));
      setDesc(String(cargo?.cargo_desc ?? ''));
      setWeight(cargo?.weight_tons != null ? String(cargo.weight_tons) : '');
      setVolume(cargo?.volume_m3 != null ? String(cargo.volume_m3) : '');
      setTruckType(cargo?.cargo_type || 'tent');
      setPaymentType(cargo?.payment_type || '');
      setPickupDate(cargo?.pickup_date ? formatDateForDisplay(cargo.pickup_date) : '');
    }
  }, [visible, cargo]);

  const num = (s) => {
    const v = parseFloat(String(s).replace(',', '.'));
    return isNaN(v) ? null : v;
  };

  const onSave = async () => {
    if (!cargo?.id) return;
    const d = desc.trim();
    if (!d) { toast(t('edit_cargo_desc_required'), 'error'); return; }
    // Числовые поля включаем в payload только если они реально заполнены.
    // Раньше пустое price/weight/volume уходило как 0 → можно было случайно
    // обнулить цену груза, просто очистив поле.
    const payload = { cargo_desc: d };
    // Цена обязательна и при редактировании (иначе через 0 возвращалась
    // «По договорённости» — обход нового правила). price > 0 обязателен.
    const pv = num(price);
    if (!price.trim() || pv == null || pv <= 0) { toast(t('val_price_required'), 'error'); return; }
    payload.price = Math.round(pv);
    if (weight.trim() !== '' && num(weight) != null) payload.weight_tons = num(weight);
    if (volume.trim() !== '' && num(volume) != null) payload.volume_m3 = num(volume);
    if (truckType) payload.cargo_type = truckType;
    payload.payment_type = paymentType || '';  // '' → бэк снимет тип оплаты
    // Дата выезда: нормализуем в ISO (как create_cargo/feed-фильтр ожидает).
    if (pickupDate.trim()) {
      const iso = normalizeDateInput(pickupDate);
      if (iso) payload.pickup_date = iso;
    }
    setSaving(true);
    const r = await marketAPI.updateCargo(cargo.id, payload);
    setSaving(false);
    if (r.ok) {
      toast(t('edit_cargo_saved'), 'success');
      onSaved?.();
      onClose?.();
    } else {
      toast(r.detail || t('edit_cargo_failed'), 'error');
    }
  };

  return (
    <Modal transparent visible={visible} animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={[s.backdrop, { backgroundColor: theme.overlay || 'rgba(0,0,0,0.5)' }]} onPress={onClose}>
          <Pressable style={[s.sheet, { backgroundColor: theme.cardElevated || theme.card }]} onPress={(e) => e.stopPropagation()}>
            <View style={[s.handle, { backgroundColor: theme.border }]} />
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <Text style={[s.title, { color: theme.text }]}>{t('edit_cargo_title')}</Text>

              <Text style={[s.label, { color: theme.textMuted }]}>{t('edit_cargo_price')} ({curSym})</Text>
              <TextInput
                value={price} onChangeText={setPrice} keyboardType="numeric"
                placeholder="0" placeholderTextColor={theme.textMuted}
                style={[s.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.bg }]}
                testID="edit-cargo-price"
              />

              <Text style={[s.label, { color: theme.textMuted }]}>{t('edit_cargo_desc')}</Text>
              <TextInput
                value={desc} onChangeText={setDesc} multiline
                placeholder={t('desc_not_specified')} placeholderTextColor={theme.textMuted}
                style={[s.input, s.multiline, { color: theme.text, borderColor: theme.border, backgroundColor: theme.bg }]}
                testID="edit-cargo-desc"
              />

              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Feather name="calendar" size={14} color={theme.textMuted} />
                <Text style={[s.label, { color: theme.textMuted }]}>{t('pickupDate')}</Text>
              </View>
              <DatePicker value={pickupDate} onChange={setPickupDate} placeholder={t('pickupDate')} />

              <View style={s.row}>
                <View style={{ flex: 1 }}>
                  <Text style={[s.label, { color: theme.textMuted }]}>{t('edit_cargo_weight')}</Text>
                  <TextInput
                    value={weight} onChangeText={setWeight} keyboardType="numeric"
                    placeholder="0" placeholderTextColor={theme.textMuted}
                    style={[s.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.bg }]}
                    testID="edit-cargo-weight"
                  />
                </View>
                <View style={{ width: 12 }} />
                <View style={{ flex: 1 }}>
                  <Text style={[s.label, { color: theme.textMuted }]}>{t('edit_cargo_volume')}</Text>
                  <TextInput
                    value={volume} onChangeText={setVolume} keyboardType="numeric"
                    placeholder="0" placeholderTextColor={theme.textMuted}
                    style={[s.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.bg }]}
                    testID="edit-cargo-volume"
                  />
                </View>
              </View>

              <Text style={[s.label, { color: theme.textMuted }]}>{t('truckType')}</Text>
              <View style={s.chipsWrap}>
                {TRUCK_KEYS.map((k) => (
                  <TouchableOpacity
                    key={k}
                    style={[s.chip, { borderColor: truckType === k ? '#FF8400' : theme.border, backgroundColor: truckType === k ? '#FF840022' : theme.bg }]}
                    onPress={() => setTruckType(k)}
                  >
                    <Text style={[s.chipText, { color: truckType === k ? '#FF8400' : theme.textMuted }]}>{t(k)}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={[s.label, { color: theme.textMuted }]}>{t('payment_type_label')}</Text>
              <View style={s.chipsWrap}>
                {PAY_KEYS.map((k) => (
                  <TouchableOpacity
                    key={k}
                    style={[s.chip, { borderColor: paymentType === k ? '#FF8400' : theme.border, backgroundColor: paymentType === k ? '#FF840022' : theme.bg }]}
                    onPress={() => setPaymentType(paymentType === k ? '' : k)}
                  >
                    <Text style={[s.chipText, { color: paymentType === k ? '#FF8400' : theme.textMuted }]}>{t('pay_' + k)}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <TouchableOpacity
                onPress={onSave} disabled={saving}
                style={[s.save, { backgroundColor: '#FF8400', opacity: saving ? 0.6 : 1 }]}
                testID="edit-cargo-save"
              >
                {saving ? <ActivityIndicator color="#0C0A09" /> : <Text style={s.saveText}>{t('edit_cargo_save')}</Text>}
              </TouchableOpacity>
              <TouchableOpacity onPress={onClose} style={s.cancel}>
                <Text style={[s.cancelText, { color: theme.textMuted }]}>{t('cancel')}</Text>
              </TouchableOpacity>
            </ScrollView>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 28, maxHeight: '88%' },
  handle: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 14 },
  title: { fontSize: 20, fontWeight: '900', marginBottom: 14 },
  label: { fontSize: 12, fontWeight: '700', marginBottom: 6, marginTop: 10 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15 },
  multiline: { minHeight: 64, textAlignVertical: 'top' },
  row: { flexDirection: 'row' },
  chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  chip: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, borderWidth: 1, minHeight: 40, justifyContent: 'center' },
  chipText: { fontSize: 13, fontWeight: '700' },
  save: { height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginTop: 20 },
  saveText: { color: '#0C0A09', fontSize: 16, fontWeight: '800' },
  cancel: { height: 44, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  cancelText: { fontSize: 14, fontWeight: '700' },
});
