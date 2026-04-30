import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, TextInput, StyleSheet, ScrollView, Alert, Image, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useI18n } from '../utils/useI18n';
import { useTheme } from '../utils/ThemeContext';
import { useToast } from '../components/Toast';
import { PhotoGallery } from '../components/PhotoGallery';
import { addNotification, removeCargo } from '../utils/store';
import { routeStats } from '../utils/geo';
import BidModal from '../components/BidModal';
import ShareModal from '../components/ShareModal';
import { useVerificationGate } from '../components/VerificationGate';
import { LEVELS, useAuth } from '../utils/AuthContext';
import { marketAPI } from '../utils/marketAPI';
import { reviewsAPI } from '../utils/reviews';

const FLAGS = { KZ: '🇰🇿', UZ: '🇺🇿', RU: '🇷🇺', KG: '🇰🇬', CN: '🇨🇳', TJ: '🇹🇯', TR: '🇹🇷', TM: '🇹🇲', MN: '🇲🇳', DE: '🇩🇪', FR: '🇫🇷' };

// HOT-003: скрываем техмусор из description (остатки init_db, стектрейсы и т.п.)
const TRASH_RE = /init_db|phone_formatter|json_merger|bin_iin|SQL|sqlite|traceback|\bError:|File "[^"]+\.py"|line \d+|^```|stderr|\.py\b|SELECT |INSERT |UPDATE |DELETE |CREATE TABLE/gi;
const sanitizeDesc = (s) => {
  const cleaned = String(s || '').replace(TRASH_RE, ' ').replace(/\s{2,}/g, ' ').trim();
  return cleaned || 'Описание не указано';
};

