// VehicleDocsScreen — Экран 4 «Документы и ТС» (driver PRO-верификация).
//
// Точка сквозного потока верификации водителя: SecurityScreen «Подтвердить
// документы» → этот экран (загрузка техпаспорта + прав с OCR) → Экран 5
// «Параметры фуры» → submit. OCR-эндпоинты: regAPI.uploadPassport /
// uploadLicense (Tesseract на бэке возвращает марку/модель/VIN/госномер/год
// и категории прав с флагом has_c_ce — допуск к фуре).

import React, { useState } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import Feather from '@expo/vector-icons/Feather';
import { useI18n } from '../../utils/useI18n';
import { useToast } from '../../components/Toast';
import { regAPI } from '../../utils/registration';
import { brand, radius, typography } from '../../theme/brandV2';

// Канонический PRO-flow = 4 экрана: Identity → Selfie → документы (этот) →
// параметры фуры → submit. PR-V3 добавил шаги 1–2, документы стали 3/4.
const TOTAL_STEPS = 4;
const STEP = 3;

export default function VehicleDocsScreen({ navigation }) {
  const { t } = useI18n();
  const { toast } = useToast();

  // Каждый док: { uri, status: 'idle'|'busy'|'done'|'error', ocr }
  const [techpass, setTechpass] = useState({ uri: null, status: 'idle', ocr: null });
  const [license, setLicense] = useState({ uri: null, status: 'idle', ocr: null });

  // PR-V4: сохраняем распознанные OCR-поля в черновик сразу после успешного
  // распознавания. Иначе submit/scoring получает пустые license_issue_date /
  // vehicle_year и валидный водитель уходит в red/manual_review. Пишем только
  // непустые значения; raw OCR / номера документов в лог НЕ выводим.
  const persistDraft = async (fields) => {
    const payload = {};
    for (const [k, v] of Object.entries(fields)) {
      if (v !== null && v !== undefined && v !== '') payload[k] = v;
    }
    if (Object.keys(payload).length === 0) return;
    try {
      await regAPI.saveDriverDraft(payload);
    } catch (e) {
      // Fail-tolerant: потеря авто-сейва не должна ломать шаг верификации.
    }
  };

  const pick = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (perm.status !== 'granted') {
      toast(t('photo_permission_required'), 'error');
      return null;
    }
    const r = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.9,
    });
    if (r.canceled || !r.assets?.[0]?.uri) return null;
    return r.assets[0].uri;
  };

  const handleTechpass = async () => {
    const uri = await pick();
    if (!uri) return;
    setTechpass({ uri, status: 'busy', ocr: null });
    try {
      const res = await regAPI.uploadPassport(uri);
      const ex = res?.extracted || {};
      setTechpass({ uri, status: 'done', ocr: ex });
      // OCR техпаспорта → draft (vehicle_* — для submit-скоринга машины).
      await persistDraft({
        vehicle_brand: ex.brand,
        vehicle_model: ex.model,
        vehicle_plate: ex.plate_number,
        vehicle_year: ex.year,
        vehicle_vin: ex.vin,
      });
    } catch (e) {
      setTechpass({ uri, status: 'error', ocr: null });
      toast(t('vdocs_ocr_error'), 'error');
    }
  };

  const handleLicense = async () => {
    const uri = await pick();
    if (!uri) return;
    setLicense({ uri, status: 'busy', ocr: null });
    try {
      const res = await regAPI.uploadLicense(uri);
      setLicense({ uri, status: 'done', ocr: res || null });
      // OCR прав → draft (license_issue_date — стаж, ключевой фактор скоринга).
      const cats = res?.categories || [];
      await persistDraft({
        license_category: cats.length ? cats.join(',') : null,
        license_issue_date: res?.issue_date,
        license_expiry: res?.expiry_date,
      });
    } catch (e) {
      setLicense({ uri, status: 'error', ocr: null });
      toast(t('vdocs_ocr_error'), 'error');
    }
  };

  const techpassDone = techpass.status === 'done';
  const hasCCe = license.ocr?.has_c_ce === true;

  const onNext = () => {
    if (!techpassDone) {
      toast(t('vdocs_need_techpass'), 'error');
      return;
    }
    // Прокидываем распознанный госномер в шаг 5 (блок прицепа).
    navigation.navigate('TruckParams', {
      fromVerification: true,
      plate: techpass.ocr?.plate_number || null,
    });
  };

  const progress = STEP / TOTAL_STEPS;

  const DocCard = ({ title, doc, onPick, children }) => (
    <View style={s.card}>
      <Text style={s.cardTitle}>{title}</Text>
      <Pressable onPress={onPick} style={s.slot} disabled={doc.status === 'busy'}>
        {doc.uri ? (
          <Image source={{ uri: doc.uri }} style={s.thumb} resizeMode="cover" />
        ) : (
          <>
            <Feather name="camera" size={22} color={brand.textSecondary} />
            <Text style={s.slotText}>{t('vdocs_add_photo')}</Text>
          </>
        )}
        {doc.status === 'busy' ? (
          <View style={s.busyOverlay}>
            <ActivityIndicator color={brand.primary} />
            <Text style={s.busyText}>{t('vdocs_processing')}</Text>
          </View>
        ) : null}
      </Pressable>
      {doc.status === 'done' ? children : null}
      {doc.status === 'error' ? <Text style={s.errText}>{t('vdocs_ocr_error')}</Text> : null}
    </View>
  );

  const Field = ({ label, value }) =>
    value ? (
      <View style={s.fieldRow}>
        <Text style={s.fieldLabel}>{label}</Text>
        <Text style={s.fieldValue}>{value}</Text>
      </View>
    ) : null;

  return (
    <SafeAreaView style={s.safe} edges={['top', 'bottom']} testID="vehicle-docs-screen">
      <View style={s.header}>
        <Pressable onPress={() => navigation.goBack()} style={s.backBtn} testID="vd-back">
          <Feather name="arrow-left" size={22} color={brand.textPrimary} />
        </Pressable>
        <View style={s.progressTrack}>
          <View style={[s.progressFill, { width: `${progress * 100}%` }]} />
        </View>
        <Text style={s.stepLabel}>{t('vdocs_step')}</Text>
      </View>

      <ScrollView contentContainerStyle={s.content}>
        <Text style={s.title}>{t('vdocs_title')}</Text>
        <Text style={s.subtitle}>{t('vdocs_subtitle')}</Text>

        <DocCard title={`📄 ${t('vdocs_techpass')}`} doc={techpass} onPick={handleTechpass}>
          <View style={s.ocrBox}>
            <Text style={s.ocrTitle}>✅ {t('vdocs_recognized')}</Text>
            <Field label={t('vdocs_field_brand')} value={[techpass.ocr?.brand, techpass.ocr?.model].filter(Boolean).join(' ')} />
            <Field label={t('vdocs_field_plate')} value={techpass.ocr?.plate_number} />
            <Field label={t('vdocs_field_vin')} value={techpass.ocr?.vin} />
            <Field label={t('vdocs_field_year')} value={techpass.ocr?.year ? String(techpass.ocr.year) : null} />
          </View>
        </DocCard>

        <DocCard title={`🪪 ${t('vdocs_license')}`} doc={license} onPick={handleLicense}>
          <View style={s.ocrBox}>
            <Text style={s.ocrTitle}>✅ {t('vdocs_recognized')}</Text>
            <Field label={t('vdocs_field_categories')} value={(license.ocr?.categories || []).join(', ')} />
            <View style={[s.cceBadge, hasCCe ? s.cceOk : s.cceWarn]}>
              <Text style={[s.cceText, { color: hasCCe ? brand.primary : '#EF4444' }]}>
                {hasCCe ? t('vdocs_cce_ok') : t('vdocs_no_cce')}
              </Text>
            </View>
          </View>
        </DocCard>
      </ScrollView>

      <View style={s.ctaWrap}>
        <Pressable
          onPress={onNext}
          disabled={!techpassDone}
          style={[s.cta, !techpassDone && { opacity: 0.5 }]}
          testID="vd-next"
        >
          <Text style={s.ctaText}>{t('vdocs_next')}</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: brand.bg },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 8 },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  progressTrack: { flex: 1, height: 6, borderRadius: 3, backgroundColor: brand.surfaceMuted, overflow: 'hidden' },
  progressFill: { height: 6, borderRadius: 3, backgroundColor: brand.primary },
  stepLabel: { ...typography.bodySmall, color: brand.textSecondary },
  content: { paddingHorizontal: 20, paddingBottom: 24 },
  title: { ...typography.h1, color: brand.textPrimary, marginBottom: 4 },
  subtitle: { ...typography.bodySmall, color: brand.textSecondary, marginBottom: 16 },
  card: { marginTop: 16, padding: 14, borderRadius: radius.lg, borderWidth: 1, borderColor: brand.border, backgroundColor: brand.surface },
  cardTitle: { ...typography.bodyLarge, fontWeight: '800', color: brand.textPrimary, marginBottom: 10 },
  slot: { height: 160, borderRadius: radius.md, borderWidth: 1, borderStyle: 'dashed', borderColor: brand.border, alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: brand.surfaceMuted, overflow: 'hidden' },
  slotText: { ...typography.bodySmall, color: brand.textSecondary },
  thumb: { width: '100%', height: '100%' },
  busyOverlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.45)', gap: 8 },
  busyText: { ...typography.bodySmall, color: '#fff' },
  ocrBox: { marginTop: 12, padding: 12, borderRadius: radius.md, backgroundColor: brand.surfaceMuted },
  ocrTitle: { ...typography.bodySmall, fontWeight: '800', color: brand.textPrimary, marginBottom: 8 },
  fieldRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4, gap: 12 },
  fieldLabel: { ...typography.bodySmall, color: brand.textSecondary },
  fieldValue: { ...typography.bodySmall, fontWeight: '700', color: brand.textPrimary, flexShrink: 1, textAlign: 'right' },
  cceBadge: { marginTop: 8, paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.sm, alignSelf: 'flex-start' },
  cceOk: { backgroundColor: brand.primarySoft },
  cceWarn: { backgroundColor: 'rgba(239,68,68,0.12)' },
  cceText: { ...typography.caption, fontWeight: '800' },
  errText: { ...typography.caption, color: '#EF4444', marginTop: 8 },
  ctaWrap: { paddingHorizontal: 20, paddingBottom: 16, paddingTop: 8 },
  cta: { height: 56, borderRadius: radius.lg, backgroundColor: brand.primary, alignItems: 'center', justifyContent: 'center' },
  ctaText: { ...typography.button, color: brand.textOnPrimary },
});
