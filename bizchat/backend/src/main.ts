import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { AppModule } from './app.module';
import { AppConfig } from './config/configuration';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: ['log', 'error', 'warn', 'debug', 'verbose'],
  });

  const config = app.get(ConfigService<AppConfig, true>);
  const port = config.get('port', { infer: true });
  const apiPrefix = config.get('apiPrefix', { infer: true });
  const corsOrigins = config.get('corsOrigins', { infer: true });
  const env = config.get('env', { infer: true });

  // === Безопасность ===
  app.use(
    helmet({
      contentSecurityPolicy: env === 'production' ? undefined : false,
      // cross-origin-resource-policy: ставим same-site, иначе браузер
      // блокирует загрузку картинок с http://localhost:3000 на
      // http://localhost:8080 (Flutter Web). В prod будет CDN — не проблема.
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );

  // === Статика для загруженных файлов ===
  // backend/uploads обслуживается как `/uploads/*`. В prod заменится на
  // S3/R2 (Blueprint §технологический стек).
  const uploadsDir = join(__dirname, '..', 'uploads');
  if (!existsSync(uploadsDir)) {
    mkdirSync(uploadsDir, { recursive: true });
  }
  app.useStaticAssets(uploadsDir, { prefix: '/uploads/' });

  // === CORS ===
  app.enableCors({
    origin: corsOrigins.length > 0 ? corsOrigins : true,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });

  // === Глобальная валидация ===
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // === Префикс всех роутов: /api/v1 ===
  app.setGlobalPrefix(apiPrefix);

  await app.listen(port);

  const logger = new Logger('Bootstrap');
  logger.log(`🚀 Biz Chat backend запущен на http://localhost:${port}/${apiPrefix}`);
  logger.log(`   env = ${env}`);
  logger.log(`   CORS origins = ${corsOrigins.join(', ') || '(все)'}`);
}

bootstrap().catch((err) => {
  console.error('Fatal error on bootstrap:', err);
  process.exit(1);
});
