// VehicleDocsScreen — Шаг 3/5 PRO-верификации (документы водителя + права).
//
// Канонический PRO-flow: Identity → Selfie → этот экран → VehiclePhotos →
// TruckParams → submit. Собирает: техпаспорт/СРТС (OCR), водительские права
// (OCR), селфи с правами в руках (антифрод), редактируемые дата выдачи + срок
// действия прав. Фото авто/салона вынесены в отдельный шаг VehiclePhotos
// (PR-V9). raw OCR / номера документов в лог НЕ выводим.

import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
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
import RegistrationCloseModal from '../../components/RegistrationCloseModal';
import RegistrationHelpSheet from '../../components/RegistrationHelpSheet';
import PhotoGuide from '../../components/PhotoGuide';
import QaStepSkip from '../../components/dev/QaStepSkip';
import { brand, radius, typography } from '../../theme/brandV2';

const TOTAL_STEPS = 5;
const STEP = 3;

// Маска ДД.ММ.ГГГГ: только цифры (до 8), точки расставляются сами.
const maskDate = (v) => {
  const d = String(v).replace(/\D/g, '').slice(0, 8);
  const parts = [];
  if (d.length > 0) parts.push(d.slice(0, 2));
  if (d.length > 2) parts.push(d.slice(2, 4));
  if (d.length > 4) parts.push(d.slice(4, 8));
  return parts.join('.');
};

// Парс ДД.ММ.ГГГГ → Date | null (валидная календарная дата).
const parseDate = (v) => {
  const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(String(v || '').trim());
  if (!m) return null;
  const day = +m[1], mon = +m[2], year = +m[3];
  if (mon < 1 || mon > 12 || day < 1 || day > 31) return null;
  const d = new Date(year, mon - 1, day);
  if (d.getFullYear() !== year || d.getMonth() !== mon - 1 || d.getDate() !== day) return null;
  return d;
};

