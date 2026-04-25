import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Alert, Image, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useI18n } from '../utils/useI18n';
import { useTheme } from '../utils/ThemeContext';
import { useToast } from '../components/Toast';
import { PhotoGallery } from '../components/PhotoGallery';
import { addNotification, removeCargo } from '../utils/store';
import { routeStats } from '../utils/geo';
import BidModal from '../components/BidModal';
import ShareModal from '../components/ShareModal';
import RouteMap from '../components/RouteMap';
import { useVerificationGate } from '../components/VerificationGate';
import { LEVELS } from '../utils/AuthContext';
import { marketAPI } from '../utils/marketAPI';

const FLAGS = { KZ: '🇰🇿', UZ: '🇺🇿', RU: '🇷🇺', KG: '🇰🇬', CN: '🇨🇳', TJ: '🇹🇯', TR: '🇹🇷', TM: '🇹🇲', MN: '🇲🇳', DE: '🇩🇪', FR: '🇫🇷' };

// HOT-003: скрываем техмусор из description (остатки init_db, стектрейсы и т.п.)
const TRASH_RE = /init_db|phone_formatter|SQL|sqlite|traceback|\bError:|File "[^"]+\.py"|line \d+|^```|stderr/gi;
const sanitizeDesc = (s) => String(s || '').replace(TRASH_RE, ' ').replace(/\s{2,}/g, ' ').trim();

