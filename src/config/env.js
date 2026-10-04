// Runtime environment resolver.
//
// Three logical environments — development, preview, production —
// driven by Expo's standard signals (`__DEV__`, build profile in
// `Constants.expoConfig.extra.eas.profile`). One bundle, three
// behaviours; we never copy the project to ship a different
// flavor and we never edit this file before a build.
//
// Web: API requests go through the nginx reverse proxy on
// `https://urtruck.kz/api/v1` (relative `/api/v1` so the static
// bundle works behind whatever host actually serves it).
//
// Mobile: pre-Stage 21 the bundle hardcoded
// `http://185.22.65.11:8001` for every environment. That:
//   * fails Apple's App Transport Security audit (HTTP + IP
//     literal),
//   * pins the production app to a single VPS,
//   * makes preview/dev use the same backend as paying users.
// Stage 21 routes mobile production through the same HTTPS
// frontend the web bundle uses (`https://urtruck.kz/api/v1`,
// nginx forwards `/security/api/v1` → :8001 on the VPS), and
// allows dev/preview builds to override via `EXPO_PUBLIC_API_URL`
// without touching the source.
//
// The override is read at build time from process.env (Expo
// inlines `EXPO_PUBLIC_*` into the bundle) so Apple's static
// scan still sees a clean HTTPS endpoint in the production binary.

import { Platform } from 'react-native';
import Constants from 'expo-constants';

const IS_WEB = Platform.OS === 'web';

// Production HTTPS endpoint. nginx on urtruck.kz proxies
// `/api/v1/*` to the FastAPI port 8001.
const PROD_API = 'https://urtruck.kz';

// Pick up an explicit override from `EXPO_PUBLIC_API_URL` (used
// by `eas build --profile preview` / `--profile development` to
// point at a staging backend). Empty string => fall through to
// the production default below.
// Keep the EXPO_PUBLIC_* access statically recognisable to Expo's Metro
// inliner. Optional chaining around process.env is not reliably replaced in
// release bundles, which can silently drop the QA endpoint override.
const ENV_OVERRIDE = process.env.EXPO_PUBLIC_API_URL || '';
// A listing link is public-facing, so it must never silently inherit an
// arbitrary API host.  QA web builds set this explicitly; preview mobile can
// use the same QA2 host as its API only when it is the allow-listed QA2 host.
const PUBLIC_WEB_OVERRIDE = process.env.EXPO_PUBLIC_WEB_URL || '';
const CONFIG_OVERRIDE = Constants?.expoConfig?.extra?.urtruckApiUrl || '';

// Build-profile signal from EAS / app.json `extra.eas.profile`.
// Stays undefined inside `expo start`, where __DEV__ is true.
const easProfile = Constants?.expoConfig?.extra?.eas?.profile
  || Constants?.manifest?.extra?.eas?.profile
  || '';

// Three modes:
//   __DEV__  → development (Metro)
//   profile === 'production' → production (App Store / web prod)
//   anything else with !__DEV__ → preview (TestFlight internal)
export const APP_ENV =
  (typeof __DEV__ !== 'undefined' && __DEV__) ? 'development'
  : (easProfile === 'production' ? 'production' : 'preview');

const RESOLVED_API = (() => {
  if (IS_WEB) return ''; // web hits the same origin via nginx
  if (ENV_OVERRIDE || CONFIG_OVERRIDE) {
    return (ENV_OVERRIDE || CONFIG_OVERRIDE).replace(/\/+$/, '');
  }
  // No override → production HTTPS for both `production` and
  // `preview` builds. Local Metro / Expo Go dev sessions can set
  // EXPO_PUBLIC_API_URL=http://<lan-ip>:8001 to point at a
  // localhost backend.
  return PROD_API;
})();

export const SERVER_URL = RESOLVED_API;
export const API_URL = SERVER_URL;
export const API_BASE = `${SERVER_URL}/api/v1`;
export const API_BASE_URL = SERVER_URL;

