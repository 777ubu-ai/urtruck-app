import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Image, ActivityIndicator, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { useI18n } from '../utils/useI18n';
import { useTheme } from '../utils/ThemeContext';
import { useAuth } from '../utils/AuthContext';
import { useToast } from '../components/Toast';
import { saveProfile } from '../utils/store';
import { regAPI } from '../utils/registration';
import ShimmerButton from '../components/ShimmerButton';
import GradientText from '../components/GradientText';
import { translit, hasCyrillic } from '../utils/translit';
import { compressImage } from '../utils/imageCompress';

const STEPS = [
  { id: 1, name: 'WhatsApp', icon: '💬' },
  { id: 2, name: 'Личность', icon: '🤳' },
  { id: 3, name: 'Документы', icon: '📄' },
  { id: 4, name: 'Транспорт', icon: '🚛' },
  { id: 5, name: 'Готово', icon: '✅' },
];

const VEHICLE_TYPES = [
  { key: 'tent', label: 'Тент', icon: '🚚' },
  { key: 'ref', label: 'Рефрижератор', icon: '🧊' },
  { key: 'platform', label: 'Площадка', icon: '🛻' },
  { key: 'cont40', label: 'Контейнер', icon: '📦' },
  { key: 'tanker', label: 'Цистерна', icon: '🛢️' },
  { key: 'auto', label: 'Автовоз', icon: '🚗' },
  { key: 'van', label: 'Фургон', icon: '🚐' },
];

