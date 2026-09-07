// Централизованный скраббер секретов для клиентской telemetry (Sentry
// beforeSend) и любых диагностических строк. Порт контракта
// backend/security/log_redaction.py: те же чувствительные ключи и те же
// строковые паттерны + sig= параметр подписанных URL документов.
//
// Запрещено отправлять сырые значения. Допустимы только redacted form.

const SENSITIVE_KEY_PARTS = [
  'authorization',
  'cookie',
  'token',
  'secret',
  'password',
  'passphrase',
  'api_key',
  'apikey',
  'api-key',
  'session_id',
];

const STRING_PATTERNS = [
  // Authorization: Bearer <value>
  [/(bearer\s+)[A-Za-z0-9._~+/=-]{8,}/gi, '$1***'],
  // JWT header.payload.signature
  [/eyJ[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{3,}/g, '<jwt:***>'],
  // Expo push token
  [/ExponentPushToken\[[A-Za-z0-9_-]{4,}\]/g, 'ExponentPushToken[***]'],
  // Подписанные URL документов/вложений: ?sig= / &signature= / ?token=
  [/([?&](?:sig|signature|access_token|token)=)[^&\s]+/gi, '$1***'],
  // key=value в свободном тексте ошибок
  [/\b(token|access_token|refresh_token|id_token|api_key|apikey|secret|password|session_id)\s*[=:]\s*["']?[A-Za-z0-9._~+/=-]{6,}/gi, '$1=***'],
];

const REDACTED = '***';

const isSensitiveKey = (key) => {
  const k = String(key).toLowerCase();
  return SENSITIVE_KEY_PARTS.some((part) => k.includes(part));
};

export function scrubString(text) {
  let out = String(text);
  for (const [rx, repl] of STRING_PATTERNS) out = out.replace(rx, repl);
  return out;
}

export function scrubValue(value, depth = 0) {
  if (depth > 12) return value; // защита от циклических/глубоких структур
  if (Array.isArray(value)) return value.map((v) => scrubValue(v, depth + 1));
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = isSensitiveKey(k) ? REDACTED : scrubValue(v, depth + 1);
    }
    return out;
  }
  if (typeof value === 'string') return scrubString(value);
  return value;
}

/** Sentry beforeSend hook: скраббит event целиком; при сбое дропает событие. */
export function scrubSentryEvent(event) {
  try {
    return scrubValue(event);
  } catch {
    return null;
  }
}
