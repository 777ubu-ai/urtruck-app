// Централизованный конфиг, читается из .env через @nestjs/config.
// Внутри кода обращаемся через ConfigService.get<AppConfig>('...').
// Никогда не читаем process.env напрямую вне этого файла.

export interface AppConfig {
  env: 'development' | 'production' | 'test' | 'staging';
  port: number;
  apiPrefix: string;
  corsOrigins: string[];
  db: {
    host: string;
    port: number;
    username: string;
    password: string;
    database: string;
    synchronize: boolean;
    logging: boolean;
  };
  redis: {
    host: string;
    port: number;
  };
  jwt: {
    secret: string;
    accessTtl: string;
    refreshTtl: string;
  };
  sms: {
    provider: 'stub' | 'twilio' | 'mobizon';
    codeLength: number;
    codeTtlSeconds: number;
    maxAttempts: number;
    resendCooldownSeconds: number;
    twilio?: {
      accountSid: string;
      authToken: string;
      fromNumber: string;
    };
    mobizon?: {
      apiKey: string;
      /** API домен: api.mobizon.kz (Казахстан), api.mobizon.com (global) */
      apiDomain: string;
    };
  };
  /**
   * Телефоны администраторов (белый список для admin-эндпоинтов).
   * Задаётся в .env: ADMIN_PHONES=+77001234567,+77009998877.
   * Пустой список => admin-эндпоинты закрыты для всех (fail-closed).
   */
  adminPhones: string[];
  /**
   * Мастер-вход без SMS для доверенных номеров (владелец/тестеры).
   * Задаётся в .env одной переменной DEV_LOGINS в формате
   * "phone:code,phone:code", например:
   *   DEV_LOGINS=+77479171118:8888,+77081839111:7777
   * Для этих номеров SMS не отправляется, а verify принимает указанный код.
   * Работает в любом env (в т.ч. production) — это осознанный bypass для
   * конкретных номеров, а не глобальное отключение защиты. Пустая
   * переменная => список пуст и обычный SMS-флоу работает как раньше.
   */
  devLogins: Array<{ phone: string; code: string }>;
}

export default (): AppConfig => ({
  env: (process.env.NODE_ENV as AppConfig['env']) || 'development',
  port: parseInt(process.env.PORT || '3000', 10),
  apiPrefix: process.env.API_PREFIX || 'api/v1',
  corsOrigins: (process.env.CORS_ORIGIN || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  db: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    username: process.env.DB_USERNAME || 'bizchat',
    password: process.env.DB_PASSWORD || 'bizchat_local_dev',
    database: process.env.DB_DATABASE || 'bizchat',
    synchronize: process.env.DB_SYNCHRONIZE === 'true',
    logging: process.env.DB_LOGGING === 'true',
  },
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
  },
  jwt: {
    secret: process.env.JWT_SECRET || 'dev_only_secret',
    accessTtl: process.env.JWT_ACCESS_TTL || '15m',
    refreshTtl: process.env.JWT_REFRESH_TTL || '30d',
  },
  sms: {
    provider:
      (process.env.SMS_PROVIDER as AppConfig['sms']['provider']) || 'stub',
    codeLength: parseInt(process.env.SMS_CODE_LENGTH || '6', 10),
    codeTtlSeconds: parseInt(process.env.SMS_CODE_TTL_SECONDS || '300', 10),
    maxAttempts: parseInt(process.env.SMS_MAX_ATTEMPTS || '5', 10),
    resendCooldownSeconds: parseInt(
      process.env.SMS_RESEND_COOLDOWN_SECONDS || '60',
      10,
    ),
    twilio:
      process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN
        ? {
            accountSid: process.env.TWILIO_ACCOUNT_SID,
            authToken: process.env.TWILIO_AUTH_TOKEN,
            fromNumber: process.env.TWILIO_FROM_NUMBER || '',
          }
        : undefined,
    mobizon: process.env.MOBIZON_API_KEY
      ? {
          apiKey: process.env.MOBIZON_API_KEY,
          apiDomain: process.env.MOBIZON_API_DOMAIN || 'api.mobizon.kz',
        }
      : undefined,
  },
  adminPhones: (process.env.ADMIN_PHONES || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  // DEV_LOGINS="phone:code,phone:code" -> [{phone, code}, ...]
  devLogins: (process.env.DEV_LOGINS || '')
    .split(',')
    .map((pair) => pair.trim())
    .filter(Boolean)
    .map((pair) => {
      const idx = pair.lastIndexOf(':');
      return {
        phone: pair.slice(0, idx).trim(),
        code: pair.slice(idx + 1).trim(),
      };
    })
    .filter((d) => d.phone && d.code),
});
