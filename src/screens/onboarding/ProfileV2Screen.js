// ProfileV2Screen — шаг 2 из 2 после выбора роли.
// Канон onboarding: имя + основной телефон обязательны для обеих ролей;
// компания и preferred messenger — необязательные контактные данные.
// Email принадлежит auth-identity и повторно у пользователя не спрашивается.

import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Feather from '@expo/vector-icons/Feather';
import { useI18n } from '../../utils/useI18n';
import { useAuth } from '../../utils/AuthContext';
import { regAPI } from '../../utils/registration';
import { useBrand, radius, typography } from '../../theme/brandV2';

const COPY = {
  RU: {
    title: 'Завершите профиль',
    subtitle: 'Заполните основные контакты',
    nameLabel: 'Имя / контактное лицо *',
    namePlaceholder: 'Например, Иван Петров',
    phoneLabel: 'Основной телефон *',
    companyLabel: 'Компания / ИП',
    companyPlaceholder: 'Название компании (необязательно)',
    companyHint: 'Для компании — название, для частного лица можно оставить пустым',
    messengerLabel: 'Предпочтительный мессенджер',
    messengerContact: 'Контакт в мессенджере',
    messengerPlaceholder: 'ID, логин или номер',
    other: 'Другой',
    samePhone: 'Совпадает с основным телефоном',
    emailConfirmed: 'Email уже подтверждён и повторно не запрашивается',
    privacy: 'Контактные данные не публикуются в ленте',
    save: 'Сохранить и войти',
  },
  EN: {
    title: 'Complete your profile',
    subtitle: 'Add your main contact details',
    nameLabel: 'Name / contact person *',
    namePlaceholder: 'For example, Alex Morgan',
    phoneLabel: 'Primary phone *',
    companyLabel: 'Company / business',
    companyPlaceholder: 'Company name (optional)',
    companyHint: 'For a company, enter its name; individuals can leave this blank',
    messengerLabel: 'Preferred messenger',
    messengerContact: 'Messenger contact',
    messengerPlaceholder: 'ID, username or number',
    other: 'Other',
    samePhone: 'Same as primary phone',
    emailConfirmed: 'Email is already verified and is not requested again',
    privacy: 'Contact details are not published in the feed',
    save: 'Save and enter',
  },
  ZH: {
    title: '完善个人资料',
    subtitle: '填写主要联系方式',
    nameLabel: '姓名 / 联系人 *',
    namePlaceholder: '例如：张伟',
    phoneLabel: '主要手机号 *',
    companyLabel: '公司 / 个体经营',
    companyPlaceholder: '公司名称（选填）',
    companyHint: '公司用户填写公司名称，个人用户可留空',
    messengerLabel: '首选即时通讯',
    messengerContact: '即时通讯联系方式',
    messengerPlaceholder: 'ID、账号或手机号',
    other: '其他',
    samePhone: '与主要手机号相同',
    emailConfirmed: '邮箱已验证，无需再次填写',
    privacy: '联系方式不会公开显示在货源列表中',
    save: '保存并进入',
  },
  KK: {
    title: 'Профильді аяқтаңыз',
    subtitle: 'Негізгі байланыс деректерін толтырыңыз',
    nameLabel: 'Аты / байланыс тұлғасы *',
    namePlaceholder: 'Мысалы, Айдан Нұрлан',
    phoneLabel: 'Негізгі телефон *',
    companyLabel: 'Компания / ЖК',
    companyPlaceholder: 'Компания атауы (міндетті емес)',
    companyHint: 'Компания болса — атауын жазыңыз, жеке тұлға бос қалдыра алады',
    messengerLabel: 'Қалаулы мессенджер',
    messengerContact: 'Мессенджердегі байланыс',
    messengerPlaceholder: 'ID, логин немесе нөмір',
    other: 'Басқа',
    samePhone: 'Негізгі телефонмен бірдей',
    emailConfirmed: 'Email расталған, оны қайта енгізудің қажеті жоқ',
    privacy: 'Байланыс деректері лентада жарияланбайды',
    save: 'Сақтау және кіру',
  },
};

