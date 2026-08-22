// PhoneV2Screen — canonical sign-in / registration entry.
//
// Product rule (22 Aug 2026): Google + Apple + Email are the only login
// methods shown here. Phone is NOT an authentication tab anymore; it remains
// a required logistics contact collected on ProfileV2 for email/social users.
//
// Google/Apple use Supabase OAuth only for identity proof. After the provider
// returns, backend /register/social/verify validates the Supabase access token
// server-side and issues the same UrTruck reg-session token used everywhere
// else. Deals/chat/GPS therefore keep one authorization model.
//
// Keyboard/layout rule: the whole form INCLUDING legal consent lives inside
// one KeyboardAvoidingView + ScrollView. The previous fixed consent block was
// outside the shrinking content area and collided with the email form when the
// keyboard opened (owner screenshot 22 Aug).

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Linking,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Feather from '@expo/vector-icons/Feather';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useI18n } from '../../utils/useI18n';
import { useAuth } from '../../utils/AuthContext';
import { useToast } from '../../components/Toast';
import { regAPI } from '../../utils/registration';
import { push } from '../../utils/push';
import {
  completeSocialAuth,
  isSocialAuthCallback,
  startSocialAuth,
} from '../../utils/socialAuth';
import { brand, useBrand, radius, typography } from '../../theme/brandV2';
import { WEB_URL } from '../../config/env';

const LEGAL_BASE = WEB_URL || 'https://urtruck.kz';

const openLegal = (path) => {
  const url = `${LEGAL_BASE}${path}`;
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    try {
      const win = window.open(url, '_blank', 'noopener,noreferrer');
      if (win) return;
    } catch {}
  }
  Linking.openURL(url).catch(() => {});
};

const isValidEmail = (value) => (
  /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test((value || '').trim())
);

