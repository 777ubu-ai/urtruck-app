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
});
