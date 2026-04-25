import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Modal, ActivityIndicator } from 'react-native';
import { useI18n } from '../utils/useI18n';
import { useTheme } from '../utils/ThemeContext';
import { useToast } from './Toast';
import { marketAPI } from '../utils/marketAPI';

export default function BidModal({ visible, onClose, onSubmit, currentPrice = 3000, cargoId, tripId }) {
  const [bid, setBid] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const { t } = useI18n();
  const { theme } = useTheme();
  const { toast } = useToast();

  const quickPrices = [currentPrice, currentPrice + 200, currentPrice + 400];

  const handleSubmit = async () => {
    if (!bid) return;
    setLoading(true);
    try {
      // Серверная ставка
      const r = await marketAPI.createBid({
        cargo_id: cargoId || null,
        trip_id: tripId || null,
        amount: parseInt(bid),
        message: message.trim() || null,
      });
      if (r.ok) {
        toast('✓ Предложение отправлено владельцу', 'success');
        onSubmit?.(parseInt(bid));
        setBid('');
        setMessage('');
        onClose();
      } else {
        toast(r.detail || t('send_error'), 'error');
      }
    } catch (e) {
      toast(t('network_error'), 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={s.overlay} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity style={[s.sheet, { backgroundColor: theme.bg, borderColor: theme.border }]} activeOpacity={1} onPress={() => {}}>
          <View style={s.handle} />
          <Text style={[s.title, { color: theme.text }]}>{t('suggestPrice')}</Text>
          <Text style={[s.subtitle, { color: theme.textMuted }]}>{t('avgPrice')}: ${currentPrice - 200}–${currentPrice + 400}</Text>

          <View style={s.quickRow}>
            {quickPrices.map((p) => (
              <TouchableOpacity
                key={p}
                style={[s.quickBtn, { backgroundColor: theme.card, borderColor: theme.border }, bid === String(p) && s.quickBtnActive]}
                onPress={() => setBid(String(p))}
              >
                <Text style={[s.quickBtnText, { color: theme.textSecondary }, bid === String(p) && s.quickBtnTextActive]}>
                  ${p}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={[s.inputWrap, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Text style={[s.dollar, { color: theme.textMuted }]}>$</Text>
            <TextInput
              style={[s.input, { color: theme.text }]}
              value={bid}
              onChangeText={setBid}
              placeholder={t('ownPrice')}
              placeholderTextColor={theme.textMuted}
              keyboardType="numeric"
            />
          </View>

          <TextInput
            style={[s.messageInput, { backgroundColor: theme.card, color: theme.text, borderColor: theme.border }]}
            value={message}
            onChangeText={setMessage}
            placeholder="Комментарий (необязательно)"
            placeholderTextColor={theme.textMuted}
            maxLength={200}
          />

          <TouchableOpacity
            style={[s.submitBtn, (!bid || loading) && s.submitBtnDisabled]}
            onPress={handleSubmit}
            disabled={!bid || loading}
          >
            {loading ? <ActivityIndicator color="#fff" /> : (
              <Text style={s.submitBtnText}>{t('sendBid')}</Text>
            )}
          </TouchableOpacity>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 40, borderWidth: 1 },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: '#44403C', alignSelf: 'center', marginBottom: 18 },
  title: { fontSize: 20, fontWeight: '800', marginBottom: 4 },
  subtitle: { fontSize: 12, marginBottom: 18 },
  quickRow: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  quickBtn: { flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: 'center', borderWidth: 1 },
  quickBtnActive: { backgroundColor: '#22C55E18', borderColor: '#22C55E' },
  quickBtnText: { fontSize: 15, fontWeight: '700' },
  quickBtnTextActive: { color: '#22C55E' },
  inputWrap: { flexDirection: 'row', alignItems: 'center', borderRadius: 14, borderWidth: 1, marginBottom: 10, paddingHorizontal: 14 },
  dollar: { fontSize: 18, fontWeight: '700', marginRight: 4 },
  input: { flex: 1, fontSize: 18, fontWeight: '700', paddingVertical: 16 },
  messageInput: { borderWidth: 1, borderRadius: 12, padding: 12, fontSize: 14, marginBottom: 14 },
  submitBtn: { backgroundColor: '#22C55E', borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
  submitBtnDisabled: { backgroundColor: '#292524' },
  submitBtnText: { color: '#fff', fontSize: 16, fontWeight: '800' },
});