const MESSENGERS = [
  { key: 'whatsapp', label: 'WhatsApp', icon: 'message-circle' },
  { key: 'wechat', label: 'WeChat', icon: 'message-square' },
  { key: 'telegram', label: 'Telegram', icon: 'send' },
  { key: 'other', labelKey: 'other', icon: 'more-horizontal' },
];

const digitsOnly = (value) => String(value || '').replace(/\D/g, '');
const isRealPhone = (value) => {
  const raw = String(value || '').trim();
  if (!raw || /@/.test(raw) || /^(guest_|auth_|deleted_)/i.test(raw)) return false;
  const count = digitsOnly(raw).length;
  return count >= 10 && count <= 15;
};

function StepIndicator({ s, colors }) {
  return (
    <View style={s.stepWrap} testID="profile-v2-step">
      <View style={[s.stepDot, s.stepDone]}>
        <Feather name="check" size={15} color={colors.textOnPrimary} />
      </View>
      <View style={[s.stepLine, s.stepLineDone]} />
      <View style={[s.stepDot, s.stepDone]}>
        <Text style={s.stepDoneText}>2</Text>
      </View>
    </View>
  );
}

function MessengerOption({ item, selected, onPress, s, colors, ui }) {
  return (
    <Pressable
      onPress={onPress}
      testID={`profile-v2-messenger-${item.key}`}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={({ pressed }) => [
        s.messengerOption,
        selected && s.messengerOptionSelected,
        pressed && s.pressed,
      ]}
    >
      <Feather
        name={item.icon}
        size={20}
        color={selected ? colors.primary : colors.textSecondary}
      />
      <Text style={[s.messengerText, selected && s.messengerTextSelected]}>
        {item.label || ui[item.labelKey]}
      </Text>
    </Pressable>
  );
}

