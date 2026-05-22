import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Modal, ActivityIndicator } from 'react-native';
import { useI18n } from '../utils/useI18n';
import { useTheme } from '../utils/ThemeContext';
import { useToast } from './Toast';
import { marketAPI } from '../utils/marketAPI';

/**
 * BidModal supports four modes:
 *   - 'create'   — POST /bids (default; existing behaviour)
 *   - 'edit'     — PATCH /bids/{id} with arbitrary new amount/message
 *   - 'discount' — same PATCH, but pre-fills initialAmount and shows -$50/-$100/-$200 chips
 *   - 'counter'  — POST /bids/{id}/counter (cargo/trip owner sends counter-offer)
 *
 * Required for non-create modes: bidId, initialAmount.
 */
export default function BidModal({
  visible, onClose, onSubmit,
  mode = 'create',
  currentPrice = 3000,
  cargoId, tripId,
  bidId,
  initialAmount,
  initialMessage,
}) {
  const isCounter = mode === 'counter';
  const isEdit = mode === 'edit' || mode === 'discount';
  const isDiscount = mode === 'discount';
  const isPrefill = isEdit || isCounter;
  const baseAmount = isPrefill ? Number(initialAmount) || 0 : 0;

  const [bid, setBid] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { t } = useI18n();
  const { theme } = useTheme();
  const { toast } = useToast();

  // Re-seed inputs every time the modal becomes visible or the source bid changes.
  useEffect(() => {
    if (!visible) return;
    setError('');
    if (isPrefill) {
      // For counter we leave the amount empty so the owner has to type a new
      // number — pre-filling with bidder's amount would be misleading.
      setBid(isEdit && baseAmount ? String(baseAmount) : '');
      setMessage(isEdit ? (initialMessage || '') : '');
    } else {
      setBid('');
      setMessage('');
    }
  }, [visible, mode, bidId, initialAmount, initialMessage]);

  // PR-A re-apply (P0-3 BidModal $0 / negotiable): когда у груза нет
  // цены (price=null/0 → currentPrice=0), кнопки [$0, $200, $400]
  // визуально предлагали отправить $0. Frontend validate amountInt > 0
  // (см. handleSubmit) уже блокирует submit, но $0 кнопка вводила в
  // заблуждение. При currentPrice<=0 — quick-prices не рендерим, юзер
  // вводит сумму вручную.
  const hasBasePrice = Number(currentPrice) > 0;
  const createQuickPrices = hasBasePrice
    ? [currentPrice, currentPrice + 200, currentPrice + 400]
    : [];
  const discountSteps = [50, 100, 200];

  const handleSubmit = async () => {
    if (!bid || loading) return;
    const amountInt = parseInt(bid, 10);
    if (!Number.isFinite(amountInt) || amountInt <= 0) {
      setError(t('bid_amount_invalid'));
      return;
    }
    setLoading(true);
    setError('');
    try {
      let r;
      if (isCounter) {
        r = await marketAPI.counterBid(bidId, {
          amount: amountInt,
          message: message.trim() || null,
        });
      } else if (isEdit) {
        const payload = { amount: amountInt };
        // Send message only if user changed it from the original — avoids overwriting.
        if (message !== (initialMessage || '')) payload.message = message.trim() || null;
        r = await marketAPI.updateBid(bidId, payload);
      } else {
        r = await marketAPI.createBid({
          cargo_id: cargoId || null,
          trip_id: tripId || null,
          amount: amountInt,
          message: message.trim() || null,
        });
      }
      if (r.ok) {
        onSubmit?.(amountInt);
        onClose();
        const okMsg = isCounter ? t('counter_sent')
                    : isDiscount ? t('bid_discount_sent')
                    : isEdit     ? t('bid_updated')
                                 : t('bidSent');
        toast('✓ ' + okMsg, 'success');
      } else if (r.status === 401) {
        setError(t('session_expired'));
      } else if (r.status === 409) {
        setError(r.detail || t('bid_not_pending'));
      } else {
        setError(r.detail || t('bid_failed'));
      }
    } catch (e) {
      setError(t('no_connection'));
    } finally {
      setLoading(false);
    }
  };

  const title = isCounter ? t('counter_offer')
              : isDiscount ? t('give_discount')
              : isEdit     ? t('edit_bid')
                           : t('suggestPrice');

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={s.overlay} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity style={[s.sheet, { backgroundColor: theme.bg, borderColor: theme.border }]} activeOpacity={1} onPress={() => {}}>
          <View style={s.handle} />
          <Text style={[s.title, { color: theme.text }]}>{title}</Text>
          {!isPrefill && (
            // PR-A re-apply (P0-3): когда у груза нет цены, бессмысленно
            // показывать диапазон "$-200–$400" — даём honest текст
            // «По договорённости».
            hasBasePrice ? (
              <Text style={[s.subtitle, { color: theme.textMuted }]}>{t('avgPrice')}: ${currentPrice - 200}–${currentPrice + 400}</Text>
            ) : (
              <Text style={[s.subtitle, { color: theme.textMuted }]}>{t('payment_negotiable')}</Text>
            )
          )}
          {(isDiscount || isCounter) && baseAmount > 0 && (
            <Text style={[s.subtitle, { color: theme.textMuted }]}>
              {isCounter ? t('driver_offered') : t('current_price_label')}: ${baseAmount}
            </Text>
          )}

          <View style={s.quickRow}>
            {!isPrefill && createQuickPrices.map((p) => (
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
            {isDiscount && discountSteps.map((step) => {
              const next = Math.max(1, baseAmount - step);
              return (
                <TouchableOpacity
                  key={step}
                  style={[s.quickBtn, { backgroundColor: theme.card, borderColor: theme.border }, bid === String(next) && s.quickBtnActive]}
                  onPress={() => setBid(String(next))}
                >
                  <Text style={[s.quickBtnText, { color: theme.textSecondary }, bid === String(next) && s.quickBtnTextActive]}>
                    -${step}
                  </Text>
                </TouchableOpacity>
              );
            })}
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
            placeholder={t('comment_optional')}
            placeholderTextColor={theme.textMuted}
            maxLength={200}
          />

          {error ? <Text style={s.errorText}>{error}</Text> : null}

          <TouchableOpacity
            style={[s.submitBtn, (!bid || loading) && s.submitBtnDisabled]}
            onPress={handleSubmit}
            disabled={!bid || loading}
          >
            {loading ? <ActivityIndicator color="#fff" /> : (
              <Text style={s.submitBtnText}>
                {isCounter ? t('send_counter_offer')
                  : isDiscount ? t('send_discount')
                  : isEdit ? t('save_changes')
                  : t('sendBid')}
              </Text>
            )}
          </TouchableOpacity>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 50, borderWidth: 1 },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: '#44403C', alignSelf: 'center', marginBottom: 18 },
  title: { fontSize: 20, fontWeight: '800', marginBottom: 4 },
  subtitle: { fontSize: 12, marginBottom: 6 },
  quickRow: { flexDirection: 'row', gap: 8, marginBottom: 14, marginTop: 10 },
  quickBtn: { flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: 'center', borderWidth: 1 },
  quickBtnActive: { backgroundColor: '#22C55E18', borderColor: '#22C55E' },
  quickBtnText: { fontSize: 15, fontWeight: '700' },
  quickBtnTextActive: { color: '#22C55E' },
  inputWrap: { flexDirection: 'row', alignItems: 'center', borderRadius: 14, borderWidth: 1, marginBottom: 10, paddingHorizontal: 14 },
  dollar: { fontSize: 18, fontWeight: '700', marginRight: 4 },
  input: { flex: 1, fontSize: 18, fontWeight: '700', paddingVertical: 16 },
  messageInput: { borderWidth: 1, borderRadius: 12, padding: 12, fontSize: 14, marginBottom: 14 },
  errorText: { color: '#EF4444', fontSize: 13, textAlign: 'center', marginBottom: 10 },
  submitBtn: { backgroundColor: '#22C55E', borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
  submitBtnDisabled: { backgroundColor: '#292524' },
  submitBtnText: { color: '#fff', fontSize: 16, fontWeight: '800' },
});
