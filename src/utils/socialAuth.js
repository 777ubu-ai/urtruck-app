import { Linking, Platform } from 'react-native';
import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from '../config/supabase';
import { API_BASE } from '../config/env';
import { storage } from './storage';

const TOKEN_KEY = 'ur_reg_token';
const LEVEL_KEY = 'ur_verification_level';
const NATIVE_REDIRECT = 'urtruck://auth-social';

// P0 auth-fix 25.08.2026: pending-provider survives a full web page reload
// (Google/Apple OAuth on web navigates the whole tab away and back — React
// state does not survive that, only storage does). Used so the callback
// spinner lights up the SAME button the user actually pressed instead of
// both Google and Apple simultaneously (#P1-D), and so the error banner can
// be attributed to the right provider (#P1-C).
const PENDING_PROVIDER_KEY = 'ur_social_pending_provider';
// Idempotency guard, round 2 (owner review 25.08.2026): the PKCE `code`
// Supabase issues is single-use, but a transient failure AFTER the code was
// already exchanged (backend 500, network blip) must stay retryable — it
// must NOT permanently strand the user. Two separate marks, not one:
//   exchangedCallbackKey — the one-shot code has been consumed with
//     Supabase; a retry on the SAME url must reuse the resulting Supabase
//     session (getSession()) instead of re-exchanging (which would fail
//     with "invalid grant").
//   completedCallbackKey — the FULL chain succeeded (backend verify +
//     UrTruck token saved). Only this is a true no-op point for a
//     duplicate delivery (double effect fire, a stale getInitialURL()
//     resolving late after success already happened).
let exchangedCallbackKey = null;
let completedCallbackKey = null;

/** Error taxonomy (#P0-B). Never collapse these into one generic message —
 * that is exactly the bug that made a genuine Apple provider_unavailable
 * indistinguishable from a real network outage in production. */
export const AUTH_ERROR_CODES = {
  NETWORK_UNAVAILABLE: 'NETWORK_UNAVAILABLE',
  PROVIDER_UNAVAILABLE: 'PROVIDER_UNAVAILABLE',
  PROVIDER_CONFIG_INVALID: 'PROVIDER_CONFIG_INVALID',
  OAUTH_CANCELLED: 'OAUTH_CANCELLED',
  OAUTH_CALLBACK_FAILED: 'OAUTH_CALLBACK_FAILED',
  BACKEND_VERIFY_FAILED: 'BACKEND_VERIFY_FAILED',
  SESSION_MISSING: 'SESSION_MISSING',
};

export class SocialAuthError extends Error {
  constructor(code, message, meta = {}) {
    super(message || code);
    this.name = 'SocialAuthError';
    this.code = code;
    // meta is diagnostic-only: provider / httpStatus / correlationId.
    // NEVER put a token, header or raw email here.
    this.meta = meta;
  }
}

/** Diagnostic stage logger — no PII, no tokens, ever. Always active (not
 * gated behind __DEV__) because these lines are the only way to see, on a
 * real production Safari console, exactly which stage of the Google/Apple
 * chain broke: provider_callback_received → supabase_session_ready →
 * backend_verify_start → backend_verify_success → urtruck_session_saved →
 * role_resolved → navigation_complete. */
export function logAuthStage(stage, meta = {}) {
  const safe = {};
  if (meta.provider) safe.provider = meta.provider;
  if (meta.httpStatus != null) safe.httpStatus = meta.httpStatus;
  if (meta.code) safe.code = meta.code;
  if (meta.correlationId) safe.correlationId = meta.correlationId;
  try {
    // eslint-disable-next-line no-console
    console.info(`AUTH_SOCIAL_STAGE=${stage}`, safe);
  } catch {}
}

