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
import {v1Colors, useV1Colors, v1Radius, v1AccentFor} from '../theme/designV1';
import GlassCard from '../components/ui/v1/GlassCard';
import SectionTitle from '../components/ui/v1/SectionTitle';
import BrandBarWithShare from '../components/ui/v1/BrandBarWithShare';

const TCOLORS = { tent: '#22C55E', ref: '#16A34A', platform: '#D97706', auto: '#7C3AED', izoterm: '#059669' };
const FLAGS = { KZ: '🇰🇿', UZ: '🇺🇿', RU: '🇷🇺', KG: '🇰🇬', CN: '🇨🇳' };
// Demo reviews — static content, shown only when no real reviews from API
const REVIEWS = [
  { user: 'B. K.', rating: 5, text: '★★★★★', ago: '2w' },
  { user: 'Asia Import', rating: 5, text: '★★★★★', ago: '1m' },
  { user: 'CargoLine', rating: 4, text: '★★★★', ago: '1m' },
];

export default function DriverDetail({ navigation, route }) {
  const v1 = useV1Colors();
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
        <Text style={{ color: theme.textMuted, fontSize: 14 }}>{t('incomplete_data')}</Text>
        <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginTop: 16 }}>
          <Text style={{ color: '#22C55E', fontSize: 14, fontWeight: '600' }}>← {t('back_short')}</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  // Soft-empty state: card was for a driver whose profile isn't completed
  // server-side yet (driver_id has a session but the user never finished
  // registration). Showing the full profile UI with empty fields used to
  // crash on null props — now we render a friendly placeholder instead.
  // v1 brand accent: emerald when the viewer is a shipper looking at a
  // driver, orange when the driver is viewing another driver's card (rare,
  // mostly happens via deep link).
  const v1Accent = v1AccentFor(role === 'driver' ? 'client' : 'driver');

  if (driver._profileMissing) {
    return (
      <SafeAreaView style={[s.container, { backgroundColor: v1.bg }]} edges={['top']}>
        <BrandBarWithShare onBack={() => navigation.goBack()} accent={v1Accent.main} />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 10 }}>
          <Text style={{ fontSize: 56 }}>🪪</Text>
          <Text style={{ color: v1.text, fontSize: 16, fontWeight: '700', textAlign: 'center' }}>
            {t('driver_profile_missing_title')}
          </Text>
          <Text style={{ color: v1.textMuted, fontSize: 13, textAlign: 'center', maxWidth: 320, lineHeight: 19 }}>
            {t('driver_profile_missing_body')}
          </Text>
          <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginTop: 14, borderWidth: 1, borderColor: v1Accent.main, borderRadius: 12, paddingHorizontal: 22, paddingVertical: 12 }}>
            <Text style={{ color: v1Accent.main, fontSize: 13, fontWeight: '700' }}>← {t('back_short')}</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const tt = driver.type || driver.vehicle_type || 'tent';
  const accent = role === 'driver' ? '#22C55E' : '#F59E0B';
  // Safe defaults
  const driverName = driver.name || driver.full_name || t('driver_fallback');
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
    <SafeAreaView style={[s.container, { backgroundColor: v1.bg }]} edges={['top']}>
      <BrandBarWithShare
        onBack={() => navigation.goBack()}
        onShare={() => setShareModal(true)}
        accent={v1Accent.main}
        rightTestID="driver-share-btn"
      />
      <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 0, paddingBottom: 60 }}>
        {/* Identity card — branded with the role accent */}
        <GlassCard accent={v1Accent.main} style={{ alignItems: 'center', paddingVertical: 22 }}>
          <View style={[s.avatar, { backgroundColor: (TCOLORS[tt] || '#666') + '22', borderColor: v1Accent.main }]}>
            <Text style={{ fontSize: 32 }}>{FLAGS[driver.country] || '🏳️'}</Text>
          </View>
          <Text style={[s.name, { color: v1.text }]}>
            {driverName} {driver.verified && <Text style={{ color: v1Accent.main }}>✓</Text>}
          </Text>
          <View style={[s.verifyBadge, { backgroundColor: driver.verified ? v1Colors.driverSoft : v1Colors.cargoOwnerSoft, borderColor: driver.verified ? v1Colors.driver : v1Colors.cargoOwner }]}>
            <Text style={[s.verifyText, { color: driver.verified ? v1Colors.driver : v1Colors.cargoOwner }]}>
              {driver.verified ? '🟢 ' + t('verified') : '🟡 ' + t('pending')}
            </Text>
          </View>
          <Text style={s.ratingText}>★ {driver.rating || '—'} <Text style={[s.reviewCount, { color: v1.textMuted }]}>({driver.reviews || 0})</Text></Text>
        </GlassCard>

        <GlassCard>
          <SectionTitle icon="🛡" label={t('reliability_section')} />
          <SecurityBadge userId={driver.id} phone={driver.phone} plate={driver.plate_truck} />
        </GlassCard>

        <GlassCard>
          <SectionTitle icon="🚚" label={t('transport')} />
          <View style={s.grid}>
            {[[t('truckType'), t(tt)], [t('volume'), (driver.m3 || '—') + 'м³'], [t('tonnage'), (driver.tons || '—') + 'т']].map(([l, v]) => (
              <View key={l} style={s.gridItem}>
                <Text style={[s.gridLabel, { color: v1.textMuted }]}>{l}</Text>
                <Text style={[s.gridValue, { color: v1.text }]}>{v}</Text>
              </View>
            ))}
          </View>
        </GlassCard>

        <GlassCard>
          <SectionTitle
            icon="⭐"
            label={`${t('reviews')} (${reviewsData?.summary?.count ?? 0})`}
            right={reviewsData?.summary?.count > 0 ? (
              <Text style={{ color: '#FBBF24', fontSize: 12, fontWeight: '800' }}>★ {reviewsData.summary.average}</Text>
            ) : (
              <Text style={{ color: v1.textDim, fontSize: 10 }}>{t('review_after_trip')}</Text>
            )}
          />

          {(reviewsData?.reviews?.length > 0 ? reviewsData.reviews : REVIEWS).map((r, i, arr) => {
            const isDemo = !reviewsData?.reviews?.length;
            const user = r.user || r.author_id?.slice(0, 8) || t('anonymous');
            const rating = r.rating;
            const text = r.text || '';
            const ago = r.ago || (r.created_at || '').slice(0, 10);
            return (
              <View key={i} style={[s.review, i < arr.length - 1 && { borderBottomWidth: 1, borderBottomColor: v1.border }]}>
                <View style={s.reviewHeader}>
                  <Text style={[s.reviewUser, { color: v1.text }]}>{user}</Text>
                  <Text style={s.reviewStars}>{'★'.repeat(Math.max(0, Math.min(5, parseInt(rating) || 0)))}</Text>
                </View>
                {text ? <Text style={[s.reviewText, { color: v1.textMuted }]}>{text}</Text> : null}
                <Text style={[s.reviewAgo, { color: v1.textMuted }]}>{ago}{isDemo ? ' · демо' : ''}</Text>
              </View>
            );
          })}
        </GlassCard>

        <TouchableOpacity style={[s.contactBtn, { backgroundColor: contactOpened ? v1Colors.driver : v1Accent.main }]} onPress={openContact} disabled={contactOpened}>
          <Text style={[s.contactBtnText, { color: '#0A0A0A' }]}>{contactOpened ? '✓ ' + t('contactOpened') : t('openContact') + ' · $0'}</Text>
        </TouchableOpacity>
        <Text style={[s.betaNote, { color: v1.textMuted }]}>{t('freeForEarly')}</Text>

        <TouchableOpacity
          style={s.reportBtn}
          onPress={() => {
            const ask = () => Platform.OS === 'web'
              ? (window.prompt(t('report_driver_prompt'), '') || '').trim()
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
              toast('🚨 ' + t('report_sent'), 'warn', 4000);
            }).catch(() => toast(t('send_error'), 'error'));
          }}
        >
          <Text style={s.reportBtnText}>🚨 {t('report_driver')}</Text>
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
