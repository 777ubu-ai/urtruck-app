import { withAdditionalLanguageTree, } from '../../utils/additionalLocales.js';
// ProfileV2Screen — личные данные после выбора роли.
// Обе роли входят после имени и телефона; машина добавляется позже по желанию.
// Дополнительные сведения редактируются в профиле, не в регистрации.
// Дата рождения и ИИН не запрашиваются в базовой регистрации.
// Email принадлежит auth-identity и повторно у пользователя не спрашивается.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Feather from '@expo/vector-icons/Feather';
import { useI18n } from '../../utils/useI18n';
import { useAuth } from '../../utils/AuthContext';
import { regAPI } from '../../utils/registration';
import AuthAccountHint from '../../components/AuthAccountHint';
import { brandLight, radius, typography } from '../../theme/brandV2';
import { DRIVER_CERAMIC } from '../../theme/designV1Palette';
import KeyboardSafeLayout, { KeyboardSafeScrollView } from '../../components/ui/v1/KeyboardSafeLayout';
import { RegistrationHeader, RegistrationCompletion, registrationColors } from './RegistrationPresentation';
import { registrationCountry, registrationNational, registrationNumber, validRegistrationPhone } from '../../utils/registrationPhone';
import { usePublicationDraft } from '../../hooks/usePublicationDraft';
import { COUNTRIES } from '../../utils/countries';