const newCorrelationId = () => `sa_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

const readParams = (url) => {
  const result = new URLSearchParams();
  if (!url || typeof url !== 'string') return result;

  const question = url.indexOf('?');
  const hash = url.indexOf('#');
  if (question >= 0) {
    const end = hash >= 0 && hash > question ? hash : url.length;
    const query = url.slice(question + 1, end);
    new URLSearchParams(query).forEach((v, k) => result.set(k, v));
  }
  if (hash >= 0) {
    const fragment = url.slice(hash + 1);
    new URLSearchParams(fragment).forEach((v, k) => result.set(k, v));
  }
  return result;
};

export const isSocialAuthCallback = (url) => {
  if (!url || typeof url !== 'string') return false;
  return url.startsWith(NATIVE_REDIRECT) || url.includes('social_auth=1');
};

/** A stable key identifying THIS callback attempt (the PKCE code / implicit
 * access_token — never logged, only compared for de-dup). */
const callbackKey = (url) => {
  const params = readParams(url);
  return params.get('code') || params.get('access_token') || null;
};

const redirectUrl = () => {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    return `${window.location.origin}/?social_auth=1`;
  }
  return NATIVE_REDIRECT;
};

export async function setPendingProvider(provider) {
  try { await storage.set(PENDING_PROVIDER_KEY, provider); } catch {}
}

export async function getPendingProvider() {
  try { return await storage.get(PENDING_PROVIDER_KEY); } catch { return null; }
}

export async function clearPendingProvider() {
  try { await storage.remove(PENDING_PROVIDER_KEY); } catch {}
}

export async function getSocialProviderAvailability() {
  try {
    const response = await fetch(`${SUPABASE_URL}/auth/v1/settings`, {
      headers: { apikey: SUPABASE_ANON_KEY },
    });
    if (!response.ok) throw new Error(`auth_settings_${response.status}`);
    const settings = await response.json();
    return {
      google: settings?.external?.google === true,
      apple: settings?.external?.apple === true,
      checked: true,
    };
  } catch {
    // Fail closed. A provider button must never open a broken OAuth flow just
    // because provider readiness could not be proven. checked:false tells
    // the caller this was a REACHABILITY failure (network/CORS/Supabase
    // down), distinct from checked:true + provider:false (provider is
    // genuinely disabled server-side — see Apple, 25.08.2026 audit).
    return { google: false, apple: false, checked: false };
  }
}

export async function startSocialAuth(provider) {
  if (!['google', 'apple'].includes(provider)) {
    throw new SocialAuthError(AUTH_ERROR_CODES.PROVIDER_CONFIG_INVALID, 'unsupported_social_provider', { provider });
  }
  const correlationId = newCorrelationId();
  logAuthStage('oauth_start', { provider, correlationId });

  const availability = await getSocialProviderAvailability();
  if (!availability.checked) {
    logAuthStage('oauth_start_failed', { provider, code: AUTH_ERROR_CODES.NETWORK_UNAVAILABLE, correlationId });
    throw new SocialAuthError(AUTH_ERROR_CODES.NETWORK_UNAVAILABLE, 'social_availability_unreachable', { provider, correlationId });
  }
  if (availability[provider] !== true) {
    // Supabase itself confirms this provider is switched off — this is a
    // CONFIG state, never a network failure. Conflating the two is exactly
    // what made the real Apple root cause show as "Нет связи с сервером".
    logAuthStage('oauth_start_failed', { provider, code: AUTH_ERROR_CODES.PROVIDER_UNAVAILABLE, correlationId });
    throw new SocialAuthError(AUTH_ERROR_CODES.PROVIDER_UNAVAILABLE, 'social_provider_unavailable', { provider, correlationId });
  }

  const options = {
    redirectTo: redirectUrl(),
    skipBrowserRedirect: Platform.OS !== 'web',
  };
  if (provider === 'google') {
    options.queryParams = { prompt: 'select_account' };
  }

  await setPendingProvider(provider);

  const { data, error } = await supabase.auth.signInWithOAuth({ provider, options });
  if (error) {
    logAuthStage('oauth_start_failed', { provider, code: AUTH_ERROR_CODES.PROVIDER_CONFIG_INVALID, correlationId });
    await clearPendingProvider();
    throw new SocialAuthError(AUTH_ERROR_CODES.PROVIDER_CONFIG_INVALID, error.message, { provider, correlationId });
  }

  if (Platform.OS !== 'web') {
    if (!data?.url) {
      await clearPendingProvider();
      throw new SocialAuthError(AUTH_ERROR_CODES.PROVIDER_CONFIG_INVALID, `${provider} OAuth URL unavailable`, { provider, correlationId });
    }
    await Linking.openURL(data.url);
  }

  return data;
}

async function sessionFromCallback(url, meta, key) {
  const params = readParams(url);
  const oauthError = params.get('error_description') || params.get('error');
  if (oauthError) {
    const cancelled = params.get('error') === 'access_denied';
    logAuthStage('provider_callback_failed', { ...meta, code: cancelled ? AUTH_ERROR_CODES.OAUTH_CANCELLED : AUTH_ERROR_CODES.OAUTH_CALLBACK_FAILED });
    throw new SocialAuthError(
      cancelled ? AUTH_ERROR_CODES.OAUTH_CANCELLED : AUTH_ERROR_CODES.OAUTH_CALLBACK_FAILED,
      oauthError,
      meta,
    );
  }

  // Round 2 (owner review): if THIS callback's one-shot code/token was
  // already exchanged with Supabase on a prior attempt (backend verify
  // failed after a successful exchange), do not exchange it again — that
  // would fail with "invalid grant" and turn a retryable backend blip into
  // a dead end. Reuse the session Supabase already established and persisted.
  if (key && key === exchangedCallbackKey) {
    const { data, error } = await supabase.auth.getSession();
    if (error || !data?.session) {
      logAuthStage('provider_callback_failed', { ...meta, code: AUTH_ERROR_CODES.SESSION_MISSING });
      throw new SocialAuthError(AUTH_ERROR_CODES.SESSION_MISSING, error?.message || 'social_session_missing_on_retry', meta);
    }
    return data.session;
  }

  const accessToken = params.get('access_token');
  const refreshToken = params.get('refresh_token');
  if (accessToken && refreshToken) {
    const { data, error } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });
    if (error) {
      logAuthStage('provider_callback_failed', { ...meta, code: AUTH_ERROR_CODES.OAUTH_CALLBACK_FAILED });
      throw new SocialAuthError(AUTH_ERROR_CODES.OAUTH_CALLBACK_FAILED, error.message, meta);
    }
    if (key) exchangedCallbackKey = key;
    return data?.session || null;
  }

  const code = params.get('code');
  if (code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      // A reused/expired PKCE code lands here too — surfaces as
      // OAUTH_CALLBACK_FAILED (retryable: press the button again), never as
      // "no network".
      logAuthStage('provider_callback_failed', { ...meta, code: AUTH_ERROR_CODES.OAUTH_CALLBACK_FAILED });
      throw new SocialAuthError(AUTH_ERROR_CODES.OAUTH_CALLBACK_FAILED, error.message, meta);
    }
    if (key) exchangedCallbackKey = key;
    return data?.session || null;
  }

  const { data, error } = await supabase.auth.getSession();
  if (error) {
    logAuthStage('provider_callback_failed', { ...meta, code: AUTH_ERROR_CODES.OAUTH_CALLBACK_FAILED });
    throw new SocialAuthError(AUTH_ERROR_CODES.OAUTH_CALLBACK_FAILED, error.message, meta);
  }
  return data?.session || null;
}

export async function completeSocialAuth(url) {
  if (!isSocialAuthCallback(url)) return null;

  const key = callbackKey(url);
  if (key && key === completedCallbackKey) {
    // TRUE duplicate: this exact callback already ran the full chain to
    // success (backend verify + UrTruck token saved). A late-arriving
    // second delivery (double effect fire, stale getInitialURL()) is a
    // pure no-op — never re-navigate, never re-save.
    return null;
  }

  const provider = (await getPendingProvider()) || 'google';
  const correlationId = newCorrelationId();
  const meta = { provider, correlationId };

  logAuthStage('provider_callback_received', meta);
  // sessionFromCallback reuses the already-exchanged Supabase session when
  // `key` matches exchangedCallbackKey (a retry after a backend-verify
  // failure) instead of re-consuming the one-shot PKCE code.
  const session = await sessionFromCallback(url, meta, key);

  const accessToken = session?.access_token;
  if (!accessToken) {
    logAuthStage('supabase_session_missing', { ...meta, code: AUTH_ERROR_CODES.SESSION_MISSING });
    throw new SocialAuthError(AUTH_ERROR_CODES.SESSION_MISSING, 'social_session_missing', meta);
  }
  logAuthStage('supabase_session_ready', meta);

  const guestToken = await storage.get(TOKEN_KEY);
  logAuthStage('backend_verify_start', meta);
  let response;
  try {
    response = await fetch(`${API_BASE}/register/social/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        access_token: accessToken,
        consent: true,
        guest_token: guestToken || null,
      }),
    });
  } catch (networkErr) {
    logAuthStage('backend_verify_failed', { ...meta, code: AUTH_ERROR_CODES.NETWORK_UNAVAILABLE });
    throw new SocialAuthError(AUTH_ERROR_CODES.NETWORK_UNAVAILABLE, 'social_verify_unreachable', meta);
  }

  let data = {};
  try { data = await response.json(); } catch {}
  if (!response.ok || !data?.token) {
    logAuthStage('backend_verify_failed', { ...meta, httpStatus: response.status, code: AUTH_ERROR_CODES.BACKEND_VERIFY_FAILED });
    const detail = typeof data?.detail === 'string' ? data.detail : 'social_auth_failed';
    throw new SocialAuthError(AUTH_ERROR_CODES.BACKEND_VERIFY_FAILED, detail, { ...meta, httpStatus: response.status });
  }
  logAuthStage('backend_verify_success', { ...meta, httpStatus: response.status });

  await storage.set(TOKEN_KEY, data.token);
  await storage.set(LEVEL_KEY, String(data.verification_level || 1));
  logAuthStage('urtruck_session_saved', meta);
  // Only NOW is this callback truly, durably complete — mark it so a
  // late-arriving duplicate delivery no-ops instead of re-navigating.
  if (key) completedCallbackKey = key;

  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    try {
      const cleanSearch = window.location.search
        .replace(/([?&])social_auth=1(&|$)/, '$1')
        .replace(/[?&]$/, '');
      window.history.replaceState({}, '', `${window.location.pathname || '/'}${cleanSearch}`);
    } catch {}
  }

  await clearPendingProvider();
  return data;
}

export async function clearSocialAuthSession() {
  try { await supabase.auth.signOut({ scope: 'local' }); } catch {}
  await clearPendingProvider();
}
