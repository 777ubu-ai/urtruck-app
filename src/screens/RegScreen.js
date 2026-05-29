import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Image, ActivityIndicator, Platform, Modal, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect } from '@react-navigation/native';
import { useI18n } from '../utils/useI18n';
import { useTheme } from '../utils/ThemeContext';
import { useAuth } from '../utils/AuthContext';
import { useToast } from '../components/Toast';
import { saveProfile } from '../utils/store';
import { regAPI } from '../utils/registration';
import ConsentRow from '../components/ConsentRow';
import ShimmerButton from '../components/ShimmerButton';
import GradientText from '../components/GradientText';
import HelpButton from '../components/HelpButton';
import { useDraft, clearDraft } from '../utils/useDraft';
import { translit, hasCyrillic } from '../utils/translit';
import { compressImage } from '../utils/imageCompress';

const buildSteps = (t) => [
  { id: 1, name: t('reg_step_whatsapp'),  icon: '💬' },
  { id: 2, name: t('reg_step_identity'),  icon: '🤳' },
  { id: 3, name: t('reg_step_documents'), icon: '📄' },
  { id: 4, name: t('reg_step_transport'), icon: '🚛' },
  { id: 5, name: t('reg_step_done'),      icon: '✅' },
];

const buildVehicleTypes = (t) => [
  { key: 'tent',     label: t('reg_vehicle_tent'),     icon: '🚚' },
  { key: 'ref',      label: t('reg_vehicle_ref'),      icon: '🧊' },
  { key: 'platform', label: t('reg_vehicle_platform'), icon: '🛻' },
  { key: 'cont40',   label: t('reg_vehicle_cont40'),   icon: '📦' },
  { key: 'tanker',   label: t('reg_vehicle_tanker'),   icon: '🛢️' },
  { key: 'auto',     label: t('reg_vehicle_auto'),     icon: '🚗' },
  { key: 'van',      label: t('reg_vehicle_van'),      icon: '🚐' },
];

