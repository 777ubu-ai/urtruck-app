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

export default function EditCargoModal({ visible, cargo, onClose, onSaved }) {
  const { t } = useI18n();
  const { theme } = useTheme();
  const { toast } = useToast();
  const [price, setPrice] = useState(String(cargo?.price ?? ''));
  const [desc, setDesc] = useState(String(cargo?.cargo_desc ?? ''));
  const [weight, setWeight] = useState(cargo?.weight_tons != null ? String(cargo.weight_tons) : '');
  const [volume, setVolume] = useState(cargo?.volume_m3 != null ? String(cargo.volume_m3) : '');
  const [saving, setSaving] = useState(false);

  // Пересинхронизация при смене груза (модалка переиспользуется).
  React.useEffect(() => {
    if (visible) {
      setPrice(String(cargo?.price ?? ''));
      setDesc(String(cargo?.cargo_desc ?? ''));
      setWeight(cargo?.weight_tons != null ? String(cargo.weight_tons) : '');
      setVolume(cargo?.volume_m3 != null ? String(cargo.volume_m3) : '');
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
    const payload = {
      cargo_desc: d,
      price: num(price) != null ? Math.round(num(price)) : 0,
      weight_tons: num(weight) ?? 0,
      volume_m3: num(volume) ?? 0,
    };
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

              <Text style={[s.label, { color: theme.textMuted }]}>{t('edit_cargo_price')}</Text>
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

              <TouchableOpacity
                onPress={onSave} disabled={saving}
                style={[s.save, { backgroundColor: '#F59E0B', opacity: saving ? 0.6 : 1 }]}
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
  save: { height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginTop: 20 },
  saveText: { color: '#0C0A09', fontSize: 16, fontWeight: '800' },
  cancel: { height: 44, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  cancelText: { fontSize: 14, fontWeight: '700' },
});
