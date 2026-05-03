import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useI18n } from '../utils/useI18n';
import { saveProfile } from '../utils/store';
import { useAuth } from '../utils/AuthContext';
import Screen from '../components/ui/v1/Screen';
import BrandHeader from '../components/ui/v1/BrandHeader';
import HeroTruck from '../components/ui/v1/HeroTruck';
import RoleTabs from '../components/ui/v1/RoleTabs';
import Field from '../components/ui/v1/Field';
import PrimaryButton from '../components/ui/v1/PrimaryButton';
import OutlineButton from '../components/ui/v1/OutlineButton';
import Checkbox from '../components/ui/v1/Checkbox';
import { v1Colors, v1Spacing, v1Typography, v1AccentFor } from '../theme/designV1';

// SignUp — design v1, screens 02 & 03 (driver / cargo-owner registration).
//
// Business logic note:
//   The current backend uses phone-based OTP for sign-up; it has no
//   password / Apple / Google paths. We render those affordances visually
//   (so the layout matches the macro), but they are inert for now: the
//   "Зарегистрироваться" CTA stores the entered name/country locally via
//   `saveProfile()` and routes the user into the existing OTP flow
//   (AuthScreen). This keeps the API contract intact while letting the
//   designer-approved visuals ship.

export default function SignUpScreen({ navigation, route }) {
  const { t } = useI18n();
  const { session } = useAuth();
  const [roleTab, setRoleTab] = useState(route?.params?.role || 'driver');
  const isDriver = roleTab === 'driver';
  const accent = v1AccentFor(roleTab);
  const accentKey = isDriver ? 'driver' : 'cargo';

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('+7');
  const [company, setCompany] = useState('');
  const [password, setPassword] = useState('');
  const [pwd2, setPwd2] = useState('');
  const [pwdShow, setPwdShow] = useState(false);
  const [pwd2Show, setPwd2Show] = useState(false);
  const [terms, setTerms] = useState(false);
  const [news, setNews] = useState(false);

  const submit = () => {
    // Persist the data we *can* use without changing the backend contract:
    // first/last/company go into local profile cache; phone+role hop us to
    // the OTP screen, which is the real source of truth for auth.
    if (session?.user?.id) {
      saveProfile(session.user.id, {
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        full_name: [firstName, lastName].map((s) => s.trim()).filter(Boolean).join(' '),
        company: company.trim(),
        country: 'KZ',
      });
    }
    navigation.navigate('Auth', { role: roleTab, phone });
  };

  return (
    <Screen>
      <BrandHeader onBack={() => navigation.goBack()} accent={accent.main} compact />
      <HeroTruck size="sm" />

      <Text style={s.title}>{isDriver ? t('signup_driver_title') : t('signup_client_title')}</Text>
      <Text style={s.subtitle}>{isDriver ? t('signup_driver_subtitle') : t('signup_client_subtitle')}</Text>

      <RoleTabs value={roleTab} onChange={setRoleTab} t={t} />

      <Field icon="👤" label={t('signup_field_first_name')} value={firstName} onChangeText={setFirstName} />
      <Field icon="👤" label={t('signup_field_last_name')} value={lastName} onChangeText={setLastName} />
      <Field
        icon="📞"
        label={t('signup_field_phone')}
        value={phone}
        onChangeText={setPhone}
        keyboardType="phone-pad"
      />
      <Field
        variant="dropdown"
        icon="🌐"
        label={t('signup_field_country')}
        value={t('country_kazakhstan')}
        onPress={() => {/* country picker — out of scope for stage 1 */}}
      />
      {!isDriver ? (
        <Field
          icon="🏢"
          label={t('signup_field_company')}
          placeholder={t('signup_field_company_optional')}
          value={company}
          onChangeText={setCompany}
        />
      ) : null}
      <Field
        icon="🔒"
        label={t('signup_field_password')}
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        isPasswordVisible={pwdShow}
        onTogglePassword={() => setPwdShow((v) => !v)}
      />
      <Field
        icon="🔒"
        label={t('signup_field_password_confirm')}
        value={pwd2}
        onChangeText={setPwd2}
        secureTextEntry
        isPasswordVisible={pwd2Show}
        onTogglePassword={() => setPwd2Show((v) => !v)}
      />

      <View style={{ marginTop: v1Spacing.sm, marginBottom: v1Spacing.md }}>
        <Checkbox value={terms} onToggle={() => setTerms((v) => !v)} label={t('signup_terms')} accent={accentKey} />
        <Checkbox value={news} onToggle={() => setNews((v) => !v)} label={t('signup_news')} accent={accentKey} />
      </View>

      <PrimaryButton
        label={t('signup_submit')}
        onPress={submit}
        accent={accentKey}
        disabled={!terms || !firstName.trim() || !lastName.trim()}
        testID="signup-submit"
      />

      <TouchableOpacity onPress={() => navigation.navigate('Auth', { role: roleTab })} style={s.alreadyRow} activeOpacity={0.7}>
        <Text style={s.alreadyText}>
          {t('already_have_account')}{' '}
          <Text style={[s.alreadyLink, { color: accent.main }]}>{t('login_action')}</Text>
        </Text>
      </TouchableOpacity>

      <View style={s.altRow}>
        <View style={s.divider} />
        <Text style={s.altText}>{t('signup_alt')}</Text>
        <View style={s.divider} />
      </View>

      {/* Apple / Google buttons are visual placeholders — backend OAuth not
          wired yet. Disabled state communicates that without a banner. */}
      <OutlineButton icon="" label={t('signup_apple')} disabled style={{ marginBottom: 8 }} />
      <OutlineButton icon="G" label={t('signup_google')} disabled />
    </Screen>
  );
}

const s = StyleSheet.create({
  title: { ...v1Typography.h1, textAlign: 'center', marginTop: v1Spacing.sm },
  subtitle: { ...v1Typography.bodyMd, textAlign: 'center', marginTop: 4, marginBottom: v1Spacing.md },
  alreadyRow: { alignItems: 'center', marginTop: v1Spacing.md, paddingVertical: 6 },
  alreadyText: { color: v1Colors.textMuted, fontSize: 13 },
  alreadyLink: { fontWeight: '700' },
  altRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginVertical: v1Spacing.md },
  divider: { flex: 1, height: 1, backgroundColor: v1Colors.border },
  altText: { color: v1Colors.textDim, fontSize: 12 },
});
