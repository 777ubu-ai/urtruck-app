import { Linking, Platform } from 'react-native';
import { supabase } from '../config/supabase';
import { API_BASE } from '../config/env';
import { storage } from './storage';

const TOKEN_KEY = 'ur_reg_token';
const LEVEL_KEY = 'ur_verification_level';
const NATIVE_REDIRECT = 'urtruck://auth-social';

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
  // Never treat an arbitrary URL containing an access_token as our auth
  // callback. Native callbacks must use UrTruck's dedicated scheme; web
  // callbacks carry the explicit marker we add to redirectTo.
  return url.startsWith(NATIVE_REDIRECT) || url.includes('social_auth=1');
};

const redirectUrl = () => {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    return `${window.location.origin}/?social_auth=1`;
  }
  return NATIVE_REDIRECT;
};

const providerLabel = (provider) => provider === 'apple' ? 'Apple' : 'Google';

export async function startSocialAuth(provider) {
  if (!['google', 'apple'].includes(provider)) {
    throw new Error('unsupported_social_provider');
  }

  const options = {
    redirectTo: redirectUrl(),
    skipBrowserRedirect: Platform.OS !== 'web',
  };

  if (provider === 'google') {
    options.queryParams = { prompt: 'select_account' };
  }

  const { data, error } = await supabase.auth.signInWithOAuth({ provider, options });
  if (error) throw error;

  if (Platform.OS !== 'web') {
    if (!data?.url) throw new Error(`${providerLabel(provider)} OAuth URL unavailable`);
    await Linking.openURL(data.url);
  }

  return data;
}

async function sessionFromCallback(url) {
  const params = readParams(url);
  const oauthError = params.get('error_description') || params.get('error');
  if (oauthError) throw new Error(oauthError);

  const accessToken = params.get('access_token');
  const refreshToken = params.get('refresh_token');
  if (accessToken && refreshToken) {
    const { data, error } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });
    if (error) throw error;
    return data?.session || null;
  }

  const code = params.get('code');
  if (code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) throw error;
    return data?.session || null;
  }

  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data?.session || null;
}

export async function completeSocialAuth(url) {
  if (!isSocialAuthCallback(url)) return null;

  const session = await sessionFromCallback(url);
  const accessToken = session?.access_token;
  if (!accessToken) throw new Error('social_session_missing');

  const guestToken = await storage.get(TOKEN_KEY);
  const response = await fetch(`${API_BASE}/register/social/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      access_token: accessToken,
      consent: true,
      guest_token: guestToken || null,
    }),
  });

  let data = {};
  try { data = await response.json(); } catch {}
  if (!response.ok || !data?.token) {
    const detail = typeof data?.detail === 'string' ? data.detail : 'social_auth_failed';
    throw new Error(detail);
  }

  await storage.set(TOKEN_KEY, data.token);
  await storage.set(LEVEL_KEY, String(data.verification_level || 1));

  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    try {
      const cleanSearch = window.location.search
        .replace(/([?&])social_auth=1(&|$)/, '$1')
        .replace(/[?&]$/, '');
      window.history.replaceState({}, '', `${window.location.pathname || '/'}${cleanSearch}`);
    } catch {}
  }

  return data;
}

export async function clearSocialAuthSession() {
  // Logout on this device must not sign the user's Google/Apple-backed
  // Supabase session out on every other device. Supabase documents `local`
  // as the correct scope for this behavior.
  try { await supabase.auth.signOut({ scope: 'local' }); } catch {}
}
