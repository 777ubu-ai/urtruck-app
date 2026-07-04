import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppConfig } from '../config/configuration';
import { DeviceToken } from '../entities/device-token.entity';
import { User } from '../entities/user.entity';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PushController } from './push.controller';
import { PushService } from './push.service';

/**
 * Модуль push-уведомлений. Экспортирует `PushService`, чтобы
 * `NotificationsModule` мог вызывать `sendToUser` после создания
 * in-app уведомления.
 *
 * Регистрация токенов работает всегда — даже без credentials.
 * Sending — no-op в disabled режиме.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([DeviceToken, User]),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig, true>) => ({
        secret: config.get('jwt', { infer: true }).secret,
      }),
    }),
  ],
  controllers: [PushController],
  providers: [PushService, JwtAuthGuard],
  exports: [PushService],
})
export class PushModule {}