export default function RegScreen({ navigation, route }) {
  const { role } = route.params || { role: 'driver' };
  const isDriver = role === 'driver';
  const accent = isDriver ? '#4F46E5' : '#F59E0B';
  const { t } = useI18n();
  const { theme } = useTheme();
  const { session, setRole, verificationLevel } = useAuth();
  const { toast } = useToast();

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
    if (phone.length < 10) { toast('Введите номер', 'error'); return; }
    setLoading(true);
    const r = await regAPI.sendCode(phone);
    setLoading(false);
    if (r.sent) {
      if (r.code) setMockCode(r.code);
      toast(r.mock ? `💬 MOCK: код ${r.code}` : '💬 Код отправлен в WhatsApp', 'success', 5000);
    } else {
      toast(t('send_error'), 'error');
    }
  };

  const onVerifyCode = async () => {
    if (code.length < 4) { toast('Введите код', 'error'); return; }
    setLoading(true);
    const r = await regAPI.verifyCode(phone, code);
    setLoading(false);
    if (r.token) {
      toast('✓ WhatsApp подтверждён', 'success');
      setStep(2);
    } else {
      toast(r.detail || 'Неверный код', 'error');
    }
  };

  const onSelfie = async () => {
    // HOT-007: активная обратная связь о причине блокировки
    const nErr = validateName(fullName);
    const iErr = validateIin(iin);
    setNameErr(nErr);
    setIinErr(iErr);
    if (nErr || iErr) {
      toast('⚠ Проверьте ФИО и ИИН', 'error', 3500);
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
        toast(`✓ Селфи подтверждено (${Math.round((r.liveness_confidence || 0) * 100)}%)`, 'success');
        setStep(3);
      } else {
        toast(r.detail || '⚠ Плохое фото. Попробуйте при хорошем освещении', 'warn', 5000);
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
      if (r.verified) toast(`✓ Права: ${(r.categories || []).join(', ') || 'OK'}`, 'success');
      else toast('⚠ Распознавание неполное — можно продолжить', 'warn');
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
        toast('⚠ Низкая уверенность OCR', 'warn');
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
      setTimeout(() => { setRole('driver'); toast('🎉 Регистрация завершена', 'success'); }, 2500);
    } else if (r.status === 'rejected') {
      toast(`⛔ Отклонено: ${r.rejected_reason}`, 'error', 8000);
    } else {
      toast('⏳ Ручная проверка модератором', 'info', 5000);
    }
  };

  return (
    <SafeAreaView style={[s.container, { backgroundColor: theme.bg }]}>
      <ScrollView contentContainerStyle={s.scroll}>
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

        <GradientText style={s.heading} colors={[accent, '#22C55E']}>
          {step === 1 ? '💬 Вход через WhatsApp' : step === 2 ? '🤳 Кто вы?' : step === 3 ? '📄 Документы' : step === 4 ? '🚛 Транспорт' : '✅ Проверка'}
        </GradientText>

        {/* STEP 1: WhatsApp */}
        {step === 1 && (
          <View>
            {!mockCode ? (
              <>
                <Text style={[s.hint, { color: theme.textMuted }]}>
                  Введите номер телефона. Мы отправим код в WhatsApp.
                </Text>
                <TextInput
                  style={[s.bigInput, { backgroundColor: theme.card, color: theme.text, borderColor: theme.border }]}
                  placeholder="+7 777 ___ __ __"
                  placeholderTextColor={theme.textMuted}
                  keyboardType="phone-pad"
                  value={phone}
                  onChangeText={setPhone}
                />
                <ShimmerButton onPress={onSendCode} colors={[accent, '#22C55E']} disabled={loading}>
                  {loading ? <ActivityIndicator color="#fff" /> : '💬 Получить код'}
                </ShimmerButton>
              </>
            ) : (
              <>
                <Text style={[s.hint, { color: theme.textMuted }]}>
                  Код отправлен на {phone}. Он действителен 5 минут.
                </Text>
                <View style={[s.mockBox, { backgroundColor: '#F59E0B20', borderColor: '#F59E0B' }]}>
                  <Text style={s.mockText}>🧪 MOCK режим · код: {mockCode}</Text>
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
                <ShimmerButton onPress={onVerifyCode} colors={[accent, '#22C55E']} disabled={loading}>
                  {loading ? <ActivityIndicator color="#fff" /> : '✓ Подтвердить'}
                </ShimmerButton>
                <TouchableOpacity style={s.link} onPress={() => { setMockCode(null); setCode(''); }}>
                  <Text style={{ color: theme.textMuted, fontSize: 13 }}>← Изменить номер</Text>
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
              <Text style={[s.blockTitle, { color: theme.text }]}>① Ваши данные</Text>
              <Text style={[s.blockHint, { color: theme.textMuted }]}>
                Нужны для подтверждения личности и международных перевозок
              </Text>

              <Text style={[s.label, { color: theme.textMuted }]}>ФИО (как в паспорте) *</Text>
              <TextInput
                style={[s.input, {
                  backgroundColor: theme.bg,
                  color: theme.text,
                  borderColor: nameErr ? '#EF4444' : theme.border,
                  borderWidth: nameErr ? 2 : 1,
                }]}
                placeholder="Каримов Ержан Сабитұлы" placeholderTextColor={theme.textMuted}
                value={fullName}
                onChangeText={(v) => { setFullName(v); if (nameErr) setNameErr(validateName(v)); }}
                onBlur={() => setNameErr(validateName(fullName))}
              />
              {nameErr && <Text style={s.fieldErr}>⚠️ {nameErr}</Text>}
              {!nameErr && hasCyrillic(fullName) && (
                <Text style={[s.translitHint, { color: accent }]}>
                  🌐 Латиница: <Text style={{ fontWeight: '700' }}>{translit(fullName)}</Text>
                </Text>
              )}

              <Text style={[s.label, { color: theme.textMuted, marginTop: 10 }]}>ИИН (12 цифр) *</Text>
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
              <Text style={[s.blockTitle, { color: theme.text }]}>② Селфи для Liveness</Text>
              <Text style={[s.blockHint, { color: theme.textMuted }]}>
                Фото вашего лица. Это не фото документа — это селфи для подтверждения что вы живой человек.
                Смотрите прямо в камеру, без головного убора и очков.
              </Text>
              <View style={[s.tipRow, { backgroundColor: `${accent}12` }]}>
                <Text style={[s.tipText, { color: accent }]}>
                  💡 Хорошее освещение · лицо полностью в кадре · без других людей рядом
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
                        {faceResult?.face_verified ? '✓ Селфи подтверждено' : 'Переснять селфи'}
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
                      {loading ? (uploadStage === 'compressing' ? 'Сжимаю фото...' : 'Загружаю...') : 'Сделать селфи'}
                    </Text>
                  </>
                )}
                {loading && <ActivityIndicator color="#fff" />}
              </TouchableOpacity>
            </View>

            {uploadStage && (
              <View style={[s.progressBar, { backgroundColor: theme.card }]}>
                <Text style={[s.progressText, { color: accent }]}>
                  {uploadStage === 'compressing' ? '⚙️ Сжатие изображения для ускорения...' : '☁️ Отправка на сервер...'}
                </Text>
              </View>
            )}
          </View>
        )}

        {/* STEP 3: Documents */}
        {step === 3 && (
          <View>
            <Text style={[s.blockHint, { color: theme.textMuted, textAlign: 'center', marginBottom: 12 }]}>
              📸 Это фото <Text style={{ fontWeight: '700', color: theme.text }}>документов</Text>, не селфи.
              Ложите документ на ровную поверхность при ярком свете.
            </Text>

            {/* Права */}
            <View style={[s.blockCard, { backgroundColor: theme.card, borderColor: licenseData?.verified ? '#22C55E' : theme.border }]}>
              <Text style={[s.blockTitle, { color: theme.text }]}>🪪 Водительские права</Text>
              <Text style={[s.blockHint, { color: theme.textMuted }]}>
                Лицевая сторона с фото, категориями и датами. Мы автоматически распознаем стаж и категории.
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
                    {licenseUri ? 'Переснять' : 'Загрузить фото прав'}
                  </Text>
                  {licenseData?.verified ? (
                    <Text style={[s.docDesc, { color: '#22C55E' }]}>
                      ✓ Категории: {(licenseData.categories || []).join(', ')}
                      {licenseData.experience_years ? ` · стаж ${licenseData.experience_years} лет` : ''}
                    </Text>
                  ) : licenseData ? (
                    <Text style={[s.docDesc, { color: '#F59E0B' }]}>⚠ OCR не полный — можно продолжить</Text>
                  ) : (
                    <Text style={[s.docDesc, { color: theme.textMuted }]}>JPG/PNG до 10 МБ</Text>
                  )}
                </View>
              </TouchableOpacity>
            </View>

            {/* Техпаспорт */}
            <View style={[s.blockCard, { backgroundColor: theme.card, borderColor: passportData?.verified ? '#22C55E' : theme.border, marginTop: 14 }]}>
              <Text style={[s.blockTitle, { color: theme.text }]}>📄 Техпаспорт (СТС)</Text>
              <Text style={[s.blockHint, { color: theme.textMuted }]}>
                Лицевая сторона с номером, VIN, маркой и годом. Это документ на автомобиль, не ваше удостоверение.
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
                    {passportUri ? 'Переснять' : 'Загрузить техпаспорт'}
                  </Text>
                  {passportData?.verified ? (
                    <Text style={[s.docDesc, { color: '#22C55E' }]}>
                      ✓ {passportData.extracted?.plate_number || ''} · {passportData.extracted?.brand || ''} {passportData.extracted?.year || ''}
                    </Text>
                  ) : (
                    <Text style={[s.docDesc, { color: theme.textMuted }]}>Извлечём номер, марку, год</Text>
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
              <ShimmerButton onPress={() => setStep(4)} colors={[accent, '#22C55E']} style={{ marginTop: 14 }}>
                Дальше → Транспорт
              </ShimmerButton>
            )}
          </View>
        )}

        {/* STEP 4: Vehicle */}
        {step === 4 && (
          <View>
            <Text style={[s.label, { color: theme.textMuted }]}>Тип кузова</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {VEHICLE_TYPES.map(v => (
                <TouchableOpacity key={v.key}
                  style={[s.vehicleCard, { backgroundColor: theme.card, borderColor: theme.border }, vehicleType === v.key && { backgroundColor: accent, borderColor: accent }]}
                  onPress={() => setVehicleType(v.key)}>
                  <Text style={{ fontSize: 28 }}>{v.icon}</Text>
                  <Text style={[s.vehicleText, { color: theme.textSecondary }, vehicleType === v.key && { color: '#fff' }]}>{v.label}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <Text style={[s.label, { color: theme.textMuted, marginTop: 16 }]}>Грузоподъёмность (кг)</Text>
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
                  const compressed = await compressImage(uri, { maxSide: 1200, quality: 0.7 });
                  setVehiclePhoto(compressed);
                  toast('✓ Фото готово', 'success', 1500);
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
                <Text style={[s.docTitle, { color: theme.text }]}>Фото автомобиля</Text>
                <Text style={[s.docDesc, { color: theme.textMuted }]}>
                  {uploadStage === 'compressing' ? '⚙️ Сжатие...' :
                   vehiclePhoto ? '✓ Готово' : 'Покажите ваш грузовик'}
                </Text>
              </View>
              {uploadStage === 'compressing' && <ActivityIndicator color={accent} />}
            </TouchableOpacity>

            {uploadStage === 'uploading' && (
              <View style={[s.progressBar, { backgroundColor: theme.card, marginTop: 10 }]}>
                <ActivityIndicator color={accent} style={{ marginRight: 8 }} />
                <Text style={[s.progressText, { color: accent }]}>☁️ Отправляю на сервер...</Text>
              </View>
            )}

            <ShimmerButton onPress={onVehicle} colors={[accent, '#22C55E']} style={{ marginTop: 14 }} disabled={loading || uploadStage !== null}>
              {loading ? <ActivityIndicator color="#fff" /> : 'Дальше → Проверка'}
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
                  <Text style={[s.modTitle, { color: theme.text }]}>Готовы к проверке?</Text>
                  <Text style={[s.modDesc, { color: theme.textMuted }]}>
                    Система автоматически проверит ваши данные:{'\n'}
                    • OCR документов{'\n'}
                    • Биометрия{'\n'}
                    • Blacklist{'\n'}
                    • Гос. базы (КЗ)
                  </Text>
                </View>
                <ShimmerButton onPress={onModerate} colors={[accent, '#22C55E']} disabled={loading}>
                  {loading ? <ActivityIndicator color="#fff" /> : '🚀 Начать проверку'}
                </ShimmerButton>
              </>
            ) : (
              <View style={[s.modResult, { backgroundColor: theme.card, borderColor: moderation.auto_approved ? '#22C55E' : moderation.status === 'rejected' ? '#EF4444' : '#F59E0B' }]}>
                <Text style={{ fontSize: 60 }}>
                  {moderation.auto_approved ? '✅' : moderation.status === 'rejected' ? '⛔' : '⏳'}
                </Text>
                <Text style={[s.modTitle, { color: theme.text }]}>
                  {moderation.auto_approved ? 'Регистрация завершена!' : moderation.status === 'rejected' ? 'Отказано' : 'Ручная проверка'}
                </Text>
                <View style={s.scoreBox}>
                  <Text style={[s.scoreBig, { color: moderation.security_color === 'green' ? '#22C55E' : moderation.security_color === 'black' ? '#DC2626' : '#F59E0B' }]}>
                    {moderation.security_score || 0}/100
                  </Text>
                  <Text style={{ color: theme.text, fontSize: 14, fontWeight: '700' }}>
                    {moderation.security_color === 'green' ? '🟢 Надёжный' : moderation.security_color === 'yellow' ? '🟡 Новичок' : moderation.security_color === 'black' ? '⛔ В чёрном списке' : '🔴 Есть проблемы'}
                  </Text>
                </View>
                {moderation.rejected_reason && (
                  <Text style={[s.rejectReason, { color: '#EF4444' }]}>{moderation.rejected_reason}</Text>
                )}
                {moderation.auto_approved && (
                  <Text style={[s.modDesc, { color: theme.textMuted }]}>
                    Переход в приложение через 2 секунды...
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
        <GradientText style={s.heading} colors={[accent, '#EF4444']}>📦 Профиль компании</GradientText>
        <Text style={[s.label, { color: theme.textMuted }]}>Название компании</Text>
        <TextInput style={[s.input, { backgroundColor: theme.card, color: theme.text, borderColor: theme.border }]}
          placeholder="ТОО Карго-Трейд" placeholderTextColor={theme.textMuted} value={displayName} onChangeText={setDisplayName} />
        <Text style={[s.label, { color: theme.textMuted }]}>Город</Text>
        <TextInput style={[s.input, { backgroundColor: theme.card, color: theme.text, borderColor: theme.border }]}
          placeholder="Алматы" placeholderTextColor={theme.textMuted} value={city} onChangeText={setCity} />
        <Text style={[s.label, { color: theme.textMuted }]}>Тип бизнеса</Text>
        <View style={s.typeRow}>
          {[{k:'importer',n:'Импортёр'},{k:'forwarder',n:'Экспедитор'},{k:'shop',n:'Интернет-магазин'}].map(o => (
            <TouchableOpacity key={o.k} style={[s.typeBtn, { backgroundColor: theme.card, borderColor: theme.border }, companyType === o.k && { backgroundColor: accent, borderColor: accent }]} onPress={() => setCompanyType(o.k)}>
              <Text style={[s.typeBtnText, { color: theme.textSecondary }, companyType === o.k && { color: '#0C0A09' }]}>{o.n}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <ShimmerButton colors={[accent, '#EF4444']} onPress={() => {
          if (!displayName) { toast('Введите название', 'error'); return; }
          saveProfile(session?.user?.id || 'c_' + Date.now(), {
            role: 'client', display_name: displayName, city, company_type: companyType, is_verified: false,
          });
          setRole('client');
          toast('🎉 Добро пожаловать', 'success');
        }}>Завершить</ShimmerButton>
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
  selfieBtnTitle: { color: '#fff', fontSize: 14, fontWeight: '800' },
  selfieBtnSub: { color: 'rgba(255,255,255,0.85)', fontSize: 11, marginTop: 2 },
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
});