const COPY = {
  RU: {
    driverTitle: 'Профиль водителя',
    driverSubtitle: 'Ваше имя и номер телефона',
    shipperTitle: 'Профиль грузоотправителя',
    shipperSubtitle: 'Ваше имя и номер телефона',
    nameLabel: 'Имя *',
    namePlaceholder: 'Например, Иван',
    phoneLabel: 'Номер телефона *',
    companyLabel: 'Компания / ИП *',
    companyOptionalLabel: 'Компания / ИП',
    companyPlaceholder: 'Название компании или ИП',
    companyHint: 'Обязательно для порядка в сделках и документах',
    companyOptionalHint: 'Можно добавить позже в профиле',
    countryLabel: 'Страна компании',
    countryPlaceholder: 'Например, Казахстан или Китай',
    cityLabel: 'Город / адрес компании',
    cityPlaceholder: 'Например, Алматы или Иу, Чжэцзян',
    locationOptionalHint: 'Можно оставить пустым и добавить позже',
    companyRequired: 'Укажите компанию или ИП',
    messengerLabel: 'Мессенджер (необязательно)',
    messengerContact: 'Контакт в мессенджере',
    messengerPlaceholder: 'ID, логин или номер',
    messengerRequired: 'Укажите контакт выбранного мессенджера',
    phoneChangeRequired: 'Этот аккаунт уже имеет подтверждённый номер. Используйте его для регистрации; новый номер можно подтвердить кодом в профиле.',
    phoneAlreadyInUse: 'Этот номер уже используется. Введите другой номер или войдите в свой существующий аккаунт.',
    roleAlreadySet: 'Для этого аккаунта уже выбрана другая роль. Вернитесь и выберите сохранённую роль.',
    retryLater: 'Слишком много попыток. Подождите и повторите сохранение.',
    verificationRequired: 'Сначала подтвердите вход по email или телефону. Данные остались в форме.',
    serverUnavailable: 'Сервер временно недоступен. Данные остались в форме; попробуйте снова.',
    other: 'Другой',
    samePhone: 'Совпадает с основным телефоном',
    emailConfirmed: 'Email уже подтверждён и повторно не запрашивается',
    privacy: 'Контактные данные не публикуются в ленте',
    save: 'Сохранить и войти',
  },
  EN: {
    driverTitle: 'Driver profile',
    driverSubtitle: 'Your name and phone number',
    shipperTitle: 'Shipper profile',
    shipperSubtitle: 'Your name and phone number',
    nameLabel: 'Name *',
    namePlaceholder: 'For example, Alex Morgan',
    phoneLabel: 'Primary phone *',
    companyLabel: 'Company / business *',
    companyOptionalLabel: 'Company / business',
    companyPlaceholder: 'Company or sole trader name',
    companyHint: 'Required to keep deals and documents clean',
    companyOptionalHint: 'Can be added later in profile',
    countryLabel: 'Company country',
    countryPlaceholder: 'For example, Kazakhstan or China',
    cityLabel: 'Company city / address',
    cityPlaceholder: 'For example, Almaty or Yiwu, Zhejiang',
    locationOptionalHint: 'Optional — you can add it later',
    companyRequired: 'Enter company or business name',
    messengerLabel: 'Messenger (optional)',
    messengerContact: 'Messenger contact',
    messengerPlaceholder: 'ID, username or number',
    messengerRequired: 'Enter a contact for the selected messenger',
    phoneChangeRequired: 'This account already has a verified phone. Use it to finish registration; verify a new number with a code in your profile.',
    phoneAlreadyInUse: 'This number is already in use. Enter another number or sign in to your existing account.',
    roleAlreadySet: 'This account already has a different role. Go back and select the saved role.',
    retryLater: 'Too many attempts. Wait before saving again.',
    verificationRequired: 'First verify your email or phone sign-in. Your form is kept.',
    serverUnavailable: 'The server is temporarily unavailable. Your form is kept; please retry.',
    other: 'Other',
    samePhone: 'Same as primary phone',
    emailConfirmed: 'Email is already verified and is not requested again',
    privacy: 'Contact details are not published in the feed',
    save: 'Save and enter',
  },
  ZH: {
    driverTitle: '司机资料',
    driverSubtitle: '您的姓名和手机号',
    shipperTitle: '货主资料',
    shipperSubtitle: '您的姓名和手机号',
    nameLabel: '姓名 *',
    namePlaceholder: '例如：张伟',
    phoneLabel: '主要手机号 *',
    companyLabel: '公司 / 个体经营 *',
    companyOptionalLabel: '公司 / 个体经营',
    companyPlaceholder: '公司或个体经营名称',
    companyHint: '交易和文件中必须填写',
    companyOptionalHint: '可稍后在个人资料中添加',
    countryLabel: '公司所在国家',
    countryPlaceholder: '例如：哈萨克斯坦或中国',
    cityLabel: '公司城市 / 地址',
    cityPlaceholder: '例如：阿拉木图或浙江义乌',
    locationOptionalHint: '可留空，稍后补充',
    companyRequired: '请输入公司或个体经营名称',
    messengerLabel: '即时通讯（选填）',
    messengerContact: '即时通讯联系方式',
    messengerPlaceholder: 'ID、账号或手机号',
    messengerRequired: '请输入所选即时通讯的联系方式',
    phoneChangeRequired: '此账号已有已验证的手机号。请使用该号码完成注册；之后可在个人资料中通过验证码更换号码。',
    phoneAlreadyInUse: '此号码已被使用。请输入其他号码，或登录您的现有账号。',
    roleAlreadySet: '此账号已选择其他角色。请返回并选择已保存的角色。',
    retryLater: '尝试次数过多。请稍后再次保存。',
    verificationRequired: '请先通过邮箱或手机号验证登录。已保留表单内容。',
    serverUnavailable: '服务器暂时不可用。已保留表单内容，请重试。',
    other: '其他',
    samePhone: '与主要手机号相同',
    emailConfirmed: '邮箱已验证，无需再次填写',
    privacy: '联系方式不会公开显示在货源列表中',
    save: '保存并进入',
  },
  KK: {
    driverTitle: 'Жүргізуші профилі',
    driverSubtitle: 'Атыңыз және телефон нөміріңіз',
    shipperTitle: 'Жүк жөнелтуші профилі',
    shipperSubtitle: 'Атыңыз және телефон нөміріңіз',
    nameLabel: 'Аты *',
    namePlaceholder: 'Мысалы, Айдан Нұрлан',
    phoneLabel: 'Негізгі телефон *',
    companyLabel: 'Компания / ЖК *',
    companyOptionalLabel: 'Компания / ЖК',
    companyPlaceholder: 'Компания немесе ЖК атауы',
    companyHint: 'Мәмілелер мен құжаттар реті үшін міндетті',
    companyOptionalHint: 'Профильде кейінірек қосуға болады',
    countryLabel: 'Компания елі',
    countryPlaceholder: 'Мысалы, Қазақстан немесе Қытай',
    cityLabel: 'Компания қаласы / мекенжайы',
    cityPlaceholder: 'Мысалы, Алматы немесе Иу, Чжэцзян',
    locationOptionalHint: 'Бос қалдырып, кейін қосуға болады',
    companyRequired: 'Компания немесе ЖК атауын көрсетіңіз',
    messengerLabel: 'Мессенджер (міндетті емес)',
    messengerContact: 'Мессенджердегі байланыс',
    messengerPlaceholder: 'ID, логин немесе нөмір',
    messengerRequired: 'Таңдалған мессенджердегі байланысты көрсетіңіз',
    phoneChangeRequired: 'Бұл аккаунтта расталған нөмір бар. Тіркелуді сол нөмірмен аяқтаңыз; жаңа нөмірді профильде кодпен растауға болады.',
    phoneAlreadyInUse: 'Бұл нөмір қолданылып жатыр. Басқа нөмір енгізіңіз немесе өз аккаунтыңызға кіріңіз.',
    roleAlreadySet: 'Бұл аккаунт үшін басқа рөл таңдалған. Артқа оралып, сақталған рөлді таңдаңыз.',
    retryLater: 'Әрекет саны тым көп. Біраз күтіп, қайта сақтаңыз.',
    verificationRequired: 'Алдымен email немесе телефон арқылы кіруді растаңыз. Нысандағы деректер сақталды.',
    serverUnavailable: 'Сервер уақытша қолжетімсіз. Нысандағы деректер сақталды; қайталап көріңіз.',
    other: 'Басқа',
    samePhone: 'Негізгі телефонмен бірдей',
    emailConfirmed: 'Email расталған, оны қайта енгізудің қажеті жоқ',
    privacy: 'Байланыс деректері лентада жарияланбайды',
    save: 'Сақтау және кіру',
  },
};
Object.assign(COPY, withAdditionalLanguageTree(COPY));

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