export default function ProfileV2Screen({ navigation, route }) {
  const colors = useBrand();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const { t, lang } = useI18n();
  const ui = COPY[lang] || COPY.RU;
  const { session } = useAuth();
  const role = route?.params?.role || session?.user?.role || 'driver';

  const signupIdentity = route?.params?.phone || session?.user?.phone || '';
  const initialPhone = isRealPhone(signupIdentity) ? signupIdentity : '';
  const initialName = String(session?.user?.name || '').trim();
  const hasVerifiedEmail = Boolean(
    /@/.test(String(route?.params?.phone || '')) || session?.user?.email,
  );

  const [name, setName] = useState(initialName);
  const [phone, setPhone] = useState(initialPhone);
  const [company, setCompany] = useState('');
  const [messengerType, setMessengerType] = useState('');
  const [messengerId, setMessengerId] = useState('');
  const [sameAsPhone, setSameAsPhone] = useState(true);
  const [focused, setFocused] = useState('');
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [serverError, setServerError] = useState('');

  const validName = name.trim().length >= 2;
  const validPhone = isRealPhone(phone);
  const formValid = validName && validPhone;

  const validate = () => {
    const next = {};
    if (!validName) next.name = t('profile_v2_err_name');
    if (!validPhone) next.phone = t('prem_reg_phone_invalid');
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const selectMessenger = (nextType) => {
    setMessengerType((current) => (current === nextType ? '' : nextType));
    setMessengerId('');
    setSameAsPhone(nextType === 'whatsapp');
  };

  const onContinue = async () => {
    if (busy || !validate()) return;
    setBusy(true);
    setServerError('');
    try {
      const effectiveMessengerId = messengerType === 'whatsapp' && sameAsPhone
        ? phone.trim()
        : messengerId.trim();

      const payload = {
        name: name.trim(),
        phone: phone.trim(),
        role,
        company_name: company.trim(),
        messenger_type: messengerType,
        messenger_id: messengerType ? effectiveMessengerId : '',
      };

      const saved = await regAPI.updateProfile(payload);
      if (!saved?.ok) {
        const detail = saved?.detail;
        const code = detail?.error || saved?.error;
        if (code === 'PHONE_REQUIRED' || code === 'INVALID_PHONE') {
          setErrors((prev) => ({ ...prev, phone: t('prem_reg_phone_invalid') }));
          return;
        }
        if (code === 'NAME_REQUIRED') {
          setErrors((prev) => ({ ...prev, name: t('profile_v2_err_name') }));
          return;
        }
        throw new Error(typeof detail === 'string' ? detail : 'profile_save_failed');
      }
      navigation.reset({ index: 0, routes: [{ name: 'Main', params: { role } }] });
    } catch {
      setServerError(t('profile_v2_save_failed'));
    } finally {
      setBusy(false);
    }
  };

  const Field = ({
    id,
    label,
    value,
    onChange,
    placeholder,
    keyboardType,
    inputMode,
    autoCapitalize = 'sentences',
  }) => (
    <View style={s.field}>
      <Text style={s.label}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={(next) => {
          onChange(next);
          if (errors[id]) setErrors((prev) => ({ ...prev, [id]: null }));
        }}
        onFocus={() => setFocused(id)}
        onBlur={() => setFocused('')}
        placeholder={placeholder}
        placeholderTextColor={colors.textTertiary}
        keyboardType={keyboardType}
        inputMode={inputMode}
        textContentType={id === 'phone' ? 'telephoneNumber' : undefined}
        autoCapitalize={autoCapitalize}
        style={[s.input, focused === id && s.inputFocused, errors[id] && s.inputError]}
        testID={`profile-v2-${id}`}
      />
      {errors[id] ? <Text style={s.errText}>{errors[id]}</Text> : null}
    </View>
  );

  const showMessengerContact = Boolean(messengerType)
    && !(messengerType === 'whatsapp' && sameAsPhone);

  return (
    <SafeAreaView style={s.safe} edges={['top', 'bottom']} testID="profile-v2-screen">
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={s.flex}
      >
        <View style={s.header}>
          <Pressable
            onPress={() => navigation.goBack()}
            style={({ pressed }) => [s.backBtn, pressed && s.pressed]}
            testID="profile-v2-back"
            accessibilityRole="button"
          >
            <Feather name="arrow-left" size={22} color={colors.textPrimary} />
          </Pressable>
        </View>

        <ScrollView
          contentContainerStyle={s.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <StepIndicator s={s} colors={colors} />
          <Text style={s.stepCaption}>2 / 2</Text>
          <Text style={s.title}>{ui.title}</Text>
          <Text style={s.subtitle}>{ui.subtitle}</Text>

          <Field
            id="name"
            label={ui.nameLabel}
            value={name}
            onChange={setName}
            placeholder={ui.namePlaceholder}
            autoCapitalize="words"
          />

          <Field
            id="phone"
            label={ui.phoneLabel}
            value={phone}
            onChange={setPhone}
            placeholder={t('prem_reg_phone_placeholder')}
            keyboardType="phone-pad"
            inputMode="tel"
            autoCapitalize="none"
          />

          <Field
            id="company"
            label={ui.companyLabel}
            value={company}
            onChange={setCompany}
            placeholder={ui.companyPlaceholder}
            autoCapitalize="words"
          />
          <Text style={s.helperText}>{ui.companyHint}</Text>

          <View style={s.section}>
            <Text style={s.sectionLabel}>{ui.messengerLabel}</Text>
            <View style={s.messengerRow}>
              {MESSENGERS.map((item) => (
                <MessengerOption
                  key={item.key}
                  item={item}
                  selected={messengerType === item.key}
                  onPress={() => selectMessenger(item.key)}
                  s={s}
                  colors={colors}
                  ui={ui}
                />
              ))}
            </View>

            {messengerType === 'whatsapp' ? (
              <View style={s.samePhoneRow}>
                <Text style={s.samePhoneText}>{ui.samePhone}</Text>
                <Switch
                  value={sameAsPhone}
                  onValueChange={setSameAsPhone}
                  trackColor={{ false: colors.borderStrong, true: colors.primary }}
                  thumbColor={colors.textOnPrimary}
                  ios_backgroundColor={colors.borderStrong}
                  testID="profile-v2-messenger-same-phone"
                />
              </View>
            ) : null}

            {showMessengerContact ? (
              <Field
                id="messenger"
                label={ui.messengerContact}
                value={messengerId}
                onChange={setMessengerId}
                placeholder={ui.messengerPlaceholder}
                autoCapitalize="none"
              />
            ) : null}
          </View>

          <View style={s.infoCard}>
            {hasVerifiedEmail ? (
              <View style={s.infoRow}>
                <Feather name="check-circle" size={17} color={colors.success} />
                <Text style={s.infoText}>{ui.emailConfirmed}</Text>
              </View>
            ) : null}
            <View style={s.infoRow}>
              <Feather name="shield" size={17} color={colors.textSecondary} />
              <Text style={s.infoText}>{ui.privacy}</Text>
            </View>
          </View>

          {serverError ? <Text style={s.serverError}>{serverError}</Text> : null}

          <Pressable
            onPress={onContinue}
            disabled={busy || !formValid}
            accessibilityRole="button"
            accessibilityState={{ disabled: busy || !formValid }}
            testID="profile-v2-cta"
            style={({ pressed }) => [
              s.ctaPrimary,
              { backgroundColor: formValid ? colors.primary : colors.borderStrong },
              pressed && formValid && s.pressed,
            ]}
          >
            {busy ? (
              <ActivityIndicator color={colors.textOnPrimary} />
            ) : (
              <>
                <Text style={s.ctaPrimaryText}>{ui.save}</Text>
                <Feather name="arrow-right" size={20} color={colors.textOnPrimary} />
              </>
            )}
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const makeStyles = (colors) => StyleSheet.create({
  flex: {
    flex: 1,
  },
  safe: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  header: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 2,
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.7,
  },
  scroll: {
    paddingHorizontal: 24,
    paddingTop: 4,
    paddingBottom: 36,
  },
  stepWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  stepDone: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  stepDoneText: {
    ...typography.caption,
    color: colors.textOnPrimary,
    fontWeight: '800',
  },
  stepLine: {
    width: 54,
    height: 2,
    marginHorizontal: 7,
    borderRadius: 2,
    backgroundColor: colors.border,
  },
  stepLineDone: {
    backgroundColor: colors.primary,
  },
  stepCaption: {
    ...typography.caption,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 18,
  },
  title: {
    ...typography.h1,
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: 6,
  },
  subtitle: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: 24,
  },
  field: {
    marginBottom: 16,
  },
  label: {
    ...typography.bodySmall,
    color: colors.textPrimary,
    fontWeight: '700',
    marginBottom: 8,
  },
  input: {
    minHeight: 54,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: 16,
    paddingVertical: 13,
    ...typography.bodyLarge,
    color: colors.textPrimary,
  },
  inputFocused: {
    borderColor: colors.primary,
  },
  inputError: {
    borderColor: colors.error,
  },
  errText: {
    ...typography.caption,
    color: colors.error,
    marginTop: 6,
  },
  helperText: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: -8,
    marginBottom: 22,
  },
  section: {
    marginBottom: 18,
  },
  sectionLabel: {
    ...typography.bodySmall,
    color: colors.textPrimary,
    fontWeight: '700',
    marginBottom: 10,
  },
  messengerRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  messengerOption: {
    minWidth: 76,
    minHeight: 62,
    flexGrow: 1,
    flexBasis: '22%',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  messengerOptionSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
  messengerText: {
    ...typography.caption,
    color: colors.textSecondary,
    fontWeight: '700',
  },
  messengerTextSelected: {
    color: colors.textPrimary,
  },
  samePhoneRow: {
    minHeight: 50,
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
  },
  samePhoneText: {
    ...typography.bodySmall,
    flex: 1,
    color: colors.textSecondary,
  },
  infoCard: {
    borderRadius: radius.md,
    backgroundColor: colors.surfaceSoft,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    gap: 10,
    marginBottom: 18,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 9,
  },
  infoText: {
    ...typography.caption,
    flex: 1,
    color: colors.textSecondary,
  },
  serverError: {
    ...typography.bodySmall,
    color: colors.error,
    textAlign: 'center',
    marginBottom: 10,
  },
  ctaPrimary: {
    height: 58,
    borderRadius: radius.lg,
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  ctaPrimaryText: {
    ...typography.button,
    color: colors.textOnPrimary,
  },
});