export default function PhoneV2Screen({ navigation, route }) {
  const _b = useBrand();
  const s = React.useMemo(() => makeStyles(_b), [_b]);
  const { t } = useI18n();
  const { toast } = useToast();
  const { signIn, setRole, refreshLevel } = useAuth();

  const [email, setEmail] = useState('');
  const [emailBusy, setEmailBusy] = useState(false);
  const [socialBusy, setSocialBusy] = useState(null); // google | apple | callback
  const [error, setError] = useState(null);
  const finishingSocialRef = useRef(false);
  const role = route?.params?.role || null;
  const routedSocialUrl = route?.params?.socialAuthUrl || null;

  const emailOk = isValidEmail(email);
  const anyBusy = emailBusy || !!socialBusy;

  const goAfterLogin = useCallback(async (result, identifier, channel) => {
    await signIn(identifier, result.verification_level || 1, result.token);
    push.autoRegister?.().catch(() => {});

    let detectedRole = result.role && result.role !== 'guest' ? result.role : null;
    if (!detectedRole) {
      try {
        const me = await regAPI.me();
        if (me?.role && me.role !== 'guest') detectedRole = me.role;
      } catch {}
    }

    if (detectedRole) {
      setRole(detectedRole);
      await refreshLevel?.().catch(() => {});
      navigation.reset({
        index: 0,
        routes: [{ name: 'Main', params: { role: detectedRole } }],
      });
      return;
    }

    navigation.reset({
      index: 0,
      routes: [{
        name: 'RoleV2',
        params: {
          phone: identifier,
          email: identifier,
          channel,
          provider: result.provider || null,
        },
      }],
    });
  }, [navigation, refreshLevel, setRole, signIn]);

  const finishSocialUrl = useCallback(async (url) => {
    if (!isSocialAuthCallback(url) || finishingSocialRef.current) return;
    finishingSocialRef.current = true;
    setSocialBusy('callback');
    setError(null);
    try {
      const result = await completeSocialAuth(url);
      if (!result?.token || !result?.email) throw new Error('social_auth_failed');
      await goAfterLogin(result, result.email, 'social');
    } catch (e) {
      setError(t('no_connection'));
      try { toast(t('no_connection'), 'error', 2500); } catch {}
    } finally {
      setSocialBusy(null);
      finishingSocialRef.current = false;
    }
  }, [goAfterLogin, t, toast]);

  useEffect(() => {
    const sub = Linking.addEventListener('url', ({ url }) => {
      finishSocialUrl(url).catch(() => {});
    });

    // OnboardingV2 passes the URL explicitly when OAuth cold-started the app.
    // This avoids relying on a second getInitialURL() call retaining the URL.
    if (routedSocialUrl) {
      finishSocialUrl(routedSocialUrl).catch(() => {});
    }

    Linking.getInitialURL()
      .then((url) => finishSocialUrl(url))
      .catch(() => {});

    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      finishSocialUrl(window.location.href).catch(() => {});
    }

    return () => sub?.remove?.();
  }, [finishSocialUrl, routedSocialUrl]);

  const onSocialPress = async (provider) => {
    if (anyBusy) return;
    setError(null);
    setSocialBusy(provider);
    try {
      await startSocialAuth(provider);
    } catch (e) {
      setError(t('no_connection'));
      try { toast(t('no_connection'), 'error', 2500); } catch {}
    } finally {
      setSocialBusy(null);
    }
  };

  const submitEmail = async () => {
    if (!emailOk || anyBusy) return;
    setEmailBusy(true);
    setError(null);
    try {
      const cleanEmail = email.trim().toLowerCase();
      const result = await regAPI.sendEmailCode(cleanEmail, {
        consent: true,
        role,
      });
      if (result?.sent === false && result?.error && !result?.cooldown) {
        setError(t('phone_v2_send_failed'));
        return;
      }
      navigation.navigate('OtpV2', {
        channel: 'email',
        email: cleanEmail,
        mockCode: result?.mock ? result.code : null,
      });
    } catch {
      setError(t('phone_v2_send_failed'));
    } finally {
      setEmailBusy(false);
    }
  };

  const SocialButton = ({ provider, icon, testID }) => {
    const loading = socialBusy === provider || socialBusy === 'callback';
    return (
      <Pressable
        onPress={() => onSocialPress(provider)}
        disabled={anyBusy}
        accessibilityRole="button"
        accessibilityLabel={provider === 'apple' ? 'Apple' : 'Google'}
        testID={testID}
        style={({ pressed }) => [
          s.socialButton,
          pressed && !anyBusy && { opacity: 0.82 },
          anyBusy && !loading && { opacity: 0.55 },
        ]}
      >
        <View style={s.socialIconWrap}>
          {loading ? (
            <ActivityIndicator size="small" color={brand.textPrimary} />
          ) : (
            <FontAwesome name={icon} size={22} color={brand.textPrimary} />
          )}
        </View>
        <Text style={s.socialText}>{provider === 'apple' ? 'Apple' : 'Google'}</Text>
        <View style={s.socialRightSpacer} />
      </Pressable>
    );
  };

  return (
    <SafeAreaView style={s.safe} edges={['top', 'bottom']} testID="auth-v2-screen">
      <KeyboardAvoidingView
        style={s.keyboard}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={s.headerRow}>
          {navigation.canGoBack() ? (
            <Pressable
              onPress={() => navigation.goBack()}
              style={({ pressed }) => [s.backBtn, pressed && { opacity: 0.6 }]}
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
              testID="phone-v2-back"
              accessibilityRole="button"
              accessibilityLabel="back"
            >
              <Feather name="arrow-left" size={22} color={brand.textPrimary} />
            </Pressable>
          ) : <View style={s.backBtn} />}
        </View>

        <ScrollView
          style={s.scroll}
          contentContainerStyle={s.scrollContent}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          showsVerticalScrollIndicator={false}
        >
          <View style={s.form}>
            <Text style={s.logo} accessibilityRole="header">
              <Text style={{ color: brand.logoDark }}>Ur</Text>
              <Text style={{ color: brand.logoAccent }}>Truck</Text>
            </Text>

            <Text style={s.title}>{t('phone_v2_title')}</Text>
            <Text style={s.subtitle}>{t('phone_v2_subtitle')}</Text>

            <View style={s.socialStack} testID="auth-social-providers">
              <SocialButton provider="google" icon="google" testID="auth-google" />
              <SocialButton provider="apple" icon="apple" testID="auth-apple" />
            </View>

            <View style={s.dividerRow} accessibilityElementsHidden>
              <View style={s.dividerLine} />
              <Text style={s.dividerLabel}>{t('auth_tab_email')}</Text>
              <View style={s.dividerLine} />
            </View>

            <View style={[s.inputRow, error && s.inputError]}>
              <Feather
                name="mail"
                size={20}
                color={brand.textSecondary}
                style={s.mailIcon}
              />
              <TextInput
                value={email}
                onChangeText={(next) => {
                  setEmail(next);
                  if (error) setError(null);
                }}
                placeholder={t('email_v2_placeholder')}
                placeholderTextColor={brand.textTertiary}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                style={s.emailInput}
                maxLength={120}
                testID="email-v2-input"
                textContentType="emailAddress"
                autoComplete="email"
                onSubmitEditing={submitEmail}
                returnKeyType="go"
              />
            </View>

            {error ? <Text style={s.error} testID="auth-v2-error">{error}</Text> : null}

            <Pressable
              onPress={submitEmail}
              disabled={!emailOk || anyBusy}
              accessibilityRole="button"
              testID="phone-v2-cta"
              style={({ pressed }) => [
                s.ctaPrimary,
                { backgroundColor: emailOk && !anyBusy ? brand.primary : brand.borderStrong },
                pressed && emailOk && !anyBusy && { opacity: 0.85 },
              ]}
            >
              {emailBusy ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <>
                  <Text style={s.ctaPrimaryText}>{t('phone_v2_cta')}</Text>
                  <Feather name="arrow-right" size={20} color="#FFF" />
                </>
              )}
            </Pressable>

            <View style={s.infoBlock}>
              <Feather name="shield" size={14} color={brand.textSecondary} />
              <Text style={s.infoText}>{t('email_v2_send_hint')}</Text>
            </View>
          </View>

          <View style={s.consentBlock} testID="auth-legal-consent">
            <Text style={s.consent}>
              {t('onb_v2_consent_prefix')}{' '}
              <Text
                style={s.consentLink}
                onPress={() => openLegal('/legal/terms.html')}
                accessibilityRole="link"
                suppressHighlighting
              >
                {t('onb_v2_consent_offer')}
              </Text>
              {' '}{t('onb_v2_consent_and')}{' '}
              <Text
                style={s.consentLink}
                onPress={() => openLegal('/legal/privacy.html')}
                accessibilityRole="link"
                suppressHighlighting
              >
                {t('onb_v2_consent_privacy')}
              </Text>
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const makeStyles = (brand) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: brand.bg },
  keyboard: { flex: 1 },
  headerRow: { flexDirection: 'row', minHeight: 48, paddingHorizontal: 16, paddingTop: 4 },
  backBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  scroll: { flex: 1 },
  scrollContent: { flexGrow: 1, paddingHorizontal: 20, paddingBottom: 28 },
  form: { width: '100%', maxWidth: 560, alignSelf: 'center' },
  logo: { fontSize: 36, fontWeight: '800', letterSpacing: -0.5, textAlign: 'center', marginTop: 20, marginBottom: 30 },
  title: { ...typography.h1, color: brand.textPrimary, textAlign: 'center', marginBottom: 10 },
  subtitle: { ...typography.body, color: brand.textSecondary, textAlign: 'center', marginBottom: 22 },
  socialStack: { gap: 12 },
  socialButton: { height: 56, borderRadius: radius.lg, borderWidth: 1, borderColor: brand.border, backgroundColor: brand.surface, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16 },
  socialIconWrap: { width: 36, alignItems: 'center', justifyContent: 'center' },
  socialRightSpacer: { width: 36 },
  socialText: { flex: 1, textAlign: 'center', ...typography.button, color: brand.textPrimary },
  dividerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 20 },
  dividerLine: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: brand.border },
  dividerLabel: { ...typography.caption, color: brand.textSecondary, fontWeight: '700' },
  inputRow: { minHeight: 58, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: brand.border, borderRadius: radius.lg, backgroundColor: brand.surface },
  inputError: { borderColor: brand.error },
  mailIcon: { marginLeft: 14, marginRight: 6 },
  emailInput: { flex: 1, minHeight: 56, paddingHorizontal: 8, paddingRight: 14, ...typography.bodyLarge, color: brand.textPrimary },
  error: { ...typography.bodySmall, color: brand.error, marginTop: 8, textAlign: 'center' },
  ctaPrimary: { height: 56, borderRadius: radius.lg, flexDirection: 'row', gap: 10, alignItems: 'center', justifyContent: 'center', marginTop: 14 },
  ctaPrimaryText: { ...typography.button, color: brand.textOnPrimary },
  infoBlock: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'center', gap: 8, paddingHorizontal: 16, paddingTop: 14 },
  infoText: { ...typography.caption, color: brand.textSecondary, textAlign: 'center', flexShrink: 1 },
  consentBlock: { width: '100%', maxWidth: 560, alignSelf: 'center', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: brand.border, marginTop: 22, paddingTop: 16, paddingHorizontal: 10, paddingBottom: 8 },
  consent: { ...typography.caption, color: brand.textSecondary, textAlign: 'center', lineHeight: 19 },
  consentLink: { color: brand.textPrimary, fontWeight: '700', textDecorationLine: 'underline' },
});