function ProfileField({
  id,
  label,
  value,
  onChange,
  placeholder,
  keyboardType,
  inputMode,
  editable = true,
  autoCapitalize = 'sentences',
  s,
  colors,
  focused,
  setFocused,
  errors,
  setErrors,
}) {
  return (
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
        accessibilityLabel={label}
        textContentType={id === 'phone' ? 'telephoneNumber' : 'none'}
        autoComplete={id === 'phone' ? 'tel' : 'off'}
        editable={editable}
        autoCorrect={false}
        autoCapitalize={autoCapitalize}
        style={[s.input, focused === id && s.inputFocused, errors[id] && s.inputError]}
        testID={`profile-v2-${id}`}
      />
      {errors[id] ? <Text style={s.errText}>{errors[id]}</Text> : null}
    </View>
  );
}

export default function ProfileV2Screen(props) {
  const { session } = useAuth();
  const role = props.route?.params?.role || session?.user?.role || 'driver';
  // Новый владелец/роль получают новый экземпляр формы до первого отображения.
  return <ProfileV2Form key={`${session?.user?.id || 'no-owner'}:${role}`} {...props} />;
}

function ProfileV2Form({ navigation, route }) {
  const baseColors = brandLight;
  const colors = registrationColors;
  const { t, lang } = useI18n();
  const ui = COPY[lang] || COPY.RU;
  const { session, setRole } = useAuth();
  const role = route?.params?.role || session?.user?.role || 'driver';
  const s = useMemo(() => makeStyles(colors), [colors]);

  const signupIdentity = route?.params?.phone || session?.user?.email || session?.user?.phone || '';
  const existingPhone = isRealPhone(signupIdentity) ? signupIdentity : session?.user?.phone;
  const initialPhone = isRealPhone(existingPhone) ? '+' + digitsOnly(existingPhone) : '';
  const initialName = String(session?.user?.name || '').trim();
  const hasVerifiedEmail = Boolean(
    /@/.test(String(route?.params?.phone || '')) || session?.user?.email,
  );

  const [name, setName] = useState(initialName);
  const [phone, setPhone] = useState(initialPhone);
  const [phoneCountry, setPhoneCountry] = useState(() => registrationCountry(initialPhone));
  const [completion, setCompletion] = useState('');
  const changePhone = (value) => {
    const next = registrationNumber(value, phoneCountry);
    if (String(value).trim().startsWith('+')) setPhoneCountry(registrationCountry(next));
    setPhone(next);
  };
  const pickPhoneCountry = () => navigation.navigate('CountryPicker', {
    onSelect: (nextCountry) => {
      setPhone('+' + nextCountry.dial + registrationNational(phone, phoneCountry));
      setPhoneCountry(nextCountry);
      setErrors((prev) => ({ ...prev, phone: null }));
    },
  });
  const [focused, setFocused] = useState('');
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [serverError, setServerError] = useState('');
  const draft = usePublicationDraft(`registration_basic_${role}`, session?.user?.id,
    { name, phone, phoneCountryIso: phoneCountry.iso }, {
      name: (value) => { if (typeof value === 'string') setName(value); },
      phone: (value) => { if (typeof value === 'string') setPhone(value); },
      phoneCountryIso: (iso) => {
        const country = COUNTRIES.find((item) => item.iso === iso);
        if (country) setPhoneCountry(country);
      },
    });
  const formMountedRef = useRef(true);
  const savingRef = useRef(false);
  useEffect(() => {
    formMountedRef.current = true;
    return () => { formMountedRef.current = false; };
  }, []);

  const validName = name.trim().length >= 2;
  const validPhone = validRegistrationPhone(phone, phoneCountry);
  // Дополнительная связь не блокирует завершение регистрации.
  const basicFormValid = validName && validPhone;

  const validate = () => {
    const next = {};
    if (!validName) next.name = t('profile_v2_err_name');
    if (!validPhone) next.phone = t('prem_reg_phone_invalid');
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const onContinue = async () => {
    if (!draft.ready || busy || savingRef.current || !validate()) return;
    savingRef.current = true;
    setBusy(true);
    setServerError('');
    let ownerToken = null;
    let profileSaved = false;
    const formIsCurrent = async () => {
      try {
        return formMountedRef.current && Boolean(ownerToken)
          && await regAPI.getToken() === ownerToken && formMountedRef.current;
      } catch { return false; }
    };
    try {
      ownerToken = await regAPI.getToken();
      if (!await formIsCurrent()) return;
      await draft.save();
      if (!await formIsCurrent()) return;
      // Не отправляем пустые дополнительные поля: они могли быть заполнены ранее.
      const payload = { name: name.trim(), phone: phone.trim(), role };

      const saved = await regAPI.updateProfile(payload, { expectedToken: ownerToken });
      if (!await formIsCurrent()) return;
      if (!saved?.ok) {
        if (saved?.networkError) {
          setServerError(t('no_connection'));
          return;
        }
        if (saved?.status >= 500) {
          setServerError(ui.serverUnavailable);
          return;
        }
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
        const fieldErrors = {
          PHONE_CHANGE_OTP_REQUIRED: ['phone', ui.phoneChangeRequired],
          PHONE_ALREADY_IN_USE: ['phone', ui.phoneAlreadyInUse],
          MESSENGER_CONTACT_REQUIRED: ['messenger', ui.messengerRequired],
        };
        if (Object.hasOwn(fieldErrors, code)) {
          const [field, message] = fieldErrors[code];
          setErrors((prev) => ({ ...prev, [field]: message }));
          return;
        }
        if (code === 'verification_required') {
          setServerError(ui.verificationRequired);
          return;
        }
        if (code === 'ROLE_ALREADY_SET') {
          setServerError(ui.roleAlreadySet);
          return;
        }
        if (saved?.authRequired || saved?.status === 401 || code === 'AUTH_REQUIRED') {
          setServerError(t('session_expired'));
          return;
        }
        if (saved?.status === 429) {
          setServerError(ui.retryLater);
          return;
        }
        throw new Error('profile_save_failed');
      }

      if (role === 'driver') {
        const draftSaved = await regAPI.saveDriverDraft({
          full_name: name.trim(),
        }, { expectedToken: ownerToken });
        if (!await formIsCurrent()) return;
        if (!draftSaved?.ok) throw new Error('basic_profile_save_failed');
      }

      if (role === 'driver') {
        const completed = await regAPI.completeBasic({
          expectedToken: ownerToken, isCurrent: () => formMountedRef.current,
        });
        if (!await formIsCurrent()) return;
        if (!completed?.ok) throw new Error('basic_profile_complete_failed');
      }

      profileSaved = true;
      setCompletion('success');
      await new Promise((resolve) => setTimeout(resolve, 1500));
      if (!await formIsCurrent()) return;
      const roleSaved = await setRole(role, { expectedToken: ownerToken, isCurrent: () => formMountedRef.current });
      if (roleSaved?.ok === false) throw new Error('profile_role_commit_failed');
      // setRole может уже размонтировать форму. Очищаем только её сохранённый
      // снимок после успешного commit той же сессии; retry до этого хранит черновик.
      if (await regAPI.getToken() !== ownerToken) return;
      await draft.clear();
      if (!await formIsCurrent()) return;
      navigation.reset({ index: 0, routes: [{ name: 'Main', params: { role } }] });
    } catch {
      if (formMountedRef.current && (!ownerToken || await formIsCurrent())) {
        setServerError(t('profile_v2_save_failed'));
        if (profileSaved) setCompletion('error');
      }
    } finally {
      savingRef.current = false;
      if (formMountedRef.current) setBusy(false);
    }
  };

  return (
    <SafeAreaView style={s.safe} edges={['top', 'bottom']} testID="profile-v2-screen">
      {completion ? <RegistrationCompletion error={completion === 'error'} onRetry={() => { setCompletion(''); onContinue(); }} /> : <KeyboardSafeLayout style={s.flex}>
        <RegistrationHeader navigation={navigation} disabled={busy} />

        <KeyboardSafeScrollView
          contentContainerStyle={s.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text style={s.title}>{role === 'driver' ? ui.driverTitle : ui.shipperTitle}</Text>
          <Text style={s.subtitle}>{role === 'driver' ? ui.driverSubtitle : ui.shipperSubtitle}</Text>
          <AuthAccountHint identifier={signupIdentity} navigation={navigation} disabled={busy} compact />

          <ProfileField
            id="name"
            editable={!busy && draft.ready}
            label={ui.nameLabel}
            value={name}
            onChange={setName}
            placeholder={ui.namePlaceholder}
            autoCapitalize="words"
            s={s}
            colors={colors}
            focused={focused}
            setFocused={setFocused}
            errors={errors}
            setErrors={setErrors}
          />

          <View style={s.field}>
            <Text style={s.label}>{ui.phoneLabel}</Text>
            <View style={[s.phoneRow, focused === 'phone' && s.inputFocused, errors.phone && s.inputError]}>
              <Pressable onPress={pickPhoneCountry} disabled={busy || !draft.ready} style={s.dialButton} accessibilityRole="button" accessibilityLabel={t('country_picker_title')} testID="profile-v2-phone-country">
                <Text style={s.dialText}>+{phoneCountry.dial}</Text>
                <Feather name="chevron-down" size={16} color={colors.textSecondary} />
              </Pressable>
              <TextInput value={registrationNational(phone, phoneCountry)} onChangeText={(value) => { changePhone(value); if (errors.phone) setErrors((prev) => ({ ...prev, phone: null })); }} onFocus={() => setFocused('phone')} onBlur={() => setFocused('')} placeholder={phoneCountry.dial === '7' ? '705 123 45 67' : ''} placeholderTextColor={colors.textTertiary} keyboardType="phone-pad" inputMode="tel" textContentType="telephoneNumber" autoComplete="tel-national" autoCorrect={false} autoCapitalize="none" editable={!busy && draft.ready} style={s.phoneInput} testID="profile-v2-phone" accessibilityLabel={ui.phoneLabel} />
            </View>
            {errors.phone ? <Text style={s.errText}>{errors.phone}</Text> : null}
          </View>

          {draft.loadError ? <View testID="registration-draft-error"><Text style={s.serverError}>{t('publication_draft_load_failed')}</Text><Pressable onPress={draft.retry} accessibilityRole="button" testID="registration-draft-retry"><Text style={s.subtitle}>{t('repeat_action')}</Text></Pressable></View> : null}
          {serverError ? <Text style={s.serverError}>{serverError}</Text> : null}
        </KeyboardSafeScrollView>

        <View style={s.ctaWrap}>
          <Pressable
            onPress={onContinue}
            disabled={!draft.ready || busy || !basicFormValid}
            accessibilityRole="button"
            accessibilityState={{ disabled: !draft.ready || busy || !basicFormValid }}
            testID="profile-v2-cta"
            style={({ pressed }) => [
              s.ctaPrimary,
              { backgroundColor: basicFormValid ? colors.primary : colors.disabled },
              pressed && !busy && s.pressed,
            ]}
          >
            {busy ? (
              <ActivityIndicator color={colors.textOnPrimary} />
            ) : (
              <>
                <Text style={s.ctaPrimaryText}>{ui.save}</Text>
              </>
            )}
          </Pressable>
        </View>
      </KeyboardSafeLayout>}
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
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 24,
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
    fontSize: 28,
    lineHeight: 34,
    color: colors.textPrimary,
    textAlign: 'left',
    marginBottom: 12,
  },
  subtitle: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'left',
    marginBottom: 28,
  },
  field: {
    marginBottom: 16,
  },
  label: {
    ...typography.body,
    fontSize: 16,
    color: colors.textPrimary,
    fontWeight: '600',
    marginBottom: 8,
  },
  input: {
    minHeight: 56,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: 16,
    paddingVertical: 13,
    ...typography.bodyLarge,
    fontSize: 16,
    color: colors.textPrimary,
  },
  phoneRow: { minHeight: 56, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: 14, backgroundColor: colors.surface },
  dialButton: { minHeight: 54, minWidth: 76, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRightWidth: 1, borderRightColor: colors.border },
  dialText: { fontSize: 16, fontWeight: '600', color: colors.textPrimary },
  phoneInput: { flex: 1, minWidth: 0, minHeight: 54, paddingHorizontal: 12, paddingVertical: 13, fontSize: 16, color: colors.textPrimary },
  inputFocused: {
    borderColor: colors.primary,
  },
  inputError: {
    borderColor: colors.error,
  },
  errText: {
    ...typography.caption,
    color: colors.errorText,
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
    ...typography.body,
    fontSize: 16,
    color: colors.textPrimary,
    fontWeight: '600',
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
    borderRadius: 10,
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
    borderRadius: 14,
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
    color: colors.errorText,
    textAlign: 'center',
    marginBottom: 10,
  },
  ctaWrap: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 20,
    backgroundColor: colors.bg,
  },
  ctaPrimary: {
    minHeight: 56,
    borderRadius: 14,
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  ctaPrimaryText: {
    ...typography.button,
    fontSize: 16,
    color: colors.textOnPrimary,
  },
});
