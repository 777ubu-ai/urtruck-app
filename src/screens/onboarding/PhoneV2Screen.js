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
  AUTH_ERROR_CODES,
  clearPendingProvider,
  completeSocialAuth,
  getPendingProvider,
  isSocialAuthCallback,
  logAuthStage,
  SocialAuthError,
  startSocialAuth,
} from '../../utils/socialAuth';
import { brand, useBrand, radius, typography } from '../../theme/brandV2';
import { WEB_URL } from '../../config/env';

const LEGAL_BASE = WEB_URL || 'https://urtruck.kz';

const SOCIAL_LABELS = {
  RU: {
    google: 'Продолжить с Google',
    apple: 'Продолжить с Apple',
  },
  EN: {
    google: 'Continue with Google',
    apple: 'Continue with Apple',
  },
  ZH: {
    google: '使用 Google 继续',
    apple: '使用 Apple 继续',
  },
  KK: {
    google: 'Google арқылы жалғастыру',
    apple: 'Apple арқылы жалғастыру',
  },
};

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

// #P0-B: map the SocialAuthError taxonomy to user-facing copy. Never route
// PROVIDER_UNAVAILABLE/OAUTH_CANCELLED/BACKEND_VERIFY_FAILED through the
// generic network-error string — that conflation is the exact bug that made
// a genuinely-disabled Apple provider look like a dead connection.
const socialErrorKey = (err, provider) => {
  const code = err instanceof SocialAuthError ? err.code : null;
  switch (code) {
    case AUTH_ERROR_CODES.PROVIDER_UNAVAILABLE:
    case AUTH_ERROR_CODES.PROVIDER_CONFIG_INVALID:
      return provider === 'apple'
        ? 'auth_error_provider_unavailable_apple'
        : 'auth_error_provider_unavailable_google';
    case AUTH_ERROR_CODES.OAUTH_CANCELLED:
      return 'auth_error_oauth_cancelled';
    case AUTH_ERROR_CODES.OAUTH_CALLBACK_FAILED:
    case AUTH_ERROR_CODES.SESSION_MISSING:
      return 'auth_error_callback_failed';
    case AUTH_ERROR_CODES.BACKEND_VERIFY_FAILED:
      return 'auth_error_backend_verify_failed';
    case AUTH_ERROR_CODES.AMBIGUOUS_EMAIL_IDENTITY:
      return 'auth_error_ambiguous_email';
    case AUTH_ERROR_CODES.NETWORK_UNAVAILABLE:
    default:
      return 'auth_error_network';
  }
};