export default function CargoDetail({ navigation, route }) {
  const { cargo: paramCargo, cargoId, role } = route.params || {};
  const cargo = paramCargo || {};
  const { t } = useI18n();
  const { theme } = useTheme();
  const { toast } = useToast();
  const { requireLevel, Gate } = useVerificationGate();
  const { session } = useAuth();
  const myUserId = session?.user?.id;
  const [bidModal, setBidModal] = useState(false);
  const [shareModal, setShareModal] = useState(false);
  const [bids, setBids] = useState([]);
  const [fullCargo, setFullCargo] = useState(null);
  const [accepting, setAccepting] = useState(null);
  const [chatRoomId, setChatRoomId] = useState(null);
  const [dealId, setDealId] = useState(null);
  const [dealStatus, setDealStatus] = useState(null);
  const [statusLoading, setStatusLoading] = useState(false);
  const [reviewRating, setReviewRating] = useState(0);
  const [reviewText, setReviewText] = useState('');
  const [reviewSent, setReviewSent] = useState(false);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [acceptedDriverId, setAcceptedDriverId] = useState(null);
  const cid = cargoId || cargo.id;
  if (!cid && !cargo.from) return null;

  const loadBids = () => {
    if (!cid) return;
    marketAPI.listBids({ cargoId: cid })
      .then(d => {
        const mapped = (d.bids || []).map(b => ({
          id: b.id, bidderId: b.bidder_id,
          name: b.bidder_name || b.bidder_phone || t('anonymous'),
          co: 'KZ', rating: 0, amount: b.amount,
          time: b.created_at?.slice(11, 16) || '•', message: b.message,
          status: b.status, isMine: b.bidder_id === myUserId,
        }));
        setBids(mapped);
        const accepted = mapped.find(b => b.status === 'accepted');
        if (accepted) {
          setAcceptedDriverId(accepted.bidderId);
          if (!dealStatus) setDealStatus('accepted');
        }
      })
      .catch(() => {});
  };

  useEffect(() => {
    if (cid) {
      marketAPI.getCargo(cid).then(d => {
        if (d && d.id) setFullCargo(d);
      }).catch(() => {});
      loadBids();
    }
  }, [cargo.id]);

  const onDeleteCargo = () => {
    const doDel = async () => {
      if (cargo._server) {
        await marketAPI.deleteCargo(cargo.id).catch(() => {});
      } else {
        removeCargo(cargo.id);
      }
      toast('🗑 Груз удалён', 'info');
      navigation.goBack();
    };
    if (Platform.OS === 'web') {
      if (window.confirm('Удалить груз?')) doDel();
    } else {
      Alert.alert('Удалить груз?', '', [{ text: 'Отмена' }, { text: 'Удалить', style: 'destructive', onPress: doDel }]);
    }
  };

  const changeDealStatus = async (newStatus) => {
    if (!dealId || statusLoading) return;
    setStatusLoading(true);
    try {
      const r = await marketAPI.updateDealStatus(dealId, newStatus);
      if (r.ok) {
        setDealStatus(newStatus);
        const labels = { in_progress: '🚛 Перевозка начата', delivered: '✅ Доставлено!', cancelled: '❌ Отменено' };
        toast(labels[newStatus] || 'Статус обновлён', 'success');
      } else {
        toast(r.detail || t('update_failed'), 'error');
      }
    } catch {
      toast('Нет связи с сервером', 'error');
    }
    setStatusLoading(false);
  };

  const handleBid = () => {
    // Ставка отправлена через BidModal → перезагружаем список с сервера
    loadBids();
  };

  // Use fullCargo from API if loaded, otherwise params
  const c = fullCargo || cargo;
  const safePhotos = (c.photos || []).filter(p => typeof p === 'string' && !p.startsWith('data:') && p.length < 1000);

  return (
    <SafeAreaView style={[s.container, { backgroundColor: theme.bg }]} edges={['top']}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={[s.backBtn, { backgroundColor: theme.card, borderColor: theme.border }]}><Text style={[s.backText, { color: theme.text }]}>‹</Text></TouchableOpacity>
        <Text style={[s.headerTitle, { color: theme.text }]} numberOfLines={1}>{c.from_city || c.from || cargo.from || '—'} → {c.to_city || c.to || cargo.to || '—'}</Text>
        <TouchableOpacity onPress={() => setShareModal(true)}><Text style={{ fontSize: 20 }}>↗️</Text></TouchableOpacity>
      </View>
      <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 0 }}>
        {safePhotos.length > 0 ? (
          <PhotoGallery photos={safePhotos} />
        ) : cargo.photo && !cargo.photo.startsWith('data:') ? (
          <View style={[s.photoWrap, { borderColor: theme.border }]}>
            <Image source={{ uri: cargo.photo }} style={s.photo} />
            <View style={s.photoBadge}><Text style={s.photoBadgeText}>📸 {t('cargoPhoto')}</Text></View>
          </View>
        ) : null}
        <View style={[s.section, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <View style={s.routeRow}>
            <View style={[s.dot, { backgroundColor: '#EF4444' }]} /><Text style={[s.city, { color: theme.text }]}>{cargo.from}</Text>
            <View style={[s.line, { backgroundColor: theme.border }]} /><Text>🚛</Text><View style={[s.line, { backgroundColor: theme.border }]} />
            <Text style={[s.city, { color: theme.text }]}>{cargo.to}</Text><View style={[s.dot, { backgroundColor: '#22C55E' }]} />
          </View>
          <View style={s.grid}>
            {(() => {
              const stats = routeStats(cargo.from, cargo.to);
              const desc = sanitizeDesc(cargo.cargo);
              const items = [];
              if (desc) items.push([t('cargoDesc'), desc]);
              if (cargo.tons > 0 || cargo.m3 > 0) {
                const parts = [];
                if (cargo.tons > 0) parts.push(cargo.tons + 'т');
                if (cargo.m3 > 0) parts.push(cargo.m3 + 'м³');
                items.push([t('weight') + '/' + t('volume'), parts.join(' · ')]);
              }
              items.push([t('truckType'), t(cargo.type) || cargo.type || '—']);
              if (cargo.pickup) items.push([t('pickupDate'), cargo.pickup]);
              if (stats) {
                items.push([t('distance'), stats.km + ' км']);
                items.push([t('delivery_time'), '~' + stats.days + ' дн.']);
              }
              items.push([t('payment_label'), t('payment_tbd')]);
              return items.map(([l, v]) => (
                <View key={l} style={s.gridItem}><Text style={[s.gridLabel, { color: theme.textMuted }]}>{l}</Text><Text style={[s.gridValue, { color: theme.text }]}>{v}</Text></View>
              ));
            })()}
          </View>
        </View>
        <View style={s.priceBlock}>
          <View><Text style={s.priceLabel}>{t('price')}</Text><Text style={s.priceValue}>{cargo.price > 0 ? `$${cargo.price}` : 'Договорная'}</Text></View>
          {!cargo.isMine && (
            <TouchableOpacity style={s.bidBtn} onPress={async () => {
              const ok = await requireLevel(LEVELS.PHONE, 'bid');
              if (ok) setBidModal(true);
            }}><Text style={s.bidBtnText}>{t('suggestPrice')}</Text></TouchableOpacity>
          )}
        </View>
        <Text style={[s.bidsTitle, { color: theme.text }]}>{t('bids')} ({bids.length})</Text>
        {bids.length === 0 && (
          <Text style={{ color: theme.textMuted, textAlign: 'center', padding: 20, fontSize: 13 }}>
            Пока нет предложений. Будьте первым!
          </Text>
        )}
        {bids.map(b => {
          const hasAccepted = bids.some(x => x.status === 'accepted');
          return (
            <View key={b.id} style={[s.bidCard, {
              backgroundColor: theme.card,
              borderColor: b.status === 'accepted' ? '#22C55E' : b.status === 'rejected' ? '#EF444440' : b.isMine ? '#22C55E60' : theme.border,
              borderWidth: b.status === 'accepted' || b.isMine ? 2 : 1,
              opacity: b.status === 'rejected' ? 0.5 : 1,
            }]}>
              <View style={s.bidLeft}>
                <View style={[s.bidFlag, { backgroundColor: b.status === 'accepted' ? '#22C55E' : b.isMine ? '#22C55E' : theme.border }]}>
                  <Text style={{ fontSize: 14 }}>{b.isMine ? '🫵' : b.status === 'accepted' ? '✅' : (FLAGS[b.co] || '🏳️')}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[s.bidName, { color: theme.text }]}>{b.name}{b.isMine && ' (вы)'}</Text>
                  {b.message ? <Text style={{ color: theme.textMuted, fontSize: 11, marginTop: 2 }}>{b.message}</Text> : null}
                  <Text style={[s.bidInfo, { color: b.status === 'accepted' ? '#22C55E' : b.status === 'rejected' ? '#EF4444' : '#FBBF24' }]}>
                    {b.status === 'accepted' ? '✅ Водитель выбран' : b.status === 'rejected' ? '❌ Отклонено' : b.time}
                  </Text>
                </View>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={s.bidAmt}>${b.amount}</Text>
                {cargo.isMine && b.status === 'pending' && !hasAccepted && (
                  <TouchableOpacity
                    style={[s.acceptBtn, accepting === b.id && { opacity: 0.5 }]}
                    onPress={async () => {
                      setAccepting(b.id);
                      try {
                        const r = await marketAPI.acceptBid(b.id);
                        if (r.ok) {
                          toast('✓ Водитель выбран!', 'success');
                          if (r.chat_room_id) setChatRoomId(r.chat_room_id);
                          if (r.deal_id) { setDealId(r.deal_id); setDealStatus('accepted'); }
                          loadBids();
                        } else {
                          toast(r.detail || t('accept_failed'), 'error');
                        }
                      } catch {
                        toast('Нет связи с сервером', 'error');
                      }
                      setAccepting(null);
                    }}
                    disabled={!!accepting}
                  >
                    <Text style={s.acceptBtnText}>Принять</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          );
        })}
      </ScrollView>
      {dealStatus && (
        <View style={{ paddingHorizontal: 16, paddingBottom: 8 }}>
          <View style={[s.dealBlock, {
            borderColor: dealStatus === 'delivered' ? '#22C55E' : dealStatus === 'in_progress' ? '#3B82F6' : '#F59E0B',
          }]}>
            <Text style={[s.dealStatusLabel, {
              color: dealStatus === 'delivered' ? '#22C55E' : dealStatus === 'in_progress' ? '#3B82F6' : '#F59E0B',
            }]}>
              {dealStatus === 'accepted' && '🤝 Ожидает начала перевозки'}
              {dealStatus === 'in_progress' && '🚛 В пути'}
              {dealStatus === 'delivered' && '✅ Доставлено'}
              {dealStatus === 'cancelled' && '❌ Отменено'}
            </Text>
            {cargo.isMine && dealStatus === 'accepted' && (
              <TouchableOpacity style={s.dealActionBtn} onPress={() => changeDealStatus('in_progress')} disabled={statusLoading}>
                <Text style={s.dealActionText}>{statusLoading ? '...' : 'Начать перевозку →'}</Text>
              </TouchableOpacity>
            )}
            {cargo.isMine && dealStatus === 'in_progress' && (
              <TouchableOpacity style={[s.dealActionBtn, { backgroundColor: '#22C55E' }]} onPress={() => changeDealStatus('delivered')} disabled={statusLoading}>
                <Text style={s.dealActionText}>{statusLoading ? '...' : 'Подтвердить доставку ✓'}</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}
      {dealStatus === 'delivered' && (
        <View style={{ paddingHorizontal: 16, paddingBottom: 8 }}>
          <View style={[s.paymentBlock, { backgroundColor: theme.card, borderColor: '#F59E0B' }]}>
            <Text style={{ color: '#F59E0B', fontSize: 13, fontWeight: '700' }}>💰 Ожидается оплата</Text>
            <Text style={{ color: theme.textMuted, fontSize: 11, marginTop: 4 }}>Договоритесь об оплате в чате. Наличные, перевод или по договору.</Text>
          </View>
        </View>
      )}
      {dealStatus === 'delivered' && cargo.isMine && !reviewSent && acceptedDriverId && (
        <View style={{ paddingHorizontal: 16, paddingBottom: 8 }}>
          <View style={[s.reviewBlock, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Text style={[s.reviewTitle, { color: theme.text }]}>{t('rate_driver')}</Text>
            <View style={s.starsRow}>
              {[1,2,3,4,5].map(n => (
                <TouchableOpacity key={n} onPress={() => setReviewRating(n)}>
                  <Text style={{ fontSize: 28 }}>{n <= reviewRating ? '★' : '☆'}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TextInput
              style={[s.reviewInput, { backgroundColor: theme.bg, color: theme.text, borderColor: theme.border }]}
              value={reviewText}
              onChangeText={setReviewText}
              placeholder="Комментарий (необязательно)"
              placeholderTextColor={theme.textMuted}
              maxLength={200}
            />
            <TouchableOpacity
              style={[s.reviewSubmitBtn, reviewRating === 0 && { opacity: 0.4 }]}
              disabled={reviewRating === 0 || reviewLoading}
              onPress={async () => {
                setReviewLoading(true);
                try {
                  await reviewsAPI.create({
                    targetId: acceptedDriverId,
                    targetRole: 'driver',
                    rating: reviewRating,
                    text: reviewText.trim() || null,
                  });
                  setReviewSent(true);
                  toast(t('thanks_for_review'), 'success');
                } catch {
                  toast(t('review_failed'), 'error');
                }
                setReviewLoading(false);
              }}
            >
              <Text style={s.reviewSubmitText}>{reviewLoading ? '...' : t('submit_rating')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
      {dealStatus === 'delivered' && reviewSent && (
        <View style={{ paddingHorizontal: 16, paddingBottom: 8, alignItems: 'center' }}>
          <Text style={{ color: '#22C55E', fontSize: 14, fontWeight: '600' }}>✓ Спасибо за оценку!</Text>
        </View>
      )}
      {chatRoomId && (
        <View style={{ paddingHorizontal: 16, paddingBottom: 8 }}>
          <TouchableOpacity
            style={s.chatBtn}
            onPress={() => navigation.navigate('Chat', { roomId: chatRoomId, role })}
          >
            <Text style={s.chatBtnText}>💬 {t('open_chat')}</Text>
          </TouchableOpacity>
        </View>
      )}
      {cargo.isMine && !chatRoomId && (
        <View style={{ padding: 16, paddingTop: 0 }}>
          <TouchableOpacity style={s.deleteMyBtn} onPress={onDeleteCargo}>
            <Text style={s.deleteMyBtnText}>🗑 {t('delete_cargo')}</Text>
          </TouchableOpacity>
        </View>
      )}
      <BidModal visible={bidModal} onClose={() => setBidModal(false)} onSubmit={handleBid} currentPrice={cargo.price} cargoId={cargo.id} />
      <ShareModal visible={shareModal} onClose={() => setShareModal(false)} shareText={'UrTruck: ' + cargo.cargo + ' ' + cargo.from + '→' + cargo.to + ' $' + cargo.price} driverId={cargo.id} />
      {Gate}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 12 },
  backBtn: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  backText: { fontSize: 22 },
  headerTitle: { flex: 1, fontSize: 18, fontWeight: '700' },
  section: { borderRadius: 16, padding: 18, borderWidth: 1, marginBottom: 10 },
  routeRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 14 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  city: { fontSize: 17, fontWeight: '800' },
  line: { flex: 1, height: 1 },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  gridItem: { width: '50%', marginBottom: 10 },
  gridLabel: { fontSize: 10 },
  gridValue: { fontSize: 13, fontWeight: '600', marginTop: 2 },
  priceBlock: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#052E16', borderRadius: 16, padding: 18, borderWidth: 1, borderColor: '#14532D', marginBottom: 16 },
  priceLabel: { color: '#4ADE80', fontSize: 11 },
  priceValue: { color: '#22C55E', fontSize: 28, fontWeight: '900' },
  beta: { color: '#57534E', fontSize: 10 },
  bidBtn: { backgroundColor: '#22C55E', borderRadius: 14, paddingHorizontal: 22, paddingVertical: 14 },
  bidBtnText: { color: '#fff', fontSize: 14, fontWeight: '800' },
  bidsTitle: { fontSize: 14, fontWeight: '700', marginBottom: 8 },
  bidCard: { borderRadius: 12, padding: 12, borderWidth: 1, marginBottom: 6, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  bidLeft: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, marginRight: 8 },
  bidFlag: { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  bidName: { fontSize: 13, fontWeight: '600' },
  bidInfo: { color: '#FBBF24', fontSize: 11 },
  bidAmt: { color: '#22C55E', fontSize: 16, fontWeight: '900', flexShrink: 0 },
  confirmBanner: { backgroundColor: '#22C55E20', borderWidth: 1, borderColor: '#22C55E', borderRadius: 12, padding: 14, marginBottom: 12, alignItems: 'center' },
  confirmText: { color: '#22C55E', fontSize: 14, fontWeight: '800' },
  photoWrap: { borderRadius: 16, overflow: 'hidden', borderWidth: 1, marginBottom: 12, position: 'relative' },
  photo: { width: '100%', height: 200 },
  photoBadge: { position: 'absolute', top: 10, left: 10, backgroundColor: 'rgba(0,0,0,0.7)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  photoBadgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  acceptBtn: { backgroundColor: '#22C55E', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 6, marginTop: 6 },
  acceptBtnText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  paymentBlock: { borderRadius: 12, borderWidth: 1, padding: 14 },
  reviewBlock: { borderRadius: 14, borderWidth: 1, padding: 16, alignItems: 'center', gap: 10 },
  reviewTitle: { fontSize: 15, fontWeight: '700' },
  starsRow: { flexDirection: 'row', gap: 8 },
  reviewInput: { width: '100%', borderWidth: 1, borderRadius: 10, padding: 10, fontSize: 13 },
  reviewSubmitBtn: { backgroundColor: '#22C55E', borderRadius: 10, paddingHorizontal: 20, paddingVertical: 10 },
  reviewSubmitText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  dealBlock: { borderWidth: 2, borderRadius: 14, padding: 16, alignItems: 'center', gap: 10 },
  dealStatusLabel: { fontSize: 15, fontWeight: '700' },
  dealActionBtn: { backgroundColor: '#3B82F6', borderRadius: 10, paddingHorizontal: 20, paddingVertical: 10 },
  dealActionText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  chatBtn: { backgroundColor: '#3B82F6', borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  chatBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  deleteMyBtn: { borderWidth: 1, borderColor: '#EF4444', borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  deleteMyBtnText: { color: '#EF4444', fontSize: 13, fontWeight: '800' },
});
