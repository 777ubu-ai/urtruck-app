import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import configuration, { AppConfig } from './config/configuration';
import { User } from './entities/user.entity';
import { Factory } from './entities/factory.entity';
import { Post } from './entities/post.entity';
import { PostLike } from './entities/post-like.entity';
import { PostSave } from './entities/post-save.entity';
import { PostComment } from './entities/post-comment.entity';
import { Conversation } from './entities/conversation.entity';
import { Message } from './entities/message.entity';
import { Notification } from './entities/notification.entity';
import { Follow } from './entities/follow.entity';
import { GroupBuyOrder } from './entities/group-buy-order.entity';
import { Story } from './entities/story.entity';
import { SmsCode } from './entities/sms-code.entity';
import { DeviceToken } from './entities/device-token.entity';
import { CurrencyRate } from './entities/currency-rate.entity';
import { Review } from './entities/review.entity';
import { UserBlock } from './entities/user-block.entity';
import { Report } from './entities/report.entity';
import { AuthModule } from './auth/auth.module';
import { PostsModule } from './posts/posts.module';
import { UsersModule } from './users/users.module';
import { UploadsModule } from './uploads/uploads.module';
import { ChatModule } from './chat/chat.module';
import { NotificationsModule } from './notifications/notifications.module';
import { TranslationModule } from './translation/translation.module';
import { TrustScoreModule } from './trust-score/trust-score.module';
import { StoriesModule } from './stories/stories.module';
import { PushModule } from './push/push.module';
import { CurrencyModule } from './currency/currency.module';
import { ReviewsModule } from './reviews/reviews.module';
import { ModerationModule } from './moderation/moderation.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      envFilePath: ['.env.local', '.env'],
    }),
    // ScheduleModule.forRoot — для @Cron декораторов в сервисах.
    // Используется в TrustScoreService для daily пересчёта (3:00).
    ScheduleModule.forRoot(),
    // Глобальный rate limit. Дефолт — 600 req/min на IP: запас под активного
    // Flutter web клиента (notifications polling каждые 10с + stories каждые
    // 30с + currency на старте + feed pagination + WS reconnect) ПЛЮС
    // одновременные curl/QA smoke тесты с того же localhost.
    //
    // **CAVEAT NestJS Throttler v6:** все tracker'ы из forRoot применяются ко
    // ВСЕМ endpoints одновременно. Чтобы `sms` tracker НЕ блокировал не-sms
    // endpoints (как было после первой итерации — 5 SMS в час исчерпывались
    // и весь Flutter падал в 429), `sms` tracker имеет глобальный лимит
    // **бесконечный** (Number.MAX_SAFE_INTEGER), и реальное ограничение
    // 5 в час применяется только на `/auth/sms/send` через
    // `@Throttle({sms: {ttl: 60*60_000, limit: 5}})` декоратор который
    // override'ит глобальное значение для конкретного endpoint.
    //
    // В SmsService есть дополнительный 60-секундный cooldown на конкретный
    // номер телефона (отдельная защита от спам-кликов на одном клиенте).
    ThrottlerModule.forRoot([
      { name: 'default', ttl: 60_000, limit: 600 },
      { name: 'sms', ttl: 60 * 60_000, limit: Number.MAX_SAFE_INTEGER },
    ]),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig, true>) => {
        const db = config.get('db', { infer: true });
        return {
          type: 'postgres',
          host: db.host,
          port: db.port,
          username: db.username,
          password: db.password,
          database: db.database,
          entities: [
            User,
            Factory,
            Post,
            PostLike,
            PostSave,
            PostComment,
            Conversation,
            Message,
            Notification,
            Follow,
            GroupBuyOrder,
            Story,
            SmsCode,
            DeviceToken,
            CurrencyRate,
            Review,
            UserBlock,
            Report,
          ],
          synchronize: db.synchronize,
          logging: db.logging,
          migrationsRun: false, // запускаем миграции отдельной командой
        };
      },
    }),
    AuthModule,
    PostsModule,
    UsersModule,
    UploadsModule,
    ChatModule,
    NotificationsModule,
    TranslationModule,
    TrustScoreModule,
    StoriesModule,
    PushModule,
    CurrencyModule,
    ReviewsModule,
    ModerationModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    // ThrottlerGuard как глобальный — применяется ко всем endpoint'ам.
    // Конкретные роуты могут override через @Throttle({...}) или @SkipThrottle().
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