export default function VehicleDocsScreen({ navigation }) {
  const { t } = useI18n();
  const { toast } = useToast();

  // Каждый док: { uri, status: 'idle'|'busy'|'done'|'error', ocr/key }
  const [techpass, setTechpass] = useState({ uri: null, status: 'idle', ocr: null });
  const [license, setLicense] = useState({ uri: null, status: 'idle', ocr: null });
  const [licenseSelfie, setLicenseSelfie] = useState({ uri: null, status: 'idle', key: null });
  const [licenseIssue, setLicenseIssue] = useState('');   // дата выдачи (required)
  const [licenseExpiry, setLicenseExpiry] = useState(''); // срок действия (required)
  const [errors, setErrors] = useState({});
  const [closeVisible, setCloseVisible] = useState(false);
  const [helpVisible, setHelpVisible] = useState(false);

  // ТЗ блок 10: при закрытии — дописать несохранённые даты прав в draft (фото
  // уже persist server-side). Бросаем при !ok, чтобы модал не вышел молча.
  const saveDraftOnClose = async () => {
    const payload = {};
    if (licenseIssue.trim()) payload.license_issue_date = licenseIssue.trim();
    if (licenseExpiry.trim()) payload.license_expiry = licenseExpiry.trim();
    if (!Object.keys(payload).length) return;
    const res = await regAPI.saveDriverDraft(payload);
    if (!res.ok) throw new Error('save_failed');
  };

  // PR-V4: сохраняем распознанные/введённые поля в черновик. Иначе submit/
  // scoring получает пустые license_issue_date / vehicle_year и валидный
  // водитель уходит в red/manual_review. Пишем только непустые значения.
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
      // Префилл редактируемых дат из OCR (если распознаны).
      if (res?.issue_date && !licenseIssue) setLicenseIssue(maskDate(res.issue_date));
      if (res?.expiry_date && !licenseExpiry) setLicenseExpiry(maskDate(res.expiry_date));
      const cats = res?.categories || [];
      await persistDraft({
        license_category: cats.length ? cats.join(',') : null,
        license_issue_date: res?.issue_date,
        license_expiry: res?.expiry_date,
        license_number: res?.license_number,
      });
    } catch (e) {
      setLicense({ uri, status: 'error', ocr: null });
      toast(t('vdocs_ocr_error'), 'error');
    }
  };

  // Селфи с правами в руках — реальный server-side upload (antifraud). Без
  // успешного upload дальше НЕ пускаем (no fake-success).
  const handleLicenseSelfie = async () => {
    const uri = await pick();
    if (!uri) return;
    setLicenseSelfie({ uri, status: 'busy', key: null });
    try {
      const up = await regAPI.uploadLicenseSelfie(uri);
      const key = up?.license_selfie_key || null;
      if (!key) throw new Error('no_key');
      setLicenseSelfie({ uri, status: 'done', key });
      await persistDraft({ license_selfie_url: key });
      if (errors.licenseSelfie) setErrors({ ...errors, licenseSelfie: null });
    } catch (e) {
      setLicenseSelfie({ uri, status: 'error', key: null });
      toast(t('vdocs_license_selfie_upload_err'), 'error', 5000);
    }
  };

  const techpassDone = techpass.status === 'done';
  const licenseDone = license.status === 'done';
  const licenseSelfieDone = licenseSelfie.status === 'done';
  const hasCCe = license.ocr?.has_c_ce === true;

  const validateIssue = (v) => {
    if (!v) return t('vdocs_err_issue');
    const d = parseDate(v);
    if (!d) return t('vdocs_err_issue');
    if (d > new Date()) return t('vdocs_err_issue'); // выдача не в будущем
    return null;
  };
  const validateExpiry = (v) => {
    if (!v) return t('vdocs_err_expiry');
    const d = parseDate(v);
    if (!d) return t('vdocs_err_expiry');
    if (d < new Date()) return t('vdocs_err_expired'); // просрочены
    return null;
  };

  const onNext = async () => {
    const e = {
      techpass: techpassDone ? null : t('vdocs_need_techpass'),
      license: licenseDone ? null : t('vdocs_err_license'),
      licenseSelfie: licenseSelfieDone ? null : t('vdocs_err_license_selfie'),
      issue: validateIssue(licenseIssue),
      expiry: validateExpiry(licenseExpiry),
    };
    setErrors(e);
    const firstErr = Object.values(e).find(Boolean);
    if (firstErr) {
      toast(firstErr, 'error');
      return;
    }
    // Финальная персистенция дат (на случай ручного редактирования).
    await persistDraft({
      license_issue_date: licenseIssue.trim(),
      license_expiry: licenseExpiry.trim(),
    });
    navigation.navigate('VehiclePhotos', {
      fromVerification: true,
      plate: techpass.ocr?.plate_number || null,
    });
  };

  const progress = STEP / TOTAL_STEPS;

  const DocCard = ({ title, hint, doc, onPick, errorText, children }) => (
    <View style={s.card}>
      <Text style={s.cardTitle}>{title}</Text>
      {hint ? <Text style={s.cardHint}>{hint}</Text> : null}
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
      {doc.status === 'error' ? <Text style={s.errText}>{errorText || t('vdocs_ocr_error')}</Text> : null}
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
        <Pressable onPress={() => setHelpVisible(true)} style={s.backBtn} testID="vd-help" accessibilityLabel={t('reg_help_open')}>
          <Feather name="help-circle" size={22} color={brand.textSecondary} />
        </Pressable>
        <Pressable onPress={() => setCloseVisible(true)} style={s.backBtn} testID="vd-close">
          <Feather name="x" size={22} color={brand.textPrimary} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
        <Text style={s.title}>{t('vdocs_title')}</Text>
        <Text style={s.subtitle}>{t('vdocs_subtitle')}</Text>

        <DocCard title={`📄 ${t('vdocs_techpass')}`} hint={t('vdocs_hint_techpass')} doc={techpass} onPick={handleTechpass}>
          <View style={s.ocrBox}>
            <Text style={s.ocrTitle}>✅ {t('vdocs_recognized')}</Text>
            <Field label={t('vdocs_field_brand')} value={[techpass.ocr?.brand, techpass.ocr?.model].filter(Boolean).join(' ')} />
            <Field label={t('vdocs_field_plate')} value={techpass.ocr?.plate_number} />
            <Field label={t('vdocs_field_vin')} value={techpass.ocr?.vin} />
            <Field label={t('vdocs_field_year')} value={techpass.ocr?.year ? String(techpass.ocr.year) : null} />
          </View>
        </DocCard>

        <PhotoGuide
          source={require('../../assets/onboarding/verification/guides/license_front_guide.png')}
          testID="vd-license-guide"
        />
        <DocCard title={`🪪 ${t('vdocs_license')}`} hint={t('vdocs_hint_license')} doc={license} onPick={handleLicense}>
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

        {/* Редактируемые даты прав — обязательны (prefill из OCR). */}
        <Text style={s.label}>{t('vdocs_field_issue')}</Text>
        <TextInput
          value={licenseIssue}
          onChangeText={(v) => { setLicenseIssue(maskDate(v)); if (errors.issue) setErrors({ ...errors, issue: null }); }}
          keyboardType="numeric"
          maxLength={10}
          placeholder={t('vdocs_date_ph')}
          placeholderTextColor={brand.textTertiary}
          style={[s.input, errors.issue && s.inputErr]}
          testID="vd-license-issue"
        />
        {errors.issue ? <Text style={s.errText}>{errors.issue}</Text> : null}

        <Text style={s.label}>{t('vdocs_field_expiry')}</Text>
        <TextInput
          value={licenseExpiry}
          onChangeText={(v) => { setLicenseExpiry(maskDate(v)); if (errors.expiry) setErrors({ ...errors, expiry: null }); }}
          keyboardType="numeric"
          maxLength={10}
          placeholder={t('vdocs_date_ph')}
          placeholderTextColor={brand.textTertiary}
          style={[s.input, errors.expiry && s.inputErr]}
          testID="vd-license-expiry"
        />
        {errors.expiry ? <Text style={s.errText}>{errors.expiry}</Text> : null}

        {/* Селфи с правами в руках (антифрод, обязательно) */}
        <PhotoGuide
          source={require('../../assets/onboarding/verification/guides/selfie_license_guide.png')}
          testID="vd-license-selfie-guide"
        />
        <DocCard
          title={`🤳 ${t('vdocs_license_selfie')}`}
          hint={t('vdocs_hint_license_selfie')}
          doc={licenseSelfie}
          onPick={handleLicenseSelfie}
          errorText={t('vdocs_license_selfie_upload_err')}
        >
          <View style={s.okBox}>
            <Text style={s.okText}>✅ {t('vdocs_uploaded')}</Text>
          </View>
        </DocCard>
        {errors.licenseSelfie ? <Text style={s.errText}>{errors.licenseSelfie}</Text> : null}
        {errors.license ? <Text style={s.errText}>{errors.license}</Text> : null}

        {/* DEV/QA-only: прыжок на VehiclePhotos в обход OCR/upload-гейтов. */}
        <QaStepSkip
          onPress={() => navigation.navigate('VehiclePhotos', { fromVerification: true, plate: null })}
        />
      </ScrollView>

      <View style={s.ctaWrap}>
        <Pressable onPress={onNext} style={s.cta} testID="vd-next">
          <Text style={s.ctaText}>{t('vdocs_next')}</Text>
        </Pressable>
      </View>
      <RegistrationCloseModal
        visible={closeVisible}
        onCancel={() => setCloseVisible(false)}
        onExit={() => { setCloseVisible(false); navigation.navigate('Main'); }}
        saveDraft={saveDraftOnClose}
      />
      <RegistrationHelpSheet visible={helpVisible} onClose={() => setHelpVisible(false)} />
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
  label: { ...typography.bodySmall, fontWeight: '700', color: brand.textPrimary, marginTop: 18, marginBottom: 8 },
  input: { height: 52, borderRadius: radius.md, borderWidth: 1, borderColor: brand.border, backgroundColor: brand.surface, paddingHorizontal: 16, color: brand.textPrimary, ...typography.body },
  inputErr: { borderColor: brand.error || '#EF4444' },
  card: { marginTop: 16, padding: 14, borderRadius: radius.lg, borderWidth: 1, borderColor: brand.border, backgroundColor: brand.surface },
  cardTitle: { ...typography.bodyLarge, fontWeight: '800', color: brand.textPrimary, marginBottom: 4 },
  cardHint: { ...typography.caption, color: brand.textSecondary, marginBottom: 10, lineHeight: 16 },
  slot: { height: 160, borderRadius: radius.md, borderWidth: 1, borderStyle: 'dashed', borderColor: brand.border, alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: brand.surfaceMuted, overflow: 'hidden' },
  slotText: { ...typography.bodySmall, color: brand.textSecondary },
  thumb: { width: '100%', height: '100%' },
  busyOverlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.45)', gap: 8 },
  busyText: { ...typography.bodySmall, color: '#fff' },
  ocrBox: { marginTop: 12, padding: 12, borderRadius: radius.md, backgroundColor: brand.surfaceMuted },
  ocrTitle: { ...typography.bodySmall, fontWeight: '800', color: brand.textPrimary, marginBottom: 8 },
  okBox: { marginTop: 12, padding: 12, borderRadius: radius.md, backgroundColor: brand.primarySoft },
  okText: { ...typography.bodySmall, fontWeight: '800', color: brand.primary },
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
