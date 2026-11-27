// Аналитика входа: только разрешённые события и фиксированные значения.
// Запись экрана отключена до физической проверки маскирования.
import { Platform } from 'react-native';
import PostHog from 'posthog-react-native';

const EVENTS = new Set(['auth_screen_opened', 'auth_method_selected', 'auth_email_send_started', 'auth_email_otp_screen_requested', 'auth_email_send_failed', 'auth_otp_screen_opened', 'auth_otp_verify_started', 'auth_otp_verify_succeeded', 'auth_otp_verify_failed', 'auth_social_stage']);
const METHODS = new Set(['email', 'phone', 'google', 'apple']);
const STAGES = new Set(['oauth_start', 'oauth_start_failed', 'provider_callback_failed', 'provider_callback_received', 'supabase_session_missing', 'supabase_session_ready', 'backend_verify_start', 'backend_verify_failed', 'backend_verify_success', 'urtruck_session_saved', 'role_resolved', 'navigation_complete']);
const CODES = new Set(['NETWORK_UNAVAILABLE', 'PROVIDER_UNAVAILABLE', 'PROVIDER_CONFIG_INVALID', 'OAUTH_CANCELLED', 'OAUTH_CALLBACK_FAILED', 'BACKEND_VERIFY_FAILED', 'SESSION_MISSING', 'AMBIGUOUS_EMAIL_IDENTITY']);
let client = null;
try {
  const token = process.env.EXPO_PUBLIC_POSTHOG_KEY;
  const host = process.env.EXPO_PUBLIC_POSTHOG_HOST;
  if (token && host && Platform.OS !== 'web') {
    client = new PostHog(token, { host, enableSessionReplay: false, captureAppLifecycleEvents: false });
  }
} catch (_) { client = null; }

export function trackAuth(event, values = {}) {
  if (!client || !EVENTS.has(event)) return;
  const props = {};
  if (METHODS.has(values.method)) props.method = values.method;
  if (STAGES.has(values.stage)) props.stage = values.stage;
  if (CODES.has(values.code)) props.code = values.code;
  if (Number.isInteger(values.status) && values.status >= 100 && values.status <= 599) props.status = values.status;
  try { client.capture(event, props); } catch (_) {}
}