export default function PhoneV2Screen({ navigation, route }) {
  const _b = useBrand();
  const s = React.useMemo(() => makeStyles(_b), [_b]);
  const { t, lang } = useI18n();
  const { toast } = useToast();
  const { signIn, setRole, refreshLevel } = useAuth();

  const [email, setEmail] = useState('');
  const [emailBusy, setEmailBusy] = useState(false);
  // #P1-D: socialBusy holds the SPECIFIC provider currently in flight
  // ('google' | 'apple'), never a generic 'callback' — otherwise both
  // buttons spin during callback processing regardless of which one the
  // user actually pressed.
  const [socialBusy, setSocialBusy] = useState(null);
  // #P1-C: email and social errors are independent state. A social/OAuth
  // failure must never paint the Email input red or show an email
  // validation message, and vice versa.
  const [emailError, setEmailError] = useState(null);
  const [socialError, setSocialError] = useState(null);
  const finishingSocialRef = useRef(false);
  const role = route?.params?.role || null;
  const routedSocialUrl = route?.params?.socialAuthUrl || null;

  const emailOk = isValidEmail(email);
  const anyBusy = emailBusy || !!socialBusy;

  // Hydrate which provider's callback we're resuming (survives the full
  // page reload Google/Apple OAuth does on web — React state does not).
  useEffect(() => {
    let mounted = true;
    getPendingProvider().then((p) => { if (mounted && p) setSocialBusy(p); }).catch(() => {});
    return () => { mounted = false; };
  }, []);

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
    const provider = (await getPendingProvider()) || 'google';
    setSocialBusy(provider);
    setSocialError(null);
    try {
      const result = await completeSocialAuth(url);
      if (!result) {
        // Duplicate delivery of an already-processed callback — no-op, not
        // an error (see socialAuth.js lastProcessedCallbackKey guard).
        return;
      }
      if (!result?.token || !result?.email) {
        throw new SocialAuthError(AUTH_ERROR_CODES.BACKEND_VERIFY_FAILED, 'social_auth_failed', { provider });
      }
      logAuthStage('role_resolved', { provider });
      await goAfterLogin(result, result.email, 'social');
      logAuthStage('navigation_complete', { provider });
    } catch (e) {
      const key = socialErrorKey(e, provider);
      setSocialError(t(key));
      try { toast(t(key), 'error', 2500); } catch {}
      await clearPendingProvider();
    } finally {
      setSocialBusy(null);
      finishingSocialRef.current = false;
    }
  }, [goAfterLogin, t, toast]);

  useEffect(() => {
    const sub = Linking.addEventListener('url', ({ url }) => {
      finishSocialUrl(url).catch(() => {});
    });

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
    setSocialError(null);
    setSocialBusy(provider);
    try {
      await startSocialAuth(provider);
      // On web this line is reached right as the browser is navigating away
      // to the OAuth provider — the socialBusy reset below is cosmetic (the
      // page unloads next). On native, startSocialAuth already opened the
      // provider via Linking.openURL and control returns to this screen.
    } catch (e) {
      setSocialError(t(socialErrorKey(e, provider)));
      try { toast(t(socialErrorKey(e, provider)), 'error', 2500); } catch {}
      setSocialBusy(null);
      return;
    }
    setSocialBusy(null);
  };

  const submitEmail = async () => {
    if (!emailOk || anyBusy) return;
    setEmailBusy(true);
    setEmailError(null);
    try {
      const cleanEmail = email.trim().toLowerCase();
      const result = await regAPI.sendEmailCode(cleanEmail, {
        consent: true,
        role,
      });
      if (result?.sent === false && result?.error && !result?.cooldown) {
        setEmailError(t('phone_v2_send_failed'));
        return;
      }
      navigation.navigate('OtpV2', {
        channel: 'email',
        email: cleanEmail,
        mockCode: result?.mock ? result.code : null,
      });
    } catch {
      setEmailError(t('phone_v2_send_failed'));
    } finally {
      setEmailBusy(false);
    }
  };

  const SocialButton = ({ provider, icon, testID }) => {
    // #P1-D: only the provider actually in flight shows a spinner. The
    // other button stays disabled-but-idle (normal icon), never a second
    // spinner.
    const loading = socialBusy === provider;
    const label = SOCIAL_LABELS[lang]?.[provider] || SOCIAL_LABELS.EN[provider];
    return (
      <Pressable
        onPress={() => onSocialPress(provider)}
        disabled={anyBusy}
        accessibilityRole="button"
        accessibilityLabel={label}
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
        <Text style={s.socialText}>{label}</Text>
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

            {/* #P1-C: social error lives here, next to the buttons that
                caused it — never inside the Email field's error state. */}
            {socialError ? (
              <Text style={s.socialErrorText} testID="auth-social-error">{socialError}</Text>
            ) : null}

            <View style={s.dividerRow} accessibilityElementsHidden>
              <View style={s.dividerLine} />
              <Text style={s.dividerLabel}>{t('auth_tab_email')}</Text>
              <View style={s.dividerLine} />
            </View>

            <View style={[s.inputRow, emailError && s.inputError]}>
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
                  if (emailError) setEmailError(null);
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

            {emailError ? <Text style={s.error} testID="auth-v2-error">{emailError}</Text> : null}

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
  socialErrorText: { ...typography.bodySmall, color: brand.error, marginTop: 10, textAlign: 'center' },
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