export default function CargoDetail({ navigation, route }) {
  const { cargo, role } = route.params || {};
  const { t } = useI18n();
  const { theme } = useTheme();
  const { toast } = useToast();
  const { requireLevel, Gate } = useVerificationGate();
  const [bidModal, setBidModal] = useState(false);
  const [shareModal, setShareModal] = useState(false);
  const [bids, setBids] = useState([]);
  const [fullCargo, setFullCargo] = useState(null);
  if (!cargo) return null;

  // Дозагрузка полных данных + bids
  useEffect(() => {
    if (cargo.id && cargo._server) {
      // Полные данные
      marketAPI.getCargo(cargo.id).then(d => {
        if (d && d.id) setFullCargo(d);
      }).catch(() => {});
      // Bids
      marketAPI.listBids({ cargoId: cargo.id })
        .then(d => setBids((d.bids || []).map(b => ({
          id: b.id, name: b.bidder_name || b.bidder_phone || 'Аноним',
          co: 'KZ', rating: 0, amount: b.amount,
          time: b.created_at?.slice(11, 16) || '•', message: b.message,
          status: b.status, isMine: false,
        }))))
        .catch(() => {});
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

  const handleBid = (amount) => {
    // Ставка уже отправлена через BidModal → marketAPI.createBid
    // Обновляем локальный список
    const newBid = { id: 'b' + Date.now(), name: 'Вы', co: 'KZ', rating: 0, amount, time: '•', isMine: true };
    setBids(prev => [newBid, ...prev]);
  };

  return (
    <SafeAreaView style={[s.container, { backgroundColor: theme.bg }]} edges={['top']}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={[s.backBtn, { backgroundColor: theme.card, borderColor: theme.border }]}><Text style={[s.backText, { color: theme.text }]}>‹</Text></TouchableOpacity>
        <Text style={[s.headerTitle, { color: theme.text }]}>{t('cargos')}</Text>
        <TouchableOpacity onPress={() => setShareModal(true)}><Text style={{ fontSize: 20 }}>↗️</Text></TouchableOpacity>
      </View>
      <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 0 }}>
        {cargo.photos && cargo.photos.length > 0 ? (
          <PhotoGallery photos={cargo.photos} />
        ) : cargo.photo ? (
          <View style={[s.photoWrap, { borderColor: theme.border }]}>
            <Image source={{ uri: cargo.photo }} style={s.photo} />
            <View style={s.photoBadge}><Text style={s.photoBadgeText}>📸 {t('cargoPhoto')}</Text></View>
          </View>
        ) : null}
        <RouteMap from={cargo.from} to={cargo.to} height={160} />
        <View style={[s.section, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <View style={s.routeRow}>
            <View style={[s.dot, { backgroundColor: '#EF4444' }]} /><Text style={[s.city, { color: theme.text }]}>{cargo.from}</Text>
            <View style={[s.line, { backgroundColor: theme.border }]} /><Text>🚛</Text><View style={[s.line, { backgroundColor: theme.border }]} />
            <Text style={[s.city, { color: theme.text }]}>{cargo.to}</Text><View style={[s.dot, { backgroundColor: '#22C55E' }]} />
          </View>
          <View style={s.grid}>
            {(() => {
              const stats = routeStats(cargo.from, cargo.to);
              const items = [
                [t('cargoDesc'), sanitizeDesc(cargo.cargo)],
                [t('weight') + '/' + t('volume'), cargo.tons + 't · ' + cargo.m3 + 'm³'],
                [t('truckType'), t(cargo.type)],
                [t('pickupDate'), cargo.pickup || '—'],
              ];
              if (stats) {
                items.push(['📏 Расстояние', stats.km + ' км']);
                items.push(['⏱ Примерно', '~' + stats.days + ' дн.']);
              }
              return items.map(([l, v]) => (
                <View key={l} style={s.gridItem}><Text style={[s.gridLabel, { color: theme.textMuted }]}>{l}</Text><Text style={[s.gridValue, { color: theme.text }]}>{v}</Text></View>
              ));
            })()}
          </View>
        </View>
        <View style={s.priceBlock}>
          <View><Text style={s.priceLabel}>{t('price')}</Text><Text style={s.priceValue}>${cargo.price}</Text><Text style={s.beta}>{t('contactFree')}</Text></View>
          <TouchableOpacity style={s.bidBtn} onPress={async () => {
            const ok = await requireLevel(LEVELS.PHONE, 'bid');
            if (ok) setBidModal(true);
          }}><Text style={s.bidBtnText}>{t('suggestPrice')}</Text></TouchableOpacity>
        </View>
        <Text style={[s.bidsTitle, { color: theme.text }]}>{t('bids')} ({bids.length})</Text>
        {bids.length === 0 && (
          <Text style={{ color: theme.textMuted, textAlign: 'center', padding: 20, fontSize: 13 }}>
            Пока нет предложений. Будьте первым!
          </Text>
        )}
        {bids.map(b => (
          <View key={b.id} style={[s.bidCard, { backgroundColor: theme.card, borderColor: b.isMine ? '#22C55E' : b.status === 'accepted' ? '#22C55E' : theme.border, borderWidth: b.isMine || b.status === 'accepted' ? 2 : 1 }]}>
            <View style={s.bidLeft}>
              <View style={[s.bidFlag, { backgroundColor: b.isMine ? '#22C55E' : theme.border }]}>
                <Text style={{ fontSize: 14 }}>{b.isMine ? '🫵' : (FLAGS[b.co] || '🏳️')}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[s.bidName, { color: theme.text }]}>{b.name}{b.isMine && ' (вы)'}</Text>
                {b.message ? <Text style={{ color: theme.textMuted, fontSize: 11, marginTop: 2 }}>{b.message}</Text> : null}
                <Text style={s.bidInfo}>
                  {b.status === 'accepted' ? '✅ Принято' : b.status === 'rejected' ? '❌ Отклонено' : b.time}
                </Text>
              </View>
            </View>
            <Text style={s.bidAmt}>${b.amount}</Text>
          </View>
        ))}
      </ScrollView>
      {cargo.isMine && (
        <View style={{ padding: 16, paddingTop: 0 }}>
          <TouchableOpacity style={s.deleteMyBtn} onPress={onDeleteCargo}>
            <Text style={s.deleteMyBtnText}>🗑 Удалить мой груз</Text>
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
  bidCard: { borderRadius: 12, padding: 12, borderWidth: 1, marginBottom: 6, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  bidLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  bidFlag: { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  bidName: { fontSize: 13, fontWeight: '600' },
  bidInfo: { color: '#FBBF24', fontSize: 11 },
  bidAmt: { color: '#22C55E', fontSize: 17, fontWeight: '900' },
  confirmBanner: { backgroundColor: '#22C55E20', borderWidth: 1, borderColor: '#22C55E', borderRadius: 12, padding: 14, marginBottom: 12, alignItems: 'center' },
  confirmText: { color: '#22C55E', fontSize: 14, fontWeight: '800' },
  photoWrap: { borderRadius: 16, overflow: 'hidden', borderWidth: 1, marginBottom: 12, position: 'relative' },
  photo: { width: '100%', height: 200 },
  photoBadge: { position: 'absolute', top: 10, left: 10, backgroundColor: 'rgba(0,0,0,0.7)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  photoBadgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  deleteMyBtn: { borderWidth: 1, borderColor: '#EF4444', borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  deleteMyBtnText: { color: '#EF4444', fontSize: 13, fontWeight: '800' },
});
