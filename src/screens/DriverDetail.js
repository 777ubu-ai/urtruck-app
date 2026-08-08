import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Alert, Modal, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Feather from '@expo/vector-icons/Feather';
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
import { PhotoGallery } from '../components/PhotoGallery';
import BrandBarWithShare from '../components/ui/v1/BrandBarWithShare';

const TCOLORS = { tent: '#168759', ref: '#16A34A', platform: '#E06D00', auto: '#7C3AED', izoterm: '#059669' };
const FLAGS = { KZ: '🇰🇿', UZ: '🇺🇿', RU: '🇷🇺', KG: '🇰🇬', CN: '🇨🇳' };
const REPORT_REASONS = ['report_reason_fraud', 'report_reason_noshow', 'report_reason_rude', 'report_reason_other'];

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
  const [reportModal, setReportModal] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [isFav, setIsFav] = useState(false);
  const [favBusy, setFavBusy] = useState(false);

  // Избранное: сохранить надёжного перевозчика (персистится на сервере,
  // виден в разделе «Избранное»). Раньше лайки жили в памяти и терялись.
  useEffect(() => {
    if (!driver?.id) return;
    let alive = true;
    marketAPI.favCheck('driver', driver.id).then(v => { if (alive) setIsFav(v); });
    return () => { alive = false; };
  }, [driver?.id]);

  const toggleFav = async () => {
    if (favBusy || !driver?.id) return;
    setFavBusy(true);
    const next = !isFav;
    setIsFav(next); // оптимистично
    const res = next
      ? await marketAPI.favAdd('driver', driver.id, { name: driver.name, type: driver.type || driver.vehicle_type, plate: driver.plate_truck || driver.vehicle_plate })
      : await marketAPI.favRemove('driver', driver.id);
    if (!res.ok) { setIsFav(!next); toast(t('send_error'), 'error'); }
    else toast(next ? '✓ ' + t('in_favorites') : t('removed_from_favorites'), 'success', 1800);
    setFavBusy(false);
  };

  // Жалоба на водителя. Раньше причина бралась только через window.prompt
  // (web) → на iOS/Android reason='' и репорт молча не уходил. Теперь
  // выбор причины через модалку — работает на всех платформах.
  const submitReport = (reason) => {
    if (!reason || reporting) return;
    setReporting(true);
    fetch(`${API_BASE}/report/driver`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        driver_id: driver.id,
        phone: driver.phone,
        plate: driver.plate_truck,
        name: driver.name,
        reason,
        severity: 'high',
      }),
    }).then(r => r.json()).then(() => {
      setReporting(false);
      setReportModal(false);
      toast('🚨 ' + t('report_sent'), 'warn', 4000);
    }).catch(() => {
      setReporting(false);
      toast(t('send_error'), 'error');
    });
  };

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
          <Text style={{ color: '#168759', fontSize: 14, fontWeight: '600' }}>← {t('back_short')}</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  // Soft-empty state: card was for a driver whose profile isn't completed
  // server-side yet (driver_id has a session but the user never finished
  // registration). Showing the full profile UI with empty fields used to
  // crash on null props — now we render a friendly placeholder instead.
  // v1 brand accent: роль смотрящего. Клиент (грузоотправитель), открывая
  // карточку водителя, видит СВОЙ оранжевый акцент — единый клиентский вид
  // (решение владельца 2026-06-13). Водитель, открывая чужую карточку (редко,
  // deep link), видит зелёный.
  const v1Accent = v1AccentFor(role === 'client' || role === 'shipper' ? 'client' : 'driver');

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
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
            <Text style={[s.name, { color: v1.text }]}>{driverName}</Text>
            {driver.verified ? <Feather name="check-circle" size={15} color={v1Accent.main} /> : null}
          </View>
          <View style={[s.verifyBadge, { backgroundColor: driver.verified ? v1Colors.driverSoft : v1Colors.cargoOwnerSoft, borderColor: driver.verified ? v1Colors.driver : v1Colors.cargoOwner }]}>
            <Text style={[s.verifyText, { color: driver.verified ? v1Colors.driver : v1Colors.cargoOwner }]}>
              {driver.verified ? '🟢 ' + t('verified') : '🟡 ' + t('pending')}
            </Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Feather name="star" size={14} color="#D97706" />
            <Text style={s.ratingText}>{driver.rating || '—'} <Text style={[s.reviewCount, { color: v1.textMuted }]}>({driver.reviews || 0})</Text></Text>
          </View>
          {/* Бейджи доверия (соц-механика 满帮): считаются из реальных данных */}
          {(() => {
            const rating = parseFloat(driver.rating) || 0;
            const reviews = parseInt(driver.reviews) || 0;
            const badges = [];
            if (rating >= 4.7 && reviews >= 5) badges.push({ icon: 'check', label: t('badge_reliable') });
            if (reviews >= 10) badges.push({ icon: 'truck', label: t('badge_experienced') });
            if (!badges.length) return null;
            return (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8, justifyContent: 'center' }}>
                {badges.map((b) => (
                  <View key={b.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(0,230,118,0.10)', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 }}>
                    <Feather name={b.icon} size={11} color="#00C766" />
                    <Text style={{ color: '#00C766', fontSize: 11, fontWeight: '800' }}>{b.label}</Text>
                  </View>
                ))}
              </View>
            );
          })()}
        </GlassCard>

        <GlassCard>
          <SectionTitle featherIcon="shield" label={t('reliability_section')} />
          <SecurityBadge userId={driver.id} phone={driver.phone} plate={driver.plate_truck} />
        </GlassCard>

        <GlassCard>
          <SectionTitle featherIcon="truck" label={t('transport')} />
          <View style={s.grid}>
            {/* Stage 17: insert a single space between number and
                unit so values render as "20 т" / "82 м³" instead of
                the squashed "20т" / "82м³" the previous concat
                produced. Matches the canonical formatter used in
                cargoDisplay / tripDisplay. */}
            {/* Показываем ТОЛЬКО заполненные поля — без прочерков «—».
                У сохранённого/непроверенного водителя часто нет объёма/
                тоннажа; вместо пустой карточки показываем что есть
                (тип кузова, госномер, марка/модель, объём, тоннаж). */}
            {[
              [t('truckType'), t(tt)],
              driverPlate ? [t('truckPlate'), driverPlate] : null,
              (driver.vehicle_brand || serverProfile?.vehicle_brand)
                ? [t('brand_model'), [driver.vehicle_brand || serverProfile?.vehicle_brand, driver.vehicle_model || serverProfile?.vehicle_model].filter(Boolean).join(' ')]
                : null,
              driver.m3   ? [t('volume'),  `${driver.m3} м³`] : null,
              driver.tons ? [t('tonnage'), `${driver.tons} т`] : null,
            ].filter(Boolean).map(([l, v]) => (
              <View key={l} style={s.gridItem}>
                <Text style={[s.gridLabel, { color: v1.textMuted }]}>{l}</Text>
                <Text style={[s.gridValue, { color: v1.text }]}>{v}</Text>
              </View>
            ))}
          </View>
          {/* Фото фуры — клиент видит машину перед передачей груза. */}
          {serverProfile?.vehicle_photos?.length ? (
            <View style={{ marginTop: 10 }}>
              <PhotoGallery photos={serverProfile.vehicle_photos} />
            </View>
          ) : null}
        </GlassCard>

        <GlassCard>
          <SectionTitle
            featherIcon="star"
            label={`${t('reviews')} (${reviewsData?.summary?.count ?? 0})`}
            right={reviewsData?.summary?.count > 0 ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                <Feather name="star" size={12} color="#D97706" />
                <Text style={{ color: '#D97706', fontSize: 12, fontWeight: '800' }}>{reviewsData.summary.average}</Text>
              </View>
            ) : (
              <Text style={{ color: v1.textDim, fontSize: 11 }}>{t('review_after_trip')}</Text>
            )}
          />

          {(reviewsData?.reviews?.length > 0) ? reviewsData.reviews.map((r, i, arr) => {
            const user = r.user || r.author_id?.slice(0, 8) || t('anonymous');
            const rating = r.rating;
            const text = r.text || '';
            const ago = r.ago || (r.created_at || '').slice(0, 10);
            return (
              <View key={i} style={[s.review, i < arr.length - 1 && { borderBottomWidth: 1, borderBottomColor: v1.border }]}>
                <View style={s.reviewHeader}>
                  <Text style={[s.reviewUser, { color: v1.text }]}>{user}</Text>
                  <View style={{ flexDirection: 'row', gap: 1 }}>
                    {Array.from({ length: Math.max(0, Math.min(5, parseInt(rating) || 0)) }).map((_, k) => (
                      <Feather key={k} name="star" size={12} color="#D97706" />
                    ))}
                  </View>
                </View>
                {Array.isArray(r.tags) && r.tags.length > 0 ? (
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 4, marginBottom: 2 }}>
                    {r.tags.map((tag) => (
                      <View key={tag} style={{ paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, backgroundColor: '#D9770618', borderWidth: 1, borderColor: '#D97706' }}>
                        <Text style={{ fontSize: 10, fontWeight: '600', color: '#D97706' }}>{t(`rating_tag_${tag}`) || tag}</Text>
                      </View>
                    ))}
                  </View>
                ) : null}
                {text ? <Text style={[s.reviewText, { color: v1.textMuted }]}>{text}</Text> : null}
                <Text style={[s.reviewAgo, { color: v1.textMuted }]}>{ago}</Text>
              </View>
            );
          }) : (
            <Text style={[s.reviewText, { color: v1.textMuted, paddingVertical: 6 }]}>{t('review_after_trip')}</Text>
          )}
        </GlassCard>

        <TouchableOpacity style={[s.contactBtn, { backgroundColor: contactOpened ? v1Colors.driver : v1Accent.main }]} onPress={openContact} disabled={contactOpened}>
          {contactOpened ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Feather name="check-circle" size={16} color="#0A0A0A" />
              <Text style={[s.contactBtnText, { color: '#0A0A0A' }]}>{t('contactOpened')}</Text>
            </View>
          ) : (
            <Text style={[s.contactBtnText, { color: '#0A0A0A' }]}>{t('openContact')}</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={[s.favBtn, { borderColor: isFav ? v1Colors.driver : v1.border }]}
          onPress={toggleFav}
          disabled={favBusy}
          testID="driver-fav-btn"
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, justifyContent: 'center' }}>
            <Feather name="heart" size={15} color={isFav ? v1Colors.driver : v1.text} />
            <Text style={[s.favBtnText, { color: isFav ? v1Colors.driver : v1.text }]}>
              {isFav ? t('in_favorites') : t('add_to_favorites')}
            </Text>
          </View>
        </TouchableOpacity>
        <Text style={[s.betaNote, { color: v1.textMuted }]}>{t('freeForEarly')}</Text>

        <TouchableOpacity
          style={s.reportBtn}
          onPress={() => setReportModal(true)}
          testID="report-driver-btn"
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, justifyContent: 'center' }}>
            <Feather name="alert-triangle" size={14} color="#EF4444" />
            <Text style={s.reportBtnText}>{t('report_driver')}</Text>
          </View>
        </TouchableOpacity>
      </ScrollView>

      <Modal
        visible={reportModal}
        transparent
        animationType="fade"
        onRequestClose={() => !reporting && setReportModal(false)}
      >
        <Pressable style={s.modalOverlay} onPress={() => !reporting && setReportModal(false)}>
          <Pressable style={[s.modalCard, { backgroundColor: v1.card, borderColor: v1.border }]} onPress={() => {}}>
            <Text style={[s.modalTitle, { color: v1.text }]}>{t('report_choose_reason')}</Text>
            {REPORT_REASONS.map((rk) => (
              <TouchableOpacity
                key={rk}
                style={[s.reasonRow, { borderColor: v1.border }]}
                onPress={() => submitReport(t(rk))}
                disabled={reporting}
                activeOpacity={0.7}
              >
                <Text style={[s.reasonText, { color: v1.text }]}>{t(rk)}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity onPress={() => setReportModal(false)} style={s.reasonCancel} disabled={reporting}>
              <Text style={[s.reasonCancelText, { color: v1.textMuted }]}>{t('cancel')}</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
      <ShareModal visible={shareModal} onClose={() => setShareModal(false)} shareText={'UrTruck: ' + driver.name + ', ' + t(tt) + (driver.m3 ? ` ${driver.m3} м³` : '')} phone={driver.phone} driverId={driver.id} />
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
  sectionTitle: { fontSize: 11, fontWeight: '600', letterSpacing: 1, marginBottom: 12 },
  avatar: { width: 64, height: 64, borderRadius: 20, alignItems: 'center', justifyContent: 'center', borderWidth: 2, marginBottom: 10 },
  name: { fontSize: 20, fontWeight: '800', marginBottom: 4 },
  verifyBadge: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12, marginBottom: 6 },
  verifyText: { fontSize: 12, fontWeight: '600' },
  ratingText: { color: '#D97706', fontSize: 14, fontWeight: '700' },
  reviewCount: { fontWeight: '400' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  gridItem: { width: '50%', marginBottom: 10 },
  gridLabel: { fontSize: 11 },
  gridValue: { fontSize: 13, fontWeight: '600', marginTop: 2 },
  review: { marginBottom: 10, paddingBottom: 10 },
  reviewHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  reviewUser: { fontSize: 13, fontWeight: '600' },
  reviewStars: { color: '#D97706', fontSize: 12 },
  reviewText: { fontSize: 12 },
  reviewAgo: { fontSize: 11, marginTop: 3 },
  contactBtn: { borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginTop: 6 },
  contactBtnText: { fontSize: 16, fontWeight: '800' },
  betaNote: { fontSize: 11, textAlign: 'center', marginTop: 6 },
  favBtn: { marginTop: 10, borderWidth: 1, paddingVertical: 14, borderRadius: 14, alignItems: 'center', minHeight: 48, justifyContent: 'center' },
  favBtnText: { fontSize: 14, fontWeight: '800' },
  reportBtn: { marginTop: 12, backgroundColor: '#EF444415', borderWidth: 1, borderColor: '#EF444430', paddingVertical: 14, borderRadius: 14, alignItems: 'center' },
  reportBtnText: { color: '#EF4444', fontSize: 13, fontWeight: '700' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  modalCard: { borderTopLeftRadius: 20, borderTopRightRadius: 20, borderWidth: 1, padding: 20, paddingBottom: 32 },
  modalTitle: { fontSize: 18, fontWeight: '800', marginBottom: 14, textAlign: 'center' },
  reasonRow: { paddingVertical: 16, paddingHorizontal: 14, borderWidth: 1, borderRadius: 12, marginBottom: 10, minHeight: 52, justifyContent: 'center' },
  reasonText: { fontSize: 15, fontWeight: '600' },
  reasonCancel: { paddingVertical: 14, alignItems: 'center', marginTop: 4, minHeight: 48, justifyContent: 'center' },
  reasonCancelText: { fontSize: 15, fontWeight: '700' },
});