export default function RegScreen({ navigation, route }) {
  const { role } = route.params || { role: 'driver' };
  const isDriver = role === 'driver';
  // PR-D1 (build 18): driver-аккцент мигрировал с indigo #4F46E5 на
  // фирменный изумрудный неон #00E676. Текст поверх кнопок — чёрный
  // (#0C0A09, контраст 11.4:1 на изумруде, AAA). #22C55E ниже остаётся
  // как семантический success-маркер (проверенный документ/шаг).
  const accent = isDriver ? '#00E676' : '#F59E0B';
  const onAccent = '#0C0A09';
  const { t } = useI18n();
  const { theme } = useTheme();
  const { session, setRole, verificationLevel } = useAuth();
  const { toast } = useToast();
  const STEPS = buildSteps(t);
  const VEHICLE_TYPES = buildVehicleTypes(t);

  // Если юзер уже прошёл Auth через OTP (level >= 1), шаг WhatsApp пропускаем
  const initialStep = verificationLevel >= 1 ? 2 : 1;
  const [step, setStep] = useState(initialStep);
  const [loading, setLoading] = useState(false);
  const [uploadStage, setUploadStage] = useState(null); // 'compressing' | 'uploading' | null

  useEffect(() => {
    if (verificationLevel >= 1 && step === 1) setStep(2);
  }, [verificationLevel]);

  // Step 1: WhatsApp
  const [phone, setPhone] = useState('+77001234567');
  const [code, setCode] = useState('');
  const [mockCode, setMockCode] = useState(null);
  // Stage 24: legal consent gate.
  const [consent, setConsent] = useState(false);

  // Step 2: Digital ID
  const [iin, setIin] = useState('');
  const [fullName, setFullName] = useState('');
  const [selfieUri, setSelfieUri] = useState(null);
  const [faceResult, setFaceResult] = useState(null);
  // HOT-008/HOT2-006: inline-валидация
  const [nameErr, setNameErr] = useState(null);
  const [iinErr, setIinErr] = useState(null);

  const validateName = (v) => {
    if (!v || v.trim().length < 3) return t('val_name_short');
    return null;
  };
  const validateIin = (v) => {
    if (!v) return t('val_required');
    if (!/^\d+$/.test(v)) return t('val_iin_digits');
    if (v.length !== 12) return t('val_iin_12');
    return null;
  };

  // Step 3: Documents
  const [licenseUri, setLicenseUri] = useState(null);
  const [licenseData, setLicenseData] = useState(null);
  const [passportUri, setPassportUri] = useState(null);
  const [passportData, setPassportData] = useState(null);

  // Step 4: Vehicle
  const [vehicleType, setVehicleType] = useState('tent');
  const [capacityKg, setCapacityKg] = useState('22000');
  const [vehiclePhoto, setVehiclePhoto] = useState(null);

  // Step 5: Moderation
  const [moderation, setModeration] = useState(null);

  // PR-D1: Draft mode — автосохраняем поля step 1 (телефон) и step 2
  // (ИИН, имя) на каждом onChange. Если водитель потерял сеть, ушёл
  // в фон или OS убила процесс — данные восстановятся при возврате.
  // Селфи/документы/фото машины — uri'ы локальных файлов, в драфт
  // не пишем (могут протухнуть).
  const draftKey = `reg_driver_${session?.user?.id || 'guest'}`;
  useDraft(
    draftKey,
    { phone, iin, fullName },
    { phone: setPhone, iin: setIin, fullName: setFullName },
    { enabled: isDriver },
  );

  // PR-D1: Bottom Sheet «Прервать регистрацию?» при попытке выйти.
  // Перехватываем navigation.beforeRemove только пока step ≤ 4 (на
  // step 5 модерация запущена — пусть уходит спокойно).
  const [exitVisible, setExitVisible] = useState(false);
  const [pendingNavAction, setPendingNavAction] = useState(null);
  useFocusEffect(useCallback(() => {
    const unsub = navigation.addListener('beforeRemove', (e) => {
      if (!isDriver || step >= 5 || moderation?.auto_approved) return;
      // Если уже подтвердили — не блокируем
      if (e.data?.action?.payload?._urConfirmedExit) return;
      e.preventDefault();
      setPendingNavAction(e.data.action);
      setExitVisible(true);
    });
    return unsub;
  }, [navigation, isDriver, step, moderation]));

  const onConfirmExit = () => {
    setExitVisible(false);
    const action = pendingNavAction;
    setPendingNavAction(null);
    if (action) {
      // Помечаем action чтобы beforeRemove пропустил
      const marked = { ...action, payload: { ...(action.payload || {}), _urConfirmedExit: true } };
      navigation.dispatch(marked);
    } else {
      navigation.goBack();
    }
  };

  // Для клиента — упрощённая форма
  if (!isDriver) return <ClientReg navigation={navigation} setRole={setRole} session={session} theme={theme} t={t} toast={toast} accent={accent} />;

  const pickImage = async (useCamera = false) => {
    // На web ImagePicker может открыть либо file input, либо камеру через getUserMedia
    // HOT-007: если камеры нет — fallback на галерею
    if (useCamera && Platform.OS !== 'web') {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        toast(t('photo_camera_permission'), 'warn');
        return null;
      }
      try {
        const r = await ImagePicker.launchCameraAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          quality: 0.8,
          cameraType: ImagePicker.CameraType.front,
          allowsEditing: true,
          aspect: [1, 1],
        });
        if (r.canceled || !r.assets?.[0]) return null;
        return r.assets[0].uri;
      } catch (e) {
        console.warn('[Reg] camera failed, fallback to gallery:', e);
      }
    }
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      toast(t('photo_gallery_permission'), 'warn');
      return null;
    }
    const r = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.9,
    });
    if (r.canceled || !r.assets?.[0]) return null;
    return r.assets[0].uri;
  };

  const onSendCode = async () => {
    if (phone.length < 10) { toast(t('reg_enter_phone'), 'error'); return; }
    if (!consent) { toast(t('registration_consent_required'), 'warn'); return; }
    setLoading(true);
    const r = await regAPI.sendCode(phone, 'whatsapp', { consent: true, role });
    setLoading(false);
    if (r.sent) {
      if (r.code) setMockCode(r.code);
      toast(r.mock ? `💬 ${t('reg_mock_code_toast')} ${r.code}` : '💬 ' + t('reg_code_sent_wa'), 'success', 5000);
    } else {
      toast(r.detail || t('send_error'), 'error');
    }
  };

  const onVerifyCode = async () => {
    if (code.length < 4) { toast(t('reg_enter_code'), 'error'); return; }
    setLoading(true);
    const r = await regAPI.verifyCode(phone, code);
    setLoading(false);
    if (r.token) {
      toast('✓ ' + t('reg_wa_confirmed'), 'success');
      setStep(2);
    } else {
      toast(r.detail || t('reg_wrong_code'), 'error');
    }
  };

  const onSelfie = async () => {
    // HOT-007: активная обратная связь о причине блокировки
    const nErr = validateName(fullName);
    const iErr = validateIin(iin);
    setNameErr(nErr);
    setIinErr(iErr);
    if (nErr || iErr) {
      toast('⚠ ' + t('reg_check_name_iin'), 'error', 3500);
      return;
    }
    // Камера для селфи (фронтальная), галерея fallback
    const uri = await pickImage(true);
    if (!uri) return;
    setSelfieUri(uri);
    setLoading(true);
    try {
      // full_name автоматически транслит в латиницу для backend
      const latinName = hasCyrillic(fullName) ? translit(fullName) : fullName;
      const r = await regAPI.uploadSelfie(iin, latinName, uri, setUploadStage);
      setFaceResult(r);
      if (r.face_verified) {
        toast(`✓ ${t('reg_selfie_confirmed')} (${Math.round((r.liveness_confidence || 0) * 100)}%)`, 'success');
        setStep(3);
      } else {
        toast(r.detail || '⚠ ' + t('reg_selfie_bad_photo'), 'warn', 5000);
      }
    } catch (e) {
      toast(t('send_error') + ': ' + (e.message || e), 'error');
    } finally {
      setLoading(false);
      setUploadStage(null);
    }
  };

  const onLicense = async () => {
    const uri = await pickImage();
    if (!uri) return;
    setLicenseUri(uri);
    setLoading(true);
    try {
      const r = await regAPI.uploadLicense(uri, setUploadStage);
      setLicenseData(r);
      if (r.verified) toast(`✓ ${t('reg_license_ok')}: ${(r.categories || []).join(', ') || 'OK'}`, 'success');
      else toast('⚠ ' + t('reg_license_partial'), 'warn');
    } catch (e) {
      toast(t('generic_error') + ': ' + (e.message || e), 'error');
    } finally {
      setLoading(false);
      setUploadStage(null);
    }
  };

  const onPassport = async () => {
    const uri = await pickImage();
    if (!uri) return;
    setPassportUri(uri);
    setLoading(true);
    try {
      const r = await regAPI.uploadPassport(uri, setUploadStage);
      setPassportData(r);
      if (r.verified) {
        toast(`✓ ${r.extracted?.plate_number || ''} · ${r.extracted?.year || ''}`, 'success');
        if (licenseUri) setStep(4);
      } else {
        toast('⚠ ' + t('reg_ocr_low_conf'), 'warn');
      }
    } catch (e) {
      toast(t('generic_error') + ': ' + (e.message || e), 'error');
    } finally {
      setLoading(false);
      setUploadStage(null);
    }
  };

  const onVehicle = async () => {
    setLoading(true);
    try {
      const r = await regAPI.saveVehicle({
        vehicleType,
        capacityKg: parseInt(capacityKg) || 0,
        plate: passportData?.extracted?.plate_number,
        brand: passportData?.extracted?.brand,
        year: passportData?.extracted?.year,
        photoUri: vehiclePhoto,
        onProgress: setUploadStage,
      });
      if (r.step) setStep(5);
      else toast(t('save_error'), 'error');
    } catch (e) {
      toast(t('network_error') + ': ' + (e.message || ''), 'error');
    } finally {
      setLoading(false);
      setUploadStage(null);
    }
  };

  const onModerate = async () => {
    setLoading(true);
    const r = await regAPI.moderate();
    setLoading(false);
    setModeration(r);
    if (r.auto_approved) {
      const userId = session?.user?.id || 'driver_' + Date.now();
      saveProfile(userId, {
        role: 'driver',
        truckType: vehicleType,
        capacity_tons: Math.round((parseInt(capacityKg) || 0) / 1000),
        plate_truck: passportData?.extracted?.plate_number,
        full_name: fullName,
        iin,
        is_verified: true,
        security_score: r.security_score,
        security_color: r.security_color,
      });
      // Bug #4: серверный профиль (/users/me) не знал имя водителя — после
      // перезагрузки ProfileScreen показывал «Добавить имя». Пушим name в БД
      // тем же PATCH, что использует PRO-профиль. Fail-tolerant: PATCH идёт
      // под bearer-токеном, поэтому не зависит от локального userId (N3).
      try { await regAPI.updateProfile({ name: fullName }); }
      catch (e) { console.warn('[Reg] driver name sync failed:', e); }
      // PR-D1: успешная регистрация — драфт можно стереть
      clearDraft(draftKey);
      setTimeout(() => { setRole('driver'); toast('🎉 ' + t('reg_complete_toast'), 'success'); }, 2500);
    } else if (r.status === 'rejected') {
      toast(`⛔ ${t('reg_rejected_toast')}: ${r.rejected_reason}`, 'error', 8000);
    } else {
      toast('⏳ ' + t('reg_manual_review_toast'), 'info', 5000);
    }
  };

  return (
    <SafeAreaView style={[s.container, { backgroundColor: theme.bg }]}>
      {/* PR-D1: [?] помощь в правом верхнем углу */}
      <View style={s.helpAnchor}>
        <HelpButton accent={accent} />
      </View>

      {/* PR-D1: Bottom Sheet «Прервать регистрацию?» */}
      <Modal visible={exitVisible} transparent animationType="slide" onRequestClose={() => setExitVisible(false)}>
        <Pressable style={s.exitBackdrop} onPress={() => setExitVisible(false)}>
          <Pressable style={[s.exitSheet, { backgroundColor: theme.card }]} onPress={(e) => e.stopPropagation()}>
            <View style={s.exitHandle} />
            <Text style={[s.exitTitle, { color: theme.text }]}>{t('reg_exit_title')}</Text>
            <Text style={[s.exitBody, { color: theme.textMuted }]}>{t('reg_exit_body')}</Text>
            <TouchableOpacity
              style={[s.exitPrimary, { backgroundColor: accent }]}
              onPress={() => setExitVisible(false)}
              activeOpacity={0.85}
            >
              <Text style={[s.exitPrimaryText, { color: onAccent }]}>{t('reg_exit_continue')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.exitSecondary} onPress={onConfirmExit} activeOpacity={0.7}>
              <Text style={[s.exitSecondaryText, { color: theme.textMuted }]}>{t('reg_exit_leave')}</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      <ScrollView contentContainerStyle={s.scroll}>
        {/* Stage 34: role-aware заголовок и подзаголовок поверх
            прогресс-бара — пользователь сразу видит, в какой
            именно flow он попал ("Регистрация водителя" /
            "Регистрация грузовладельца"). Раньше показывался
            только короткий "💬 Подтверждение телефона", без
            контекста роли — владелец говорил "непонятный экран". */}
        {step === 1 ? (
          <View style={{ marginBottom: 16 }}>
            <Text style={[s.heading, { color: theme.text, marginBottom: 6 }]}>
              {role === 'driver' ? t('reg_screen_title_driver') : t('reg_screen_title_client')}
            </Text>
            <Text style={[s.hint, { color: theme.textMuted }]}>
              {role === 'driver' ? t('reg_subtitle_driver') : t('reg_subtitle_client')}
            </Text>
          </View>
        ) : null}

        {/* Прогресс */}
        <View style={s.progress}>
          {STEPS.map(st => (
            <View key={st.id} style={s.stepItem}>
              <View style={[s.stepDot, { backgroundColor: st.id <= step ? accent : theme.border }]}>
                <Text style={[s.stepIcon, { color: st.id <= step ? '#fff' : theme.textMuted }]}>{st.icon}</Text>
              </View>
              <Text style={[s.stepName, { color: st.id === step ? accent : theme.textMuted, fontWeight: st.id === step ? '800' : '500' }]}>
                {st.name}
              </Text>
            </View>
          ))}
        </View>

        <GradientText style={s.heading} colors={[accent, "#22C55E"]} textStyle={{ color: "#0C0A09" }}>
          {step === 1 ? '📱 ' + t('reg_heading_step1') : step === 2 ? '🤳 ' + t('reg_heading_step2') : step === 3 ? '📄 ' + t('reg_heading_step3') : step === 4 ? '🚛 ' + t('reg_heading_step4') : '✅ ' + t('reg_heading_step5')}
        </GradientText>

        {/* STEP 1: WhatsApp */}
        {step === 1 && (
          <View>
            {!mockCode ? (
              <>
                <Text style={[s.hint, { color: theme.textMuted }]}>
                  {t('reg_phone_hint')}
                </Text>
                <TextInput
                  style={[s.bigInput, { backgroundColor: theme.card, color: theme.text, borderColor: theme.border }]}
                  placeholder="+7 777 ___ __ __"
                  placeholderTextColor={theme.textMuted}
                  keyboardType="phone-pad"
                  value={phone}
                  onChangeText={setPhone}
                />
                {/* Stage 24: legal consent gate. Кнопка disabled
                    пока галочка не отмечена. */}
                <ConsentRow checked={consent} onChange={setConsent} accent={accent} />
                <ShimmerButton
                  onPress={onSendCode}
                  colors={[accent, "#22C55E"]} textStyle={{ color: "#0C0A09" }}
                  disabled={loading || !consent}
                  style={!consent && { opacity: 0.45 }}
                >
                  {loading ? <ActivityIndicator color="#fff" /> : '💬 ' + t('reg_get_code_btn')}
                </ShimmerButton>
              </>
            ) : (
              <>
                <Text style={[s.hint, { color: theme.textMuted }]}>
                  {t('reg_code_hint_part1')} {phone}. {t('reg_code_hint_part2')}
                </Text>
                <View style={[s.mockBox, { backgroundColor: '#F59E0B20', borderColor: '#F59E0B' }]}>
                  <Text style={s.mockText}>🧪 {t('reg_mock_label')}: {mockCode}</Text>
                </View>
                <TextInput
                  style={[s.codeInput, { backgroundColor: theme.card, color: theme.text, borderColor: theme.border }]}
                  placeholder="____"
                  placeholderTextColor={theme.textMuted}
                  keyboardType="number-pad"
                  maxLength={4}
                  value={code}
                  onChangeText={setCode}
                  autoFocus
                />
                <ShimmerButton onPress={onVerifyCode} colors={[accent, "#22C55E"]} textStyle={{ color: "#0C0A09" }} disabled={loading}>
                  {loading ? <ActivityIndicator color="#fff" /> : '✓ ' + t('reg_confirm_btn')}
                </ShimmerButton>
                <TouchableOpacity style={s.link} onPress={() => { setMockCode(null); setCode(''); }}>
                  <Text style={{ color: theme.textMuted, fontSize: 13 }}>← {t('reg_change_phone')}</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        )}

        {/* STEP 2: Digital ID */}
        {step === 2 && (
          <View>
            {/* Блок 1: Личные данные */}
            <View style={[s.blockCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <Text style={[s.blockTitle, { color: theme.text }]}>① {t('reg_block1_title')}</Text>
              <Text style={[s.blockHint, { color: theme.textMuted }]}>
                {t('reg_block1_hint')}
              </Text>

              <Text style={[s.label, { color: theme.textMuted }]}>{t('reg_field_fullname')} *</Text>
              <TextInput
                style={[s.input, {
                  backgroundColor: theme.bg,
                  color: theme.text,
                  borderColor: nameErr ? '#EF4444' : theme.border,
                  borderWidth: nameErr ? 2 : 1,
                }]}
                placeholderTextColor={theme.textMuted}
                value={fullName}
                onChangeText={(v) => { setFullName(v); if (nameErr) setNameErr(validateName(v)); }}
                onBlur={() => setNameErr(validateName(fullName))}
              />
              {nameErr && <Text style={s.fieldErr}>⚠️ {nameErr}</Text>}
              {!nameErr && hasCyrillic(fullName) && (
                <Text style={[s.translitHint, { color: accent }]}>
                  🌐 {t('reg_field_latin')}: <Text style={{ fontWeight: '700' }}>{translit(fullName)}</Text>
                </Text>
              )}

              <Text style={[s.label, { color: theme.textMuted, marginTop: 10 }]}>{t('reg_field_iin')} *</Text>
              <TextInput
                style={[s.input, {
                  backgroundColor: theme.bg,
                  color: theme.text,
                  borderColor: iinErr ? '#EF4444' : theme.border,
                  borderWidth: iinErr ? 2 : 1,
                }]}
                placeholder="850101300123" placeholderTextColor={theme.textMuted}
                keyboardType="number-pad" maxLength={12}
                value={iin}
                onChangeText={(v) => {
                  const digits = v.replace(/\D/g, '').slice(0, 12);
                  setIin(digits);
                  if (iinErr) setIinErr(validateIin(digits));
                }}
                onBlur={() => setIinErr(validateIin(iin))}
              />
              {iinErr && <Text style={s.fieldErr}>⚠️ {iinErr}</Text>}
            </View>

            {/* Блок 2: Селфи */}
            <View style={[s.blockCard, { backgroundColor: theme.card, borderColor: theme.border, marginTop: 14 }]}>
              <Text style={[s.blockTitle, { color: theme.text }]}>② {t('reg_block2_title')}</Text>
              <Text style={[s.blockHint, { color: theme.textMuted }]}>
                {t('reg_block2_hint')}
              </Text>
              <View style={[s.tipRow, { backgroundColor: `${accent}12` }]}>
                <Text style={[s.tipText, { color: accent }]}>
                  💡 {t('reg_block2_tip')}
                </Text>
              </View>

              <TouchableOpacity
                style={[s.selfieBtn, { backgroundColor: selfieUri ? '#22C55E' : accent }]}
                onPress={onSelfie}
                disabled={loading}
                activeOpacity={0.85}
              >
                {selfieUri ? (
                  <>
                    <Image source={{ uri: selfieUri }} style={s.selfiePreview} />
                    <View style={{ flex: 1 }}>
                      <Text style={s.selfieBtnTitle}>
                        {faceResult?.face_verified ? '✓ ' + t('reg_selfie_done') : t('reg_selfie_retake')}
                      </Text>
                      {faceResult?.face_verified && (
                        <Text style={s.selfieBtnSub}>
                          Liveness: {Math.round((faceResult.liveness_confidence || 0) * 100)}%
                        </Text>
                      )}
                    </View>
                  </>
                ) : (
                  <>
                    <Text style={{ fontSize: 30 }}>🤳</Text>
                    <Text style={s.selfieBtnTitle}>
                      {loading ? (uploadStage === 'compressing' ? t('reg_selfie_compressing') : t('reg_selfie_uploading')) : t('reg_selfie_take')}
                    </Text>
                  </>
                )}
                {loading && <ActivityIndicator color="#fff" />}
              </TouchableOpacity>
            </View>

            {uploadStage && (
              <View style={[s.progressBar, { backgroundColor: theme.card }]}>
                <Text style={[s.progressText, { color: accent }]}>
                  {uploadStage === 'compressing' ? '⚙️ ' + t('reg_compressing_full') : '☁️ ' + t('reg_uploading_full')}
                </Text>
              </View>
            )}
          </View>
        )}

        {/* STEP 3: Documents */}
        {step === 3 && (
          <View>
            <Text style={[s.blockHint, { color: theme.textMuted, textAlign: 'center', marginBottom: 12 }]}>
              📸 {t('reg_docs_intro_part1')} <Text style={{ fontWeight: '700', color: theme.text }}>{t('reg_docs_intro_doc_word')}</Text>{t('reg_docs_intro_part2')}
            </Text>

            {/* Права */}
            <View style={[s.blockCard, { backgroundColor: theme.card, borderColor: licenseData?.verified ? '#22C55E' : theme.border }]}>
              <Text style={[s.blockTitle, { color: theme.text }]}>🪪 {t('reg_doc_license_title')}</Text>
              <Text style={[s.blockHint, { color: theme.textMuted }]}>
                {t('reg_doc_license_hint')}
              </Text>
              <TouchableOpacity
                style={[s.docUploadBtn, { backgroundColor: theme.bg, borderColor: licenseData?.verified ? '#22C55E' : accent }]}
                onPress={onLicense}
                disabled={loading}
              >
                {licenseUri ? (
                  <Image source={{ uri: licenseUri }} style={s.docPreview} />
                ) : (
                  <Text style={{ fontSize: 40, marginRight: 10 }}>🪪</Text>
                )}
                <View style={{ flex: 1 }}>
                  <Text style={[s.docTitle, { color: theme.text }]}>
                    {licenseUri ? t('reg_doc_retake') : t('reg_doc_upload_license')}
                  </Text>
                  {licenseData?.verified ? (
                    <Text style={[s.docDesc, { color: '#22C55E' }]}>
                      ✓ {t('reg_doc_categories')}: {(licenseData.categories || []).join(', ')}
                      {licenseData.experience_years ? ` · ${t('reg_doc_experience_years')} ${licenseData.experience_years} ${t('reg_doc_years_short')}` : ''}
                    </Text>
                  ) : licenseData ? (
                    <Text style={[s.docDesc, { color: '#F59E0B' }]}>⚠ {t('reg_doc_ocr_partial')}</Text>
                  ) : (
                    <Text style={[s.docDesc, { color: theme.textMuted }]}>{t('reg_doc_format_hint')}</Text>
                  )}
                </View>
              </TouchableOpacity>
            </View>

            {/* Техпаспорт */}
            <View style={[s.blockCard, { backgroundColor: theme.card, borderColor: passportData?.verified ? '#22C55E' : theme.border, marginTop: 14 }]}>
              <Text style={[s.blockTitle, { color: theme.text }]}>📄 {t('reg_doc_passport_title')}</Text>
              <Text style={[s.blockHint, { color: theme.textMuted }]}>
                {t('reg_doc_passport_hint')}
              </Text>
              <TouchableOpacity
                style={[s.docUploadBtn, { backgroundColor: theme.bg, borderColor: passportData?.verified ? '#22C55E' : accent }]}
                onPress={onPassport}
                disabled={loading}
              >
                {passportUri ? (
                  <Image source={{ uri: passportUri }} style={s.docPreview} />
                ) : (
                  <Text style={{ fontSize: 40, marginRight: 10 }}>📄</Text>
                )}
                <View style={{ flex: 1 }}>
                  <Text style={[s.docTitle, { color: theme.text }]}>
                    {passportUri ? t('reg_doc_retake') : t('reg_doc_upload_passport')}
                  </Text>
                  {passportData?.verified ? (
                    <Text style={[s.docDesc, { color: '#22C55E' }]}>
                      ✓ {passportData.extracted?.plate_number || ''} · {passportData.extracted?.brand || ''} {passportData.extracted?.year || ''}
                    </Text>
                  ) : (
                    <Text style={[s.docDesc, { color: theme.textMuted }]}>{t('reg_doc_passport_extract')}</Text>
                  )}
                </View>
              </TouchableOpacity>
            </View>

            {uploadStage && (
              <View style={[s.progressBar, { backgroundColor: theme.card, marginTop: 10 }]}>
                <ActivityIndicator color={accent} style={{ marginRight: 8 }} />
                <Text style={[s.progressText, { color: accent }]}>
                  {uploadStage === 'compressing' ? t('compressing') : t('uploading')}
                </Text>
              </View>
            )}

            {licenseUri && passportUri && !loading && (
              <ShimmerButton onPress={() => setStep(4)} colors={[accent, "#22C55E"]} textStyle={{ color: "#0C0A09" }} style={{ marginTop: 14 }}>
                {t('reg_next_to_transport')}
              </ShimmerButton>
            )}
          </View>
        )}

        {/* STEP 4: Vehicle */}
        {step === 4 && (
          <View>
            <Text style={[s.label, { color: theme.textMuted }]}>{t('reg_truck_body_label')}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {VEHICLE_TYPES.map(v => (
                <TouchableOpacity key={v.key}
                  style={[s.vehicleCard, { backgroundColor: theme.card, borderColor: theme.border }, vehicleType === v.key && { backgroundColor: accent, borderColor: accent }]}
                  onPress={() => setVehicleType(v.key)}>
                  <Text style={{ fontSize: 28 }}>{v.icon}</Text>
                  <Text style={[s.vehicleText, { color: theme.textSecondary }, vehicleType === v.key && { color: onAccent }]}>{v.label}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <Text style={[s.label, { color: theme.textMuted, marginTop: 16 }]}>{t('reg_capacity_label')}</Text>
            <TextInput style={[s.input, { backgroundColor: theme.card, color: theme.text, borderColor: theme.border }]}
              placeholder="22000" placeholderTextColor={theme.textMuted}
              keyboardType="number-pad" value={capacityKg} onChangeText={setCapacityKg} />

            <TouchableOpacity
              style={[s.docCard, { backgroundColor: theme.card, borderColor: vehiclePhoto ? '#22C55E' : theme.border, marginTop: 12 }]}
              onPress={async () => {
                const uri = await pickImage();
                if (!uri) return;
                // Пред-сжатие сразу при выборе — быстрее финальная отправка
                setUploadStage('compressing');
                try {
                  const compressed = await compressImage(uri, { preset: 'truck' });
                  setVehiclePhoto(compressed);
                  toast('✓ ' + t('reg_photo_ready'), 'success', 1500);
                } catch (e) {
                  setVehiclePhoto(uri); // fallback — без сжатия
                } finally {
                  setUploadStage(null);
                }
              }}
              disabled={uploadStage !== null}
            >
              {vehiclePhoto ? <Image source={{ uri: vehiclePhoto }} style={s.docImg} /> : <Text style={{ fontSize: 40 }}>📸</Text>}
              <View style={{ flex: 1 }}>
                <Text style={[s.docTitle, { color: theme.text }]}>{t('reg_vehicle_photo_title')}</Text>
                <Text style={[s.docDesc, { color: theme.textMuted }]}>
                  {uploadStage === 'compressing' ? '⚙️ ' + t('reg_vehicle_compressing') :
                   vehiclePhoto ? '✓ ' + t('reg_vehicle_done') : t('reg_vehicle_show_truck')}
                </Text>
              </View>
              {uploadStage === 'compressing' && <ActivityIndicator color={accent} />}
            </TouchableOpacity>

            {uploadStage === 'uploading' && (
              <View style={[s.progressBar, { backgroundColor: theme.card, marginTop: 10 }]}>
                <ActivityIndicator color={accent} style={{ marginRight: 8 }} />
                <Text style={[s.progressText, { color: accent }]}>☁️ {t('reg_uploading_short')}</Text>
              </View>
            )}

            <ShimmerButton onPress={onVehicle} colors={[accent, "#22C55E"]} textStyle={{ color: "#0C0A09" }} style={{ marginTop: 14 }} disabled={loading || uploadStage !== null}>
              {loading ? <ActivityIndicator color="#fff" /> : t('reg_next_to_check')}
            </ShimmerButton>
          </View>
        )}

        {/* STEP 5: Moderation */}
        {step === 5 && (
          <View>
            {!moderation ? (
              <>
                <View style={[s.modBox, { backgroundColor: theme.card, borderColor: theme.border }]}>
                  <Text style={{ fontSize: 60 }}>🔍</Text>
                  <Text style={[s.modTitle, { color: theme.text }]}>{t('reg_ready_check_title')}</Text>
                  <Text style={[s.modDesc, { color: theme.textMuted }]}>
                    {t('reg_ready_check_desc')}
                  </Text>
                </View>
                <ShimmerButton onPress={onModerate} colors={[accent, "#22C55E"]} textStyle={{ color: "#0C0A09" }} disabled={loading}>
                  {loading ? <ActivityIndicator color="#fff" /> : '🚀 ' + t('reg_start_check')}
                </ShimmerButton>
              </>
            ) : (
              <View style={[s.modResult, { backgroundColor: theme.card, borderColor: moderation.auto_approved ? '#22C55E' : moderation.status === 'rejected' ? '#EF4444' : '#F59E0B' }]}>
                <Text style={{ fontSize: 60 }}>
                  {moderation.auto_approved ? '✅' : moderation.status === 'rejected' ? '⛔' : '⏳'}
                </Text>
                <Text style={[s.modTitle, { color: theme.text }]}>
                  {moderation.auto_approved ? t('reg_complete_title') : moderation.status === 'rejected' ? t('reg_rejected_title') : t('reg_manual_title')}
                </Text>
                <View style={s.scoreBox}>
                  <Text style={[s.scoreBig, { color: moderation.security_color === 'green' ? '#22C55E' : moderation.security_color === 'black' ? '#DC2626' : '#F59E0B' }]}>
                    {moderation.security_score || 0}/100
                  </Text>
                  <Text style={{ color: theme.text, fontSize: 14, fontWeight: '700' }}>
                    {moderation.security_color === 'green' ? '🟢 ' + t('reg_color_green') : moderation.security_color === 'yellow' ? '🟡 ' + t('reg_color_yellow') : moderation.security_color === 'black' ? '⛔ ' + t('reg_color_black') : '🔴 ' + t('reg_color_red')}
                  </Text>
                </View>
                {moderation.rejected_reason && (
                  <Text style={[s.rejectReason, { color: '#EF4444' }]}>{moderation.rejected_reason}</Text>
                )}
                {moderation.auto_approved && (
                  <Text style={[s.modDesc, { color: theme.textMuted }]}>
                    {t('reg_redirect_hint')}
                  </Text>
                )}
              </View>
            )}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// Упрощённый клиент — без 5 этапов (ему не надо документы/ТС)
function ClientReg({ navigation, setRole, session, theme, t, toast, accent }) {
  const [displayName, setDisplayName] = useState('');
  const [city, setCity] = useState('');
  const [companyType, setCompanyType] = useState('importer');
  return (
    <SafeAreaView style={[s.container, { backgroundColor: theme.bg }]}>
      <ScrollView contentContainerStyle={s.scroll}>
        <GradientText style={s.heading} colors={[accent, '#EF4444']}>📦 {t('reg_client_title')}</GradientText>
        <Text style={[s.label, { color: theme.textMuted }]}>{t('reg_client_company_name')}</Text>
        <TextInput style={[s.input, { backgroundColor: theme.card, color: theme.text, borderColor: theme.border }]}
          placeholderTextColor={theme.textMuted} value={displayName} onChangeText={setDisplayName} />
        <Text style={[s.label, { color: theme.textMuted }]}>{t('reg_client_city')}</Text>
        <TextInput style={[s.input, { backgroundColor: theme.card, color: theme.text, borderColor: theme.border }]}
          placeholderTextColor={theme.textMuted} value={city} onChangeText={setCity} />
        <Text style={[s.label, { color: theme.textMuted }]}>{t('reg_client_business_type')}</Text>
        <View style={s.typeRow}>
          {[{k:'importer',n:t('reg_client_importer')},{k:'forwarder',n:t('reg_client_forwarder')},{k:'shop',n:t('reg_client_shop')}].map(o => (
            <TouchableOpacity key={o.k} style={[s.typeBtn, { backgroundColor: theme.card, borderColor: theme.border }, companyType === o.k && { backgroundColor: accent, borderColor: accent }]} onPress={() => setCompanyType(o.k)}>
              <Text style={[s.typeBtnText, { color: theme.textSecondary }, companyType === o.k && { color: '#0C0A09' }]}>{o.n}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <ShimmerButton colors={[accent, '#EF4444']} onPress={async () => {
          if (!displayName) { toast(t('reg_client_enter_name'), 'error'); return; }
          saveProfile(session?.user?.id || 'c_' + Date.now(), {
            role: 'client', display_name: displayName, city, company_type: companyType, is_verified: false,
          });
          // Bug #4 / N3: имя и город грузовладельца раньше жили только в
          // локальном store под рандомным fallback-id ('c_' + Date.now()) и
          // терялись после перезагрузки — ProfileScreen грузит /users/me и не
          // находил их. PATCH /users/me пишет name/city в БД под bearer-токеном.
          try { await regAPI.updateProfile({ name: displayName, city }); }
          catch (e) { console.warn('[Reg] client profile sync failed:', e); }
          setRole('client');
          toast('🎉 ' + t('reg_client_welcome'), 'success');
        }}>{t('reg_client_finish')}</ShimmerButton>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  scroll: { padding: 20, paddingBottom: 40 },
  progress: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 24, paddingHorizontal: 4 },
  stepItem: { alignItems: 'center', flex: 1 },
  stepDot: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  stepIcon: { fontSize: 16 },
  stepName: { fontSize: 9, marginTop: 4, textAlign: 'center' },
  heading: { fontSize: 26, fontWeight: '900', marginBottom: 14, letterSpacing: -0.5 },
  hint: { fontSize: 13, lineHeight: 19, marginBottom: 16 },
  label: { fontSize: 11, fontWeight: '700', marginBottom: 6, marginTop: 10, textTransform: 'uppercase', letterSpacing: 0.5 },
  input: { borderRadius: 12, padding: 14, fontSize: 14, borderWidth: 1 },
  bigInput: { borderRadius: 14, padding: 18, fontSize: 20, fontWeight: '700', borderWidth: 1, textAlign: 'center', letterSpacing: 1, marginBottom: 14 },
  codeInput: { borderRadius: 14, padding: 18, fontSize: 32, fontWeight: '800', borderWidth: 1, textAlign: 'center', letterSpacing: 12, marginBottom: 14 },
  mockBox: { padding: 12, borderRadius: 10, borderWidth: 1, marginBottom: 14, alignItems: 'center' },
  mockText: { color: '#F59E0B', fontSize: 13, fontWeight: '800' },
  link: { alignItems: 'center', marginTop: 14, padding: 10 },
  docCard: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, borderRadius: 14, borderWidth: 2, marginBottom: 10 },
  docImg: { width: 56, height: 56, borderRadius: 10 },
  docTitle: { fontSize: 14, fontWeight: '700' },
  docDesc: { fontSize: 11, marginTop: 2 },
  vehicleCard: { width: 96, paddingVertical: 14, paddingHorizontal: 8, borderRadius: 12, borderWidth: 1, alignItems: 'center', gap: 4 },
  vehicleText: { fontSize: 10, fontWeight: '700', textAlign: 'center' },
  typeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 14 },
  typeBtn: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1 },
  typeBtnText: { fontSize: 12, fontWeight: '700' },
  modBox: { padding: 30, borderRadius: 16, borderWidth: 1, alignItems: 'center', marginBottom: 14, gap: 8 },
  modTitle: { fontSize: 18, fontWeight: '800' },
  modDesc: { fontSize: 12, textAlign: 'center', lineHeight: 18 },
  modResult: { padding: 30, borderRadius: 16, borderWidth: 2, alignItems: 'center', gap: 10 },
  scoreBox: { alignItems: 'center', gap: 4, marginVertical: 10 },
  scoreBig: { fontSize: 44, fontWeight: '900', letterSpacing: -1 },
  rejectReason: { fontSize: 12, textAlign: 'center', marginTop: 8 },

  blockCard: { padding: 16, borderRadius: 16, borderWidth: 1 },
  blockTitle: { fontSize: 16, fontWeight: '800', marginBottom: 6 },
  blockHint: { fontSize: 12, lineHeight: 18, marginBottom: 12 },
  translitHint: { fontSize: 12, marginTop: 6, letterSpacing: 0.3 },
  tipRow: { padding: 10, borderRadius: 10, marginBottom: 12 },
  tipText: { fontSize: 11, fontWeight: '600', lineHeight: 16 },
  selfieBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    padding: 14, borderRadius: 14, minHeight: 70,
  },
  selfiePreview: { width: 56, height: 56, borderRadius: 28 },
  // PR-D1 (build 18): кнопка-фон может быть либо #00E676 (driver-аккцент),
  // либо #22C55E (selfie уже загружено = success). На обоих чёрный текст
  // даёт больший контраст, чем белый. Без role-aware условия — единый цвет.
  selfieBtnTitle: { color: '#0C0A09', fontSize: 14, fontWeight: '800' },
  selfieBtnSub: { color: 'rgba(12,10,9,0.75)', fontSize: 11, marginTop: 2 },
  docUploadBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    padding: 14, borderRadius: 12, borderWidth: 1.5, borderStyle: 'dashed',
  },
  docPreview: { width: 60, height: 44, borderRadius: 6 },
  progressBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    padding: 12, borderRadius: 10,
  },
  progressText: { fontSize: 13, fontWeight: '700' },
  fieldErr: { color: '#EF4444', fontSize: 11, marginTop: 4, fontWeight: '600' },

  // PR-D1: HelpButton anchor + Exit bottom sheet
  helpAnchor: { position: 'absolute', top: 12, right: 14, zIndex: 50 },
  exitBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  exitSheet: {
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 20, paddingBottom: Platform.OS === 'ios' ? 32 : 20,
  },
  exitHandle: {
    alignSelf: 'center', width: 36, height: 4, borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.2)', marginBottom: 14,
  },
  exitTitle: { fontSize: 18, fontWeight: '800', marginBottom: 8 },
  exitBody: { fontSize: 13, lineHeight: 19, marginBottom: 16 },
  exitPrimary: { paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  exitPrimaryText: { fontSize: 15, fontWeight: '800' },
  exitSecondary: { alignItems: 'center', marginTop: 10, paddingVertical: 10 },
  exitSecondaryText: { fontSize: 14, fontWeight: '600' },
});
