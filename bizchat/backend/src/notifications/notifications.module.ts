import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppConfig } from '../config/configuration';
import { Notification } from '../entities/notification.entity';
import { User } from '../entities/user.entity';
import { Post } from '../entities/post.entity';
import { Factory } from '../entities/factory.entity';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PushModule } from '../push/push.module';
import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';

/**
 * Модуль уведомлений. Экспортирует `NotificationsService`, чтобы PostsModule
 * и ChatModule могли вызывать `notify*` методы при триггерящих действиях.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([Notification, User, Post, Factory]),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig, true>) => ({
        secret: config.get('jwt', { infer: true }).secret,
      }),
    }),
    PushModule,
  ],
  controllers: [NotificationsController],
  providers: [NotificationsService, JwtAuthGuard],
  exports: [NotificationsService],
})
export class NotificationsModule {}
