import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useI18n } from '../utils/useI18n';
import { useTheme } from '../utils/ThemeContext';
import ShareModal from '../components/ShareModal';
import SecurityBadge from '../components/SecurityBadge';
import { useToast } from '../components/Toast';
import { Platform } from 'react-native';
import { useVerificationGate } from '../components/VerificationGate';
import { LEVELS } from '../utils/AuthContext';
import { reviewsAPI } from '../utils/reviews';
import RatingModal from '../components/RatingModal';
import { marketAPI } from '../utils/marketAPI';
import { API_BASE } from '../config/env';

const TCOLORS = { tent: '#2563EB', ref: '#0891B2', platform: '#D97706', auto: '#7C3AED', izoterm: '#059669' };
const FLAGS = { KZ: '🇰🇿', UZ: '🇺🇿', RU: '🇷🇺', KG: '🇰🇬', CN: '🇨🇳' };
const REVIEWS = [
  { user: 'Бахытжан', rating: 5, text: 'Довёз быстро, аккуратный', ago: '2 нед' },
  { user: 'Asia Import', rating: 5, text: 'Всё чётко, рекомендую', ago: '1 мес' },
  { user: 'CargoLine', rating: 4, text: 'Задержался на границе, но предупредил', ago: '1 мес' },
];

export default function DriverDetail({ navigation, route }) {
  const { driver, role } = route.params || {};
  const { t } = useI18n();
  const { theme } = useTheme();
  const { toast } = useToast();
  const { requireLevel, Gate } = useVerificationGate();
  const [shareModal, setShareModal] = useState(false);
  const [contactOpened, setContactOpened] = useState(false);
  const [rateModal, setRateModal] = useState(false);
  const [reviewsData, setReviewsData] = useState(null);
  const [serverProfile, setServerProfile] = useState(null);

  useEffect(() => {
    if (driver?.id) {
      reviewsAPI.forTarget(driver.id).then(setReviewsData).catch(() => {});
      // Загружаем серверный профиль если есть _server флаг
      if (driver._server || driver._isDriver) {
        marketAPI.listDrivers().then(d => {
          const found = (d.drivers || []).find(dr => dr.id === driver.id);
          if (found) setServerProfile(found);
        }).catch(() => {});
      }
    }
  }, [driver?.id]);

  if (!driver) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.bg, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: theme.textMuted, fontSize: 14 }}>Данные рейса неполные</Text>
        <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginTop: 16 }}>
          <Text style={{ color: '#22C55E', fontSize: 14, fontWeight: '600' }}>← Назад</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  const tt = driver.type || driver.vehicle_type || 'tent';
  const accent = role === 'driver' ? '#2563EB' : '#F59E0B';
  // Safe defaults
  const driverName = driver.name || driver.full_name || 'Водитель';
  const driverPhone = driver.phone || '';
  const driverPlate = driver.plate_truck || driver.vehicle_plate || '';

  const openContact = async () => {
    // Контакты — самый строгий замок: требует identity (level 2)
    const ok = await requireLevel(LEVELS.PHONE, 'contact');
    if (!ok) return;
    setContactOpened(true);
    navigation.navigate('Chat', { partner: driver, role });
  };

  return (
    <SafeAreaView style={[s.container, { backgroundColor: theme.bg }]} edges={['top']}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={[s.backBtn, { backgroundColor: theme.card, borderColor: theme.border }]}><Text style={[s.backText, { color: theme.text }]}>‹</Text></TouchableOpacity>
        <Text style={[s.headerTitle, { color: theme.text }]}>{t('driverProfile')}</Text>
        <TouchableOpacity onPress={() => setShareModal(true)}><Text style={{ fontSize: 20 }}>↗️</Text></TouchableOpacity>
      </View>
      <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 0, paddingBottom: 40 }}>
        <View style={[s.section, { backgroundColor: theme.card, borderColor: theme.border, alignItems: 'center', paddingVertical: 24 }]}>
          <View style={[s.avatar, { backgroundColor: (TCOLORS[tt] || '#666') + '20', borderColor: (TCOLORS[tt] || '#666') + '30' }]}>
            <Text style={{ fontSize: 32 }}>{FLAGS[driver.country] || '🏳️'}</Text>
          </View>
          <Text style={[s.name, { color: theme.text }]}>{driverName} {driver.verified && <Text style={{ color: '#2563EB' }}>✓</Text>}</Text>
          <View style={s.verifyBadge}>
            <Text style={[s.verifyText, { color: driver.verified ? '#22C55E' : '#F59E0B' }]}>{driver.verified ? '🟢 ' + t('verified') : '🟡 ' + t('pending')}</Text>
          </View>
          <Text style={s.ratingText}>★ {driver.rating || '—'} <Text style={[s.reviewCount, { color: theme.textMuted }]}>({driver.reviews || 0})</Text></Text>
        </View>

        {/* Скоринг безопасности — публичный вид (только балл + цвет) */}
        <View style={[s.section, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Text style={[s.sectionTitle, { color: theme.textMuted }]}>🛡 НАДЁЖНОСТЬ</Text>
          <SecurityBadge userId={driver.id} phone={driver.phone} plate={driver.plate_truck} />
        </View>

        <View style={[s.section, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Text style={[s.sectionTitle, { color: theme.textMuted }]}>{t('transport')}</Text>
          <View style={s.grid}>
            {[[t('truckType'), t(tt)], [t('volume'), (driver.m3 || '—') + 'м³'], [t('tonnage'), (driver.tons || '—') + 'т']].map(([l, v]) => (
              <View key={l} style={s.gridItem}><Text style={[s.gridLabel, { color: theme.textMuted }]}>{l}</Text><Text style={[s.gridValue, { color: theme.text }]}>{v}</Text></View>
            ))}
          </View>
        </View>

        <View style={[s.section, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <Text style={[s.sectionTitle, { color: theme.textMuted, marginBottom: 0 }]}>
              {t('reviews')} ({reviewsData?.summary?.count ?? 0})
              {reviewsData?.summary?.count > 0 && (
                <Text style={{ color: '#FBBF24', fontWeight: '800' }}> · ★ {reviewsData.summary.average}</Text>
              )}
            </Text>
            <Text style={{ color: theme.textDim, fontSize: 10 }}>Отзыв после завершения перевозки</Text>
          </View>

          {(reviewsData?.reviews?.length > 0 ? reviewsData.reviews : REVIEWS).map((r, i, arr) => {
            const isDemo = !reviewsData?.reviews?.length;
            const user = r.user || r.author_id?.slice(0, 8) || 'Аноним';
            const rating = r.rating;
            const text = r.text || '';
            const ago = r.ago || (r.created_at || '').slice(0, 10);
            return (
              <View key={i} style={[s.review, i < arr.length - 1 && { borderBottomWidth: 1, borderBottomColor: theme.border }]}>
                <View style={s.reviewHeader}>
                  <Text style={[s.reviewUser, { color: theme.text }]}>{user}</Text>
                  <Text style={s.reviewStars}>{'★'.repeat(rating)}</Text>
                </View>
                {text ? <Text style={[s.reviewText, { color: theme.textSecondary }]}>{text}</Text> : null}
                <Text style={[s.reviewAgo, { color: theme.textMuted }]}>{ago}{isDemo ? ' · демо' : ''}</Text>
              </View>
            );
          })}
        </View>

        <TouchableOpacity style={[s.contactBtn, { backgroundColor: contactOpened ? '#22C55E' : accent }]} onPress={openContact} disabled={contactOpened}>
          <Text style={[s.contactBtnText, { color: role === 'driver' ? '#fff' : '#0C0A09' }]}>{contactOpened ? '✓ ' + t('contactOpened') : t('openContact') + ' · $0'}</Text>
        </TouchableOpacity>
        <Text style={[s.betaNote, { color: theme.textMuted }]}>{t('freeForEarly')}</Text>

        <TouchableOpacity
          style={s.reportBtn}
          onPress={() => {
            const ask = () => Platform.OS === 'web'
              ? (window.prompt('Опишите проблему с водителем:', '') || '').trim()
              : '';
            const reason = ask();
            if (!reason) return;
            fetch(`${API_BASE}/report/driver`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                phone: driver.phone,
                plate: driver.plate_truck,
                name: driver.name,
                reason,
                severity: 'high',
              }),
            }).then(r => r.json()).then(() => {
              toast('🚨 Жалоба отправлена модераторам', 'warn', 4000);
            }).catch(() => toast(t('send_error'), 'error'));
          }}
        >
          <Text style={s.reportBtnText}>🚨 Пожаловаться на водителя</Text>
        </TouchableOpacity>
      </ScrollView>
      <ShareModal visible={shareModal} onClose={() => setShareModal(false)} shareText={'UrTruck: ' + driver.name + ', ' + t(tt) + ' ' + driver.m3 + 'м³'} phone={driver.phone} driverId={driver.id} />
      <RatingModal
        visible={rateModal}
        onClose={() => setRateModal(false)}
        targetId={driver.id}
        targetRole="driver"
        targetName={driver.name}
        onSubmitted={() => reviewsAPI.forTarget(driver.id).then(setReviewsData).catch(() => {})}
      />
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
  sectionTitle: { fontSize: 10, fontWeight: '600', letterSpacing: 1, marginBottom: 12 },
  avatar: { width: 64, height: 64, borderRadius: 20, alignItems: 'center', justifyContent: 'center', borderWidth: 2, marginBottom: 10 },
  name: { fontSize: 20, fontWeight: '800', marginBottom: 4 },
  verifyBadge: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12, marginBottom: 6 },
  verifyText: { fontSize: 12, fontWeight: '600' },
  ratingText: { color: '#FBBF24', fontSize: 14, fontWeight: '700' },
  reviewCount: { fontWeight: '400' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  gridItem: { width: '50%', marginBottom: 10 },
  gridLabel: { fontSize: 10 },
  gridValue: { fontSize: 13, fontWeight: '600', marginTop: 2 },
  review: { marginBottom: 10, paddingBottom: 10 },
  reviewHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  reviewUser: { fontSize: 13, fontWeight: '600' },
  reviewStars: { color: '#FBBF24', fontSize: 12 },
  reviewText: { fontSize: 12 },
  reviewAgo: { fontSize: 10, marginTop: 3 },
  contactBtn: { borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginTop: 6 },
  contactBtnText: { fontSize: 16, fontWeight: '800' },
  betaNote: { fontSize: 11, textAlign: 'center', marginTop: 6 },
  reportBtn: { marginTop: 12, backgroundColor: '#EF444415', borderWidth: 1, borderColor: '#EF444430', paddingVertical: 14, borderRadius: 14, alignItems: 'center' },
  reportBtnText: { color: '#EF4444', fontSize: 13, fontWeight: '700' },
});
