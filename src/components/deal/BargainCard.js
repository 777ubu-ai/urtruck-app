// BargainCard — Часть 2 (базар-UX): быстрый торг прямо в чате сделки.
//
// Показывает активную ставку по грузу/рейсу пары: сумму КРУПНО, кто/что сделал,
// ДВИЖЕНИЕ цены ($6000 → $5500 → $5200), и ЧИПЫ быстрого торга по текущему
// bids.status (источник истины — сервер):
//   owner + pending    → [−$100] [−$200] [Своя цена] [Принять] [Отклонить]
//   bidder + countered → [Принять контр] [Своя цена] [Отклонить]
// Тап по чипу мгновенно шлёт действие через существующие эндпоинты (counter/
// accept/reject/acceptCounter) — без открытия форм. «Своя цена» открывает
// BidModal через onOpenModal. При заключении сделки — onDeal(amount).
//
// Роли: OWNER (владелец груза/рейса) и BIDDER (автор ставки) — определяем по
// is_owner из list_bids. Правила торга не меняем.

import React, { useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { useFocusEffect } from '@react-navigation/native';
import { useI18n } from '../../utils/useI18n';
import { useV1Colors, v1Radius } from '../../theme/designV1';
import { marketAPI } from '../../utils/marketAPI';
import { formatPrice } from '../../utils/normalizers';
import { useToast } from '../Toast';

export default function BargainCard({ cargoId, tripId, myUserId, onOpenModal, onDeal, refreshKey }) {
  const { t } = useI18n();
  const v1 = useV1Colors();
  const { toast } = useToast();
  const [bid, setBid] = useState(null);
  const [isOwner, setIsOwner] = useState(false);
  const [events, setEvents] = useState([]);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    if (!cargoId && !tripId) return;
    const d = await marketAPI.listBids(cargoId ? { cargoId } : { tripId }).catch(() => null);
    if (!d) { setLoaded(true); return; }
    setIsOwner(!!d.is_owner);
    // owner видит первую активную ставку по листингу; bidder — свою (my_bid).
    const active = d.is_owner
      ? (d.bids || []).find((b) => b.status === 'pending' || b.status === 'countered')
      : (d.my_bid && (d.my_bid.status === 'pending' || d.my_bid.status === 'countered') ? d.my_bid : null);
    setBid(active || null);
    if (active) {
      const e = await marketAPI.bidEvents(active.id).catch(() => ({ events: [] }));
      setEvents(Array.isArray(e?.events) ? e.events : []);
    } else {
      setEvents([]);
    }
    setLoaded(true);
  }, [cargoId, tripId, refreshKey]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const cur = bid?.currency || 'USD';
  const money = (a) => formatPrice(a, cur, t);

  // Движение цены из событий: суммы по порядку, схлопывая повторы подряд.
  const movement = React.useMemo(() => {
    const amts = events.filter((e) => e.amount != null).map((e) => e.amount);
    const compact = amts.filter((a, i) => i === 0 || a !== amts[i - 1]);
    return compact;
  }, [events]);

  const act = async (fn, okMsg, isDealClose, dealAmount) => {
    if (busy) return;
    setBusy(true);
    try {
      const r = await fn();
      if (r && r.ok === false) { toast(r.detail || t('send_error'), 'error'); }
      else {
        if (okMsg) toast(okMsg, 'success');
        if (isDealClose && onDeal) onDeal(dealAmount);
      }
    } catch { toast(t('send_error'), 'error'); }
    setBusy(false);
    load();
  };

  if (!loaded) return null;
  if (!bid) return null; // нет активного торга — карточку не показываем

  // Текущая «на столе» сумма: у countered это counter_amount, иначе amount.
  const current = bid.status === 'countered' && bid.counter_amount ? bid.counter_amount : bid.amount;
  const statusLabel =
    bid.status === 'countered' ? t('bargain_countered')
    : bid.status === 'pending' ? t('bargain_pending')
    : bid.status;

  const s = styles(v1);
  const Chip = ({ label, onPress, primary, danger, tid }) => (
    <TouchableOpacity
      style={[s.chip, primary && s.chipPrimary, danger && s.chipDanger]}
      onPress={onPress}
      disabled={busy}
      testID={tid}
      activeOpacity={0.8}
    >
      <Text style={[s.chipText, primary && s.chipTextPrimary, danger && s.chipTextDanger]}>{label}</Text>
    </TouchableOpacity>
  );

  return (
    <View style={s.wrap} testID="bargain-card">
      <View style={s.row}>
        <Text style={s.label}>{statusLabel}</Text>
        <Text style={s.amount} testID="bargain-amount">{money(current)}</Text>
      </View>
      {movement.length > 1 ? (
        <Text style={s.movement} testID="bargain-movement">
          {movement.map((a) => money(a)).join('  →  ')}
        </Text>
      ) : null}

      <View style={s.chips}>
        {busy ? <ActivityIndicator color={v1.driver} style={{ marginRight: 8 }} /> : null}
        {isOwner && bid.status === 'pending' ? (
          <>
            <Chip label={`−${money(100)}`} tid="bargain-minus-100"
              onPress={() => act(() => marketAPI.counterBid(bid.id, { amount: Math.max(1, current - 100) }), t('bargain_counter_sent'))} />
            <Chip label={`−${money(200)}`} tid="bargain-minus-200"
              onPress={() => act(() => marketAPI.counterBid(bid.id, { amount: Math.max(1, current - 200) }), t('bargain_counter_sent'))} />
            <Chip label={t('bargain_own_price')} tid="bargain-own"
              onPress={() => onOpenModal && onOpenModal('counter', bid.id, current)} />
            <Chip label={t('accept')} primary tid="bargain-accept"
              onPress={() => act(() => marketAPI.acceptBid(bid.id), null, true, bid.amount)} />
            <Chip label={t('reject')} danger tid="bargain-reject"
              onPress={() => act(() => marketAPI.rejectBid(bid.id), t('bid_rejected'))} />
          </>
        ) : null}
        {!isOwner && bid.status === 'countered' ? (
          <>
            <Chip label={t('bargain_accept_counter')} primary tid="bargain-accept-counter"
              onPress={() => act(() => marketAPI.acceptCounterBid(bid.id), null, true, bid.counter_amount)} />
            {/* Контр-назад (пинг-понг): updateBid на countered даёт 409 (pending-
                гейт), поэтому сначала снимаем контр (→pending), затем правим цену. */}
            <Chip label={t('bargain_own_price')} tid="bargain-own"
              onPress={async () => {
                if (busy) return;
                setBusy(true);
                const r = await marketAPI.declineCounterBid(bid.id).catch(() => null);
                setBusy(false);
                if (r && r.ok === false) { toast(r.detail || t('send_error'), 'error'); return; }
                onOpenModal && onOpenModal('edit', bid.id, current);
              }} />
            <Chip label={t('reject')} danger tid="bargain-decline"
              onPress={() => act(() => marketAPI.declineCounterBid(bid.id), t('counter_declined'))} />
          </>
        ) : null}
        {/* Ожидание хода второй стороны — без чипов (источник истины = статус). */}
        {(!isOwner && bid.status === 'pending') || (isOwner && bid.status === 'countered') ? (
          <Text style={s.waiting}>{t('bargain_waiting')}</Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = (v1) => StyleSheet.create({
  wrap: { marginHorizontal: 12, marginTop: 10, padding: 14, borderRadius: v1Radius.field, backgroundColor: v1.surface, borderWidth: 1, borderColor: v1.driver },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  label: { color: v1.textMuted, fontSize: 12, fontWeight: '700' },
  amount: { color: v1.text, fontSize: 26, fontWeight: '900', letterSpacing: -0.5 },
  movement: { color: v1.textMuted, fontSize: 13, fontWeight: '700', marginTop: 4 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginTop: 12 },
  chip: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 20, borderWidth: 1, borderColor: v1.border, backgroundColor: v1.bgDeep },
  chipPrimary: { backgroundColor: v1.driver, borderColor: v1.driver },
  chipDanger: { borderColor: '#EF4444' },
  chipText: { color: v1.text, fontSize: 13, fontWeight: '800' },
  chipTextPrimary: { color: '#0C0A09' },
  chipTextDanger: { color: '#EF4444' },
  waiting: { color: v1.textMuted, fontSize: 12, fontStyle: 'italic' },
});
