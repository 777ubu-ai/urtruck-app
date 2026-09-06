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
// Expo inlines only direct `process.env.EXPO_PUBLIC_*` references during
// Metro export; optional chaining leaves the variable name unresolved.
const ENV_OVERRIDE = process.env.EXPO_PUBLIC_API_URL || '';

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
  if (ENV_OVERRIDE) return ENV_OVERRIDE.replace(/\/+$/, '');
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

// Public website / share links. Always HTTPS in production.
export const WEB_URL = IS_WEB
  ? 'https://urtruck.kz'
  : (ENV_OVERRIDE || 'https://urtruck.kz').replace(/\/+$/, '');

// Beta pricing flag — keeps premium features free during the
// pilot. Toggling to false enables paywalls; coordinate with
// product before flipping.
export const IS_BETA = true;

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
  WEB_URL,
  IS_BETA,
};