// A mobile package can be updated from a production-backed build to a QA2
// build without Android/iOS clearing its local storage.  A bearer is valid
// only for the API that issued it, so keep session material in a namespace
// derived from the concrete API origin.  Do not use APP_ENV here: preview
// TestFlight builds may intentionally use QA2 while APP_ENV is "preview".
const sessionStorageScope = (origin) => {
  try {
    const host = new URL(origin || PROD_API).hostname.toLowerCase();
    if (host === 'qa2.urtruck.kz') return 'qa2';
    if (host === 'urtruck.kz' || host === 'www.urtruck.kz') return 'production';
    // Development hosts must not share a bearer with either public API or
    // with another local endpoint. Hostnames are safe storage-key fragments.
    return `isolated-${host.replace(/[^a-z0-9.-]/g, '_') || 'unknown'}`;
  } catch {
    return 'isolated-invalid-origin';
  }
};

export const SESSION_STORAGE_SCOPE = sessionStorageScope(
  IS_WEB ? (WEB_RUNTIME_ORIGIN || ENV_OVERRIDE || PROD_API) : (SERVER_URL || PROD_API),
);

// Public website / share links. Always HTTPS in production.
export const WEB_URL = IS_WEB
  ? 'https://urtruck.kz'
  : (ENV_OVERRIDE || 'https://urtruck.kz').replace(/\/+$/, '');

const publicOrigin = (value) => {
  try {
    const parsed = new URL(String(value || ''));
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.port) return '';
    const host = parsed.hostname.toLowerCase();
    if (host !== 'urtruck.kz' && host !== 'www.urtruck.kz' && host !== 'qa2.urtruck.kz') return '';
    return host === 'www.urtruck.kz' ? 'https://urtruck.kz' : `https://${host}`;
  } catch {
    return '';
  }
};

// Share links are deliberately stricter than WEB_URL.  WEB_URL predates QA2
// and retains its compatibility fallback for terms/privacy.  A cargo link
// must fail closed instead of accidentally publishing a production URL from
// an unconfigured preview build.  On web, the browser's own HTTPS origin is
// a concrete runtime environment; it is still checked against the same tiny
// allow-list, so a copied static bundle on an unknown host cannot publish a
// link to that host or silently fall back to production.
const WEB_RUNTIME_ORIGIN = IS_WEB && typeof window !== 'undefined'
  ? window.location?.origin || ''
  : '';
export const PUBLIC_WEB_ORIGIN = APP_ENV === 'production'
  ? 'https://urtruck.kz'
  : publicOrigin(PUBLIC_WEB_OVERRIDE || ENV_OVERRIDE || WEB_RUNTIME_ORIGIN);

// Beta pricing flag — keeps premium features free during the
// pilot. Toggling to false enables paywalls; coordinate with
// product before flipping.
const BETA_OVERRIDE = (typeof process !== 'undefined' && process?.env?.EXPO_PUBLIC_IS_BETA);
export const IS_BETA = BETA_OVERRIDE === undefined
  ? APP_ENV !== 'production'
  : BETA_OVERRIDE !== 'false';

if (APP_ENV === 'production' && IS_BETA) {
  // eslint-disable-next-line no-console
  console.error('[env] FATAL: production build resolved IS_BETA=true');
}

// Hard guard: if a production build somehow ended up with an
// HTTP endpoint, fail loud at module-init so QA/the operator
// catches it instead of Apple's review.
if (
  APP_ENV === 'production'
  && !IS_WEB
  && SERVER_URL
  && !SERVER_URL.startsWith('https://')
) {
  // eslint-disable-next-line no-console
  console.error(
    '[env] FATAL: production mobile build resolved a non-HTTPS API endpoint:',
    SERVER_URL,
  );
}

export default {
  APP_ENV,
  SERVER_URL,
  API_URL,
  API_BASE,
  API_BASE_URL,
  SESSION_STORAGE_SCOPE,
  WEB_URL,
  PUBLIC_WEB_ORIGIN,
  IS_BETA,
};
